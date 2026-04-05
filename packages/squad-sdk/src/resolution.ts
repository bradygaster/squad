/**
 * Squad directory resolution — walk-up and global path algorithms.
 *
 * resolveSquadInDir()       — find .squad/ by walking up from startDir to .git boundary
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
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { Trace } from 'vscode-jsonrpc';

const storage = new FSStorageProvider();

function traceLine(trace: ResolutionTracer | undefined, method: string, message: string): void {
  trace?.(`[${method}] ${message}`);
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
  /** True when in consult mode (personal squad consulting on external project) */
  consult?: boolean;
  /** True when extraction is disabled for consult sessions (read-only consultation) */
  extractionDisabled?: boolean;
  /** Where state is stored: 'external' when moved out of the working tree */
  stateLocation?: string;
  /** State storage backend: worktree | external | git-notes | orphan */
  stateBackend?: string;
  /**
   * Optional override for the external-state root folder.
   * When `stateBackend` is `external`, Squad stores state under
   * `{externalStateRoot}/{projectKey}/` instead of the default
   * `{resolveGlobalSquadPath()}/projects/{projectKey}/`.
   */
  externalStateRoot?: string;
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
function getMainWorktreePath(
  worktreeDir: string,
  gitFilePath: string,
  trace?: ResolutionTracer,
): string | null {
  try {
    traceLine(trace, 'getMainWorktreePath', `reading ${gitFilePath}`);
    const content = (storage.readSync(gitFilePath) ?? '').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match || !match[1]) {
      traceLine(trace, 'getMainWorktreePath', 'no gitdir pointer found in worktree file');
      return null;
    }
    const worktreeGitDir = path.resolve(worktreeDir, match[1].trim());
    const mainGitDir = path.resolve(worktreeGitDir, '..', '..');
    const mainCheckout = path.dirname(mainGitDir);
    traceLine(trace, 'getMainWorktreePath', `resolved worktree git dir to ${worktreeGitDir}`);
    traceLine(trace, 'getMainWorktreePath', `candidate main checkout is ${mainCheckout}`);
    if (!storage.existsSync(mainGitDir) || !storage.isDirectorySync(mainGitDir)) {
      traceLine(trace, 'getMainWorktreePath', `missing main git dir ${mainGitDir}`);
      return null;
    }
    traceLine(trace, 'getMainWorktreePath', `verified main git dir ${mainGitDir}`);
    return mainCheckout;
  } catch {
    traceLine(trace, 'getMainWorktreePath', 'failed to resolve main checkout from worktree file');
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
 * **Note:** In external-state mode, this still returns the in-repo `.squad/` path.
 * That directory serves as a marker (containing only `config.json`) — the actual
 * state directory is resolved by `resolveSquadPaths()` via `resolveExternalStateDir()`.
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @param trace - Optional callback for detailed resolution tracing.
 * @returns Absolute path to `.squad/` or `null`.
 */
export type ResolutionTracer = (line: string) => void;

export function resolveSquadInDir(
  startDir: string = process.cwd(),
  trace?: ResolutionTracer,
): string | null {
  // Intentionally returns the in-repo .squad/ marker directory, even when state
  // is externalized. Callers needing the actual state dir should use resolveSquadPaths().
  let current = path.resolve(startDir);
  trace?.(`[resolveSquadInDir] start: ${current}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, '.squad');
    trace?.(`[resolveSquadInDir] checked ${candidate}`);

    if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
      trace?.(`[resolveSquadInDir] found ${candidate}`);
      return candidate;
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        trace?.(`[resolveSquadInDir] hit repo boundary at ${gitMarker}; stopping`);
        return null;
      }

      trace?.(`[resolveSquadInDir] found worktree pointer at ${gitMarker}`);
      const mainCheckout = getMainWorktreePath(current, gitMarker);
      if (mainCheckout) {
        trace?.(`[resolveSquadInDir] resolved main checkout to ${mainCheckout}`);
        const mainCandidate = path.join(mainCheckout, '.squad');
        trace?.(`[resolveSquadInDir] checked fallback ${mainCandidate}`);
        if (storage.existsSync(mainCandidate) && storage.isDirectorySync(mainCandidate)) {
          trace?.(`[resolveSquadInDir] found fallback ${mainCandidate}`);
          return mainCandidate;
        }
      } else {
        trace?.('[resolveSquadInDir] could not resolve a main checkout from the worktree pointer');
      }

      trace?.('[resolveSquadInDir] no squad directory found from worktree fallback');
      return null;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      trace?.(`[resolveSquadInDir] reached filesystem root at ${current}; no .squad found`);
      return null;
    }

    trace?.(`[resolveSquadInDir] moving up to ${parent}`);
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
function findSquadDir(
  startDir: string,
  trace?: ResolutionTracer,
): { dir: string; name: '.squad' | '.ai-team' } | null {
  let current = path.resolve(startDir);
  traceLine(trace, 'findSquadDir', `start: ${current}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of SQUAD_DIR_NAMES) {
      const candidate = path.join(current, name);
      traceLine(trace, 'findSquadDir', `checked ${candidate}`);
      if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
        traceLine(trace, 'findSquadDir', `found ${candidate}`);
        return { dir: candidate, name };
      }
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        traceLine(trace, 'findSquadDir', `hit repo boundary at ${gitMarker}; stopping`);
        return null;
      }
      traceLine(trace, 'findSquadDir', `found worktree pointer at ${gitMarker}`);
      const mainCheckout = getMainWorktreePath(current, gitMarker, trace);
      if (mainCheckout) {
        for (const name of SQUAD_DIR_NAMES) {
          const candidate = path.join(mainCheckout, name);
          traceLine(trace, 'findSquadDir', `checked fallback ${candidate}`);
          if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
            traceLine(trace, 'findSquadDir', `found fallback ${candidate}`);
            return { dir: candidate, name };
          }
        }
      }
      traceLine(trace, 'findSquadDir', 'no squad directory found from worktree fallback');
      return null;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      traceLine(trace, 'findSquadDir', `reached filesystem root at ${current}`);
      return null;
    }
    traceLine(trace, 'findSquadDir', `moving up to ${parent}`);
    current = parent;
  }
}

/**
 * Try to read and parse `.squad/config.json` (or `.ai-team/config.json`).
 * Returns null for missing file, unreadable file, or malformed JSON.
 */
export function loadDirConfig(squadDir: string, trace?: ResolutionTracer): SquadDirConfig | null {
  const configPath = path.join(squadDir, 'config.json');
  traceLine(trace, 'loadDirConfig', `checking ${configPath}`);
  if (!storage.existsSync(configPath)) {
    traceLine(trace, 'loadDirConfig', 'config.json not found');
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
      const config = {
        version: parsed.version,
        teamRoot: parsed.teamRoot,
        projectKey: typeof parsed.projectKey === 'string' ? parsed.projectKey : null,
        consult: parsed.consult === true ? true : undefined,
        extractionDisabled: parsed.extractionDisabled === true ? true : undefined,
        stateBackend: typeof parsed.stateBackend === 'string'
          ? parsed.stateBackend
          : parsed.stateLocation === 'external'
            ? 'external'
            : undefined,
        externalStateRoot: typeof parsed.externalStateRoot === 'string' && parsed.externalStateRoot.trim()
          ? parsed.externalStateRoot
          : undefined,
      } satisfies SquadDirConfig;
      traceLine(trace, 'loadDirConfig', `parsed ${JSON.stringify(config)}`);
      return config;
    }
    traceLine(trace, 'loadDirConfig', 'config.json did not match the expected schema');
    return null;
  } catch {
    traceLine(trace, 'loadDirConfig', 'failed to parse config.json as JSON');
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
export function resolveSquadPaths(
  startDir: string = process.cwd(),
  trace?: ResolutionTracer,
): ResolvedSquadPaths | null {

  const resolvedStart = path.resolve(startDir);
  traceLine(trace, 'resolveSquadPaths', `start: ${resolvedStart}`);
  const resolved = findSquadDir(resolvedStart, trace);

  if (!resolved) {
    traceLine(trace, 'resolveSquadPaths', 'no squad directory found');
    return null;
  }

  const { dir: projectDir, name } = resolved;
  const isLegacy = name === '.ai-team';
  const config = loadDirConfig(projectDir, trace);
  traceLine(trace, 'resolveSquadPaths', `marker directory=${projectDir}, legacy=${isLegacy}`);

  if (config && config.stateBackend === 'external') {
    const projectRoot = path.resolve(projectDir, '..');
    const projectKey = config.projectKey || deriveProjectKey(projectRoot, trace);
    const externalRoot = config.externalStateRoot
      ? path.resolve(projectRoot, config.externalStateRoot)
      : undefined;
    traceLine(trace, 'resolveSquadPaths', `stateBackend=external, projectKey=${projectKey}`);
    if (externalRoot) {
      traceLine(trace, 'resolveSquadPaths', `externalStateRoot=${externalRoot}`);
    }
    const externalDir = resolveExternalStateDir(projectKey, true, externalRoot, trace);
    const personalDir = resolvePersonalSquadDir(trace);
    traceLine(trace, 'resolveSquadPaths', `resolved external projectDir/teamDir=${externalDir}`);
    return {
      mode: 'remote',
      projectDir: externalDir,
      teamDir: externalDir,
      personalDir,
      config,
      name,
      isLegacy,
    };
  }

  if (config && config.teamRoot) {
    const projectRoot = path.resolve(projectDir, '..');
    const teamDir = path.resolve(projectRoot, config.teamRoot);
    const personalDir = resolvePersonalSquadDir(trace);
    traceLine(trace, 'resolveSquadPaths', `teamRoot=${config.teamRoot} -> teamDir=${teamDir}`);
    return {
      mode: 'remote',
      projectDir,
      teamDir,
      personalDir,
      config,
      name,
      isLegacy,
    };
  }

  const personalDir = resolvePersonalSquadDir(trace);
  traceLine(trace, 'resolveSquadPaths', 'no remote config detected -> local mode');
  return {
    mode: 'local',
    projectDir,
    teamDir: projectDir,
    personalDir,
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
export function resolveGlobalSquadPath(trace?: ResolutionTracer): string {
  const platform = process.platform;
  let base: string;
  traceLine(trace, 'resolveGlobalSquadPath', `platform=${platform}`);

  if (platform === 'win32') {
    traceLine(trace, 'resolveGlobalSquadPath', `APPDATA=${process.env['APPDATA'] ?? '(unset)'}`);
    traceLine(trace, 'resolveGlobalSquadPath', `LOCALAPPDATA=${process.env['LOCALAPPDATA'] ?? '(unset)'}`);
    base = process.env['APPDATA']
      ?? process.env['LOCALAPPDATA']
      ?? path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    traceLine(trace, 'resolveGlobalSquadPath', `HOME=${process.env['HOME'] ?? '(unset)'}`);
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    traceLine(trace, 'resolveGlobalSquadPath', `XDG_CONFIG_HOME=${process.env['XDG_CONFIG_HOME'] ?? '(unset)'}`);
    traceLine(trace, 'resolveGlobalSquadPath', `HOME=${process.env['HOME'] ?? '(unset)'}`);
    base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
  }

  traceLine(trace, 'resolveGlobalSquadPath', `base config dir=${base}`);
  const globalDir = path.join(base, 'squad');

  if (!storage.existsSync(globalDir)) {
    traceLine(trace, 'resolveGlobalSquadPath', `creating ${globalDir}`);
    storage.mkdirSync(globalDir, { recursive: true });
  } else {
    traceLine(trace, 'resolveGlobalSquadPath', `using existing ${globalDir}`);
  }

  traceLine(trace, 'resolveGlobalSquadPath', `returning ${globalDir}`);
  return globalDir;
}

/**
 * Resolve the external state directory for a project.
 *
 * External state lives under the global squad config:
 * `{globalSquadDir}/projects/{projectKey}/`
 *
 * Returns `{globalDir}/projects/{sanitizedKey}/` where `globalDir` is the
 * platform-specific global config directory (e.g., `%APPDATA%/squad` on Windows,
 * `~/Library/Application Support/squad` on macOS, `$XDG_CONFIG_HOME/squad` or
 * `~/.config/squad` on Linux).
 *
 * @param projectKey - Unique project identifier (slug). Falls back to repo basename.
 * @param create - Whether to create the directory if missing (default: true).
 * @param externalStateRoot - Optional override for the base external-state folder.
 * @returns Absolute path to the external state directory.
 * @throws If projectKey is empty or contains path traversal sequences.
 */
export function resolveExternalStateDir(
  projectKey: string,
  create: boolean = true,
  externalStateRoot?: string,
  trace?: ResolutionTracer,
): string {

   traceLine(trace, 'resolveExternalStateDir', `projectKey=${projectKey}, create=${create}, externalStateRoot=${externalStateRoot ?? '(default)'}`);  

  if (!projectKey || projectKey.includes('..')) {
      traceLine(trace, 'resolveExternalStateDir', 'invalid project key');
    throw new Error('Invalid project key');
  }


  // Sanitize: replace path separators and unsafe chars with dashes
  const sanitized = projectKey
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');
  traceLine(trace, 'resolveExternalStateDir', `sanitized projectKey=${sanitized}`);

  if (!sanitized) {
    traceLine(trace, 'resolveExternalStateDir', 'invalid project key after sanitization');
    throw new Error('Invalid project key');
  }

  // Determine the root for external state: either the override from config or the default global path
  const stateRoot = externalStateRoot && externalStateRoot.trim()
    ? path.resolve(externalStateRoot)
    : path.join(resolveGlobalSquadPath(trace), 'projects');
  traceLine(trace, 'resolveExternalStateDir', `projects root=${stateRoot}`);
  
  const projectsDir = path.join(stateRoot,sanitized);
  traceLine(trace, 'resolveExternalStateDir', `candidate project state dir=${projectsDir}`);

  if (create && !storage.existsSync(projectsDir)) {
    traceLine(trace, 'resolveExternalStateDir', `creating ${projectsDir}`);
    storage.mkdirSync(projectsDir, { recursive: true });
  }

  traceLine(trace, 'resolveExternalStateDir', `returning ${projectsDir}`);
  return projectsDir;
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
 * @param 
 * @returns A sanitized, lowercase project key suitable for use as a directory name.
 */

export function deriveProjectKey(projectDir: string, trace?: ResolutionTracer): string {
  traceLine(trace, 'deriveProjectKey', `projectDir=${projectDir}`);

  const normalized = projectDir.replace(/\\/g, '/');
  traceLine(trace, 'deriveProjectKey', `normalized projectDir=${normalized}`);

  const base = path.basename(normalized);
  traceLine(trace, 'deriveProjectKey', `basename=${base}`);

  
  if (!base) {
    traceLine(trace, 'deriveProjectKey', 'basename is empty; returning unknown-project');
    return 'unknown-project';
  }

  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');
  traceLine(trace, 'deriveProjectKey', `sanitized projectKey=${sanitized}`);

  return sanitized || 'unknown-project';
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
export function resolvePersonalSquadDir(trace?: ResolutionTracer): string | null {
  if (process.env['SQUAD_NO_PERSONAL']) {
    traceLine(trace, 'resolvePersonalSquadDir', 'SQUAD_NO_PERSONAL is set; returning null');
    return null;
  }

  const globalDir = resolveGlobalSquadPath(trace);
  const personalDir = path.join(globalDir, 'personal-squad');
  traceLine(trace, 'resolvePersonalSquadDir', `candidate personal dir=${personalDir}`);

  if (!storage.existsSync(personalDir)) {
    traceLine(trace, 'resolvePersonalSquadDir', 'personal squad directory does not exist');
    return null;
  }
  traceLine(trace, 'resolvePersonalSquadDir', `returning ${personalDir}`);
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
 * @param squadRoot - Absolute path to the `.squad/` directory (e.g. from `resolveSquadInDir()`).
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



