/**
 * Resolve the deterministic `squad_state` MCP launch spec shared by init and
 * upgrade.
 *
 * Resolution order:
 *   1. Standalone bundle launcher.
 *   2. Direct `node <absolute dist/cli-entry.js> state-mcp` for npm global or
 *      local installs.
 *   3. Exact running package version through npx.
 *
 * Dist-tags are intentionally never written. Registry mirrors frequently omit
 * `insider` and `preview`, while an installed entry point or exact version is
 * deterministic.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SquadStateMcpSpec {
  command: string;
  args: string[];
  source: 'standalone' | 'local-entry' | 'pinned';
  /** Portable exact-version fallback recorded beside machine-local specs. */
  fallback?: {
    command: 'npx';
    args: string[];
  };
}

const PACKAGE_NAME = '@bradygaster/squad-cli';

/** Retained as the shared projection hook; direct local specs stay direct. */
export function projectSquadStateMcpSpec(
  spec: SquadStateMcpSpec,
  _platform: NodeJS.Platform = process.platform,
): SquadStateMcpSpec {
  return spec;
}

/** Environment variable exported by standalone bundle launchers. */
export const STANDALONE_HOME_ENV = 'SQUAD_STANDALONE_HOME';

export interface ResolveSquadStateMcpSpecOptions {
  standaloneCheck?: () => string | null;
  localEntryCheck?: () => string | null;
}

/** Reset internal caches (test-only compatibility helper). */
export function _resetMcpSpecCache(): void {
  // The resolver no longer probes or caches registry state.
}

/** Locate the launcher of the standalone bundle this CLI is running from. */
export function detectStandaloneLauncher(): string | null {
  const home = process.env[STANDALONE_HOME_ENV];
  if (!home) return null;
  const candidates = process.platform === 'win32'
    ? ['squad.exe', 'squad.cmd', 'squad.ps1']
    : ['squad'];
  for (const candidate of candidates) {
    const full = path.join(home, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * Locate the installed JavaScript entry point that launched this CLI.
 *
 * Source checkouts use their built `dist/cli-entry.js` when present. This
 * keeps init/doctor fixtures and contributor builds offline-safe without
 * teaching Node to execute the TypeScript entry directly.
 */
export function detectInstalledCliEntry(): string | null {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (
    invoked &&
    path.basename(invoked).toLowerCase() === 'cli-entry.js' &&
    existsSync(invoked)
  ) {
    return invoked;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const moduleDir = path.dirname(currentFile);
  const candidates = [
    path.resolve(moduleDir, '..', '..', 'cli-entry.js'),
    path.resolve(moduleDir, '..', '..', '..', 'dist', 'cli-entry.js'),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

/** Resolve the squad_state launch spec for the running CLI version. */
export async function resolveSquadStateMcpSpec(
  cliVersion: string,
  options: ResolveSquadStateMcpSpecOptions = {},
): Promise<SquadStateMcpSpec> {
  const fallback = exactVersionFallback(cliVersion);

  const detectStandalone = options.standaloneCheck ?? detectStandaloneLauncher;
  const launcher = detectStandalone();
  if (launcher) {
    return {
      command: launcher,
      args: ['state-mcp'],
      source: 'standalone',
      fallback,
    };
  }

  const detectEntry = options.localEntryCheck ?? detectInstalledCliEntry;
  const entry = detectEntry();
  if (entry) {
    return {
      command: process.execPath,
      args: [entry, 'state-mcp'],
      source: 'local-entry',
      fallback,
    };
  }

  return {
    command: fallback.command,
    args: [...fallback.args],
    source: 'pinned',
  };
}

function exactVersionFallback(version: string): { command: 'npx'; args: string[] } {
  return {
    command: 'npx',
    args: ['-y', `${PACKAGE_NAME}@${version}`, 'state-mcp'],
  };
}
