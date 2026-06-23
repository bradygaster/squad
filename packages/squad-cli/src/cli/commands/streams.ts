/**
 * CLI command: squad subsquads
 *
 * Subcommands:
 *   list      — Show configured SubSquads
 *   status    — Show activity per SubSquad (branches, PRs)
 *   activate  — Write .squad-workstream file to activate a SubSquad
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import { loadSubSquadsConfig, resolveSubSquad } from '@bradygaster/squad-sdk';
import type { SubSquadDefinition } from '@bradygaster/squad-sdk';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

/**
 * Entry point for `squad subsquads` subcommand.
 */
export async function runSubSquads(cwd: string, args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    return listSubSquads(cwd);
  }
  if (sub === 'status') {
    return showSubSquadStatus(cwd);
  }
  if (sub === 'activate') {
    const name = args[1];
    if (!name) {
      console.error(`${RED}✗${RESET} Usage: squad subsquads activate <name>`);
      process.exit(1);
    }
    return activateSubSquad(cwd, name);
  }

  console.error(`${RED}✗${RESET} Unknown subsquads subcommand: ${sub}`);
  console.log(`\nUsage: squad subsquads <list|status|activate <name>>`);
  process.exit(1);
}

/** @deprecated Use runSubSquads instead */
export const runWorkstreams = runSubSquads;

/** @deprecated Use runSubSquads instead */
export const runStreams = runSubSquads;

/**
 * List configured SubSquads.
 */
function listSubSquads(cwd: string): void {
  const config = loadSubSquadsConfig(cwd);
  const active = resolveSubSquad(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No SubSquads configured.${RESET}`);
    console.log(`${DIM}Create .squad/streams.json to define SubSquads.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Configured SubSquads${RESET}\n`);
  console.log(`  Default workflow: ${config.defaultWorkflow}\n`);

  for (const subsquad of config.workstreams) {
    const isActive = active?.name === subsquad.name;
    const marker = isActive ? `${GREEN}● active${RESET}` : `${DIM}○${RESET}`;
    const workflow = subsquad.workflow ?? config.defaultWorkflow;
    console.log(`  ${marker}  ${BOLD}${subsquad.name}${RESET}`);
    console.log(`       Label: ${subsquad.labelFilter}`);
    console.log(`       Workflow: ${workflow}`);
    if (subsquad.folderScope?.length) {
      console.log(`       Folders: ${subsquad.folderScope.join(', ')}`);
    }
    if (subsquad.description) {
      console.log(`       ${DIM}${subsquad.description}${RESET}`);
    }
    console.log();
  }

  if (active) {
    console.log(`  ${DIM}Active SubSquad resolved via: ${active.source}${RESET}\n`);
  }
}

/**
 * Show activity per SubSquad (branches, PRs via gh CLI).
 */
function showSubSquadStatus(cwd: string): void {
  const config = loadSubSquadsConfig(cwd);
  const active = resolveSubSquad(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No SubSquads configured.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}SubSquad Status${RESET}\n`);

  for (const subsquad of config.workstreams) {
    const isActive = active?.name === subsquad.name;
    const marker = isActive ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${marker} ${BOLD}${subsquad.name}${RESET} (${subsquad.labelFilter})`);

    // Try to get PR and branch info via gh CLI
    try {
      const result = spawnSync(
        'gh',
        ['pr', 'list', '--label', subsquad.labelFilter, '--json', 'number,title,state', '--limit', '5'],
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const prOutput = result.stdout ?? '';
      const prs = JSON.parse(prOutput) as Array<{ number: number; title: string; state: string }>;
      if (prs.length > 0) {
        console.log(`    ${YELLOW}PRs:${RESET}`);
        for (const pr of prs) {
          console.log(`      #${pr.number} ${pr.title} (${pr.state})`);
        }
      } else {
        console.log(`    ${DIM}No open PRs${RESET}`);
      }
    } catch {
      console.log(`    ${DIM}(gh CLI not available — skipping PR lookup)${RESET}`);
    }

    // Try to get branch info
    try {
      const result = spawnSync(
        'git',
        ['branch', '--list', `*${subsquad.name}*`],
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const branchOutput = result.stdout ?? '';
      const branches = branchOutput.trim().split('\n').filter(Boolean);
      if (branches.length > 0) {
        console.log(`    ${YELLOW}Branches:${RESET}`);
        for (const branch of branches) {
          console.log(`      ${branch.trim()}`);
        }
      }
    } catch {
      // Git not available — skip
    }

    console.log();
  }
}

/**
 * Activate a SubSquad by writing .squad-workstream file.
 */
function activateSubSquad(cwd: string, name: string): void {
  const config = loadSubSquadsConfig(cwd);

  // Validate the SubSquad exists in config (warn if not, but still allow)
  if (config) {
    const found = config.workstreams.find(s => s.name === name);
    if (!found) {
      console.log(`${YELLOW}⚠${RESET} SubSquad "${name}" not found in .squad/streams.json`);
      console.log(`  Available: ${config.workstreams.map(s => s.name).join(', ')}`);
      console.log(`  Writing .squad-workstream anyway...\n`);
    }
  }

  const workstreamFilePath = path.join(cwd, '.squad-workstream');
  storage.writeSync(workstreamFilePath, name + '\n');
  console.log(`${GREEN}✓${RESET} Activated SubSquad: ${BOLD}${name}${RESET}`);
  console.log(`  Written to: ${workstreamFilePath}`);
  console.log(`${DIM}  (This file is gitignored — it's local to your machine/Codespace)${RESET}\n`);
}
