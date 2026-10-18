/**
 * Shared `--client` handling for `squad init` and `squad upgrade`.
 *
 * Persists configured clients to `.squad/config.json` (`clients: string[]`)
 * and (re)projects each client's host files without clobbering user settings.
 *
 * @module cli/core/clients
 */

import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_IDS, installClients, normalizeClientIds, parseClients, type ApplyResult, type ClientId } from '@bradygaster/squad-sdk/clients';
import { projectSquadStateMcpSpec, resolveSquadStateMcpSpec } from './mcp-spec.js';
import { getPackageVersion } from './version.js';

export { CLIENT_IDS, parseClients };

/** Extract `--client <list>` / `--client=<list>` from argv. Returns undefined when absent. */
export function readClientFlag(args: readonly string[]): ClientId[] | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--client' || a === '--clients') {
      const v = args[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`--client requires a value: ${CLIENT_IDS.join(', ')}, all`);
      return parseClients(v);
    }
    const m = /^--clients?=(.*)$/.exec(a);
    if (m) return parseClients(m[1]);
  }
  return undefined;
}

export function readConfiguredClients(squadDir: string): ClientId[] {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(squadDir, 'config.json'), 'utf8')) as { clients?: unknown };
    return normalizeClientIds(cfg.clients).clients;
  } catch {
    // missing or malformed config: no configured clients
  }
  return [];
}

export function persistClients(squadDir: string, clients: readonly ClientId[]): void {
  const file = path.join(squadDir, 'config.json');
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`Refusing to overwrite malformed ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Refusing to overwrite ${file}: root must be a JSON object`);
    }
    cfg = parsed as Record<string, unknown>;
  }
  cfg['clients'] = normalizeClientIds(clients).clients;
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export interface SyncClientsOptions {
  /** Explicit set from `--client`; when omitted, configured clients are refreshed. */
  clients?: readonly ClientId[];
  version?: string;
}

/**
 * Project the requested (or previously configured) clients and persist the set.
 * Returns the clients that were synced and per-file results.
 */
export async function syncClients(
  dest: string,
  squadDir: string,
  options: SyncClientsOptions = {},
): Promise<{ clients: ClientId[]; results: ApplyResult[] }> {
  const requested = options.clients;
  const configured = readConfiguredClients(squadDir);
  const clients = requested
    ? CLIENT_IDS.filter((c) => requested.includes(c) || configured.includes(c))
    : configured;
  if (clients.length === 0) return { clients: [], results: [] };

  const version = options.version ?? getPackageVersion();
  const spec = projectSquadStateMcpSpec(await resolveSquadStateMcpSpec(version));
  const results = installClients(clients, {
    root: dest,
    mcp: { command: spec.command, args: spec.args },
    squadDir: path.relative(dest, squadDir).split(path.sep).join('/') || '.squad',
  });
  persistClients(squadDir, clients);
  return { clients, results };
}

export function reportClientResults(results: readonly ApplyResult[], log: (m: string) => void = console.log): void {
  for (const r of results) {
    if (r.action === 'error') log(`⚠ ${r.path}: ${r.error}`);
    else if (r.action !== 'unchanged') log(`✓ ${r.action} ${r.path}`);
  }
}
