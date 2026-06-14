/**
 * squad discover / squad delegate / squad registry — CLI commands for
 * cross-squad orchestration.
 *
 * Commands:
 *   squad discover                            — list known squads and capabilities
 *   squad delegate <squad-name> <description> — create work in another squad
 *   squad registry add <name> <path>          — register a peer squad (no inheritance)
 *   squad registry list                       — show registered peer squads
 *   squad registry remove <name>              — remove a registered peer squad
 *
 * @module cli/commands/cross-squad
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve as resolvePath } from 'node:path';
import { success, warn, info, BOLD, RESET, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import {
  discoverSquads,
  formatDiscoveryTable,
  findSquadByName,
  buildDelegationArgs,
  readSquadRegistry,
  addRegistryEntry,
  removeRegistryEntry,
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

/**
 * `squad registry` — manage peer squads in `.squad/squad-registry.json`.
 *
 * Unlike `squad upstream add`, registry entries are discovery-only — peer
 * squads are findable via `squad discover` and addressable via `squad
 * delegate`, but their skills/decisions/wisdom are NOT inherited by your
 * coordinator at session start.
 */
export async function registryCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || (action !== 'add' && action !== 'list' && action !== 'remove')) {
    fatal('Usage: squad registry add <name> <path> | list | remove <name>');
  }

  const squadDirInfo = detectSquadDir(process.cwd());
  const squadDir = squadDirInfo.path;

  if (action === 'list') {
    const entries = readSquadRegistry(squadDir);
    if (entries.length === 0) {
      info(`${DIM}No peer squads registered. Add one with: squad registry add <name> <path>${RESET}`);
      return;
    }
    info(`\n${BOLD}Registered peer squads${RESET} (.squad/squad-registry.json):\n`);
    for (const entry of entries) {
      info(`  ${BOLD}${entry.name}${RESET}  →  ${entry.path}`);
    }
    info('');
    return;
  }

  if (action === 'add') {
    const name = args[1];
    const rawPath = args[2];
    if (!name || !rawPath) {
      fatal('Usage: squad registry add <name> <path>');
    }
    // Resolve to absolute path so the registry is portable wrt cwd at write time
    const absPath = resolvePath(rawPath);
    const result = addRegistryEntry(squadDir, name, absPath);
    if (result.added) {
      success(`Registered peer squad "${name}" → ${absPath}`);
      info(`  Capabilities: ${result.manifest!.capabilities.join(', ')}`);
      info(`  Repo: ${result.manifest!.contact.repo}`);
      info(`  Accepts: ${result.manifest!.accepts.join(', ')}`);
      info(`\n${DIM}Run "squad discover" to see all registered peers.${RESET}`);
      return;
    }
    if (result.reason === 'duplicate-name') {
      fatal(`A peer named "${name}" is already registered. Remove it first: squad registry remove ${name}`);
    }
    if (result.reason === 'invalid-manifest') {
      fatal(
        `No valid .squad/manifest.json found at ${absPath}.\n` +
        `  Expected: ${absPath}/.squad/manifest.json (or ${absPath}/manifest.json if you pointed at .squad/).\n` +
        `  Ask the peer team to publish a manifest, or verify the path resolves locally.`,
      );
    }
    fatal('Registry add failed for an unknown reason.');
  }

  if (action === 'remove') {
    const name = args[1];
    if (!name) {
      fatal('Usage: squad registry remove <name>');
    }
    const removed = removeRegistryEntry(squadDir, name);
    if (removed) {
      success(`Removed peer squad "${name}" from the registry.`);
    } else {
      warn(`No peer squad named "${name}" was registered.`);
    }
  }
}
