import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  eolAttributes,
  findViolations,
  listShebangFiles,
  scan,
} from '../../scripts/check-shebang-eol.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Build a throwaway git repo so the lint can be exercised against real
 * `git check-attr` / `git cat-file` output. Asserting against a hand-built
 * fixture map would only prove the pure function, not that the git plumbing
 * is being read correctly.
 */
function makeRepo(files: Record<string, string | Buffer>, followUp?: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), 'shebang-eol-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  // Force the hostile case: without this, git may not store CRLF at all.
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir });

  const commit = (batch: Record<string, string | Buffer>, message: string) => {
    for (const [name, content] of Object.entries(batch)) {
      const full = join(dir, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    // Stage only the named paths, never `-A`: once the rule exists, `git add -A`
    // re-examines every file and would silently renormalize the very blob this
    // fixture needs to keep as CRLF.
    execFileSync('git', ['add', '--', ...Object.keys(batch)], { cwd: dir });
    execFileSync('git', ['commit', '-qm', message, '--no-gpg-sign'], { cwd: dir });
  };

  commit(files, 'fixture');
  // A second commit lets a test add the .gitattributes rule *after* the blob is
  // already stored, which is the only way to reproduce "rule present, blob
  // never renormalized" -- git normalizes on add once the rule is in place.
  if (followUp) commit(followUp, 'follow-up');
  return dir;
}

const repos: string[] = [];
function repo(files: Record<string, string | Buffer>, followUp?: Record<string, string | Buffer>): string {
  const dir = makeRepo(files, followUp);
  repos.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of repos) rmSync(dir, { recursive: true, force: true });
});

describe('check-shebang-eol lint (#1788)', () => {
  it('flags a shebanged file that no .gitattributes rule pins to LF', () => {
    const dir = repo({
      '.gitattributes': '*.mjs text eol=lf\n',
      // .zsh is covered by nothing -- this is the "deliberately unmatched" case.
      'tools/deploy.zsh': '#!/usr/bin/env zsh\necho hi\n',
      'tools/ok.mjs': '#!/usr/bin/env node\nexport const a = 1;\n',
    });

    const { violations } = scan(dir);
    const files = violations.map((v) => v.file);

    expect(files).toContain('tools/deploy.zsh');
    expect(files).not.toContain('tools/ok.mjs');
    expect(violations.find((v) => v.file === 'tools/deploy.zsh')?.kind).toBe('unpinned');
  });

  it('flags a committed CRLF shebang even when a rule exists, because a rule alone does not rewrite blobs', () => {
    const dir = repo(
      {
        // Committed with no rule in place, so the CRLF actually reaches the blob.
        'tools/stale.mjs': Buffer.from('#!/usr/bin/env node\r\nexport const a = 1;\r\n', 'utf-8'),
      },
      // Rule added afterwards, blob never renormalized -- exactly the state of
      // this repo between "someone adds *.mjs text eol=lf" and "someone runs
      // git add --renormalize".
      { '.gitattributes': '*.mjs text eol=lf\n' },
    );

    const { violations } = scan(dir);
    const stale = violations.filter((v) => v.file === 'tools/stale.mjs');

    expect(stale.map((v) => v.kind)).toContain('crlf-blob');
    // The rule *is* present, so this must NOT be reported as unpinned -- the
    // two checks have to be independent or the lint gives a false all-clear.
    expect(stale.map((v) => v.kind)).not.toContain('unpinned');
  });

  it('passes a repo where every shebanged file is both pinned and stored as LF', () => {
    const dir = repo({
      '.gitattributes': '*.mjs text eol=lf\n*.sh text eol=lf\n',
      'tools/a.mjs': '#!/usr/bin/env node\nexport const a = 1;\n',
      'tools/b.sh': '#!/bin/sh\necho hi\n',
      'docs/notes.md': 'no shebang here\n',
    });

    expect(scan(dir).violations).toEqual([]);
  });

  it('ignores files that merely contain "#!" somewhere other than byte 0', () => {
    const dir = repo({
      '.gitattributes': '',
      'docs/notes.md': 'Use #!/usr/bin/env node to start a script.\n',
    });

    expect(listShebangFiles(dir).map((f) => f.file)).toEqual([]);
    expect(scan(dir).violations).toEqual([]);
  });

  it('reads the eol attribute through real git check-attr, not a guess', () => {
    const dir = repo({
      '.gitattributes': 'exact/path.tool text eol=lf\n',
      'exact/path.tool': '#!/usr/bin/env node\n',
      'other/path.tool': '#!/usr/bin/env node\n',
    });

    const attrs = eolAttributes(dir, ['exact/path.tool', 'other/path.tool']);
    expect(attrs.get('exact/path.tool')).toBe('lf');
    expect(attrs.get('other/path.tool')).not.toBe('lf');
  });

  it('reports both problems for a file that is unpinned AND stored with CRLF', () => {
    const violations = findViolations(
      [{ file: 'a.zsh', crlf: true }],
      new Map([['a.zsh', 'unspecified']]),
    );
    expect(violations.map((v) => v.kind).sort()).toEqual(['crlf-blob', 'unpinned']);
  });
});

describe('this repository satisfies the lint', () => {
  let result: ReturnType<typeof scan>;

  beforeAll(() => {
    result = scan(REPO_ROOT);
  });

  it('finds a non-trivial number of shebanged files (guards against a vacuous pass)', () => {
    expect(result.shebangFiles.length).toBeGreaterThan(20);
  });

  it('has zero shebang EOL violations', () => {
    expect(result.violations).toEqual([]);
  });
});
