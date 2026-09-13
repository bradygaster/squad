/**
 * Team casting engine — parses coordinator team proposals and scaffolds agent files.
 * @module cli/core/cast
 */

import { join } from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import {
  getRoleById,
  generateCharterFromRole,
  addAgentToConfig,
  syncTeamCapabilities,
} from '@bradygaster/squad-sdk';
import {
  CastingEngine,
  type CastMember as EngineCastMember,
  type AgentRole as EngineAgentRole,
} from '@bradygaster/squad-sdk/casting';
import { getTemplatesDir } from './templates.js';
import { hasCopilot, insertCopilotSection } from './team-md.js';

// ── RAI Policy Template ────────────────────────────────────────────

const RAI_POLICY_TEMPLATE = `# RAI Policy

> Responsible AI policy for this project. Rai enforces these standards.

## Critical Violations (Always Blocked)

- Hardcoded credentials, API keys, tokens, passwords
- SQL injection, command injection, path traversal
- Harmful content (hate speech, violence, self-harm)
- Deceptive content (ungrounded claims, hallucinated citations)
- Instructions that bypass AI safety guidelines

## Advisory Concerns (Flagged, Not Blocked)

- PII in logs or responses
- Bias indicators in algorithms
- Exclusionary language
- Missing rate limiting on user-facing endpoints
- Insufficient input validation

## Terminology Standards

| Avoid | Prefer |
|-------|--------|
| whitelist/blacklist | allowlist/blocklist |
| master/slave | primary/replica |
| sanity check | validation, smoke test |
| dummy value | placeholder, sample |

## Opt-Out Model

- Cannot disable critical checks (credentials, harmful content, injection)
- Can disable advisory checks with justification logged to audit trail
- Temporary opt-down supported (auto re-enables after 30 days)
`;

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

// ── CastingEngine Integration ──────────────────────────────────────

/**
 * Augment a parsed CastProposal with CastingEngine data if universe is recognized.
 * Maps LLM-proposed universe names to engine universe IDs, then uses the engine to:
 * - Allocate character names from the curated pool
 * - Inject template personalities and backstories
 *
 * This is an "augment" strategy: LLM proposes roles, engine assigns names/personalities.
 */
export function augmentWithCastingEngine(proposal: CastProposal): CastProposal {
  const engine = new CastingEngine();
  const universeLower = proposal.universe.toLowerCase();

  // Map universe name to engine universe ID
  let universeId: 'usual-suspects' | 'oceans-eleven' | null = null;
  if (/usual\s*suspects/i.test(universeLower)) {
    universeId = 'usual-suspects';
  } else if (/ocean/i.test(universeLower)) {
    universeId = 'oceans-eleven';
  }

  // If universe not recognized, return as-is (LLM's arbitrary names preserved)
  if (!universeId) return proposal;

  // Map CLI role strings to engine AgentRole types (only valid engine roles)
  const roleMapping: Partial<Record<string, EngineAgentRole>> = {
    lead: 'lead',
    'tech lead': 'lead',
    architect: 'lead',
    developer: 'developer',
    'frontend dev': 'developer',
    'backend dev': 'developer',
    tester: 'tester',
    qa: 'tester',
    quality: 'tester',
    'prompt engineer': 'prompt-engineer',
    security: 'security',
    devops: 'devops',
    designer: 'designer',
    scribe: 'scribe',
    reviewer: 'reviewer',
  };

  // Extract roles from proposal and map them to engine roles
  const requiredRoles: EngineAgentRole[] = [];
  for (const member of proposal.members) {
    const normalized = member.role.toLowerCase();
    const engineRole = roleMapping[normalized];
    if (engineRole) {
      requiredRoles.push(engineRole);
    } else {
      // If role not mappable, skip it (will use fallback LLM name)
      console.warn(`[cast] Unmapped role "${member.role}" — using fallback`);
    }
  }

  // If no roles could be mapped, return as-is
  if (requiredRoles.length === 0) return proposal;

  try {
    // Use CastingEngine to cast the team with curated names
    const castMembers = engine.castTeam({
      universe: universeId,
      requiredRoles,
      teamSize: proposal.members.length,
    });

    // Augment the original proposal members with engine data
    const augmented = proposal.members.map((member, idx) => {
      const engineMember = castMembers[idx];
      if (!engineMember) return member; // fallback: preserve LLM data

      return {
        ...member,
        name: engineMember.name, // Replace LLM name with curated name
        // Store personality + backstory in scope for now (charter generation will use it)
        // We'll extend CastMember interface in the next step to hold these properly
        _personality: engineMember.personality,
        _backstory: engineMember.backstory,
      } as CastMember & { _personality?: string; _backstory?: string };
    });

    return {
      ...proposal,
      members: augmented,
    };
  } catch (err) {
    // If casting fails (e.g., not enough characters), fall back to original proposal
    console.warn(`[cast] CastingEngine failed for ${universeId}:`, err);
    return proposal;
  }
}

// ── Charter / history generators ───────────────────────────────────

function personalityForRole(role: string, engineData?: { personality?: string }): string {
  // If CastingEngine provided a personality, use it
  if (engineData?.personality) return engineData.personality;

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


function generateCharter(member: CastMember & { _personality?: string; _backstory?: string }): string {
  // Try catalog-based charter first
  const roleId = member.role.toLowerCase().replace(/\s+/g, '-');
  const catalogCharter = generateCharterFromRole(roleId, member.name);
  if (catalogCharter) return catalogCharter;

  const personality = personalityForRole(member.role, { personality: member._personality });
  const nameLower = memberId(member.name);

  // If CastingEngine provided a backstory, use it in the charter preamble
  const preamble = member._backstory || personality;

  return `# ${member.name} — ${member.role}

> ${preamble}

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

// ── Built-in agents ────────────────────────────────────────────────

// The four built-in support agents always materialize under these exact
// lowercase kebab-case directory/registry IDs, regardless of display-name
// casing or spacing (`member.name.toLowerCase()` alone turns "Fact Checker"
// into "fact checker" — a space, not a hyphen — and leaves "Rai" ambiguous
// against other built-in scaffolders). Canonical built-in contract: scribe,
// ralph, rai, fact-checker.
const BUILTIN_IDS: Record<string, string> = {
  'Scribe': 'scribe',
  'Ralph': 'ralph',
  'Rai': 'rai',
  'Fact Checker': 'fact-checker',
};

function builtinId(name: string): string | undefined {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return Object.entries(BUILTIN_IDS)
    .find(([displayName]) => displayName.toLowerCase().replace(/[^a-z0-9]+/g, '') === normalized)?.[1];
}

/** Resolve a member's directory/registry ID: the authoritative built-in ID when the name is one of the four built-ins, otherwise the existing lowercased-name behavior for specialists. */
function memberId(name: string): string {
  return builtinId(name) ?? name.toLowerCase();
}

function scribeMember(): CastMember {
  return { name: 'Scribe', role: 'Decision Merger', scope: 'Durable decision merging and deduplication', emoji: '📋' };
}

function ralphMember(): CastMember {
  return { name: 'Ralph', role: 'Work Monitor', scope: 'Work queue tracking, backlog management, keep-alive', emoji: '🔄' };
}

function RaiMember(): CastMember {
  return { name: 'Rai', role: 'RAI Reviewer', scope: 'Content safety, bias detection, credential scanning, ethical review', emoji: '🛡️' };
}

function factCheckerMember(): CastMember {
  return { name: 'Fact Checker', role: 'Fact Checker', scope: 'Claim verification, hallucination detection, counter-hypothesis analysis, source validation', emoji: '🔍' };
}

function readBuiltinCharter(
  storage: FSStorageProvider,
  templatesDir: string,
  member: CastMember,
): string {
  const id = builtinId(member.name);
  if (!id) throw new Error(`Unknown built-in support identity: ${member.name}`);
  const templatePath = join(templatesDir, `${id}-charter.md`);
  const charter = storage.readSync(templatePath);
  if (charter === undefined) {
    throw new Error(`Built-in charter template not found: ${templatePath}`);
  }
  return charter;
}

// ── Team file updaters ─────────────────────────────────────────────

function buildMembersTable(members: CastMember[]): string {
  let table = `## Members\n\n| Name | Role | Charter | Status |\n|------|------|---------|--------|\n`;
  for (const m of members) {
    const nameLower = memberId(m.name);
    table += `| ${m.name} | ${m.role} | \`.squad/agents/${nameLower}/charter.md\` | ✅ Active |\n`;
  }
  return table;
}

function buildSupportTable(): string {
  return `## Built-in Support Agents

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Scribe | Decision Merger | \`.squad/agents/scribe/charter.md\` | 📋 Silent |
| Ralph | Work Monitor | \`.squad/agents/ralph/charter.md\` | 🔄 Monitor |
| Rai | RAI Reviewer | \`.squad/agents/rai/charter.md\` | 🛡️ RAI |
| Fact Checker | Devil's Advocate & Verification Agent | \`.squad/agents/fact-checker/charter.md\` | 🔍 Verifier |
`;
}

function replaceSection(content: string, headings: string[], replacement: string): string {
  for (const heading of headings) {
    const headingIndex = content.indexOf(heading);
    if (headingIndex === -1) continue;
    const afterHeading = content.slice(headingIndex + heading.length);
    const nextHeaderMatch = afterHeading.match(/\n(## [^\n]+)/);
    const nextHeaderIndex = nextHeaderMatch?.index;
    const suffix = nextHeaderIndex === undefined ? '' : afterHeading.slice(nextHeaderIndex);
    return content.slice(0, headingIndex) + replacement.trimEnd() + '\n' + suffix;
  }
  return content;
}

function buildRoutingTable(members: CastMember[]): string {
  let table = `## Work Type → Agent\n\n| Work Type | Primary | Secondary |\n|-----------|---------|----------|\n`;
  for (const m of members) {
    if (m.role === 'Session Logger' || m.role === 'Work Monitor' || m.role === 'RAI Reviewer') continue;
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
  const storage = new FSStorageProvider();
  const squadDir = join(teamRoot, '.squad');
  const agentsDir = join(squadDir, 'agents');
  const castingDir = join(squadDir, 'casting');
  const filesCreated: string[] = [];
  const membersCreated: string[] = [];
  const now = new Date().toISOString();
  const templatesDir = getTemplatesDir();

  // Built-ins are fixed support identities, not routable Cast specialists.
  const specialistMembers = proposal.members.filter(member => !builtinId(member.name));
  const supportMembers = [scribeMember(), ralphMember(), RaiMember(), factCheckerMember()];
  const allMembers = [...specialistMembers, ...supportMembers];

  // Create agent directories and files
  for (const member of allMembers) {
    const nameLower = memberId(member.name);
    const agentDir = join(agentsDir, nameLower);

    const charterPath = join(agentDir, 'charter.md');
    const charter = builtinId(member.name)
      ? readBuiltinCharter(storage, templatesDir, member)
      : generateCharter(member);
    await storage.write(charterPath, charter);
    filesCreated.push(charterPath);

    membersCreated.push(member.name);
  }

  // Create or update team.md
  const teamPath = join(squadDir, 'team.md');
  if (storage.existsSync(teamPath)) {
    // Update existing — preserve content before and after ## Members
    const content = await storage.read(teamPath) ?? '';
    const membersIdx = content.indexOf('## Members');
    if (membersIdx !== -1) {
      let newContent = replaceSection(content, ['## Members'], buildMembersTable(specialistMembers));
      if (
        newContent.includes('## Built-in Support Agents')
        || newContent.includes('## Support Identities')
      ) {
        newContent = replaceSection(
          newContent,
          ['## Built-in Support Agents', '## Support Identities'],
          buildSupportTable(),
        );
      } else {
        const insertionPoint = newContent.includes('## Coding Agent')
          ? '## Coding Agent'
          : '## Project Context';
        newContent = newContent.replace(
          insertionPoint,
          `${buildSupportTable()}\n${insertionPoint}`,
        );
      }
      if (!hasCopilot(newContent)) {
        newContent = insertCopilotSection(newContent, false);
      }
      await storage.write(teamPath, newContent);
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
      buildMembersTable(specialistMembers),
      buildSupportTable(),
      '## Project Context',
      '',
      `- **Project:** ${projectName}`,
      `- **Created:** ${new Date().toISOString().split('T')[0]}`,
      '',
    ].join('\n');
    await storage.write(teamPath, insertCopilotSection(freshContent, false));
    filesCreated.push(teamPath);
  }

  // Create or update routing.md
  const routingPath = join(squadDir, 'routing.md');
  const routingTable = buildRoutingTable(specialistMembers);
  if (storage.existsSync(routingPath)) {
    // Update existing — append routing table
    const content = await storage.read(routingPath) ?? '';
    await storage.write(routingPath, content.trimEnd() + '\n\n' + routingTable + '\n');
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
    await storage.write(routingPath, freshRouting);
    filesCreated.push(routingPath);
  }

  // Create casting state files
  const registryAgents: Record<string, object> = {};
  const snapshotAgents: string[] = [];
  for (const member of specialistMembers) {
    const nameLower = memberId(member.name);
    registryAgents[nameLower] = {
      created_at: now,
      persistent_name: member.name,
      universe: proposal.universe,
      status: 'active',
    };
    snapshotAgents.push(nameLower);
  }

  const registry = { agents: registryAgents };
  await storage.write(join(castingDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
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
  await storage.write(join(castingDir, 'history.json'), JSON.stringify(history, null, 2) + '\n');
  filesCreated.push(join(castingDir, 'history.json'));

  const policy = { universe_allowlist: ['*'], max_capacity: 25 };
  await storage.write(join(castingDir, 'policy.json'), JSON.stringify(policy, null, 2) + '\n');
  filesCreated.push(join(castingDir, 'policy.json'));

  // Create .squad/rai/ directory with default policy and audit trail
  const raiDir = join(squadDir, 'rai');
  const raiPolicyPath = join(raiDir, 'policy.md');
  if (!storage.existsSync(raiPolicyPath)) {
    await storage.write(raiPolicyPath, RAI_POLICY_TEMPLATE);
    filesCreated.push(raiPolicyPath);
  }
  const auditTrailPath = join(raiDir, 'audit-trail.md');
  if (!storage.existsSync(auditTrailPath)) {
    await storage.write(auditTrailPath, '# RAI Audit Trail\n\n> Append-only evidence log. Entries are redacted — never contains raw secrets or harmful content.\n\n<!-- Rai appends findings below -->\n');
    filesCreated.push(auditTrailPath);
  }

  // Sync new agents into squad.config.ts (if present)
  for (const member of specialistMembers) {
    await addAgentToConfig(teamRoot, memberId(member.name), member.role);
  }

  // Re-advertise the cast in .github/agents/squad.agent.md (#1608). Cast
  // composition just changed, so the generated Team Capabilities block is
  // stale by definition. Casting still succeeds if advertisement fails, but
  // surface the error instead of silently leaving stale coordinator data.
  try {
    syncTeamCapabilities({
      squadDir,
      agentFile: join(teamRoot, '.github', 'agents', 'squad.agent.md'),
      storage,
    });
  } catch (error) {
    console.warn(
      '[cast] Could not refresh .github/agents/squad.agent.md:',
      error instanceof Error ? error.message : error,
    );
  }

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

  // Always show the four built-in support identities in the summary.
  const hasScribe = proposal.members.some(m => /scribe/i.test(m.name));
  if (!hasScribe) {
    lines.push(`📋  ${'Scribe'.padEnd(10)} — ${'(silent)'.padEnd(15)} Durable decision merging`);
  }

  const hasRalph = proposal.members.some(m => /ralph/i.test(m.name));
  if (!hasRalph) {
    lines.push(`🔄  ${'Ralph'.padEnd(10)} — ${'(monitor)'.padEnd(15)} Work queue, backlog, keep-alive`);
  }

  const hasRai = proposal.members.some(m => /Rai/i.test(m.name));
  if (!hasRai) {
    lines.push(`🛡️  ${'Rai'.padEnd(10)} — ${'(on-demand)'.padEnd(15)} RAI awareness, content safety`);
  }

  const hasFactChecker = proposal.members.some(m => /fact.?checker/i.test(m.name));
  if (!hasFactChecker) {
    lines.push(`🔍  ${'Fact Checker'.padEnd(10)} — ${'(advisory)'.padEnd(15)} Claim verification, hallucination detection`);
  }

  return lines.join('\n');
}
