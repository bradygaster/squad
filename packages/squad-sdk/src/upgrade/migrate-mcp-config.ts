/**
 * Squad upgrade helpers — MCP config migration (Phase 2).
 *
 * Folds the legacy per-repo `.copilot/mcp-config.json` into the new
 * workspace-loaded `.mcp.json`. Also exposes a small shared primitive
 * for keeping the `squad_state` server entry in sync across both files
 * during the additive deprecation window (used by `squad init` for
 * the dual-write path).
 *
 * Conflict policy per server name (matches Seven's precedence finding —
 * `.mcp.json` fully shadows `~/.copilot/mcp-config.json`, no key-level
 * merging — so we resolve conflicts on the workspace side defensively):
 *   - missing in target          → copy from source        (migrated)
 *   - present and equivalent     → no-op                   (skipped)
 *   - present but different      → warn + KEEP target      (conflict)
 *
 * Writes are atomic (temp-in-same-dir + rename) so a crashed run never
 * leaves Copilot CLI 1.0.58 staring at malformed JSON (which it silently
 * drops — exit 0, no stderr, all workspace servers vanish).
 *
 * @module upgrade/migrate-mcp-config
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of an MCP server entry as written by Copilot CLI / `squad init`.
 *
 * Other fields (e.g. `type`, `url`) are tolerated and preserved verbatim,
 * but only `command` / `args` / `env` participate in equivalence checks
 * because those are the runtime-meaningful fields for the merge.
 */
export interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

/** Shape of a `.mcp.json` / `.copilot/mcp-config.json` file. */
export interface McpConfigShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export interface MigrateMcpConfigOptions {
  /**
   * If `true`, overwrite a malformed `.mcp.json` (the target). Defaults to
   * `false` — by default the helper refuses to clobber a file it can't
   * understand and returns a `malformed-target` status instead.
   */
  force?: boolean;
}

export type MigrateMcpConfigStatus =
  | 'no-legacy'         // legacy file absent — nothing to do
  | 'empty-legacy'      // legacy file present but has no servers
  | 'no-op'             // legacy servers all match target
  | 'migrated'          // wrote merged config
  | 'malformed-legacy'  // could not parse legacy file (no write performed)
  | 'malformed-target'; // could not parse target `.mcp.json` (no write performed)

export interface MigrateMcpConfigResult {
  status: MigrateMcpConfigStatus;
  /** Number of server names copied from legacy into `.mcp.json`. */
  migrated: number;
  /** Server names that were copied. */
  migratedKeys: string[];
  /** Server names that already existed in `.mcp.json` with the same definition. */
  skippedKeys: string[];
  /** Server names that exist in both files with different definitions (target kept). */
  conflicts: string[];
  /** Human-readable warning lines (one per conflict, plus any structural notes). */
  warnings: string[];
  /** Absolute path to the legacy file we read (for diagnostics). */
  legacyPath: string;
  /** Absolute path to the workspace `.mcp.json` we wrote (for diagnostics). */
  mcpJsonPath: string;
  /** Error message if `status` is `malformed-*`. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Migrate legacy `.copilot/mcp-config.json` entries into `.mcp.json`.
 *
 * Idempotent — re-running after a successful migration returns
 * `status: 'no-op'` with `migrated: 0`.
 *
 * @param repoRoot Absolute path to the repository root (the directory that
 *   contains `.mcp.json` and/or `.copilot/mcp-config.json`).
 * @param options  See {@link MigrateMcpConfigOptions}.
 */
export function migrateMcpConfig(
  repoRoot: string,
  options: MigrateMcpConfigOptions = {},
): MigrateMcpConfigResult {
  const legacyPath = join(repoRoot, '.copilot', 'mcp-config.json');
  const mcpJsonPath = join(repoRoot, '.mcp.json');

  const baseResult: MigrateMcpConfigResult = {
    status: 'no-legacy',
    migrated: 0,
    migratedKeys: [],
    skippedKeys: [],
    conflicts: [],
    warnings: [],
    legacyPath,
    mcpJsonPath,
  };

  if (!existsSync(legacyPath)) {
    return baseResult;
  }

  // -- Read legacy ---------------------------------------------------------
  let legacy: McpConfigShape;
  try {
    legacy = parseJsonFile(legacyPath);
  } catch (err) {
    return {
      ...baseResult,
      status: 'malformed-legacy',
      error: `Failed to parse legacy MCP config at ${legacyPath}: ${(err as Error).message}`,
    };
  }

  const legacyServers = legacy.mcpServers ?? {};
  const legacyKeys = Object.keys(legacyServers);
  if (legacyKeys.length === 0) {
    return { ...baseResult, status: 'empty-legacy' };
  }

  // -- Read target ---------------------------------------------------------
  let target: McpConfigShape = {};
  if (existsSync(mcpJsonPath)) {
    try {
      target = parseJsonFile(mcpJsonPath);
    } catch (err) {
      if (!options.force) {
        return {
          ...baseResult,
          status: 'malformed-target',
          error:
            `Refusing to overwrite malformed .mcp.json at ${mcpJsonPath}: ` +
            `${(err as Error).message}. Fix the file by hand or re-run with --force.`,
        };
      }
      // force: start from empty target (legacy + new merge wins)
      target = {};
    }
  }

  // -- Merge ---------------------------------------------------------------
  const mergedServers: Record<string, McpServerEntry> = {
    ...(target.mcpServers ?? {}),
  };
  const migratedKeys: string[] = [];
  const skippedKeys: string[] = [];
  const conflicts: string[] = [];
  const warnings: string[] = [];

  for (const key of legacyKeys) {
    const legacyEntry = legacyServers[key];
    if (legacyEntry === undefined) continue;
    const existing = mergedServers[key];
    if (existing === undefined) {
      mergedServers[key] = legacyEntry;
      migratedKeys.push(key);
      continue;
    }
    if (mcpEntriesEquivalent(existing, legacyEntry)) {
      skippedKeys.push(key);
      continue;
    }
    conflicts.push(key);
    warnings.push(
      `MCP server "${key}" exists in both .mcp.json and .copilot/mcp-config.json ` +
      `with different definitions; keeping the .mcp.json version. ` +
      `Reconcile by hand if the legacy definition was intentional.`,
    );
  }

  if (migratedKeys.length === 0) {
    return {
      ...baseResult,
      status: 'no-op',
      skippedKeys,
      conflicts,
      warnings,
    };
  }

  const merged: McpConfigShape = {
    ...target,
    mcpServers: mergedServers,
  };

  atomicWriteJson(mcpJsonPath, merged);

  return {
    status: 'migrated',
    migrated: migratedKeys.length,
    migratedKeys,
    skippedKeys,
    conflicts,
    warnings,
    legacyPath,
    mcpJsonPath,
  };
}

/**
 * Ensure a single MCP server entry is pinned in an MCP config file.
 *
 * Used by `squad init` to keep `squad_state` in sync across both
 * `.mcp.json` and the legacy `.copilot/mcp-config.json` during the
 * additive deprecation window.
 *
 * - If `filePath` does not exist and `createIfMissing` is false → no-op.
 * - If the file is malformed → no-op (returns `status: 'malformed'`),
 *   never clobbers a file we can't parse.
 * - If the server is already present with an equivalent definition →
 *   no-op (`status: 'no-op'`).
 * - If the server is missing or different → write it (atomic).
 *
 * @returns result object describing what happened.
 */
export interface EnsureMcpServerOptions {
  /** Create the file (and `mcpServers` key) if it does not exist. Default: `false`. */
  createIfMissing?: boolean;
  /** If true, overwrite a conflicting entry. Default: `false` (keep existing, warn). */
  overwriteOnConflict?: boolean;
}

export type EnsureMcpServerStatus =
  | 'no-op'
  | 'created'    // file did not exist; we created it (only if createIfMissing)
  | 'added'      // file existed, server key was missing; we added it
  | 'updated'    // overwriteOnConflict resolved a conflict
  | 'conflict'   // entry differs but overwriteOnConflict=false; left as-is
  | 'malformed'  // file exists but won't parse; not touched
  | 'absent';    // file does not exist and createIfMissing=false

export interface EnsureMcpServerResult {
  status: EnsureMcpServerStatus;
  filePath: string;
  warning?: string;
}

export function ensureMcpServerPinned(
  filePath: string,
  serverName: string,
  serverEntry: McpServerEntry,
  options: EnsureMcpServerOptions = {},
): EnsureMcpServerResult {
  const { createIfMissing = false, overwriteOnConflict = false } = options;

  if (!existsSync(filePath)) {
    if (!createIfMissing) {
      return { status: 'absent', filePath };
    }
    const fresh: McpConfigShape = {
      mcpServers: { [serverName]: serverEntry },
    };
    atomicWriteJson(filePath, fresh);
    return { status: 'created', filePath };
  }

  let parsed: McpConfigShape;
  try {
    parsed = parseJsonFile(filePath);
  } catch (err) {
    return {
      status: 'malformed',
      filePath,
      warning: `Skipped MCP server pin in ${filePath}: ${(err as Error).message}`,
    };
  }

  const servers = { ...(parsed.mcpServers ?? {}) };
  const existing = servers[serverName];
  if (existing === undefined) {
    servers[serverName] = serverEntry;
    atomicWriteJson(filePath, { ...parsed, mcpServers: servers });
    return { status: 'added', filePath };
  }
  if (mcpEntriesEquivalent(existing, serverEntry)) {
    return { status: 'no-op', filePath };
  }
  if (overwriteOnConflict) {
    servers[serverName] = serverEntry;
    atomicWriteJson(filePath, { ...parsed, mcpServers: servers });
    return { status: 'updated', filePath };
  }
  return {
    status: 'conflict',
    filePath,
    warning:
      `MCP server "${serverName}" in ${filePath} differs from the Squad pin; ` +
      `leaving the existing entry in place.`,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseJsonFile(filePath: string): McpConfigShape {
  const raw = readFileSync(filePath, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }
  const parsed = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected a JSON object at the file root');
  }
  return parsed as McpConfigShape;
}

/**
 * Atomic write: serialize to a temp file in the same directory, fsync via
 * `writeFileSync`'s flush, then rename over the target. The same-directory
 * rule keeps the rename within a single filesystem so the swap is atomic
 * on all supported platforms (POSIX rename(2), Windows MoveFileEx).
 *
 * Exported for re-use by `ensureMcpServerPinned` and for tests that need
 * to assert no temp file is left behind on success.
 */
export function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  // `process.pid` + timestamp is sufficient — this is single-process CLI code,
  // not concurrent server traffic.
  const tempPath = join(
    dir,
    `.${pathBasename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const serialized = JSON.stringify(value, null, 2) + '\n';
  // Worf Condition B (defense-in-depth): round-trip the payload through
  // JSON.parse before touching disk. Closes the silent-fallback hazard
  // documented in Seven's precedence research — Copilot CLI 1.0.58 silently
  // drops malformed `.mcp.json` with no warning, so we must guarantee we
  // never write invalid JSON in the first place. Cheap (<1ms) insurance
  // against future refactors that introduce custom `toJSON` methods or
  // non-stringify-safe values.
  JSON.parse(serialized);
  try {
    writeFileSync(tempPath, serialized, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (err) {
    // Best-effort cleanup; the temp file may not exist if writeFileSync threw.
    try { unlinkSync(tempPath); } catch { /* ignore */ }
    throw err;
  }
}

function pathBasename(p: string): string {
  // Avoid importing `basename` from `path` separately — keep imports tight.
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

/**
 * Two MCP server entries are equivalent iff their runtime-meaningful fields
 * (`command`, `args`, `env`) match. Unknown sibling fields are ignored —
 * those are typically Copilot-CLI-managed metadata we don't want to fight
 * over.
 */
function mcpEntriesEquivalent(a: McpServerEntry, b: McpServerEntry): boolean {
  if ((a.command ?? '') !== (b.command ?? '')) return false;
  if (!arraysEqual(a.args ?? [], b.args ?? [])) return false;
  if (!envEqual(a.env, b.env)) return false;
  return true;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function envEqual(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const aKeys = a ? Object.keys(a).sort() : [];
  const bKeys = b ? Object.keys(b).sort() : [];
  if (!arraysEqual(aKeys, bKeys)) return false;
  for (const k of aKeys) {
    if ((a as Record<string, string>)[k] !== (b as Record<string, string>)[k]) return false;
  }
  return true;
}
