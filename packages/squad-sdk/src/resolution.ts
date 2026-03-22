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

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
 * Walk up the directory tree from `startDir` looking for a `.squad/` directory.
 *
 * Stops at the repository root (the directory containing `.git`).
 * Returns the **absolute path** to the `.squad/` directory, or `null` if none is found.
 *
 * Handles nested repos, worktrees (`.git` file pointing elsewhere), and symlinks.
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Absolute path to `.squad/` or `null`.
 */
export function resolveSquad(startDir?: string): string | null {
  let current = path.resolve(startDir ?? process.cwd());

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, '.squad');

    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }

    // Stop if we hit a .git boundary (directory or worktree file)
    const gitMarker = path.join(current, '.git');
    if (fs.existsSync(gitMarker)) {
      // We've reached the repo root — don't walk higher
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
 * Returns the absolute path, the directory name used, and whether it's legacy.
 */
function findSquadDir(startDir: string): { dir: string; name: '.squad' | '.ai-team' } | null {
  let current = path.resolve(startDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of SQUAD_DIR_NAMES) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return { dir: candidate, name };
      }
    }

    // Stop if we hit a .git boundary
    const gitMarker = path.join(current, '.git');
    if (fs.existsSync(gitMarker)) {
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
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
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

  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
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
  
  if (!fs.existsSync(personalDir)) return null;
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
