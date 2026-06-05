/**
 * Effective squad directory resolution — external state aware.
 *
 * Wraps detectSquadDir() to follow the config.json stateLocation marker
 * when state has been externalized via `squad externalize`.
 *
 * @module cli/core/effective-squad-dir
 */

import { detectSquadDir, type SquadDirInfo } from './detect-squad-dir.js';
import { loadDirConfig, resolveExternalStateDir } from '@bradygaster/squad-sdk';

/**
 * Resolve the effective state directory from a local .squad/ path.
 *
 * If `.squad/config.json` has `stateLocation: 'external'` and a valid
 * `projectKey`, returns the external state directory. Otherwise returns
 * the original `squadDirPath` unchanged.
 */
export function resolveStateDir(squadDirPath: string): string {
  const config = loadDirConfig(squadDirPath);
  if (config?.stateLocation === 'external' && config.projectKey) {
    return resolveExternalStateDir(config.projectKey, false);
  }
  return squadDirPath;
}

export interface EffectiveSquadDirs {
  /** The local .squad/ directory info (for config.json and non-state files) */
  local: SquadDirInfo;
  /** The effective state directory (external dir when externalized, otherwise local .squad/) */
  stateDir: string;
}

/**
 * Detect the squad directory and resolve the effective state dir.
 *
 * Combines detectSquadDir() (zero-dependency bootstrap) with external
 * state resolution from config.json. Use `stateDir` for reading state
 * files (team.md, routing.md, agents/, plugins/, etc.) and `local.path`
 * for non-state files that remain in the working tree.
 */
export function effectiveSquadDir(dest: string): EffectiveSquadDirs {
  const local = detectSquadDir(dest);
  return { local, stateDir: resolveStateDir(local.path) };
}
