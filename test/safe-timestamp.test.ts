/**
 * Tests for safeTimestamp — filename-safe ISO 8601 timestamps.
 *
 * Colons are invalid in Windows filenames. Any timestamp used in a filename
 * MUST go through safeTimestamp() to replace colons with hyphens.
 * See: https://github.com/bradygaster/squad/issues/348
 */

import { describe, it, expect } from 'vitest';
import { safeTimestamp } from '@bradygaster/squad-sdk';

describe('safeTimestamp', () => {
  it('returns a string with no colons (Windows-safe)', () => {
    const ts = safeTimestamp();
    expect(ts).not.toContain(':');
  });

  it('returns a string that ends with Z (UTC)', () => {
    const ts = safeTimestamp();
    expect(ts).toMatch(/Z$/);
  });

  it('does not contain milliseconds', () => {
    const ts = safeTimestamp();
    expect(ts).not.toMatch(/\.\d{3}Z$/);
  });

  it('matches the expected filename-safe ISO 8601 pattern', () => {
    const ts = safeTimestamp();
    // e.g. 2026-03-05T10-31-12Z
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/);
  });

  it('produces a value that is a valid filename component on all platforms', () => {
    const ts = safeTimestamp();
    // Illegal filename characters on Windows: \ / : * ? " < > |
    expect(ts).not.toMatch(/[\\/:*?"<>|]/);
  });
});
