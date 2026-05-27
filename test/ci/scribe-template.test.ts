/**
 * CI tests for the Scribe charter in scribe-charter.md.
 *
 * Verifies that:
 *  - The numbered task list is present in the task block starting with
 *    "After every substantial work session:"
 *  - HARD GATE enforcement is documented (decisions archival ceiling)
 *  - Decision inbox merge is a numbered step
 *  - Deduplication is a numbered step
 *  - A persistence-verification step is present (runtime state backend writes
 *    are verified via state tools; Scribe never commits mutable squad state)
 *  - "Never speak to the user." is the final numbered step (Scribe stays invisible)
 *  - Persistence-verification step precedes the "never speak" step
 *
 * Canonical source: .squad-templates/scribe-charter.md
 *
 * Note: The Scribe section was extracted from squad.agent.md into this
 * standalone charter in PR #1035. The original test checked for
 * PRE-CHECK / GIT COMMIT section labels (bold headers), which no longer
 * exist in the new prose-based charter structure. HEALTH REPORT and the
 * archival size thresholds (20KB / 50KB) are still present and tested below.
 *
 * The runtime-state-backend migration (#1158) removed the original "git commit"
 * numbered step; mutable squad state is now persisted through `squad_state_*`
 * tools. The persistence-verification step (squad_state_health + state re-reads)
 * replaces the old commit step and is what we now assert.
 *
 * #1175 then renamed the step ("Verify persistence" → "Commit and verify
 * persistence") and refined the prohibition sentence: Scribe is now ALLOWED
 * to commit STATIC files (charters, team.md, skills) when state tools are
 * unavailable, but amend/reset/checkout/push-notes/switch-branches remain
 * forbidden for *mutable* squad state. Assertions below match that contract.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function readTemplate(): string {
  return readFileSync(resolve(ROOT, '.squad-templates/scribe-charter.md'), 'utf-8');
}

/**
 * Extract the Scribe numbered task block from the charter.
 * Returns the substring from "After every substantial work session:"
 * up to and including the line containing "Never speak to the user."
 * (number- and formatting-agnostic — works regardless of step count or bold markers).
 */
function extractScribeTaskBlock(content: string): string {
  const startMarker = 'After every substantial work session:';
  const start = content.indexOf(startMarker);
  if (start === -1) throw new Error('Could not locate task block start marker in charter');

  // Find the line containing "Never speak to the user." after the start marker,
  // without relying on its step number or Markdown formatting.
  const afterStart = content.slice(start);
  const lines = afterStart.split('\n');
  const endLineIdx = lines.findIndex(l => l.includes('Never speak to the user.'));
  if (endLineIdx === -1) throw new Error('Could not locate "Never speak to the user." in charter');

  return lines.slice(0, endLineIdx + 1).join('\n');
}

describe('Scribe charter — task structure and HARD GATE enforcement', () => {
  const content = readTemplate();
  const taskBlock = extractScribeTaskBlock(content);

  it('numbered task list is present', () => {
    const numberedLines = taskBlock
      .split('\n')
      .filter(l => l.trim().match(/^\d+\./));
    expect(numberedLines.length, 'No numbered tasks found in task block').toBeGreaterThan(0);
  });

  it('decision inbox merge is a numbered step', () => {
    const numberedLines = taskBlock.split('\n').filter(l => l.trim().match(/^\d+\./));
    const hasStep = numberedLines.some(l => l.includes('Merge the decision inbox'));
    expect(hasStep, 'Decision inbox merge must appear on a numbered step line').toBe(true);
  });

  it('deduplication step is present', () => {
    const numberedLines = taskBlock.split('\n').filter(l => l.trim().match(/^\d+\./));
    const hasStep = numberedLines.some(l => l.includes('Deduplicate'));
    expect(hasStep, 'Deduplication must appear on a numbered step line').toBe(true);
  });

  it('persistence-verification step is present', () => {
    const numberedLines = taskBlock.split('\n').filter(l => l.trim().match(/^\d+\./));
    // Match case-insensitively so renames like "Verify persistence" →
    // "Commit and verify persistence" (lowercase v) don't silently break.
    const hasStep = numberedLines.some(l => /verify persistence/i.test(l));
    expect(
      hasStep,
      'Persistence-verification step (runtime state backend) must appear on a numbered step line',
    ).toBe(true);
  });

  it('charter forbids Scribe from amending/pushing/branch-switching for mutable state', () => {
    // The charter's prohibition sentence in scribe-charter.md reads:
    //   "Never amend, reset, checkout, push notes, or switch branches
    //    to persist mutable squad state."
    // (Note: "commit" was intentionally removed by PR #1175 — Scribe is now
    // allowed to commit STATIC files (charters, team.md, skills) when state
    // tools are unavailable. The mutable-state prohibition retains the other
    // history-rewriting / branch-shifting clauses.)
    // Split into targeted assertions so a regression in any individual clause
    // is caught with a precise message. Use [\s\S]* so matches survive line
    // wrapping or punctuation changes within the sentence.
    expect(
      content,
      'Charter must forbid amending history to persist mutable squad state',
    ).toMatch(/Never amend[\s\S]*mutable squad state/);
    expect(
      content,
      'Charter must forbid pushing note refs for mutable squad state',
    ).toMatch(/push notes[\s\S]*mutable squad state/);
    expect(
      content,
      'Charter must forbid switching branches for mutable squad state',
    ).toMatch(/switch branches[\s\S]*mutable squad state/);
  });

  it('HARD GATE enforcement is documented in the charter', () => {
    expect(content, 'HARD GATE label missing from charter').toContain('HARD GATE');
  });

  it('HEALTH REPORT emission is documented after archival runs', () => {
    expect(content, 'HEALTH REPORT must be documented in charter').toContain('HEALTH REPORT');
  });

  it('Tier 1 archival threshold (20KB) is documented', () => {
    expect(content, 'Tier 1 20KB archival threshold missing from charter').toContain('20KB');
  });

  it('Tier 2 archival threshold (50KB) is documented', () => {
    expect(content, 'Tier 2 50KB archival threshold missing from charter').toContain('50KB');
  });

  it('"Never speak to the user." is the final numbered step', () => {
    const numberedLines = taskBlock
      .split('\n')
      .filter(l => l.trim().match(/^\d+\./));
    expect(numberedLines.length, 'No numbered tasks found').toBeGreaterThan(0);
    expect(
      numberedLines[numberedLines.length - 1],
      'Last numbered step must be "Never speak to the user."'
    ).toContain('Never speak to the user');
  });

  it('persistence-verification step precedes "Never speak to the user." in numbered step order', () => {
    // Derive ordering from the filtered numbered-step list so the check
    // enforces *numbered-step* order, not raw substring position in the block
    // (which would pass if either phrase appeared earlier in non-step prose).
    const numberedLines = taskBlock.split('\n').filter(l => l.trim().match(/^\d+\./));
    const verifyStepIdx = numberedLines.findIndex(l => /verify persistence/i.test(l));
    const neverSpeakStepIdx = numberedLines.findIndex(l => l.includes('Never speak to the user'));
    expect(
      verifyStepIdx,
      'Persistence-verification step not found on a numbered step line',
    ).toBeGreaterThan(-1);
    expect(
      neverSpeakStepIdx,
      '"Never speak to the user." not found on a numbered step line',
    ).toBeGreaterThan(-1);
    expect(
      verifyStepIdx,
      'Persistence-verification numbered step must precede "Never speak to the user." numbered step',
    ).toBeLessThan(neverSpeakStepIdx);
  });
});
