/**
 * Reusable WorkClaimProvider contract suite (ADR 002).
 *
 * Every provider (in-memory, git-ref, future backends) runs the same suite;
 * checks are gated on the provider's declared `guarantees`, so a provider with
 * `exclusion: 'none'` is held only to the uniform-flow checks.
 *
 * Usage:
 *   describeClaimProviderContract('InMemoryClaimProvider', () => {
 *     const clock = manualClock();
 *     const store = new InMemoryClaimStore();
 *     return {
 *       provider: (identity) => new InMemoryClaimProvider({ identity, now: clock.now, store }),
 *       advance: clock.advance,
 *     };
 *   });
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ClaimRecord,
  ExecutorIdentity,
  WorkClaimProvider,
  WorkKey,
} from '@bradygaster/squad-sdk/ralph/claims';

export interface ClaimProviderHarness {
  /** A provider acting as `identity`. All providers from one harness share one backend. */
  provider(identity: ExecutorIdentity): WorkClaimProvider | Promise<WorkClaimProvider>;
  /** Move the clock every provider of this harness reads. */
  advance(ms: number): void | Promise<void>;
  /** Current harness clock (Unix ms); required for the plausibility checks. */
  now?(): number;
  /**
   * Write `record` directly into the backend for `key`, bypassing the
   * provider (models a forged or buggy holder). Enables the plausibility checks.
   */
  plant?(key: WorkKey, record: Omit<ClaimRecord, 'key' | 'handle'>): void | Promise<void>;
  /** Margin the provider waits past `expiresAt` before takeover. Default 0. */
  skewMarginMs?: number;
  /** Tear down backend resources (temp repos, servers). */
  dispose?(): void | Promise<void>;
}

export interface ClaimProviderContractOptions {
  /** Lease used by the suite. Default 60 000 ms. */
  ttlMs?: number;
  /** Number of concurrent contenders in the race check. Default 8. */
  contenders?: number;
  /** Per-test timeout, for slower transports. */
  timeoutMs?: number;
}

/** Deterministic clock for harnesses. */
export function manualClock(start = 1_793_000_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

export function testIdentity(n: number): ExecutorIdentity {
  return { machineId: `machine-${n}`, instanceId: `instance-${n}` };
}

let keySeq = 0;
function freshKey(): WorkKey {
  keySeq += 1;
  return { platform: 'github', repo: 'contract/claims', id: String(keySeq) };
}

function expectAcquired(result: Awaited<ReturnType<WorkClaimProvider['acquire']>>): ClaimRecord {
  expect(result.status, JSON.stringify(result)).toBe('acquired');
  if (result.status !== 'acquired') throw new Error('unreachable');
  return result.claim;
}

export function describeClaimProviderContract(
  name: string,
  createHarness: () => ClaimProviderHarness | Promise<ClaimProviderHarness>,
  options: ClaimProviderContractOptions = {},
): void {
  const ttlMs = options.ttlMs ?? 60_000;
  const contenders = options.contenders ?? 8;
  const timeout = options.timeoutMs;

  describe(`WorkClaimProvider contract: ${name}`, () => {
    let harness: ClaimProviderHarness;
    let a: WorkClaimProvider;
    let b: WorkClaimProvider;
    const idA = testIdentity(1);
    const idB = testIdentity(2);
    let skew = 0;

    beforeEach(async () => {
      harness = await createHarness();
      a = await harness.provider(idA);
      b = await harness.provider(idB);
      skew = harness.skewMarginMs ?? 0;
    });

    afterEach(async () => {
      await harness?.dispose?.();
    });

    const pastExpiry = () => ttlMs + skew + 1;

    describe('uniform flow (all providers)', () => {
      it('declares a name and well-formed guarantees', () => {
        expect(typeof a.name).toBe('string');
        expect(a.name.length).toBeGreaterThan(0);
        expect(['none', 'local', 'distributed']).toContain(a.guarantees.exclusion);
        expect(typeof a.guarantees.leases).toBe('boolean');
        expect(typeof a.guarantees.fencing).toBe('boolean');
      });

      it('acquire returns a well-formed claim for the caller', async () => {
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        expect(claim.key).toEqual(key);
        expect(claim.holder.machineId).toBe(idA.machineId);
        expect(claim.holder.instanceId).toBe(idA.instanceId);
        expect(typeof claim.handle).toBe('string');
        expect(claim.handle.length).toBeGreaterThan(0);
        expect(claim.epoch).toBeGreaterThanOrEqual(1);
        expect(claim.expiresAt - claim.acquiredAt).toBe(ttlMs);
      }, timeout);

      it('acquire records platform and repo lower-cased', async () => {
        const claim = expectAcquired(
          await a.acquire({ platform: 'GitHub', repo: 'Contract/Claims', id: `${freshKey().id}` }, { ttlMs }),
        );
        expect(claim.key.platform).toBe('github');
        expect(claim.key.repo).toBe('contract/claims');
      }, timeout);

      it('renew increments epoch, extends expiry, and issues a new handle', async () => {
        const claim = expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        await harness.advance(1_000);
        const renewed = await a.renew(claim, { ttlMs });
        expect(renewed.status).toBe('renewed');
        if (renewed.status !== 'renewed') return;
        expect(renewed.claim.epoch).toBe(claim.epoch + 1);
        expect(renewed.claim.expiresAt).toBe(claim.expiresAt + 1_000);
        expect(renewed.claim.acquiredAt).toBe(claim.acquiredAt);
        expect(renewed.claim.holder).toEqual(claim.holder);
        expect(renewed.claim.handle).not.toBe(claim.handle);
      }, timeout);

      it('release of a live claim returns released', async () => {
        const claim = expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        expect(await a.release(claim, 'completed')).toEqual({ status: 'released' });
      }, timeout);

      it('rejects a non-positive ttl', async () => {
        await expect(a.acquire(freshKey(), { ttlMs: 0 })).rejects.toThrow(RangeError);
      }, timeout);

      it('rejects a ttl above 24 hours (it would write an implausible lease)', async () => {
        await expect(a.acquire(freshKey(), { ttlMs: 24 * 60 * 60 * 1000 + 1 })).rejects.toThrow(RangeError);
      }, timeout);
    });

    describe('exclusion', () => {
      const skipUnlessExclusive = () => a.guarantees.exclusion === 'none';

      it('a second holder gets held with the current record', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        const result = await b.acquire(key, { ttlMs });
        expect(result.status).toBe('held');
        if (result.status !== 'held') return;
        expect(result.by.holder.instanceId).toBe(idA.instanceId);
        expect(result.by.handle).toBe(claim.handle);
        expect(result.by.epoch).toBe(claim.epoch);
      }, timeout);

      it('the same holder re-acquiring a live claim gets held', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const key = freshKey();
        expectAcquired(await a.acquire(key, { ttlMs }));
        expect((await a.acquire(key, { ttlMs })).status).toBe('held');
      }, timeout);

      it('keys differing only in platform/repo case contend', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const id = freshKey().id;
        expectAcquired(await a.acquire({ platform: 'GitHub', repo: 'Contract/Claims', id }, { ttlMs }));
        expect((await b.acquire({ platform: 'github', repo: 'contract/claims', id }, { ttlMs })).status).toBe('held');
      }, timeout);

      it('different keys do not contend', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        expectAcquired(await b.acquire(freshKey(), { ttlMs }));
      }, timeout);

      it(`${contenders} concurrent acquires on one key yield exactly one acquired`, async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const key = freshKey();
        const providers = await Promise.all(
          Array.from({ length: contenders }, (_, i) => harness.provider(testIdentity(100 + i))),
        );
        const results = await Promise.all(providers.map((p) => p.acquire(key, { ttlMs })));
        const acquired = results.filter((r) => r.status === 'acquired');
        const held = results.filter((r) => r.status === 'held');
        expect(acquired, JSON.stringify(results.map((r) => r.status))).toHaveLength(1);
        expect(held).toHaveLength(contenders - 1);
        const winner = (acquired[0] as { claim: ClaimRecord }).claim;
        for (const r of held) {
          expect((r as { by: ClaimRecord }).by.holder.instanceId).toBe(winner.holder.instanceId);
        }
      }, timeout);

      it('after release another holder can acquire', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        expect((await a.release(claim, 'completed')).status).toBe('released');
        const next = expectAcquired(await b.acquire(key, { ttlMs }));
        expect(next.holder.instanceId).toBe(idB.instanceId);
      }, timeout);

      it('releasing twice returns already-released', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const claim = expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        expect((await a.release(claim, 'completed')).status).toBe('released');
        expect((await a.release(claim, 'completed')).status).toBe('already-released');
      }, timeout);

      it('renewing a released claim is fenced', async (ctx) => {
        if (skipUnlessExclusive()) return ctx.skip();
        const claim = expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        await a.release(claim, 'cancelled');
        expect((await a.renew(claim, { ttlMs })).status).toBe('fenced');
      }, timeout);

      it('inspect reports the live claim, and null once released', async (ctx) => {
        if (skipUnlessExclusive() || !a.inspect) return ctx.skip();
        const key = freshKey();
        expect(await a.inspect(key)).toBeNull();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        const seen = await b.inspect!(key);
        expect(seen?.handle).toBe(claim.handle);
        expect(seen?.holder.instanceId).toBe(idA.instanceId);
        await a.release(claim, 'completed');
        expect(await a.inspect(key)).toBeNull();
      }, timeout);
    });

    describe('fencing (compare-and-swap on handle)', () => {
      const skipUnlessFencing = () => !a.guarantees.fencing;

      it('renew with a stale handle is fenced and reports the current record', async (ctx) => {
        if (skipUnlessFencing()) return ctx.skip();
        const claim = expectAcquired(await a.acquire(freshKey(), { ttlMs }));
        const renewed = await a.renew(claim, { ttlMs });
        if (renewed.status !== 'renewed') throw new Error(`expected renewed, got ${renewed.status}`);
        const stale = await a.renew(claim, { ttlMs });
        expect(stale.status).toBe('fenced');
        if (stale.status === 'fenced') expect(stale.by?.handle).toBe(renewed.claim.handle);
      }, timeout);

      it('release with a stale handle is fenced and leaves the claim in place', async (ctx) => {
        if (skipUnlessFencing()) return ctx.skip();
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        const renewed = await a.renew(claim, { ttlMs });
        if (renewed.status !== 'renewed') throw new Error(`expected renewed, got ${renewed.status}`);
        expect((await a.release(claim, 'abandoned')).status).toBe('fenced');
        expect((await b.acquire(key, { ttlMs })).status).toBe('held');
        expect((await a.release(renewed.claim, 'completed')).status).toBe('released');
      }, timeout);
    });

    describe('leases', () => {
      const skipUnlessLeases = () => !a.guarantees.leases || a.guarantees.exclusion === 'none';

      it('a claim is held until expiry plus skew margin', async (ctx) => {
        if (skipUnlessLeases()) return ctx.skip();
        const key = freshKey();
        expectAcquired(await a.acquire(key, { ttlMs }));
        await harness.advance(ttlMs + skew);
        expect((await b.acquire(key, { ttlMs })).status).toBe('held');
      }, timeout);

      it('an expired claim is taken over with epoch + 1 and the old holder is fenced', async (ctx) => {
        if (skipUnlessLeases()) return ctx.skip();
        const key = freshKey();
        const old = expectAcquired(await a.acquire(key, { ttlMs }));
        await harness.advance(pastExpiry());
        const taken = expectAcquired(await b.acquire(key, { ttlMs }));
        expect(taken.holder.instanceId).toBe(idB.instanceId);
        expect(taken.epoch).toBe(old.epoch + 1);
        expect(taken.handle).not.toBe(old.handle);

        const renew = await a.renew(old, { ttlMs });
        expect(renew.status).toBe('fenced');
        if (renew.status === 'fenced') expect(renew.by?.holder.instanceId).toBe(idB.instanceId);
        expect((await a.release(old, 'abandoned')).status).toBe('fenced');
        expect((await a.acquire(key, { ttlMs })).status).toBe('held');
      }, timeout);

      it('renewal extends the lease past the original expiry', async (ctx) => {
        if (skipUnlessLeases()) return ctx.skip();
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        await harness.advance(Math.floor(ttlMs / 2));
        expect((await a.renew(claim, { ttlMs })).status).toBe('renewed');
        await harness.advance(Math.ceil(ttlMs / 2) + skew + 1);
        expect((await b.acquire(key, { ttlMs })).status).toBe('held');
      }, timeout);

      it('an expired claim not yet taken over can still be renewed by its holder', async (ctx) => {
        if (skipUnlessLeases()) return ctx.skip();
        const key = freshKey();
        const claim = expectAcquired(await a.acquire(key, { ttlMs }));
        await harness.advance(pastExpiry());
        const renewed = await a.renew(claim, { ttlMs });
        expect(renewed.status).toBe('renewed');
        expect((await b.acquire(key, { ttlMs })).status).toBe('held');
      }, timeout);

      it('concurrent takeover of an expired claim yields exactly one winner', async (ctx) => {
        if (skipUnlessLeases()) return ctx.skip();
        const key = freshKey();
        const old = expectAcquired(await a.acquire(key, { ttlMs }));
        await harness.advance(pastExpiry());
        const providers = await Promise.all(
          Array.from({ length: contenders }, (_, i) => harness.provider(testIdentity(200 + i))),
        );
        const results = await Promise.all(providers.map((p) => p.acquire(key, { ttlMs })));
        const acquired = results.filter((r) => r.status === 'acquired');
        expect(acquired, JSON.stringify(results.map((r) => r.status))).toHaveLength(1);
        expect((acquired[0] as { claim: ClaimRecord }).claim.epoch).toBe(old.epoch + 1);
      }, timeout);
    });

    describe('plausibility (implausible records are taken over as expired)', () => {
      const DAY = 24 * 60 * 60 * 1000;
      const HOUR = 60 * 60 * 1000;
      const skipUnlessPlantable = () =>
        !harness.plant || !harness.now || !a.guarantees.leases || a.guarantees.exclusion === 'none';
      const forged = (n: number, patch: Partial<ClaimRecord>): Omit<ClaimRecord, 'key' | 'handle'> => {
        const t = harness.now!();
        return { holder: testIdentity(900 + n), epoch: 1, acquiredAt: t, expiresAt: t + ttlMs, ...patch };
      };
      const cases: Array<[string, (t: number) => Partial<ClaimRecord>]> = [
        ['expiresAt beyond the longest legal lease (1e308)', () => ({ expiresAt: 1e308 })],
        ['expiresAt more than 25h ahead', (t) => ({ expiresAt: t + DAY + HOUR + 60_000 })],
        ['epoch beyond 2^52', () => ({ epoch: Number.MAX_SAFE_INTEGER })],
        ['acquiredAt more than 1h in the future', (t) => ({ acquiredAt: t + HOUR + 60_000, expiresAt: t + HOUR + 60_000 + ttlMs })],
      ];
      for (const [label, patch] of cases) {
        it(`takes over a record with ${label}`, async (ctx) => {
          if (skipUnlessPlantable()) return ctx.skip();
          const key = freshKey();
          await harness.plant!(key, forged(1, patch(harness.now!())));
          const taken = expectAcquired(await b.acquire(key, { ttlMs }));
          expect(taken.holder.instanceId).toBe(idB.instanceId);
          expect(taken.epoch).toBe(1);
          expect((await a.acquire(key, { ttlMs })).status).toBe('held');
        }, timeout);
      }

      it('still honors a plausible live record planted the same way', async (ctx) => {
        if (skipUnlessPlantable()) return ctx.skip();
        const key = freshKey();
        await harness.plant!(key, forged(2, { epoch: 7 }));
        const result = await b.acquire(key, { ttlMs });
        expect(result.status).toBe('held');
        if (result.status === 'held') expect(result.by.epoch).toBe(7);
      }, timeout);
    });
  });
}
