import { describe, it, expect } from 'vitest';
import { calculateRisk } from '../../scripts/impact-utils/risk-scorer.mjs';

const defaults = { filesChanged: 1, filesDeleted: 0, modulesTouched: 1, criticalFiles: [] };

describe('calculateRisk', () => {
  // ── Files-changed thresholds ──────────────────────────────────────────

  it('returns LOW when filesChanged ≤ 5', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 5 });
    expect(tier).toBe('LOW');
  });

  it('returns MEDIUM when filesChanged is 6 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 6 });
    expect(tier).toBe('MEDIUM');
  });

  it('returns MEDIUM when filesChanged is 20 (upper boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 20 });
    expect(tier).toBe('MEDIUM');
  });

  it('returns HIGH when filesChanged is 21 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 21 });
    expect(tier).toBe('HIGH');
  });

  it('returns HIGH when filesChanged is 50', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 50 });
    expect(tier).toBe('HIGH');
  });

  it('returns CRITICAL when filesChanged is 51 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, filesChanged: 51 });
    expect(tier).toBe('CRITICAL');
  });

  // ── Modules-touched thresholds ────────────────────────────────────────

  it('returns LOW when modulesTouched ≤ 1', () => {
    const { tier } = calculateRisk({ ...defaults, modulesTouched: 1 });
    expect(tier).toBe('LOW');
  });

  it('returns MEDIUM when modulesTouched is 2 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, modulesTouched: 2 });
    expect(tier).toBe('MEDIUM');
  });

  it('returns HIGH when modulesTouched is 5 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, modulesTouched: 5 });
    expect(tier).toBe('HIGH');
  });

  it('returns HIGH when modulesTouched is 8 (upper boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, modulesTouched: 8 });
    expect(tier).toBe('HIGH');
  });

  it('returns CRITICAL when modulesTouched is 9 (boundary)', () => {
    const { tier } = calculateRisk({ ...defaults, modulesTouched: 9 });
    expect(tier).toBe('CRITICAL');
  });

  // ── Deletions threshold ───────────────────────────────────────────────

  it('returns CRITICAL when filesDeleted > 10', () => {
    const { tier } = calculateRisk({ ...defaults, filesDeleted: 11 });
    expect(tier).toBe('CRITICAL');
  });

  it('stays LOW when filesDeleted is 10 (boundary, ≤ 10)', () => {
    const { tier } = calculateRisk({ ...defaults, filesDeleted: 10 });
    expect(tier).toBe('LOW');
  });

  // ── Critical files ────────────────────────────────────────────────────

  it('bumps to at least MEDIUM when criticalFiles are present', () => {
    const { tier, factors } = calculateRisk({
      ...defaults,
      criticalFiles: ['package.json'],
    });
    expect(tier).toBe('MEDIUM');
    expect(factors.some((f) => f.includes('Critical files touched'))).toBe(true);
  });

  // ── Factors strings ───────────────────────────────────────────────────

  it('includes a factor string for every evaluated dimension', () => {
    const { factors } = calculateRisk({ ...defaults });
    // At minimum: files changed + modules touched
    expect(factors.length).toBeGreaterThanOrEqual(2);
  });

  it('includes deletion factor when filesDeleted > 0', () => {
    const { factors } = calculateRisk({ ...defaults, filesDeleted: 3 });
    expect(factors.some((f) => f.includes('deleted'))).toBe(true);
  });

  // ── Highest tier wins ─────────────────────────────────────────────────

  it('returns the highest tier across all dimensions', () => {
    const { tier } = calculateRisk({
      filesChanged: 51, // CRITICAL
      filesDeleted: 0,
      modulesTouched: 1, // LOW
      criticalFiles: [],
    });
    expect(tier).toBe('CRITICAL');
  });
});
