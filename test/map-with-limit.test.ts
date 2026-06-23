/**
 * Tests for mapWithLimit / mapWithLimitSettled — the bounded-concurrency
 * helper used by parallel charter discovery (config/agent-source.ts) and
 * CharterCompiler.compileAll (agents/index.ts).
 *
 * Coverage focuses on the four properties the helper guarantees:
 *   1. **Order preservation** — results come back in input order regardless
 *      of completion order.
 *   2. **Concurrency bound** — at most `limit` operations in flight at any
 *      one moment.
 *   3. **Failure handling** —
 *        a. mapWithLimit rejects on first failure.
 *        b. mapWithLimitSettled never throws; surfaces per-item status.
 *   4. **Edge cases** — empty input, limit > items.length, limit < 1.
 */

import { describe, it, expect } from 'vitest';
import {
  mapWithLimit,
  mapWithLimitSettled,
} from '../packages/squad-sdk/src/utils/map-with-limit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A deferred promise resolver — lets a test wait until N calls have started
 * before releasing them. Used to assert real concurrency, not just speed.
 */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// mapWithLimit
// ---------------------------------------------------------------------------

describe('mapWithLimit', () => {
  it('returns results in input order regardless of completion order', async () => {
    // Reverse-order completion: index 0 sleeps longest, index N-1 finishes first.
    const inputs = [0, 1, 2, 3, 4, 5];
    const out = await mapWithLimit(inputs, 3, async (n) => {
      const sleepMs = (inputs.length - n) * 5;
      await new Promise((r) => setTimeout(r, sleepMs));
      return n * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('caps concurrency at `limit` operations in flight', async () => {
    const limit = 3;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = deferred();

    // Each task increments inFlight on entry, waits for the gate to release
    // it (after we've observed max concurrency), then decrements.
    const taskPromise = mapWithLimit(items, limit, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight--;
      return n;
    });

    // Yield long enough for all workers to have started and be parked.
    // The pool spawns Math.min(limit, items.length) workers immediately.
    await new Promise((r) => setTimeout(r, 25));

    expect(maxInFlight).toBe(limit);

    gate.resolve();
    const out = await taskPromise;
    expect(out).toEqual(items);
  });

  it('passes the item index to the mapper', async () => {
    const indices: number[] = [];
    await mapWithLimit(['a', 'b', 'c'], 2, async (item, index) => {
      indices.push(index);
      return item;
    });
    expect([...indices].sort()).toEqual([0, 1, 2]);
  });

  it('returns an empty array for empty input (no workers spawned)', async () => {
    const out = await mapWithLimit([], 5, async () => {
      throw new Error('mapper should not be called for empty input');
    });
    expect(out).toEqual([]);
  });

  it('handles limit > items.length without spawning idle workers', async () => {
    let invocations = 0;
    const out = await mapWithLimit([1, 2], 100, async (n) => {
      invocations++;
      return n;
    });
    expect(out).toEqual([1, 2]);
    expect(invocations).toBe(2);
  });

  it('rejects on the first mapper failure (fast-fail semantics)', async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('throws synchronously for limit < 1', async () => {
    await expect(mapWithLimit([1], 0, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
    await expect(mapWithLimit([1], -1, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
    await expect(mapWithLimit([1], Number.NaN, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
  });
});

// ---------------------------------------------------------------------------
// mapWithLimitSettled
// ---------------------------------------------------------------------------

describe('mapWithLimitSettled', () => {
  it('returns per-item status in input order; one failure does not abort the batch', async () => {
    const results = await mapWithLimitSettled([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error(`fail-${n}`);
      return n * 10;
    });

    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results[1]?.status).toBe('rejected');
    if (results[1]?.status === 'rejected') {
      expect((results[1].reason as Error).message).toBe('fail-2');
    }
    expect(results[2]).toEqual({ status: 'fulfilled', value: 30 });
    expect(results[3]).toEqual({ status: 'fulfilled', value: 40 });
  });

  it('preserves order under reverse-order completion', async () => {
    const inputs = [0, 1, 2, 3, 4, 5];
    const results = await mapWithLimitSettled(inputs, 3, async (n) => {
      const sleepMs = (inputs.length - n) * 5;
      await new Promise((r) => setTimeout(r, sleepMs));
      return n;
    });
    expect(
      results.map((r) =>
        r.status === 'fulfilled' ? r.value : null,
      ),
    ).toEqual(inputs);
  });

  it('caps concurrency at `limit`', async () => {
    const limit = 2;
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = deferred();
    const task = mapWithLimitSettled([1, 2, 3, 4, 5], limit, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise;
      inFlight--;
      return 1;
    });
    await new Promise((r) => setTimeout(r, 25));
    expect(maxInFlight).toBe(limit);
    gate.resolve();
    await task;
  });

  it('returns [] for empty input', async () => {
    const out = await mapWithLimitSettled([], 3, async () => 1);
    expect(out).toEqual([]);
  });

  it('throws synchronously for limit < 1', async () => {
    await expect(
      mapWithLimitSettled([1], 0, async (n) => n),
    ).rejects.toThrow(/positive integer/);
  });
});
