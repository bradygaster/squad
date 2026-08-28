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

    it('declares a triggers block', () => {
      expect(content).toMatch(/^triggers:/m);
    });

    // The three trigger phrases the skill must be discoverable by.
    for (const phrase of [
      'set up Squad agentic workflows',
      'enlist this repo in Squad',
      'install Squad gh-aw workflows',
    ]) {
      it(`is discoverable by "${phrase}"`, () => {
        expect(content).toContain(phrase);
      });
    }
  });

  describe('safety gates encoded in the body', () => {
    const content = readLF(CANONICAL);

    it('allowlists ONLY the two documented secrets', () => {
      expect(content).toContain('SQUAD_GITHUB_APP_PRIVATE_KEY');
      expect(content).toContain('SQUAD_GITHUB_TOKEN');
    });

    it('allowlists the documented squad-init action', () => {
      expect(content).toContain('bradygaster/squad/.github/actions/squad-init');
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
