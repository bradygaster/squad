/**
 * Work claim wiring for watch capabilities (ADR-002).
 *
 * Capabilities that spawn agents acquire one claim per issue, dispatch only
 * the issues they won, renew every `ttlMs / 3` while the agent runs, kill the
 * agent if a claim is fenced (or cannot be renewed before it expires), and
 * release every claim in `finally`. Claim errors never escape these helpers.
 */

import {
  DEFAULT_CLAIM_SKEW_MARGIN_MS,
  DEFAULT_CLAIM_TTL_MS,
  NoopClaimProvider,
  claimTimingError,
} from '@bradygaster/squad-sdk/ralph/claims';
import type {
  ClaimRecord,
  ExecutorIdentity,
  FinishOutcome,
  WorkClaimProvider,
  WorkKey,
} from '@bradygaster/squad-sdk/ralph/claims';
import { getRemoteUrl, parseAzureDevOpsRemote, parseGitHubRemote } from '@bradygaster/squad-sdk/platform';
import type { WatchContext } from './types.js';
import type { WatchClaimsConfig } from './config.js';
import type { AgentSpawnResult } from './agent-spawn.js';

export interface ClaimLogger {
  /** Routine detail (held by another executor, renewals). */
  debug(message: string): void;
  /** Something the operator should see (unavailable, fenced, release failure). */
  warn(message: string): void;
}

export interface ClaimTiming {
  ttlMs: number;
  skewMarginMs: number;
  now: () => number;
}

export interface WonClaim<T> {
  item: T;
  claim: ClaimRecord;
}

export interface ClaimAcquisition<T> {
  won: Array<WonClaim<T>>;
  held: T[];
  unavailable: Array<{ item: T; reason: string }>;
}

/** Provider in effect for a context; unset means today's no-exclusion behavior. */
export function claimProviderFor(context: WatchContext): WorkClaimProvider {
  return context.claims ?? new NoopClaimProvider(context.executor ? { identity: context.executor } : {});
}

/**
 * True when the provider actually excludes other executors (`local` or
 * `distributed`), so dispatched issues are claimed for this agent and the
 * prompt must carry the claimed-work contract. `none` keeps today's prompt.
 */
export function claimsAreExclusive(provider: WorkClaimProvider): boolean {
  return provider.guarantees.exclusion !== 'none';
}

export function claimTimingFor(context: WatchContext): ClaimTiming {
  return {
    ttlMs: context.claimTiming?.ttlMs ?? DEFAULT_CLAIM_TTL_MS,
    skewMarginMs: context.claimTiming?.skewMarginMs ?? DEFAULT_CLAIM_SKEW_MARGIN_MS,
    now: context.claimTiming?.now ?? Date.now,
  };
}

/**
 * Why `timing` cannot drive a renewal schedule, or null. This is the
 * structural check (`ttlMs > 2 * skewMarginMs`, `ttlMs <= 24h`,
 * `skewMarginMs <= 1h`); the 30 s floor is enforced where users configure
 * timing (`parseWatchClaimsConfig`). Violations would make the renew delay
 * non-positive or overflow `setTimeout`, both of which turn the renew timer
 * into a back-to-back push loop.
 */
export function unsafeClaimTiming(timing: Pick<ClaimTiming, 'ttlMs' | 'skewMarginMs'>): string | null {
  return claimTimingError(timing, { minTtlMs: 0 });
}

/**
 * Build the configured provider. `git-ref` runs git in `teamRoot` against the
 * shared remote (default `origin`). Throws on invalid provider options so a
 * misconfigured opt-in fails at startup rather than running unprotected.
 */
export async function createWatchClaimProvider(
  config: WatchClaimsConfig | undefined,
  opts: { teamRoot: string; identity: ExecutorIdentity; onWarning?: (message: string) => void },
): Promise<WorkClaimProvider> {
  if (!config || config.provider === 'none') {
    return new NoopClaimProvider({ identity: opts.identity });
  }
  const { GitRefClaimProvider } = await import('@bradygaster/squad-sdk/ralph/claims-git');
  return new GitRefClaimProvider({
    identity: opts.identity,
    cwd: opts.teamRoot,
    remote: config.remote ?? 'origin',
    ...(config.refPrefix ? { refPrefix: config.refPrefix } : {}),
    ...(config.skewMarginMs !== undefined ? { skewMarginMs: config.skewMarginMs } : {}),
    ...(opts.onWarning ? { onWarning: opts.onWarning } : {}),
  });
}

function minutes(ms: number): string {
  const m = ms / 60_000;
  return Number.isInteger(m) ? `${m}m` : `${Math.round(ms / 1000)}s`;
}

/** One startup line naming the provider and what it guarantees. */
export function describeClaimProvider(
  provider: WorkClaimProvider,
  timing: Pick<ClaimTiming, 'ttlMs' | 'skewMarginMs'>,
  extra?: { remote?: string },
): string {
  const g = provider.guarantees;
  if (g.exclusion === 'none') {
    return `Claims: ${provider.name} — no cross-process exclusion (other watchers may pick the same issue); same-round dedupe only`;
  }
  const remote = extra?.remote ? `, remote ${extra.remote}` : '';
  return `Claims: ${provider.name} — ${g.exclusion} exclusion, leases ${g.leases ? 'on' : 'off'}, fencing ${g.fencing ? 'on' : 'off'}`
    + ` (ttl ${minutes(timing.ttlMs)}, renew every ${minutes(timing.ttlMs / 3)}, skew ${minutes(timing.skewMarginMs)}${remote})`;
}

/** `owner/repo` (GitHub) or `org/project` (Azure DevOps) from the origin remote. */
export function resolveWorkRepo(teamRoot: string): string | undefined {
  const url = getRemoteUrl(teamRoot);
  if (!url) return undefined;
  const gh = parseGitHubRemote(url);
  if (gh) return `${gh.owner}/${gh.repo}`;
  const ado = parseAzureDevOpsRemote(url);
  if (ado) return `${ado.org}/${ado.project}`;
  return undefined;
}

const GITHUB_ITEM_URL = /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/\d+/i;

/** Work key for an issue, or null when no stable repository is known. */
export function workKeyFor(
  context: WatchContext,
  item: { number: number; url?: string },
): WorkKey | null {
  const fromUrl = item.url?.match(GITHUB_ITEM_URL);
  const repo = fromUrl ? `${fromUrl[1]}/${fromUrl[2]}` : context.workRepo;
  if (!repo) return null;
  return { platform: context.adapter.type || 'unknown', repo, id: String(item.number) };
}

/** Drop issues another capability already dispatched this round. */
export function excludeDispatchedThisRound<T extends { number: number }>(context: WatchContext, items: T[]): T[] {
  const dispatched = context.dispatchedThisRound;
  if (!dispatched) return items;
  return items.filter(i => !dispatched.has(i.number));
}

/** Record issues as dispatched for the rest of this round. */
export function markDispatchedThisRound(context: WatchContext, items: Array<{ number: number }>): void {
  for (const i of items) context.dispatchedThisRound?.add(i.number);
}

/**
 * Try to claim each item. `held` and `unavailable` items are skipped (fail
 * closed); only `won` items may be dispatched. Never throws.
 */
export async function acquireClaims<T extends { number: number; url?: string }>(
  context: WatchContext,
  items: T[],
  log: ClaimLogger,
): Promise<ClaimAcquisition<T>> {
  const provider = claimProviderFor(context);
  const timing = claimTimingFor(context);
  const { ttlMs } = timing;
  const metrics = context.claimMetrics;
  const result: ClaimAcquisition<T> = { won: [], held: [], unavailable: [] };

  const badTiming = provider.guarantees.leases ? unsafeClaimTiming(timing) : null;
  if (badTiming) {
    const reason = `invalid claim timing: ${badTiming}`;
    log.warn(`claims unavailable: ${reason} — skipping ${items.length} issue(s)`);
    for (const item of items) result.unavailable.push({ item, reason });
    metrics?.record('unavailable', items.length);
    return result;
  }

  for (const item of items) {
    let key = workKeyFor(context, item);
    if (!key) {
      if (claimsAreExclusive(provider)) {
        const reason = 'no stable repository for the work key (set an origin remote)';
        result.unavailable.push({ item, reason });
        metrics?.record('unavailable');
        log.warn(`claim #${item.number} unavailable: ${reason} — skipping`);
        continue;
      }
      key = { platform: context.adapter.type || 'unknown', repo: 'local', id: String(item.number) };
    }
    try {
      const r = await provider.acquire(key, { ttlMs });
      if (r.status === 'acquired') {
        result.won.push({ item, claim: r.claim });
        metrics?.record('acquired');
      } else if (r.status === 'held') {
        result.held.push(item);
        metrics?.record('contended');
        log.debug(`claim #${item.number} held by ${r.by.holder.machineId}/${r.by.holder.instanceId} — skipping`);
      } else {
        result.unavailable.push({ item, reason: r.reason });
        metrics?.record('unavailable');
        log.warn(`claim #${item.number} unavailable: ${r.reason} — skipping`);
      }
    } catch (e) {
      const reason = (e as Error).message;
      result.unavailable.push({ item, reason });
      metrics?.record('unavailable');
      log.warn(`claim #${item.number} unavailable: ${reason} — skipping`);
    }
  }
  return result;
}

/** Finish outcome for a spawned agent run (ADR-002 vocabulary). */
export function outcomeForSpawn(result: AgentSpawnResult | { success: boolean; cancelled?: boolean }, fenced: boolean): FinishOutcome {
  if (fenced) return 'cancelled';
  if (result.success) return 'completed';
  const r = result as AgentSpawnResult;
  if (r.cancelled || (r.signal && !r.timedOut)) return 'cancelled';
  return 'abandoned';
}

export interface HoldResult<R> {
  result: R;
  /** Set when a claim was fenced (or could not be renewed) and the run was aborted. */
  fencedReason?: string;
}

/**
 * Run `work` while holding `claims`: renew every `ttlMs / 3`, abort the
 * passed signal when a renewal is fenced or keeps failing until
 * `expiresAt - skewMarginMs`, then release every claim with the outcome from
 * `outcomeOf`. Release and renewal errors are logged, never thrown.
 *
 * @throws Error (after releasing every claim, without running `work`) when a
 *   leasing provider is paired with timing rejected by {@link unsafeClaimTiming}.
 */
export async function holdClaimsWhile<R>(
  context: WatchContext,
  claims: ClaimRecord[],
  work: (signal: AbortSignal) => Promise<R>,
  outcomeOf: (result: R | undefined, fenced: boolean) => FinishOutcome,
  log: ClaimLogger,
): Promise<HoldResult<R>> {
  const provider = claimProviderFor(context);
  const timing = claimTimingFor(context);
  const metrics = context.claimMetrics;
  const controller = new AbortController();
  const current = claims.map(c => ({ ...c }));
  // Claims already counted as fenced or lost, so release does not count them twice.
  const lostOrFenced = new Set<number>();
  let fencedReason: string | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | undefined;

  const fence = (reason: string): void => {
    if (fencedReason) return;
    fencedReason = reason;
    log.warn(`${reason} — killing agent`);
    controller.abort(new Error(reason));
  };

  const label = (c: ClaimRecord): string => `#${c.key.id}`;

  const renewOnce = async (): Promise<void> => {
    await Promise.all(current.map(async (c, idx) => {
      try {
        const r = await provider.renew(c, { ttlMs: timing.ttlMs });
        if (r.status === 'renewed') {
          current[idx] = r.claim;
          log.debug(`claim ${label(c)} renewed (epoch ${r.claim.epoch})`);
        } else {
          const by = r.by ? ` by ${r.by.holder.machineId}/${r.by.holder.instanceId}` : '';
          if (!lostOrFenced.has(idx)) {
            lostOrFenced.add(idx);
            metrics?.record('fenced');
          }
          fence(`claim ${label(c)} fenced${by}`);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (timing.now() >= c.expiresAt - timing.skewMarginMs) {
          if (!lostOrFenced.has(idx)) {
            lostOrFenced.add(idx);
            metrics?.record('lost');
          }
          fence(`claim ${label(c)} could not be renewed before expiry (${msg})`);
        } else {
          log.warn(`claim ${label(c)} renew failed, will retry: ${msg}`);
        }
      }
    }));
  };

  const schedule = (): void => {
    if (stopped || fencedReason) return;
    let delay = timing.ttlMs / 3;
    const now = timing.now();
    for (const c of current) {
      // Retry no later than the self-fence deadline so an unreachable remote
      // stops the agent at `expiresAt - skewMarginMs`, as ADR-002 requires.
      delay = Math.min(delay, c.expiresAt - timing.skewMarginMs - now);
    }
    timer = setTimeout(() => {
      inflight = renewOnce().finally(() => {
        inflight = undefined;
        schedule();
      });
    }, Math.max(1, Math.floor(delay)));
    timer.unref?.();
  };

  if (provider.guarantees.leases && current.length > 0) {
    const badTiming = unsafeClaimTiming(timing);
    if (badTiming) {
      // Fail closed: never run work under a renew schedule that would spin.
      await Promise.all(current.map(async c => {
        try {
          const r = await provider.release(c, 'cancelled');
          if (r.status === 'fenced') metrics?.record('fenced');
          else metrics?.recordRelease('cancelled');
        } catch (e) {
          log.warn(`claim ${label(c)} release failed (cancelled): ${(e as Error).message}`);
        }
      }));
      throw new Error(`invalid claim timing: ${badTiming}`);
    }
    schedule();
  }

  let result: R | undefined;
  try {
    result = await work(controller.signal);
    return { result, ...(fencedReason ? { fencedReason } : {}) };
  } finally {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (inflight) await inflight.catch(() => undefined);
    const outcome = outcomeOf(result, fencedReason !== undefined);
    await Promise.all(current.map(async (c, idx) => {
      try {
        const r = await provider.release(c, outcome);
        if (r.status === 'fenced') {
          if (!lostOrFenced.has(idx)) {
            lostOrFenced.add(idx);
            metrics?.record('fenced');
          }
          log.warn(`claim ${label(c)} was fenced before release (${outcome})`);
        } else {
          metrics?.recordRelease(outcome);
          log.debug(`claim ${label(c)} ${r.status} (${outcome})`);
        }
      } catch (e) {
        log.warn(`claim ${label(c)} release failed (${outcome}): ${(e as Error).message}`);
      }
    }));
  }
}

/** Short per-round claim summary for capability results. */
export function claimSummary<T>(provider: WorkClaimProvider, acq: ClaimAcquisition<T>): {
  provider: string;
  acquired: number;
  held: number;
  unavailable: number;
} {
  return {
    provider: provider.name,
    acquired: acq.won.length,
    held: acq.held.length,
    unavailable: acq.unavailable.length,
  };
}
