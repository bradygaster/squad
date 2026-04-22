/**
 * Clone-local runtime state resolution.
 *
 * Derives and manages per-clone state directories stored outside the repo
 * working tree, under the platform-specific LOCAL app data directory.
 *
 * Layout: {localBase}/squad/repos/{repo-key}/clones/{leaf-name}/
 *
 * Uses `validateRepoKey()` from shared-squad.ts for consistent validation.
 *
 * @module clone-state
 */

import path from 'node:path';
import os from 'node:os';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { validateRepoKey } from './shared-squad.js';
import { CASE_INSENSITIVE } from './resolution-base.js';

const storage = new FSStorageProvider();

/**
 * Metadata stored in `clone.json` inside each clone-local state directory.
 */
export interface CloneStateMetadata {
  clonePath: string;
  repoKey: string;
  firstSeen: string;
  lastSeen: string;
}

// ============================================================================
// Platform-specific base directory
// ============================================================================

/**
 * Return the platform-specific LOCAL app data base for squad.
 *
 * | Platform | Path                                          |
 * |----------|-----------------------------------------------|
 * | Windows  | `%LOCALAPPDATA%/squad/`                       |
 * | macOS    | `~/Library/Application Support/squad/`         |
 * | Linux    | `$XDG_DATA_HOME/squad/` (default `~/.local/share/squad/`) |
 *
 * Unlike `resolveGlobalSquadPath()` (which uses ROAMING / XDG_CONFIG_HOME),
 * this uses LOCAL / XDG_DATA_HOME — for high-write runtime state that must
 * not traverse network shares.
 */
export function resolveLocalSquadBase(): string {
  const platform = process.platform;
  let base: string;

  if (platform === 'win32') {
    base = process.env['LOCALAPPDATA']
      ?? path.join(os.homedir(), 'AppData', 'Local');
  } else if (platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    // Linux / POSIX — XDG_DATA_HOME for local data (not XDG_CONFIG_HOME)
    base = process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share');
  }

  return path.join(base, 'squad');
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Normalize a clone path for consistent comparison and storage.
 * Resolves to absolute, removes trailing separators, and lowercases
 * on case-insensitive platforms (Windows, macOS).
 */
function normalizePath(clonePath: string): string {
  let resolved = path.resolve(clonePath);
  // Strip trailing separator (unless it's the root like "C:\")
  while (resolved.length > 1 && resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }
  if (CASE_INSENSITIVE) {
    resolved = resolved.toLowerCase();
  }
  return resolved;
}

/**
 * Read and parse a clone.json file. Returns null if missing or malformed.
 */
function readCloneJson(dir: string): CloneStateMetadata | null {
  const jsonPath = path.join(dir, 'clone.json');
  const raw = storage.readSync(jsonPath);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>)['clonePath'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['repoKey'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['firstSeen'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['lastSeen'] === 'string'
    ) {
      return parsed as CloneStateMetadata;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the clones directory for a given repo key.
 */
function getClonesDir(repoKey: string): string {
  const localBase = resolveLocalSquadBase();
  return path.join(localBase, 'repos', ...repoKey.split('/'), 'clones');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Derive the clone-local state directory path for a given clone.
 *
 * Path structure: `{localBase}/squad/repos/{repo-key}/clones/{leaf-name}/`
 *
 * `leaf-name` is the last path segment of `clonePath`, lowercased.
 * On collision (two clones with the same leaf but different paths),
 * suffixes `-2`, `-3`, etc. are appended.
 *
 * This function reads the filesystem to detect collisions but does NOT
 * create any directories.
 *
 * @param clonePath - Absolute path to the clone's working tree.
 * @param repoKey - Canonical repo key (e.g. "microsoft/os/os.2020").
 * @returns Absolute path to the clone-local state directory.
 */
export function resolveCloneStateDir(clonePath: string, repoKey: string): string {
  validateRepoKey(repoKey);
  const normalized = normalizePath(clonePath);
  const leaf = path.basename(normalized).toLowerCase();
  if (!leaf || leaf === '.' || leaf === '..') {
    throw new Error(`Cannot derive leaf name from clone path "${clonePath}".`);
  }

  // If the leaf is a common generic name, prepend the parent dir to avoid collisions
  // (e.g. D:\git\os\clone1\src → "clone1-src" instead of just "src")
  const GENERIC_LEAVES = new Set(['src', 'source', 'repo', 'code', 'trunk', 'main', 'root']);
  let effectiveLeaf = leaf;
  if (GENERIC_LEAVES.has(leaf)) {
    const parent = path.basename(path.dirname(normalized)).toLowerCase();
    if (parent && parent !== '.' && parent !== '..') {
      effectiveLeaf = `${parent}-${leaf}`;
    }
  }

  const clonesDir = getClonesDir(repoKey);

  // First pass: scan ALL existing candidates (base leaf + suffixed) to check
  // if this clonePath is already registered somewhere.
  const baseCandidatePath = path.join(clonesDir, effectiveLeaf);
  const existingMeta = readCloneJson(baseCandidatePath);
  if (existingMeta && normalizePath(existingMeta.clonePath) === normalized) {
    return baseCandidatePath;
  }

  // Scan suffixed dirs
  for (let i = 2; i <= 100; i++) {
    const suffixedPath = path.join(clonesDir, `${effectiveLeaf}-${i}`);
    if (!storage.existsSync(suffixedPath)) break;
    const meta = readCloneJson(suffixedPath);
    if (meta && normalizePath(meta.clonePath) === normalized) {
      return suffixedPath;
    }
  }

  // Not registered yet — find the first available slot
  if (!existingMeta || existingMeta === null) {
    // Base slot is free (no clone.json or malformed)
    if (!storage.existsSync(baseCandidatePath)) {
      return baseCandidatePath;
    }
    // Dir exists but clone.json is missing/malformed — check if it's really empty
    const meta = readCloneJson(baseCandidatePath);
    if (!meta) {
      return baseCandidatePath;
    }
  }

  // Base slot occupied by a different clone — find first free suffix
  for (let i = 2; i <= 100; i++) {
    const suffixedPath = path.join(clonesDir, `${effectiveLeaf}-${i}`);
    if (!storage.existsSync(suffixedPath)) {
      return suffixedPath;
    }
    const meta = readCloneJson(suffixedPath);
    if (!meta) {
      // Dir exists but clone.json missing/malformed — claim it
      return suffixedPath;
    }
    // Occupied by yet another clone — continue
  }

  throw new Error(`Clone leaf name collision limit exceeded for "${effectiveLeaf}" in repo "${repoKey}".`);
}

/**
 * Ensure the clone-local state directory exists and write/update `clone.json`.
 *
 * - Creates the directory (recursively) if it does not exist.
 * - Writes `clone.json` with `{ clonePath, repoKey, firstSeen, lastSeen }`.
 * - On subsequent calls, only updates `lastSeen`.
 *
 * Uses a claim-and-verify pattern: after resolving the target directory,
 * re-checks clone.json to handle concurrent callers.
 *
 * @param clonePath - Absolute path to the clone's working tree.
 * @param repoKey - Canonical repo key (e.g. "microsoft/os/os.2020").
 * @returns Absolute path to the clone-local state directory.
 */
export function ensureCloneState(clonePath: string, repoKey: string): string {
  validateRepoKey(repoKey);
  const normalized = normalizePath(clonePath);
  const dir = resolveCloneStateDir(clonePath, repoKey);
  const jsonPath = path.join(dir, 'clone.json');
  const now = new Date().toISOString();

  // Ensure directory exists
  if (!storage.existsSync(dir)) {
    storage.mkdirSync(dir, { recursive: true });
  }

  // Re-read after mkdir to handle race with concurrent callers
  const existing = readCloneJson(dir);

  if (existing && normalizePath(existing.clonePath) === normalized) {
    // Already ours — update lastSeen
    const updated: CloneStateMetadata = { ...existing, lastSeen: now };
    storage.writeSync(jsonPath, JSON.stringify(updated, null, 2) + '\n');
    return dir;
  }

  if (existing && normalizePath(existing.clonePath) !== normalized) {
    // Race condition: another caller claimed this slot between resolve and ensure.
    // Re-resolve to find a new slot and retry once.
    const retryDir = resolveCloneStateDir(clonePath, repoKey);
    const retryJsonPath = path.join(retryDir, 'clone.json');
    if (!storage.existsSync(retryDir)) {
      storage.mkdirSync(retryDir, { recursive: true });
    }
    const retryExisting = readCloneJson(retryDir);
    if (retryExisting && normalizePath(retryExisting.clonePath) === normalized) {
      const updated: CloneStateMetadata = { ...retryExisting, lastSeen: now };
      storage.writeSync(retryJsonPath, JSON.stringify(updated, null, 2) + '\n');
      return retryDir;
    }
    // Claim the new slot
    const meta: CloneStateMetadata = { clonePath: normalized, repoKey, firstSeen: now, lastSeen: now };
    storage.writeSync(retryJsonPath, JSON.stringify(meta, null, 2) + '\n');
    return retryDir;
  }

  // No existing clone.json — claim this slot
  const meta: CloneStateMetadata = { clonePath: normalized, repoKey, firstSeen: now, lastSeen: now };
  storage.writeSync(jsonPath, JSON.stringify(meta, null, 2) + '\n');
  return dir;
}
