/**
 * Validates that the "Current Release" version heading in whatsnew.md
 * matches the version declared in package.json (stripped of build suffix).
 *
 * Fails CI when someone bumps package.json but forgets to update whatsnew.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PKG_PATH = join(ROOT, 'package.json');
const WHATSNEW_PATH = join(ROOT, 'docs', 'src', 'content', 'docs', 'whatsnew.md');

const CURRENT_RELEASE_RE = /^## v(\d+\.\d+\.\d+[\w.-]*) — Current Release$/m;

function cleanVersion(raw: string): string {
  return raw.replace(/-.*$/, '');
}

describe('whatsnew.md version sync', () => {
  it('whatsnew.md "Current Release" heading matches package.json version', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    const expectedVersion = cleanVersion(pkg.version as string);

    const content = readFileSync(WHATSNEW_PATH, 'utf8');
    const match = content.match(CURRENT_RELEASE_RE);

    expect(
      match,
      'whatsnew.md must contain a "## v{version} — Current Release" heading'
    ).not.toBeNull();

    const actualVersion = cleanVersion(match![1]);

    expect(actualVersion).toBe(
      expectedVersion,
      `whatsnew.md "Current Release" is v${actualVersion} but package.json is v${expectedVersion}. ` +
        `Run: node scripts/sync-whatsnew-version.mjs`
    );
  });
});
