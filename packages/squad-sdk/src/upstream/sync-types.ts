/**
 * Types for bidirectional upstream sync + auto-propagation.
 *
 * Phase 1: Auto-sync (parent → child) — watch & poll for upstream changes.
 * Phase 2: Bidirectional (child → parent) — propose child changes upstream.
 *
 * @module upstream/sync-types
 */

/** Configuration for upstream watch/auto-sync behaviour. */
export interface UpstreamSyncConfig {
  /** Polling interval in seconds (default: 600). */
  interval: number;
  /** Automatically create a PR when changes are detected. */
  autoPr: boolean;
  /** Branch name prefix for sync branches (default: "squad/upstream-sync"). */
  branchPrefix: string;
}

/** Result of checking a single upstream for changes. */
export interface UpstreamChangeDetection {
  /** Name of the upstream source. */
  name: string;
  /** Whether changes were detected. */
  hasChanges: boolean;
  /** List of changed file paths (relative to .squad/). */
  changedFiles: string[];
  /** New commit SHA (for git upstreams), or null. */
  newSha: string | null;
  /** Previous commit SHA (for git upstreams), or null. */
  previousSha: string | null;
}

/** Result of a single watch poll cycle. */
export interface WatchCycleResult {
  /** Timestamp of this cycle. */
  timestamp: string;
  /** Per-upstream change detection results. */
  detections: UpstreamChangeDetection[];
  /** Whether any upstream had changes. */
  hasAnyChanges: boolean;
}

/** Scope control for what a child can propose upstream. */
export interface UpstreamProposeScope {
  /** Allow proposing skills. */
  skills: boolean;
  /** Allow proposing decisions. */
  decisions: boolean;
  /** Allow proposing governance (routing, casting). */
  governance: boolean;
}

/** Configuration for upstream propose (child → parent). */
export interface UpstreamProposeConfig {
  /** Scope control — what the child is allowed to propose. */
  scope: UpstreamProposeScope;
  /** Default target branch on the parent repo (default: "main"). */
  targetBranch: string;
  /** Branch name prefix for proposal branches (default: "squad/child-propose"). */
  branchPrefix: string;
}

/** Result of packaging a proposal. */
export interface ProposePackage {
  /** Name of the upstream target. */
  upstreamName: string;
  /** Branch name created for the proposal. */
  branchName: string;
  /** Files included in the proposal. */
  files: Array<{ path: string; content: string }>;
  /** Human-readable summary of what's being proposed. */
  summary: string;
}

/** Default sync configuration values. */
export const DEFAULT_SYNC_CONFIG: UpstreamSyncConfig = {
  interval: 600,
  autoPr: false,
  branchPrefix: 'squad/upstream-sync',
};

/** Default propose configuration values. */
export const DEFAULT_PROPOSE_CONFIG: UpstreamProposeConfig = {
  scope: { skills: true, decisions: true, governance: false },
  targetBranch: 'main',
  branchPrefix: 'squad/child-propose',
};
