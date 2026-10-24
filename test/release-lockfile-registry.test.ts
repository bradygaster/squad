/**
 * Release gate: every tracked package-lock.json resolves only to registry.npmjs.org with sha512
 * integrity. Private Azure Artifacts feeds (ms-feed-*.pkgs.visualstudio.com, pkgs.dev.azure.com)
 * and packagefeedproxy are denied explicitly; any other host is denied by default.
 *
 * Exercised by `scripts/release/check-lockfile-registry.mjs`, which the release-verify workflow
 * also runs before `npm ci`.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkLockfiles, trackedLockfiles, DENIED_HOST_PATTERNS } from '../scripts/release/check-lockfile-registry.mjs';

const ROOT = process.cwd();

describe('release gate: lockfile registry hosts', () => {
  it('tracks both lockfiles', () => {
    expect(trackedLockfiles(ROOT)).toEqual(expect.arrayContaining(['package-lock.json', 'docs/package-lock.json']));
  });

  it('every resolved entry in every tracked lockfile is registry.npmjs.org with sha512 integrity', () => {
    const result = checkLockfiles(ROOT);
    expect(result.entries).toBeGreaterThan(100);
    expect(result.violations, result.violations.map((v) => `${v.file}:${v.line} ${v.key}@${v.version} ${v.reason}`).join('\n')).toEqual([]);
  });

  it('denies every private-host variant and non-sha512 integrity (fail closed)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squad-lock-gate-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      const hosts = [
        'https://ms-feed-25.pkgs.visualstudio.com/1es-public/_packaging/npm-public/npm/registry/ajv/-/ajv-8.20.0.tgz',
        'https://ms-feed-17.pkgs.visualstudio.com/x/_packaging/y/npm/registry/@types/estree/-/estree-1.0.9.tgz',
        'https://pkgs.dev.azure.com/org/_packaging/feed/npm/registry/diff/-/diff-9.0.0.tgz',
        'https://packagefeedproxy.microsoft.io/npm/punycode/-/punycode-2.3.1.tgz',
        'https://registry.yarnpkg.com/uri-js/-/uri-js-4.4.1.tgz',
      ];
      const packages = { '': { name: 'x', version: '0.0.0' } };
      hosts.forEach((resolved, i) => { packages[`node_modules/p${i}`] = { version: '1.0.0', resolved, integrity: 'sha512-' + 'A'.repeat(86) + '==' }; });
      packages['node_modules/weak'] = { version: '1.0.0', resolved: 'https://registry.npmjs.org/weak/-/weak-1.0.0.tgz', integrity: 'sha1-AnQi4vrsCyFyCVqBA2HYyE/n4Fw=' };
      packages['node_modules/ok'] = { version: '1.0.0', resolved: 'https://registry.npmjs.org/ok/-/ok-1.0.0.tgz', integrity: 'sha512-' + 'B'.repeat(86) + '==' };
      packages['node_modules/@scope/ws'] = { resolved: 'packages/ws', link: true };
      writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }, null, 2));
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'docs', 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {} } }));
      execFileSync('git', ['add', '-A'], { cwd: dir });

      const result = checkLockfiles(dir, trackedLockfiles(dir));
      expect(result.files.sort()).toEqual(['docs/package-lock.json', 'package-lock.json']);
      expect(result.entries).toBe(hosts.length + 2);
      const byKey = Object.fromEntries(result.violations.map((v) => [v.key, v.reason]));
      for (let i = 0; i < hosts.length; i += 1) expect(byKey[`node_modules/p${i}`], hosts[i]).toBeDefined();
      expect(byKey['node_modules/weak']).toMatch(/not sha512/);
      expect(byKey['node_modules/ok']).toBeUndefined();
      expect(byKey['node_modules/@scope/ws']).toBeUndefined();
      expect(result.violations.every((v) => typeof v.line === 'number' && v.line > 1)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the denylist names the Azure Artifacts, packagefeedproxy and ms-feed variants', () => {
    const sources = DENIED_HOST_PATTERNS.map((r) => r.source).join('\n');
    for (const needle of ['pkgs\\.visualstudio\\.com', 'pkgs\\.dev\\.azure\\.com', 'packagefeedproxy', 'ms-feed-']) expect(sources).toContain(needle);
  });
});
