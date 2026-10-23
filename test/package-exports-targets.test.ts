/**
 * Every `exports` entry in the published packages must point at files that exist in the
 * built `dist/`. A dangling entry (e.g. a module that was removed or never existed) would
 * ship in the tarball and fail at import time with ERR_MODULE_NOT_FOUND.
 *
 * Requires a build (`npm run build`); skipped when `dist/` is absent.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PACKAGES = ['packages/squad-sdk', 'packages/squad-cli'];

type ExportTarget = string | { [condition: string]: ExportTarget } | null;

function targetsOf(value: ExportTarget): string[] {
  if (value === null) return [];
  if (typeof value === 'string') return [value];
  return Object.values(value).flatMap(targetsOf);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Files under `pkgDir` that a subpath-pattern target (exactly one `*`) expands to. */
function wildcardMatches(pkgDir: string, target: string): string[] {
  const stars = target.split('*').length - 1;
  if (stars !== 1) return []; // Node permits exactly one `*` per pattern; anything else never resolves
  const [prefix, suffix] = target.split('*');
  const base = join(pkgDir, dirname(prefix));
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '')}(.+)${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return walk(base).map((p) => relative(pkgDir, p).replace(/\\/g, '/')).filter((rel) => re.test(rel));
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
          if (target.includes('*')) {
            // A subpath pattern must itself be a pattern key, use exactly one `*`, and expand to at
            // least one built file; a wildcard that matches nothing ships a dangling export.
            if (!key.includes('*')) missing.push(`${key} -> ${target} (wildcard target under a non-pattern key)`);
            else if (wildcardMatches(dir, target).length === 0) missing.push(`${key} -> ${target} (wildcard matches no built file)`);
            continue;
          }
          if (!existsSync(join(dir, target))) missing.push(`${key} -> ${target}`);
        }
      }
      expect(missing, `${manifest.name} has exports pointing at files missing from dist (removed module still exported?):\n${missing.join('\n')}`).toEqual([]);
    });

    it(`${manifest.name}: exports keys and targets are well-formed subpaths`, () => {
      const bad: string[] = [];
      for (const [key, value] of Object.entries(manifest.exports ?? {})) {
        if (key !== '.' && !key.startsWith('./')) bad.push(`${key}: key must be "." or start with "./"`);
        if ((key.split('*').length - 1) > 1) bad.push(`${key}: more than one "*" in a pattern key`);
        for (const target of targetsOf(value)) {
          if (!target.startsWith('./')) bad.push(`${key} -> ${target}: target must start with "./"`);
          if (target.includes('..')) bad.push(`${key} -> ${target}: target escapes the package`);
          if ((target.split('*').length - 1) !== (key.split('*').length - 1)) bad.push(`${key} -> ${target}: "*" count differs between key and target`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
