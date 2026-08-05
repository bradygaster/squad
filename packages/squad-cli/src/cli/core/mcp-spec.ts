/**
 * Shared helper for resolving the `squad_state` MCP launch spec.
 *
 * Used by BOTH `squad init` and `squad upgrade` so the runtime-MCP fallback
 * behavior stays symmetric.
 *
 * Resolution order:
 *   0. If Squad is running from a standalone bundle (`SQUAD_STANDALONE_HOME`,
 *      exported by the bundle launcher) → spawn that bundle's launcher
 *      directly with an absolute path. This tier short-circuits *before* any
 *      registry probe, so a machine that cannot reach registry.npmjs.org
 *      never makes a network call here and never writes an `npx` spec it
 *      cannot execute later (#1593).
 *   1. Else if `cliVersion` IS published on npm → `npx -y <pkg>@<version>
 *      state-mcp` (clean cross-machine UX, the steady-state happy path).
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

import { existsSync } from 'node:fs';
import path from 'node:path';

export interface SquadStateMcpSpec {
  /** Executable to spawn — `npx`, or an absolute launcher path when bundled. */
  command: string;
  /** Argv for the executable. */
  args: string[];
  /** How the spec was resolved — useful for logging + tests. */
  source: 'standalone' | 'pinned' | 'insider';
}

const PACKAGE_NAME = '@bradygaster/squad-cli';

/**
 * Environment variable exported by the standalone bundle launchers
 * (`squad`, `squad.cmd`, `squad.ps1`) pointing at the bundle root.
 */
export const STANDALONE_HOME_ENV = 'SQUAD_STANDALONE_HOME';

export interface ResolveSquadStateMcpSpecOptions {
  /**
   * Override the published-version check. Tests inject this to avoid real
   * network traffic.
   */
  publishedCheck?: (version: string) => Promise<boolean>;
  /**
   * Override standalone-bundle detection. Returns the absolute path to the
   * bundle launcher, or null when not running from a bundle. Tests inject
   * this to avoid touching the filesystem or process env.
   */
  standaloneCheck?: () => string | null;
}

/** Reset internal caches (test-only helper; retained for compat). */
export function _resetMcpSpecCache(): void {
  // no caches in the resolver — kept as a no-op for backward compat
  // with any test that still calls it.
}

/**
 * Locate the launcher of the standalone bundle this CLI is running from.
 *
 * Returns an absolute path, or null when not running from a bundle. The
 * absolute path matters: Copilot spawns the MCP server itself, in an
 * environment that will not necessarily have the bundle on PATH or
 * `SQUAD_STANDALONE_HOME` set, so the written spec has to stand alone.
 */
export function detectStandaloneLauncher(): string | null {
  const home = process.env[STANDALONE_HOME_ENV];
  if (!home) return null;
  const candidates = process.platform === 'win32'
    ? ['squad.cmd', 'squad.ps1']
    : ['squad'];
  for (const candidate of candidates) {
    const full = path.join(home, candidate);
    if (existsSync(full)) return full;
  }
  return null;
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
  // 0. Running from a standalone bundle — point at our own launcher and skip
  //    the registry entirely. Deliberately first: writing an `npx` spec on a
  //    machine installed from a bundle would leave squad_state unwired the
  //    moment the npm registry is unreachable (#1593).
  const detect = options.standaloneCheck ?? detectStandaloneLauncher;
  const launcher = detect();
  if (launcher) {
    return {
      command: launcher,
      args: ['state-mcp'],
      source: 'standalone',
    };
  }

  // 1. Try the pinned version on the public registry. Skip for placeholder
  //    versions ('', '0.0.0') and local/dev builds with build metadata ('+')
  //    — the registry will obviously not have them (#1204).
  if (cliVersion && cliVersion !== '0.0.0' && !cliVersion.includes('+')) {
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
