/**
 * squad import --legacy-personal [<dir>] — copy agents out of a Squad 1.x personal
 * squad into the current project.
 *
 * Personal squads were removed in Squad 2.0. The 1.x directory
 * (`%APPDATA%\squad\personal-squad`, `~/.config/squad/personal-squad`, …) is not a
 * project `.squad/`: it has `agents/<slug>/charter.md` (+ `history.md`) directly at
 * its root and no casting pair, so `squad export` / `squad import <file>` cannot read
 * it. This command reads that layout **read-only** and registers each agent in the
 * project through the normal cast flow (charter, history, `team.md`, `routing.md`,
 * casting registry). The source directory is never written to, moved or deleted.
 *
 * @module cli/commands/import-legacy-personal
 */

import path from 'node:path';
import { FSStorageProvider, legacyPersonalSquadPath } from '@bradygaster/squad-sdk';
import { resolveSquadPaths, resolveExternalStateDir } from '@bradygaster/squad-sdk/resolution';
import { runCastAdd } from './cast.js';
import { success, warn, info, DIM, RESET } from '../core/output.js';
import { fatal } from '../core/errors.js';

const storage = new FSStorageProvider();

export interface LegacyPersonalImportOptions {
  /** Legacy personal squad directory; defaults to the platform 1.x location. */
  from?: string;
  /** Report what would be imported without writing anything. */
  dryRun?: boolean;
}

export interface LegacyPersonalAgent {
  slug: string;
  name: string;
  role: string;
  charter: string;
  history: string | null;
}

export interface LegacyPersonalImportResult {
  source: string;
  imported: LegacyPersonalAgent[];
  skipped: Array<{ slug: string; reason: string }>;
  dryRun: boolean;
}

function parseIdentity(charter: string, slug: string): { name: string; role: string } {
  const name = /^\s*-\s*\*\*Name:\*\*\s*(.+?)\s*$/m.exec(charter)?.[1]
    ?? /^#\s+(.+?)(?:\s+[—-]\s+.*)?$/m.exec(charter)?.[1]
    ?? slug;
  const role = /^\s*-\s*\*\*Role:\*\*\s*(.+?)\s*$/m.exec(charter)?.[1] ?? 'agent';
  return { name: name.trim(), role: role.trim() };
}

/** Read the agents of a 1.x personal squad directory. Read-only. */
export function readLegacyPersonalAgents(sourceDir: string): LegacyPersonalAgent[] {
  const agentsDir = path.join(sourceDir, 'agents');
  if (!storage.existsSync(agentsDir) || !storage.isDirectorySync(agentsDir)) return [];
  const agents: LegacyPersonalAgent[] = [];
  for (const slug of storage.listSync(agentsDir).sort()) {
    const charterPath = path.join(agentsDir, slug, 'charter.md');
    const charter = storage.readSync(charterPath);
    if (charter === undefined) continue;
    const history = storage.readSync(path.join(agentsDir, slug, 'history.md')) ?? null;
    agents.push({ slug, ...parseIdentity(charter, slug), charter, history });
  }
  return agents;
}

/**
 * Import 1.x personal-squad agents into the project squad at `cwd`.
 * Agents whose slug already exists in the project are skipped (never overwritten).
 */
export async function runImportLegacyPersonal(cwd: string, options: LegacyPersonalImportOptions = {}): Promise<LegacyPersonalImportResult> {
  const source = path.resolve(options.from ?? legacyPersonalSquadPath());
  if (!storage.existsSync(source) || !storage.isDirectorySync(source)) {
    fatal(`No legacy personal squad found at ${source}. Pass the directory explicitly: squad import --legacy-personal <dir>`);
  }

  const paths = resolveSquadPaths(cwd);
  if (!paths) {
    fatal('No squad found. Run "squad init" first, then re-run squad import --legacy-personal.');
  }
  const projectSquadDir = paths.config?.stateLocation === 'external' && paths.config.projectKey
    ? resolveExternalStateDir(paths.config.projectKey, false)
    : paths.teamSquadDir;
  if (path.resolve(projectSquadDir) === source) {
    fatal('The legacy directory is this project\'s own squad directory; nothing to import.');
  }

  const agents = readLegacyPersonalAgents(source);
  const result: LegacyPersonalImportResult = { source, imported: [], skipped: [], dryRun: options.dryRun ?? false };
  if (agents.length === 0) {
    warn(`No agents (agents/<name>/charter.md) found in ${source}; nothing to import.`);
    return result;
  }

  info(`${result.dryRun ? 'Would import' : 'Importing'} ${agents.length} agent(s) from ${source} (read-only; the source is left untouched)`);
  for (const agent of agents) {
    const targetCharter = path.join(projectSquadDir, 'agents', agent.slug, 'charter.md');
    if (storage.existsSync(targetCharter)) {
      result.skipped.push({ slug: agent.slug, reason: `already exists in this project (${targetCharter})` });
      warn(`  skip ${agent.name}: already exists in this project`);
      continue;
    }
    if (result.dryRun) {
      info(`  ${DIM}would add${RESET} ${agent.name} (${agent.role})`);
      result.imported.push(agent);
      continue;
    }
    const added = await runCastAdd(cwd, { name: agent.name, role: agent.role });
    // Keep the author's charter and history verbatim instead of the generated defaults.
    storage.writeSync(added.charterPath, agent.charter);
    if (agent.history) {
      storage.writeSync(added.historyPath, `${agent.history.trimEnd()}\n\n<!-- imported from ${source} by squad import --legacy-personal -->\n`);
    }
    result.imported.push(agent);
  }

  if (!result.dryRun) {
    success(`Imported ${result.imported.length} agent(s); skipped ${result.skipped.length}.`);
    info(`${DIM}Review the charters under .squad/agents/, then delete ${source} yourself when you no longer need it.${RESET}`);
  }
  return result;
}
