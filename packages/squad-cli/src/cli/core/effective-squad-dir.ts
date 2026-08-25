/**
 * Effective squad directory resolution — external state aware.
 *
 * Wraps detectSquadDir() to follow the config.json stateLocation marker
 * when state has been externalized via `squad externalize`.
 *
 * @module cli/core/effective-squad-dir
 */

import path from 'node:path';
import { detectSquadDir, type SquadDirInfo } from './detect-squad-dir.js';
import {
  loadDirConfig,
  resolveExternalStateDir,
} from '@bradygaster/squad-sdk';
import { resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';

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
  /** Directory whose config declares the active state backend */
  backendConfigDir: string;
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
  const paths = resolveSquadPaths(dest);
  const teamSquadDir =
    paths?.mode === 'remote'
      ? path.join(paths.teamDir, paths.name)
      : local.path;
  return {
    local,
    stateDir: resolveStateDir(teamSquadDir),
    backendConfigDir: teamSquadDir,
  };
}
