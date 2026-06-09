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

/**
 * Resolves a user-supplied query to a registry entry.
 *
 * Resolution order (all comparisons are case-insensitive on platforms where
 * CASE_INSENSITIVE is true):
 *
 *   a. Exact name match. Returns { match } for a unique hit; { ambiguous }
 *      when multiple entries share the same name.
 *   b. Exact path match via samePath on the resolved absolute paths.
 *      Returns { match } when exactly one entry matches.
 *   c. Unique case-insensitive substring match on name. Returns { match }
 *      for one hit, { ambiguous } for several.
 *   d. Falls back to { notFound: true }.
 *
 * An empty query (after trimming) always returns { notFound: true }.
 *
 * @param query - A project name, partial name, or path to search for.
 */
export function resolveProject(
  query: string,
): { match: ProjectRegistryEntry } | { ambiguous: ProjectRegistryEntry[] } | { notFound: true } {
  const trimmed = query.trim();
  if (!trimmed) return { notFound: true };

  const entries = readProjectsRegistry();

  const nameEq = (a: string, b: string): boolean =>
    CASE_INSENSITIVE ? a.toLowerCase() === b.toLowerCase() : a === b;

  // a. Exact name match
  const exactName = entries.filter(e => nameEq(e.name, trimmed));
  if (exactName.length === 1) return { match: exactName[0]! };
  if (exactName.length > 1) return { ambiguous: exactName };

  // b. Exact path match
  const resolvedQuery = path.resolve(trimmed);
  const exactPath = entries.filter(e => samePath(path.resolve(e.path), resolvedQuery));
  if (exactPath.length === 1) return { match: exactPath[0]! };

  // c. Substring match on name
  const lowerQuery = trimmed.toLowerCase();
  const substringMatches = entries.filter(e => e.name.toLowerCase().includes(lowerQuery));
  if (substringMatches.length === 1) return { match: substringMatches[0]! };
  if (substringMatches.length > 1) return { ambiguous: substringMatches };

  return { notFound: true };
}
