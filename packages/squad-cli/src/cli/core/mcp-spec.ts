/**
 * Shared helper for resolving the `squad_state` MCP launch spec.
 *
 * Used by BOTH `squad init` and `squad upgrade` so the runtime-MCP fallback
 * behavior stays symmetric.
 *
 * Resolution order (iter-7, simplified to 2 tiers):
 *   1. If `cliVersion` IS published on npm → `npx -y <pkg>@<version> state-mcp`
 *      (clean cross-machine UX, the steady-state happy path).
 *   2. Else → `npx -y <pkg>@insider state-mcp`. We do NOT probe the registry;
 *      the `@insider` dist-tag is kept fresh by the publish flow and tier-2
 *      is the de-facto fallback whenever a pinned preview version isn't yet
 *      published. If it really isn't reachable at runtime, `npx` will fail
 *      loudly — same observable behavior as pre-iter-5.
 *
 * Iter-6 had two additional tiers (a local-install path resolver and a hard
 * error) that the smoke data showed never fired in practice: `@insider` is
 * always current, so tier-2 always wins before tier-3 is reached. Deleted
 * in iter-7 per the "verify you didn't add code that's no longer needed"
 * mandate.
 */

export interface SquadStateMcpSpec {
  /** Executable to spawn (always `npx` after iter-7). */
  command: string;
  /** Argv for the executable. */
  args: string[];
  /** How the spec was resolved — useful for logging + tests. */
  source: 'pinned' | 'insider';
}

const PACKAGE_NAME = '@bradygaster/squad-cli';

export interface ResolveSquadStateMcpSpecOptions {
  /**
   * Override the published-version check. Tests inject this to avoid real
   * network traffic.
   */
  publishedCheck?: (version: string) => Promise<boolean>;
}

/** Reset internal caches (test-only helper; retained for compat). */
export function _resetMcpSpecCache(): void {
  // no caches in the 2-tier resolver — kept as a no-op for backward compat
  // with any test that still calls it.
}

/**
 * Resolve the squad_state MCP launch spec given the running CLI version.
 *
 * Always returns a spec. If the pinned version is unpublished we fall back
 * to `@insider`; if even that turns out to be unreachable at runtime, `npx`
 * will fail visibly when Copilot launches the MCP server — same behavior
 * as pre-iter-5.
 */
export async function resolveSquadStateMcpSpec(
  cliVersion: string,
  options: ResolveSquadStateMcpSpecOptions = {},
): Promise<SquadStateMcpSpec> {
  // 1. Try the pinned version on the public registry. Skip for placeholder
  //    versions ('', '0.0.0') — the registry will obviously not have them.
  if (cliVersion && cliVersion !== '0.0.0') {
    const probe = options.publishedCheck ?? defaultPublishedCheck;
    const published = await probe(cliVersion);
    if (published) {
      return {
        command: 'npx',
        args: ['-y', `${PACKAGE_NAME}@${cliVersion}`, 'state-mcp'],
        source: 'pinned',
      };
    }
  }

  // 2. Fall back to the @insider dist-tag — always returned, never probed.
  return {
    command: 'npx',
    args: ['-y', `${PACKAGE_NAME}@insider`, 'state-mcp'],
    source: 'insider',
  };
}

async function defaultPublishedCheck(version: string): Promise<boolean> {
  const { isSquadCliVersionPublished } = await import('./npm-registry.js');
  return await isSquadCliVersionPublished(version);
}
