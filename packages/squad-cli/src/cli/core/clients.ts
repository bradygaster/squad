/**
 * Shared `--client` handling for `squad init` and `squad upgrade`.
 *
 * Persists configured clients to `.squad/config.json` (`clients: string[]`)
 * and (re)projects each client's host files without clobbering user settings.
 *
 * Note on default Copilot bootstrap: plain `squad init` and `squad upgrade`
 * always bootstrap the default GitHub Copilot host (`.github/agents/squad.agent.md`
 * and `.mcp.json` via `ensureSquadStateMcpInRoot`). All `--client` multi-host
 * projections (Claude Code, Kiro, OpenCode, Cursor, Codex, Antigravity, plus
 * `clients[]` in `.squad/config.json`) are strictly opt-in and no-op when
 * `--client` is omitted and `.squad/config.json` has no `clients` array.
 *
 * @module cli/core/clients
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  CLIENT_IDS,
  extractUnknownPortableClientIds,
  installClients,
  normalizeClientIds,
  parseClients,
  projectClients,
  resolveInsideRoot,
  type ApplyResult,
  type ClientId,
} from '@bradygaster/squad-sdk/client';
import { projectSquadStateMcpSpec, resolveSquadStateMcpSpec } from './mcp-spec.js';
import { getPackageVersion } from './version.js';

export { CLIENT_IDS, parseClients, type ClientId };

/**
 * Extract `--client <list>` / `--client=<list>` from argv.
 * Repeated `--client` flags are merged in canonical order.
 * Returns undefined when absent.
 */
export function readClientFlag(args: readonly string[]): ClientId[] | undefined {
  const collected: ClientId[] = [];
  let sawFlag = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--client' || a === '--clients') {
      const v = args[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`--client requires a value: ${CLIENT_IDS.join(', ')}, all`);
      sawFlag = true;
      collected.push(...parseClients(v));
      i++;
      continue;
    }
    const m = /^--clients?=(.*)$/.exec(a);
    if (m) {
      sawFlag = true;
      collected.push(...parseClients(m[1]));
    }
  }
  return sawFlag ? parseClients(collected) : undefined;
}

export function readConfiguredClients(squadDir: string): ClientId[] {
  const file = resolveInsideRoot(squadDir, 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as { clients?: unknown };
    return normalizeClientIds(cfg.clients).clients;
  } catch {
    // missing or malformed config: no configured clients
  }
  return [];
}

/** Return unknown-but-portable string client IDs present in `.squad/config.json`. */
export function readUnknownConfiguredClients(squadDir: string): string[] {
  const file = resolveInsideRoot(squadDir, 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as { clients?: unknown };
    return extractUnknownPortableClientIds(normalizeClientIds(cfg.clients).rejected);
  } catch {
    return [];
  }
}

export function persistClients(squadDir: string, clients: readonly (ClientId | string)[]): void {
  // never follow a symlink/junction at (or above) config.json: the write must stay inside the squad directory
  const file = resolveInsideRoot(squadDir, 'config.json');
  let cfg: Record<string, unknown> = {};
  let existingUnknown: string[] = [];
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
    existingUnknown = extractUnknownPortableClientIds(normalizeClientIds(cfg['clients']).rejected);
  }
  const normalized = normalizeClientIds(clients);
  const inputUnknown = extractUnknownPortableClientIds(normalized.rejected);
  const preservedUnknown = [...new Set([...existingUnknown, ...inputUnknown])];
  cfg['clients'] = [...normalized.clients, ...preservedUnknown];
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export interface SyncClientsOptions {
  /** Explicit set from `--client`; when omitted, configured clients are refreshed. */
  clients?: readonly ClientId[];
  version?: string;
  warn?: (message: string) => void;
  /** Only compute the client set; write nothing and persist nothing. */
  dryRun?: boolean;
}

/**
 * Project the requested (or previously configured) clients and persist the set.
 * Unknown portable client IDs in `.squad/config.json` are warned about and preserved.
 * A newly requested client whose projection reported an error is not persisted
 * (it would otherwise re-warn on every upgrade); already-configured clients stay.
 * Returns the clients that were synced and per-file results.
 */
export async function syncClients(
  dest: string,
  squadDir: string,
  options: SyncClientsOptions = {},
): Promise<{ clients: ClientId[]; results: ApplyResult[] }> {
  const requested = options.clients;
  const configured = readConfiguredClients(squadDir);
  const unknownClients = readUnknownConfiguredClients(squadDir);
  if (unknownClients.length > 0) {
    const warnFn = options.warn ?? ((m: string) => console.warn(m));
    warnFn(`⚠ Unknown client(s) in .squad/config.json skipped by this CLI version: ${unknownClients.join(', ')}`);
  }

  const clients = requested
    ? CLIENT_IDS.filter((c) => requested.includes(c) || configured.includes(c))
    : configured;
  if (clients.length === 0 || options.dryRun) return { clients, results: [] };

  // Verify squadDir itself (and path from dest to squadDir when inside dest) is not a symlink/junction
  const destAbs = path.resolve(dest);
  const squadAbs = path.resolve(squadDir);
  if (squadAbs === destAbs || squadAbs.startsWith(destAbs + path.sep)) {
    resolveInsideRoot(destAbs, path.relative(destAbs, squadAbs) || '.');
  }
  resolveInsideRoot(squadAbs, 'config.json');

  const version = options.version ?? getPackageVersion();
  const spec = projectSquadStateMcpSpec(await resolveSquadStateMcpSpec(version));
  const ctx = {
    root: dest,
    mcp: { command: spec.command, args: spec.args },
    squadDir: path.relative(dest, squadDir).split(path.sep).join('/') || '.squad',
  };
  const results = installClients(clients, ctx);
  const failedPaths = new Set(results.filter((r) => r.action === 'error').map((r) => r.path));
  const healthy = clients.filter(
    (c) => configured.includes(c) || !projectClients([c], ctx).some((f) => failedPaths.has(f.path)),
  );
  persistClients(squadDir, [...healthy, ...unknownClients]);
  return { clients, results };
}

export function reportClientResults(results: readonly ApplyResult[], log: (m: string) => void = console.log): void {
  for (const r of results) {
    if (r.action === 'error') log(`⚠ ${r.path}: ${r.error}`);
    else if (r.action !== 'unchanged') log(`✓ ${r.action} ${r.path}`);
  }
}

export const applyClientProjectionsForInit = syncClients;
export const applyClientProjectionsForUpgrade = syncClients;
