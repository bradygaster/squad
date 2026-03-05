/**
 * CLI command: squad workstreams
 *
 * Subcommands:
 *   list      — Show configured workstreams
 *   status    — Show activity per workstream (branches, PRs)
 *   activate  — Write .squad-workstream file to activate a workstream
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadWorkstreamsConfig, resolveWorkstream } from '@bradygaster/squad-sdk';
import type { WorkstreamDefinition } from '@bradygaster/squad-sdk';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

/**
 * Entry point for `squad workstreams` subcommand.
 */
export async function runWorkstreams(cwd: string, args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    return listWorkstreams(cwd);
  }
  if (sub === 'status') {
    return showWorkstreamStatus(cwd);
  }
  if (sub === 'activate') {
    const name = args[1];
    if (!name) {
      console.error(`${RED}✗${RESET} Usage: squad workstreams activate <name>`);
      process.exit(1);
    }
    return activateWorkstream(cwd, name);
  }

  console.error(`${RED}✗${RESET} Unknown workstreams subcommand: ${sub}`);
  console.log(`\nUsage: squad workstreams <list|status|activate <name>>`);
  process.exit(1);
}

/** @deprecated Use runWorkstreams instead */
export const runStreams = runWorkstreams;

/**
 * List configured workstreams.
 */
function listWorkstreams(cwd: string): void {
  const config = loadWorkstreamsConfig(cwd);
  const active = resolveWorkstream(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No workstreams configured.${RESET}`);
    console.log(`${DIM}Create .squad/workstreams.json to define workstreams.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Configured Workstreams${RESET}\n`);
  console.log(`  Default workflow: ${config.defaultWorkflow}\n`);

  for (const workstream of config.workstreams) {
    const isActive = active?.name === workstream.name;
    const marker = isActive ? `${GREEN}● active${RESET}` : `${DIM}○${RESET}`;
    const workflow = workstream.workflow ?? config.defaultWorkflow;
    console.log(`  ${marker}  ${BOLD}${workstream.name}${RESET}`);
    console.log(`       Label: ${workstream.labelFilter}`);
    console.log(`       Workflow: ${workflow}`);
    if (workstream.folderScope?.length) {
      console.log(`       Folders: ${workstream.folderScope.join(', ')}`);
    }
    if (workstream.description) {
      console.log(`       ${DIM}${workstream.description}${RESET}`);
    }
    console.log();
  }

  if (active) {
    console.log(`  ${DIM}Active workstream resolved via: ${active.source}${RESET}\n`);
  }
}

/**
 * Show activity per workstream (branches, PRs via gh CLI).
 */
function showWorkstreamStatus(cwd: string): void {
  const config = loadWorkstreamsConfig(cwd);
  const active = resolveWorkstream(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No workstreams configured.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Workstream Status${RESET}\n`);

  for (const workstream of config.workstreams) {
    const isActive = active?.name === workstream.name;
    const marker = isActive ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${marker} ${BOLD}${workstream.name}${RESET} (${workstream.labelFilter})`);

    // Try to get PR and branch info via gh CLI
    try {
      const result = spawnSync(
        'gh',
        ['pr', 'list', '--label', workstream.labelFilter, '--json', 'number,title,state', '--limit', '5'],
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
        ['branch', '--list', `*${workstream.name}*`],
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
 * Activate a workstream by writing .squad-workstream file.
 */
function activateWorkstream(cwd: string, name: string): void {
  const config = loadWorkstreamsConfig(cwd);

  // Validate the workstream exists in config (warn if not, but still allow)
  if (config) {
    const found = config.workstreams.find(s => s.name === name);
    if (!found) {
      console.log(`${YELLOW}⚠${RESET} Workstream "${name}" not found in .squad/workstreams.json`);
      console.log(`  Available: ${config.workstreams.map(s => s.name).join(', ')}`);
      console.log(`  Writing .squad-workstream anyway...\n`);
    }
  }

  const workstreamFilePath = path.join(cwd, '.squad-workstream');
  fs.writeFileSync(workstreamFilePath, name + '\n', 'utf-8');
  console.log(`${GREEN}✓${RESET} Activated workstream: ${BOLD}${name}${RESET}`);
  console.log(`  Written to: ${workstreamFilePath}`);
  console.log(`${DIM}  (This file is gitignored — it's local to your machine/Codespace)${RESET}\n`);
}
