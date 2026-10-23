/**
 * Squad directory resolution — walk-up and global path algorithms.
 *
 * resolveSquad()            — find .squad/ by walking up from startDir to .git boundary
 * resolveSquadPaths()       — dual-root resolution (projectDir / teamDir) for remote squad mode
 * resolveGlobalSquadPath()  — platform-specific config directory (externalized project state only)
 *
 * Dual-root resolution and remote mode design ported from @spboyer (Shayne Boyer)'s
 * PR bradygaster/squad#131. Original concept: resolveSquadPaths() with config.json
 * pointer for team identity separation.
 *
 * @module resolution
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveStateBackend, StateBackendStorageAdapter, type StateBackend, type StateBackendType } from './state-backend.js';
import type { StorageProvider } from './storage/storage-provider.js';

const storage = new FSStorageProvider();

// ============================================================================
// Resolution cache (perf: memoize repeated FS walks)
// ============================================================================
//
// Why caching is needed:
//   resolveSquad() and findSquadDir() walk from `startDir` toward `/`,
//   doing 2–3 syscalls per directory level. They are called from many CLI
//   entry points and from the Ralph daemon's watch loop, often several
//   times per command — repeating the same walk each time.
//
// Why TTL + explicit invalidation:
//   Results CAN change during a single process: `squad init` creates
//   `.squad/`, tests scaffold and tear down temp directories, and a
//   long-running daemon may observe directory changes between ticks.
//   A short TTL (5 s) makes the cache self-correcting in the worst case;
//   `clearResolveSquadCache()` provides immediate invalidation for any
//   command or test that mutates the `.squad/` layout.
//
// Escape hatch:
//   Set `SQUAD_NO_RESOLVE_CACHE=1` to disable both caches. Tests that
//   exhaustively exercise the walk algorithm should set this so cached
//   results from a previous test do not contaminate the next.
//
// Cache key: absolute path of `startDir` (after `path.resolve()`).

interface CacheEntry<T> {
  value: T;
  ts: number;
}

const RESOLVE_CACHE_TTL_MS = 5_000;
const resolveSquadCache = new Map<string, CacheEntry<string | null>>();
type FindSquadDirResult = { dir: string; name: '.squad' | '.ai-team' } | null;
const findSquadDirCache = new Map<string, CacheEntry<FindSquadDirResult>>();

function isResolveCacheDisabled(): boolean {
  return process.env['SQUAD_NO_RESOLVE_CACHE'] === '1';
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  if (isResolveCacheDisabled()) return undefined;
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > RESOLVE_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (isResolveCacheDisabled()) return;
  cache.set(key, { value, ts: Date.now() });
}

/**
 * Clear all in-process caches used by `resolveSquad()` and `findSquadDir()`.
 *
 * Call this from any command or test that creates, moves, or deletes a
 * `.squad/` (or `.ai-team/`) directory so subsequent resolution calls in
 * the same process observe the fresh filesystem state immediately,
 * instead of waiting up to {@link RESOLVE_CACHE_TTL_MS} ms for the TTL
 * to expire.
 *
 * Examples of callers that should invoke this:
 *   - `squad init` — creates `.squad/` in the project root
 *   - `squad link` — points an existing checkout at a remote team root
 *   - `squad upgrade` — may regenerate `.squad/` layout
 *   - Test fixtures that scaffold or tear down temporary `.squad/` dirs
 *
 * Safe to call when the cache is disabled (no-op).
 */
export function clearResolveSquadCache(): void {
  resolveSquadCache.clear();
  findSquadDirCache.clear();
}

// ============================================================================
// Dual-root path resolution types (Issue #311)
// ============================================================================

/**
 * Schema for `.squad/config.json` — controls remote squad mode.
 * Named SquadDirConfig to avoid collision with the runtime SquadConfig.
 */
export interface SquadDirConfig {
  version: number;
  teamRoot: string;
  projectKey: string | null;
  /** Where state is stored: 'external' when moved out of the working tree */
  stateLocation?: string;
  /** State storage backend: local | external | git-notes | orphan */
  stateBackend?: string;
}

/**
 * Resolved paths for dual-root squad mode.
 *
 * In **local** mode, projectDir and teamDir point to the same `.squad/` directory.
 * In **remote** mode, config.json specifies a `teamRoot` that resolves to a
 * separate directory for team identity (agents, casting, skills).
 */
export interface ResolvedSquadPaths {
  mode: 'local' | 'remote';
  /** Project-local .squad/ (decisions, logs) */
  projectDir: string;
  /**
   * Team identity root, exactly as configured. In remote mode this is the
   * resolved `teamRoot`, which may be either the team repo (parent of
   * `.squad/`) or the team's `.squad/` dir itself. Do not join team-state
   * paths (`.squad`, `agents/`, `decisions/`) onto it — the result depends on
   * which form the user wrote. Use {@link ResolvedSquadPaths.teamSquadDir}.
   */
  teamDir: string;
  /**
   * The team's squad directory (team.md, agents/, casting/), whichever form
   * `teamRoot` uses. Equals projectDir in local mode.
   */
  teamSquadDir: string;
  config: SquadDirConfig | null;
  name: '.squad' | '.ai-team';
  isLegacy: boolean;
}

/**
 * Given a directory containing a `.git` worktree pointer file, parse the file
 * to derive the absolute path of the main checkout.
 *
 * The `.git` file format is: `gitdir: <relative-or-absolute-path-to-.git/worktrees/name>`
 * The main checkout is: dirname(dirname(dirname(resolvedGitdir))) — i.e. two levels up
 * from the gitdir path puts us at the shared `.git/` dir, and one more dirname gives
 * us the main working tree root.
 *
 * @returns Absolute path to the main working tree, or `null` if resolution fails.
 */
function getMainWorktreePath(worktreeDir: string, gitFilePath: string): string | null {
  try {
    const content = (storage.readSync(gitFilePath) ?? '').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match || !match[1]) return null;
    // worktreeGitDir = /main/.git/worktrees/name
    const worktreeGitDir = path.resolve(worktreeDir, match[1].trim());
    // mainGitDir     = /main/.git   (up 2 from worktreeGitDir)
    const mainGitDir = path.resolve(worktreeGitDir, '..', '..');
    // mainCheckout   = /main        (dirname of mainGitDir)
    const mainCheckout = path.dirname(mainGitDir);
    // Verify the derived main checkout is a real git repo
    if (!storage.existsSync(mainGitDir) || !storage.isDirectorySync(mainGitDir)) {
      return null;
    }
    return mainCheckout;
  } catch {
    return null;
  }
}

/**
 * Walk up the directory tree from `startDir` looking for a `.squad/` directory.
 *
 * Stops at the repository root (the directory containing `.git` as a directory).
 * When `.git` is a **file** (git worktree), falls back to the main checkout strategy:
 * reads the `gitdir:` pointer, resolves the main checkout path, and checks there.
 * Returns the **absolute path** to the `.squad/` directory, or `null` if none is found.
 *
 * Resolution order (worktree-local strategy first, main-checkout strategy second):
 * 1. Walk up from `startDir` checking for `.squad/` — stops at `.git` directory boundary
 * 2. If `.git` is a file (worktree), check the main checkout for `.squad/`
 *
 * The walk never reaches the user profile: it stops at the home directory (so `~/.squad`,
 * the roaming `SQUAD_HOME` root, is never treated as a project squad) and a candidate equal
 * to `SQUAD_HOME` is ignored. Outside a project the result is `null`.
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Absolute path to `.squad/` or `null`.
 */
export function resolveSquad(startDir?: string): string | null {
  const cacheKey = path.resolve(startDir ?? process.cwd());
  const cached = readCache(resolveSquadCache, cacheKey);
  if (cached !== undefined) return cached;

  const result = resolveSquadUncached(cacheKey);
  writeCache(resolveSquadCache, cacheKey, result);
  return result;
}

/**
 * Platform config directory for Squad WITHOUT creating it (see {@link resolveGlobalSquadPath}).
 */
function platformSquadConfigDir(): string | null {
  try {
    const platform = process.platform;
    let base: string;
    if (platform === 'win32') {
      base = process.env['APPDATA'] ?? process.env['LOCALAPPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
    } else if (platform === 'darwin') {
      base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), 'Library', 'Application Support');
    } else {
      base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
    }
    // Canonicalize the PARENT only and append `squad` lexically: establishing the boundary must
    // never stat/read the retired profile directory itself.
    const canonicalBase = canonicalDir(base);
    return canonicalBase === null ? null : path.join(canonicalBase, 'squad');
  } catch {
    return null;
  }
}

/**
 * True when `teamDir` (absolute) is a location Squad 1.x used for the removed profile-level
 * squads: the platform config `squad/` dir (or anything beneath it), `~/.squad` / `SQUAD_HOME`,
 * or the home directory itself. Squad 2.0 never resolves a team from these; a project
 * `config.json` still carrying such a `teamRoot` is treated as local and `squad upgrade`
 * removes the key.
 */
export function isRetiredProfileTeamRoot(teamDir: string): boolean {
  const target = canonicalDir(teamDir);
  const b = profileBoundary();
  // Fail closed: an unresolvable target or an unknown boundary is treated as retired (never followed).
  if (target === null || !b.homeDir) return true;
  if (isProfileOwned(target, b)) return true;
  return isAncestorOf(path.join(b.homeDir, '.squad'), target) || samePath(target, path.join(b.homeDir, '.squad'));
}

/** Directories that are never project squads: the home dir and the roaming SQUAD_HOME root. */
interface ProfileBoundary {
  /** Canonical home directory, or null when it cannot be established (callers then refuse). */
  homeDir: string | null;
  /** Canonical roaming squad home (`SQUAD_HOME` or `<home>/.squad`). */
  squadHome: string | null;
  /** Canonical platform config dir (`%APPDATA%\squad`, `~/.config/squad`, …), the retired global-squad location. */
  configDir: string | null;
}

function profileBoundary(): ProfileBoundary {
  let homeDir: string | null = null;
  try { homeDir = canonicalDir(os.homedir()); } catch { homeDir = null; }
  const envHome = process.env['SQUAD_HOME'];
  // SQUAD_HOME: canonicalize its parent and append the leaf lexically, so the boundary is
  // established without touching the roaming directory itself.
  const squadHome = envHome
    ? (() => { const parent = canonicalDir(path.dirname(path.resolve(envHome))); return parent === null ? null : path.join(parent, path.basename(path.resolve(envHome))); })()
    : (homeDir ? path.join(homeDir, '.squad') : null);
  return { homeDir, squadHome, configDir: platformSquadConfigDir() };
}

/** A canonical path is "profile-owned" when it is the home dir itself, SQUAD_HOME (or below), or the platform config dir (or below). */
function isProfileOwned(canonical: string, b: ProfileBoundary): boolean {
  const under = (root: string | null) => root !== null && (samePath(canonical, root) || isAncestorOf(root, canonical));
  if (b.homeDir && samePath(canonical, b.homeDir)) return true;
  return under(b.squadHome) || under(b.configDir);
}

/**
 * Canonical absolute form of a directory for boundary comparisons: resolves 8.3 short
 * names on Windows (`C:\Users\TAMIRD~1` vs `C:\Users\tamirdresher`) and symlinked homes.
 * Falls back to `path.resolve` when the path does not exist.
 */
function canonicalDir(p: string): string | null {
  const resolved = path.resolve(p);
  // Find the longest EXISTING prefix lexically, canonicalize exactly that prefix, and re-append
  // the non-existing tail (non-existing components cannot be links). If the existing prefix
  // itself cannot be canonicalized (broken reparse point, permission denied), return null: the
  // caller must refuse rather than fall back to a lexical comparison (fail closed).
  const tail: string[] = [];
  let cur = resolved;
  for (;;) {
    let exists = false;
    try { fs.lstatSync(cur); exists = true; } catch { exists = false; }
    if (exists) {
      try {
        const real = fs.realpathSync.native(cur);
        return tail.length ? path.join(real, ...tail.reverse()) : real;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    tail.push(path.basename(cur));
    cur = parent;
  }
}

/**
 * True when the walk must stop at `current`: it is the home directory or one of its ancestors,
 * it lies inside the retired platform config dir, the boundary itself cannot be established, or
 * `current` cannot be canonicalized (fail closed — never compare lexically).
 */
function atOrAboveProfileRoot(current: string, b: ProfileBoundary): string | null {
  if (!b.homeDir) return null;
  const c = canonicalDir(current);
  if (c === null) return null;
  if (samePath(c, b.homeDir) || isAncestorOf(c, b.homeDir)) return null;
  if (b.configDir !== null && (samePath(c, b.configDir) || isAncestorOf(b.configDir, c))) return null;
  return c;
}

/**
 * Admit `candidate` (an existing `.squad`/`.ai-team` dir under canonical `canonicalParent`) only
 * when it is not profile-owned — including when it is a link whose target is profile-owned.
 * The candidate itself is only lstat'ed (and realpath'ed if it is a link); its contents are
 * never read here.
 */
function admitCandidate(candidate: string, canonicalParent: string, b: ProfileBoundary): boolean {
  const lexical = path.join(canonicalParent, path.basename(candidate));
  if (isProfileOwned(lexical, b)) return false;
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) {
      const real = canonicalDir(candidate);
      return real !== null && !isProfileOwned(real, b);
    }
  } catch {
    return false;
  }
  return true;
}

/** True when `dir` is a strict ancestor of `descendant`. */
function isAncestorOf(dir: string, descendant: string): boolean {
  const rel = path.relative(dir, descendant);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function resolveSquadUncached(startDir: string): string | null {
  let current = startDir;
  const boundary = profileBoundary();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Profile boundary: the home directory (and anything above it) and the platform config dir
    // are never a project; an unresolvable path refuses rather than guesses.
    const canonicalCurrent = atOrAboveProfileRoot(current, boundary);
    if (canonicalCurrent === null) {
      return null;
    }

    const candidate = path.join(current, '.squad');

    if (storage.existsSync(candidate) && storage.isDirectorySync(candidate) && admitCandidate(candidate, canonicalCurrent, boundary)) {
      return candidate;
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        // Real repo root — stop walking, no .squad/ found in this checkout
        return null;
      }
      // .git is a file — this is a git worktree
      // Worktree-local .squad/ was already checked above; fall back to main checkout
      const mainCheckout = getMainWorktreePath(current, gitMarker);
      if (mainCheckout) {
        const mainCandidate = path.join(mainCheckout, '.squad');
        if (storage.existsSync(mainCandidate) && storage.isDirectorySync(mainCandidate)) {
          return mainCandidate;
        }
      }
      return null;
    }

    const parent = path.dirname(current);

    // Filesystem root reached — nowhere left to walk
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

// ============================================================================
// Dual-root resolution (Issue #311)
// ============================================================================

/** Known squad directory names, in priority order. */
const SQUAD_DIR_NAMES = ['.squad', '.ai-team'] as const;

/**
 * Find the squad directory by walking up from `startDir`, checking both
 * `.squad/` and `.ai-team/` (legacy fallback).
 *
 * Worktree-aware: when `.git` is a file (worktree pointer), falls back to
 * checking the main checkout for either squad directory name.
 *
 * Returns the absolute path and the directory name used.
 */
function findSquadDir(startDir: string): { dir: string; name: '.squad' | '.ai-team' } | null {
  const cacheKey = path.resolve(startDir);
  const cached = readCache(findSquadDirCache, cacheKey);
  if (cached !== undefined) return cached;

  const result = findSquadDirUncached(cacheKey);
  writeCache(findSquadDirCache, cacheKey, result);
  return result;
}

function findSquadDirUncached(startDir: string): { dir: string; name: '.squad' | '.ai-team' } | null {
  let current = startDir;
  const boundary = profileBoundary();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Same profile boundary as resolveSquad().
    const canonicalCurrent = atOrAboveProfileRoot(current, boundary);
    if (canonicalCurrent === null) {
      return null;
    }
    for (const name of SQUAD_DIR_NAMES) {
      const candidate = path.join(current, name);
      if (storage.existsSync(candidate) && storage.isDirectorySync(candidate) && admitCandidate(candidate, canonicalCurrent, boundary)) {
        return { dir: candidate, name };
      }
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        // Real repo root — stop, no squad dir found in this checkout
        return null;
      }
      // .git is a file — this is a git worktree; fall back to main checkout
      const mainCheckout = getMainWorktreePath(current, gitMarker);
      if (mainCheckout) {
        for (const name of SQUAD_DIR_NAMES) {
          const candidate = path.join(mainCheckout, name);
          if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
            return { dir: candidate, name };
          }
        }
      }
      return null;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Try to read and parse `.squad/config.json` (or `.ai-team/config.json`).
 * Returns null for missing file, unreadable file, or malformed JSON.
 */
export function loadDirConfig(squadDir: string): SquadDirConfig | null {
  const configPath = path.join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.version === 'number' &&
      typeof parsed.teamRoot === 'string'
    ) {
      return {
        version: parsed.version,
        teamRoot: parsed.teamRoot,
        projectKey: typeof parsed.projectKey === 'string' ? parsed.projectKey : null,
        stateLocation: typeof parsed.stateLocation === 'string' ? parsed.stateLocation : undefined,
        stateBackend: typeof parsed.stateBackend === 'string' ? parsed.stateBackend : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the team's squad directory from a remote `teamRoot` (#2107).
 *
 * `squad link` writes `teamRoot` as the team repo (the parent of `.squad/`),
 * while the docs show the team's `.squad/` dir itself; the coordinator accepts
 * both. Prefer a nested squad dir; otherwise use teamDir when it already is
 * one. Falls back to the nested path so a missing team reports "not found".
 */
function resolveTeamSquadDir(teamDir: string, name: '.squad' | '.ai-team'): string {
  const names = name === '.squad' ? ['.squad', '.ai-team'] : ['.ai-team', '.squad'];
  for (const candidate of names) {
    const nested = path.join(teamDir, candidate);
    if (storage.existsSync(nested) && storage.isDirectorySync(nested)) return nested;
  }
  if (names.includes(path.basename(teamDir)) || storage.existsSync(path.join(teamDir, 'team.md'))) {
    return teamDir;
  }
  return path.join(teamDir, name);
}

/**
 * Resolve dual-root squad paths (projectDir / teamDir).
 *
 * - Walks up from `startDir` looking for `.squad/` (or `.ai-team/` for legacy repos).
 * - If `.squad/config.json` exists with a valid `teamRoot` → **remote** mode:
 *   teamDir is resolved relative to the **project root** (parent of .squad/).
 * - Otherwise → **local** mode: projectDir === teamDir.
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Resolved paths, or `null` if no squad directory is found.
 */
export function resolveSquadPaths(startDir?: string): ResolvedSquadPaths | null {
  const resolved = findSquadDir(startDir ?? process.cwd());
  if (!resolved) {
    return null;
  }

  const { dir: projectDir, name } = resolved;
  const isLegacy = name === '.ai-team';
  const config = loadDirConfig(projectDir);

  if (config && config.teamRoot && config.teamRoot !== '.') {
    // Remote mode: teamDir resolved relative to the project root (parent of .squad/)
    // '.' is the sentinel externalize.ts writes for "no separate team root" —
    // falls through to local mode below instead of resolving to the parent
    // of .squad/ (path.resolve(projectRoot, '.') === projectRoot, one level
    // too high).
    const projectRoot = path.resolve(projectDir, '..');
    const teamDir = path.resolve(projectRoot, config.teamRoot);
    // A 1.x init linked projects to the (removed) profile squad; such a teamRoot is stale,
    // never followed, and `squad upgrade` removes it. Genuine dual-root targets are kept.
    if (isRetiredProfileTeamRoot(teamDir)) {
      return {
        mode: 'local',
        projectDir,
        teamDir: projectRoot,
        teamSquadDir: projectDir,
        config: { ...config, teamRoot: '.' },
        name,
        isLegacy,
      };
    }
    return {
      mode: 'remote',
      projectDir,
      teamDir,
      teamSquadDir: resolveTeamSquadDir(teamDir, name),
      config,
      name,
      isLegacy,
    };
  }

  // Local mode: projectDir === teamDir
  return {
    mode: 'local',
    projectDir,
    teamDir: projectDir,
    teamSquadDir: projectDir,
    config,
    name,
    isLegacy,
  };
}

/**
 * Return the platform-specific Squad configuration directory. Squad 2.0 keeps only
 * externalized project state here (`projects/<projectKey>/`, see `squad externalize`);
 * no squad is ever initialized, read or resolved from this directory itself.
 *
 * | Platform | Path                                       |
 * |----------|--------------------------------------------|
 * | Windows  | `%APPDATA%/squad/`                         |
 * | macOS    | `$XDG_CONFIG_HOME/squad/` if set, else `~/Library/Application Support/squad/` |
 * | Linux    | `$XDG_CONFIG_HOME/squad/` (default `~/.config/squad/`) |
 *
 * The directory is created (recursively) if it does not already exist.
 *
 * @returns Absolute path to the Squad config directory.
 */
export function resolveGlobalSquadPath(): string {
  const platform = process.platform;
  let base: string;

  if (platform === 'win32') {
    // %APPDATA% is always set on Windows; fall back to %LOCALAPPDATA%, then homedir
    base = process.env['APPDATA']
      ?? process.env['LOCALAPPDATA']
      ?? path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    // macOS: an explicit XDG_CONFIG_HOME overrides the Library location (same override as Linux).
    base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    // Linux / other POSIX — respect XDG_CONFIG_HOME
    base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
  }

  const globalDir = path.join(base, 'squad');

  if (!storage.existsSync(globalDir)) {
    storage.mkdirSync(globalDir, { recursive: true });
  }

  return globalDir;
}

/**
 * Validate that a file path is within `.squad/` or the system temp directory.
 *
 * Use this guard before writing any scratch/temp/state files to ensure Squad
 * never clutters the repo root or arbitrary filesystem locations.
 *
 * @param filePath  - Absolute path to validate.
 * @param squadRoot - Absolute path to the `.squad/` directory (e.g. from `resolveSquad()`).
 * @returns The resolved absolute `filePath` if it is safe.
 * @throws If `filePath` is outside `.squad/` and not in the system temp directory.
 */
export function ensureSquadPath(filePath: string, squadRoot: string): string {
  const resolved = path.resolve(filePath);
  const resolvedSquad = path.resolve(squadRoot);
  const resolvedTmp = path.resolve(os.tmpdir());

  // Allow paths inside the .squad/ directory
  if (resolved === resolvedSquad || resolved.startsWith(resolvedSquad + path.sep)) {
    return resolved;
  }

  // Allow paths inside the system temp directory
  if (resolved === resolvedTmp || resolved.startsWith(resolvedTmp + path.sep)) {
    return resolved;
  }

  throw new Error(
    `Path "${resolved}" is outside the .squad/ directory ("${resolvedSquad}"). ` +
    'All squad scratch/temp/state files must be written inside .squad/ or the system temp directory.'
  );
}

/**
 * Validate that a file path is within either the projectDir or teamDir
 * (or the system temp directory). For use in dual-root / remote mode.
 *
 * @param filePath - Absolute path to validate.
 * @param projectDir - Absolute path to the project-local .squad/ directory.
 * @param teamDir - Absolute path to the team identity directory.
 * @returns The resolved absolute filePath if it is safe.
 * @throws If filePath is outside both roots and not in the system temp directory.
 */
export function ensureSquadPathDual(filePath: string, projectDir: string, teamDir: string): string {
  const resolved = path.resolve(filePath);
  const resolvedProject = path.resolve(projectDir);
  const resolvedTeam = path.resolve(teamDir);
  const resolvedTmp = path.resolve(os.tmpdir());

  // Allow paths inside the projectDir
  if (resolved === resolvedProject || resolved.startsWith(resolvedProject + path.sep)) {
    return resolved;
  }

  // Allow paths inside the teamDir
  if (resolved === resolvedTeam || resolved.startsWith(resolvedTeam + path.sep)) {
    return resolved;
  }

  // Allow paths inside the system temp directory
  if (resolved === resolvedTmp || resolved.startsWith(resolvedTmp + path.sep)) {
    return resolved;
  }

  throw new Error(
    `Path "${resolved}" is outside both squad roots ("${resolvedProject}", "${resolvedTeam}"). ` +
    'All squad scratch/temp/state files must be written inside a squad directory or the system temp directory.'
  );
}

/**
 * ensureSquadPath that works with resolved dual-root paths.
 * Convenience wrapper around ensureSquadPathDual.
 */
export function ensureSquadPathResolved(filePath: string, paths: ResolvedSquadPaths): string {
  return ensureSquadPathDual(filePath, paths.projectDir, paths.teamDir);
}

/**
 * Resolve the scratch directory for temporary files.
 *
 * Returns `{squadRoot}/.scratch/` — the canonical location for ephemeral files
 * that Squad and its agents create during operations (prompt files, intermediate
 * processing artifacts, commit message drafts, etc.).
 *
 * If `create` is true (default), the directory is created if it does not exist.
 *
 * @param squadRoot - Absolute path to the `.squad/` directory.
 * @param create    - Whether to create the directory if missing (default: true).
 * @returns Absolute path to the scratch directory.
 */
export function scratchDir(squadRoot: string, create: boolean = true): string {
  const dir = path.join(squadRoot, '.scratch');
  if (create && !storage.existsSync(dir)) {
    storage.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Return a unique file path inside the scratch directory.
 *
 * Writes content to the file if `content` is provided; otherwise returns
 * the path only and the caller is responsible for writing to it.
 * The caller is also responsible for deleting the file when done
 * (or relying on the cleanup capability).
 *
 * @param squadRoot - Absolute path to the `.squad/` directory.
 * @param prefix    - Filename prefix (e.g. `"fleet-prompt"`).
 * @param ext       - File extension including dot (e.g. `".txt"`). Defaults to `".tmp"`.
 * @param content   - Optional content to write immediately.
 * @returns Absolute path to the temp file.
 */
export function scratchFile(squadRoot: string, prefix: string, ext: string = '.tmp', content?: string): string {
  // Sanitize prefix to prevent path traversal — strip directory components
  const safePrefix = path.basename(prefix);
  const safeExt = ext.replace(/[\/\\]/g, '_');

  const dir = scratchDir(squadRoot);

  const now = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');

  const filename = `${safePrefix}-${now}-${rand}${safeExt}`;
  const filePath = path.join(dir, filename);
  if (content !== undefined) {
    storage.writeSync(filePath, content);
  }
  return filePath;
}

// ============================================================================
// External state storage (Issue #792)
// ============================================================================

/**
 * Derive a stable project key from a project directory path.
 *
 * Takes the basename of the path, lowercases it, and replaces unsafe characters
 * with dashes. Returns `'unknown-project'` if the basename is empty (e.g.,
 * filesystem root).
 *
 * @param projectDir - Absolute path to the project root.
 * @returns A sanitized, lowercase project key suitable for use as a directory name.
 */
export function deriveProjectKey(projectDir: string): string {
  const normalized = projectDir.replace(/\\/g, '/');
  const base = path.basename(normalized);
  if (!base) return 'unknown-project';

  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'unknown-project';
}

/**
 * Resolve the external state directory for a project.
 *
 * Returns `{globalDir}/projects/{sanitizedKey}/` where `globalDir` is the
 * platform-specific global config directory (e.g., `%APPDATA%/squad` on Windows,
 * `~/Library/Application Support/squad` on macOS, `$XDG_CONFIG_HOME/squad` or
 * `~/.config/squad` on Linux).
 *
 * Validates the project key to prevent path traversal. Throws if the key
 * is empty or contains `..` sequences.
 *
 * @param projectKey - The project key (from deriveProjectKey or user-supplied).
 * @param create     - Whether to create the directory if it doesn't exist (default: true).
 * @returns Absolute path to the project's external state directory.
 * @throws If projectKey is empty or contains path traversal sequences.
 */
export function resolveExternalStateDir(projectKey: string, create: boolean = true): string {
  if (!projectKey || projectKey.includes('..')) {
    throw new Error('Invalid project key');
  }

  // Sanitize: replace path separators and unsafe chars with dashes
  const sanitized = projectKey
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!sanitized) {
    throw new Error('Invalid project key');
  }

  const globalDir = resolveGlobalSquadPath();
  const projectsDir = path.join(globalDir, 'projects', sanitized);

  if (create && !storage.existsSync(projectsDir)) {
    storage.mkdirSync(projectsDir, { recursive: true });
  }

  return projectsDir;
}

// ============================================================================
// SQUAD_HOME — roaming squad root (Issue #1038)
// ============================================================================

/**
 * Resolve the squad home directory — a roaming root for presets and
 * machine-independent configuration that follows the user across machines.
 *
 * Resolution order:
 * 1. `SQUAD_HOME` env var (explicit override, e.g. a synced folder)
 * 2. `~/.squad/` (conventional default — user's home dir)
 *
 * Unlike `resolveGlobalSquadPath()` (which returns platform-specific app config),
 * squad home holds `presets/` and similar roaming configuration. It is never
 * resolved as a project squad (see {@link resolveSquad}).
 *
 * @param create - Whether to create the directory if missing (default: false).
 * @returns Absolute path to the squad home directory, or null if it doesn't
 *          exist and `create` is false.
 */
export function resolveSquadHome(create: boolean = false): string | null {
  const envHome = process.env['SQUAD_HOME'];
  const homeDir = envHome
    ? path.resolve(envHome)
    : path.join(os.homedir(), '.squad');

  if (storage.existsSync(homeDir)) {
    if (!storage.isDirectorySync(homeDir)) {
      throw new Error(`SQUAD_HOME path exists but is not a directory: ${homeDir}`);
    }
    return homeDir;
  }

  if (create) {
    storage.mkdirSync(homeDir, { recursive: true });
    return homeDir;
  }

  return null;
}

/**
 * Ensure the squad home directory exists with standard structure.
 * Creates `agents/` and `presets/` subdirectories.
 *
 * Idempotent — safe to call multiple times.
 *
 * @returns Absolute path to the squad home directory.
 */
export function ensureSquadHome(): string {
  const homeDir = resolveSquadHome(true)!;

  const agentsDir = path.join(homeDir, 'agents');
  if (!storage.existsSync(agentsDir)) {
    storage.mkdirSync(agentsDir, { recursive: true });
  }

  const presetsDir = path.join(homeDir, 'presets');
  if (!storage.existsSync(presetsDir)) {
    storage.mkdirSync(presetsDir, { recursive: true });
  }

  return homeDir;
}

/**
 * Resolve the presets directory within squad home.
 *
 * @returns Absolute path to `<squad-home>/presets/`, or null if squad home
 *          doesn't exist.
 */
export function resolvePresetsDir(): string | null {
  const homeDir = resolveSquadHome();
  if (!homeDir) return null;

  const presetsDir = path.join(homeDir, 'presets');
  if (!storage.existsSync(presetsDir) || !storage.isDirectorySync(presetsDir)) return null;

  return presetsDir;
}

// ============================================================================
// State backend resolution (Issue #1003)
// ============================================================================

/**
 * Resolved state context for a squad session.
 *
 * Combines the resolved paths with the active state backend. Commands
 * and SDK functions that need state I/O use this context instead of
 * directly instantiating an FSStorageProvider.
 *
 * **Boundary:** Only mutable squad state flows through the backend.
 * Bootstrap artifacts (config.json, team.md structure checks) stay on
 * the local filesystem because they are needed before a backend can be
 * resolved.
 */
export interface SquadStateContext {
  /** Dual-root resolved paths (projectDir, teamDir, etc.) */
  paths: ResolvedSquadPaths;
  /** The active state backend (local, git-notes, or orphan) */
  backend: StateBackend;
  /** The repo root directory (for git-native backends) */
  repoRoot: string;
  /** StorageProvider backed by the active state backend — pass to SDK modules */
  storage: StorageProvider;
}

/**
 * Resolve the full squad state context: paths + state backend.
 *
 * Call once at command entry and thread the context through to SDK functions.
 * This ensures the configured state backend (local, git-notes, orphan)
 * applies to all squad operations — not just the watch command.
 *
 * @param startDir - Directory to start searching from. Defaults to cwd.
 * @param cliOverride - CLI flag override for state backend type.
 * @returns Resolved context, or null if no squad directory is found.
 */
export function resolveSquadState(startDir?: string, cliOverride?: StateBackendType): SquadStateContext | null {
  const paths = resolveSquadPaths(startDir);
  if (!paths) return null;

  // Resolve actual repo root via git — handles linked worktrees correctly
  const effectiveStart = startDir ?? process.cwd();
  let repoRoot: string;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: effectiveStart, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Fallback: derive from .squad/ parent if git is unavailable
    repoRoot = path.resolve(paths.projectDir, '..');
  }

  // Resolve the backend from config + CLI override
  const backend = resolveStateBackend(paths.projectDir, repoRoot, cliOverride);

  // For local backend, use FSStorageProvider directly (more capable).
  // For git-notes/orphan, bridge via StateBackendStorageAdapter.
  // rootDir is paths.teamSquadDir (matches the squadRoot every local-backend
  // caller — e.g. ToolRegistry in state-mcp.ts — builds its paths against),
  // so the traversal guard actually validates instead of no-op'ing on an
  // unset rootDir and letting a bad upstream path resolve silently.
  const stateStorage: StorageProvider = backend.name === 'local'
    ? new FSStorageProvider(paths.teamSquadDir)
    : new StateBackendStorageAdapter(backend, paths.projectDir);

  return { paths, backend, repoRoot, storage: stateStorage };
}
