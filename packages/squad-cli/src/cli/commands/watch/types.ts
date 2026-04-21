/**
 * Watch capability plugin types.
 *
 * Every opt-in watch feature implements {@link WatchCapability} so the
 * main loop stays thin and each feature is testable in isolation.
 */

import type { PlatformAdapter, WorkItem, PullRequest } from '@bradygaster/squad-sdk/platform';

/** Phase within a single watch round. */
export type WatchPhase = 'pre-scan' | 'post-triage' | 'post-execute' | 'housekeeping';

/**
 * Shared data fetched ONCE at round start and passed to every capability.
 *
 * Avoids redundant API calls — each capability filters this data instead
 * of making its own `listWorkItems()` call.
 *
 * @see https://github.com/bradygaster/squad/issues/923
 */
export interface RoundData {
  /** All open squad-labelled work items, fetched once with a generous limit. */
  issues: WorkItem[];
  /** All open pull requests, fetched once. */
  pullRequests: PullRequest[];
  /** When this data was fetched. */
  fetchedAt: Date;
}

/** Result of a capability preflight check. */
export interface PreflightResult {
  ok: boolean;
  /** Why this capability cannot run (e.g., "gh project CLI not authenticated"). */
  reason?: string;
}

/** Result of a single capability execution within a round. */
export interface CapabilityResult {
  success: boolean;
  /** One-line human summary displayed in the round report. */
  summary: string;
  /** Optional structured data for other capabilities. */
  data?: Record<string, unknown>;
}

/** Runtime context passed to every capability during each round. */
export interface WatchContext {
  teamRoot: string;
  adapter: PlatformAdapter;
  round: number;
  roster: Array<{ name: string; label: string; expertise: string[] }>;
  /** This capability's config from config.json. */
  config: Record<string, unknown>;
  /** Hidden --agent-cmd override. */
  agentCmd?: string;
  copilotFlags?: string;
  /** Verbose diagnostic output enabled. */
  verbose?: boolean;
  /**
   * Shared round data — fetched once at the start of each round.
   * Capabilities should read from here instead of calling adapter.listWorkItems().
   * @see https://github.com/bradygaster/squad/issues/923
   */
  roundData?: RoundData;
}

/** Contract that every watch capability must implement. */
export interface WatchCapability {
  /** Unique name — used as config key and CLI flag (e.g., "board", "monitor-teams"). */
  readonly name: string;

  /** Human description for --help and startup banner. */
  readonly description: string;

  /** Does config accept just true/false, or an object with sub-options? */
  readonly configShape: 'boolean' | 'object';

  /** What tools/CLIs this needs — displayed when preflight fails. */
  readonly requires: string[];

  /** When in the round cycle this runs. */
  readonly phase: WatchPhase;

  /** Check if this capability can actually run right now. */
  preflight(context: WatchContext): Promise<PreflightResult>;

  /** Do the work for this round. */
  execute(context: WatchContext): Promise<CapabilityResult>;
}
