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
 * key. Copilot CLI 5.3+ auto-loads `.mcp.json` walking up from cwd to
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
 * preserved byte-for-byte through the JSON round-trip.
 *
 * @module cli/core/mcp-root
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import type { SquadStateMcpSpec } from './mcp-spec.js';

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
 * @param spec         Pinned/insider command + args from
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
    existing.args.every((a, i) => a === desired.args![i]) &&
    existing.env &&
    typeof existing.env === 'object' &&
    Object.keys(existing.env).length === 0 &&
    Array.isArray(existing.tools) &&
    existing.tools.length === 1 &&
    existing.tools[0] === '*'
  ) {
    return { written: false, key, path: cfgPath };
  }

  parsed.mcpServers[key] = desired;

  storage.writeSync(cfgPath, JSON.stringify(parsed, null, 2) + '\n');
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
  storage.writeSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
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
  const hash = simpleHash(path.resolve(dest));
  const key = `squad_state_${hash}`;

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

/** Simple deterministic 8-char hex hash for path-based keys. */
function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
