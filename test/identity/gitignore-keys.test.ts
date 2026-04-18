/**
 * Regression test: .gitignore covers .squad/identity/keys/
 *
 * Private keys must never be committed. This test ensures the .gitignore
 * rule exists and won't be accidentally removed.
 *
 * @see .gitignore — "Squad: private keys must never be committed"
 * @module test/identity/gitignore-keys
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('.gitignore key protection', () => {
  const gitignoreContent = readFileSync(
    join(process.cwd(), '.gitignore'),
    'utf-8',
  );

  it('includes .squad/identity/keys/ ignore rule', () => {
    // The rule must appear as a line (possibly with trailing comment)
    const lines = gitignoreContent.split('\n').map((l) => l.trim());
    const hasKeysRule = lines.some(
      (line) =>
        line === '.squad/identity/keys/' ||
        line === '.squad/identity/keys' ||
        line.startsWith('.squad/identity/keys/'),
    );

    expect(hasKeysRule).toBe(true);
  });

  it('has a comment explaining why keys are ignored', () => {
    // The comment should mention "private keys" or "never be committed"
    expect(gitignoreContent.toLowerCase()).toMatch(
      /private keys|never.*commit/i,
    );
  });
});
