/**
 * Skills System (M3-3, Issue #141)
 *
 * Domain-specific knowledge packages that agents load on-demand.
 * Skills are matched by keyword triggers and agent role affinity,
 * then injected into agent context as markdown.
 */

import type { SkillDefinition } from './skill-loader.js';
export { loadSkillsFromDirectory, parseFrontmatter, parseSkillFile } from './skill-loader.js';
export type { SkillDefinition } from './skill-loader.js';
export * from './skill-source.js';

// --- Types ---

export interface SkillMatch {
  /** The matched skill */
  skill: SkillDefinition;
  /** Relevance score (0–1) */
  score: number;
  /** Reason the skill matched */
  reason: string;
}

// --- Skill Registry ---

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  /** Register a skill definition. */
  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  /** Unregister a skill by ID. */
  unregisterSkill(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /** Get a skill by ID. */
  getSkill(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  /** Get all registered skills. */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** Number of registered skills. */
  get size(): number {
    return this.skills.size;
  }

  /**
   * Match skills relevant to a task for a given agent role.
   *
   * Scoring:
   *  - +0.5 for each trigger keyword found in the task text
   *  - +0.3 if the agent role matches the skill's agentRoles
   *  - Scores are clamped to [0, 1]
   *
   * Returns matches sorted by score descending, filtered to score > 0.
   */
  matchSkills(task: string, agentRole: string): SkillMatch[] {
    const lowerTask = task.toLowerCase();
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      let score = 0;
      const reasons: string[] = [];

      // Trigger keyword matching
      const hitTriggers: string[] = [];
      for (const trigger of skill.triggers) {
        if (lowerTask.includes(trigger.toLowerCase())) {
          hitTriggers.push(trigger);
        }
      }
      if (hitTriggers.length > 0) {
        score += Math.min(hitTriggers.length * 0.5, 0.7);
        reasons.push(`triggers: ${hitTriggers.join(', ')}`);
      }

      // Agent role affinity
      if (
        skill.agentRoles.length > 0 &&
        skill.agentRoles.some((r) => r.toLowerCase() === agentRole.toLowerCase())
      ) {
        score += 0.3;
        reasons.push(`role affinity: ${agentRole}`);
      }

      if (score > 0) {
        matches.push({
          skill,
          score: Math.min(score, 1),
          reason: reasons.join('; '),
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Load a skill's content for injection into an agent's context.
   * Returns the markdown content, or undefined if skill not found.
   */
  loadSkill(skillId: string): string | undefined {
    return this.skills.get(skillId)?.content;
  }
}

// --- Skill Script System Exports ---

export * from './handler-types.js';
export { SkillScriptLoader, resolveSkillPath } from './skill-script-loader.js';
export type { LoadResult } from './handler-types.js';
