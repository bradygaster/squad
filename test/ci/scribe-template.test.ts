/**
 * CI tests for the Scribe charter in scribe-charter.md.
 *
 * Verifies that:
 *  - The numbered task list is present in the task block starting with
 *    "After every substantial work session:"
 *  - HARD GATE enforcement is documented (decisions archival ceiling)
 *  - Decision inbox merge is a numbered step
 *  - Deduplication is a numbered step
 *  - A commit step is present
 *  - "Never speak to the user." is the final numbered step (Scribe stays invisible)
 *  - Commit step precedes the "never speak" step
 *
 * Canonical source: .squad-templates/scribe-charter.md
 *
 * Note: The Scribe section was extracted from squad.agent.md into this
 * standalone charter in PR #1035. The original test checked for
 * PRE-CHECK / HEALTH REPORT / GIT COMMIT task labels and an exact
 * 20480-byte threshold, which are not present in the new charter.
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

  it('commit step is present', () => {
    const numberedLines = taskBlock.split('\n').filter(l => l.trim().match(/^\d+\./));
    const hasStep = numberedLines.some(l => l.includes('Commit'));
    expect(hasStep, 'Commit must appear on a numbered step line').toBe(true);
  });

  it('HARD GATE enforcement is documented in the charter', () => {
    expect(content, 'HARD GATE label missing from charter').toContain('HARD GATE');
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

  it('commit step precedes "Never speak to the user."', () => {
    const commitIndex = taskBlock.indexOf('Commit');
    const neverSpeakIndex = taskBlock.indexOf('Never speak to the user.');
    expect(commitIndex, 'Commit step not found in task block').toBeGreaterThan(-1);
    expect(neverSpeakIndex, '"Never speak to the user." not found in task block').toBeGreaterThan(-1);
    expect(commitIndex, 'Commit must precede "Never speak to the user."').toBeLessThan(neverSpeakIndex);
  });
});
