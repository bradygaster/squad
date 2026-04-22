/**
 * Shared Squad — Input validation for repo keys and write paths.
 *
 * Repo keys (e.g. `microsoft/os.2020` or `microsoft/os/os.2020`) map directly
 * to nested directories under `%APPDATA%/squad/repos/`. Without validation,
 * a malicious key like `../../etc/passwd` would escape the repos directory.
 *
 * These guards are the first line of defense — called at `squad init --shared`,
 * SQUAD_REPO_KEY env var parsing, and registry deserialization.
 *
 * Security findings addressed:
 * - F1 (BLOCKING): Path traversal via unsanitized repo key
 * - F5 (IMPORTANT): Agent name injection in journal filenames
 * - F7 (IMPORTANT): Symlink/junction redirect attacks on write paths
 *
 * @module shared-squad
 */

import path from 'node:path';
import os from 'node:os';
import { realpathSync } from 'node:fs';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveGlobalSquadPath, resolvePersonalSquadDir, pathStartsWith, CASE_INSENSITIVE } from './resolution-base.js';
import type { ResolvedSquadPaths } from './resolution-base.js';
import { normalizeRemoteUrl, getRemoteUrl } from './platform/detect.js';
import { resolveCloneStateDir } from './clone-state.js';

const storage = new FSStorageProvider();

/** Allowed characters per segment: lowercase alphanumeric, dot, underscore, hyphen. */
const SEGMENT_PATTERN = /^[a-z0-9._-]+$/;

/** Maximum length for a single segment (prevents filesystem path length issues). */
const MAX_SEGMENT_LENGTH = 128;

/** Windows-illegal filename characters (also rejected on all platforms for portability). */
const WINDOWS_ILLEGAL_CHARS = /[<>:"|?*\\]/;

/**
 * Validate a repo key before it's used to derive a filesystem path.
 *
 * A valid key has 2 segments (`owner/repo`) or 3 segments (`org/project/repo`),
 * each containing only lowercase alphanumeric chars, dots, underscores, or hyphens.
 *
 * @param key - The repo key to validate (e.g. `microsoft/os.2020`).
 * @throws {Error} If the key is invalid with a descriptive message.
 */
export function validateRepoKey(key: string): void {
  // Null byte check — must come first since null bytes can bypass downstream checks
  if (key.includes('\0')) {
    throw new Error(`Invalid repo key: contains null byte`);
  }

  // Empty string
  if (key.length === 0) {
    throw new Error(`Invalid repo key: empty string`);
  }

  // Absolute path prefixes (Unix, Windows drive, UNC)
  if (key.startsWith('/') || key.startsWith('\\') || /^[a-zA-Z]:/.test(key)) {
    throw new Error(`Invalid repo key "${key}": absolute paths are not allowed`);
  }

  // Windows-illegal filename characters (checked on all platforms for portability)
  if (WINDOWS_ILLEGAL_CHARS.test(key)) {
    throw new Error(
      `Invalid repo key "${key}": contains illegal characters (< > : " | ? * \\)`
    );
  }

  const segments = key.split('/');

  // Path traversal — reject segments that are exactly '.' or '..'
  if (segments.some(s => s === '.' || s === '..')) {
    throw new Error(`Invalid repo key "${key}": path traversal (. or ..) rejected`);
  }

  // Segment count: must be 2 (owner/repo) or 3 (org/project/repo)
  if (segments.length < 2 || segments.length > 3) {
    throw new Error(
      `Invalid repo key "${key}": must have 2-3 segments (owner/repo or org/project/repo)`
    );
  }

  for (const seg of segments) {
    if (seg === '') {
      throw new Error(`Invalid repo key "${key}": empty segment`);
    }
    if (seg.length > MAX_SEGMENT_LENGTH) {
      throw new Error(
        `Invalid repo key "${key}": segment "${seg.slice(0, 20)}..." exceeds ${MAX_SEGMENT_LENGTH} character limit`
      );
    }
    if (!SEGMENT_PATTERN.test(seg)) {
      throw new Error(
        `Invalid repo key "${key}": segment "${seg}" contains invalid characters (allowed: a-z 0-9 . _ -)`
      );
    }
  }
}

/**
 * Verify that a resolved path stays under the expected root directory.
 *
 * Uses `fs.realpathSync()` on the nearest existing ancestor of `resolvedPath`
 * and on `expectedRoot` to catch symlink/junction redirect attacks. This is
 * safe to call even when the target file doesn't exist yet — it walks up to
 * the nearest existing ancestor directory.
 *
 * @param resolvedPath  - The target path to validate (may not exist yet).
 * @param expectedRoot  - The directory the path must stay inside (must exist).
 * @throws {Error} If the path escapes the expected root.
 */
export function validateWritePath(resolvedPath: string, expectedRoot: string): void {
  const resolvedTarget = path.resolve(resolvedPath);
  let resolvedRoot: string;

  try {
    resolvedRoot = realpathSync(path.resolve(expectedRoot));
  } catch {
    throw new Error(
      `Write path validation failed: expected root "${expectedRoot}" does not exist or is inaccessible`
    );
  }

  if (!storage.isDirectorySync(resolvedRoot)) {
    throw new Error(`Write path validation failed: expected root "${expectedRoot}" is not a directory`);
  }

  // Walk up from the target to find the nearest existing ancestor
  let checkPath = resolvedTarget;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const realAncestor = realpathSync(checkPath);
      if (!pathStartsWith(realAncestor, resolvedRoot + path.sep) && realAncestor !== resolvedRoot) {
        throw new Error(
          `Write path escapes expected root: resolved path is outside "${resolvedRoot}"`
        );
      }
      // Ancestor is inside root — the remaining path segments are safe
      // (they can't escape via symlink since they don't exist yet)
      return;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const parent = path.dirname(checkPath);
        if (parent === checkPath) {
          // Reached filesystem root without finding an existing ancestor
          throw new Error(
            `Write path escapes expected root: no existing ancestor found under "${resolvedRoot}"`
          );
        }
        checkPath = parent;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Sanitize a name for use as a component in journal filenames.
 *
 * Journal filenames follow the pattern `{agent-name}-{timestamp}-{random}.md`.
 * If an agent name contains path separators or other special characters, it
 * could be used to inject path traversal into the filename.
 *
 * Replaces any character outside `[a-zA-Z0-9_-]` with `_`.
 *
 * @param name - The raw agent or component name.
 * @returns A sanitized string safe for use in filenames.
 */
export function sanitizeJournalFilenameComponent(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ============================================================================
// Repo Registry Types
// ============================================================================

/** A single entry in repos.json — key-only, paths derived from key (F7). */
export interface RepoRegistryEntry {
  /** Canonical repo key (e.g. "microsoft/os/os.2020" or "owner/repo"). */
  key: string;
  /** Normalized URL patterns for matching clones to this entry. */
  urlPatterns: string[];
  /** ISO-8601 timestamp when this entry was created. */
  created_at: string;
}

/** Schema for the global repos.json registry. */
export interface RepoRegistry {
  version: 1;
  repos: RepoRegistryEntry[];
}

/** Metadata stored in each shared squad's manifest.json. */
export interface SharedSquadManifest {
  version: 1;
  repoKey: string;
  displayName?: string;
  urlPatterns: string[];
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const REPOS_JSON = 'repos.json';
const REPOS_DIR = 'repos';
const SQUAD_REPOS_POINTER = 'squad-repos.json';

// ============================================================================
// Squad repo pointer resolution (~/.squad/squad-repos.json)
// ============================================================================

/** A registry entry paired with the squad repo root it came from. */
export interface LocatedRegistryEntry {
  entry: RepoRegistryEntry;
  /** Root path of the squad repo (e.g. D:\git\akubly.squad). */
  squadRepoRoot: string;
}

/**
 * Load squad repo pointers from `~/.squad/squad-repos.json`.
 *
 * Returns an array of absolute paths to squad repo clones.
 * Falls back to empty array if the file doesn't exist or is malformed.
 */
export function loadSquadRepoPointers(): string[] {
  const squadDir = path.join(os.homedir(), '.squad');
  const pointerPath = path.join(squadDir, SQUAD_REPOS_POINTER);

  if (!storage.existsSync(pointerPath)) return [];

  try {
    const raw = storage.readSync(pointerPath) ?? '';
    const parsed = JSON.parse(raw) as { squadRepos?: string[] };
    if (Array.isArray(parsed.squadRepos)) {
      return parsed.squadRepos.filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      );
    }
  } catch {
    // Malformed pointer file — ignore
  }
  return [];
}

/**
 * Load a repos.json registry from a specific squad repo clone.
 */
function loadRegistryFrom(squadRepoRoot: string): RepoRegistry | null {
  const registryPath = path.join(squadRepoRoot, REPOS_JSON);
  if (!storage.existsSync(registryPath)) return null;

  try {
    const raw = storage.readSync(registryPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      (parsed as Record<string, unknown>).version === 1 &&
      'repos' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).repos)
    ) {
      return parsed as RepoRegistry;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Look up a normalized URL across all squad repo pointers, then fall back
 * to the legacy %APPDATA% registry.
 *
 * Returns the matched entry AND the squad repo root it was found in,
 * or null if no match.
 */
export function lookupByUrlAcrossRepos(normalizedUrl: string): LocatedRegistryEntry | null {
  const lower = normalizedUrl.toLowerCase();

  // 1. Check squad repo pointers (~/.squad/squad-repos.json)
  const pointers = loadSquadRepoPointers();
  for (const repoRoot of pointers) {
    const registry = loadRegistryFrom(repoRoot);
    if (!registry) continue;

    for (const entry of registry.repos) {
      for (const pattern of entry.urlPatterns) {
        if (pattern.toLowerCase() === lower) {
          return { entry, squadRepoRoot: repoRoot };
        }
      }
    }
  }

  // 2. Fall back to legacy %APPDATA%/squad/repos.json
  const legacyRegistry = loadRepoRegistry();
  if (legacyRegistry) {
    for (const entry of legacyRegistry.repos) {
      for (const pattern of entry.urlPatterns) {
        if (pattern.toLowerCase() === lower) {
          // Legacy: squad repo root is %APPDATA%/squad (team dirs under repos/)
          let globalDir: string;
          try {
            globalDir = resolveGlobalSquadPath();
          } catch {
            continue;
          }
          return { entry, squadRepoRoot: globalDir };
        }
      }
    }
  }

  return null;
}

/**
 * Look up a repo key across all squad repo pointers, then fall back
 * to the legacy %APPDATA% registry.
 *
 * Mirrors {@link lookupByUrlAcrossRepos} but matches by `entry.key`
 * instead of URL patterns.
 */
export function lookupByKeyAcrossRepos(repoKey: string): LocatedRegistryEntry | null {
  // 1. Check squad repo pointers (~/.squad/squad-repos.json)
  const pointers = loadSquadRepoPointers();
  for (const repoRoot of pointers) {
    const registry = loadRegistryFrom(repoRoot);
    if (!registry) continue;

    const entry = registry.repos.find((r) => r.key === repoKey);
    if (entry) {
      return { entry, squadRepoRoot: repoRoot };
    }
  }

  // 2. Fall back to legacy %APPDATA%/squad/repos.json
  const legacyRegistry = loadRepoRegistry();
  if (legacyRegistry) {
    const entry = legacyRegistry.repos.find((r) => r.key === repoKey);
    if (entry) {
      let globalDir: string;
      try {
        globalDir = resolveGlobalSquadPath();
      } catch {
        return null;
      }
      return { entry, squadRepoRoot: globalDir };
    }
  }

  return null;
}

// ============================================================================
// Registry I/O
// ============================================================================

/**
 * Load the repo registry from `%APPDATA%/squad/repos.json`.
 *
 * @returns Parsed registry, or `null` if the file is missing or malformed.
 */
export function loadRepoRegistry(): RepoRegistry | null {
  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
  } catch {
    // F11: %APPDATA% unreachable — registry not available
    return null;
  }

  const registryPath = path.join(globalDir, REPOS_JSON);
  if (!storage.existsSync(registryPath)) {
    return null;
  }

  try {
    const raw = storage.readSync(registryPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      (parsed as Record<string, unknown>).version === 1 &&
      'repos' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).repos)
    ) {
      return parsed as RepoRegistry;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write the repo registry to `%APPDATA%/squad/repos.json`.
 *
 * @throws {Error} If `%APPDATA%` is unreachable or the write fails (F11).
 */
export function saveRepoRegistry(registry: RepoRegistry): void {
  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
  } catch (err) {
    throw new Error(
      `Cannot save repo registry: global config directory is unreachable. ` +
      `Check that the global squad data directory is accessible. ` +
      `Original error: ${(err as Error).message}`
    );
  }

  const registryPath = path.join(globalDir, REPOS_JSON);
  try {
    storage.writeSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  } catch (err) {
    throw new Error(
      `Failed to write repo registry at "${registryPath}": ${(err as Error).message}`
    );
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new shared squad directory and register it.
 *
 * 1. Validates the repo key.
 * 2. Creates the repos root if needed, then validates the target path (F7/F1).
 * 3. Creates the nested team directory and writes `manifest.json`.
 * 4. Registers the entry in `repos.json`.
 *
 * @param repoKey - Canonical repo key (e.g. "microsoft/os/os.2020").
 * @param urlPatterns - Normalized URL patterns for clone matching.
 * @returns Absolute path to the shared squad's team directory.
 * @throws {Error} If the key is invalid, a squad already exists, or %APPDATA% is unreachable.
 */
export function createSharedSquad(repoKey: string, urlPatterns: string[]): string {
  validateRepoKey(repoKey);

  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
  } catch (err) {
    throw new Error(
      `Cannot create shared squad: global config directory is unreachable. ` +
      `Check that the global squad data directory is accessible. ` +
      `Original error: ${(err as Error).message}`
    );
  }

  const reposRoot = path.join(globalDir, REPOS_DIR);
  const teamDir = path.join(reposRoot, ...repoKey.split('/'));

  // Ensure repos root exists so validateWritePath can resolve against it
  if (!storage.existsSync(reposRoot)) {
    storage.mkdirSync(reposRoot, { recursive: true });
  }

  // Validate target path stays inside repos root BEFORE creating nested dirs
  validateWritePath(teamDir, reposRoot);

  // Check for existing entry in registry
  let registry = loadRepoRegistry();
  if (!registry) {
    registry = { version: 1, repos: [] };
  }
  if (registry.repos.some(r => r.key === repoKey)) {
    throw new Error(`Shared squad for repo "${repoKey}" already exists.`);
  }

  // Create team directory
  storage.mkdirSync(teamDir, { recursive: true });

  // Verify with realpathSync post-creation (catches symlink/junction redirects)
  const realTeamDir = realpathSync(teamDir);
  const realReposRoot = realpathSync(reposRoot);
  if (!pathStartsWith(realTeamDir, realReposRoot + path.sep) && realTeamDir !== realReposRoot) {
    throw new Error(`Path traversal detected: team directory escapes repos root.`);
  }

  // Write manifest.json
  const now = new Date().toISOString();
  const manifest: SharedSquadManifest = {
    version: 1,
    repoKey,
    urlPatterns,
    created_at: now,
  };
  storage.writeSync(
    path.join(teamDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // Register in repos.json
  registry.repos.push({ key: repoKey, urlPatterns, created_at: now });
  saveRepoRegistry(registry);

  return teamDir;
}

/**
 * Create a shared squad inside a git-backed squad repo clone.
 *
 * Unlike `createSharedSquad` (which writes to platform app data), this
 * writes team scaffolding to `{squadRepoRoot}/{key}/` and registers the
 * entry in `{squadRepoRoot}/repos.json`. Also ensures the squad repo
 * clone is listed in `~/.squad/squad-repos.json` for auto-discovery.
 *
 * @param squadRepoRoot - Absolute path to the squad repo clone (e.g. "D:\\git\\akubly.squad").
 * @param repoKey - Canonical repo key (e.g. "microsoft/os/os.2020").
 * @param urlPatterns - Normalized URL patterns for clone matching.
 * @returns Absolute path to the shared squad's team directory.
 */
export function createSharedSquadInRepo(
  squadRepoRoot: string,
  repoKey: string,
  urlPatterns: string[],
): string {
  validateRepoKey(repoKey);

  const resolvedRoot = path.resolve(squadRepoRoot);
  const teamDir = path.join(resolvedRoot, ...repoKey.split('/'));

  // Ensure squad repo root exists
  if (!storage.existsSync(resolvedRoot)) {
    storage.mkdirSync(resolvedRoot, { recursive: true });
  }

  // Validate target path stays inside squad repo root
  validateWritePath(teamDir, resolvedRoot);

  // Check for existing entry in this repo's registry
  let registry = loadRegistryFrom(resolvedRoot);
  if (!registry) {
    registry = { version: 1, repos: [] };
  }
  if (registry.repos.some(r => r.key === repoKey)) {
    throw new Error(`Shared squad for repo "${repoKey}" already exists in ${resolvedRoot}.`);
  }

  // Create team directory
  storage.mkdirSync(teamDir, { recursive: true });

  // Verify with realpathSync post-creation
  const realTeamDir = realpathSync(teamDir);
  const realRoot = realpathSync(resolvedRoot);
  if (!pathStartsWith(realTeamDir, realRoot + path.sep) && realTeamDir !== realRoot) {
    throw new Error(`Path traversal detected: team directory escapes squad repo root.`);
  }

  // Write manifest.json
  const now = new Date().toISOString();
  const manifest: SharedSquadManifest = {
    version: 1,
    repoKey,
    urlPatterns,
    created_at: now,
  };
  storage.writeSync(
    path.join(teamDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  // Register in this repo's repos.json
  registry.repos.push({ key: repoKey, urlPatterns, created_at: now });
  const registryPath = path.join(resolvedRoot, REPOS_JSON);
  storage.writeSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

  // Ensure this squad repo clone is in ~/.squad/squad-repos.json
  addSquadRepoPointer(resolvedRoot);

  return teamDir;
}

/**
 * Add a squad repo clone path to `~/.squad/squad-repos.json`.
 * Idempotent — skips if already listed.
 *
 * @param squadRepoRoot - Absolute path to the squad repo clone.
 */
export function addSquadRepoPointer(squadRepoRoot: string): void {
  const resolvedRoot = path.resolve(squadRepoRoot);
  const squadDir = path.join(os.homedir(), '.squad');
  const pointerPath = path.join(squadDir, SQUAD_REPOS_POINTER);

  // Load existing pointers
  const existing = loadSquadRepoPointers();

  // Check if already listed (case-insensitive on Windows/macOS)
  const alreadyListed = existing.some(p =>
    CASE_INSENSITIVE
      ? p.toLowerCase() === resolvedRoot.toLowerCase()
      : p === resolvedRoot,
  );
  if (alreadyListed) return;

  // Add and save
  existing.push(resolvedRoot);
  storage.mkdirSync(squadDir, { recursive: true });
  storage.writeSync(
    pointerPath,
    JSON.stringify({ squadRepos: existing }, null, 2) + '\n',
  );
}

/**
 * Look up a repo registry entry by normalized URL.
 *
 * Performs a case-insensitive comparison of the given URL against all
 * registered URL patterns.
 *
 * @param normalizedUrl - A normalized URL to match (e.g. from `normalizeRemoteUrl().normalizedUrl`).
 * @returns The matching entry, or `null` if no match is found.
 */
export function lookupByUrl(normalizedUrl: string): RepoRegistryEntry | null {
  const registry = loadRepoRegistry();
  if (!registry) return null;

  const lower = normalizedUrl.toLowerCase();
  for (const entry of registry.repos) {
    for (const pattern of entry.urlPatterns) {
      if (pattern.toLowerCase() === lower) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Full shared squad discovery: origin URL → registry lookup → resolved paths.
 *
 * Discovery constraint (F4): only matches the `origin` remote.
 * If origin doesn't match any registered URL pattern, returns null.
 *
 * Note: This function constructs `ResolvedSquadPaths` directly. If `resolution.ts`
 * needs to call this function in the future, extract `resolveGlobalSquadPath` and
 * shared types into a cycle-free module to avoid circular imports.
 *
 * @param repoRoot - Absolute path to the git repository root.
 * @returns Resolved paths with `mode: 'shared'`, or `null` if no match.
 */
export function resolveSharedSquad(repoRoot: string): ResolvedSquadPaths | null {
  // Step 1: Get origin remote URL (F4: origin only)
  const remoteUrl = getRemoteUrl(repoRoot);
  if (!remoteUrl) return null;

  // Step 2: Normalize the URL
  const normalized = normalizeRemoteUrl(remoteUrl);

  // Step 3: Look up across squad repo pointers + legacy %APPDATA%
  const located = lookupByUrlAcrossRepos(normalized.normalizedUrl);
  if (!located) return null;

  const { entry, squadRepoRoot } = located;

  // Step 4: Derive teamDir from squad repo root + key
  // For git-backed repos: {squadRepoRoot}/{key} (files live directly in the clone)
  // For legacy %APPDATA%: {squadRepoRoot}/repos/{key}
  const isLegacyAppData = squadRepoRoot === tryResolveGlobalSquadPath();
  const teamDir = isLegacyAppData
    ? path.join(squadRepoRoot, REPOS_DIR, ...entry.key.split('/'))
    : path.join(squadRepoRoot, ...entry.key.split('/'));

  // Step 5: Validate teamDir exists
  if (!storage.existsSync(teamDir)) return null;

  // Step 6: Validate with realpathSync — ensure teamDir is under the squad repo root
  try {
    const realTeamDir = realpathSync(teamDir);
    const realRoot = realpathSync(squadRepoRoot);
    if (
      !pathStartsWith(realTeamDir, realRoot + path.sep) &&
      realTeamDir !== realRoot
    ) {
      return null;
    }
  } catch {
    return null;
  }

  // Step 7: Resolve clone-local state dir for projectDir
  const projectDir = resolveCloneStateDir(repoRoot, entry.key);

  return {
    mode: 'shared',
    projectDir,
    teamDir,
    personalDir: resolvePersonalSquadDir(),
    config: null,
    name: '.squad',
    isLegacy: false,
  };
}

/** Safe wrapper — returns null instead of throwing when global path is unreachable. */
function tryResolveGlobalSquadPath(): string | null {
  try {
    return resolveGlobalSquadPath();
  } catch {
    return null;
  }
}

/**
 * Add a URL pattern to an existing registry entry (and its manifest).
 *
 * The pattern is normalized via `normalizeRemoteUrl()` before storing to
 * ensure consistent matching.
 *
 * @param repoKey - The repo key whose entry to update.
 * @param pattern - A URL (raw or normalized) to add as a matching pattern.
 * @throws {Error} If the registry or entry doesn't exist.
 */
export function addUrlPattern(repoKey: string, pattern: string): void {
  const registry = loadRepoRegistry();
  if (!registry) {
    throw new Error('No repo registry found. Create a shared squad first.');
  }

  const entry = registry.repos.find(r => r.key === repoKey);
  if (!entry) {
    throw new Error(`Repo "${repoKey}" not found in registry.`);
  }

  // Normalize the pattern for consistent matching
  const normalizedPattern = normalizeRemoteUrl(pattern).normalizedUrl;

  if (!entry.urlPatterns.includes(normalizedPattern)) {
    entry.urlPatterns.push(normalizedPattern);
    saveRepoRegistry(registry);

    // Best-effort: update manifest.json too
    try {
      const globalDir = resolveGlobalSquadPath();
      const manifestPath = path.join(globalDir, REPOS_DIR, ...repoKey.split('/'), 'manifest.json');
      if (storage.existsSync(manifestPath)) {
        const raw = storage.readSync(manifestPath) ?? '';
        const manifest = JSON.parse(raw) as SharedSquadManifest;
        if (!manifest.urlPatterns.includes(normalizedPattern)) {
          manifest.urlPatterns.push(normalizedPattern);
          storage.writeSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }
      }
    } catch {
      // Manifest update is best-effort — registry is the source of truth for lookup
    }
  }
}
