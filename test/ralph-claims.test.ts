import { describe, it, expect } from 'vitest';
import os from 'node:os';
import {
  InMemoryClaimProvider,
  InMemoryClaimStore,
  NoopClaimProvider,
  DEFAULT_CLAIM_SKEW_MARGIN_MS,
  DEFAULT_CLAIM_TTL_MS,
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
  };
});

describeClaimProviderContract('InMemoryClaimProvider (skew margin)', () => {
  const clock = manualClock();
  const store = new InMemoryClaimStore();
  const skewMarginMs = 30_000;
  return {
    provider: (identity) => new InMemoryClaimProvider({ identity, now: clock.now, store, skewMarginMs }),
    advance: clock.advance,
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

  it('falls back to the hostname', () => {
    expect(resolveExecutorIdentity({ env: {}, hostname }).machineId).toBe('host-from-os');
    expect(resolveExecutorIdentity({ env: {} }).machineId).toBe(os.hostname() || 'unknown-host');
  });

  it('treats empty and whitespace values as unset', () => {
    const id = resolveExecutorIdentity({
      env: { SQUAD_MACHINE_ID: '  ', SQUAD_POD_ID: '' },
      capabilities: { machine: '' },
      hostname,
    });
    expect(id.machineId).toBe('host-from-os');
  });

  it('generates one instanceId per process', () => {
    const first = resolveExecutorIdentity({ env: {}, hostname });
    const second = resolveExecutorIdentity({ env: { SQUAD_MACHINE_ID: 'other' }, hostname });
    expect(first.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.instanceId).toBe(first.instanceId);
  });

  it('accepts an injected instanceId and actor', () => {
    const id = resolveExecutorIdentity({ env: {}, hostname, instanceId: 'fixed', actor: 'octocat' });
    expect(id).toEqual({ machineId: 'host-from-os', instanceId: 'fixed', actor: 'octocat' });
  });

  it('omits actor when not provided', () => {
    expect('actor' in resolveExecutorIdentity({ env: {}, hostname })).toBe(false);
  });
});

describe('claim defaults', () => {
  it('match ADR 002 initial values', () => {
    expect(DEFAULT_CLAIM_TTL_MS).toBe(15 * 60 * 1000);
    expect(DEFAULT_CLAIM_SKEW_MARGIN_MS).toBe(2 * 60 * 1000);
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

  it('rejects a negative skew margin', () => {
    expect(() => new InMemoryClaimProvider({ skewMarginMs: -1 })).toThrow(RangeError);
  });
});
