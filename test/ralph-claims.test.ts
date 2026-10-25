import { describe, it, expect } from 'vitest';
import os from 'node:os';
import {
  InMemoryClaimProvider,
  InMemoryClaimStore,
  NoopClaimProvider,
  DEFAULT_CLAIM_SKEW_MARGIN_MS,
  DEFAULT_CLAIM_TTL_MS,
  MAX_CLAIM_EPOCH,
  MAX_CLAIM_SKEW_MARGIN_MS,
  MAX_CLAIM_TTL_MS,
  MIN_CLAIM_TTL_MS,
  claimRecordImplausibility,
  claimTimingError,
  hostnamePseudonym,
  normalizeWorkKey,
  resolveExecutorIdentity,
  workKeyToString,
} from '@bradygaster/squad-sdk/ralph/claims';
import { describeClaimProviderContract, manualClock, testIdentity } from './helpers/claim-provider-contract.js';

describeClaimProviderContract('NoopClaimProvider', () => {
  const clock = manualClock();
  return {
    provider: (identity) => new NoopClaimProvider({ identity, now: clock.now }),
    advance: clock.advance,
  };
});

describeClaimProviderContract('InMemoryClaimProvider', () => {
  const clock = manualClock();
  const store = new InMemoryClaimStore();
  return {
    provider: (identity) => new InMemoryClaimProvider({ identity, now: clock.now, store }),
    advance: clock.advance,
    now: clock.now,
    plant: (key, record) => {
      store.set(workKeyToString(key), { ...record, key: normalizeWorkKey(key), handle: `planted-${record.holder.instanceId}` });
    },
  };
});

describeClaimProviderContract('InMemoryClaimProvider (skew margin)', () => {
  const clock = manualClock();
  const store = new InMemoryClaimStore();
  const skewMarginMs = 30_000;
  return {
    provider: (identity) => new InMemoryClaimProvider({ identity, now: clock.now, store, skewMarginMs }),
    advance: clock.advance,
    now: clock.now,
    plant: (key, record) => {
      store.set(workKeyToString(key), { ...record, key: normalizeWorkKey(key), handle: `planted-${record.holder.instanceId}` });
    },
    skewMarginMs,
  };
});

describe('workKeyToString', () => {
  it('produces platform:repo#id with platform and repo lower-cased', () => {
    expect(workKeyToString({ platform: 'GitHub', repo: 'BradyGaster/Squad', id: '123' })).toBe(
      'github:bradygaster/squad#123',
    );
  });

  it('keeps the id as-is', () => {
    expect(workKeyToString({ platform: 'planner', repo: 'Plan-X', id: 'AbC' })).toBe('planner:plan-x#AbC');
  });

  it('rejects empty fields and ambiguous delimiters', () => {
    expect(() => workKeyToString({ platform: '', repo: 'a/b', id: '1' })).toThrow(TypeError);
    expect(() => workKeyToString({ platform: 'github', repo: ' ', id: '1' })).toThrow(TypeError);
    expect(() => workKeyToString({ platform: 'github', repo: 'a/b', id: '' })).toThrow(TypeError);
    expect(() => workKeyToString({ platform: 'git:hub', repo: 'a/b', id: '1' })).toThrow(/platform/);
    expect(() => workKeyToString({ platform: 'github', repo: 'a#b', id: '1' })).toThrow(/repo/);
  });

  it('normalizeWorkKey does not mutate its input', () => {
    const key = { platform: 'GitHub', repo: 'A/B', id: '7' };
    expect(normalizeWorkKey(key)).toEqual({ platform: 'github', repo: 'a/b', id: '7' });
    expect(key.platform).toBe('GitHub');
  });
});

describe('resolveExecutorIdentity', () => {
  const hostname = () => 'host-from-os';

  it('prefers SQUAD_MACHINE_ID over everything else', () => {
    const id = resolveExecutorIdentity({
      env: { SQUAD_MACHINE_ID: 'env-machine', SQUAD_POD_ID: 'pod-1' },
      capabilities: { machine: 'cap-machine' },
      hostname,
    });
    expect(id.machineId).toBe('env-machine');
  });

  it('uses capabilities.machine when SQUAD_MACHINE_ID is unset', () => {
    const id = resolveExecutorIdentity({ env: { SQUAD_POD_ID: 'pod-1' }, capabilities: { machine: 'cap-machine' }, hostname });
    expect(id.machineId).toBe('cap-machine');
  });

  it('uses SQUAD_POD_ID when no machine id or capabilities machine is set', () => {
    expect(resolveExecutorIdentity({ env: { SQUAD_POD_ID: 'pod-1' }, capabilities: null, hostname }).machineId).toBe('pod-1');
    expect(resolveExecutorIdentity({ env: { SQUAD_POD_ID: 'pod-1' }, capabilities: {}, hostname }).machineId).toBe('pod-1');
  });

  it('falls back to a salted hostname pseudonym, never the raw hostname', () => {
    const id = resolveExecutorIdentity({ env: {}, hostname, hostnameSalt: '/repos/a' });
    expect(id.machineId).toMatch(/^h-[0-9a-f]{12}$/);
    expect(id.machineId).not.toContain('host-from-os');
    expect(id.machineId).toBe(hostnamePseudonym('host-from-os', '/repos/a'));
    expect(resolveExecutorIdentity({ env: {}, hostname, hostnameSalt: '/repos/a' }).machineId).toBe(id.machineId);
    expect(resolveExecutorIdentity({ env: {}, hostname, hostnameSalt: '/repos/b' }).machineId).not.toBe(id.machineId);
    expect(resolveExecutorIdentity({ env: {}, hostname }).machineId).toBe(hostnamePseudonym('host-from-os', process.cwd()));
    const real = os.hostname();
    if (real) expect(resolveExecutorIdentity({ env: {} }).machineId).not.toBe(real);
  });

  it('uses unknown-host when no hostname is available', () => {
    expect(resolveExecutorIdentity({ env: {}, hostname: () => '' }).machineId).toBe('unknown-host');
  });

  it('treats empty and whitespace values as unset', () => {
    const id = resolveExecutorIdentity({
      env: { SQUAD_MACHINE_ID: '  ', SQUAD_POD_ID: '' },
      capabilities: { machine: '' },
      hostname,
      hostnameSalt: 's',
    });
    expect(id.machineId).toBe(hostnamePseudonym('host-from-os', 's'));
  });

  it('generates one instanceId per process', () => {
    const first = resolveExecutorIdentity({ env: {}, hostname });
    const second = resolveExecutorIdentity({ env: { SQUAD_MACHINE_ID: 'other' }, hostname });
    expect(first.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.instanceId).toBe(first.instanceId);
  });

  it('accepts an injected instanceId and actor', () => {
    const id = resolveExecutorIdentity({ env: { SQUAD_MACHINE_ID: 'm' }, hostname, instanceId: 'fixed', actor: 'octocat' });
    expect(id).toEqual({ machineId: 'm', instanceId: 'fixed', actor: 'octocat' });
  });

  it('omits actor when not provided', () => {
    expect('actor' in resolveExecutorIdentity({ env: {}, hostname })).toBe(false);
  });
});

describe('claim defaults', () => {
  it('match ADR 002 initial values', () => {
    expect(DEFAULT_CLAIM_TTL_MS).toBe(15 * 60 * 1000);
    expect(DEFAULT_CLAIM_SKEW_MARGIN_MS).toBe(2 * 60 * 1000);
    expect(claimTimingError({ ttlMs: DEFAULT_CLAIM_TTL_MS, skewMarginMs: DEFAULT_CLAIM_SKEW_MARGIN_MS })).toBeNull();
  });
});

describe('claimTimingError (lease bounds)', () => {
  const HOUR = 60 * 60 * 1000;

  it('rejects ttlMs <= 2 * skewMarginMs (non-positive renew delay)', () => {
    expect(claimTimingError({ ttlMs: 60_000, skewMarginMs: 60_000 })).toMatch(/greater than twice/);
    expect(claimTimingError({ ttlMs: 240_000, skewMarginMs: 120_000 })).toMatch(/greater than twice/);
    expect(claimTimingError({ ttlMs: 240_001, skewMarginMs: 120_000 })).toBeNull();
  });

  it('rejects ttlMs below 30 s and above 24 h (setTimeout overflow)', () => {
    expect(MIN_CLAIM_TTL_MS).toBe(30_000);
    expect(MAX_CLAIM_TTL_MS).toBe(24 * HOUR);
    expect(claimTimingError({ ttlMs: 29_999, skewMarginMs: 0 })).toMatch(/at least 30000/);
    expect(claimTimingError({ ttlMs: 24 * HOUR + 1, skewMarginMs: 0 })).toMatch(/at most/);
    expect(claimTimingError({ ttlMs: 3 * 2 ** 31, skewMarginMs: 0 })).toMatch(/at most/);
    expect(claimTimingError({ ttlMs: 24 * HOUR, skewMarginMs: HOUR })).toBeNull();
  });

  it('caps skewMarginMs at 1 h and rejects non-finite values', () => {
    expect(MAX_CLAIM_SKEW_MARGIN_MS).toBe(HOUR);
    expect(claimTimingError({ ttlMs: 24 * HOUR, skewMarginMs: HOUR + 1 })).toMatch(/skewMarginMs must be at most/);
    expect(claimTimingError({ ttlMs: Number.NaN, skewMarginMs: 0 })).toMatch(/positive/);
    expect(claimTimingError({ ttlMs: 60_000, skewMarginMs: -1 })).toMatch(/non-negative/);
    expect(claimTimingError({ ttlMs: Infinity, skewMarginMs: 0 })).toMatch(/positive/);
  });

  it('minTtlMs: 0 keeps only the structural checks', () => {
    expect(claimTimingError({ ttlMs: 600, skewMarginMs: 0 }, { minTtlMs: 0 })).toBeNull();
    expect(claimTimingError({ ttlMs: 600, skewMarginMs: 600 }, { minTtlMs: 0 })).toMatch(/greater than twice/);
  });
});

describe('claimRecordImplausibility', () => {
  const now = 1_793_000_000_000;
  const ok = { epoch: 3, acquiredAt: now - 1_000, expiresAt: now + 60_000 };

  it('accepts records any legal holder could have written, including long-renewed ones', () => {
    expect(claimRecordImplausibility(ok, now)).toBeNull();
    expect(claimRecordImplausibility({ ...ok, acquiredAt: now - 30 * 24 * 3600_000 }, now)).toBeNull();
    expect(claimRecordImplausibility({ ...ok, expiresAt: now + MAX_CLAIM_TTL_MS + MAX_CLAIM_SKEW_MARGIN_MS }, now)).toBeNull();
    expect(claimRecordImplausibility({ ...ok, epoch: MAX_CLAIM_EPOCH }, now)).toBeNull();
  });

  it('flags impossible epochs and times', () => {
    expect(claimRecordImplausibility({ ...ok, expiresAt: 1e308 }, now)).toMatch(/expiresAt/);
    expect(claimRecordImplausibility({ ...ok, expiresAt: now + MAX_CLAIM_TTL_MS + MAX_CLAIM_SKEW_MARGIN_MS + 1 }, now)).toMatch(/expiresAt/);
    expect(claimRecordImplausibility({ ...ok, acquiredAt: now + MAX_CLAIM_SKEW_MARGIN_MS + 1 }, now)).toMatch(/acquiredAt/);
    expect(claimRecordImplausibility({ ...ok, epoch: Number.MAX_SAFE_INTEGER }, now)).toMatch(/epoch/);
    expect(claimRecordImplausibility({ ...ok, epoch: MAX_CLAIM_EPOCH + 1 }, now)).toMatch(/epoch/);
  });
});

describe('NoopClaimProvider', () => {
  it('reports no guarantees and never excludes', async () => {
    const p = new NoopClaimProvider({ identity: testIdentity(1) });
    expect(p.name).toBe('none');
    expect(p.guarantees).toEqual({ exclusion: 'none', leases: false, fencing: false });
    const key = { platform: 'github', repo: 'a/b', id: '1' };
    const results = await Promise.all(Array.from({ length: 4 }, () => p.acquire(key, { ttlMs: 1_000 })));
    expect(results.every((r) => r.status === 'acquired')).toBe(true);
  });
});

describe('InMemoryClaimProvider', () => {
  const key = { platform: 'github', repo: 'a/b', id: '1' };

  it('reports local guarantees', () => {
    const p = new InMemoryClaimProvider({ identity: testIdentity(1) });
    expect(p.name).toBe('in-memory');
    expect(p.guarantees).toEqual({ exclusion: 'local', leases: true, fencing: true });
  });

  it('8 concurrent acquires from one process on one key yield exactly one acquired', async () => {
    const store = new InMemoryClaimStore();
    const providers = Array.from({ length: 8 }, (_, i) => new InMemoryClaimProvider({ identity: testIdentity(i), store }));
    const results = await Promise.all(providers.map((p) => p.acquire(key, { ttlMs: 60_000 })));
    expect(results.map((r) => r.status).sort()).toEqual(['acquired', ...Array(7).fill('held')].sort());
    expect(store.size).toBe(1);
  });

  it('returns defensive copies of stored records', async () => {
    const p = new InMemoryClaimProvider({ identity: testIdentity(1) });
    const r = await p.acquire(key, { ttlMs: 60_000 });
    if (r.status !== 'acquired') throw new Error('expected acquired');
    r.claim.expiresAt = 0;
    r.claim.holder.instanceId = 'tampered';
    const seen = await p.inspect(key);
    expect(seen?.expiresAt).toBeGreaterThan(0);
    expect(seen?.holder.instanceId).toBe('instance-1');
  });

  it('separate stores do not share claims', async () => {
    const a = new InMemoryClaimProvider({ identity: testIdentity(1) });
    const b = new InMemoryClaimProvider({ identity: testIdentity(2) });
    expect((await a.acquire(key, { ttlMs: 60_000 })).status).toBe('acquired');
    expect((await b.acquire(key, { ttlMs: 60_000 })).status).toBe('acquired');
  });

  it('rejects a negative or over-cap skew margin', () => {
    expect(() => new InMemoryClaimProvider({ skewMarginMs: -1 })).toThrow(RangeError);
    expect(() => new InMemoryClaimProvider({ skewMarginMs: MAX_CLAIM_SKEW_MARGIN_MS + 1 })).toThrow(RangeError);
  });
});
