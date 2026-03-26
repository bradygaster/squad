/**
 * Nap feature tests — context window maintenance for .squad/ directories.
 *
 * Tests the nap engine which compresses history, prunes logs, cleans inboxes,
 * and archives decisions to keep .squad/ lean for LLM context windows.
 *
 * The nap engine operates on ## headings as compression units.
 * ## Core Context is always preserved; other ## sections are kept/archived
 * based on the keepEntries threshold (5 default, 3 deep).
 *
 * @see packages/squad-cli/src/cli/core/nap.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { NapResult, NapMetrics } from '../packages/squad-cli/src/cli/core/nap.js';
import { runNap, formatNapReport } from '../packages/squad-cli/src/cli/core/nap.js';

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

function createTestSquadDir(structure: Record<string, string>): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'squad-nap-test-'));
  tmpDirs.push(tmpDir);
  const squadDir = join(tmpDir, '.squad');
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = join(squadDir, filePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return squadDir;
}

/**
 * Generate a fake history.md with N ## sections + a Core Context section.
 * Uses ## headings (not ###) because the compressor operates on ## boundaries.
 */
function generateHistory(sectionCount: number, sectionSize = 2000): string {
  const coreContext = '## Core Context\n\nThis agent handles testing.\n\n';
  let sections = '';
  for (let i = 0; i < sectionCount; i++) {
    const date = `2026-03-${String(i + 1).padStart(2, '0')}`;
    sections += `## ${date}: Entry ${i + 1}\n`;
    sections += 'a'.repeat(sectionSize) + '\n\n';
  }
  return coreContext + sections;
}

/** Set file mtime to N days ago. */
function setFileAge(filePath: string, daysAgo: number): void {
  const past = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  utimesSync(filePath, past, past);
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// 1. Metrics collection (before state)
// ============================================================================

describe('Nap — Metrics collection', () => {
  it('returns zeroed metrics for an empty .squad/ directory', async () => {
    const squadDir = createTestSquadDir({});
    const result = await runNap({ squadDir });

    expect(result.before.totalFiles).toBe(0);
    expect(result.before.totalBytes).toBe(0);
    expect(result.before.historyBytes).toBe(0);
    expect(result.before.logBytes).toBe(0);
    expect(result.before.decisionBytes).toBe(0);
    expect(result.before.inboxFiles).toBe(0);
  });

  it('counts files and bytes correctly for a populated .squad/', async () => {
    const squadDir = createTestSquadDir({
      'decisions.md': 'Some decisions content here',
      'agents/hockney/history.md': 'Hockney history',
      'agents/fenster/history.md': 'Fenster history content',
      'log/session-1.md': 'Log entry one',
      'decisions/inbox/item1.md': 'Inbox item',
    });
    const result = await runNap({ squadDir, dryRun: true });

    expect(result.before.totalFiles).toBeGreaterThan(0);
    expect(result.before.totalBytes).toBeGreaterThan(0);
    expect(result.before.historyBytes).toBeGreaterThan(0);
    expect(result.before.decisionBytes).toBeGreaterThan(0);
    expect(result.before.inboxFiles).toBe(1);
  });

  it('tracks per-agent history.md sizes in historyBytes', async () => {
    const hist1 = 'A'.repeat(5000);
    const hist2 = 'B'.repeat(3000);
    const squadDir = createTestSquadDir({
      'agents/alpha/history.md': hist1,
      'agents/beta/history.md': hist2,
    });
    const result = await runNap({ squadDir, dryRun: true });

    expect(result.before.historyBytes).toBeGreaterThanOrEqual(8000);
  });
});

// ============================================================================
// 2. History compression (Tier 1)
// ============================================================================

describe('Nap — History compression', () => {
  it('leaves history under 15KB untouched', async () => {
    const smallHistory = generateHistory(3, 1000); // ~3KB
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': smallHistory,
    });
    const result = await runNap({ squadDir });

    const compressActions = result.actions.filter(
      (a) => a.type === 'compress' && a.target.includes('hockney')
    );
    expect(compressActions).toHaveLength(0);

    const afterContent = readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8');
    expect(afterContent).toBe(smallHistory);
  });

  it('compresses history over 15KB, keeping 5 most recent entries + core context', async () => {
    // 10 entries × 2KB each + core context ≈ 20KB+
    const largeHistory = generateHistory(10, 2000);
    expect(Buffer.byteLength(largeHistory)).toBeGreaterThan(15 * 1024);

    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
    });
    const result = await runNap({ squadDir });

    // Should have a compress action
    const compressActions = result.actions.filter(
      (a) => a.type === 'compress' && a.target.includes('hockney')
    );
    expect(compressActions.length).toBeGreaterThan(0);
    expect(compressActions[0]!.bytesSaved).toBeGreaterThan(0);

    // Compressed file should still contain Core Context
    const afterContent = readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8');
    expect(afterContent).toContain('Core Context');

    // Should keep 5 most recent entries (entries 6–10)
    expect(afterContent).toContain('Entry 10');
    expect(afterContent).toContain('Entry 9');
    expect(afterContent).toContain('Entry 8');
    expect(afterContent).toContain('Entry 7');
    expect(afterContent).toContain('Entry 6');

    // Older entries should be gone from the main file
    expect(afterContent).not.toContain('## 2026-03-01: Entry 1');
    expect(afterContent).not.toContain('## 2026-03-05: Entry 5');
  });

  it('archives compressed content to history-archive.md', async () => {
    const largeHistory = generateHistory(10, 2000);
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
    });
    await runNap({ squadDir });

    const archivePath = join(squadDir, 'agents/hockney/history-archive.md');
    expect(existsSync(archivePath)).toBe(true);

    const archiveContent = readFileSync(archivePath, 'utf8');
    // Archived entries should include the old ones
    expect(archiveContent).toContain('Entry 1');
    expect(archiveContent).toContain('Entry 2');
  });

  it('appends to existing history-archive.md (does not overwrite)', async () => {
    const existingArchive = '## Previously archived\n\nOld archive content\n';
    const largeHistory = generateHistory(10, 2000);
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
      'agents/hockney/history-archive.md': existingArchive,
    });
    await runNap({ squadDir });

    const archiveContent = readFileSync(join(squadDir, 'agents/hockney/history-archive.md'), 'utf8');
    // Old content preserved
    expect(archiveContent).toContain('Old archive content');
    // New content appended
    expect(archiveContent).toContain('Entry 1');
  });

  it('preserves Core Context section in compressed file', async () => {
    const history = '## Core Context\n\nI am the tester. I break things.\n\n' +
      generateHistory(10, 2000).replace(/## Core Context[\s\S]*?\n\n/, '');
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': history,
    });

    // Ensure it's over threshold
    expect(Buffer.byteLength(history)).toBeGreaterThan(15 * 1024);

    await runNap({ squadDir });

    const afterContent = readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8');
    expect(afterContent).toContain('Core Context');
    expect(afterContent).toContain('I am the tester');
  });
});

// ============================================================================
// 3. Log pruning
// ============================================================================

describe('Nap — Log pruning', () => {
  it('deletes log files older than 7 days', async () => {
    const squadDir = createTestSquadDir({
      'log/old-session.md': 'old log',
      'log/recent-session.md': 'recent log',
      'orchestration-log/old-orch.md': 'old orch log',
      'orchestration-log/recent-orch.md': 'recent orch log',
    });

    // Age the "old" files
    setFileAge(join(squadDir, 'log/old-session.md'), 10);
    setFileAge(join(squadDir, 'orchestration-log/old-orch.md'), 10);
    // Keep "recent" files fresh (default mtime is now)

    const result = await runNap({ squadDir });

    // Old files pruned
    expect(existsSync(join(squadDir, 'log/old-session.md'))).toBe(false);
    expect(existsSync(join(squadDir, 'orchestration-log/old-orch.md'))).toBe(false);

    // Recent files preserved
    expect(existsSync(join(squadDir, 'log/recent-session.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'orchestration-log/recent-orch.md'))).toBe(true);

    // Should have prune actions
    const pruneActions = result.actions.filter((a) => a.type === 'prune');
    expect(pruneActions.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves recent files (< 7 days old)', async () => {
    const squadDir = createTestSquadDir({
      'log/yesterday.md': 'yesterday log',
      'log/today.md': 'today log',
    });

    setFileAge(join(squadDir, 'log/yesterday.md'), 1);
    // today.md has default mtime (now)

    await runNap({ squadDir });

    expect(existsSync(join(squadDir, 'log/yesterday.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'log/today.md'))).toBe(true);
  });

  it('keeps directories intact after pruning all files', async () => {
    const squadDir = createTestSquadDir({
      'log/ancient.md': 'ancient log',
      'orchestration-log/ancient.md': 'ancient orch',
    });

    setFileAge(join(squadDir, 'log/ancient.md'), 30);
    setFileAge(join(squadDir, 'orchestration-log/ancient.md'), 30);

    await runNap({ squadDir });

    // Directories should still exist even if empty
    expect(existsSync(join(squadDir, 'log'))).toBe(true);
    expect(existsSync(join(squadDir, 'orchestration-log'))).toBe(true);
    expect(statSync(join(squadDir, 'log')).isDirectory()).toBe(true);
    expect(statSync(join(squadDir, 'orchestration-log')).isDirectory()).toBe(true);
  });
});

// ============================================================================
// 4. Inbox cleanup
// ============================================================================

describe('Nap — Inbox cleanup', () => {
  it('merges orphaned inbox files into decisions.md', async () => {
    const squadDir = createTestSquadDir({
      'decisions.md': '# Decisions\n\nExisting decisions.\n',
      'decisions/inbox/new-rule.md': '### New rule\nDo the thing.\n',
      'decisions/inbox/another.md': '### Another\nDo something else.\n',
    });

    const result = await runNap({ squadDir });

    const decisions = readFileSync(join(squadDir, 'decisions.md'), 'utf8');
    expect(decisions).toContain('New rule');
    expect(decisions).toContain('Another');

    // Inbox files should be cleaned up
    const mergeActions = result.actions.filter((a) => a.type === 'merge');
    expect(mergeActions.length).toBeGreaterThan(0);
  });

  it('deletes inbox files after merging', async () => {
    const squadDir = createTestSquadDir({
      'decisions.md': '# Decisions\n',
      'decisions/inbox/item.md': '### Item\nContent.\n',
    });

    await runNap({ squadDir });

    expect(existsSync(join(squadDir, 'decisions/inbox/item.md'))).toBe(false);
  });

  it('makes no changes when inbox is empty', async () => {
    const squadDir = createTestSquadDir({
      'decisions.md': '# Decisions\n',
      'decisions/inbox/.gitkeep': '',
    });

    const result = await runNap({ squadDir });
    const mergeActions = result.actions.filter((a) => a.type === 'merge');
    // .gitkeep is not a decision file
    expect(mergeActions).toHaveLength(0);
  });
});

// ============================================================================
// 5. Decision archival
// ============================================================================

describe('Nap — Decision archival', () => {
  it('leaves decisions.md under 20KB untouched', async () => {
    const smallDecisions = '# Decisions\n' + 'x'.repeat(10 * 1024);
    const squadDir = createTestSquadDir({
      'decisions.md': smallDecisions,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions).toHaveLength(0);
  });

  it('archives old entries from decisions.md over 20KB', async () => {
    // Create decisions.md over 20KB with many entries using dates >30 days old
    let bigDecisions = '# Decisions\n\n';
    for (let i = 0; i < 30; i++) {
      bigDecisions += `### 2024-01-${String(i + 1).padStart(2, '0')}: Decision ${i + 1}\n`;
      bigDecisions += 'y'.repeat(1000) + '\n\n';
    }
    expect(Buffer.byteLength(bigDecisions)).toBeGreaterThan(20 * 1024);

    const squadDir = createTestSquadDir({
      'decisions.md': bigDecisions,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions.length).toBeGreaterThan(0);

    // decisions-archive.md should exist with old entries
    const archivePath = join(squadDir, 'decisions-archive.md');
    expect(existsSync(archivePath)).toBe(true);

    // decisions.md should be smaller now
    const afterSize = statSync(join(squadDir, 'decisions.md')).size;
    expect(afterSize).toBeLessThan(Buffer.byteLength(bigDecisions));
  });

  it('count-based fallback: archives oldest recent entries when all entries are <30 days old and >20KB', async () => {
    // 50 entries all dated today — all "recent" by age, but total >20KB
    const today = new Date().toISOString().slice(0, 10);
    let bigRecent = '# Decisions\n\n';
    for (let i = 0; i < 50; i++) {
      bigRecent += `### ${today}: Decision ${i + 1}\n`;
      bigRecent += 'z'.repeat(600) + '\n\n';
    }
    expect(Buffer.byteLength(bigRecent)).toBeGreaterThan(20 * 1024);

    const squadDir = createTestSquadDir({
      'decisions.md': bigRecent,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions).toHaveLength(1);
    expect(archiveActions[0]!.bytesSaved).toBeGreaterThan(0);

    // Archive file should have been created
    expect(existsSync(join(squadDir, 'decisions-archive.md'))).toBe(true);

    // decisions.md should now be ≤20KB
    const afterSize = statSync(join(squadDir, 'decisions.md')).size;
    expect(afterSize).toBeLessThanOrEqual(20 * 1024);
  });

  it('count-based fallback: all-recent entries under threshold returns null (no archival)', async () => {
    // 5 entries all dated today, total well under 20KB
    const today = new Date().toISOString().slice(0, 10);
    let smallRecent = '# Decisions\n\n';
    for (let i = 0; i < 5; i++) {
      smallRecent += `### ${today}: Decision ${i + 1}\n`;
      smallRecent += 'Content here.\n\n';
    }
    expect(Buffer.byteLength(smallRecent)).toBeLessThan(20 * 1024);

    const squadDir = createTestSquadDir({
      'decisions.md': smallRecent,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions).toHaveLength(0);
    expect(existsSync(join(squadDir, 'decisions-archive.md'))).toBe(false);
  });

  it('count-based fallback: undated entries are preserved, not archived', async () => {
    // Mix: 10 undated directive entries + 40 dated entries, total >20KB
    const today = new Date().toISOString().slice(0, 10);
    let mixedContent = '# Decisions\n\n';
    // Undated entries first (foundational directives)
    for (let i = 0; i < 10; i++) {
      mixedContent += `### Directive ${i + 1}: Always do X\n`;
      mixedContent += 'Foundational rule content.\n\n';
    }
    // Dated entries
    for (let i = 0; i < 40; i++) {
      mixedContent += `### ${today}: Decision ${i + 1}\n`;
      mixedContent += 'd'.repeat(500) + '\n\n';
    }
    expect(Buffer.byteLength(mixedContent)).toBeGreaterThan(20 * 1024);

    const squadDir = createTestSquadDir({
      'decisions.md': mixedContent,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions).toHaveLength(1);

    // All undated entries must remain in decisions.md
    const remaining = readFileSync(join(squadDir, 'decisions.md'), 'utf8');
    for (let i = 0; i < 10; i++) {
      expect(remaining).toContain(`Directive ${i + 1}: Always do X`);
    }

    // Archived content should NOT contain any undated entries
    const archived = readFileSync(join(squadDir, 'decisions-archive.md'), 'utf8');
    for (let i = 0; i < 10; i++) {
      expect(archived).not.toContain(`Directive ${i + 1}: Always do X`);
    }
  });

  it('count-based fallback: exactly at threshold does NOT archive (boundary case)', async () => {
    // Build content that is exactly at or just under 20KB with all-recent entries
    const today = new Date().toISOString().slice(0, 10);
    const header = '# Decisions\n\n';
    const headerSize = Buffer.byteLength(header, 'utf8');
    // Each entry: "### YYYY-MM-DD: Decision N\n" + padding + "\n\n"
    const entryHeading = `### ${today}: Decision 1\n`;
    const headingSize = Buffer.byteLength(entryHeading, 'utf8');
    // Fill to exactly DECISION_THRESHOLD (20*1024) with a single entry
    const paddingNeeded = (20 * 1024) - headerSize - headingSize - 2; // 2 for \n\n
    const exactContent = header + entryHeading + 'x'.repeat(paddingNeeded) + '\n\n';
    // Verify we're at or just at the threshold
    expect(Buffer.byteLength(exactContent)).toBeLessThanOrEqual(20 * 1024 + 10);

    const squadDir = createTestSquadDir({
      'decisions.md': exactContent,
    });

    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter(
      (a) => a.type === 'archive' && a.target.includes('decisions')
    );
    expect(archiveActions).toHaveLength(0);
    expect(existsSync(join(squadDir, 'decisions-archive.md'))).toBe(false);
  });
  it('warns when decisions.md is over threshold but nothing is archivable', async () => {
    // decisions.md >20KB with ONLY header content — no ### entries at all.
    // archiveDecisions() finds no entries and returns null, but the file is oversized.
    const headerOnly = '# Decisions\n\n' + 'x'.repeat(21 * 1024);
    expect(Buffer.byteLength(headerOnly)).toBeGreaterThan(20 * 1024);

    const squadDir = createTestSquadDir({ 'decisions.md': headerOnly });
    const result = await runNap({ squadDir, dryRun: true });

    const warnActions = result.actions.filter(
      (a) => a.type === 'warning' && a.target.includes('decisions'),
    );
    expect(warnActions).toHaveLength(1);
    expect(warnActions[0]!.bytesSaved).toBe(0);
    expect(warnActions[0]!.description).toContain('no entries could be archived');
  });

  it('no warning when decisions.md is under threshold', async () => {
    const smallContent = '# Decisions\n\n' + 'x'.repeat(5 * 1024);
    expect(Buffer.byteLength(smallContent)).toBeLessThan(20 * 1024);

    const squadDir = createTestSquadDir({ 'decisions.md': smallContent });
    const result = await runNap({ squadDir });

    const warnActions = result.actions.filter((a) => a.type === 'warning');
    expect(warnActions).toHaveLength(0);
  });

  it('no warning when archival succeeds', async () => {
    // decisions.md >20KB with old entries that DO get archived
    let bigOldDecisions = '# Decisions\n\n';
    for (let i = 0; i < 30; i++) {
      bigOldDecisions += `### 2024-01-${String(i + 1).padStart(2, '0')}: Decision ${i + 1}\n`;
      bigOldDecisions += 'w'.repeat(800) + '\n\n';
    }
    expect(Buffer.byteLength(bigOldDecisions)).toBeGreaterThan(20 * 1024);

    const squadDir = createTestSquadDir({ 'decisions.md': bigOldDecisions });
    const result = await runNap({ squadDir });

    const archiveActions = result.actions.filter((a) => a.type === 'archive');
    expect(archiveActions.length).toBeGreaterThan(0);

    const warnActions = result.actions.filter((a) => a.type === 'warning');
    expect(warnActions).toHaveLength(0);
  });
});

// ============================================================================
// 6. Deep mode (Tier 2)
// ============================================================================

describe('Nap — Deep mode', () => {
  it('uses more aggressive compression (3 entries instead of 5)', async () => {
    const largeHistory = generateHistory(10, 2000);
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
    });

    await runNap({ squadDir, deep: true });

    const afterContent = readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8');
    // Should keep only 3 most recent in deep mode
    expect(afterContent).toContain('Entry 10');
    expect(afterContent).toContain('Entry 9');
    expect(afterContent).toContain('Entry 8');

    // Entries outside the top 3 should be archived
    expect(afterContent).not.toContain('## 2026-03-05: Entry 5');
    expect(afterContent).not.toContain('## 2026-03-01: Entry 1');
  });

  it('still runs all Tier 1 actions in deep mode', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
      'log/old.md': 'old log',
      'decisions/inbox/item.md': '### Item\nContent.\n',
      'decisions.md': '# Decisions\n',
    });

    setFileAge(join(squadDir, 'log/old.md'), 10);

    const result = await runNap({ squadDir, deep: true });

    // Verify all Tier 1 action types present
    const actionTypes = new Set(result.actions.map((a) => a.type));
    expect(actionTypes.has('compress')).toBe(true);
    expect(actionTypes.has('prune')).toBe(true);
    expect(actionTypes.has('merge')).toBe(true);
  });
});

// ============================================================================
// 7. Dry-run mode
// ============================================================================

describe('Nap — Dry-run mode', () => {
  it('does not modify any files', async () => {
    const largeHistory = generateHistory(10, 2000);
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
      'log/old.md': 'old log',
      'decisions/inbox/item.md': '### Item\nContent.\n',
      'decisions.md': '# Decisions\n',
    });
    setFileAge(join(squadDir, 'log/old.md'), 10);

    const beforeHistory = readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8');
    const beforeDecisions = readFileSync(join(squadDir, 'decisions.md'), 'utf8');

    const result = await runNap({ squadDir, dryRun: true });

    // Files should be unchanged
    expect(readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8')).toBe(beforeHistory);
    expect(readFileSync(join(squadDir, 'decisions.md'), 'utf8')).toBe(beforeDecisions);
    expect(existsSync(join(squadDir, 'log/old.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'decisions/inbox/item.md'))).toBe(true);

    // But actions should still be reported
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('reports projected changes in before/after metrics', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
      'log/old.md': 'old log content',
    });
    setFileAge(join(squadDir, 'log/old.md'), 10);

    const result = await runNap({ squadDir, dryRun: true });

    // After metrics should reflect projected savings
    expect(result.after.totalBytes).toBeLessThan(result.before.totalBytes);
  });

  it('does not create archive files in dry-run', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
    });

    await runNap({ squadDir, dryRun: true });

    expect(existsSync(join(squadDir, 'agents/hockney/history-archive.md'))).toBe(false);
  });
});

// ============================================================================
// 8. Journal safety
// ============================================================================

describe('Nap — Journal safety', () => {
  it('creates .nap-journal at start and removes on completion', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': 'small history',
    });

    // After successful nap, journal should be cleaned up
    await runNap({ squadDir });

    expect(existsSync(join(squadDir, '.nap-journal'))).toBe(false);
  });

  it('warns when an existing journal is found at start', async () => {
    const squadDir = createTestSquadDir({
      '.nap-journal': 'stale journal from interrupted run',
      'agents/hockney/history.md': 'some history',
    });

    const result = await runNap({ squadDir });

    // Should still complete (not crash)
    expect(result).toBeDefined();
    expect(result.before).toBeDefined();
    expect(result.after).toBeDefined();

    // Journal should be cleaned up after completion
    expect(existsSync(join(squadDir, '.nap-journal'))).toBe(false);
  });
});

// ============================================================================
// 9. Report formatting
// ============================================================================

describe('Nap — Report formatting', () => {
  function makeResult(overrides?: Partial<NapResult>): NapResult {
    return {
      before: {
        totalFiles: 42,
        totalBytes: 150000,
        historyBytes: 80000,
        logBytes: 40000,
        decisionBytes: 25000,
        inboxFiles: 3,
      },
      after: {
        totalFiles: 35,
        totalBytes: 90000,
        historyBytes: 40000,
        logBytes: 10000,
        decisionBytes: 25000,
        inboxFiles: 0,
      },
      actions: [
        { type: 'compress', target: 'agents/hockney/history.md', description: 'Compressed history', bytesSaved: 40000 },
        { type: 'prune', target: 'log/old.md', description: 'Pruned old log', bytesSaved: 30000 },
      ],
      ...overrides,
    };
  }

  it('formats byte sizes in human-readable units (KB, MB)', () => {
    const report = formatNapReport(makeResult());

    // Should show KB values (150000 bytes = ~146KB)
    expect(report).toMatch(/\d+(\.\d+)?\s*(KB|MB|kB|mb)/i);
  });

  it('includes token estimates (~250 tokens per KB)', () => {
    const report = formatNapReport(makeResult());

    // 150000 bytes ≈ 146KB ≈ 36,621 tokens
    expect(report.toLowerCase()).toContain('token');
  });

  it('strips emoji and ANSI codes in NO_COLOR mode', () => {
    const report = formatNapReport(makeResult(), true);

    // No ANSI escape sequences
    // eslint-disable-next-line no-control-regex
    expect(report).not.toMatch(/\x1b\[/);

    // Emoji range check — common nap-related emoji
    // The report should use text labels instead
    expect(report).not.toMatch(/[\u{1F4A4}\u{2728}\u{1F9F9}\u{1F5C4}\u{2705}\u{26A0}]/u);
  });

  it('shows per-category breakdown', () => {
    const report = formatNapReport(makeResult());

    // Should break down by category
    expect(report.toLowerCase()).toMatch(/history|histor/);
    expect(report.toLowerCase()).toMatch(/log/);
  });

  it('handles zero-action results gracefully', () => {
    const result = makeResult({ actions: [] });
    const report = formatNapReport(result);

    expect(report).toBeDefined();
    expect(report.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 10. Edge cases
// ============================================================================

describe('Nap — Edge cases', () => {
  it('returns empty result when .squad/ directory does not exist', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'squad-nap-test-'));
    tmpDirs.push(tmpDir);
    const fakeSquadDir = join(tmpDir, '.squad-nonexistent');

    const result = await runNap({ squadDir: fakeSquadDir });

    expect(result.before.totalFiles).toBe(0);
    expect(result.before.totalBytes).toBe(0);
    expect(result.after.totalFiles).toBe(0);
    expect(result.after.totalBytes).toBe(0);
    expect(result.actions).toHaveLength(0);
  });

  it('skips history compression when no agents directory exists', async () => {
    const squadDir = createTestSquadDir({
      'decisions.md': '# Decisions\n',
    });

    const result = await runNap({ squadDir });

    const compressActions = result.actions.filter((a) => a.type === 'compress');
    expect(compressActions).toHaveLength(0);
  });

  it('skips empty history.md files', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': '',
      'agents/fenster/history.md': '',
    });

    const result = await runNap({ squadDir });

    const compressActions = result.actions.filter((a) => a.type === 'compress');
    expect(compressActions).toHaveLength(0);
  });

  it('handles very large files (100KB+) without crashing', async () => {
    const hugeHistory = generateHistory(50, 3000); // ~150KB
    expect(Buffer.byteLength(hugeHistory)).toBeGreaterThan(100 * 1024);

    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': hugeHistory,
    });

    const result = await runNap({ squadDir });

    expect(result).toBeDefined();
    expect(result.actions.length).toBeGreaterThan(0);

    // After should be significantly smaller
    const afterSize = statSync(join(squadDir, 'agents/hockney/history.md')).size;
    expect(afterSize).toBeLessThan(Buffer.byteLength(hugeHistory));
  });

  it('handles multiple agents with mixed history sizes', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),  // ~20KB, over threshold
      'agents/fenster/history.md': generateHistory(2, 500),     // ~1KB, under threshold
      'agents/verbal/history.md': generateHistory(8, 2500),     // ~20KB, over threshold
    });

    const result = await runNap({ squadDir });

    const compressActions = result.actions.filter((a) => a.type === 'compress');
    // hockney and verbal should be compressed, fenster should not
    const targets = compressActions.map((a) => a.target);
    expect(targets.some((t) => t.includes('hockney'))).toBe(true);
    expect(targets.some((t) => t.includes('verbal'))).toBe(true);
    expect(targets.some((t) => t.includes('fenster'))).toBe(false);
  });

  it('handles .squad/ with only hidden files and no content', async () => {
    const squadDir = createTestSquadDir({
      'agents/.gitkeep': '',
      'log/.gitkeep': '',
    });

    const result = await runNap({ squadDir });

    expect(result).toBeDefined();
    // .gitkeep files have 0 bytes of content
    expect(result.before.historyBytes).toBe(0);
    expect(result.before.logBytes).toBe(0);
  });

  it('NapAction bytesSaved is always non-negative', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
      'log/old.md': 'old log',
    });
    setFileAge(join(squadDir, 'log/old.md'), 10);

    const result = await runNap({ squadDir });

    for (const action of result.actions) {
      expect(action.bytesSaved).toBeGreaterThanOrEqual(0);
    }
  });

  it('after metrics reflect actual state after nap', async () => {
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
      'log/old.md': 'x'.repeat(5000),
    });
    setFileAge(join(squadDir, 'log/old.md'), 10);

    const result = await runNap({ squadDir });

    // After should have fewer bytes and possibly fewer files
    expect(result.after.totalBytes).toBeLessThan(result.before.totalBytes);
  });
});

// ============================================================================
// 11. Combined scenarios
// ============================================================================

describe('Nap — Combined scenarios', () => {
  it('runs all maintenance actions in a single pass', async () => {
    let bigDecisions = '# Decisions\n\n';
    for (let i = 0; i < 30; i++) {
      bigDecisions += `### 2026-02-${String(i + 1).padStart(2, '0')}: Decision ${i + 1}\n`;
      bigDecisions += 'z'.repeat(1000) + '\n\n';
    }

    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': generateHistory(10, 2000),
      'agents/fenster/history.md': generateHistory(8, 2500),
      'log/old1.md': 'old log 1',
      'log/old2.md': 'old log 2',
      'log/recent.md': 'recent log',
      'orchestration-log/old-orch.md': 'old orch',
      'decisions.md': bigDecisions,
      'decisions/inbox/new-rule.md': '### New rule\nContent.\n',
    });

    setFileAge(join(squadDir, 'log/old1.md'), 14);
    setFileAge(join(squadDir, 'log/old2.md'), 10);
    setFileAge(join(squadDir, 'orchestration-log/old-orch.md'), 8);

    const result = await runNap({ squadDir });

    // Multiple action types should be present
    const actionTypes = new Set(result.actions.map((a) => a.type));
    expect(actionTypes.size).toBeGreaterThanOrEqual(3);

    // Space was saved
    expect(result.after.totalBytes).toBeLessThan(result.before.totalBytes);

    // Recent log preserved
    expect(existsSync(join(squadDir, 'log/recent.md'))).toBe(true);
  });

  it('deep + dry-run combines both flags correctly', async () => {
    const largeHistory = generateHistory(10, 2000);
    const squadDir = createTestSquadDir({
      'agents/hockney/history.md': largeHistory,
    });

    const result = await runNap({ squadDir, deep: true, dryRun: true });

    // File unchanged (dry-run)
    expect(readFileSync(join(squadDir, 'agents/hockney/history.md'), 'utf8')).toBe(largeHistory);

    // But actions show deep-mode behavior
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.after.totalBytes).toBeLessThan(result.before.totalBytes);
  });
});
