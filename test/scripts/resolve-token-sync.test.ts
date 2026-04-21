/**
 * CI guard for the canonical resolve-token.mjs source.
 *
 * Four copies of resolve-token.mjs ship inside template directories so that
 * `squad init` / `squad upgrade` can drop them into installed projects. The
 * canonical source lives at packages/squad-cli/scripts/resolve-token.source.mjs
 * and packages/squad-cli/scripts/sync-resolve-token.mjs propagates it.
 *
 * This test invokes the generator in --check mode. If any copy has drifted
 * (someone edited a template file directly instead of the canonical source),
 * the script exits 1 and this test fails with a pointer at how to fix it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const GENERATOR = resolve(ROOT, 'packages/squad-cli/scripts/sync-resolve-token.mjs');
const CANONICAL = resolve(ROOT, 'packages/squad-cli/scripts/resolve-token.source.mjs');

const TARGETS = [
  'packages/squad-cli/templates/scripts/resolve-token.mjs',
  'packages/squad-sdk/templates/scripts/resolve-token.mjs',
  'templates/scripts/resolve-token.mjs',
  '.squad-templates/scripts/resolve-token.mjs',
];

describe('resolve-token.mjs canonicalization', () => {
  it('canonical source file exists', () => {
    expect(existsSync(CANONICAL)).toBe(true);
  });

  it('all template copies exist', () => {
    for (const rel of TARGETS) {
      expect(existsSync(resolve(ROOT, rel))).toBe(true);
    }
  });

  it('generator --check reports all copies in sync', () => {
    const result = spawnSync('node', [GENERATOR, '--check'], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
    });
    if (result.status !== 0) {
      // Surface the generator's own diagnostic (tells the dev how to fix).
      throw new Error(
        `sync-resolve-token --check failed:\n${result.stdout}${result.stderr}\n` +
          `Run: npm run sync:resolve-token`,
      );
    }
    expect(result.status).toBe(0);
  });

  it('every generated copy starts with the GENERATED header', () => {
    const expectedPrefix = '// GENERATED FILE — DO NOT EDIT. Source: packages/squad-cli/scripts/resolve-token.source.mjs';
    for (const rel of TARGETS) {
      const content = readFileSync(resolve(ROOT, rel), 'utf-8');
      expect(content.startsWith(expectedPrefix), `${rel} missing GENERATED header`).toBe(true);
    }
  });

  it('every generated copy preserves the zero-dependencies marker', () => {
    for (const rel of TARGETS) {
      const content = readFileSync(resolve(ROOT, rel), 'utf-8');
      expect(content.includes('-- zero dependencies --'), `${rel} missing zero-deps marker`).toBe(true);
    }
  });
});
