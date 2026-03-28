/**
 * CI tests for the Scribe spawn template in squad.agent.md.
 *
 * Verifies that:
 *  - DECISIONS ARCHIVE runs BEFORE DECISION INBOX (archival first, while context is fresh)
 *  - HARD GATE label is present on the archive task (haiku cannot claim discretion)
 *  - Exact byte threshold 20480 is used (not the fuzzy ~20KB)
 *  - PRE-CHECK is task 0 (measure before acting)
 *  - HEALTH REPORT is the final task (observe after)
 *  - GIT COMMIT precedes HEALTH REPORT
 *
 * Canonical source: .squad-templates/squad.agent.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function readTemplate(): string {
  return readFileSync(resolve(ROOT, '.squad-templates/squad.agent.md'), 'utf-8');
}

/**
 * Extract the Scribe task block from the template.
 * Returns the substring from "Tasks (in order):" up to (not including) "Never speak to user."
 */
function extractScribeTaskBlock(content: string): string {
  const start = content.indexOf('Tasks (in order):');
  const end = content.indexOf('Never speak to user.', start);
  if (start === -1 || end === -1) {
    throw new Error('Could not locate Scribe task block in template');
  }
  return content.slice(start, end);
}

describe('Scribe spawn template — HARD GATE enforcement', () => {
  const content = readTemplate();
  const taskBlock = extractScribeTaskBlock(content);

  it('DECISIONS ARCHIVE appears before DECISION INBOX in the task list', () => {
    const archiveIndex = taskBlock.indexOf('DECISIONS ARCHIVE');
    const inboxIndex = taskBlock.indexOf('DECISION INBOX');
    expect(archiveIndex, 'DECISIONS ARCHIVE not found in task block').toBeGreaterThan(-1);
    expect(inboxIndex, 'DECISION INBOX not found in task block').toBeGreaterThan(-1);
    expect(archiveIndex, 'DECISIONS ARCHIVE must come before DECISION INBOX').toBeLessThan(inboxIndex);
  });

  it('DECISIONS ARCHIVE task carries the [HARD GATE] label', () => {
    const archiveLine = taskBlock
      .split('\n')
      .find(line => line.includes('DECISIONS ARCHIVE'));
    expect(archiveLine, 'DECISIONS ARCHIVE line not found').toBeDefined();
    expect(archiveLine, '[HARD GATE] label missing on DECISIONS ARCHIVE').toContain('[HARD GATE]');
  });

  it('exact byte threshold 20480 is used — not the fuzzy ~20KB', () => {
    expect(taskBlock, '20480 byte threshold not found').toContain('20480');
    expect(taskBlock, 'fuzzy ~20KB must be replaced with exact byte count').not.toMatch(/~20KB/);
  });

  it('PRE-CHECK is task 0 (the first numbered task)', () => {
    const numberedLines = taskBlock
      .split('\n')
      .filter(l => l.trim().match(/^\d+\./));
    expect(numberedLines.length, 'No numbered tasks found').toBeGreaterThan(0);
    expect(numberedLines[0], 'First task must be PRE-CHECK').toContain('PRE-CHECK');
  });

  it('HEALTH REPORT is the final task in the list', () => {
    const numberedLines = taskBlock
      .split('\n')
      .filter(l => l.trim().match(/^\d+\./));
    expect(numberedLines.length, 'No numbered tasks found').toBeGreaterThan(0);
    expect(numberedLines[numberedLines.length - 1], 'Last task must be HEALTH REPORT').toContain('HEALTH REPORT');
  });

  it('GIT COMMIT appears before HEALTH REPORT', () => {
    const commitIndex = taskBlock.indexOf('GIT COMMIT');
    const healthIndex = taskBlock.indexOf('HEALTH REPORT');
    expect(commitIndex, 'GIT COMMIT not found').toBeGreaterThan(-1);
    expect(healthIndex, 'HEALTH REPORT not found').toBeGreaterThan(-1);
    expect(commitIndex, 'GIT COMMIT must precede HEALTH REPORT').toBeLessThan(healthIndex);
  });
});
