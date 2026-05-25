/**
 * Bounded-concurrency helper for fan-out async work.
 *
 * @module utils/map-with-limit
 */

/**
 * Run `fn` against each item with at most `limit` operations in flight.
 *
 * Results are returned in **input order**, regardless of the order in which
 * individual promises settle. This matches the semantics callers usually
 * want when migrating from a sequential `for (const x of xs) { result.push(await fn(x)); }`
 * pattern: ordering is preserved, but throughput is bounded.
 *
 * Errors propagate via the returned Promise. Use `mapWithLimitSettled()`
 * when individual failures should not abort the batch.
 *
 * @example
 *   // 8 charters fetched 5-at-a-time over HTTP:
 *   const manifests = await mapWithLimit(dirs, 5, (dir) => fetchCharter(dir));
 *
 * @param items     Inputs to map over.
 * @param limit     Maximum concurrent calls (must be ≥ 1).
 * @param fn        Async mapper.
 * @returns Array of results in the same order as `items`.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1 || !Number.isFinite(limit)) {
    throw new Error(`mapWithLimit: limit must be a positive integer, got ${limit}`);
  }
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Variant of {@link mapWithLimit} that captures individual failures rather
 * than aborting on the first rejection. Returns an array of
 * `{ status: 'fulfilled', value }` / `{ status: 'rejected', reason }` in
 * input order — identical shape to `Promise.allSettled`.
 *
 * Use this when one bad input (e.g. a corrupt charter.md) should not stop
 * the whole batch.
 */
export async function mapWithLimitSettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  if (limit < 1 || !Number.isFinite(limit)) {
    throw new Error(`mapWithLimitSettled: limit must be a positive integer, got ${limit}`);
  }
  if (items.length === 0) return [];

  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try {
        const value = await fn(items[idx]!, idx);
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
