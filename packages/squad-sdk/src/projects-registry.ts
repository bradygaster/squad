/**
 * Global project registry.
 *
 * Records every repository where `squad init` runs so a user can later list all
 * of their Squad projects and where each one lives on disk. This is purely
 * additive metadata: it never changes how a project is initialized or how its
 * own `.squad/` state behaves.
 *
 * The registry is a single JSON file, `projects.json`, stored under
 * {@link resolveGlobalSquadPath} (a sibling of the existing personal-squad and
 * externalized-state directories).
 *
 * @module projects-registry
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveGlobalSquadPath } from './resolution.js';

/** A single entry in the global project registry. */
export interface ProjectRegistryEntry {
  /** Display name of the project (directory basename at init time). */
  name: string;
  /** Absolute path to the project root. */
  path: string;
  /** ISO 8601 timestamp of when the project was first registered. */
  created_at: string;
}

function registryFilePath(): string {
  return path.join(resolveGlobalSquadPath(), 'projects.json');
}

/**
 * Windows and macOS use case-insensitive filesystems, so the same project can
 * be reached via paths that differ only in case (e.g. a lowercased drive
 * letter). Compare paths accordingly so re-registering never duplicates an
 * entry. Mirrors the convention used by FSStorageProvider.
 */
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function samePath(a: string, b: string): boolean {
  return CASE_INSENSITIVE ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Reads the global project registry.
 *
 * Returns an empty array if the registry does not exist yet or cannot be
 * parsed, so callers never have to guard against a missing or corrupt file.
 */
export function readProjectsRegistry(): ProjectRegistryEntry[] {
  const file = registryFilePath();
  try {
    if (!fs.existsSync(file)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ProjectRegistryEntry =>
        !!e &&
        typeof (e as ProjectRegistryEntry).name === 'string' &&
        typeof (e as ProjectRegistryEntry).path === 'string' &&
        typeof (e as ProjectRegistryEntry).created_at === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Registers a project in the global registry.
 *
 * Idempotent: re-running for an already-registered path updates that entry in
 * place (refreshing the name) rather than adding a duplicate. The original
 * `created_at` is preserved. This is a best-effort write; callers that run it
 * during initialization should wrap it so a failure here cannot block init.
 *
 * @param name - Display name for the project.
 * @param projectPath - Path to the project root (resolved to absolute).
 */
export function registerProject(name: string, projectPath: string): void {
  const file = registryFilePath();
  const absPath = path.resolve(projectPath);
  const entries = readProjectsRegistry();

  const existing = entries.find(e => samePath(path.resolve(e.path), absPath));
  if (existing) {
    existing.name = name;
    existing.path = absPath;
  } else {
    entries.push({ name, path: absPath, created_at: new Date().toISOString() });
  }

  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}
