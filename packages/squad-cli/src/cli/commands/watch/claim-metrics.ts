/**
 * Work-claim telemetry for `squad watch` (ADR-002).
 *
 * Counts claim outcomes per round and since startup and mirrors them to
 * OpenTelemetry counters (`squad.watch.claims.*`). Only created when the claim provider
 * excludes other executors; with `none`, watch output is unchanged.
 *
 * Privacy: counters carry only the provider name and finish outcome — never
 * issue numbers, hostnames, machine ids, or actors.
 */

import { getMeter } from '@bradygaster/squad-sdk';
import type { FinishOutcome, WorkClaimProvider } from '@bradygaster/squad-sdk/ralph/claims';
import {
  cloneClaimCounters,
  emptyClaimCounters,
  type ClaimCounterName,
  type ClaimCounters,
} from './claim-counters.js';

export * from './claim-counters.js';

export interface ClaimMetricsSnapshot {
  provider: string;
  round: ClaimCounters;
  totals: ClaimCounters;
}

type Counter = ReturnType<ReturnType<typeof getMeter>['createCounter']>;

const OTEL_COUNTERS: Record<ClaimCounterName | 'released', { name: string; description: string }> = {
  acquired: { name: 'squad.watch.claims.acquired', description: 'Work claims acquired by this watch executor' },
  contended: { name: 'squad.watch.claims.contended', description: 'Work claims skipped because another executor holds them' },
  unavailable: { name: 'squad.watch.claims.unavailable', description: 'Work claims skipped because the provider could not decide' },
  fenced: { name: 'squad.watch.claims.fenced', description: 'Held work claims taken over by another executor' },
  lost: { name: 'squad.watch.claims.lost', description: 'Held work claims that could not be renewed before expiry' },
  released: { name: 'squad.watch.claims.released', description: 'Work claims released, by finish outcome' },
  implausibleTakeover: {
    name: 'squad.watch.claims.implausible_takeover',
    description: 'Implausible claim records taken over as expired',
  },
};

/** OTel export is opt-in, matching shell metrics: an OTLP endpoint or SQUAD_TELEMETRY=1. */
export function isWatchTelemetryEnabled(): boolean {
  return !!process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] || process.env['SQUAD_TELEMETRY'] === '1';
}

/**
 * True for the `GitRefClaimProvider` warning emitted when it takes over an
 * implausible claim record as expired.
 */
export function isImplausibleTakeoverWarning(message: string): boolean {
  return /\bis implausible: .*taking it over as expired/.test(message);
}

export class WatchClaimMetrics {
  readonly provider: string;
  private current = emptyClaimCounters();
  private readonly total = emptyClaimCounters();
  private readonly counters: Partial<Record<ClaimCounterName | 'released', Counter>> = {};

  constructor(provider: Pick<WorkClaimProvider, 'name'>, opts: { otel?: boolean } = {}) {
    this.provider = provider.name;
    if (opts.otel ?? isWatchTelemetryEnabled()) {
      const meter = getMeter('squad-watch');
      for (const [key, def] of Object.entries(OTEL_COUNTERS)) {
        this.counters[key as ClaimCounterName | 'released'] = meter.createCounter(def.name, { description: def.description });
      }
    }
  }

  /** Reset the per-round counters; totals keep accumulating. */
  startRound(): void {
    this.current = emptyClaimCounters();
  }

  record(name: ClaimCounterName, count = 1): void {
    if (count <= 0) return;
    this.current[name] += count;
    this.total[name] += count;
    this.counters[name]?.add(count, { 'claim.provider': this.provider });
  }

  recordRelease(outcome: FinishOutcome, count = 1): void {
    if (count <= 0) return;
    this.current.released[outcome] += count;
    this.total.released[outcome] += count;
    this.counters.released?.add(count, { 'claim.provider': this.provider, 'claim.outcome': outcome });
  }

  snapshot(): ClaimMetricsSnapshot {
    return { provider: this.provider, round: cloneClaimCounters(this.current), totals: cloneClaimCounters(this.total) };
  }
}

/** Metrics for `provider`, or undefined when it does not exclude other executors (`none`). */
export function claimMetricsFor(
  provider: Pick<WorkClaimProvider, 'name' | 'guarantees'>,
  opts: { otel?: boolean } = {},
): WatchClaimMetrics | undefined {
  return provider.guarantees.exclusion === 'none' ? undefined : new WatchClaimMetrics(provider, opts);
}

/**
 * Initialize telemetry before constructing claim counters. OTel instruments
 * created against the no-op provider stay no-op after a provider is installed.
 */
export function initializeWatchClaimMetrics<T>(
  provider: Pick<WorkClaimProvider, 'name' | 'guarantees'>,
  initTelemetry: () => T,
  opts: {
    telemetryEnabled?: boolean;
    createMetrics?: (provider: Pick<WorkClaimProvider, 'name' | 'guarantees'>) => WatchClaimMetrics | undefined;
  } = {},
): { metrics?: WatchClaimMetrics; telemetry?: T } {
  if (provider.guarantees.exclusion === 'none') return {};
  const telemetry = (opts.telemetryEnabled ?? isWatchTelemetryEnabled())
    ? initTelemetry()
    : undefined;
  const metrics = (opts.createMetrics ?? claimMetricsFor)(provider);
  return {
    ...(metrics ? { metrics } : {}),
    ...(telemetry ? { telemetry } : {}),
  };
}
