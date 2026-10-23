import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WORKFLOWS = path.resolve(__dirname, '..', '.github', 'workflows');

describe('release script policy', () => {
  it('keeps workflow JavaScript in checked scripts/release modules', () => {
    const violations: string[] = [];
    for (const file of readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml')).sort()) {
      const text = readFileSync(path.join(WORKFLOWS, file), 'utf8');
      if (/\bnode\s+(?:-\s+)?<<['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/.test(text)) {
        violations.push(`${file}: inline node heredoc`);
      }
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (/\bnode\s+(?:--input-type=\S+\s+)?-e\s+(['"])\s*$/.test(line)) {
          violations.push(`${file}:${index + 1}: multi-line node -e`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
