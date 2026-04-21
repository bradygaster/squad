/**
 * Resolution base — shared primitives for resolution.ts and shared-squad.ts.
 *
 * This module exists to break the circular dependency between resolution.ts
 * and shared-squad.ts. It contains functions and types that both modules need
 * but that have no dependencies on either module.
 *
 * @module resolution-base
 */

import path from 'node:path';
import os from 'node:os';
import { FSStorageProvider } from './storage/fs-storage-provider.js';

const storage = new FSStorageProvider();

// ============================================================================
// Case-insensitive path comparison
// ============================================================================

/**
 * Whether the current platform uses case-insensitive path comparison.
 * True on Windows and macOS (default HFS+/APFS). Set SQUAD_CASE_SENSITIVE=1
 * to override on case-sensitive macOS APFS configurations.
 */
export const CASE_INSENSITIVE =
  !process.env['SQUAD_CASE_SENSITIVE'] &&
  (process.platform === 'win32' || process.platform === 'darwin');

/**
 * Check if `fullPath` starts with `prefix`, respecting platform case sensitivity.
 */
export function pathStartsWith(fullPath: string, prefix: string): boolean {
  if (CASE_INSENSITIVE) {
    return fullPath.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return fullPath.startsWith(prefix);
}

// ============================================================================
// Types
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
}

/**
 * Resolved paths for dual-root squad mode.
 *
 * In **local** mode, projectDir and teamDir point to the same `.squad/` directory.
 * In **remote** mode, config.json specifies a `teamRoot` that resolves to a
 * separate directory for team identity (agents, casting, skills).
 * In **shared** mode, the squad is discovered via origin remote URL lookup in
 * `repos.json`. teamDir lives under the global app data directory's
 * `squad/repos/{key}/` and projectDir is a clone-local state dir under the
 * local app data directory (see `resolveLocalSquadBase()`). The clone
 * working tree is never modified.
 */
export interface ResolvedSquadPaths {
  mode: 'local' | 'remote' | 'shared';
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

// ============================================================================
// Global path resolution
// ============================================================================

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
  // SQUAD_APPDATA_OVERRIDE: escape hatch for offline roaming profiles (F11).
  // When %APPDATA% is unreachable (e.g. network share down), users can point
  // all global squad storage at an accessible local path.
  const appdataOverride = process.env['SQUAD_APPDATA_OVERRIDE'];
  if (appdataOverride) {
    const globalDir = path.join(appdataOverride, 'squad');
    if (!storage.existsSync(globalDir)) {
      storage.mkdirSync(globalDir, { recursive: true });
    }
    return globalDir;
  }

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
