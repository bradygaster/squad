/**
 * Tests for Skills System (M3-3, Issue #141)
 * Includes validation of shipped distributed-coordination skills (Part 4 blog)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  SkillRegistry,
  type SkillDefinition,
  type SkillMatch,
  parseFrontmatter,
  parseSkillFile,
  loadSkillsFromDirectory,
} from '@bradygaster/squad-sdk/skills';

// --- Helpers ---

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: overrides.id ?? 'test-skill',
    name: overrides.name ?? 'Test Skill',
    domain: overrides.domain ?? 'testing',
    content: overrides.content ?? '# Test Skill\nSome content.',
    triggers: overrides.triggers ?? ['test', 'spec'],
    agentRoles: overrides.agentRoles ?? ['tester'],
  };
}

// --- SkillRegistry ---

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('registerSkill / getSkill', () => {
    it('should register and retrieve a skill', () => {
      const skill = makeSkill();
      registry.registerSkill(skill);
      expect(registry.getSkill('test-skill')).toEqual(skill);
    });

    it('should return undefined for unknown skill', () => {
      expect(registry.getSkill('nope')).toBeUndefined();
    });

    it('should overwrite a skill with the same id', () => {
      registry.registerSkill(makeSkill({ content: 'v1' }));
      registry.registerSkill(makeSkill({ content: 'v2' }));
      expect(registry.getSkill('test-skill')!.content).toBe('v2');
    });
  });

  describe('unregisterSkill', () => {
    it('should remove a registered skill', () => {
      registry.registerSkill(makeSkill());
      expect(registry.unregisterSkill('test-skill')).toBe(true);
      expect(registry.getSkill('test-skill')).toBeUndefined();
    });

    it('should return false for unknown skill', () => {
      expect(registry.unregisterSkill('nope')).toBe(false);
    });
  });

  describe('getAllSkills / size', () => {
    it('should return all skills', () => {
      registry.registerSkill(makeSkill({ id: 'a' }));
      registry.registerSkill(makeSkill({ id: 'b' }));
      expect(registry.getAllSkills()).toHaveLength(2);
      expect(registry.size).toBe(2);
    });

    it('should return empty array when no skills', () => {
      expect(registry.getAllSkills()).toEqual([]);
      expect(registry.size).toBe(0);
    });
  });

  describe('loadSkill', () => {
    it('should return markdown content for a registered skill', () => {
      registry.registerSkill(makeSkill({ content: '# Hello' }));
      expect(registry.loadSkill('test-skill')).toBe('# Hello');
    });

    it('should return undefined for unknown skill', () => {
      expect(registry.loadSkill('nope')).toBeUndefined();
    });
  });

  describe('matchSkills', () => {
    beforeEach(() => {
      registry.registerSkill(makeSkill({
        id: 'ts-testing',
        name: 'TypeScript Testing',
        domain: 'testing',
        triggers: ['vitest', 'jest', 'test', 'spec'],
        agentRoles: ['tester', 'developer'],
      }));
      registry.registerSkill(makeSkill({
        id: 'security-audit',
        name: 'Security Audit',
        domain: 'security',
        triggers: ['vulnerability', 'cve', 'audit', 'owasp'],
        agentRoles: ['security'],
      }));
      registry.registerSkill(makeSkill({
        id: 'react-components',
        name: 'React Components',
        domain: 'frontend',
        triggers: ['react', 'component', 'jsx', 'tsx'],
        agentRoles: ['developer', 'designer'],
      }));
    });

    it('should match skills by trigger keywords', () => {
      const matches = registry.matchSkills('write vitest tests for the parser', 'developer');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].skill.id).toBe('ts-testing');
    });

    it('should boost score for role affinity', () => {
      const testerMatches = registry.matchSkills('run the test suite', 'tester');
      const leadMatches = registry.matchSkills('run the test suite', 'lead');
      const testerScore = testerMatches.find((m) => m.skill.id === 'ts-testing')?.score ?? 0;
      const leadScore = leadMatches.find((m) => m.skill.id === 'ts-testing')?.score ?? 0;
      expect(testerScore).toBeGreaterThan(leadScore);
    });

    it('should return empty when no triggers match', () => {
      const matches = registry.matchSkills('deploy to production', 'devops');
      expect(matches).toEqual([]);
    });

    it('should sort by score descending', () => {
      const matches = registry.matchSkills('audit the react component for vulnerability', 'security');
      expect(matches.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
      }
    });

    it('should include reason in match', () => {
      const matches = registry.matchSkills('vitest test', 'tester');
      expect(matches[0].reason).toContain('triggers');
    });

    it('should cap score at 1', () => {
      // Register a skill with many triggers that all match
      registry.registerSkill(makeSkill({
        id: 'multi-trigger',
        triggers: ['aaa', 'bbb', 'ccc', 'ddd'],
        agentRoles: ['tester'],
      }));
      const matches = registry.matchSkills('aaa bbb ccc ddd', 'tester');
      const multi = matches.find((m) => m.skill.id === 'multi-trigger');
      expect(multi).toBeDefined();
      expect(multi!.score).toBeLessThanOrEqual(1);
    });

    it('should be case-insensitive for triggers', () => {
      const matches = registry.matchSkills('Run VITEST suite', 'developer');
      expect(matches.some((m) => m.skill.id === 'ts-testing')).toBe(true);
    });

    it('should be case-insensitive for agent roles', () => {
      const matches = registry.matchSkills('vitest test', 'Tester');
      const ts = matches.find((m) => m.skill.id === 'ts-testing');
      expect(ts).toBeDefined();
      expect(ts!.reason).toContain('role affinity');
    });
  });
});

// --- parseFrontmatter ---

describe('parseFrontmatter', () => {
  it('should parse frontmatter and body', () => {
    const raw = `---
name: My Skill
domain: testing
triggers: [vitest, jest]
roles: [tester]
---
# My Skill Content
Body text.`;
    const { meta, body } = parseFrontmatter(raw);
    expect(meta.name).toBe('My Skill');
    expect(meta.domain).toBe('testing');
    expect(meta.triggers).toEqual(['vitest', 'jest']);
    expect(meta.roles).toEqual(['tester']);
    expect(body).toContain('# My Skill Content');
  });

  it('should return empty meta and full body when no frontmatter', () => {
    const raw = '# Just a body\nNo frontmatter here.';
    const { meta, body } = parseFrontmatter(raw);
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe(raw);
  });

  it('should handle empty frontmatter section', () => {
    const raw = `---
---
Body only.`;
    const { meta, body } = parseFrontmatter(raw);
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe('Body only.');
  });
});

// --- parseSkillFile ---

describe('parseSkillFile', () => {
  it('should parse a well-formed SKILL.md', () => {
    const raw = `---
name: TypeScript Testing
domain: testing
triggers: [vitest, jest]
roles: [tester, developer]
---
# TypeScript Testing
Use vitest for unit tests.`;
    const skill = parseSkillFile('ts-testing', raw);
    expect(skill).toBeDefined();
    expect(skill!.id).toBe('ts-testing');
    expect(skill!.name).toBe('TypeScript Testing');
    expect(skill!.domain).toBe('testing');
    expect(skill!.triggers).toEqual(['vitest', 'jest']);
    expect(skill!.agentRoles).toEqual(['tester', 'developer']);
    expect(skill!.content).toContain('Use vitest');
  });

  it('should use id as name when name is missing', () => {
    const raw = `---
domain: general
---
Content.`;
    const skill = parseSkillFile('fallback-name', raw);
    expect(skill!.name).toBe('fallback-name');
  });

  it('should return undefined if body is empty', () => {
    const raw = `---
name: Empty
domain: x
---
`;
    const skill = parseSkillFile('empty', raw);
    expect(skill).toBeUndefined();
  });
});

// --- loadSkillsFromDirectory ---

describe('loadSkillsFromDirectory', () => {
  const testDir = path.join('test-fixtures', `skills-test-${randomUUID().slice(0, 8)}`);

  beforeEach(() => {
    fs.mkdirSync(path.join(testDir, 'my-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, 'my-skill', 'SKILL.md'),
      `---
name: My Skill
domain: testing
triggers: [vitest]
roles: [tester]
---
# My Skill
Content here.`,
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should load skills from a directory', () => {
    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('my-skill');
    expect(skills[0].name).toBe('My Skill');
  });

  it('should return empty array for non-existent directory', () => {
    expect(loadSkillsFromDirectory('/no/such/path')).toEqual([]);
  });

  it('should skip subdirectories without SKILL.md', () => {
    fs.mkdirSync(path.join(testDir, 'empty-dir'), { recursive: true });
    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(1);
  });

  it('should skip malformed SKILL.md files gracefully', () => {
    fs.mkdirSync(path.join(testDir, 'bad-skill'), { recursive: true });
    // Empty file — parseFrontmatter returns empty body → parseSkillFile returns undefined
    fs.writeFileSync(path.join(testDir, 'bad-skill', 'SKILL.md'), '', 'utf-8');
    const skills = loadSkillsFromDirectory(testDir);
    expect(skills).toHaveLength(1); // only my-skill loaded
  });
});

// --- Shipped Distributed-Coordination Skills Validation ---
// Validates that the four Part 4 blog skills are present and well-formed.

const SHIPPED_SKILLS_DIR = path.join(process.cwd(), '.squad', 'skills');

const DISTRIBUTED_SKILLS = [
  'gh-auth-isolation',
  'stale-lock-detection',
  'message-serialization',
  'notification-routing',
] as const;

describe('Shipped Distributed-Coordination Skills', () => {
  for (const skillId of DISTRIBUTED_SKILLS) {
    const skillFile = path.join(SHIPPED_SKILLS_DIR, skillId, 'SKILL.md');

    describe(`${skillId}`, () => {
      it('SKILL.md exists', () => {
        expect(fs.existsSync(skillFile), `Missing: .squad/skills/${skillId}/SKILL.md`).toBe(true);
      });

      it('SKILL.md is parseable', () => {
        if (!fs.existsSync(skillFile)) return;
        const raw = fs.readFileSync(skillFile, 'utf-8');
        const skill = parseSkillFile(skillId, raw);
        expect(skill, `parseSkillFile returned undefined for ${skillId}`).toBeDefined();
      });

      it('has required frontmatter fields (name, description, domain)', () => {
        if (!fs.existsSync(skillFile)) return;
        const raw = fs.readFileSync(skillFile, 'utf-8');
        const { meta } = parseFrontmatter(raw);
        expect(meta.name, `${skillId}: missing name`).toBeTruthy();
        expect(meta.description, `${skillId}: missing description`).toBeTruthy();
        expect(meta.domain, `${skillId}: missing domain`).toBeTruthy();
      });

      it('has a non-empty body with at least one heading', () => {
        if (!fs.existsSync(skillFile)) return;
        const raw = fs.readFileSync(skillFile, 'utf-8');
        const { body } = parseFrontmatter(raw);
        expect(body.length, `${skillId}: body is empty`).toBeGreaterThan(50);
        expect(/^#+\s+.+/m.test(body), `${skillId}: missing heading`).toBe(true);
      });

      it('has balanced code fences', () => {
        if (!fs.existsSync(skillFile)) return;
        const raw = fs.readFileSync(skillFile, 'utf-8');
        const fenceCount = (raw.match(/```/g) ?? []).length;
        expect(fenceCount % 2, `${skillId}: unbalanced code fences`).toBe(0);
      });

      it('has an Anti-Patterns section', () => {
        if (!fs.existsSync(skillFile)) return;
        const raw = fs.readFileSync(skillFile, 'utf-8');
        expect(raw, `${skillId}: missing Anti-Patterns section`).toContain('Anti-Patterns');
      });
    });
  }
});
