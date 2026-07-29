import { describe, it, expect } from 'vitest';
import { TEMPLATE_MANIFEST } from '../packages/squad-cli/src/cli/core/templates.js';
import { MANIFEST_SKILL_NAMES } from '@bradygaster/squad-sdk/config';
import { SkillRegistry, parseSkillFile } from '@bradygaster/squad-sdk/skills';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Use __dirname for reliable resolution regardless of working directory
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'packages', 'squad-cli', 'templates');

/** Expected built-in skills that ship with squad init/upgrade */
const EXPECTED_BUILTIN_SKILLS = [
  'squad-conventions',
  'error-recovery',
  'secret-handling',
  'git-workflow',
  'session-recovery',
  'reviewer-protocol',
  'test-discipline',
  'agent-collaboration',
  'adr-lifecycle-manager',
];

// Unit tests for the skill manifest declarations. End-to-end scaffolding
// (files actually written to disk) is tested via `squad init` integration tests.
describe('built-in skills in TEMPLATE_MANIFEST', () => {
  const skillEntries = TEMPLATE_MANIFEST.filter(f => f.destination.includes('.github/skills/'));

  it('includes all expected built-in skills', () => {
    const skillNames = skillEntries.map(e => {
      const match = e.destination.match(/skills\/([^/]+)\//);
      return match ? match[1] : '';
    });

    for (const expected of EXPECTED_BUILTIN_SKILLS) {
      expect(skillNames, `missing skill: ${expected}`).toContain(expected);
    }
  });

  it('keeps CLI and SDK skill manifests in sync', () => {
    const cliSkillNames = skillEntries.map(entry => {
      const match = entry.destination.match(/skills\/([^/]+)\//);
      return match ? match[1] : '';
    });

    expect(cliSkillNames.sort()).toEqual([...MANIFEST_SKILL_NAMES].sort());
  });

  it('all skill entries have overwriteOnUpgrade: true (squad-owned)', () => {
    for (const entry of skillEntries) {
      expect(entry.overwriteOnUpgrade, `${entry.source} should be squad-owned`).toBe(true);
    }
  });

  it('all skill source files exist in templates/', () => {
    for (const entry of skillEntries) {
      const srcPath = path.join(TEMPLATES_DIR, entry.source);
      expect(existsSync(srcPath), `missing template: ${entry.source}`).toBe(true);
    }
  });

  it('all skill destinations target .github/skills/', () => {
    for (const entry of skillEntries) {
      expect(entry.destination).toMatch(/\.github\/skills\/.+\/SKILL\.md$/);
    }
  });

  it(`ships at least ${EXPECTED_BUILTIN_SKILLS.length} skills`, () => {
    expect(skillEntries.length).toBeGreaterThanOrEqual(EXPECTED_BUILTIN_SKILLS.length);
  });

  it('routes ADR lifecycle work to architecture roles', () => {
    const skillPath = path.join(
      TEMPLATES_DIR,
      'skills',
      'adr-lifecycle-manager',
      'SKILL.md',
    );
    const skill = parseSkillFile(
      'adr-lifecycle-manager',
      readFileSync(skillPath, 'utf8'),
    );

    expect(skill).toBeDefined();
    expect(skill!.agentRoles).toEqual(['lead', 'architect']);

    const registry = new SkillRegistry();
    registry.registerSkill(skill!);

    for (const role of ['lead', 'architect']) {
      const match = registry
        .matchSkills('Create an ADR for this architecture decision', role)
        .find(result => result.skill.id === 'adr-lifecycle-manager');
      expect(match?.reason).toContain(`role affinity: ${role}`);
    }
  });
});
