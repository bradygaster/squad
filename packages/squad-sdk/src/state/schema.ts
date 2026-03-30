/**
 * State Module — Storage Layout Schema
 *
 * Maps collection names to their `.squad/` file paths.
 * Single-entity collections use a static string; multi-entity
 * collections use a function that derives the path from an entity id.
 */

import type { CollectionName } from './collection-map.js';

/** Either a static path or a function deriving a path from an entity id. */
export type CollectionPathResolver = string | ((id: string) => string);

// ── Collection → Path Mapping ──────────────────────────────────────────────

/**
 * Canonical mapping from collection names to `.squad/` relative paths.
 *
 * Static paths point to a single file (e.g. `decisions.md`).
 * Function paths resolve per-entity directories (e.g. `agents/<name>`).
 */
export const COLLECTION_PATHS: Record<CollectionName, CollectionPathResolver> = {
  agents: (id: string) => `.squad/agents/${id}`,
  decisions: '.squad/decisions.md',
  routing: '.squad/routing.md',
  team: '.squad/team.md',
  skills: (id: string) => `.squad/skills/${id}`,
  templates: (id: string) => `.squad/templates/${id}`,
  log: '.squad/log',
  config: '.squad/config.json',
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the storage path for a collection, optionally with an entity id.
 *
 * @throws {Error} if the collection requires an id but none was provided.
 */
export function resolveCollectionPath(collection: CollectionName, id?: string): string {
  const resolver = COLLECTION_PATHS[collection];
  if (typeof resolver === 'function') {
    if (!id) {
      throw new Error(`Collection "${collection}" requires an entity id to resolve its path`);
    }
    return resolver(id);
  }
  return resolver;
}
