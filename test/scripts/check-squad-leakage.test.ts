import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  decodeGitNameOnly,
  decodeGitPath,
  validateSquadPath,
} from '../../scripts/git-path-decoder.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const scanner = join(repoRoot, 'scripts', 'check-squad-leakage.mjs');
const CANARY_PATH = ".squad/canary-`paired`-${-apostrophe-'-\"double quote\".md";
const temporaryRepositories: string[] = [];

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function createRepository(quotePath: boolean): string {
  const cwd = mkdtempSync(join(tmpdir(), 'squad-leakage-'));
  temporaryRepositories.push(cwd);
  git(cwd, ['init', '--quiet', '-b', 'dev']);
  git(cwd, ['config', 'core.quotePath', String(quotePath)]);
  git(cwd, ['config', 'user.name', 'Squad Test']);
  git(cwd, ['config', 'user.email', 'test@example.invalid']);
  writeFileSync(join(cwd, 'README.md'), 'base\n');
  git(cwd, ['add', '--', 'README.md']);
  git(cwd, ['commit', '--quiet', '-m', 'base']);
  git(cwd, ['switch', '--quiet', '-c', 'feature']);
  mkdirSync(join(cwd, '.squad'));
  writeFileSync(join(cwd, CANARY_PATH), 'canary\n');
  git(cwd, ['add', '--', CANARY_PATH]);
  git(cwd, ['commit', '--quiet', '-m', 'canary']);
  return cwd;
}

afterEach(() => {
  while (temporaryRepositories.length > 0) {
    rmSync(temporaryRepositories.pop()!, { recursive: true, force: true });
  }
});

describe('Git --name-only path decoding', () => {
  it.each([
    ['.squad/plain.md', '.squad/plain.md'],
    ['".squad/quote-\\"-slash-\\\\.md"', '.squad/quote-"-slash-\\.md'],
    ['".squad/control-\\a-\\b-\\t-\\v-\\f-\\r.md"', '.squad/control-\x07-\b-\t-\v-\f-\r.md'],
    ['".squad/caf\\303\\251.md"', '.squad/café.md'],
    ['.squad/雪.md', '.squad/雪.md'],
    ['.squad/e\u0301-😀.md', '.squad/e\u0301-😀.md'],
  ])('decodes %s without normalization', (encoded, expected) => {
    expect(decodeGitPath(encoded)).toBe(expected);
  });

  it.each([
    '"unterminated',
    '".squad/trailing-\\"',
    '".squad/unknown-\\x41.md"',
    '".squad/unknown-\\u0041.md"',
    '".squad/incomplete-\\12.md"',
    '".squad/nul-\\000.md"',
    '".squad/invalid-\\377.md"',
  ])('rejects malformed C-quoted path %s', (encoded) => {
    expect(() => decodeGitPath(encoded)).toThrow();
  });

  it.each([
    '',
    '/.squad/absolute.md',
    'C:\\.squad\\absolute.md',
    'outside.md',
    '.squad/line\nbreak.md',
    '.squad/nul\0byte.md',
  ])('rejects invalid leakage path %s', (path) => {
    expect(() => validateSquadPath(path)).toThrow();
  });

  it('requires complete line-delimited output and fatal UTF-8', () => {
    expect(() => decodeGitNameOnly(Buffer.from('.squad/no-newline.md'))).toThrow();
    expect(() => decodeGitNameOnly(Uint8Array.from([0x2e, 0xff, 0x0a]))).toThrow();
  });

  it('does not path-normalize decoded values', () => {
    expect(validateSquadPath('.squad/a/../b.md')).toBe('.squad/a/../b.md');
  });
});

describe.each([true, false])('real leakage scanner with core.quotePath=%s', (quotePath) => {
  it('emits the exact raw semantic canary path', () => {
    const cwd = createRepository(quotePath);
    const rawGitOutput = git(cwd, ['diff', 'dev...HEAD', '--name-only', '--', '.squad/']);
    expect(rawGitOutput).toContain('\\"double quote\\"');
    expect(rawGitOutput).toMatch(/^".*"$/m);

    const result = spawnSync(process.execPath, [scanner, 'dev', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ leaked: true, files: [CANARY_PATH] });
  });
});

describe('leakage scanner failures', () => {
  it('fails closed instead of emitting a clean result', () => {
    const cwd = createRepository(true);
    const result = spawnSync(process.execPath, [scanner, 'missing-base', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Squad leakage scan failed');
  });
});
