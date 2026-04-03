import { describe, it, expect } from 'vitest';
import { TEMPLATE_MANIFEST } from '../packages/squad-cli/src/cli/core/templates.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

const TEMPLATES_DIR = path.join(process.cwd(), 'packages', 'squad-cli', 'templates');

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
];

describe('built-in skills in TEMPLATE_MANIFEST', () => {
  const skillEntries = TEMPLATE_MANIFEST.filter(f => f.destination.includes('.copilot/skills/'));

  it('includes all expected built-in skills', () => {
    const skillNames = skillEntries.map(e => {
      const match = e.destination.match(/skills\/([^/]+)\//);
      return match ? match[1] : '';
    });

    for (const expected of EXPECTED_BUILTIN_SKILLS) {
      expect(skillNames, `missing skill: ${expected}`).toContain(expected);
    }
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

  it('all skill destinations target .copilot/skills/', () => {
    for (const entry of skillEntries) {
      expect(entry.destination).toMatch(/\.copilot\/skills\/.+\/SKILL\.md$/);
    }
  });

  it(`ships at least ${EXPECTED_BUILTIN_SKILLS.length} skills`, () => {
    expect(skillEntries.length).toBeGreaterThanOrEqual(EXPECTED_BUILTIN_SKILLS.length);
  });
});
