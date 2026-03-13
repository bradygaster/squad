/**
 * Base Roles — Public API
 *
 * Provides role lookup, search, and the `useRole()` builder for
 * referencing built-in roles in squad.config.ts.
 *
 * Attribution: Role content adapted from agency-agents by AgentLand
 * Contributors (MIT License) — https://github.com/msitarzewski/agency-agents
 *
 * @module roles
 */

export type { BaseRole, RoleCategory, UseRoleOptions } from './types.js';
export { BASE_ROLES, ENGINEERING_ROLE_IDS, CATEGORY_ROLE_IDS } from './catalog.js';

import type { BaseRole, RoleCategory, UseRoleOptions } from './types.js';
import type { AgentDefinition } from '../builders/types.js';
import { BASE_ROLES } from './catalog.js';

/**
 * Get all available base roles, optionally filtered by category.
 */
export function listRoles(category?: RoleCategory): readonly BaseRole[] {
  if (!category) return BASE_ROLES;
  return BASE_ROLES.filter(r => r.category === category);
}

/**
 * Look up a base role by ID.
 *
 * @param id - Role ID (e.g., 'backend', 'marketing')
 * @returns The role definition, or undefined if not found
 */
export function getRoleById(id: string): BaseRole | undefined {
  return BASE_ROLES.find(r => r.id === id);
}

/**
 * Search roles by keyword across title, vibe, expertise, and routing patterns.
 *
 * @param query - Search query (case-insensitive)
 * @returns Matching roles sorted by relevance
 */
export function searchRoles(query: string): readonly BaseRole[] {
  const q = query.toLowerCase();
  return BASE_ROLES.filter(r => {
    return (
      r.title.toLowerCase().includes(q) ||
      r.vibe.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.expertise.some(e => e.toLowerCase().includes(q)) ||
      r.routingPatterns.some(p => p.toLowerCase().includes(q))
    );
  });
}

/**
 * Get all unique categories in the catalog.
 */
export function getCategories(): readonly RoleCategory[] {
  const cats = new Set<RoleCategory>();
  for (const r of BASE_ROLES) cats.add(r.category);
  return [...cats];
}

/**
 * Create an AgentDefinition from a base role with optional overrides.
 *
 * This is the primary way to use base roles in `squad.config.ts`:
 *
 * ```typescript
 * import { useRole, defineSquad } from '@bradygaster/squad-sdk';
 *
 * export default defineSquad({
 *   agents: [
 *     useRole('lead', { name: 'ripley' }),
 *     useRole('backend', { name: 'kane', expertise: ['Node.js', 'PostgreSQL'] }),
 *   ],
 * });
 * ```
 *
 * @param roleId - Base role ID (e.g., 'backend', 'marketing')
 * @param options - Agent name and optional overrides
 * @returns AgentDefinition ready for defineSquad()
 * @throws Error if roleId is not found in the catalog
 */
export function useRole(roleId: string, options: UseRoleOptions): AgentDefinition {
  const role = getRoleById(roleId);
  if (!role) {
    const available = BASE_ROLES.map(r => r.id).join(', ');
    throw new Error(
      `Unknown base role '${roleId}'. Available roles: ${available}`
    );
  }

  const expertise = options.expertise ?? role.expertise;
  const style = options.style ?? role.style;
  const vibe = options.vibe ?? role.vibe;
  const ownership = options.extraOwnership
    ? [...role.ownership, ...options.extraOwnership]
    : role.ownership;
  const approach = options.extraApproach
    ? [...role.approach, ...options.extraApproach]
    : role.approach;
  const boundaries = {
    handles: options.boundaries?.handles ?? role.boundaries.handles,
    doesNotHandle: options.boundaries?.doesNotHandle ?? role.boundaries.doesNotHandle,
  };
  const voice = options.voice ?? role.voice;

  // Build charter content from role definition
  const rawCharter = buildCharterFromRole(role, {
    expertise,
    style,
    ownership,
    approach,
    boundaries,
    voice,
  });

  // Replace {my-name} placeholder with the agent's cast name
  const charter = rawCharter.replace(/\{my-name\}/g, options.name.toLowerCase());

  const agent: AgentDefinition = {
    name: options.name,
    role: role.title,
    description: vibe,
    charter,
    status: options.status ?? 'active',
  };

  if (options.model) {
    return { ...agent, model: options.model };
  }

  return agent;
}

/**
 * Generate Squad charter.md content from a base role definition.
 */
function buildCharterFromRole(
  role: BaseRole,
  overrides: {
    expertise: readonly string[];
    style: string;
    ownership: readonly string[];
    approach: readonly string[];
    boundaries: { handles: string; doesNotHandle: string };
    voice: string;
  },
): string {
  const lines: string[] = [];

  lines.push(`<!-- ${role.attribution} -->`);
  lines.push('');
  lines.push(`## Identity`);
  lines.push('');
  lines.push(`- **Role:** ${role.title}`);
  lines.push(`- **Expertise:** ${overrides.expertise.join(', ')}`);
  lines.push(`- **Style:** ${overrides.style}`);
  lines.push('');
  lines.push(`## What I Own`);
  lines.push('');
  for (const item of overrides.ownership) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push(`## How I Work`);
  lines.push('');
  for (const item of overrides.approach) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push(`## Boundaries`);
  lines.push('');
  lines.push(`**I handle:** ${overrides.boundaries.handles}`);
  lines.push('');
  lines.push(`**I don't handle:** ${overrides.boundaries.doesNotHandle}`);
  lines.push('');
  lines.push(`**When I'm unsure:** I say so and suggest who might know.`);
  lines.push('');
  lines.push(`**If I review others' work:** On rejection, I may require a different agent to revise (not the original author) or request a new specialist be spawned. The Coordinator enforces this.`);
  lines.push('');
  lines.push(`## Model`);
  lines.push('');
  lines.push(`- **Preferred:** auto`);
  lines.push(`- **Rationale:** Coordinator selects the best model based on task type — cost first unless writing code`);
  lines.push(`- **Fallback:** Standard chain — the coordinator handles fallback automatically`);
  lines.push('');
  lines.push(`## Collaboration`);
  lines.push('');
  lines.push('Before starting work, run `git rev-parse --show-toplevel` to find the repo root, or use the `TEAM ROOT` provided in the spawn prompt. All `.squad/` paths must be resolved relative to this root — do not assume CWD is the repo root (you may be in a worktree or subdirectory).');
  lines.push('');
  lines.push('Before starting work, read `.squad/decisions.md` for team decisions that affect me.');
  lines.push('After making a decision others should know, write it to `.squad/decisions/inbox/{my-name}-{brief-slug}.md` — the Scribe will merge it.');
  lines.push('If I need another team member\'s input, say so — the coordinator will bring them in.');
  lines.push('');
  lines.push(`## Voice`);
  lines.push('');
  lines.push(overrides.voice);

  return lines.join('\n');
}

/**
 * Generate a charter markdown string from a base role ID.
 * Used by cast.ts when creating agents during init.
 *
 * @param roleId - Base role ID
 * @param agentName - The cast name for the agent
 * @returns Full charter.md content, or null if role not found
 */
export function generateCharterFromRole(roleId: string, agentName: string): string | null {
  const role = getRoleById(roleId);
  if (!role) return null;

  const nameLower = agentName.toLowerCase();
  const charter = buildCharterFromRole(role, {
    expertise: role.expertise,
    style: role.style,
    ownership: role.ownership,
    approach: role.approach,
    boundaries: role.boundaries,
    voice: role.voice,
  });

  return `# ${agentName} — ${role.title}\n\n> ${role.vibe}\n\n${charter.replace(
    '{my-name}',
    nameLower,
  )}`;
}
