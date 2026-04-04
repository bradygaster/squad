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
import { FSStorageProvider } from './storage/fs-storage-provider.js';

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
  /** State storage backend: worktree | external | git-notes | orphan */
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
