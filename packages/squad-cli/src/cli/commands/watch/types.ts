/**
 * Watch capability plugin types.
 *
 * Every opt-in watch feature implements {@link WatchCapability} so the
 * main loop stays thin and each feature is testable in isolation.
 */

import type { PlatformAdapter } from '@bradygaster/squad-sdk/platform';
import type { ExecutorIdentity, WorkClaimProvider } from '@bradygaster/squad-sdk/ralph/claims';
import type { WatchClaimMetrics } from './claim-metrics.js';

/** Phase within a single watch round. */
export type WatchPhase = 'pre-scan' | 'post-triage' | 'post-execute' | 'housekeeping';

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
  /**
   * Effective state directory — the local `.squad/` dir, or the external
   * state dir when `squad externalize` is active (#1490). Capabilities
   * must read/write squad state (decisions, log, ralph-instructions.md,
   * etc.) through this, not by joining `.squad/` onto `teamRoot`.
   */
  stateRoot: string;
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
  /** PID tracker for child process cleanup (optional — only set when watch is running). */
  pidTracker?: { track(pid: number, name: string): void; untrack(pid: number): void };
  /**
   * Work claim provider (ADR-002). Capabilities that spawn agents acquire a
   * claim per issue and dispatch only issues they won. Unset behaves like
   * `NoopClaimProvider` (no cross-process exclusion).
   */
  claims?: WorkClaimProvider;
  /** Claim-holder identity of this watch process. */
  executor?: ExecutorIdentity;
  /** Claim lease timing. Renewals run every `ttlMs / 3`. */
  claimTiming?: { ttlMs: number; skewMarginMs: number; now?: () => number };
  /** Stable `owner/repo` (or `org/project`) used in claim work keys. */
  workRepo?: string;
  /**
   * Issue numbers already dispatched in the current round. Shared by every
   * capability in one round so hybrid execute + fleet-dispatch never send the
   * same issue twice, whatever claim provider is configured.
   */
  dispatchedThisRound?: Set<number>;
  /**
   * Claim outcome counters (ADR-002 telemetry). Set only when the provider
   * excludes other executors; unset leaves claim helpers uninstrumented.
   */
  claimMetrics?: WatchClaimMetrics;
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
