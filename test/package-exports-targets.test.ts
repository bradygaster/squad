/**
 * Every `exports` entry in the published packages must point at files that exist in the
 * built `dist/`. A dangling entry (e.g. a module that was removed or never existed) would
 * ship in the tarball and fail at import time with ERR_MODULE_NOT_FOUND.
 *
 * Requires a build (`npm run build`); skipped when `dist/` is absent.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PACKAGES = ['packages/squad-sdk', 'packages/squad-cli'];

type ExportTarget = string | { [condition: string]: ExportTarget } | null;

function targetsOf(value: ExportTarget): string[] {
  if (value === null) return [];
  if (typeof value === 'string') return [value];
  return Object.values(value).flatMap(targetsOf);
}

describe('package.json exports resolve to built files', () => {
  for (const pkg of PACKAGES) {
    const dir = join(ROOT, pkg);
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; exports?: Record<string, ExportTarget> };
    const built = existsSync(join(dir, 'dist'));

    it.skipIf(!built)(`${manifest.name}: every exports target exists in dist`, () => {
      const missing: string[] = [];
      for (const [key, value] of Object.entries(manifest.exports ?? {})) {
        for (const target of targetsOf(value)) {
          if (target.includes('*')) continue; // subpath patterns are validated by their consumers
          if (!existsSync(join(dir, target))) missing.push(`${key} -> ${target}`);
        }
      }
      expect(missing, `${manifest.name} has exports pointing at files missing from dist (removed module still exported?):\n${missing.join('\n')}`).toEqual([]);
    });
  }
});
