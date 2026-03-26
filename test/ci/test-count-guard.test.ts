import { describe, it, expect } from 'vitest';

// Pure logic — inline so vitest (TypeScript) can test it without importing .mjs.
// The .mjs CLI script duplicates this same logic. This duplication is intentional:
// the .mjs file is a standalone CI script (pure ESM, no build step), and importing
// it here would require ESM interop complexity that isn't worth the coupling.

type BaselineResult =
  | { status: 'pass'; message: string }
  | { status: 'fail'; message: string; delta: number }
  | { status: 'warning'; message: string };

type Baseline = { count: number; updatedAt: string; updatedBy: string } | null;

function checkTestCount(actual: number, baseline: Baseline): BaselineResult {
  if (baseline === null) {
    return { status: 'warning', message: 'No baseline file found. Skipping test count check (first run).' };
  }
  if (actual >= baseline.count) {
    return { status: 'pass', message: `Test count OK: ${actual} >= ${baseline.count}` };
  }
  const delta = baseline.count - actual;
  return {
    status: 'fail',
    message: `Test count decreased by ${delta}: expected >= ${baseline.count}, got ${actual}`,
    delta,
  };
}

function parseBaseline(raw: string): Baseline {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.count !== 'number') throw new Error('count field missing or not a number');
    return parsed as Baseline;
  } catch {
    return null;
  }
}

const validBaseline: Baseline = {
  count: 100,
  updatedAt: '2025-01-01T00:00:00.000Z',
  updatedBy: 'EECOM (test)',
};

describe('Test Count Guard', () => {
  it('passes when actual count equals baseline', () => {
    const result = checkTestCount(100, validBaseline);
    expect(result.status).toBe('pass');
  });

  it('passes when actual count exceeds baseline', () => {
    const result = checkTestCount(150, validBaseline);
    expect(result.status).toBe('pass');
  });

  it('fails when actual count is below baseline', () => {
    const result = checkTestCount(90, validBaseline);
    expect(result.status).toBe('fail');
  });

  it('returns warning (not failure) when baseline file missing', () => {
    const result = checkTestCount(100, null);
    expect(result.status).toBe('warning');
  });

  it('returns failure message with delta when count decreases', () => {
    const result = checkTestCount(90, validBaseline);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.delta).toBe(10);
      expect(result.message).toContain('10');
      expect(result.message).toContain('100');
    }
  });

  it('parses valid baseline JSON', () => {
    const raw = JSON.stringify({ count: 42, updatedAt: '2025-01-01T00:00:00.000Z', updatedBy: 'EECOM' });
    const baseline = parseBaseline(raw);
    expect(baseline).not.toBeNull();
    expect(baseline?.count).toBe(42);
  });

  it('handles malformed baseline JSON gracefully', () => {
    const baseline = parseBaseline('not-valid-json{{{');
    expect(baseline).toBeNull();
    // When baseline is null, checkTestCount warns rather than fails
    const result = checkTestCount(100, null);
    expect(result.status).toBe('warning');
  });

  it('handles baseline with count of 0', () => {
    const zeroBaseline: Baseline = { count: 0, updatedAt: '2025-01-01T00:00:00.000Z', updatedBy: 'EECOM' };
    const result = checkTestCount(0, zeroBaseline);
    expect(result.status).toBe('pass');
  });

  it('returns null when count is a string instead of number', () => {
    const baseline = parseBaseline('{"count":"fifty","updatedAt":"2025-01-01T00:00:00.000Z","updatedBy":"EECOM"}');
    expect(baseline).toBeNull();
  });

  it('returns null when count field is missing', () => {
    const baseline = parseBaseline('{"updatedAt":"2025-01-01T00:00:00.000Z","updatedBy":"EECOM"}');
    expect(baseline).toBeNull();
  });

  it('fails when actual count is negative', () => {
    const result = checkTestCount(-1, validBaseline);
    expect(result.status).toBe('fail');
  });
});
