/**
 * iter-8: repo-root `.mcp.json` writer for the squad_state MCP entry.
 *
 * Background: iter-7 wrote `squad_state_<hash>` into the user's HOME
 * `~/.copilot/mcp-config.json`. That polluted HOME with one entry per
 * Squad project and required a stale-entry GC that we never built. It
 * also touched a file outside the project, which is surprising for
 * `squad init` / `squad upgrade`.
 *
 * iter-8 flips it back inside the project: we write `squad_state` to a
 * repo-root `.mcp.json` under the plain (un-namespaced) `squad_state`
 * key. Copilot CLI ≥1.0.59 auto-loads `.mcp.json` walking up from cwd to
 * the git root, so the entry is picked up by bare
 * `copilot --yolo --autopilot --agent squad ...` invocations with no
 * wrapper script and no HOME modifications.
 *
 * `tombstoneStaleSquadStateInProjectMcp` keeps removing any pre-existing
 * `squad_state` entry from `.copilot/mcp-config.json` (left over by the
 * SDK init writer in older Squad versions), so we have exactly one
 * authoritative `squad_state` definition per project.
 *
 * Safety: we refuse to overwrite a malformed `.mcp.json` rather than
 * silently clobber a user-edited file; other `mcpServers.*` entries are
 * preserved semantically through the JSON round-trip, and user-supplied
 * `env`, tool restrictions, and custom fields on the `squad_state` entry survive
 * re-runs. Standalone launchers are published as PATH commands, never absolute
 * machine-local installation paths.
 *
 * @module cli/core/mcp-root
 */

import path from 'node:path';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { projectSquadStateMcpSpec, type SquadStateMcpSpec } from './mcp-spec.js';
import { writeManagedText, writeManagedTextAtomic } from './managed-file.js';

const storage = new FSStorageProvider();

/** Resolve the repo-root `.mcp.json` path for a Squad project dest. */
export function getProjectMcpJsonPath(dest: string): string {
  return path.join(dest, '.mcp.json');
}

interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: string[];
  [k: string]: unknown;
}

interface McpConfigShape {
  mcpServers?: Record<string, McpServerEntry>;
  [k: string]: unknown;
}

export interface EnsureRootResult {
  written: boolean;
  key: string;
  path: string;
}

/**
 * Insert/update the `squad_state` entry in the project's repo-root
 * `.mcp.json`. Preserves all other entries unchanged.
 *
 * @param dest         Squad project root (absolute or relative).
 * @param _cliVersion  Reserved for forensic metadata (unused — Copilot
 *                     CLI does not currently surface extra fields).
 * @param spec         Local standalone or pinned/insider command + args from
 *                     `resolveSquadStateMcpSpec`.
 */
export function ensureSquadStateMcpInRoot(
  dest: string,
  _cliVersion: string,
  spec: SquadStateMcpSpec,
): EnsureRootResult {
  const key = 'squad_state';
  const cfgPath = getProjectMcpJsonPath(dest);

  let parsed: McpConfigShape;
  if (storage.existsSync(cfgPath)) {
    const raw = storage.readSync(cfgPath) ?? '{}';
    try {
      const obj = JSON.parse(raw) as unknown;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error(`${cfgPath}: root must be a JSON object`);
      }
      parsed = obj as McpConfigShape;
    } catch (err) {
      throw new Error(
        `Refusing to overwrite malformed ${cfgPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    parsed = {};
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    parsed.mcpServers = {};
  }

  const existing = parsed.mcpServers[key];
  const projectSpec = projectSquadStateMcpSpec(spec);

  // `command`/`args` are Squad-managed (version pin or portable launcher) and are
  // always refreshed. `env` is user territory — Squad writes no keys into it,
  // so anything already there (corporate npm proxy settings, for example) is
  // carried forward rather than reset. See bradygaster/squad#1893.
  const hasUsableEnv =
    !!existing?.env && typeof existing.env === 'object' && !Array.isArray(existing.env);
  const desired: McpServerEntry = {
    ...existing,
    command: projectSpec.command,
    args: [...projectSpec.args],
    env: hasUsableEnv ? { ...existing!.env } : {},
    tools: Array.isArray(existing?.tools) && existing.tools.every(tool => typeof tool === 'string')
      ? [...existing.tools] : ['*'],
    'x-squad': {
      managed: true,
      version: _cliVersion,
      machineSpecific: projectSpec.source !== 'pinned',
      source: projectSpec.source,
      ...(projectSpec.fallback ? { fallback: projectSpec.fallback } : {}),
    },
  };

  // User-owned fields are carried forward; only launch command/args are managed.
  if (
    existing &&
    existing.command === desired.command &&
    Array.isArray(existing.args) &&
    existing.args.length === desired.args!.length &&
    existing.args.every((a, i) => a === desired.args![i]) &&
    hasUsableEnv &&
    Array.isArray(existing.tools) &&
    existing.tools.length === desired.tools!.length &&
    existing.tools.every((tool, index) => tool === desired.tools![index]) &&
    JSON.stringify(existing['x-squad']) === JSON.stringify(desired['x-squad'])
  ) {
    return { written: false, key, path: cfgPath };
  }

  parsed.mcpServers[key] = desired;

  writeManagedText(cfgPath, JSON.stringify(parsed, null, 2) + '\n');
  return { written: true, key, path: cfgPath };
}

export interface TombstoneResult {
  removed: boolean;
  path: string;
}

/**
 * Remove a stale top-level `squad_state` entry from the project
 * `.copilot/mcp-config.json` left there by older Squad versions or the
 * SDK init writer. Preserves all sibling entries.
 *
 * Best-effort: silently no-ops on a missing or unparseable file rather
 * than risking a partial overwrite of user-managed MCP config.
 */
export function tombstoneStaleSquadStateInProjectMcp(dest: string): TombstoneResult {
  const cfgPath = path.join(dest, '.copilot', 'mcp-config.json');
  if (!storage.existsSync(cfgPath)) return { removed: false, path: cfgPath };

  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.readSync(cfgPath) ?? '{}');
  } catch {
    return { removed: false, path: cfgPath };
  }
  if (!parsed || typeof parsed !== 'object') return { removed: false, path: cfgPath };

  const config = parsed as McpConfigShape;
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    return { removed: false, path: cfgPath };
  }
  if (!('squad_state' in config.mcpServers)) {
    return { removed: false, path: cfgPath };
  }

  delete config.mcpServers.squad_state;
  writeManagedText(cfgPath, JSON.stringify(config, null, 2) + '\n');
  return { removed: true, path: cfgPath };
}

/**
 * Pin `squad_state` to user-level `~/.copilot/mcp-config.json` so that
 * external `copilot -p` invocations (which skip workspace `.mcp.json` due
 * to the folder-trust security gate) still have access to squad_state tools.
 *
 * Unlike the repo-root writer, this writes a SINGLE entry keyed by the
 * project's absolute path hash to avoid collisions when multiple Squad
 * projects coexist. The key format is `squad_state_<shortHash>`.
 *
 * Best-effort: silently no-ops on parse failure to avoid corrupting the
 * user's hand-edited config.
 */
export function ensureSquadStateMcpInUserConfig(
  dest: string,
  spec: SquadStateMcpSpec,
): EnsureRootResult {
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homedir) return { written: false, key: '', path: '' };

  const cfgPath = path.join(homedir, '.copilot', 'mcp-config.json');
  // Stable short hash of the project path for the key suffix
  const key = getSquadStateUserConfigKey(dest);

  let parsed: McpConfigShape;
  if (storage.existsSync(cfgPath)) {
    const raw = storage.readSync(cfgPath) ?? '{}';
    try {
      const obj = JSON.parse(raw) as unknown;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { written: false, key, path: cfgPath };
      }
      parsed = obj as McpConfigShape;
    } catch {
      return { written: false, key, path: cfgPath };
    }
  } else {
    parsed = {};
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    parsed.mcpServers = {};
  }

  const existing = parsed.mcpServers[key];
  const desired: McpServerEntry = {
    command: spec.command,
    args: [...spec.args],
    env: {},
    tools: ['*'],
  };

  if (
    existing &&
    existing.command === desired.command &&
    Array.isArray(existing.args) &&
    existing.args.length === desired.args!.length &&
    existing.args.every((a, i) => a === desired.args![i])
  ) {
    return { written: false, key, path: cfgPath };
  }

  parsed.mcpServers[key] = desired;

  // Ensure parent directory exists
  const cfgDir = path.dirname(cfgPath);
  if (!storage.existsSync(cfgDir)) {
    storage.mkdirSync(cfgDir, { recursive: true });
  }

  storage.writeSync(cfgPath, JSON.stringify(parsed, null, 2) + '\n');
  return { written: true, key, path: cfgPath };
}

export interface ReconcileUserMcpResult {
  action: 'none' | 'removed' | 'would-remove';
  key: string;
  keys?: string[];
  path: string;
  backupPath?: string;
}

/**
 * Repo `.mcp.json` has precedence. Remove only this project's legacy hashed
 * user entry when it has the recognizable Squad-managed launch shape.
 *
 * The user config is backed up before mutation. Dry-run reports the action
 * without writing either the backup or the config.
 */
export function reconcileSquadStateUserConfig(
  dest: string,
  options: { dryRun?: boolean; homeDir?: string } = {},
): ReconcileUserMcpResult {
  const homedir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidateKeys = getSquadStateUserConfigKeys(dest);
  const key = candidateKeys[0]!;
  if (!homedir) return { action: 'none', key, path: '' };

  const cfgPath = path.join(homedir, '.copilot', 'mcp-config.json');
  if (!storage.existsSync(cfgPath)) return { action: 'none', key, path: cfgPath };

  const raw = storage.readSync(cfgPath) ?? '';
  let parsed: McpConfigShape;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { action: 'none', key, path: cfgPath };
    }
    parsed = value as McpConfigShape;
  } catch {
    return { action: 'none', key, path: cfgPath };
  }

  const keys = candidateKeys.filter(candidate => {
    const entry = parsed.mcpServers?.[candidate];
    return !!entry && isSquadManagedHashedEntry(entry);
  });
  if (keys.length === 0) {
    return { action: 'none', key, path: cfgPath };
  }

  if (options.dryRun) return { action: 'would-remove', key, keys, path: cfgPath };

  const backupPath = `${cfgPath}.squad-backup`;
  storage.writeSync(backupPath, raw);
  for (const candidate of keys) delete parsed.mcpServers![candidate];
  writeManagedTextAtomic(cfgPath, JSON.stringify(parsed, null, 2) + '\n');
  return { action: 'removed', key, keys, path: cfgPath, backupPath };
}

export function getSquadStateUserConfigKey(dest: string): string {
  return `squad_state_${simpleHash(normalizeSquadProjectPath(dest))}`;
}

export function getSquadStateUserConfigKeys(dest: string): string[] {
  const resolved = path.resolve(dest);
  const simpleHashPaths = [
    normalizeSquadProjectPath(dest),
    resolved,
    normalizeDriveLetter(resolved),
  ];
  const keys = simpleHashPaths.map(value => `squad_state_${simpleHash(value)}`);

  // iter-7 used the raw resolved path with an eight-character SHA-256 prefix.
  keys.push(`squad_state_${createHash('sha256').update(resolved).digest('hex').slice(0, 8)}`);
  return [...new Set(keys)];
}

export function normalizeSquadProjectPath(dest: string): string {
  const resolved = path.resolve(dest);
  let canonical = resolved;
  try {
    canonical = realpathSync.native(resolved);
  } catch {
    // Missing paths still get a deterministic resolved-path identity.
  }
  return normalizeDriveLetter(canonical);
}

export function normalizeDriveLetter(value: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' && /^[A-Z]:/.test(value)
    ? `${value[0]!.toLowerCase()}${value.slice(1)}`
    : value;
}

function isSquadManagedHashedEntry(entry: McpServerEntry): boolean {
  const args = Array.isArray(entry.args) ? entry.args : [];
  if (args.at(-1) !== 'state-mcp') return false;
  if (entry.command === 'npx') {
    return args.some(arg => /^@bradygaster\/squad-cli(?:@.+)?$/.test(arg));
  }
  if (entry.command === process.execPath || path.basename(entry.command ?? '').toLowerCase() === 'node') {
    return args.some(arg => /(?:^|[\\/])@bradygaster[\\/]squad-cli[\\/]dist[\\/]cli-entry\.js$/i.test(arg));
  }
  return /(?:^|[\\/])squad(?:\.exe|\.cmd|\.ps1)?$/i.test(entry.command ?? '');
}

/** Simple deterministic 8-char hex hash for path-based keys. */
function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
