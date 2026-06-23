/**
 * Regression tests for bradygaster/squad#1299 — the canonical squad.agent.md
 * template must explicitly instruct the coordinator to roster all four
 * always-on built-in agents: Scribe, Ralph, Rai, Fact Checker.
 *
 * Without explicit roster-entry instructions, the coordinator model omits
 * agents from team.md during first-time casting even when the agent
 * directory was correctly created on disk by squad init.
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

describe('squad.agent.md.template — always-on roster instructions (#1299)', () => {
  for (const rel of TEMPLATE_TARGETS) {
    describe(rel, () => {
      const fullPath = path.join(REPO_ROOT, rel);
      if (!existsSync(fullPath)) {
        it.skip(`(file does not exist in this checkout: ${rel})`, () => {});
        return;
      }
      const content = readFileSync(fullPath, 'utf-8');

      it('mentions all four always-on built-ins in the initial team-size guidance', () => {
        // The casting flow's "Determine team size" line must name all four
        // always-on built-ins so the coordinator does not silently omit them.
        const teamSizeLine = content.match(/Determine team size[^\n]+/);
        expect(teamSizeLine, 'no "Determine team size" line found').toBeTruthy();
        expect(teamSizeLine![0]).toContain('Scribe');
        expect(teamSizeLine![0]).toContain('Ralph');
        expect(teamSizeLine![0]).toContain('Rai');
        expect(teamSizeLine![0]).toContain('Fact Checker');
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
