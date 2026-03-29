import { join } from 'node:path';
import { listRoles, searchRoles, FSStorageProvider } from '@bradygaster/squad-sdk';

import type { ShellMessage } from './types.js';

/** Debug logger — writes to stderr only when SQUAD_DEBUG=1. */
function debugLog(...args: unknown[]): void {
  if (process.env['SQUAD_DEBUG'] === '1') {
    console.error('[SQUAD_DEBUG]', ...args);
  }
}

/**
 * Check if team.md has actual roster entries in the ## Members section.
 * Returns true if there is at least one table data row.
 */
export function hasRosterEntries(teamContent: string): boolean {
  const membersMatch = teamContent.match(/## Members\s*\n([\s\S]*?)(?=\n## |\n*$)/);
  if (!membersMatch) return false;
  const membersSection = membersMatch[1] ?? '';
  const rows = membersSection.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('|') &&
           !trimmed.match(/^\|\s*Name\s*\|/) &&
           !trimmed.match(/^\|\s*-+\s*\|/);
  });
  return rows.length > 0;
}

export interface CoordinatorConfig {
  teamRoot: string;
  /** Path to routing.md */
  routingPath?: string;
  /** Path to team.md */
  teamPath?: string;
  /** When true, include the base roles catalog in the init prompt. Default: false (fictional universe casting). */
  useBaseRoles?: boolean;
}

/** Fallback text when team.md is missing or has no roster entries. */
const noTeamFallback = `⚠️ NO TEAM CONFIGURED

This project doesn't have a Squad team yet.

**You MUST NOT do any project work.** Instead, tell the user:
1. "This project doesn't have a Squad team yet."
2. Suggest running \`squad init\` or the \`/init\` command to set one up.
3. Politely refuse any work requests until init is done.

Do not answer coding questions, route to agents, or perform any project tasks.`;

/**
 * Build an Init Mode system prompt for team casting.
 * Used when team.md exists but has no roster entries.
 *
 * When `config.useBaseRoles` is true (opt-in via `--roles`), the prompt
 * includes the built-in base roles catalog so the LLM maps agents to
 * curated role IDs. Otherwise (default), the LLM casts from a fictional
 * universe with free-form role names — the beloved casting experience.
 */
export function buildInitModePrompt(config: CoordinatorConfig): string {
  if (config.useBaseRoles) {
    return buildBaseRolesInitPrompt();
  }
  return buildUniverseCastingInitPrompt();
}

/**
 * Default init prompt — fictional universe casting (no base roles catalog).
 */
function buildUniverseCastingInitPrompt(): string {
  return `You are the Squad Coordinator in Init Mode.

This project has a Squad scaffold (.squad/ directory) but no team has been cast yet.
The user's message describes what they want to build or work on.

Your job: Propose a team of 4-5 AI agents based on what the user wants to do.

## Rules
1. Analyze the user's message to understand the project (language, stack, scope)
2. Pick a fictional universe for character names. **Strongly prefer:**
   - **The Usual Suspects** (8 characters: Keyser, McManus, Fenster, Verbal, Hockney, Redfoot, Edie, Kobayashi)
   - **Ocean's Eleven** (10 characters: Danny, Rusty, Linus, Basher, Livingston, Saul, Yen, Virgil, Turk, Reuben)
   
   You may also choose other film universes (Alien, The Matrix, Heat, Star Wars, Blade Runner, etc.) but the two above are preferred.
3. Propose 4-5 agents with roles that match the project needs
4. Scribe and Ralph are always included automatically — do NOT include them in your proposal

## Response Format — you MUST use this EXACT format:

INIT_TEAM:
- {Name} | {Role} | {scope: 2-4 words describing expertise}
- {Name} | {Role} | {scope}
- {Name} | {Role} | {scope}
- {Name} | {Role} | {scope}
UNIVERSE: {universe name}
PROJECT: {1-sentence project description}

## Example

If user says "Build a React app with a Node backend":

INIT_TEAM:
- Ripley | Lead | Architecture, code review, decisions
- Dallas | Frontend Dev | React, components, styling
- Kane | Backend Dev | Node.js, APIs, database
- Lambert | Tester | Tests, quality, edge cases
UNIVERSE: Alien
PROJECT: A React and Node.js web application

## Important
- Use character names that feel natural, not forced
- Roles should match project needs (don't always use the same 4 roles)
- For CLI projects: maybe skip Frontend, add DevOps or SDK Expert
- For data projects: add Data Engineer, skip Frontend
- Keep scope descriptions short (2-4 words each)
- Respond ONLY with the INIT_TEAM block — no other text
`;
}

/**
 * Opt-in base roles init prompt — includes the curated role catalog.
 * Activated by `squad init --roles` or `/init --roles`.
 */
function buildBaseRolesInitPrompt(): string {
  const catalog = new Map(
    listRoles().map((role: { id: string; title: string }) => [role.id, role]),
  );
  const resolveRole = (id: string) => catalog.get(id) ?? searchRoles(id)[0];
  const formatRole = (id: string, label: string): string => {
    const role = resolveRole(id);
    const title = role?.title ?? label;
    return `  ${id.padEnd(22, ' ')} — ${title}`;
  };

  const softwareRoles = [
    ['lead', 'Lead / Architect'],
    ['frontend', 'Frontend Developer'],
    ['backend', 'Backend Developer'],
    ['fullstack', 'Full-Stack Developer'],
    ['reviewer', 'Code Reviewer'],
    ['tester', 'Test Engineer'],
    ['devops', 'DevOps Engineer'],
    ['security', 'Security Engineer'],
    ['data', 'Data Engineer'],
    ['docs', 'Technical Writer'],
    ['ai', 'AI / ML Engineer'],
    ['designer', 'UI/UX Designer'],
  ] as const;
  const businessRoles = [
    ['marketing-strategist', 'Marketing Strategist'],
    ['sales-strategist', 'Sales Strategist'],
    ['product-manager', 'Product Manager'],
    ['project-manager', 'Project Manager'],
    ['support-specialist', 'Support Specialist'],
    ['game-developer', 'Game Developer'],
    ['media-buyer', 'Media Buyer'],
    ['compliance-legal', 'Compliance & Legal'],
  ] as const;
  const softwareRoleLines = softwareRoles.map(([id, label]) => formatRole(id, label)).join('\n');
  const businessRoleLines = businessRoles.map(([id, label]) => formatRole(id, label)).join('\n');

  return `You are the Squad Coordinator in Init Mode.

This project has a Squad scaffold (.squad/ directory) but no team has been cast yet.
The user's message describes what they want to build or work on.

Your job: Propose a team of 4-5 AI agents based on what the user wants to do.

## Rules
1. Analyze the user's message to understand the project (language, stack, scope)
2. Pick a fictional universe for character names (e.g., Alien, The Usual Suspects, Blade Runner, The Matrix, Heat, Star Wars). Pick ONE universe and use it consistently.
3. Propose 4-5 agents with roles that match the project needs
4. Scribe and Ralph are always included automatically — do NOT include them in your proposal

## Built-in Base Roles (use these as starting points)

The following base roles are available. Prefer these over inventing new roles — they have deep, curated charter content.
When proposing a team, match the user's project needs to these roles first.
Only propose a custom role if none of the base roles fit.

Software Development:
${softwareRoleLines}

Business & Operations:
${businessRoleLines}

When proposing a team member, use the role ID from above in the Role field.
Example: "- Ripley | lead | Architecture, code review, decisions"
This tells the system to use the pre-built Lead/Architect charter content.
If you use a role not in this list, the system will generate a generic charter instead.

## Response Format — you MUST use this EXACT format:

INIT_TEAM:
- {Name} | {Role} | {scope: 2-4 words describing expertise}
- {Name} | {Role} | {scope}
- {Name} | {Role} | {scope}
- {Name} | {Role} | {scope}
UNIVERSE: {universe name}
PROJECT: {1-sentence project description}

## Example

If user says "Build a React app with a Node backend":

INIT_TEAM:
- Ripley | lead | Architecture, code review, decisions
- Dallas | frontend | React, components, styling
- Kane | backend | Node.js, APIs, database
- Lambert | tester | Tests, quality, edge cases
UNIVERSE: Alien
PROJECT: A React and Node.js web application

## Important
- Use character names that feel natural, not forced
- Roles should match project needs (don't always use the same 4 roles)
- For CLI projects: maybe skip Frontend, add DevOps or SDK Expert
- For data projects: add Data Engineer, skip Frontend
- Keep scope descriptions short (2-4 words each)
- Respond ONLY with the INIT_TEAM block — no other text
`;
}

/**
 * Build the coordinator system prompt from team.md + routing.md.
 * This prompt tells the LLM how to route user requests to agents.
 *
 * Reads via FSStorageProvider so all file access is routed through the
 * StorageProvider abstraction (Phase 3 migration).
 */
export async function buildCoordinatorPrompt(config: CoordinatorConfig): Promise<string> {
  const squadRoot = config.teamRoot;
  const storage = new FSStorageProvider();

  // Load team.md for roster
  const teamPath = config.teamPath ?? join(squadRoot, '.squad', 'team.md');
  let teamContent = '';
  try {
    const raw = await storage.read(teamPath);
    if (raw === undefined) {
      teamContent = noTeamFallback;
    } else {
      teamContent = raw;
      if (!hasRosterEntries(teamContent)) {
        teamContent = noTeamFallback;
      }
    }
  } catch (err) {
    debugLog('buildCoordinatorPrompt: failed to read team.md at', teamPath, err);
    teamContent = noTeamFallback;
  }

  // Load routing.md for routing rules
  const routingPath = config.routingPath ?? join(squadRoot, '.squad', 'routing.md');
  let routingContent = '';
  try {
    const raw = await storage.read(routingPath);
    routingContent = raw ?? '(No routing.md found — run `squad init` to create one)';
  } catch (err) {
    debugLog('buildCoordinatorPrompt: failed to read routing.md at', routingPath, err);
    routingContent = '(No routing.md found — run `squad init` to create one)';
  }

  return `You are the Squad Coordinator — you route work to the right agent.

## Team Roster
${teamContent}

## Routing Rules
${routingContent}

## Your Job
1. Read the user's message
2. Decide which agent(s) should handle it based on routing rules
3. If naming a specific agent ("Fenster, fix the bug"), route directly
4. If ambiguous, pick the best match and explain your choice
5. For status/factual questions, answer directly without spawning

## Response Format
When routing to an agent, respond with:
ROUTE: {agent_name}
TASK: {what the agent should do}
CONTEXT: {any relevant context}

When answering directly:
DIRECT: {your answer}

When routing to multiple agents:
MULTI:
- {agent1}: {task1}
- {agent2}: {task2}
`;
}

/**
 * Parse coordinator response to extract routing decisions.
 */
export interface RoutingDecision {
  type: 'direct' | 'route' | 'multi';
  directAnswer?: string;
  routes?: Array<{ agent: string; task: string; context?: string }>;
}

export function parseCoordinatorResponse(response: string): RoutingDecision {
  const trimmed = response.trim();

  // Direct answer
  if (trimmed.startsWith('DIRECT:')) {
    return {
      type: 'direct',
      directAnswer: trimmed.slice('DIRECT:'.length).trim(),
    };
  }

  // Multi-agent routing
  if (trimmed.startsWith('MULTI:')) {
    const lines = trimmed.split('\n').slice(1);
    const routes = lines
      .filter(l => l.trim().startsWith('-'))
      .map(l => {
        const match = l.match(/^-\s*(\w+):\s*(.+)$/);
        if (match) {
          return { agent: match[1], task: match[2] };
        }
        return null;
      })
      .filter((r): r is { agent: string; task: string } => r !== null);
    return { type: 'multi', routes };
  }

  // Single agent routing
  if (trimmed.startsWith('ROUTE:')) {
    const agentMatch = trimmed.match(/ROUTE:\s*(\w+)/);
    const taskMatch = trimmed.match(/TASK:\s*(.+)/);
    const contextMatch = trimmed.match(/CONTEXT:\s*(.+)/);
    if (agentMatch) {
      return {
        type: 'route',
        routes: [{
          agent: agentMatch[1]!,
          task: taskMatch?.[1] ?? '',
          context: contextMatch?.[1],
        }],
      };
    }
  }

  // Fallback — treat as direct answer
  return { type: 'direct', directAnswer: trimmed };
}

/**
 * Format conversation history for the coordinator context window.
 * Keeps recent messages, summarizes older ones.
 */
export function formatConversationContext(
  messages: ShellMessage[],
  maxMessages: number = 20,
): string {
  const recent = messages.slice(-maxMessages);
  return recent
    .map(m => {
      const prefix = m.agentName ? `[${m.agentName}]` : `[${m.role}]`;
      return `${prefix}: ${m.content}`;
    })
    .join('\n');
}
