/**
 * squad cast — show the current session cast (project agents), or add a member
 * with --name/--role.
 *
 * @module cli/commands/cast
 */

import * as path from 'node:path';
import {
  FSStorageProvider,
  addAgentToConfig,
  generateCharterFromRole,
  getRoleById,
  syncTeamCapabilities,
} from '@bradygaster/squad-sdk';
import {
  acquireCastingRegistryLockAsync,
  commitCastingRegistryPair,
  prepareCastingRegistryPairLocked,
  recoverCastingRegistryTransaction,
  reconcileAgentProvenanceRegistry,
} from '@bradygaster/squad-sdk/casting';
import { LocalAgentSource } from '@bradygaster/squad-sdk/config/agent-source';
import { resolveSquadPaths, resolveExternalStateDir } from '@bradygaster/squad-sdk/resolution';
import { BOLD, RESET, info, success } from '../core/output.js';
import { fatal, fatalNoSquad } from '../core/errors.js';

const storage = new FSStorageProvider();

export interface CastAddOptions {
  name: string;
  role: string;
  force?: boolean;
}

function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildAgentCharter(name: string, role: string, slug: string): string {
  const roleId = role.toLowerCase().trim().replace(/\s+/g, '-');
  const catalogCharter = generateCharterFromRole(roleId, name);
  if (catalogCharter) return catalogCharter;

  const catalogRole = getRoleById(roleId);
  const displayRole = catalogRole?.title ?? role;
  const vibe = catalogRole?.vibe ?? 'Focused and reliable. Gets the job done without fanfare.';

  return `# ${name} — ${displayRole}

> ${vibe}

## Identity

- **Name:** ${name}
- **Role:** ${displayRole}
- **Expertise:** ${displayRole}
- **Style:** Direct and focused.

## What I Own

- ${displayRole} domain tasks

## How I Work

- Read decisions.md before starting
- Write decisions to inbox when making team-relevant choices
- Focused, practical, gets things done

## Boundaries

**I handle:** ${displayRole} tasks

**I don't handle:** Work outside my domain — the coordinator routes that elsewhere.

**When I'm unsure:** I say so and suggest who might know.

## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on task type
- **Fallback:** Standard chain

## Collaboration

Before starting work, run \`git rev-parse --show-toplevel\` to find the repo root, or use the \`TEAM ROOT\` provided in the spawn prompt. All \`.squad/\` paths must be resolved relative to this root.

Before starting work, read \`.squad/decisions.md\` for team decisions that affect me.
After making a decision others should know, write it to \`.squad/decisions/inbox/${slug}-{brief-slug}.md\`.
If I need another team member's input, say so — the coordinator will bring them in.

## Voice

${vibe}
`;
}

function updateTeamMdWithAgent(squadDir: string, name: string, role: string, slug: string): void {
  const teamPath = path.join(squadDir, 'team.md');
  const row = `| ${name} | ${role} | \`.squad/agents/${slug}/charter.md\` | ✅ Active |`;
  const existing = storage.readSync(teamPath);

  if (!existing) {
    const fresh = [
      '# Squad Team',
      '',
      '## Coordinator',
      '',
      '| Name | Role | Notes |',
      '|------|------|-------|',
      '| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |',
      '',
      '## Members',
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      row,
      '',
    ].join('\n');
    storage.writeSync(teamPath, fresh);
    return;
  }

  // Check if agent row already exists in team.md
  const charterRef = `.squad/agents/${slug}/charter.md`;
  if (existing.includes(charterRef)) {
    return;
  }

  const membersHeader = '## Members';
  const membersIdx = existing.indexOf(membersHeader);
  if (membersIdx === -1) {
    const appended = `${existing.trimEnd()}\n\n## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n${row}\n`;
    storage.writeSync(teamPath, appended);
    return;
  }

  const afterHeader = existing.slice(membersIdx);
  const nextHeaderMatch = afterHeader.slice(membersHeader.length).match(/\n## /);
  const sectionEnd = nextHeaderMatch && nextHeaderMatch.index !== undefined
    ? membersIdx + membersHeader.length + nextHeaderMatch.index
    : existing.length;
  const section = existing.slice(membersIdx, sectionEnd);
  const sectionLines = section.split('\n');

  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) {
      lastTableLineRel = i;
      break;
    }
  }

  if (lastTableLineRel === -1) {
    const newSection = `${membersHeader}\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n${row}\n`;
    const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
    storage.writeSync(teamPath, updated);
    return;
  }

  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = `${before}\n${row}${after ? '\n' + after : '\n'}`;
  const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(teamPath, updated);
}

function updateRoutingMdWithAgent(squadDir: string, name: string, role: string): void {
  const routingPath = path.join(squadDir, 'routing.md');
  const row = `| ${role} | ${name} | — |`;
  const existing = storage.readSync(routingPath);
  if (!existing) {
    const fresh = [
      '# Squad Routing',
      '',
      '## Work Type → Agent',
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      row,
      '',
    ].join('\n');
    storage.writeSync(routingPath, fresh);
    return;
  }

  if (existing.includes(`| ${name} |`)) {
    return;
  }

  const routingHeader = '## Work Type → Agent';
  const headerIdx = existing.indexOf(routingHeader);
  if (headerIdx === -1) {
    const appended = `${existing.trimEnd()}\n\n${routingHeader}\n\n| Work Type | Primary | Secondary |\n|-----------|---------|----------|\n${row}\n`;
    storage.writeSync(routingPath, appended);
    return;
  }

  const afterHeader = existing.slice(headerIdx);
  const nextHeaderMatch = afterHeader.slice(routingHeader.length).match(/\n## /);
  const sectionEnd = nextHeaderMatch && nextHeaderMatch.index !== undefined
    ? headerIdx + routingHeader.length + nextHeaderMatch.index
    : existing.length;
  const section = existing.slice(headerIdx, sectionEnd);
  const sectionLines = section.split('\n');

  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) {
      lastTableLineRel = i;
      break;
    }
  }

  if (lastTableLineRel === -1) {
    const newSection = `${routingHeader}\n\n| Work Type | Primary | Secondary |\n|-----------|---------|----------|\n${row}\n`;
    const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
    storage.writeSync(routingPath, updated);
    return;
  }

  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = `${before}\n${row}${after ? '\n' + after : '\n'}`;
  const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(routingPath, updated);
}

async function updateCastingStateWithAgent(
  squadDir: string,
  name: string,
  role: string,
  slug: string,
): Promise<void> {
  const castingDir = path.join(squadDir, 'casting');
  await storage.mkdir(castingDir, { recursive: true });

  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  if (storage.existsSync(registryPath) && !storage.existsSync(historyPath)) {
    storage.writeSync(
      historyPath,
      JSON.stringify({ assignment_cast_snapshots: {}, universe_usage_history: [] }, null, 2) + '\n',
    );
  }

  const releaseLock = await acquireCastingRegistryLockAsync(castingDir, 'CLI cast add');
  try {
    recoverCastingRegistryTransaction(castingDir);
    const existingPair = prepareCastingRegistryPairLocked(castingDir);
    const now = new Date().toISOString();
    const existingRegistry = existingPair.registryRaw?.trim() ? existingPair.registry : undefined;
    const registry = reconcileAgentProvenanceRegistry(
      existingRegistry,
      [{ id: slug, displayName: name, role, universe: 'cli-cast' }],
      { generatedAt: now, retireMissing: false },
    );
    const priorHistory = (existingPair.history ?? {}) as {
      assignment_cast_snapshots?: Record<string, unknown>;
      universe_usage_history?: unknown[];
    };
    const history = {
      assignment_cast_snapshots: {
        ...(priorHistory.assignment_cast_snapshots ?? {}),
        [`cli-cast-r${registry.revision}-${now}`]: {
          created_at: now,
          agents: [slug],
          universe: 'cli-cast',
        },
      },
      universe_usage_history: [
        ...(priorHistory.universe_usage_history ?? []),
        { universe: 'cli-cast', used_at: now },
      ],
    };
    commitCastingRegistryPair(
      castingDir,
      existingPair.registryRaw,
      registry as unknown as Record<string, unknown>,
      existingPair.historyRaw,
      history,
      registry.revision,
    );
    const policyPath = path.join(castingDir, 'policy.json');
    if (!storage.existsSync(policyPath)) {
      storage.writeSync(policyPath, JSON.stringify({ universe_allowlist: ['*'], max_capacity: 25 }, null, 2) + '\n');
    }
  } finally {
    releaseLock();
  }
}

/**
 * Add a new specialist agent to the active project squad (`squad cast --name <name> --role <role>` or `squad hire --name <name> --role <role>`).
 */
export async function runCastAdd(cwd: string, options: CastAddOptions): Promise<{
  agentId: string;
  agentDir: string;
  charterPath: string;
  historyPath: string;
}> {
  const rawName = options.name?.trim();
  const rawRole = options.role?.trim();
  if (!rawName || !rawRole) {
    fatal('Usage: squad cast --name <name> --role <role> (or: squad hire --name <name> --role <role>)');
  }

  const slug = slugifyAgentName(rawName);
  if (!slug) {
    fatal(`Invalid agent name: "${rawName}". Must contain at least one alphanumeric character.`);
  }

  const paths = resolveSquadPaths(cwd);
  if (!paths) {
    fatalNoSquad();
  }

  const externalSquadDir =
    paths.config?.stateLocation === 'external' && paths.config.projectKey
      ? resolveExternalStateDir(paths.config.projectKey, false)
      : undefined;
  const squadDir = externalSquadDir ?? paths.teamSquadDir;
  const teamRoot = path.resolve(paths.projectDir, '..');
  const agentDir = path.join(squadDir, 'agents', slug);
  const charterPath = path.join(agentDir, 'charter.md');
  const historyPath = path.join(agentDir, 'history.md');

  if (storage.existsSync(charterPath) && !options.force) {
    fatal(`Agent "${rawName}" already exists at ${charterPath} (use --force to overwrite)`);
  }

  const roleId = rawRole.toLowerCase().replace(/\s+/g, '-');
  const catalogRole = getRoleById(roleId);
  const displayRole = catalogRole?.title ?? rawRole;
  const charterContent = buildAgentCharter(rawName, rawRole, slug);
  const historyContent = `# ${rawName} — History\n\n## Core Context\n\n- **Role:** ${displayRole}\n- **Joined:** ${new Date().toISOString().split('T')[0]}\n\n## Learnings\n\n<!-- Append new learnings below -->\n`;

  storage.mkdirSync(agentDir, { recursive: true });
  storage.writeSync(charterPath, charterContent);
  if (!storage.existsSync(historyPath) || options.force) {
    storage.writeSync(historyPath, historyContent);
  }

  updateTeamMdWithAgent(squadDir, rawName, displayRole, slug);
  updateRoutingMdWithAgent(squadDir, rawName, displayRole);
  await updateCastingStateWithAgent(squadDir, rawName, displayRole, slug);
  await addAgentToConfig(teamRoot, slug, displayRole);

  try {
    syncTeamCapabilities({
      squadDir,
      agentFile: path.join(teamRoot, '.github', 'agents', 'squad.agent.md'),
      storage,
    });
  } catch {
    // Non-fatal if squad.agent.md does not exist or cannot be refreshed
  }

  success(`Added agent ${rawName} (${displayRole})`);
  info(`  Charter: ${charterPath}`);
  info(`  History: ${historyPath}`);

  return {
    agentId: slug,
    agentDir,
    charterPath,
    historyPath,
  };
}

/**
 * Run the cast command — show merged session cast.
 */
export async function runCast(cwd: string): Promise<void> {
  // Resolve squad paths
  const paths = resolveSquadPaths(cwd);
  if (!paths) {
    fatalNoSquad();
  }
  
  // Discover project agents.
  // LocalAgentSource appends .squad/agents to its base path, so local mode
  // supplies the parent of paths.projectDir (the repo root). Remote mode hands
  // it the team's agents dir explicitly, because teamRoot may name either the
  // team repo or its .squad/ dir (#2107).
  const agentBase = path.resolve(paths.projectDir, '..');
  // #1399: when state is externalized, agents live at <externalStateDir>/agents
  // (no .squad nesting), so the base-path probing above can't reach them —
  // externalize sets teamRoot '.' which lands here as remote mode with a
  // repo-local teamDir. Hand LocalAgentSource the explicit directory instead.
  // (resolveExternalStateDir comes from the /resolution subpath on purpose:
  // importing the sdk root barrel here adds seconds to this module's load.)
  const externalAgentsDir =
    paths.config?.stateLocation === 'external' && paths.config.projectKey
      ? path.join(resolveExternalStateDir(paths.config.projectKey, false), 'agents')
      : undefined;
  const agentsDir =
    externalAgentsDir
    ?? (paths.mode === 'remote' ? path.join(paths.teamSquadDir, 'agents') : undefined);
  const projectSource = new LocalAgentSource(agentBase, undefined, undefined, agentsDir);
  const projectAgents = await projectSource.listAgents();

  if (projectAgents.length === 0) {
    console.log('\nNo agents found in current session cast.\n');
    return;
  }

  console.log(`\n${BOLD}Session Cast${RESET} (${projectAgents.length} agents):\n`);

  const maxNameLen = Math.max(...projectAgents.map(a => a.name.length), 4);
  const maxRoleLen = Math.max(...projectAgents.map(a => a.role.length), 4);

  console.log(`  ${'Name'.padEnd(maxNameLen)}  ${'Role'.padEnd(maxRoleLen)}`);
  console.log(`  ${'─'.repeat(maxNameLen)}  ${'─'.repeat(maxRoleLen)}`);
  for (const agent of projectAgents) {
    console.log(`  ${agent.name.padEnd(maxNameLen)}  ${agent.role.padEnd(maxRoleLen)}`);
  }
  console.log();
}