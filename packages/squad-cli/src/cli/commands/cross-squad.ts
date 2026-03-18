/**
 * squad discover / squad delegate — CLI commands for cross-squad orchestration.
 *
 * Commands:
 *   squad discover                           — list known squads and capabilities
 *   squad delegate <squad-name> <description> — create work in another squad
 *
 * @module cli/commands/cross-squad
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { success, warn, info, BOLD, RESET, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import {
  discoverSquads,
  formatDiscoveryTable,
  findSquadByName,
  buildDelegationArgs,
  type DiscoveredSquad,
} from '@bradygaster/squad-sdk';

const execFileAsync = promisify(execFile);

export async function discoverCommand(): Promise<void> {
  const squadDirInfo = detectSquadDir(process.cwd());
  const squadDir = squadDirInfo.path;

  const squads = discoverSquads(squadDir);
  const output = formatDiscoveryTable(squads);
  info(output);
}

export async function delegateCommand(args: string[]): Promise<void> {
  const squadName = args[0];
  const description = args.slice(1).join(' ');

  if (!squadName || !description) {
    fatal('Usage: squad delegate <squad-name> "<description>"');
  }

  const squadDirInfo = detectSquadDir(process.cwd());
  const squadDir = squadDirInfo.path;

  const squads = discoverSquads(squadDir);
  const target = findSquadByName(squads, squadName);

  if (!target) {
    const names = squads.map(s => s.manifest.name).join(', ');
    fatal(
      `Squad "${squadName}" not found.` +
      (names ? ` Known squads: ${names}` : ' No squads discovered — run "squad discover" to check.'),
    );
  }

  if (!target.manifest.accepts.includes('issues')) {
    fatal(`Squad "${squadName}" does not accept issues. Accepts: ${target.manifest.accepts.join(', ')}`);
  }

  const labels = target.manifest.contact.labels || [];
  const ghArgs = buildDelegationArgs({
    targetRepo: target.manifest.contact.repo,
    title: description,
    body: buildDelegationBody(description, target),
    labels,
  });

  info(`\n${BOLD}Delegating to ${squadName}${RESET}`);
  info(`  Repo: ${target.manifest.contact.repo}`);
  info(`  Title: [cross-squad] ${description}\n`);

  try {
    const { stdout } = await execFileAsync('gh', ghArgs);
    const issueUrl = stdout.trim();
    success(`Created cross-squad issue: ${issueUrl}`);
  } catch (err) {
    fatal(`Failed to create issue: ${(err as Error).message}`);
  }
}

function buildDelegationBody(description: string, target: DiscoveredSquad): string {
  return [
    '## Cross-Squad Work Request',
    '',
    `**From:** this repository`,
    `**To:** ${target.manifest.name} (${target.manifest.contact.repo})`,
    '',
    '### Description',
    '',
    description,
    '',
    '### Acceptance Criteria',
    '',
    '- [ ] Work completed and verified',
    '- [ ] Originating squad notified of completion',
    '',
    `${DIM}Created by squad cross-squad orchestration${RESET}`,
  ].join('\n');
}
