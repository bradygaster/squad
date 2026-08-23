/**
 * Behavioral coverage for Team Guard Step TG-2 in `workflows/squad.md` (#1812).
 *
 * `/squad plan activate` minted `squad:{agent}` labels from the hardcoded
 * `squad init --preset default` roster (lead, reviewer, devrel, security, docs)
 * instead of this repository's real cast in `.squad/team.md`, and then printed a
 * provenance sentence claiming it had read `team.md` when it had not. On the
 * measured fixture (run 32471509974) the summary reported five preset names, none
 * of which appears anywhere in the fixture's `team.md`. A wrong answer wearing a
 * citation is worse than a wrong answer: refusal and correct binding are
 * indistinguishable from the outside, which is how #1784 got a false pass.
 *
 * More prose telling the model to "really read the file" had already been tried
 * repeatedly and failed. The fix is structural: TG-2 is a shell command whose
 * stdout survives the run and can be asserted against. These tests do exactly
 * that — they extract the bash block *declared* in the workflow and *execute* it
 * against real committed git repositories. Nothing here re-reads prose to confirm
 * prose. Every failure message names the offending input verbatim, because a
 * status-only assertion passes a truncating parser (measured on #1832).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SQUAD_WORKFLOW = join(process.cwd(), 'workflows', 'squad.md');
const workflow = readFileSync(SQUAD_WORKFLOW, 'utf8');

/**
 * Resolve a POSIX shell. Checking only `/bin/sh` silently skips every behavioral
 * case on Windows, and a check that never runs is indistinguishable from a check
 * that always passes. Git ships a POSIX shell on Windows, so fall back to it.
 */
function resolvePosixShell(): string | null {
  if (existsSync('/bin/sh')) return '/bin/sh';
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramW6432'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    join(process.env['LOCALAPPDATA'] ?? 'C:\\', 'Programs'),
  ];
  return roots.map(r => join(r, 'Git', 'bin', 'bash.exe')).find(existsSync) ?? null;
}

const POSIX_SHELL = resolvePosixShell();

/** Pull the first fenced bash block that follows `heading`, dedented. */
function bashBlockAfter(heading: string): string {
  const at = workflow.indexOf(heading);
  expect(at, `"${heading}" is missing from workflows/squad.md`).toBeGreaterThan(-1);

  const rest = workflow.slice(at);
  const fence = /^[ \t]*```bash[ \t]*\r?\n([\s\S]*?)^[ \t]*```/m.exec(rest);
  expect(fence, `no fenced bash block follows "${heading}" in workflows/squad.md`).not.toBeNull();

  return (fence?.[1] ?? '')
    .split('\n')
    .map(line => line.replace(/^[ \t]+/, ''))
    .join('\n')
    .trim();
}

const TG2_HEADING = '### Step TG-2: Certify the Roster Set';
const TG2_BLOCK = bashBlockAfter(TG2_HEADING);

const tempDirs: string[] = [];

afterAll(() => {
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/**
 * Build a throwaway git repo. `committed` is written to `.squad/team.md` and
 * committed to HEAD (null → team.md is absent from HEAD, but a HEAD still exists).
 * `workingTree`, when given, overwrites the working-tree copy *without* committing
 * it — this reproduces a preset scaffold sitting uncommitted next to a real
 * committed roster, which is precisely the #1812 leak vector.
 */
function makeRepo(committed: string | null, workingTree?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gh-aw-tg2-'));
  tempDirs.push(dir);
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  // Preserve CRLF bytes in the blob so the CRLF case actually exercises sub(/\r$/,"").
  execSync('git config core.autocrlf false', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "t@t.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "T"', { cwd: dir, stdio: 'ignore' });

  if (committed === null) {
    // HEAD must exist for `git show HEAD:...` to reach the "absent path" branch
    // rather than erroring for lack of any commit.
    writeFileSync(join(dir, 'README.md'), '# placeholder\n');
    execSync('git add -f README.md', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m init', { cwd: dir, stdio: 'ignore' });
  } else {
    mkdirSync(join(dir, '.squad'), { recursive: true });
    writeFileSync(join(dir, '.squad', 'team.md'), committed);
    execSync('git add -f .squad/team.md', { cwd: dir, stdio: 'ignore' });
    execSync('git commit -m team', { cwd: dir, stdio: 'ignore' });
  }

  if (workingTree !== undefined) {
    mkdirSync(join(dir, '.squad'), { recursive: true });
    writeFileSync(join(dir, '.squad', 'team.md'), workingTree);
  }
  return dir;
}

/**
 * Run the extracted TG-2 block in `cwd`. Trailing blank lines are trimmed but
 * interior `\r` is deliberately preserved: erasing it here would hide a failure
 * of the awk to strip a CRLF carriage return, which is exactly what the CRLF case
 * must catch.
 */
function runTG2(cwd: string): string {
  if (!POSIX_SHELL) throw new Error('no POSIX shell resolved');
  return execFileSync(POSIX_SHELL, ['-c', TG2_BLOCK], { cwd, encoding: 'utf8' }).replace(/\n+$/, '');
}

const members = (out: string): string[] =>
  out
    .split('\n')
    .filter(l => l.startsWith('ROSTER_MEMBER: '))
    .map(l => l.slice('ROSTER_MEMBER: '.length));

const unreadable = (out: string): string | null => {
  const line = out.split('\n').find(l => l.startsWith('ROSTER_UNREADABLE: '));
  return line ? line.slice('ROSTER_UNREADABLE: '.length) : null;
};

// A real cast roster (Name column first) — the shape #1784's fixture actually had.
const CAST = [
  '## Members',
  '',
  '| Name | Role |',
  '|------|------|',
  '| Keaton | Lead |',
  '| McManus | Reviewer |',
  '| Fenster | DevRel |',
  '| Hockney | Security |',
  '| Kint | Docs |',
  '',
].join('\n');

// The exact preset scaffold that leaked in the measured defect.
const PRESET = [
  '## Members',
  '',
  '| Name | Role |',
  '|------|------|',
  '| lead | Lead |',
  '| reviewer | Reviewer |',
  '| devrel | DevRel |',
  '| security | Security |',
  '| docs | Docs |',
  '',
].join('\n');

describe('gh-aw: Team Guard TG-2 roster certification (#1812)', () => {
  // A skipped behavioral suite is a permanently-green gate. Fail loudly instead
  // of quietly reporting a pass for assertions that never executed.
  it('resolves a POSIX shell, so the behavioral cases below actually run', () => {
    expect(
      POSIX_SHELL,
      'No POSIX shell found. The TG-2 cases below are behavioral — skipping them ' +
        'would report a green suite for assertions that never ran. Install Git for ' +
        'Windows (provides bash.exe) or run on a POSIX host.'
    ).not.toBeNull();
  });

  // If the heading is renamed or the fenced block deleted, extraction would yield
  // empty text and every execute-case below would vacuously pass. Guard that.
  it('extracts a non-empty TG-2 block that emits the certified-roster vocabulary', () => {
    expect(TG2_BLOCK.length, 'TG-2 bash block extracted empty from workflows/squad.md').toBeGreaterThan(0);
    expect(TG2_BLOCK, 'TG-2 block must emit ROSTER_MEMBER: lines').toContain('ROSTER_MEMBER:');
    expect(TG2_BLOCK, 'TG-2 block must emit ROSTER_UNREADABLE: on failure').toContain('ROSTER_UNREADABLE:');
    // It must read the *committed* revision, not the working tree — the entire point.
    expect(TG2_BLOCK, 'TG-2 must read the committed HEAD revision of team.md').toMatch(/git show HEAD:\.squad\/team\.md/);
  });

  it.skipIf(!POSIX_SHELL)('emits the committed cast verbatim (lowercased), not a preset', () => {
    const out = runTG2(makeRepo(CAST));
    expect(members(out), `expected the real cast from team.md; got:\n${out}`).toEqual([
      'keaton',
      'mcmanus',
      'fenster',
      'hockney',
      'kint',
    ]);
    expect(unreadable(out), `unexpected ROSTER_UNREADABLE on a readable roster:\n${out}`).toBeNull();
  });

  it.skipIf(!POSIX_SHELL)('reads the Name column by header, not by position, when Role comes first', () => {
    const roleFirst = [
      '## Members',
      '',
      '| Role | Name |',
      '|------|------|',
      '| Lead | Keaton |',
      '| Reviewer | McManus |',
      '',
    ].join('\n');
    const out = runTG2(makeRepo(roleFirst));
    expect(members(out), `expected names from the Name column; got:\n${out}`).toEqual(['keaton', 'mcmanus']);
    // The bug this guards: extracting column 2 by position would emit the roles.
    for (const role of ['lead', 'reviewer']) {
      expect(members(out), `Role value "${role}" leaked as a roster member; got:\n${out}`).not.toContain(role);
    }
  });

  it.skipIf(!POSIX_SHELL)('names the failure when the table has no Name column', () => {
    const noName = [
      '## Members',
      '',
      '| Handle | Role |',
      '|--------|------|',
      '| Keaton | Lead |',
      '',
    ].join('\n');
    const out = runTG2(makeRepo(noName));
    expect(members(out), `no member may be emitted without a Name column; got:\n${out}`).toEqual([]);
    expect(unreadable(out), `expected a named "no Name column" reason; got:\n${out}`).toBe(
      'no Name column in ## Members table'
    );
  });

  it.skipIf(!POSIX_SHELL)('reads committed HEAD, so an uncommitted preset scaffold cannot leak', () => {
    // The measured #1812 defect: a real cast is committed, but a preset team.md
    // sits in the working tree. TG-2 must certify the committed cast only.
    const out = runTG2(makeRepo(CAST, PRESET));
    expect(members(out), `working-tree preset leaked past the committed HEAD read; got:\n${out}`).toEqual([
      'keaton',
      'mcmanus',
      'fenster',
      'hockney',
      'kint',
    ]);
    for (const preset of ['lead', 'reviewer', 'devrel', 'security', 'docs']) {
      expect(members(out), `preset name "${preset}" leaked into the certified roster; got:\n${out}`).not.toContain(
        preset
      );
    }
  });

  it.skipIf(!POSIX_SHELL)('names the failure when team.md is absent from HEAD', () => {
    const out = runTG2(makeRepo(null));
    expect(members(out), `no roster may be emitted when team.md is absent; got:\n${out}`).toEqual([]);
    expect(unreadable(out), `expected a named "absent from HEAD" reason; got:\n${out}`).toBe(
      '.squad/team.md absent from HEAD'
    );
  });

  it.skipIf(!POSIX_SHELL)('names the failure when there is no ## Members section', () => {
    const noSection = ['# Squad', '', 'Some prose but no members table.', ''].join('\n');
    const out = runTG2(makeRepo(noSection));
    expect(members(out), `no roster may be emitted without a ## Members section; got:\n${out}`).toEqual([]);
    expect(unreadable(out), `expected a named "no ## Members section" reason; got:\n${out}`).toBe(
      'no ## Members section in .squad/team.md'
    );
  });

  it.skipIf(!POSIX_SHELL)('names the failure when ## Members has header and separator but no data rows', () => {
    const headerOnly = ['## Members', '', '| Name | Role |', '|------|------|', ''].join('\n');
    const out = runTG2(makeRepo(headerOnly));
    expect(members(out), `header/separator rows are not members; got:\n${out}`).toEqual([]);
    expect(unreadable(out), `expected a named "no data rows" reason; got:\n${out}`).toBe(
      '## Members has no data rows in .squad/team.md'
    );
  });

  // CRLF-authored team.md is a real scenario (Windows editors). This asserts the
  // whole pipeline — committed-HEAD read, section/header/row detection — yields the
  // clean lowercased cast on CRLF input. It is reddenable: the lowercase mutation
  // (drop tolower) and the working-tree mutation (cat vs git show) both flip it,
  // naming the offending ROSTER_MEMBER output. Note: the awk's `sub(/\r$/,"")` could
  // NOT be shown independently load-bearing on this substrate — for trailing-pipe
  // GitHub tables the trailing pipe already quarantines the CR into a post-pipe
  // field that is never read (measured). The strip is retained as defense-in-depth
  // for irregular tables; this test does not claim to prove it.
  it.skipIf(!POSIX_SHELL)('parses a CRLF-authored team.md into the clean lowercased cast', () => {
    const crlf = [
      '## Members',
      '',
      '| Name | Role |',
      '|------|------|',
      '| Keaton | Lead |',
      '| McManus | Reviewer |',
      '',
    ].join('\r\n');
    const out = runTG2(makeRepo(crlf));
    expect(members(out), `expected the clean lowercased cast from a CRLF file; got:\n${out}`).toEqual([
      'keaton',
      'mcmanus',
    ]);
    expect(unreadable(out), `unexpected ROSTER_UNREADABLE on a readable CRLF roster:\n${out}`).toBeNull();
  });
});
