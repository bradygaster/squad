/**
 * Regression guard — detect-squad-dir.ts must stay zero-dependency.
 *
 * The StorageProvider refactor (26047dc5) accidentally converted this
 * bootstrap utility to depend on @bradygaster/squad-sdk. This file runs
 * before the SDK is loaded, so it must only use node built-ins.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve(
  __dirname,
  '..',
  'packages',
  'squad-cli',
  'src',
  'cli',
  'core',
  'detect-squad-dir.ts',
);

describe('detect-squad-dir zero-dependency guard', () => {
  const source = readFileSync(SOURCE_PATH, 'utf-8');

  it('must not import from @bradygaster/squad-sdk', () => {
    expect(source).not.toMatch(/from\s+['"]@bradygaster\/squad-sdk(?:\/[^'"]+)?['"]/);
  });

  it('must not require @bradygaster/squad-sdk', () => {
    expect(source).not.toMatch(/require\s*\(\s*['"]@bradygaster\/squad-sdk(?:\/[^'"]+)?['"]\s*\)/);
  });

  it('should import from node:fs for filesystem operations', () => {
    expect(source).toMatch(/from\s+['"]node:fs['"]/);
  });
});
