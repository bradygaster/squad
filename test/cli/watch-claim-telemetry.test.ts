/**
 * Work-claim telemetry for `squad watch` (ADR-002): per-round and total
 * counters, the round-board line, `--health` counters, and OTel counters.
 * With the `none` provider no metrics exist and output is unchanged.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  InMemoryClaimProvider,
  InMemoryClaimStore,
  NoopClaimProvider,
  type ClaimRecord,
  type ExecutorIdentity,
  type WorkClaimProvider,
} from '@bradygaster/squad-sdk/ralph/claims';

interface SpyCounter { add: Mock }
const instruments = new Map<string, SpyCounter>();
const spyMeter = {
  createCounter: vi.fn((name: string) => {
    const c: SpyCounter = { add: vi.fn() };
    instruments.set(name, c);
    return c;
  }),
};

vi.mock('@bradygaster/squad-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMeter: () => spyMeter,
}));

import { acquireClaims, holdClaimsWhile } from '../../packages/squad-cli/src/cli/commands/watch/claims.js';
import {
  claimMetricsFor,
  formatClaimRoundLines,
  initializeWatchClaimMetrics,
  isImplausibleTakeoverWarning,
  WatchClaimMetrics,
} from '../../packages/squad-cli/src/cli/commands/watch/claim-metrics.js';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';
import { reportBoard, type BoardState } from '../../packages/squad-cli/src/cli/commands/watch/index.js';
import {
  getPidPath,
  getWatchHealth,
  removePidFile,
  updatePidFileClaims,
  writePidFile,
} from '../../packages/squad-cli/src/cli/commands/watch/health.js';

const ROOT = path.resolve('.evidence-tmp', `watch-claim-telemetry-${randomUUID().slice(0, 8)}`);
const silent = { debug: () => undefined, warn: () => undefined };

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

function identity(name: string): ExecutorIdentity {
  return { machineId: `machine-${name}`, instanceId: `instance-${name}` };
}

function item(n: number): { number: number; url: string } {
  return { number: n, url: `https://github.com/acme/widgets/issues/${n}` };
}

function makeContext(claims: WorkClaimProvider, overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: ROOT,
    stateRoot: path.join(ROOT, '.squad'),
    adapter: { type: 'github' } as unknown as WatchContext['adapter'],
    round: 1,
    roster: [],
    config: {},
    workRepo: 'acme/widgets',
    claims,
    ...overrides,
  };
}

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

const BOARD: BoardState = {
  untriaged: 1, assigned: 2, drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, executed: 1,
};

describe('claim counters', () => {
  it('counts acquired, contended, and unavailable per round', async () => {
    const store = new InMemoryClaimStore();
    const other = new InMemoryClaimProvider({ identity: identity('other'), store });
    await other.acquire({ platform: 'github', repo: 'acme/widgets', id: '2' }, { ttlMs: 60_000 });
    const mine = new InMemoryClaimProvider({ identity: identity('me'), store });
    const metrics = new WatchClaimMetrics(mine, { otel: false });
    const ctx = makeContext(mine, { claimMetrics: metrics });

    // #3 has no URL and the context has no work repo -> unavailable
    const noRepo = makeContext(mine, { claimMetrics: metrics, workRepo: undefined });
    await acquireClaims(ctx, [item(1), item(2)], silent);
    await acquireClaims(noRepo, [{ number: 3 }], silent);

    const { round, totals, provider } = metrics.snapshot();
    expect(provider).toBe('in-memory');
    expect(round).toMatchObject({ acquired: 1, contended: 1, unavailable: 1, fenced: 0, lost: 0 });
    expect(totals).toEqual(round);

    metrics.startRound();
    expect(metrics.snapshot().round.acquired).toBe(0);
    expect(metrics.snapshot().totals.acquired).toBe(1);
  });

  it('counts provider-reported and thrown unavailability', async () => {
    const inner = new InMemoryClaimProvider({ identity: identity('A') });
    let call = 0;
    const flaky: WorkClaimProvider = {
      name: 'flaky',
      guarantees: inner.guarantees,
      acquire: async () => {
        call++;
        if (call === 1) return { status: 'unavailable', reason: 'remote down' };
        throw new Error('boom');
      },
      renew: inner.renew.bind(inner),
      release: inner.release.bind(inner),
    };
    const metrics = new WatchClaimMetrics(flaky, { otel: false });
    await acquireClaims(makeContext(flaky, { claimMetrics: metrics }), [item(1), item(2)], silent);
    expect(metrics.snapshot().round).toMatchObject({ acquired: 0, unavailable: 2 });
  });

  it('counts releases by outcome', async () => {
    const provider = new InMemoryClaimProvider({ identity: identity('A') });
    const metrics = new WatchClaimMetrics(provider, { otel: false });
    const ctx = makeContext(provider, { claimMetrics: metrics, claimTiming: { ttlMs: 60_000, skewMarginMs: 0 } });
    const won = await acquireClaims(ctx, [item(1), item(2)], silent);
    await holdClaimsWhile(ctx, won.won.map(w => w.claim), async () => 'ok', () => 'completed', silent);
    const again = await acquireClaims(ctx, [item(3)], silent);
    await holdClaimsWhile(ctx, again.won.map(w => w.claim), async () => 'x', () => 'abandoned', silent);
    expect(metrics.snapshot().round.released).toEqual({ completed: 2, cancelled: 0, abandoned: 1 });
  });

  it('counts a claim fenced during renewal once, not again at release', async () => {
    let t = 1_000_000;
    const now = (): number => t;
    const store = new InMemoryClaimStore();
    const mine = new InMemoryClaimProvider({ identity: identity('A'), store, now });
    const metrics = new WatchClaimMetrics(mine, { otel: false });
    const ctx = makeContext(mine, { claimMetrics: metrics, claimTiming: { ttlMs: 300, skewMarginMs: 0, now } });
    const won = await acquireClaims(ctx, [item(1)], silent);

    const { fencedReason } = await holdClaimsWhile(ctx, won.won.map(w => w.claim), async (signal) => {
      // Let the lease lapse and another executor take the claim over.
      t += 1_000;
      const other = new InMemoryClaimProvider({ identity: identity('B'), store, now });
      await other.acquire(won.won[0]!.claim.key, { ttlMs: 60_000 });
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      return 'killed';
    }, (_r, fenced) => (fenced ? 'cancelled' : 'completed'), silent);

    expect(fencedReason).toMatch(/fenced/);
    expect(metrics.snapshot().round).toMatchObject({ fenced: 1, lost: 0 });
    expect(metrics.snapshot().round.released).toEqual({ completed: 0, cancelled: 0, abandoned: 0 });
  });

  it('counts a claim that cannot be renewed before expiry as lost', async () => {
    let t = 1_000_000;
    const now = (): number => t;
    const inner = new InMemoryClaimProvider({ identity: identity('A'), now });
    const unreachable: WorkClaimProvider = {
      name: 'unreachable',
      guarantees: inner.guarantees,
      acquire: inner.acquire.bind(inner),
      renew: async () => { throw new Error('remote unreachable'); },
      release: inner.release.bind(inner),
    };
    const metrics = new WatchClaimMetrics(unreachable, { otel: false });
    const ctx = makeContext(unreachable, { claimMetrics: metrics, claimTiming: { ttlMs: 300, skewMarginMs: 0, now } });
    const won = await acquireClaims(ctx, [item(1)], silent);

    await holdClaimsWhile(ctx, won.won.map(w => w.claim), async (signal) => {
      t += 1_000;
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      return 'killed';
    }, (_r, fenced) => (fenced ? 'cancelled' : 'completed'), silent);

    expect(metrics.snapshot().round).toMatchObject({ lost: 1, fenced: 0 });
    expect(metrics.snapshot().round.released.cancelled).toBe(1);
  });

  it('recognizes the git-ref implausible takeover warning', () => {
    expect(isImplausibleTakeoverWarning(
      'claim refs/squad/claims/github/acme/widgets/7 (abc123) is implausible: epoch 9 exceeds bound — taking it over as expired',
    )).toBe(true);
    expect(isImplausibleTakeoverWarning('claim #7 renew failed, will retry: timeout')).toBe(false);
  });

  it('has no metrics for the none provider', () => {
    expect(claimMetricsFor(new NoopClaimProvider())).toBeUndefined();
    expect(claimMetricsFor(new InMemoryClaimProvider(), { otel: false })).toBeInstanceOf(WatchClaimMetrics);
  });
});

describe('round board claim line', () => {
  it('none: output is byte-identical to the board without claims', () => {
    const before = captureLog(() => reportBoard(BOARD, 3));
    expect(before).toEqual(captureLog(() => reportBoard(BOARD, 3, undefined)));
    expect(before.join('\n')).not.toContain('Claims');
    const clear = captureLog(() => reportBoard({ ...BOARD, untriaged: 0, assigned: 0, executed: 0 }, 3));
    expect(clear).toHaveLength(1);
    expect(clear[0]).toContain('Board is clear');
  });

  it('prints a compact claims line when a counter is non-zero', () => {
    const m = new WatchClaimMetrics({ name: 'git-ref' }, { otel: false });
    m.record('acquired', 2);
    m.record('contended');
    m.recordRelease('completed', 2);
    const lines = captureLog(() => reportBoard(BOARD, 3, { claims: m.snapshot() }));
    expect(lines).toContain('  🔒 Claims (git-ref): won 2 · contended 1 · released 2 (completed 2)');
    expect(lines.at(-1)).toBe('');
  });

  it('omits the claims line when the round had no claim activity', () => {
    const m = new WatchClaimMetrics({ name: 'git-ref' }, { otel: false });
    expect(captureLog(() => reportBoard(BOARD, 3, { claims: m.snapshot() })))
      .toEqual(captureLog(() => reportBoard(BOARD, 3)));
  });

  it('shows claim activity on an otherwise clear board', () => {
    const m = new WatchClaimMetrics({ name: 'git-ref' }, { otel: false });
    m.record('contended', 3);
    const lines = captureLog(() => reportBoard(
      { ...BOARD, untriaged: 0, assigned: 0, executed: 0 }, 4, { claims: m.snapshot() },
    ));
    expect(lines.at(-1)).toBe('  🔒 Claims (git-ref): won 0 · contended 3');
  });

  it('wraps within 80 columns when every counter is set', () => {
    const m = new WatchClaimMetrics({ name: 'git-ref' }, { otel: false });
    for (const n of ['acquired', 'contended', 'unavailable', 'fenced', 'lost', 'implausibleTakeover'] as const) {
      m.record(n, 12345);
    }
    for (const o of ['completed', 'cancelled', 'abandoned'] as const) m.recordRelease(o, 12345);
    const lines = formatClaimRoundLines('git-ref', m.snapshot().round);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
    expect(lines.join(' ')).toContain('implausible 12345');
  });
});

describe('watch --health claim counters', () => {
  const teamRoot = path.join(ROOT, 'health');
  beforeEach(() => fs.mkdirSync(teamRoot, { recursive: true }));
  afterEach(() => removePidFile(teamRoot));

  function writeInfo(pid: number): void {
    writePidFile(teamRoot, {
      pid, startedAt: new Date().toISOString(), user: 'tester', interval: 5, capabilities: ['execute'], repo: 'acme/widgets',
    });
  }

  it('adds claim totals for this process and shows them in health output', () => {
    writeInfo(process.pid);
    const m = new WatchClaimMetrics({ name: 'git-ref' }, { otel: false });
    m.record('acquired', 4);
    m.record('fenced');
    m.recordRelease('cancelled');
    expect(updatePidFileClaims(teamRoot, m.snapshot())).toBe(true);

    const info = JSON.parse(fs.readFileSync(getPidPath(teamRoot), 'utf-8'));
    expect(info.claims.provider).toBe('git-ref');
    expect(info.claims.totals.acquired).toBe(4);
    expect(info.claims).not.toHaveProperty('round');

    const health = getWatchHealth(teamRoot);
    expect(health).toContain('  Claims:        git-ref — won 4 · fenced 1 · released 1 (cancelled 1)');
  });

  it('never touches a PID file owned by another process', () => {
    writeInfo(process.pid + 1);
    const before = fs.readFileSync(getPidPath(teamRoot), 'utf-8');
    expect(updatePidFileClaims(teamRoot, new WatchClaimMetrics({ name: 'git-ref' }, { otel: false }).snapshot())).toBe(false);
    expect(fs.readFileSync(getPidPath(teamRoot), 'utf-8')).toBe(before);
  });

  it('no-ops without a PID file and omits the claims line when absent', () => {
    expect(updatePidFileClaims(teamRoot, new WatchClaimMetrics({ name: 'git-ref' }, { otel: false }).snapshot())).toBe(false);
    writeInfo(process.pid);
    expect(getWatchHealth(teamRoot)).not.toContain('Claims:');
  });
});

describe('OTel claim counters', () => {
  it('installs telemetry before claim instruments are created', () => {
    const order: string[] = [];
    const provider = new InMemoryClaimProvider({ identity: identity('otel-order') });
    const initialized = initializeWatchClaimMetrics(
      provider,
      () => {
        order.push('provider');
        return { shutdown: async () => {} };
      },
      {
        telemetryEnabled: true,
        createMetrics: current => {
          order.push('instruments');
          return new WatchClaimMetrics(current, { otel: false });
        },
      },
    );

    expect(order).toEqual(['provider', 'instruments']);
    expect(initialized.metrics).toBeInstanceOf(WatchClaimMetrics);
    expect(initialized.telemetry).toBeDefined();
  });

  beforeEach(() => {
    instruments.clear();
    spyMeter.createCounter.mockClear();
  });

  it('adds squad.watch.claims.* with provider and outcome attributes only', async () => {
    const store = new InMemoryClaimStore();
    const other = new InMemoryClaimProvider({ identity: identity('other'), store });
    await other.acquire({ platform: 'github', repo: 'acme/widgets', id: '2' }, { ttlMs: 60_000 });
    const mine = new InMemoryClaimProvider({ identity: identity('me'), store });
    const metrics = new WatchClaimMetrics(mine, { otel: true });
    const ctx = makeContext(mine, { claimMetrics: metrics, claimTiming: { ttlMs: 60_000, skewMarginMs: 0 } });

    const acq = await acquireClaims(ctx, [item(1), item(2)], silent);
    await holdClaimsWhile(ctx, acq.won.map(w => w.claim as ClaimRecord), async () => 'ok', () => 'completed', silent);

    expect([...instruments.keys()].sort()).toEqual([
      'squad.watch.claims.acquired',
      'squad.watch.claims.contended',
      'squad.watch.claims.fenced',
      'squad.watch.claims.implausible_takeover',
      'squad.watch.claims.lost',
      'squad.watch.claims.released',
      'squad.watch.claims.unavailable',
    ]);
    expect(instruments.get('squad.watch.claims.acquired')!.add).toHaveBeenCalledWith(1, { 'claim.provider': 'in-memory' });
    expect(instruments.get('squad.watch.claims.contended')!.add).toHaveBeenCalledWith(1, { 'claim.provider': 'in-memory' });
    expect(instruments.get('squad.watch.claims.released')!.add)
      .toHaveBeenCalledWith(1, { 'claim.provider': 'in-memory', 'claim.outcome': 'completed' });
    expect(instruments.get('squad.watch.claims.unavailable')!.add).not.toHaveBeenCalled();
  });

  it('creates no instruments when telemetry is off', () => {
    new WatchClaimMetrics({ name: 'git-ref' }, { otel: false }).record('acquired');
    expect(spyMeter.createCounter).not.toHaveBeenCalled();
  });
});
