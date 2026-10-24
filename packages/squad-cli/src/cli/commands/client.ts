/**
 * `squad client` — inspect and add client host projections.
 *
 *   squad client list [--json]        configured clients and whether their files are projected
 *   squad client add <list> [--dry-run]  project additional hosts (same as `squad upgrade --client`)
 *
 * The configured set lives in `.squad/config.json` `clients[]`; an empty set means only the
 * default GitHub Copilot host is bootstrapped (#2299).
 *
 * @module cli/commands/client
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  CLIENT_IDS,
  getHostProjection,
  projectClients,
  type ClientId,
  type ProjectionFile,
} from '@bradygaster/squad-sdk/client';
import { readClientFlag, readConfiguredClients, readUnknownConfiguredClients, syncClients, reportClientResults, parseClients } from '../core/clients.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { projectSquadStateMcpSpec, resolveSquadStateMcpSpec } from '../core/mcp-spec.js';
import { getPackageVersion } from '../core/version.js';
import { BOLD, DIM, GREEN, RESET, YELLOW } from '../core/output.js';

export interface ClientStatus {
  id: ClientId;
  label: string;
  /** Whether the id is persisted in `.squad/config.json`; the default Copilot host may be implicit. */
  configured: boolean;
  /** Projected files (relative to the repo root) and whether each exists on disk. */
  files: Array<{ path: string; present: boolean }>;
  /** `projected` when every file exists, `partial` when some do, `missing` when none do. */
  status: 'projected' | 'partial' | 'missing';
}

export interface ClientListResult {
  squadDir: string;
  /** Raw `clients[]` from config (normalized); empty means Copilot default only. */
  configured: ClientId[];
  unknown: string[];
  clients: ClientStatus[];
}

function projectionPath(file: ProjectionFile): string {
  return file.path;
}

/** Build the client status report. Pure: reads disk, writes nothing. */
export async function listClients(dest: string): Promise<ClientListResult> {
  const squadDir = detectSquadDir(dest).path;
  const configured = readConfiguredClients(squadDir);
  const unknown = readUnknownConfiguredClients(squadDir);
  const effective: ClientId[] = configured.length > 0 ? configured : ['copilot'];

  const spec = projectSquadStateMcpSpec(await resolveSquadStateMcpSpec(getPackageVersion()));
  const ctx = {
    root: dest,
    mcp: { command: spec.command, args: spec.args },
    squadDir: path.relative(dest, squadDir).split(path.sep).join('/') || '.squad',
  };

  const clients: ClientStatus[] = CLIENT_IDS
    .filter((id) => effective.includes(id))
    .map((id) => {
      const files = projectClients([id], ctx).map((file) => {
        const rel = projectionPath(file);
        return { path: rel, present: fs.existsSync(path.join(dest, rel)) };
      });
      if (id === 'copilot') {
        // The coordinator file is bootstrapped by init/upgrade rather than projected, but it is
        // what the Copilot host actually loads — report it alongside .mcp.json.
        const coordinator = '.github/agents/squad.agent.md';
        if (!files.some((f) => f.path === coordinator)) {
          files.unshift({ path: coordinator, present: fs.existsSync(path.join(dest, coordinator)) });
        }
      }
      const presentCount = files.filter((f) => f.present).length;
      const status: ClientStatus['status'] = presentCount === 0 ? 'missing' : presentCount === files.length ? 'projected' : 'partial';
      return { id, label: getHostProjection(id).label, configured: configured.includes(id), files, status };
    });

  return { squadDir, configured, unknown, clients };
}

function printClientList(result: ClientListResult): void {
  console.log(`\n${BOLD}Configured clients${RESET} ${DIM}(.squad/config.json → clients[])${RESET}\n`);
  if (result.configured.length === 0) {
    console.log(`  ${DIM}clients[] is empty — only the default host is projected${RESET}`);
  }
  for (const client of result.clients) {
    const marker = client.status === 'projected' ? `${GREEN}✓${RESET}` : `${YELLOW}⚠${RESET}`;
    const suffix = client.configured ? '' : ' (default)';
    const present = client.files.filter((f) => f.present).length;
    console.log(`  ${marker} ${client.id.padEnd(12)} ${client.label}${suffix} — ${client.status} (${present}/${client.files.length} files)`);
    for (const file of client.files.filter((f) => !f.present)) {
      console.log(`      ${DIM}missing: ${file.path}${RESET}`);
    }
  }
  if (result.unknown.length > 0) {
    console.log(`\n  ${YELLOW}⚠${RESET} Unknown client id(s) in config, skipped by this CLI version: ${result.unknown.join(', ')}`);
  }
  console.log(`\n${DIM}Available: ${CLIENT_IDS.join(', ')}. Add with: squad client add <list>  (or: squad upgrade --client <list>)${RESET}\n`);
}

/** `squad client …` entry point; returns the process exit code. */
export async function runClientCommand(dest: string, args: string[]): Promise<number> {
  const sub = args[0];
  const json = args.includes('--json');
  const dryRun = args.includes('--dry-run');

  if (sub === undefined || sub === 'list' || sub === 'ls' || sub === '--json') {
    try {
      const result = await listClients(dest);
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printClientList(result);
      }
      return 0;
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  if (sub === 'add') {
    let requested: ClientId[] | undefined;
    try {
      requested = readClientFlag(args) ?? (args[1] && !args[1].startsWith('--') ? parseClients(args[1]) : undefined);
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    if (!requested || requested.length === 0) {
      console.error(`❌ Usage: squad client add <list>   (${CLIENT_IDS.join(', ')}, or "all")`);
      return 1;
    }
    try {
      const squadDir = detectSquadDir(dest).path;
      const synced = await syncClients(dest, squadDir, { clients: requested, dryRun, warn: (m) => console.warn(m) });
      if (dryRun) {
        console.log(`Would project client host files for: ${synced.clients.join(', ')} (nothing written: --dry-run)`);
        return 0;
      }
      reportClientResults(synced.results);
      console.log(`${GREEN}✓${RESET} clients configured: ${synced.clients.join(', ')}`);
      return 0;
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  console.error(`❌ Unknown client subcommand: ${sub}\n   Usage: squad client list [--json] | squad client add <list> [--dry-run]`);
  return 1;
}
