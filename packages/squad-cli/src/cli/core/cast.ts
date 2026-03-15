/**
 * Team casting engine — parses coordinator team proposals and scaffolds agent files.
 * @module cli/core/cast
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRoleById, generateCharterFromRole } from '@bradygaster/squad-sdk';

// ── Types ──────────────────────────────────────────────────────────

export interface CastMember {
  name: string;
  role: string;
  scope: string;
  emoji: string;
}

export interface CastProposal {
  members: CastMember[];
  universe: string;
  projectDescription: string;
}

export interface CastResult {
  teamRoot: string;
  membersCreated: string[];
  filesCreated: string[];
}

// ── Emoji mapping ──────────────────────────────────────────────────

const ROLE_EMOJI_MAP: [RegExp, string][] = [
  [/lead|architect|tech\s*lead/i, '🏗️'],
  [/frontend|ui|design/i, '⚛️'],
  [/backend|api|server/i, '🔧'],
  [/test|qa|quality/i, '🧪'],
  [/devops|infra|platform/i, '⚙️'],
  [/docs|devrel|writer/i, '📝'],
  [/data|database|analytics/i, '📊'],
  [/security|auth/i, '🔒'],
];

/** Map a role string to its emoji. Exported for reuse. */
export function roleToEmoji(role: string): string {
  for (const [pattern, emoji] of ROLE_EMOJI_MAP) {
    if (pattern.test(role)) return emoji;
  }
  return '👤';
}

// ── Parser ─────────────────────────────────────────────────────────

/**
 * Parse a team proposal from the coordinator's response.
 * Handles multiple formats:
 *   1. Strict INIT_TEAM: format
 *   2. Markdown code blocks wrapping INIT_TEAM
 *   3. Pipe-delimited lines without INIT_TEAM header
 *   4. Emoji-prefixed role lines (🏗️ Name — Role  Scope)
 * Returns null only if no team members could be extracted.
 */
export function parseCastResponse(response: string): CastProposal | null {
  // Strip markdown code fences if present
  let cleaned = response.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  });

  // Also try without code fence stripping
  const candidates = [cleaned, response];

  for (const text of candidates) {
    const result = tryParseInitTeam(text);
    if (result && result.members.length > 0) return result;
  }

  // Fallback: try to extract pipe-delimited lines anywhere in the response
  const fallback = tryParsePipeLines(response);
  if (fallback && fallback.members.length > 0) return fallback;

  // Last resort: try emoji-prefixed lines (🏗️ Name — Role  Scope)
  const emojiResult = tryParseEmojiLines(response);
  if (emojiResult && emojiResult.members.length > 0) return emojiResult;

  return null;
}

function tryParseInitTeam(text: string): CastProposal | null {
  const initIdx = text.indexOf('INIT_TEAM:');
  // Also try "INIT_TEAM" without colon, and case-insensitive
  const altIdx = initIdx === -1 ? text.search(/INIT_TEAM\s*:?/i) : initIdx;
  if (altIdx === -1) return null;

  const block = text.slice(altIdx);
  return extractFromBlock(block);
}

function tryParsePipeLines(text: string): CastProposal | null {
  // Look for lines with pipe separators: "- Name | Role | Scope" or "Name | Role | Scope"
  const lines = text.split('\n');
  const members: CastMember[] = [];
  let universe = '';
  let projectDescription = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip table headers and separators
    if (trimmed.match(/^\|?\s*Name\s*\|/i)) continue;
    if (trimmed.match(/^\|?\s*-+\s*\|/)) continue;

    // Match: "- Name | Role | Scope" or "* Name | Role | Scope" or just "Name | Role | Scope"
    const pipeMatch = trimmed.match(/^[-*•]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/);
    if (pipeMatch) {
      const name = pipeMatch[1]!.trim();
      const role = pipeMatch[2]!.trim();
      const scope = pipeMatch[3]!.trim().replace(/\|.*$/, '').trim(); // remove trailing pipes
      if (name && role && !/^-+$/.test(name)) {
        members.push({ name, role, scope, emoji: roleToEmoji(role) });
      }
    }

    const universeMatch = trimmed.match(/^(?:\*\*)?Universe(?:\*\*)?:?\s*(.+)/i);
    if (universeMatch) universe = universeMatch[1]!.trim();

    const projectMatch = trimmed.match(/^(?:\*\*)?Project(?:\*\*)?:?\s*(.+)/i);
    if (projectMatch) projectDescription = projectMatch[1]!.trim();
  }

  if (members.length === 0) return null;
  return { members, universe: universe || 'Unknown', projectDescription: projectDescription || 'User project' };
}

function tryParseEmojiLines(text: string): CastProposal | null {
  // Match lines like: 🏗️ Ripley — Lead   Architecture, code review
  // or: 🏗️  Ripley  — Lead          Scope, decisions
  const lines = text.split('\n');
  const members: CastMember[] = [];
  let universe = '';
  let projectDescription = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Match emoji + name + dash/emdash + role + optional scope
    const emojiMatch = trimmed.match(/^[^\w\s][\uFE0F]?\s+(\w+)\s+[—–-]\s+(.+)/);
    if (emojiMatch) {
      const name = emojiMatch[1]!.trim();
      const rest = emojiMatch[2]!.trim();
      // Split rest into role and scope (role is first word(s) before double space or tab)
      const roleScopeMatch = rest.match(/^(.+?)\s{2,}(.+)$/);
      if (roleScopeMatch) {
        const role = roleScopeMatch[1]!.trim();
        const scope = roleScopeMatch[2]!.trim();
        members.push({ name, role, scope, emoji: roleToEmoji(role) });
      } else {
        // No clear scope separation — treat whole rest as role
        members.push({ name, role: rest, scope: rest, emoji: roleToEmoji(rest) });
      }
    }

    const universeMatch = trimmed.match(/Universe:?\s*(.+)/i);
    if (universeMatch && !trimmed.includes('|')) universe = universeMatch[1]!.trim();

    const projectMatch = trimmed.match(/Project:?\s*(.+)/i);
    if (projectMatch && !trimmed.includes('|')) projectDescription = projectMatch[1]!.trim();
  }

  if (members.length === 0) return null;
  return { members, universe: universe || 'Unknown', projectDescription: projectDescription || 'User project' };
}

function extractFromBlock(block: string): CastProposal | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

  const members: CastMember[] = [];
  let universe = '';
  let projectDescription = '';

  for (const line of lines) {
    // Member line: - Name | Role | Scope
    if (line.startsWith('-') && line.includes('|')) {
      const parts = line.slice(1).split('|').map(s => s.trim());
      if (parts.length >= 3) {
        const name = parts[0]!;
        const role = parts[1]!;
        const scope = parts[2]!;
        members.push({ name, role, scope, emoji: roleToEmoji(role) });
      }
    }

    // Also handle * bullets
    if (line.startsWith('*') && line.includes('|')) {
      const parts = line.slice(1).split('|').map(s => s.trim());
      if (parts.length >= 3) {
        members.push({ name: parts[0]!, role: parts[1]!, scope: parts[2]!, emoji: roleToEmoji(parts[1]!) });
      }
    }

    // UNIVERSE: line (handles **UNIVERSE:** and **UNIVERSE**: formats)
    const universeMatch = line.match(/^(?:\*\*)?UNIVERSE(?:\*\*)?:?\s*(?:\*\*)?\s*(.+)/i);
    if (universeMatch) {
      universe = universeMatch[1]!.replace(/^\*\*\s*/, '').trim();
    }

    // PROJECT: line
    const projectMatch = line.match(/^(?:\*\*)?PROJECT(?:\*\*)?:?\s*(?:\*\*)?\s*(.+)/i);
    if (projectMatch) {
      projectDescription = projectMatch[1]!.replace(/^\*\*\s*/, '').trim();
    }
  }

  if (members.length === 0) return null;
  return { members, universe: universe || 'Unknown', projectDescription: projectDescription || 'User project' };
}

// ── Charter / history generators ───────────────────────────────────

function personalityForRole(role: string): string {
  // Try catalog lookup first
  const catalogRole = getRoleById(role.toLowerCase().replace(/\s+/g, '-'));
  if (catalogRole) return catalogRole.vibe;

  const lower = role.toLowerCase();
  if (/lead|architect|tech\s*lead/.test(lower))
    return 'Sees the big picture without losing sight of the details. Decides fast, revisits when the data says so.';
  if (/frontend|ui|design/.test(lower))
    return 'Pixel-aware and user-obsessed. If it looks off by one, it is off by one.';
  if (/backend|api|server/.test(lower))
    return 'Data flows in, answers flow out. Keeps the plumbing tight and the contracts clear.';
  if (/test|qa|quality/.test(lower))
    return 'Breaks things on purpose so users never break them by accident.';
  if (/devops|infra|platform/.test(lower))
    return 'If it ships, it ships reliably. Automates everything twice.';
  if (/docs|devrel|writer/.test(lower))
    return 'Turns complexity into clarity. If the docs are wrong, the product is wrong.';
  if (/data|database|analytics/.test(lower))
    return 'Thinks in tables and queries. Normalizes first, denormalizes when the numbers demand it.';
  if (/security|auth/.test(lower))
    return 'Paranoid by design. Assumes every input is hostile until proven otherwise.';
  if (/session|scribe|log/.test(lower))
    return 'Silent observer. Keeps the record straight so the team never loses context.';
  if (/monitor|queue|work/.test(lower))
    return 'Watches the board, keeps the queue honest, nudges when things stall.';
  return 'Focused and reliable. Gets the job done without fanfare.';
}

function ownershipFromRole(role: string, scope: string): string {
  const items = scope.split(',').map(s => s.trim()).filter(Boolean);
  if (items.length >= 3) return items.slice(0, 3).map(i => `- ${i}`).join('\n');
  if (items.length > 0) return items.map(i => `- ${i}`).join('\n');
  return `- ${role} domain tasks`;
}

function generateCharter(member: CastMember): string {
  // Try catalog-based charter first
  const roleId = member.role.toLowerCase().replace(/\s+/g, '-');
  const catalogCharter = generateCharterFromRole(roleId, member.name);
  if (catalogCharter) return catalogCharter;

  const nameLower = member.name.toLowerCase();
  return `# ${member.name} — ${member.role}

> ${personalityForRole(member.role)}

## Identity

- **Name:** ${member.name}
- **Role:** ${member.role}
- **Expertise:** ${member.scope}
- **Style:** Direct and focused.

## What I Own

${ownershipFromRole(member.role, member.scope)}

## How I Work

- Read decisions.md before starting
- Write decisions to inbox when making team-relevant choices
- Focused, practical, gets things done

## Boundaries

**I handle:** ${member.scope}

**I don't handle:** Work outside my domain — the coordinator routes that elsewhere.

**When I'm unsure:** I say so and suggest who might know.

**If I review others' work:** On rejection, I may require a different agent to revise (not the original author) or request a new specialist be spawned. The Coordinator enforces this.

## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on task type
- **Fallback:** Standard chain

## Collaboration

Before starting work, run \`git rev-parse --show-toplevel\` to find the repo root, or use the \`TEAM ROOT\` provided in the spawn prompt. All \`.squad/\` paths must be resolved relative to this root.

Before starting work, read \`.squad/decisions.md\` for team decisions that affect me.
After making a decision others should know, write it to \`.squad/decisions/inbox/${nameLower}-{brief-slug}.md\`.
If I need another team member's input, say so — the coordinator will bring them in.

## Voice

${personalityForRole(member.role)}
`;
}

function generateHistory(member: CastMember, projectDescription: string): string {
  return `# ${member.name} — History

## Core Context

- **Project:** ${projectDescription}
- **Role:** ${member.role}
- **Joined:** ${new Date().toISOString()}

## Learnings

<!-- Append learnings below -->
`;
}

// ── Built-in agents ────────────────────────────────────────────────

function scribeMember(): CastMember {
  return { name: 'Scribe', role: 'Session Logger', scope: 'Maintaining decisions.md, cross-agent context sharing, orchestration logging, session logging, git commits', emoji: '📋' };
}

function scribeCharter(): string {
  const m = scribeMember();
  return generateCharter(m);
}

function ralphMember(): CastMember {
  return { name: 'Ralph', role: 'Work Monitor', scope: 'Work queue tracking, backlog management, keep-alive', emoji: '🔄' };
}

function ralphCharter(): string {
  const m = ralphMember();
  return generateCharter(m);
}

// ── Team file updaters ─────────────────────────────────────────────

function buildMembersTable(allMembers: CastMember[]): string {
  let table = `## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n`;
  for (const m of allMembers) {
    const nameLower = m.name.toLowerCase();
    let status = '✅ Active';
    if (m.role === 'Session Logger') status = '📋 Silent';
    if (m.role === 'Work Monitor') status = '🔄 Monitor';
    table += `| ${m.name} | ${m.role} | \`.squad/agents/${nameLower}/charter.md\` | ${status} |\n`;
  }
  return table;
}

// ── squad.config.ts updater ────────────────────────────────────────

/** Role string → kebab-case role id for squad.config.ts */
function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Generate (or overwrite) squad.config.ts with defineSquad/defineAgent syntax.
 * Only writes when squad.config.ts already exists (i.e., init was run with --sdk).
 */
async function updateSquadConfig(teamRoot: string, allMembers: CastMember[], projectDescription: string): Promise<boolean> {
  const configPath = join(teamRoot, 'squad.config.ts');
  if (!existsSync(configPath)) return false;

  // Only update SDK-format configs (contains defineSquad)
  const existing = await readFile(configPath, 'utf-8');
  if (!existing.includes('defineSquad')) return false;

  // Extract project name from existing config if possible
  const nameMatch = existing.match(/name:\s*'([^']+)'/);
  const projectName = nameMatch ? nameMatch[1] : 'my-project';

  let code = `import {\n  defineSquad,\n  defineTeam,\n  defineAgent,\n} from '@bradygaster/squad-sdk';\n\n`;
  code += `/**\n * Squad Configuration — ${projectName}\n`;
  if (projectDescription) {
    code += ` *\n * ${projectDescription}\n`;
  }
  code += ` */\n`;

  for (const member of allMembers) {
    const varName = member.name.toLowerCase();
    const roleId = normalizeRole(member.role);
    code += `const ${varName} = defineAgent({\n`;
    code += `  name: '${varName}',\n`;
    code += `  role: '${roleId}',\n`;
    code += `  description: '${member.name}',\n`;
    code += `  status: 'active',\n`;
    code += `});\n\n`;
  }

  code += `export default defineSquad({\n`;
  code += `  version: '1.0.0',\n\n`;
  code += `  team: defineTeam({\n`;
  code += `    name: '${projectName}',\n`;
  if (projectDescription) {
    code += `    description: '${projectDescription.replace(/'/g, "\\'")}',\n`;
  }
  code += `    members: [${allMembers.map(m => `'${m.name.toLowerCase()}'`).join(', ')}],\n`;
  code += `  }),\n\n`;
  code += `  agents: [${allMembers.map(m => m.name.toLowerCase()).join(', ')}],\n`;
  code += `});\n`;

  await writeFile(configPath, code);
  return true;
}

function buildRoutingTable(members: CastMember[]): string {
  let table = `## Work Type → Agent\n\n| Work Type | Primary | Secondary |\n|-----------|---------|----------|\n`;
  for (const m of members) {
    if (m.role === 'Session Logger' || m.role === 'Work Monitor') continue;
    table += `| ${m.scope} | ${m.name} | — |\n`;
  }
  return table;
}

// ── Main cast function ─────────────────────────────────────────────

/**
 * Create all squad agent files for a cast proposal.
 * teamRoot is the project root (parent of .squad/).
 */
export async function createTeam(teamRoot: string, proposal: CastProposal): Promise<CastResult> {
  const squadDir = join(teamRoot, '.squad');
  const agentsDir = join(squadDir, 'agents');
  const castingDir = join(squadDir, 'casting');
  const filesCreated: string[] = [];
  const membersCreated: string[] = [];
  const now = new Date().toISOString();

  // Ensure directories exist
  await mkdir(agentsDir, { recursive: true });
  await mkdir(castingDir, { recursive: true });

  // Collect all members (proposal + built-ins)
  const allMembers = [...proposal.members];

  const hasScribe = proposal.members.some(m => /scribe/i.test(m.name));
  if (!hasScribe) allMembers.push(scribeMember());

  const hasRalph = proposal.members.some(m => /ralph/i.test(m.name));
  if (!hasRalph) allMembers.push(ralphMember());

  // Create agent directories and files
  for (const member of allMembers) {
    const nameLower = member.name.toLowerCase();
    const agentDir = join(agentsDir, nameLower);
    await mkdir(agentDir, { recursive: true });

    const charterPath = join(agentDir, 'charter.md');
    let charter: string;
    if (member.name === 'Scribe' && !hasScribe) {
      charter = scribeCharter();
    } else if (member.name === 'Ralph' && !hasRalph) {
      charter = ralphCharter();
    } else {
      charter = generateCharter(member);
    }
    await writeFile(charterPath, charter);
    filesCreated.push(charterPath);

    const historyPath = join(agentDir, 'history.md');
    await writeFile(historyPath, generateHistory(member, proposal.projectDescription));
    filesCreated.push(historyPath);

    membersCreated.push(member.name);
  }

  // Create or update team.md
  const teamPath = join(squadDir, 'team.md');
  if (existsSync(teamPath)) {
    // Update existing — preserve content before and after ## Members
    const content = await readFile(teamPath, 'utf8');
    const membersIdx = content.indexOf('## Members');
    if (membersIdx !== -1) {
      const before = content.slice(0, membersIdx);
      // Find next ## header after Members
      const afterMembers = content.slice(membersIdx + '## Members'.length);
      const nextHeaderMatch = afterMembers.match(/\n(## [^\n]+)/);
      const nextHeader = nextHeaderMatch?.[1];
      const after = nextHeader
        ? afterMembers.slice(afterMembers.indexOf(nextHeader))
        : '';
      const newContent = before + buildMembersTable(allMembers) + '\n' + after;
      await writeFile(teamPath, newContent);
      filesCreated.push(teamPath);
    }
  } else {
    // Create from scratch — fresh project with no prior .squad/ directory
    const projectName = proposal.projectDescription
      ? proposal.projectDescription.slice(0, 80).replace(/\n/g, ' ')
      : 'Squad Project';
    const freshContent = [
      '# Squad Team',
      '',
      `> ${projectName}`,
      '',
      '## Coordinator',
      '',
      '| Name | Role | Notes |',
      '|------|------|-------|',
      '| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |',
      '',
      buildMembersTable(allMembers),
      '## Project Context',
      '',
      `- **Project:** ${projectName}`,
      `- **Created:** ${new Date().toISOString().split('T')[0]}`,
      '',
    ].join('\n');
    await writeFile(teamPath, freshContent);
    filesCreated.push(teamPath);
  }

  // Create or update routing.md
  const routingPath = join(squadDir, 'routing.md');
  const routingTable = buildRoutingTable(allMembers);
  if (existsSync(routingPath)) {
    // Update existing — append routing table
    const content = await readFile(routingPath, 'utf8');
    await writeFile(routingPath, content.trimEnd() + '\n\n' + routingTable + '\n');
    filesCreated.push(routingPath);
  } else {
    // Create from scratch
    const freshRouting = [
      '# Squad Routing',
      '',
      '## Work Type Rules',
      '',
      '| Work Type | Primary Agent | Fallback |',
      '|-----------|---------------|----------|',
      '',
      '## Governance',
      '',
      '- Route based on work type and agent expertise',
      '- Update this file as team capabilities evolve',
      '',
      routingTable,
    ].join('\n');
    await writeFile(routingPath, freshRouting);
    filesCreated.push(routingPath);
  }

  // Update squad.config.ts if it exists (SDK mode)
  const configUpdated = await updateSquadConfig(teamRoot, allMembers, proposal.projectDescription);
  if (configUpdated) {
    filesCreated.push(join(teamRoot, 'squad.config.ts'));
  }

  // Create casting state files
  const registryAgents: Record<string, object> = {};
  const snapshotAgents: string[] = [];
  for (const member of allMembers) {
    const nameLower = member.name.toLowerCase();
    registryAgents[nameLower] = {
      created_at: now,
      persistent_name: member.name,
      universe: proposal.universe,
      status: 'active',
    };
    snapshotAgents.push(nameLower);
  }

  const registry = { agents: registryAgents };
  await writeFile(join(castingDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
  filesCreated.push(join(castingDir, 'registry.json'));

  const history = {
    assignment_cast_snapshots: {
      [`repl-cast-${now}`]: {
        created_at: now,
        agents: snapshotAgents,
        universe: proposal.universe,
      },
    },
    universe_usage_history: [
      { universe: proposal.universe, used_at: now },
    ],
  };
  await writeFile(join(castingDir, 'history.json'), JSON.stringify(history, null, 2) + '\n');
  filesCreated.push(join(castingDir, 'history.json'));

  const policy = { universe_allowlist: ['*'], max_capacity: 25 };
  await writeFile(join(castingDir, 'policy.json'), JSON.stringify(policy, null, 2) + '\n');
  filesCreated.push(join(castingDir, 'policy.json'));

  return { teamRoot, membersCreated, filesCreated };
}

// ── Display helpers ────────────────────────────────────────────────

/** Format a cast proposal as a human-readable summary. */
export function formatCastSummary(proposal: CastProposal): string {
  const lines: string[] = [];

  for (const m of proposal.members) {
    const nameCol = m.name.padEnd(10);
    const roleCol = m.role.padEnd(15);
    lines.push(`${m.emoji}  ${nameCol} — ${roleCol} ${m.scope}`);
  }

  // Always show Scribe and Ralph in the summary
  const hasScribe = proposal.members.some(m => /scribe/i.test(m.name));
  if (!hasScribe) {
    lines.push(`📋  ${'Scribe'.padEnd(10)} — ${'(silent)'.padEnd(15)} Memory, decisions, session logs`);
  }

  const hasRalph = proposal.members.some(m => /ralph/i.test(m.name));
  if (!hasRalph) {
    lines.push(`🔄  ${'Ralph'.padEnd(10)} — ${'(monitor)'.padEnd(15)} Work queue, backlog, keep-alive`);
  }

  return lines.join('\n');
}
