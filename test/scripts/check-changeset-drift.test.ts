import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  listFragments,
  evaluateDrift,
  MAX_FRAGMENTS,
  MAX_AGE_DAYS,
} from '../../scripts/check-changeset-drift.mjs';

// ── evaluateDrift ───────────────────────────────────────────────────────

describe('evaluateDrift', () => {
  it('passes when both count and age are under the thresholds', () => {
    const result = evaluateDrift({ count: MAX_FRAGMENTS, oldestAgeDays: MAX_AGE_DAYS });
    expect(result.drifted).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('drifts when the fragment count exceeds the threshold', () => {
    const result = evaluateDrift({ count: MAX_FRAGMENTS + 1, oldestAgeDays: 0 });
    expect(result.drifted).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain(`${MAX_FRAGMENTS + 1} unreleased`);
  });

  it('drifts when the oldest fragment exceeds the age threshold', () => {
    const result = evaluateDrift({ count: 1, oldestAgeDays: MAX_AGE_DAYS + 0.5 });
    expect(result.drifted).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('days old');
  });

  it('reports both reasons when both thresholds are exceeded', () => {
    const result = evaluateDrift({ count: 104, oldestAgeDays: 90 });
    expect(result.drifted).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('respects custom thresholds', () => {
    const result = evaluateDrift({ count: 3, oldestAgeDays: 2, maxFragments: 2, maxAgeDays: 1 });
    expect(result.drifted).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('passes with zero fragments', () => {
    const result = evaluateDrift({ count: 0, oldestAgeDays: 0 });
    expect(result.drifted).toBe(false);
  });
});

// ── listFragments ───────────────────────────────────────────────────────

describe('listFragments', () => {
  const TEST_DIR = join(tmpdir(), `.test-changeset-drift-${randomBytes(4).toString('hex')}`);

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('lists .md fragments, excluding README.md and non-markdown files', () => {
    writeFileSync(join(TEST_DIR, 'brave-lions-jump.md'), '---\n---\n');
    writeFileSync(join(TEST_DIR, 'happy-owls-sing.md'), '---\n---\n');
    writeFileSync(join(TEST_DIR, 'README.md'), '# changesets\n');
    writeFileSync(join(TEST_DIR, 'config.json'), '{}\n');

    expect(listFragments(TEST_DIR)).toEqual(['brave-lions-jump.md', 'happy-owls-sing.md']);
  });

  it('returns empty for a missing directory', () => {
    expect(listFragments(join(TEST_DIR, 'does-not-exist'))).toEqual([]);
  });
});
