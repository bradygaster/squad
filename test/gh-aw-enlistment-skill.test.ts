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

const CANONICAL = `.squad/skills/${SKILL_ID}/SKILL.md`;
const MIRRORS = [
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

    it('installs all four @dev workflows', () => {
      for (const wf of [
        'squad.md@dev',
        'squad-implement-worker.md@dev',
        'squad-deps-worker.md@dev',
        'squad-review.md@dev',
      ]) {
        expect(content, `should install ${wf}`).toContain(wf);
      }
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

    it('forbids blanket staging and mandates explicit paths', () => {
      expect(content).toMatch(/git add \.|git add -A|git commit -a/); // referenced as an anti-pattern
      expect(content).toContain('git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/');
    });

    it('never auto-merges and defers casting to after the bootstrap PR merges', () => {
      expect(content).toMatch(/auto-?merge/i);
      expect(content).toMatch(/never merge|do not merge|human-reviewed|human approval/i);
      expect(content).toMatch(/\/squad cast/);
    });

    it("documents extension check in both bash (grep -q) and PowerShell (Select-String guarding gh-aw install) forms", () => {
      // Regression guard for Change B: the portability note must stay in the
      // skill so Windows users are not silently left with a bash-only check.
      expect(content, "bash form 'grep -q' must be present").toContain("grep -q 'github/gh-aw'");
      // The PowerShell check must bind Select-String to the 'github/gh-aw'
      // pattern AND guard an install — a bare Select-String anywhere is too loose.
      // Allows for Markdown blockquote wrapping (leading '>') and line-wrapping
      // (the install half may continue on the same or a wrapped line).
      expect(content, "PowerShell form must bind Select-String to 'github/gh-aw' and guard an install").toMatch(
        /Select-String\s+-Quiet\s+'github\/gh-aw'.*gh extension install github\/gh-aw/s
      );
    });

    it('resolves repo identity at runtime (no hardcoded owner/repo placeholder)', () => {
      expect(content).toContain('gh repo view --json nameWithOwner');
      expect(content).toContain('gh repo view --json defaultBranchRef');
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
