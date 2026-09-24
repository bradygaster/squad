/**
 * gh-aw-enlistment skill — structural validity, discoverability, and safety-gate
 * regression guard.
 *
 * The skill operationalizes the supported Squad gh-aw bootstrap
 * (docs/src/content/docs/guide/gh-aw.md). Its value is entirely in the safety
 * gates it encodes, so this suite asserts:
 *   1. The canonical SKILL.md parses into a valid SkillDefinition.
 *   2. Its frontmatter advertises the documented trigger phrases (discoverability).
 *   3. Its body still encodes every critical safety gate (allowlist, strict
 *      compile, never-auto-merge, read-only token, explicit staging).
 *   4. The canonical source and both template mirrors are byte-for-byte identical
 *      (the sync invariant every canonical skill upholds).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFile } from '@bradygaster/squad-sdk/skills';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SKILL_ID = 'gh-aw-enlistment';

const CANONICAL = `.squad-templates/skills/${SKILL_ID}/SKILL.md`;
const GUIDE = 'docs/src/content/docs/guide/gh-aw.md';
const AGENT_GUIDE = '.github/agents.md';
const MIRRORS = [
  `templates/skills/${SKILL_ID}/SKILL.md`,
  `packages/squad-cli/templates/skills/${SKILL_ID}/SKILL.md`,
  `packages/squad-sdk/templates/skills/${SKILL_ID}/SKILL.md`,
] as const;

function readRaw(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}
/** LF-normalized read — markdown is not pinned to LF, so Windows checkouts get CRLF. */
function readLF(rel: string): string {
  return readRaw(rel).replace(/\r\n/g, '\n');
}

describe('gh-aw-enlistment skill', () => {
  it('canonical SKILL.md exists', () => {
    expect(existsSync(resolve(ROOT, CANONICAL)), `${CANONICAL} should exist`).toBe(true);
  });

  it('parses into a valid SkillDefinition', () => {
    const skill = parseSkillFile(SKILL_ID, readLF(CANONICAL));
    expect(skill, 'skill should parse').toBeDefined();
    expect(skill!.id).toBe(SKILL_ID);
    expect(skill!.name).toContain(SKILL_ID);
    expect(skill!.content.length).toBeGreaterThan(0);
  });

  describe('discoverability — frontmatter trigger phrases', () => {
    const content = readLF(CANONICAL);
    // Assert against the PARSED triggers array, not raw text. `toContain` on the
    // whole document would still pass if a phrase were deleted from the
    // frontmatter and merely mentioned in prose — which is the exact regression
    // this block exists to catch, since a phrase in prose is not discoverable.
    // `skill.triggers` is the same array the runtime matcher iterates
    // (packages/squad-sdk/src/skills/index.ts), so this tests the real path.
    const skill = parseSkillFile(SKILL_ID, content);

    it('declares a non-empty triggers block in frontmatter', () => {
      expect(skill, 'skill should parse').toBeDefined();
      expect(Array.isArray(skill!.triggers), 'triggers should parse to an array').toBe(true);
      expect(skill!.triggers.length, 'triggers must not be empty').toBeGreaterThan(0);
    });

    // The three trigger phrases the skill must be discoverable by.
    for (const phrase of [
      'set up Squad agentic workflows',
      'enlist this repo in Squad',
      'install Squad gh-aw workflows',
    ]) {
      it(`is discoverable by "${phrase}"`, () => {
        expect(
          skill!.triggers,
          `"${phrase}" must be a frontmatter trigger, not merely present somewhere in the document`,
        ).toContain(phrase);
      });
    }
  });

  describe('safety gates encoded in the body', () => {
    const content = readLF(CANONICAL);

    // EXCLUSIVITY GUARD — these two tests enforce the exact set of
    // backtick-delimited tokens in the bounded allowlist region.
    // Using deep-equality on a sorted array (not .toContain) so that adding a
    // 4th entry, removing an entry, or renaming one all cause an immediate
    // failure.  The delimiters scope the extraction so identical strings that
    // appear elsewhere in the document (Anti-Patterns section, examples) do
    // NOT count.
    it('allowlist region delimiters exist exactly once each', () => {
      const startMatches = [...content.matchAll(/^<!-- allowlist-start -->$/gm)];
      const endMatches   = [...content.matchAll(/^<!-- allowlist-end -->$/gm)];
      expect(startMatches.length, '<!-- allowlist-start --> must appear exactly once').toBe(1);
      expect(endMatches.length,   '<!-- allowlist-end --> must appear exactly once').toBe(1);
    });

    it('allowlist region contains EXACTLY the two documented secrets and the one documented action — no more, no fewer', () => {
      const startTag = '<!-- allowlist-start -->';
      const endTag   = '<!-- allowlist-end -->';
      const startIdx = content.indexOf(startTag);
      const endIdx   = content.indexOf(endTag);
      expect(startIdx, 'allowlist-start delimiter must exist').toBeGreaterThan(-1);
      expect(endIdx,   'allowlist-end delimiter must exist').toBeGreaterThan(startIdx);

      // Extract strictly between the delimiter lines (exclusive).
      const region = content.slice(startIdx + startTag.length, endIdx);

      // Every backtick-delimited token in the region — order-independent exact set.
      const tokens = [...region.matchAll(/`([^`]+)`/g)].map(m => m[1]);
      expect(tokens.slice().sort(), 'allowlist tokens must be exactly the three documented entries').toEqual(
        [
          'SQUAD_GITHUB_APP_PRIVATE_KEY',
          'SQUAD_GITHUB_TOKEN',
          'bradygaster/squad/.github/actions/squad-init',
        ].sort()
      );

      // Structural: exactly 2 bullet lines (one for the two secrets, one for the action).
      const bulletLines = region.split('\n').filter(l => l.trimStart().startsWith('- '));
      expect(bulletLines.length, 'allowlist region must contain exactly 2 bullet lines').toBe(2);
    });

    it('installs one immutable native package containing all seven workflows', () => {
      expect(content).toContain('SQUAD_SHA="$(gh api repos/bradygaster/squad/commits/dev');
      expect(content).toContain('^' + '[0-9a-f]{40}' + '$');
      expect(content).toContain('gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"');
      for (const workflow of [
        'squad.md',
        'squad-implement-worker.md',
        'squad-review.md',
        'squad-deps-worker.md',
        'squad-retro.md',
        'squad-improvement-worker.md',
        'squad-bootstrap.md',
      ]) expect(content).toContain(workflow);
    });

    it('requires the package verifier to validate every shared runtime guard', () => {
      expect(content).toContain('squad-install-verifier.mjs --materialize-runtime');
      expect(content).toContain('--verify-install');
      expect(content).toContain('--source-revision "${SQUAD_SHA}"');
      expect(content).toContain('--strict-compile');
      expect(content).toContain('missing source/lock pair');
      expect(content).toContain('stale source/resource digest');
    });

    it('requires a final strict compile without --approve', () => {
      // The standalone command must appear as its own line (start-of-line in a
      // fenced bash block), not merely as a prose/backtick mention.  The
      // previous lookahead-only regex was flagged by a reviewer as a false
      // positive: the Anti-Patterns prose "finish with a plain `gh aw compile
      // --strict` (no `--approve`)" also matched it.
      //
      // Anchoring with ^, the `m` (multiline) flag, and allowing only an
      // optional trailing # comment means only real command lines satisfy the
      // pattern.  Lines with --approve (L140, L259, L295) do not match because
      // --approve follows --strict before any #.
      expect(content).toMatch(/^gh aw compile --strict(\s+#[^\n]*)?$/m);
    });

    it('permits only the documented bot-trigger warning', () => {
      expect(content).toMatch(/bot-trigger warning|bot trigger/i);
    });

    // The permission above is only safe because it is paired with a hard halt
    // on anything else.  Asserting the allowance alone would keep passing if
    // the STOP were deleted -- i.e. if the narrow exception silently became a
    // blanket "warnings are fine".  Assert the gate itself, not just the
    // carve-out.  Newlines are collapsed first because the sentence wraps.
    it('halts on any error or any warning beyond the documented one', () => {
      const flat = content.replace(/\s+/g, ' ');
      expect(flat).toMatch(
        /\*\*STOP\*\* on any error, or on \*\*any additional warning\*\* beyond that single documented one\./,
      );
    });

    it('keeps the default workflow token read-only', () => {
      expect(content).toContain('default_workflow_permissions=read');
    });

    it('requires GitHub Issues before installation and stops when they cannot be enabled', () => {
      expect(content).toContain('gh api "repos/${owner_repo}" --jq \'.has_issues\'');
      expect(content).toContain(
        'gh api --method PATCH "repos/${owner_repo}"',
      );
      expect(content).toContain('-F has_issues=true --silent');
      expect(content).toContain('requires repository administration permission');
      expect(content).toContain('STOP before branch creation or `gh aw add`');
      expect(content.indexOf("issues_enabled=")).toBeLessThan(content.indexOf('git switch -c'));
      expect(content.indexOf("issues_enabled=")).toBeLessThan(
        content.indexOf('gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"'),
      );
    });

    it('keeps the standalone correct example fail-closed', () => {
      const correctExample = content.slice(content.indexOf('### ✓ Correct:'));
      expect(correctExample).toContain('if ! gh api --method PATCH "repos/${owner_repo}"');
      expect(correctExample).toContain(
        'test "$(gh api "repos/${owner_repo}" --jq \'.has_issues\')" = "true" || {',
      );
      expect(correctExample).toContain('exit 1');
    });

    it('forbids blanket staging and mandates explicit paths', () => {
      expect(content).toMatch(/git add \.|git add -A|git commit -a/); // referenced as an anti-pattern
      expect(content).toContain('git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/');
    });

    it('never auto-merges and defers automatic casting until after the bootstrap PR merges', () => {
      expect(content).toMatch(/auto-?merge/i);
      expect(content).toMatch(/never merge|do not merge|human-reviewed|human approval/i);
      expect(content).toContain('squad-bootstrap');
      expect(content).toContain('[Research Proposals] Agent-discovered repo opportunities');
    });

    it('pins and verifies the package-capable gh-aw compiler', () => {
      expect(content).toContain('gh extension install --force --pin v0.89.21 github/gh-aw');
      expect(content).toContain('gh aw --version');
      expect(content).toContain('PowerShell');
    });

    it('resolves repo identity at runtime (no hardcoded owner/repo placeholder)', () => {
      expect(content).toContain('gh repo view --json nameWithOwner');
      expect(content).toContain('gh repo view --json defaultBranchRef');
    });
  });

  describe('gh-aw bootstrap documentation', () => {
    const guide = readLF(GUIDE);
    const agentGuide = readLF(AGENT_GUIDE);

    it('requires agents to execute the complete quick start through PR creation', () => {
      expect(guide).toContain('**Agent action required:**');
      expect(guide).toContain('the agent must execute this entire block');
      expect(guide).toContain('gh pr create');
      expect(agentGuide).toContain('execute the complete');
      expect(agentGuide).toContain('Do not only quote or run the `gh aw add` command');
    });

    it('resolves the repository dynamically before changing Actions permissions', () => {
      expect(guide).toContain(
        'owner_repo="$(gh repo view --json nameWithOwner --jq \'.nameWithOwner\')"',
      );
      expect(guide).toContain(
        'gh api --method PUT "repos/${owner_repo}/actions/permissions/workflow"',
      );
      expect(guide).not.toContain('repos/{owner}/{repo}/actions/permissions/workflow');
    });

    it('requires Issues before installation and documents the admin-permission stop', () => {
      const issuesCheck = guide.indexOf(
        'issues_enabled="$(gh api "repos/${owner_repo}" --jq \'.has_issues\')"',
      );
      expect(issuesCheck).toBeGreaterThan(-1);
      expect(guide).toContain('-F has_issues=true --silent');
      expect(guide).toContain('requires repository administration permission');
      expect(guide).toContain('do not continue to `gh aw add`');
      expect(issuesCheck).toBeLessThan(guide.indexOf('git switch -c chore/squad-gh-aw-bootstrap'));
      expect(issuesCheck).toBeLessThan(
        guide.indexOf('gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"'),
      );
      expect(agentGuide).toContain('verifies that GitHub Issues are enabled');
      expect(agentGuide).toContain('bootstrap creates a research/proposals issue');
    });

    it('keeps standalone public install snippets behind the Issues guard', () => {
      const readme = readLF('README.md');
      const readmeInstall = readme.slice(readme.indexOf('### Install'));
      expect(readmeInstall.indexOf("issues_enabled=")).toBeGreaterThan(-1);
      expect(readmeInstall.indexOf("issues_enabled=")).toBeLessThan(
        readmeInstall.indexOf('gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"'),
      );
      expect(readmeInstall).toContain(
        'test "$(gh api "repos/${owner_repo}" --jq \'.has_issues\')" = "true" || {',
      );

      const setupSection = guide.slice(
        guide.indexOf('### Enable GitHub Issues'),
        guide.indexOf('### Allow workflow-created pull requests'),
      );
      expect(setupSection).toContain(
        'test "$(gh api "repos/${owner_repo}" --jq \'.has_issues\')" = "true" || {',
      );
    });

    it('activates slash commands only after the bootstrap PR reaches the default branch', () => {
      expect(guide).toContain(
        'Once the bootstrap PR is merged into the default branch, the `/squad` slash',
      );
      expect(guide).toContain('Pushing the bootstrap branch or merely opening the');
      expect(guide).not.toContain('Once pushed, the `/squad` slash command is live');
      expect(agentGuide).toContain(
        '`/squad` slash commands become active only after that merge reaches',
      );
    });

    it('makes public-guide package verification fail fast and coherent', () => {
      expect(guide).toContain('gh aw add "bradygaster/squad/workflows@${SQUAD_SHA}"');
      expect(guide).toContain('squad-install-verifier.mjs --materialize-runtime');
      expect(guide).toContain('--verify-install');
      expect(guide).toContain('--source-revision "${SQUAD_SHA}"');
      expect(guide).toContain('--strict-compile');
      expect(guide).toContain('package ownership metadata');
    });
  });

  describe('template mirror parity', () => {
    for (const mirror of MIRRORS) {
      it(`${mirror} is byte-for-byte identical to the canonical source`, () => {
        expect(existsSync(resolve(ROOT, mirror)), `${mirror} should exist`).toBe(true);
        expect(readFileSync(resolve(ROOT, mirror)).equals(readFileSync(resolve(ROOT, CANONICAL)))).toBe(true);
      });
    }
  });
});
