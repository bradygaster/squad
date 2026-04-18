/**
 * Regression test: no partial token disclosure in e2e test script.
 *
 * The e2e test script must never log partial token values (e.g.
 * `token.substring(0, 8)`) — only `token.length` is acceptable for
 * diagnostic output. This test prevents re-introduction of token logging.
 *
 * @see scripts/test-identity-e2e.mjs
 * @module test/identity/no-token-disclosure
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('token disclosure prevention in e2e script', () => {
  const e2eScriptPath = join(process.cwd(), 'scripts', 'test-identity-e2e.mjs');
  const content = readFileSync(e2eScriptPath, 'utf-8');

  it('does not use token.substring()', () => {
    expect(content).not.toMatch(/token\.substring\s*\(/);
  });

  it('does not use token.slice() for partial disclosure', () => {
    // token.slice(0, N) would expose the first N characters
    expect(content).not.toMatch(/token\.slice\s*\(\s*0\s*,/);
  });

  it('does not use token.substr() for partial disclosure', () => {
    expect(content).not.toMatch(/token\.substr\s*\(\s*0\s*,/);
  });

  it('uses token.length for safe diagnostic output', () => {
    // The script should reference token.length somewhere for diagnostics
    expect(content).toMatch(/token\.length/);
  });
});
