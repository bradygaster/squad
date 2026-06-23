/**
 * Lightweight helper to check whether a specific package version exists in the
 * public npm registry. Used by `ensureSquadStateMcpPinned` to avoid pinning a
 * `squad_state` MCP launch spec to a version that `npx` cannot resolve
 * (which would cause an ETARGET at session start and leave the bridge unwired).
 *
 * The result is cached per-process to avoid repeated lookups across the
 * multi-pass upgrade flow. Network failures and non-200 responses are
 * conservatively treated as "version not published" so that we fall back to
 * the locally-installed binary rather than pinning a bad spec.
 *
 * See `.squad/files/validation/MCP-LOADER-ROOT-CAUSE.md` (data-15 Option A).
 */

const cache = new Map<string, boolean>();

/** Reset the cache (test-only helper). */
export function _resetNpmRegistryCache(): void {
  cache.clear();
}

/**
 * Returns true if `@bradygaster/squad-cli@<version>` is reachable on the npm
 * registry, false on any network failure / 404 / non-publishable response.
 *
 * Uses Node's built-in `https` so we don't pull in extra deps. Total budget
 * is bounded by `timeoutMs` (default 2s) so a slow / offline registry can
 * never block CLI startup.
 */
export async function isSquadCliVersionPublished(
  version: string,
  timeoutMs = 2000,
): Promise<boolean> {
  if (!version || version === '0.0.0') return false;
  const cacheKey = version;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = `https://registry.npmjs.org/@bradygaster%2Fsquad-cli/${encodeURIComponent(version)}`;
  const ok = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    void import('node:https')
      .then(({ request }) => {
        const req = request(url, { method: 'GET' }, (res) => {
          // Drain to free the socket.
          res.resume();
          finish(res.statusCode === 200);
        });
        req.on('error', () => finish(false));
        req.on('timeout', () => {
          req.destroy();
          finish(false);
        });
        req.setTimeout(timeoutMs);
        req.end();
      })
      .catch(() => finish(false))
      .finally(() => clearTimeout(timer));
  });

  cache.set(cacheKey, ok);
  return ok;
}
