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
 * Build `GIT_CONFIG_*` env vars so config can be forced on every git process in
 * the subtree without mutating the developer's global config.
 */
function gitConfigEnv(config: Record<string, string>): Record<string, string> {
  const keys = Object.keys(config);
  if (keys.length === 0) return {};
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(keys.length) };
  keys.forEach((key, i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = config[key] as string;
  });
  return env;
}

/**
 * A git environment that makes committing impossible: signing is demanded and
 * the signing program cannot exist. Any code path that tries to create a commit
 * dies here; a path that never commits is unaffected.
 */
const SIGNING_HOSTILE_GIT_CONFIG: Record<string, string> = {
  'commit.gpgsign': 'true',
  'tag.gpgsign': 'true',
  'gpg.program': join(tmpdir(), 'squad-no-such-signing-program-8f3a1c'),
};

/**
 * Run `gh aw add` on one local Markdown file in a throwaway git repo and return
 * everything the CLI printed. `gh aw add` runs its markdown security scan before
 * it compiles, so the scan verdict is present even when a later phase fails.
 *
 * No commit is created: an empty `git init` is enough for gh-aw here, and
 * avoiding `git commit` keeps the gate immune to developer/CI machines that set
 * `commit.gpgsign=true` globally without a usable signing key.
 *
 * `-n` pins the installed name so the sandbox-leak self-check below can look for
 * an exact path. (Each file gets its own workspace, so there is no cross-file
 * name collision to avoid -- the explicit name is purely for that assertion.)
 */
function scanOutput(absPath: string, index: number, extraGitConfig: Record<string, string> = {}): string {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'secscan-'));

  // Injected via GIT_CONFIG_* so it applies to every git process in the tree,
  // including any git that `gh aw` shells out to, without touching global config.
  const env = { ...process.env, ...gitConfigEnv(extraGitConfig) };

  execFileSync('git', ['init', '--quiet'], { cwd: workspace, env });

  const result = spawnSync('gh', ['aw', 'add', absPath, '-n', `scan-target-${index}`], {
    cwd: workspace,
    encoding: 'utf8',
    env,
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

  // -------------------------------------------------------------------------
  // Portability: this gate must not depend on being able to create a commit.
  //
  // A developer or runner with `commit.gpgsign=true` set globally and no usable
  // signing key would otherwise fail here BEFORE the scanner ever ran, turning a
  // real installability gate into an environment-dependent one. The scan repo is
  // therefore never committed to.
  //
  // Executing under a signing-hostile config proves that property instead of
  // merely documenting it: signing is demanded and `gpg.program` points at a
  // path that cannot exist, so any reintroduced `git commit` fails outright.
  // -------------------------------------------------------------------------
  it('scans successfully in a repo where committing is impossible (no signing key)', () => {
    expect(existsSync(SIGNING_HOSTILE_GIT_CONFIG['gpg.program'] as string)).toBe(false);

    const output = scanOutput(join(WORKFLOWS_DIR, 'squad.md'), 9001, SIGNING_HOSTILE_GIT_CONFIG);

    // The scan ran and cleared: reached gh-aw, not blocked by git tooling.
    expect(/Security scan (?:failed|found)/i.test(output)).toBe(false);
    expect(output).toMatch(/Added workflow|\.github\/workflows/i);
    expect(output).not.toMatch(/gpg|signing|failed to write commit/i);
  });
});
