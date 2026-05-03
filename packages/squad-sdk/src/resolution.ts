/**
 * Squad directory resolution — walk-up and global path algorithms.
 *
 * resolveSquad()            — find .squad/ by walking up from startDir to .git boundary
 * resolveSquadPaths()       — dual-root resolution (projectDir / teamDir) for remote squad mode
 * resolveGlobalSquadPath()  — platform-specific global config directory
 *
 * Dual-root resolution and remote mode design ported from @spboyer (Shayne Boyer)'s
 * PR bradygaster/squad#131. Original concept: resolveSquadPaths() with config.json
 * pointer for team identity separation.
 *
 * @module resolution
 */

import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveStateBackend, StateBackendStorageAdapter, type StateBackend, type StateBackendType } from './state-backend.js';
import type { StorageProvider } from './storage/storage-provider.js';

const storage = new FSStorageProvider();

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
  /** True when in consult mode (personal squad consulting on external project) */
  consult?: boolean;
  /** True when extraction is disabled for consult sessions (read-only consultation) */
  extractionDisabled?: boolean;
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
  /** Team identity root (agents, casting, skills) */
  teamDir: string;
  /** User's personal squad dir, null if not found or disabled */
  personalDir: string | null;
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
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Absolute path to `.squad/` or `null`.
 */
export function resolveSquad(startDir?: string): string | null {
  let current = path.resolve(startDir ?? process.cwd());

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, '.squad');

    if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
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
  let current = path.resolve(startDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of SQUAD_DIR_NAMES) {
      const candidate = path.join(current, name);
      if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
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
        consult: parsed.consult === true ? true : undefined,
        extractionDisabled: parsed.extractionDisabled === true ? true : undefined,
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
 * Check if a config represents consult mode (personal squad consulting on external project).
 */
export function isConsultMode(config: SquadDirConfig | null): boolean {
  return config?.consult === true;
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

  if (config && config.teamRoot) {
    // Remote mode: teamDir resolved relative to the project root (parent of .squad/)
    const projectRoot = path.resolve(projectDir, '..');
    const teamDir = path.resolve(projectRoot, config.teamRoot);
    return {
      mode: 'remote',
      projectDir,
      teamDir,
      personalDir: resolvePersonalSquadDir(),
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
    personalDir: resolvePersonalSquadDir(),
    config,
    name,
    isLegacy,
  };
}

/**
 * Return the platform-specific global Squad configuration directory.
 *
 * | Platform | Path                                       |
 * |----------|--------------------------------------------|
 * | Windows  | `%APPDATA%/squad/`                         |
 * | macOS    | `~/Library/Application Support/squad/`      |
 * | Linux    | `$XDG_CONFIG_HOME/squad/` (default `~/.config/squad/`) |
 *
 * The directory is created (recursively) if it does not already exist.
 *
 * @returns Absolute path to the global squad config directory.
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
    base = path.join(os.homedir(), 'Library', 'Application Support');
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
 * Resolves the user's personal squad directory.
 * Returns null if SQUAD_NO_PERSONAL is set or directory doesn't exist.
 * 
 * Platform paths:
 * - Windows: %APPDATA%/squad/personal-squad
 * - macOS: ~/Library/Application Support/squad/personal-squad
 * - Linux: $XDG_CONFIG_HOME/squad/personal-squad or ~/.config/squad/personal-squad
 */
export function resolvePersonalSquadDir(): string | null {
  if (process.env['SQUAD_NO_PERSONAL']) return null;
  
  const globalDir = resolveGlobalSquadPath();
  const personalDir = path.join(globalDir, 'personal-squad');
  
  if (!storage.existsSync(personalDir)) return null;
  return personalDir;
}

/**
 * Ensure the user's personal squad directory exists with the expected structure.
 * Creates `personal-squad/agents/` and `personal-squad/config.json` if missing.
 *
 * Idempotent — safe to call multiple times.
 *
 * @returns Absolute path to the personal squad directory.
 */
export function ensurePersonalSquadDir(): string {
  const globalDir = resolveGlobalSquadPath();
  const personalDir = path.join(globalDir, 'personal-squad');
  const agentsDir = path.join(personalDir, 'agents');

  if (!storage.existsSync(agentsDir)) {
    storage.mkdirSync(agentsDir, { recursive: true });
  }

  const configPath = path.join(personalDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    const config = { defaultModel: 'auto', ghostProtocol: true };
    storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  return personalDir;
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
 * Validates a file path is inside one of three allowed directories:
 * projectDir, teamDir, personalDir, or system temp.
 * Extends ensureSquadPathDual() for triple-root (project + team + personal).
 */
export function ensureSquadPathTriple(
  filePath: string,
  projectDir: string,
  teamDir: string,
  personalDir: string | null
): string {
  const resolved = path.resolve(filePath);
  const tmpDir = os.tmpdir();
  
  const allowed = [projectDir, teamDir, personalDir, tmpDir].filter(Boolean) as string[];
  
  for (const dir of allowed) {
    if (resolved.startsWith(path.resolve(dir) + path.sep) || resolved === path.resolve(dir)) {
      return resolved;
    }
  }
  
  throw new Error(
    `Path "${resolved}" is outside all allowed directories: ${allowed.join(', ')}`
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
 * Resolve the squad home directory — a roaming squad root for personal agents
 * and presets that follows the user across machines.
 *
 * Resolution order:
 * 1. `SQUAD_HOME` env var (explicit override, e.g. a synced folder)
 * 2. `~/.squad/` (conventional default — user's home dir)
 *
 * Unlike `resolveGlobalSquadPath()` (which returns platform-specific app config),
 * squad home is a **squad root** — it can contain `agents/`, `presets/`, etc.
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
  const stateStorage: StorageProvider = backend.name === 'local'
    ? new FSStorageProvider()
    : new StateBackendStorageAdapter(backend, paths.projectDir);

  return { paths, backend, repoRoot, storage: stateStorage };
}
