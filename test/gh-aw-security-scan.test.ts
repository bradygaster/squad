/**
 * gh-aw Security-Scan Installability Gate (#1977 regression)
 *
 * `gh aw compile --strict` does NOT run gh-aw's markdown security scanner, but
 * `gh aw add` — the public bootstrap path every consumer uses — does. That gap
 * let #1977 merge green and still ship a `dev` that no one could install:
 *
 *   workflows/squad.md:1438:1: error: [social-engineering] contains prompt
 *   injection pattern (attempts to override AI agent instructions)
 *
 * The offending line was legitimate safety prose about distrusting fetched web
 * content, but it quoted a canonical adversarial phrase verbatim, so the
 * scanner could not tell the guidance from the attack.
 *
 * This gate runs the REAL scanner (not a handwritten phrase blocklist, which
 * would drift from gh-aw's ruleset) over every Markdown file this repo
 * distributes under `workflows/`. It is offline, needs no GitHub round-trip,
 * and completes in seconds.
 *
 * Scope: the scan verdict only. Import resolution, frontmatter, and strict
 * compilation are already gated by the other gh-aw suites, so failures from
 * those later phases are deliberately ignored here.
 *
 * Fails closed (never skips) per this repo's #1833/#1834 convention: an
 * unmeasured contract is indistinguishable from a violated one.
 */

import { afterAll, describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const WORKFLOWS_DIR = join(REPO_ROOT, 'workflows');
const SHARED_DIR = join(WORKFLOWS_DIR, 'shared');

/**
 * Scratch repos live OUTSIDE this repository on purpose.
 *
 * `gh aw add` resolves its target `.github/workflows/` by walking up from its
 * working directory. A scratch repo nested under the source tree (e.g.
 * `.test-workspaces/`) lets that walk escape into the real checkout, where the
 * CLI then writes a stray workflow and rewrites `.gitattributes` — polluting
 * the very tree under test. An OS-temp workspace has nothing above it to find.
 */
const TEST_WORKSPACES_DIR = join(tmpdir(), 'squad-gh-aw-secscan');

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to run the security scanner this gate inspects. Install it with ' +
  '`gh extension install --pin v0.87.10 github/gh-aw` (matches .github/workflows/squad-ci.yml). ' +
  'This gate fails closed rather than skipping: an unmeasured contract is ' +
  'indistinguishable from a violated one (#1834).';

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

/** Every Markdown file this repo distributes through `gh aw add`. */
function distributedWorkflowFiles(): string[] {
  const entrypoints = readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(WORKFLOWS_DIR, name));
  const shared = readdirSync(SHARED_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(SHARED_DIR, name));
  return [...entrypoints, ...shared].sort();
}

/**
 * Run `gh aw add` on one local Markdown file in a throwaway git repo and return
 * everything the CLI printed. `gh aw add` runs its markdown security scan before
 * it compiles, so the scan verdict is present even when a later phase fails.
 *
 * Each file gets its own workspace and an explicit `-n` name: `workflows/squad.md`
 * and `workflows/shared/squad.md` share a basename, and gh-aw aborts the whole
 * batch on that collision — which would silently leave later files unscanned.
 */
function scanOutput(absPath: string, index: number): string {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'secscan-'));
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  // gh-aw expects a repo with history; an empty commit is enough and keeps the
  // CLI from treating the scratch repo as unusable and looking elsewhere.
  execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'init'], {
    cwd: workspace,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'squad-test',
      GIT_AUTHOR_EMAIL: 'squad-test@example.invalid',
      GIT_COMMITTER_NAME: 'squad-test',
      GIT_COMMITTER_EMAIL: 'squad-test@example.invalid',
    },
  });

  const result = spawnSync('gh', ['aw', 'add', absPath, '-n', `scan-target-${index}`], {
    cwd: workspace,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`gh aw add could not be executed: ${result.error.message}. ${GH_AW_INSTALL_HINT}`);
  }

  // Self-check: prove the scan stayed in its sandbox. If `gh aw add` ever
  // resolves upward into this checkout again, fail here rather than silently
  // leaving stray workflows behind for someone to commit.
  const leaked = join(REPO_ROOT, '.github', 'workflows', `scan-target-${index}.md`);
  expect(existsSync(leaked), `gh aw add wrote ${leaked} into this repo instead of its scratch workspace`).toBe(
    false,
  );

  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

describe('gh-aw: distributed workflows survive the public `gh aw add` security scan (#1977)', () => {
  it('has `gh aw` available, so the gate is actually measuring something', () => {
    const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
    expect(versionProbe.error, GH_AW_INSTALL_HINT).toBeUndefined();
    expect(versionProbe.status, `gh aw --version failed. ${GH_AW_INSTALL_HINT}`).toBe(0);
  });

  it('enumerates the four public entrypoints plus their shared imports', () => {
    const names = distributedWorkflowFiles().map((p) => relative(WORKFLOWS_DIR, p));
    expect(names).toContain('squad.md');
    expect(names).toContain('squad-implement-worker.md');
    expect(names).toContain('squad-deps-worker.md');
    expect(names).toContain('squad-review.md');
    expect(names.some((n) => n.startsWith('shared/'))).toBe(true);
  });

  it.each(distributedWorkflowFiles().map((p, i) => [relative(REPO_ROOT, p), p, i] as const))(
    '%s passes the gh-aw markdown security scanner',
    (label, absPath, index) => {
      const output = scanOutput(absPath, index);

      // Assert on the scanner's own verdict rather than a phrase list, so this
      // gate tracks gh-aw's ruleset instead of drifting from it.
      const scannerRejected =
        /Security scan (?:failed|found)/i.test(output) || /failed security scan/i.test(output);

      expect(
        scannerRejected,
        `${label} was rejected by the gh-aw security scanner, so \`gh aw add\` cannot install it ` +
          `from a consumer repo. Rephrase the flagged prose to describe the adversarial pattern ` +
          `instead of quoting it verbatim; the guidance can keep its meaning without reproducing ` +
          `the literal attack string.\n\n--- gh aw add output ---\n${output}`,
      ).toBe(false);
    },
  );
});
