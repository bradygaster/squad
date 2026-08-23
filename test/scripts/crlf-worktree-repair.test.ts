/**
 * #1793 — a `.gitattributes` eol=lf rule does not repair a working tree that
 * already exists. These tests drive real git repositories rather than synthetic
 * fixtures, because the entire defect lives in git's own behaviour: the file is
 * content-clean (the checkin filter normalizes the CRLF away, so the cleaned
 * blob equals the index blob) while still being CRLF on disk. A hand-built
 * fixture would prove the parser and nothing else.
 *
 * Each test that asserts a repair FIRST asserts the broken state, so a repair
 * that silently no-ops cannot pass.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkWorktreeEol } from '@bradygaster/squad-cli/commands/doctor';
import { listContentModified, listWorktreeCrlf } from '../../scripts/check-shebang-eol.mjs';
import { repair } from '../../scripts/fix-crlf-worktree.mjs';

const SHEBANG_SCRIPT = '#!/usr/bin/env node\nconsole.log("hi");\n';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A repo in the exact post-#1790 state: `*.mjs text eol=lf` is committed, the
 * blob is stored LF, and the working file is CRLF. That combination is what
 * every pre-#1790 Windows checkout looks like after pulling the fix.
 */
function makeRepo(files: Record<string, string> = { 'tool.mjs': SHEBANG_SCRIPT }): string {
  const dir = mkdtempSync(join(tmpdir(), 'crlf-worktree-'));
  created.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: dir });

  writeFileSync(join(dir, '.gitattributes'), '*.mjs text eol=lf\n');
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content); // LF — this is what the blob stores
  }
  execFileSync('git', ['add', '--', '.gitattributes', ...Object.keys(files)], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  return dir;
}

/** Rewrite a working file to CRLF without touching the index — the #1793 state. */
function crlfOnDisk(dir: string, name: string): void {
  const text = readFileSync(join(dir, name), 'utf8');
  writeFileSync(join(dir, name), text.replace(/\r?\n/g, '\r\n'));
}

function eolOf(dir: string, name: string): string {
  return execFileSync('git', ['ls-files', '--eol', '--', name], { cwd: dir, encoding: 'utf8' });
}

describe('#1793 detection — listWorktreeCrlf', () => {
  it('finds nothing on a freshly checked-out tree', () => {
    expect(listWorktreeCrlf(makeRepo())).toEqual([]);
  });

  it('flags an LF-pinned file that is CRLF on disk', () => {
    const dir = makeRepo();
    crlfOnDisk(dir, 'tool.mjs');

    // Guard the premise: git must consider this file content-clean. If it did
    // not, the bug would be visible as an ordinary diff and need no detector.
    expect(listContentModified(dir).has('tool.mjs')).toBe(false);
    expect(eolOf(dir, 'tool.mjs')).toContain('w/crlf');

    const found = listWorktreeCrlf(dir);
    expect(found.map((e) => e.file)).toEqual(['tool.mjs']);
    expect(found[0]?.index).toBe('lf'); // index already LF — this is why git never re-smudges
  });

  it('ignores a CRLF file that carries no eol=lf pin', () => {
    const dir = makeRepo({ 'tool.mjs': SHEBANG_SCRIPT, 'notes.txt': 'a\nb\n' });
    crlfOnDisk(dir, 'notes.txt');
    expect(listWorktreeCrlf(dir)).toEqual([]);
  });

  it('parses paths containing spaces', () => {
    const dir = makeRepo({ 'my tool.mjs': SHEBANG_SCRIPT });
    crlfOnDisk(dir, 'my tool.mjs');
    expect(listWorktreeCrlf(dir).map((e) => e.file)).toEqual(['my tool.mjs']);
  });
});

describe('#1793 doctor check — checkWorktreeEol', () => {
  it('FAILS on a working tree that predates the eol=lf rule', () => {
    const dir = makeRepo();
    crlfOnDisk(dir, 'tool.mjs');

    const result = checkWorktreeEol(dir);
    expect(result?.status).toBe('fail');
    expect(result?.message).toContain('tool.mjs');
    expect(result?.message).toContain('npm run fix:crlf');
    // The suggested verification must cover the same scope the check does.
    // An `*.mjs`-scoped hint can report all-clear while a pinned file
    // elsewhere is still CRLF — a verification that cannot observe the
    // failure it exists to catch, which is this PR's own bug class.
    expect(result?.message).not.toContain('--eol "*.mjs"');
  });

  it('names a CRLF path containing spaces', () => {
    // Same delimiter-sensitive record parsing as listWorktreeCrlf, but a
    // separate implementation (see the note on checkWorktreeEol), so the two
    // parsers can silently diverge unless both are pinned to this shape.
    const dir = makeRepo({ 'my tool.mjs': SHEBANG_SCRIPT });
    crlfOnDisk(dir, 'my tool.mjs');

    const result = checkWorktreeEol(dir);
    expect(result?.status).toBe('fail');
    // Naming it, not merely failing: a parser that truncates at the space
    // would still fail, just uselessly.
    expect(result?.message).toContain('my tool.mjs');
  });

  it('PASSES on the same repo once repaired — the check is not stuck on fail', () => {
    const dir = makeRepo();
    crlfOnDisk(dir, 'tool.mjs');
    expect(checkWorktreeEol(dir)?.status).toBe('fail');

    execFileSync('git', ['checkout-index', '-f', '--', 'tool.mjs'], { cwd: dir });

    const result = checkWorktreeEol(dir);
    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('LF on disk');
  });

  it('is not applicable outside a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crlf-nogit-'));
    created.push(dir);
    expect(checkWorktreeEol(dir)).toBeUndefined();
  });

  it('is not applicable when the repo pins nothing to eol=lf', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crlf-nopin-'));
    created.push(dir);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
    writeFileSync(join(dir, 'notes.txt'), 'a\n');
    execFileSync('git', ['add', '--', 'notes.txt'], { cwd: dir });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
    expect(checkWorktreeEol(dir)).toBeUndefined();
  });
});

describe('#1793 repair — fix-crlf-worktree', () => {
  it('rewrites the working file to LF and reports it', () => {
    const dir = makeRepo();
    crlfOnDisk(dir, 'tool.mjs');
    expect(eolOf(dir, 'tool.mjs')).toContain('w/crlf');

    const result = repair(dir);

    expect(result.repaired).toEqual(['tool.mjs']);
    expect(result.skipped).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(eolOf(dir, 'tool.mjs')).toContain('w/lf');
    expect(readFileSync(join(dir, 'tool.mjs'), 'utf8')).not.toContain('\r');
  });

  it('is a no-op on an already-healthy tree', () => {
    expect(repair(makeRepo())).toEqual({ repaired: [], skipped: [], remaining: [] });
  });

  it('NEVER overwrites a file with real uncommitted edits', () => {
    const dir = makeRepo();
    // A genuine edit that also happens to use CRLF: the repair would clobber it.
    writeFileSync(join(dir, 'tool.mjs'), '#!/usr/bin/env node\r\nconsole.log("PRECIOUS");\r\n');
    expect(listContentModified(dir).has('tool.mjs')).toBe(true);

    const result = repair(dir);

    expect(result.skipped).toEqual(['tool.mjs']);
    expect(result.repaired).toEqual([]);
    expect(readFileSync(join(dir, 'tool.mjs'), 'utf8')).toContain('PRECIOUS');
  });

  it('repairs every stale file in one pass', () => {
    const names = ['a.mjs', 'b.mjs', 'c.mjs'];
    const dir = makeRepo(Object.fromEntries(names.map((n) => [n, SHEBANG_SCRIPT])));
    for (const name of names) crlfOnDisk(dir, name);
    expect(listWorktreeCrlf(dir)).toHaveLength(3);

    expect(repair(dir).repaired.sort()).toEqual(names);
    expect(listWorktreeCrlf(dir)).toEqual([]);
  });

  it('leaves a CRLF shebang parseable after repair — the actual #1788 symptom', () => {
    const dir = makeRepo();
    crlfOnDisk(dir, 'tool.mjs');
    // Vite strips through the first LF; with CRLF that leaves a bare `#`.
    const broken = readFileSync(join(dir, 'tool.mjs'), 'utf8');
    expect(broken.slice(0, broken.indexOf('\n') + 1)).toContain('\r');

    repair(dir);

    const fixed = readFileSync(join(dir, 'tool.mjs'), 'utf8');
    expect(fixed.slice(0, fixed.indexOf('\n'))).toBe('#!/usr/bin/env node');
  });
});
