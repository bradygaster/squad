/**
 * Plugin role discovery for the CLI — loads `<squadDir>/plugins/*\/roles/*.json`
 * into the SDK role registry so `squad roles`, `squad hire`, and `squad init`
 * see plugin-contributed roles alongside the built-ins.
 */

import { loadPluginRolesFromDir, type PluginRoleLoadSummary } from '@bradygaster/squad-sdk';
import { join } from 'node:path';
import { detectSquadDir } from './detect-squad-dir.js';

let loadedForDir: string | null = null;

/**
 * Load plugin roles for the squad directory derived from `dest`.
 *
 * Idempotent per-process: once a directory has been scanned, subsequent
 * calls for the same directory are no-ops. Pass `{ force: true }` to
 * reload (e.g. after installing a new plugin in the same shell session).
 */
export function loadPluginRolesForDest(
  dest: string,
  opts: { force?: boolean } = {},
): PluginRoleLoadSummary[] {
  const info = detectSquadDir(dest);
  const pluginsDir = join(info.path, 'plugins');
  if (!opts.force && loadedForDir === pluginsDir) return [];
  loadedForDir = pluginsDir;
  return loadPluginRolesFromDir(pluginsDir);
}
