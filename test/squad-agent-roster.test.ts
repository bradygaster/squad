/**
 * Regression tests for bradygaster/squad#1299 — the coordinator must
 * explicitly roster all four always-on built-in agents (Scribe, Ralph,
 * Rai, Fact Checker) so it does not silently omit them during init.
 *
 * Without these instructions, the coordinator model creates the agent
 * directories on disk but skips them from team.md during first-time
 * casting.
 *
 * After #1308 phase 1 (slim squad.agent.md), the casting "Determine team
 * size" instruction moved from squad.agent.md into the satellite skill
 * `coordinator-init-mode/SKILL.md`. The assertion needs to follow the
 * content to its new home — but the main file's stub must still name
 * the satellite skill so the coordinator knows to load it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

const TEMPLATE_TARGETS = [
  '.squad-templates/squad.agent.md',
  'templates/squad.agent.md.template',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
];

// After #1308 phase 1, the Determine-team-size / always-on-roster text
// lives in this satellite skill (canonical source + 2 template mirrors).
const INIT_MODE_SKILL_TARGETS = [
  '.squad/skills/coordinator-init-mode/SKILL.md',
  'packages/squad-cli/templates/skills/coordinator-init-mode/SKILL.md',
  'packages/squad-sdk/templates/skills/coordinator-init-mode/SKILL.md',
];

describe('squad.agent.md.template — always-on roster instructions (#1299)', () => {
  for (const rel of TEMPLATE_TARGETS) {
    describe(rel, () => {
      const fullPath = path.join(REPO_ROOT, rel);
      if (!existsSync(fullPath)) {
        it.skip(`(file does not exist in this checkout: ${rel})`, () => {});
        return;
      }
      const content = readFileSync(fullPath, 'utf-8');

      it('Init Mode stub points at the coordinator-init-mode satellite skill (#1308)', () => {
        // After #1308 phase 1, the Init Mode full protocol moved to a
        // satellite skill. squad.agent.md must keep a stub that:
        //   (a) names the satellite skill so the coordinator loads it
        //   (b) preserves the load-bearing eager-execution exception so
        //       the coordinator knows Phase 1 must end with a user confirm
        expect(content).toMatch(/coordinator-init-mode/);
        expect(content, 'Init Mode stub must keep the eager-execution exception callout').toMatch(/Eager-execution exception|eager-execution exception/);
      });

      it('has a dedicated ## Fact Checker section with roster-entry instructions', () => {
        expect(content).toMatch(/^##\s+Fact Checker\b/m);
        // Must explicitly tell the coordinator that Fact Checker goes on the
        // roster — same pattern as Rai's "always appears in team.md" line.
        expect(content).toMatch(/Fact Checker[^\n]*always appears in[^\n]*team\.md/i);
      });

      it('declares Fact Checker as dual operating mode (Verification + Devil\'s Advocate)', () => {
        // The single-agent dual-mode design is the source-of-truth from
        // bradygaster/squad#789 + #1254. The template must reinforce it so
        // the coordinator does not split them.
        const factSection = content.split(/^##\s+Fact Checker\b/m)[1] ?? '';
        const beforeNextSection = factSection.split(/^##\s+/m)[0] ?? '';
        expect(beforeNextSection).toMatch(/Verification/i);
        expect(beforeNextSection).toMatch(/Devil['']s Advocate/i);
        expect(beforeNextSection).toMatch(/dual operating mode/i);
      });

      it('preserves the existing Ralph + Rai always-on sections', () => {
        expect(content).toMatch(/^##\s+Ralph\b/m);
        expect(content).toMatch(/^##\s+Rai\b/m);
        expect(content).toMatch(/Rai[^\n]*always appears in[^\n]*team\.md/i);
      });
    });
  }
});

describe('coordinator-init-mode/SKILL.md — always-on roster instructions (post-#1308)', () => {
  // The "Determine team size" instruction that used to live in
  // squad.agent.md now lives in this satellite skill. Re-pin the same
  // assertion against the new location so the regression coverage from
  // #1299 doesn't go dark.
  for (const rel of INIT_MODE_SKILL_TARGETS) {
    describe(rel, () => {
      const fullPath = path.join(REPO_ROOT, rel);
      if (!existsSync(fullPath)) {
        it.skip(`(file does not exist in this checkout: ${rel})`, () => {});
        return;
      }
      const content = readFileSync(fullPath, 'utf-8');

      it('"Determine team size" line names all four always-on built-ins', () => {
        const teamSizeLine = content.match(/Determine team size[^\n]+/);
        expect(teamSizeLine, 'no "Determine team size" line found').toBeTruthy();
        expect(teamSizeLine![0]).toContain('Scribe');
        expect(teamSizeLine![0]).toContain('Ralph');
        expect(teamSizeLine![0]).toContain('Rai');
        expect(teamSizeLine![0]).toContain('Fact Checker');
      });

      it('lists Fact Checker among the casting exemptions (same pattern as Scribe / Ralph / Rai)', () => {
        // All four built-ins must be flagged "exempt from casting" so the
        // coordinator does not assign them cast names from the chosen
        // universe.
        for (const builtin of ['Scribe', 'Ralph', 'Rai', 'Fact Checker']) {
          expect(content, `${builtin} must be marked exempt from casting`).toMatch(
            new RegExp(`${builtin}[^\\n]*exempt from casting`, 'i'),
          );
        }
      });
    });
  }
});
