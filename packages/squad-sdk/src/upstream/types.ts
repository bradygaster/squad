/**
 * Upstream types — configuration and resolved state for upstream Squad sources.
 *
 * An upstream is another Squad repo (org-level, team-level, or any repo with .squad/)
 * whose context (skills, decisions, wisdom, casting policy, routing) is read from
 * locally materialized files at session start. Session start never fetches:
 * `squad upstream sync` is the only network step.
 *
 * @module upstream/types
 */

/** Source type for an upstream Squad repo. */
export type UpstreamType = 'local' | 'git' | 'export';

/** A declared upstream source from upstream.json. */
export interface UpstreamSource {
  /** Display name for this upstream (e.g., "org", "team-platform"). */
  name: string;
  /** How to access this upstream. */
  type: UpstreamType;
  /** Path, URL, or export file location. */
  source: string;
  /** Git ref to use (only for type: "git"). */
  ref?: string;
  /** ISO timestamp of when this upstream was added. */
  added_at: string;
  /** ISO timestamp of last successful sync/validation. */
  last_synced: string | null;
}

/** The upstream.json config file format. */
export interface UpstreamConfig {
  upstreams: UpstreamSource[];
}

/**
 * Resolution status of one upstream.
 *
 * - `ok` — materialized locally and read.
 * - `stale` — read, but `last_synced` is missing or older than the stale window (git only).
 * - `missing` — declared local path / export file does not exist.
 * - `unavailable` — git upstream has no local clone yet (`squad upstream sync` materializes it;
 *   session start never fetches).
 * - `invalid` — malformed `upstream.json` entry or unparsable export file.
 * - `cycle` — the upstream resolves to a squad directory already on the inheritance chain.
 * - `depth-exceeded` — declared deeper than the configured depth limit; not read.
 */
export type UpstreamStatus =
  | 'ok'
  | 'stale'
  | 'missing'
  | 'unavailable'
  | 'invalid'
  | 'cycle'
  | 'depth-exceeded';

/** Resolved content from a single upstream source. */
export interface ResolvedUpstream {
  /** Name from the config. */
  name: string;
  /** Source type. */
  type: UpstreamType;
  /** Provenance tag attached to every inherited item: `upstream:<name>@<ref>`. */
  provenance: string;
  /** Declared source (path, URL, or export file) as written in `upstream.json`. */
  origin: string;
  /** Git ref (git upstreams only). */
  ref?: string;
  /** 1 for upstreams declared by the local squad, 2 for their upstreams, and so on. */
  depth: number;
  /** Names of the upstreams this one was reached through (empty for direct upstreams). */
  via: string[];
  /** Resolution outcome. Content is only read for `ok` and `stale`. */
  status: UpstreamStatus;
  /** Human-readable diagnostic for non-`ok` statuses; null when healthy. */
  diagnostic: string | null;
  /** Local squad directory the content was read from, or null when nothing was read. */
  squadDir: string | null;
  /** `last_synced` from the config entry. */
  lastSynced: string | null;
  /** Skills found in this upstream. */
  skills: Array<{ name: string; content: string }>;
  /** Decisions markdown content, or null if not found. */
  decisions: string | null;
  /** Wisdom markdown content, or null if not found. */
  wisdom: string | null;
  /** Casting policy object, or null if not found. */
  castingPolicy: Record<string, unknown> | null;
  /** Routing markdown content, or null if not found. */
  routing: string | null;
}

/** Result of resolving all upstreams for a squad directory. */
export interface UpstreamResolution {
  /**
   * Upstreams in precedence order: declared order, each followed by its own upstreams
   * (depth-first). The local `.squad/` always wins over every entry here.
   */
  upstreams: ResolvedUpstream[];
  /** Diagnostics for every upstream that is not `ok`, in precedence order. */
  diagnostics: string[];
  /** Depth limit that was applied. */
  maxDepth: number;
}

/** Options for {@link resolveUpstreams}. */
export interface ResolveUpstreamsOptions {
  /** Maximum inheritance depth (direct upstreams are depth 1). Default 3. */
  maxDepth?: number;
  /** Days after which a synced git clone is reported `stale`. Default 30. */
  staleAfterDays?: number;
  /** Clock used for staleness (tests). */
  now?: Date;
}

/** One inherited skill with provenance and precedence outcome. */
export interface InheritedSkill {
  name: string;
  content: string;
  provenance: string;
  /** `local` when the project's own skill wins, or the provenance of an earlier upstream. */
  overriddenBy: string | null;
}

/** One inherited document (decisions, routing, wisdom) with provenance. */
export interface InheritedDocument {
  provenance: string;
  content: string;
}

/**
 * Merged view of what the local squad inherits, after precedence is applied.
 * Local `.squad/` content is never included: it always wins and is already in context.
 */
export interface EffectiveUpstreamContext {
  skills: InheritedSkill[];
  decisions: InheritedDocument[];
  routing: InheritedDocument[];
  wisdom: InheritedDocument[];
  /** First casting policy in precedence order (local policy wins when present). */
  castingPolicy: { provenance: string; policy: Record<string, unknown> } | null;
}
