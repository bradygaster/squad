/**
 * Tests for scribe-merge — Scribe inbox merge claim protocol.
 *
 * Covers: happy path, concurrent claim simulation, crash recovery,
 * content dedup, empty inbox, timestamp sorting, convenience wrappers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  mergeInbox,
  recoverStaleProcessing,
  mergeDecisionsInbox,
  mergeAgentHistoryInbox,
  mergeAllHistoryInboxes,
} from '@bradygaster/squad-sdk/scribe-merge';
import type { ResolvedSquadPaths } from '@bradygaster/squad-sdk/resolution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a unique temp directory for each test. */
function makeTempDir(): string {
  const dir = join(tmpdir(), 'squad-scribe-test-' + randomBytes(6).toString('hex'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makePaths(teamDir: string): ResolvedSquadPaths {
  return {
    mode: 'local',
    projectDir: teamDir,
    teamDir,
    personalDir: null,
    config: null,
    name: '.squad',
    isLegacy: false,
  };
}

function writeInboxFile(inboxDir: string, filename: string, content: string): void {
  mkdirSync(inboxDir, { recursive: true });
  writeFileSync(join(inboxDir, filename), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Core mergeInbox
// ---------------------------------------------------------------------------

describe('mergeInbox', () => {
  let root: string;
  let inboxDir: string;
  let canonicalFile: string;

  beforeEach(() => {
    root = makeTempDir();
    inboxDir = join(root, 'decisions', 'inbox');
    canonicalFile = join(root, 'decisions.md');
    mkdirSync(inboxDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('happy path — merges 3 inbox files into canonical in timestamp order', () => {
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-aaaa0001.md',
      '### Decision A\nFirst decision');
    writeInboxFile(inboxDir, 'eecom-2025-07-22T10-03-00Z-bbbb0002.md',
      '### Decision B\nSecond decision (earlier timestamp)');
    writeInboxFile(inboxDir, 'scribe-2025-07-22T10-07-00Z-cccc0003.md',
      '### Decision C\nThird decision');

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const content = readFileSync(canonicalFile, 'utf-8');
    const idx = {
      b: content.indexOf('Decision B'),
      a: content.indexOf('Decision A'),
      c: content.indexOf('Decision C'),
    };
    // Sorted by timestamp: B (10:03) < A (10:05) < C (10:07)
    expect(idx.b).toBeLessThan(idx.a);
    expect(idx.a).toBeLessThan(idx.c);
  });

  it('empty inbox — returns zeroed result', () => {
    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('missing inbox dir — returns zeroed result (no crash)', () => {
    const missing = join(root, 'nonexistent', 'inbox');
    const result = mergeInbox(missing, canonicalFile);

    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('appends to existing canonical content', () => {
    writeFileSync(canonicalFile,
      '### Existing Decision\nPre-existing content\n');
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-dddd0004.md',
      '### New Decision\nNew content');

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(1);
    const content = readFileSync(canonicalFile, 'utf-8');
    expect(content).toContain('Existing Decision');
    expect(content).toContain('New Decision');
    // Existing must come before new
    expect(content.indexOf('Existing Decision')).toBeLessThan(
      content.indexOf('New Decision'),
    );
  });

  it('dedup — skips entry already in canonical file', () => {
    const entry = '### Repeated Decision\nSame content here';
    writeFileSync(canonicalFile, entry + '\n');
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-eeee0005.md', entry);

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(1);
    // Canonical unchanged (no double-append)
    const content = readFileSync(canonicalFile, 'utf-8');
    const occurrences = content.split('Repeated Decision').length - 1;
    expect(occurrences).toBe(1);
  });

  it('dedup — skips empty inbox files', () => {
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-ffff0006.md', '   \n  ');

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('concurrent claim simulation — skips file claimed by another Scribe', () => {
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-1111aaaa.md',
      '### Decision 1\nContent 1');
    writeInboxFile(inboxDir, 'eecom-2025-07-22T10-06-00Z-2222bbbb.md',
      '### Decision 2\nContent 2');

    // Simulate another Scribe claiming file 1 before our merge runs:
    // move it out of inbox before calling mergeInbox
    const processingDir = join(root, 'decisions', 'processing');
    mkdirSync(processingDir, { recursive: true });
    renameSync(
      join(inboxDir, 'flight-2025-07-22T10-05-00Z-1111aaaa.md'),
      join(processingDir, 'flight-2025-07-22T10-05-00Z-1111aaaa.md'),
    );

    const result = mergeInbox(inboxDir, canonicalFile);

    // Both files should be merged: the one we claimed from inbox (file 2)
    // and the pre-existing one in processing/ (file 1, from crash/other Scribe)
    expect(result.merged).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('crash recovery — pre-existing processing/ files are included in merge', () => {
    const processingDir = join(root, 'decisions', 'processing');
    mkdirSync(processingDir, { recursive: true });
    writeFileSync(
      join(processingDir, 'stale-2025-07-22T09-00-00Z-aabbccdd.md'),
      '### Stale Entry\nFrom a crashed Scribe',
    );

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(1);
    const content = readFileSync(canonicalFile, 'utf-8');
    expect(content).toContain('Stale Entry');
  });

  it('processing/ files already in canonical are skipped and deleted', () => {
    const entry = '### Already Merged\nThis was already merged';
    writeFileSync(canonicalFile, entry + '\n');
    const processingDir = join(root, 'decisions', 'processing');
    mkdirSync(processingDir, { recursive: true });
    writeFileSync(
      join(processingDir, 'dup-2025-07-22T09-00-00Z-11223344.md'),
      entry,
    );

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(0);
    expect(result.skipped).toBe(1);
    // Processing file should be cleaned up
    expect(existsSync(join(processingDir, 'dup-2025-07-22T09-00-00Z-11223344.md'))).toBe(false);
  });

  it('dryRun — returns counts without writing', () => {
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-dry10001.md',
      '### Dry Run Entry\nShould not be written');

    const result = mergeInbox(inboxDir, canonicalFile, { dryRun: true });

    expect(result.merged).toBe(1);
    expect(existsSync(canonicalFile)).toBe(false);
    // File should still be in processing (not deleted in dry run)
    const processingDir = join(root, 'decisions', 'processing');
    expect(existsSync(join(processingDir, 'flight-2025-07-22T10-05-00Z-dry10001.md'))).toBe(true);
  });

  it('non-.md files in inbox are ignored', () => {
    writeInboxFile(inboxDir, 'readme.txt', 'not a markdown file');
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-txt00001.md',
      '### Valid Entry\nContent');

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(1);
    // txt file untouched
    expect(existsSync(join(inboxDir, 'readme.txt'))).toBe(true);
  });

  it('processing/ directory is removed when empty after merge', () => {
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-rm000001.md',
      '### Entry\nContent');

    mergeInbox(inboxDir, canonicalFile);

    const processingDir = join(root, 'decisions', 'processing');
    expect(existsSync(processingDir)).toBe(false);
  });

  it('filenames without valid timestamps sort to front', () => {
    writeInboxFile(inboxDir, 'bad-filename.md',
      '### Bad Filename Entry\nNo timestamp');
    writeInboxFile(inboxDir, 'flight-2025-07-22T10-05-00Z-sort0001.md',
      '### Good Filename Entry\nHas timestamp');

    const result = mergeInbox(inboxDir, canonicalFile);

    expect(result.merged).toBe(2);
    const content = readFileSync(canonicalFile, 'utf-8');
    // Bad filename (epoch 0) sorts before good filename
    expect(content.indexOf('Bad Filename')).toBeLessThan(
      content.indexOf('Good Filename'),
    );
  });
});

// ---------------------------------------------------------------------------
// recoverStaleProcessing
// ---------------------------------------------------------------------------

describe('recoverStaleProcessing', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('moves stale files back to inbox', () => {
    const processingDir = join(root, 'decisions', 'processing');
    const inboxDir = join(root, 'decisions', 'inbox');
    mkdirSync(processingDir, { recursive: true });
    const filePath = join(processingDir, 'stale-2025-07-22T09-00-00Z-aabb0001.md');
    writeFileSync(filePath, '### Stale\nContent');

    // maxAgeMinutes=0 means anything older than now is stale
    const recovered = recoverStaleProcessing(processingDir, 0);

    expect(recovered).toBe(1);
    expect(existsSync(join(inboxDir, 'stale-2025-07-22T09-00-00Z-aabb0001.md'))).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it('leaves recent files in processing', () => {
    const processingDir = join(root, 'decisions', 'processing');
    mkdirSync(processingDir, { recursive: true });
    const filePath = join(processingDir, 'recent-2025-07-22T09-00-00Z-ccdd0001.md');
    writeFileSync(filePath, '### Recent\nContent');

    // maxAgeMinutes=9999 means nothing is stale
    const recovered = recoverStaleProcessing(processingDir, 9999);

    expect(recovered).toBe(0);
    expect(existsSync(filePath)).toBe(true);
  });

  it('returns 0 for missing processing directory', () => {
    const missing = join(root, 'nonexistent', 'processing');
    const recovered = recoverStaleProcessing(missing);
    expect(recovered).toBe(0);
  });

  it('returns 0 for empty processing directory', () => {
    const processingDir = join(root, 'decisions', 'processing');
    mkdirSync(processingDir, { recursive: true });
    const recovered = recoverStaleProcessing(processingDir);
    expect(recovered).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

describe('mergeDecisionsInbox', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('merges decisions/inbox/ into decisions.md via ResolvedSquadPaths', () => {
    const paths = makePaths(root);
    const inboxDir = join(paths.teamDir, 'decisions', 'inbox');
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(
      join(inboxDir, 'flight-2025-07-22T10-05-00Z-dec00001.md'),
      '### Team Decision\nWe decided a thing',
    );

    const result = mergeDecisionsInbox(paths);

    expect(result.merged).toBe(1);
    const content = readFileSync(join(paths.teamDir, 'decisions.md'), 'utf-8');
    expect(content).toContain('Team Decision');
  });
});

describe('mergeAgentHistoryInbox', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('merges agent history inbox into history.md', () => {
    const paths = makePaths(root);
    const inboxDir = join(paths.teamDir, 'agents', 'flight', 'history', 'inbox');
    mkdirSync(inboxDir, { recursive: true });
    writeFileSync(
      join(inboxDir, 'flight-2025-07-22T10-05-00Z-hist0001.md'),
      '### Session learning\nLearned something',
    );

    const result = mergeAgentHistoryInbox(paths, 'flight');

    expect(result.merged).toBe(1);
    const content = readFileSync(join(paths.teamDir, 'agents', 'flight', 'history.md'), 'utf-8');
    expect(content).toContain('Session learning');
  });
});

describe('mergeAllHistoryInboxes', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('merges history inboxes for all agents with inbox dirs', () => {
    const paths = makePaths(root);

    // Agent 1: flight — has inbox
    const flightInbox = join(paths.teamDir, 'agents', 'flight', 'history', 'inbox');
    mkdirSync(flightInbox, { recursive: true });
    writeFileSync(
      join(flightInbox, 'flight-2025-07-22T10-05-00Z-all00001.md'),
      '### Flight learning\nContent',
    );

    // Agent 2: eecom — has inbox
    const eecomInbox = join(paths.teamDir, 'agents', 'eecom', 'history', 'inbox');
    mkdirSync(eecomInbox, { recursive: true });
    writeFileSync(
      join(eecomInbox, 'eecom-2025-07-22T10-06-00Z-all00002.md'),
      '### EECOM learning\nContent',
    );

    // Agent 3: scribe — no inbox (should be skipped)
    mkdirSync(join(root, 'agents', 'scribe'), { recursive: true });

    const results = mergeAllHistoryInboxes(paths);

    expect(results.size).toBe(2);
    expect(results.get('flight')?.merged).toBe(1);
    expect(results.get('eecom')?.merged).toBe(1);
    expect(results.has('scribe')).toBe(false);
  });

  it('returns empty map when agents/ dir is missing', () => {
    const paths = makePaths(root);
    const results = mergeAllHistoryInboxes(paths);
    expect(results.size).toBe(0);
  });
});
