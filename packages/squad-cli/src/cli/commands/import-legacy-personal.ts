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

import fs from 'node:fs';
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

/** Largest charter/history accepted from a legacy tree. */
const MAX_LEGACY_FILE_BYTES = 1024 * 1024;

/**
 * Read a regular file from the legacy tree without following links: lstat every component
 * below `root`, refuse symlinks/junctions and oversized files, open-then-fstat to rule out a
 * swap between the check and the read. Returns null when the path does not exist.
 */
function readLegacyFile(root: string, filePath: string): { text: string } | { refused: string } | null {
  const rel = path.relative(root, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { refused: `${filePath} is outside ${root}` };
  let current = root;
  let leaf: fs.Stats | null = null;
  for (const seg of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, seg);
    try { leaf = fs.lstatSync(current); } catch { return null; }
    if (leaf.isSymbolicLink()) return { refused: `${current} is a symlink/junction; links in the legacy tree are not followed` };
  }
  if (!leaf || !leaf.isFile()) return null;
  if (leaf.size > MAX_LEGACY_FILE_BYTES) return { refused: `${filePath} is ${leaf.size} bytes (limit ${MAX_LEGACY_FILE_BYTES})` };
  let fd: number;
  try { fd = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)); } catch { return { refused: `${filePath} could not be opened safely` }; }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.ino !== leaf.ino || st.dev !== leaf.dev || st.size !== leaf.size) return { refused: `${filePath} changed between stat and open` };
    return { text: fs.readFileSync(fd, 'utf8') };
  } finally {
    fs.closeSync(fd);
  }
}

function parseIdentity(charter: string, slug: string): { name: string; role: string } {
  const name = /^\s*-\s*\*\*Name:\*\*\s*(.+?)\s*$/m.exec(charter)?.[1]
    ?? /^#\s+(.+?)(?:\s+[—-]\s+.*)?$/m.exec(charter)?.[1]
    ?? slug;
  const role = /^\s*-\s*\*\*Role:\*\*\s*(.+?)\s*$/m.exec(charter)?.[1] ?? 'agent';
  return { name: name.trim(), role: role.trim() };
}

/**
 * Read the agents of a 1.x personal squad directory. Read-only; never follows symlinks or
 * junctions (an agent whose directory, charter or history is a link is reported as refused).
 */
export function readLegacyPersonalAgents(sourceDir: string): { agents: LegacyPersonalAgent[]; refused: Array<{ slug: string; reason: string }> } {
  const root = path.resolve(sourceDir);
  const agentsDir = path.join(root, 'agents');
  const agents: LegacyPersonalAgent[] = [];
  const refused: Array<{ slug: string; reason: string }> = [];
  let agentsStat: fs.Stats;
  try { agentsStat = fs.lstatSync(agentsDir); } catch { return { agents, refused }; }
  if (agentsStat.isSymbolicLink()) return { agents, refused: [{ slug: '(agents)', reason: `${agentsDir} is a symlink/junction` }] };
  if (!agentsStat.isDirectory()) return { agents, refused };
  for (const slug of fs.readdirSync(agentsDir).sort()) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) { refused.push({ slug, reason: 'agent directory name is not a safe slug' }); continue; }
    const dirStat = fs.lstatSync(path.join(agentsDir, slug));
    if (dirStat.isSymbolicLink()) { refused.push({ slug, reason: 'agent directory is a symlink/junction' }); continue; }
    if (!dirStat.isDirectory()) continue;
    const charter = readLegacyFile(root, path.join(agentsDir, slug, 'charter.md'));
    if (charter === null) continue;
    if ('refused' in charter) { refused.push({ slug, reason: charter.refused }); continue; }
    const history = readLegacyFile(root, path.join(agentsDir, slug, 'history.md'));
    if (history && 'refused' in history) { refused.push({ slug, reason: history.refused }); continue; }
    agents.push({ slug, ...parseIdentity(charter.text, slug), charter: charter.text, history: history ? history.text : null });
  }
  return { agents, refused };
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

  const { agents, refused } = readLegacyPersonalAgents(source);
  const result: LegacyPersonalImportResult = { source, imported: [], skipped: [...refused], dryRun: options.dryRun ?? false };
  for (const r of refused) warn(`  skip ${r.slug}: ${r.reason}`);
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
      // No machine-specific paths are copied into the project: only the author's text plus a neutral marker.
      storage.writeSync(added.historyPath, `${agent.history.trimEnd()}\n\n<!-- imported by squad import --legacy-personal -->\n`);
    }
    result.imported.push(agent);
  }

  if (!result.dryRun) {
    success(`Imported ${result.imported.length} agent(s); skipped ${result.skipped.length}.`);
    info(`${DIM}Review the charters under .squad/agents/, then delete ${source} yourself when you no longer need it.${RESET}`);
  }
  return result;
}
