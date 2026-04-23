/**
 * Plugin Role Loader — discovers role definitions in a plugins directory
 * and registers them with the {@link registerPluginRoles} registry.
 *
 * Convention:
 *   `<pluginsDir>/<plugin-name>/roles/*.json`
 *
 * Each JSON file may contain either a single {@link BaseRole} object or
 * an array of `BaseRole` objects. The plugin directory name is used as
 * the `plugin` attribution in the registry.
 *
 * @module roles/loader
 */

import { join } from 'node:path';
import type { BaseRole } from './types.js';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import { registerPluginRoles, type RegisterPluginRolesResult } from './registry.js';

/** Per-file load summary. */
export interface PluginRoleLoadSummary {
  /** Plugin directory name. */
  readonly plugin: string;
  /** Absolute path of the JSON file loaded. */
  readonly source: string;
  /** Registration result for the roles in this file. */
  readonly result: RegisterPluginRolesResult;
  /** Error message, if the file was malformed or registration failed. */
  readonly error?: string;
}

/**
 * Scan `pluginsDir` for plugin role definitions and register them.
 *
 * Safe to call even when `pluginsDir` does not exist — returns an empty
 * summary list.
 *
 * @param pluginsDir - Absolute path to the plugins directory
 *   (typically `<squadDir>/plugins`).
 * @param storage - Optional storage provider (defaults to filesystem).
 */
export function loadPluginRolesFromDir(
  pluginsDir: string,
  storage: StorageProvider = new FSStorageProvider(),
): PluginRoleLoadSummary[] {
  const summaries: PluginRoleLoadSummary[] = [];

  if (!storage.existsSync(pluginsDir) || !storage.isDirectorySync(pluginsDir)) {
    return summaries;
  }

  for (const plugin of storage.listSync(pluginsDir)) {
    const pluginPath = join(pluginsDir, plugin);
    if (!storage.isDirectorySync(pluginPath)) continue;

    const rolesDir = join(pluginPath, 'roles');
    if (!storage.existsSync(rolesDir) || !storage.isDirectorySync(rolesDir)) continue;

    for (const entry of storage.listSync(rolesDir)) {
      if (!entry.endsWith('.json')) continue;
      const source = join(rolesDir, entry);

      let raw: string | undefined;
      try {
        raw = storage.readSync(source);
      } catch (err) {
        summaries.push({
          plugin,
          source,
          result: { registered: [], skipped: [] },
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        summaries.push({
          plugin,
          source,
          result: { registered: [], skipped: [] },
          error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const roles = (Array.isArray(parsed) ? parsed : [parsed]) as BaseRole[];
      try {
        const result = registerPluginRoles(plugin, roles);
        summaries.push({ plugin, source, result });
      } catch (err) {
        summaries.push({
          plugin,
          source,
          result: { registered: [], skipped: [] },
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return summaries;
}
