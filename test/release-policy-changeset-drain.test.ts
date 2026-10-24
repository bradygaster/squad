/**
 * Policy gate `changeset-drain` is event-aware:
 *  - release path (`--mode=release`, squad-release-verify.yml called from squad-release.yml):
 *    any pending `.changeset/*.md` fragment FAILS the gate (drain enforced);
 *  - pull_request (`--mode=ci`): pending fragments are expected and PASS as long as they are
 *    well-formed (allowlisted package, patch|minor|major, non-empty summary); malformed ones FAIL.
 * The workflow must pick the mode from the triggering event, never hard-code release mode.
 */
import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPendingChangesets, runPolicyGates, validateChangeset } from '../scripts/release/policy-gates.mjs';

const ROOT = process.cwd();

/** Minimal copy of the files runPolicyGates reads, with the given changeset fragments. */
function fixtureRoot(changesets: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-policy-gate-'));
  for (const rel of ['package.json', 'package-lock.json', 'packages/squad-sdk/package.json', 'packages/squad-cli/package.json', 'CHANGELOG.md', 'docs/src/content/docs/whatsnew.md']) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    cpSync(join(ROOT, rel), join(dir, rel));
  }
  cpSync(join(ROOT, '.github', 'workflows'), join(dir, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(dir, '.changeset'));
  writeFileSync(join(dir, '.changeset', 'README.md'), '# changesets\n');
  for (const [name, body] of Object.entries(changesets)) writeFileSync(join(dir, '.changeset', name), body);
  return dir;
}

const GOOD = '---\n"@bradygaster/squad-cli": patch\n---\n\nFix the thing.\n';
const GOOD_TWO = '---\n"@bradygaster/squad-sdk": minor\n"@bradygaster/squad-cli": patch\n---\n\nAdd a thing.\n';
const drain = (root: string, mode: 'ci' | 'release') => runPolicyGates({ root, mode }).gates.find((g) => g.id === 'changeset-drain')!;

describe('policy gate changeset-drain is branch/event-aware', () => {
  it('release mode fails when any changeset is pending and passes when drained', () => {
    const pending = fixtureRoot({ 'fix-a.md': GOOD });
    const drained = fixtureRoot({});
    try {
      expect(drain(pending, 'release')).toMatchObject({ ok: false, detail: 'pending changesets: fix-a.md' });
      expect(drain(drained, 'release')).toMatchObject({ ok: true, detail: 'no pending changeset fragments' });
    } finally {
      rmSync(pending, { recursive: true, force: true });
      rmSync(drained, { recursive: true, force: true });
    }
  });

  it('ci (pull_request) mode passes with well-formed pending changesets and still reports the gate', () => {
    const root = fixtureRoot({ 'fix-a.md': GOOD, 'feat-b.md': GOOD_TWO });
    try {
      const gate = drain(root, 'ci');
      expect(gate.ok).toBe(true);
      expect(gate.detail).toBe('2 pending changesets allowed in ci mode (drain is enforced on the release path)');
      expect(listPendingChangesets(root)).toEqual(['feat-b.md', 'fix-a.md']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ci mode fails malformed changesets: missing frontmatter, unknown package, bad bump, empty summary', () => {
    const root = fixtureRoot({
      'no-frontmatter.md': 'Just prose.\n',
      'wrong-pkg.md': '---\n"@bradygaster/create-squad": patch\n---\n\nx\n',
      'bad-bump.md': '---\n"@bradygaster/squad-cli": huge\n---\n\nx\n',
      'empty.md': '---\n"@bradygaster/squad-cli": patch\n---\n\n   \n',
    });
    try {
      const gate = drain(root, 'ci');
      expect(gate.ok).toBe(false);
      expect(gate.detail).toContain('no-frontmatter.md: missing frontmatter block');
      expect(gate.detail).toContain("wrong-pkg.md: package '@bradygaster/create-squad' is not publishable");
      expect(gate.detail).toContain("bad-bump.md: bump 'huge' for @bradygaster/squad-cli is not patch|minor|major");
      expect(gate.detail).toContain('empty.md: empty summary');
      expect(validateChangeset(root, 'no-frontmatter.md')).toEqual(['missing frontmatter block (--- ... ---)']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the changesets pending in this tree are well-formed (ci mode passes here)', () => {
    for (const f of listPendingChangesets(ROOT)) expect(validateChangeset(ROOT, f), f).toEqual([]);
    expect(drain(ROOT, 'ci').ok).toBe(true);
  });

  it('squad-release-verify.yml derives the mode from the event instead of hard-coding release', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'squad-release-verify.yml'), 'utf8');
    expect(wf).toMatch(/POLICY_MODE: \$\{\{ github\.event_name == 'pull_request' && 'ci' \|\| 'release' \}\}/);
    expect(wf).toMatch(/policy-gates\.mjs "--mode=\$POLICY_MODE"/);
    expect(wf).not.toMatch(/policy-gates\.mjs --mode=release/);
  });
});
