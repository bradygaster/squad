import { describe, it, expect } from 'vitest';
import { parseDiffNames, enrichFileStatuses } from '../../scripts/impact-utils/parse-diff.mjs';

// ── parseDiffNames ──────────────────────────────────────────────────────

describe('parseDiffNames', () => {
  it('parses a normal multi-line diff output', () => {
    const result = parseDiffNames('src/a.ts\nsrc/b.ts\n');
    expect(result.all).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.modified).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('returns empty arrays for empty string input', () => {
    const result = parseDiffNames('');
    expect(result.all).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it('returns empty arrays for whitespace-only input', () => {
    const result = parseDiffNames('   \n  \n  ');
    expect(result.all).toEqual([]);
  });

  it('handles trailing newlines without creating empty entries', () => {
    const result = parseDiffNames('file.ts\n\n\n');
    expect(result.all).toEqual(['file.ts']);
  });

  it('trims leading/trailing whitespace from filenames', () => {
    const result = parseDiffNames('  src/a.ts  \n  src/b.ts  \n');
    expect(result.all).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('handles a single file with no trailing newline', () => {
    const result = parseDiffNames('only-file.ts');
    expect(result.all).toEqual(['only-file.ts']);
  });
});

// ── enrichFileStatuses ──────────────────────────────────────────────────

describe('enrichFileStatuses', () => {
  it('classifies added files', () => {
    const result = enrichFileStatuses([{ filename: 'new.ts', status: 'added' }]);
    expect(result.added).toEqual(['new.ts']);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.all).toEqual(['new.ts']);
  });

  it('classifies removed files', () => {
    const result = enrichFileStatuses([{ filename: 'old.ts', status: 'removed' }]);
    expect(result.deleted).toEqual(['old.ts']);
    expect(result.added).toEqual([]);
  });

  it('classifies modified files', () => {
    const result = enrichFileStatuses([{ filename: 'mod.ts', status: 'modified' }]);
    expect(result.modified).toEqual(['mod.ts']);
  });

  it('classifies renamed files as modified', () => {
    const result = enrichFileStatuses([{ filename: 'renamed.ts', status: 'renamed' }]);
    expect(result.modified).toEqual(['renamed.ts']);
  });

  it('classifies copied files as modified', () => {
    const result = enrichFileStatuses([{ filename: 'copy.ts', status: 'copied' }]);
    expect(result.modified).toEqual(['copy.ts']);
  });

  it('classifies changed files as modified', () => {
    const result = enrichFileStatuses([{ filename: 'chg.ts', status: 'changed' }]);
    expect(result.modified).toEqual(['chg.ts']);
  });

  it('handles empty array input', () => {
    const result = enrichFileStatuses([]);
    expect(result.all).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('handles a mix of all statuses', () => {
    const result = enrichFileStatuses([
      { filename: 'a.ts', status: 'added' },
      { filename: 'b.ts', status: 'removed' },
      { filename: 'c.ts', status: 'modified' },
      { filename: 'd.ts', status: 'renamed' },
    ]);
    expect(result.added).toEqual(['a.ts']);
    expect(result.deleted).toEqual(['b.ts']);
    expect(result.modified).toEqual(['c.ts', 'd.ts']);
    expect(result.all).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
  });
});
