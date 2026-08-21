/**
 * Nap decision-archival integrity tests.
 *
 * `runNap` archives `.squad/decisions.md` into `.squad/decisions-archive.md` in
 * SHIPPED, USER-INVOCABLE code (`squad nap`, REPL `/nap`) — a different and
 * more dangerous path than the LLM/charter path covered by
 * `test/state/archival.test.ts`.
 *
 * Every assertion here inspects the ARTIFACT — file contents, and entry counts
 * that survive a real `git commit` — never `archiveDecisions()`'s own return
 * value. The incident being guarded against (#1774) is one where the routine
 * *reported success for an append that never happened*, so a test that trusts
 * the report is a test that trusts the thing that lied.
 *
 * @see packages/squad-cli/src/cli/core/nap.ts
 * @see packages/squad-sdk/src/state/io/archival.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { runNap } from '../../packages/squad-cli/src/cli/core/nap.js';

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold a handle briefly; the OS reclaims temp dirs anyway. */
    }
  }
});

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/** Fence-aware-enough count for assertions: `###` headings at column 0. */
function countRecords(markdown: string): number {
  return markdown.split('\n').filter((l) => /^### /.test(l)).length;
}

/**
 * Builds decisions.md above nap's 20 KB DECISION_THRESHOLD with `count` dated
 * entries, all old enough to be archived. At ~1.4 KB per entry the default of
 * 24 lands near 33 KB — comfortably over the threshold, so archival actually
 * runs. (A fixture under the threshold makes every assertion here vacuous.)
 */
function buildDecisions(count: number): string {
  const filler = 'Padding to push this file past the archival threshold. '.repeat(24);
  const entries: string[] = ['# Decisions', ''];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() - (400 + i) * 86_400_000).toISOString().slice(0, 10);
    entries.push(`### ${d}: Decision number ${i}`, '', filler, '');
  }
  return entries.join('\n');
}

/**
 * Creates a real git repository with `.squad/` committed, then adds `.squad/` to
 * `.git/info/exclude` — reproducing this repo's actual configuration, which is
 * the precondition for #1783.
 */
function createRepo(opts: { excludeSquad: boolean; archiveExists: boolean; entries?: number }): {
  repoRoot: string;
  squadDir: string;
} {
  const repoRoot = mkdtempSync(join(tmpdir(), 'squad-nap-git-'));
  tmpDirs.push(repoRoot);

  git(['init', '--initial-branch=main'], repoRoot);
  git(['config', 'user.email', 'fido@squad.test'], repoRoot);
  git(['config', 'user.name', 'FIDO'], repoRoot);
  git(['config', 'commit.gpgsign', 'false'], repoRoot);

  const squadDir = join(repoRoot, '.squad');
  mkdirSync(squadDir, { recursive: true });
  writeFileSync(join(squadDir, 'decisions.md'), buildDecisions(opts.entries ?? 24), 'utf8');
  if (opts.archiveExists) {
    writeFileSync(join(squadDir, 'decisions-archive.md'), '# Decisions Archive\n', 'utf8');
  }

  git(['add', '-A'], repoRoot);
  git(['commit', '-m', 'seed'], repoRoot);

  if (opts.excludeSquad) {
    appendFileSync(join(repoRoot, '.git', 'info', 'exclude'), '\n.squad/\n', 'utf8');
  }

  return { repoRoot, squadDir };
}

/**
 * Stages the way an agent does under an excluded `.squad/` and commits.
 *
 * `git add -- .squad/x` FAILS on an excluded path, so tooling falls back to
 * `git add -u`, which stages tracked modifications and deletions but silently
 * skips new files. That asymmetry IS defect #1783.
 */
function commitLikeAnAgent(repoRoot: string): void {
  git(['add', '-u'], repoRoot);
  try {
    git(['commit', '-m', 'archive'], repoRoot);
  } catch {
    /* nothing staged — fine, the assertions read the committed tree. */
  }
}

/** Entry count of a path as it exists in the committed tree, not the worktree. */
function countRecordsInCommit(repoRoot: string, relPath: string): number {
  try {
    return countRecords(git(['show', `HEAD:${relPath}`], repoRoot));
  } catch {
    return 0; // path does not exist in the commit at all
  }
}

describe('Nap archival — #1783: destination must be committable', () => {
  it('does not move records into a git-ignored destination that cannot be committed', () => {
    const { repoRoot, squadDir } = createRepo({ excludeSquad: true, archiveExists: false });

    const totalBefore = countRecordsInCommit(repoRoot, '.squad/decisions.md');
    expect(totalBefore).toBeGreaterThan(0);

    runNap({ squadDir });
    commitLikeAnAgent(repoRoot);

    // THE INVARIANT: no decision record may vanish across a commit boundary.
    // Pre-fix, nap appends to a brand-new .squad/decisions-archive.md that
    // `git add -u` cannot stage, while the trim of the tracked decisions.md
    // commits — so this sum collapses and history is destroyed.
    const survived =
      countRecordsInCommit(repoRoot, '.squad/decisions.md') +
      countRecordsInCommit(repoRoot, '.squad/decisions-archive.md');

    expect(survived).toBe(totalBefore);
  });

  it('leaves the source intact when it refuses to archive', () => {
    const { repoRoot, squadDir } = createRepo({ excludeSquad: true, archiveExists: false });
    const before = readFileSync(join(squadDir, 'decisions.md'), 'utf8');

    runNap({ squadDir });

    expect(readFileSync(join(squadDir, 'decisions.md'), 'utf8')).toBe(before);
    expect(existsSync(join(squadDir, 'decisions-archive.md'))).toBe(false);
    void repoRoot;
  });

  it('still archives normally when the archive is already tracked', () => {
    const { repoRoot, squadDir } = createRepo({ excludeSquad: true, archiveExists: true });

    const totalBefore = countRecordsInCommit(repoRoot, '.squad/decisions.md');
    runNap({ squadDir });
    commitLikeAnAgent(repoRoot);

    // A tracked destination stages under `git add -u` even while excluded, so
    // archival must proceed rather than being blocked by an over-broad guard.
    expect(countRecordsInCommit(repoRoot, '.squad/decisions-archive.md')).toBeGreaterThan(0);
    expect(
      countRecordsInCommit(repoRoot, '.squad/decisions.md') +
        countRecordsInCommit(repoRoot, '.squad/decisions-archive.md'),
    ).toBe(totalBefore);
  });

  it('archives normally when .squad/ is not excluded', () => {
    const { squadDir } = createRepo({ excludeSquad: false, archiveExists: false });
    const before = countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8'));

    runNap({ squadDir });

    const after =
      countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8')) +
      countRecords(readFileSync(join(squadDir, 'decisions-archive.md'), 'utf8'));
    expect(after).toBe(before);
  });
});

describe('Nap archival — #1774: never trim the source without a verified append', () => {
  it('conserves every record between source and archive', () => {
    const { squadDir } = createRepo({ excludeSquad: false, archiveExists: true });
    const before = countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8'));

    runNap({ squadDir });

    const remaining = countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8'));
    const archived = countRecords(readFileSync(join(squadDir, 'decisions-archive.md'), 'utf8'));

    // Conservation, measured on the artifacts. #1774's signature was a source
    // that shrank while the destination stayed byte-identical.
    expect(remaining + archived).toBe(before);
    expect(archived).toBeGreaterThan(0);
  });

  it('conserves records even when many entries are archived at once', () => {
    const { squadDir } = createRepo({ excludeSquad: false, archiveExists: true, entries: 40 });
    const before = countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8'));

    runNap({ squadDir });

    const remaining = countRecords(readFileSync(join(squadDir, 'decisions.md'), 'utf8'));
    const archived = countRecords(readFileSync(join(squadDir, 'decisions-archive.md'), 'utf8'));
    expect(remaining + archived).toBe(before);
  });
});

describe('Nap archival — #1760: `###` inside a fence is not a record boundary', () => {
  it('does not split a record at a fenced code sample', () => {
    const { squadDir } = createRepo({ excludeSquad: false, archiveExists: true, entries: 24 });
    const decisionsPath = join(squadDir, 'decisions.md');

    // A recent (must-keep) record whose body contains a fenced sample that
    // itself contains a `### ` line. Pre-fix, `/^###\s/` treats that sample line
    // as a new record: the tail after it becomes an undated orphan record, and
    // the marker sentence is severed from the heading that owns it.
    const today = new Date().toISOString().slice(0, 10);
    const fenced = [
      '',
      `### ${today}: Fence handling`,
      '',
      'Opening body owned by the Fence handling record.',
      '',
      '```markdown',
      '### 2020-01-01: Example inside a code sample',
      'Illustrative only — not a real record.',
      '```',
      '',
      'SENTINEL_TAIL belongs to the Fence handling record.',
      '',
    ].join('\n');
    writeFileSync(decisionsPath, readFileSync(decisionsPath, 'utf8') + fenced, 'utf8');

    runNap({ squadDir });

    const remaining = readFileSync(decisionsPath, 'utf8');

    // The record is recent, so it must be kept whole — heading, fenced sample,
    // and trailing sentence together in the source.
    expect(remaining).toContain(`### ${today}: Fence handling`);
    expect(remaining).toContain('SENTINEL_TAIL belongs to the Fence handling record.');
    expect(remaining).toContain('### 2020-01-01: Example inside a code sample');

    // And the illustrative line must never be archived as if it were a record.
    const archived = readFileSync(join(squadDir, 'decisions-archive.md'), 'utf8');
    expect(archived).not.toContain('Example inside a code sample');
    expect(archived).not.toContain('SENTINEL_TAIL');
  });
});
