/**
 * squad notes promote — CLI test (Round 5, P0.3 A3 production caller).
 *
 * Verifies the `squad notes promote` command actually invokes
 * TwoLayerBackend.promoteNotes against `refs/notes/squad/*` refs in a real
 * git repo. Pre-Round 5 the SDK API had zero production callers (commit
 * aaec183f). This test guarantees that regression cannot recur silently.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runNotesPromote } from '../../packages/squad-cli/src/cli/commands/notes.js';
import { TwoLayerBackend } from '../../packages/squad-sdk/src/state-backend.js';

function mkRepo(): { dir: string; squadDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-notes-promote-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Squad NotesTest'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });

  const squadDir = path.join(dir, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(
    path.join(squadDir, 'config.json'),
    JSON.stringify({ stateBackend: 'two-layer', teamRoot: '.' }, null, 2),
  );
  return { dir, squadDir };
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/** Get current HEAD sha. */
function headSha(dir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
}

/** Attach a JSON note on HEAD under refs/notes/squad/<agent>. */
function addSquadNote(dir: string, agent: string, payload: Record<string, unknown>): void {
  const ref = `squad/${agent}`;
  execFileSync(
    'git',
    ['notes', `--ref=${ref}`, 'add', '-f', '-m', JSON.stringify(payload), 'HEAD'],
    { cwd: dir },
  );
}

/** True if `refs/notes/squad/<agent>` has any note on HEAD. */
function hasNote(dir: string, agent: string): boolean {
  try {
    execFileSync(
      'git', ['notes', `--ref=squad/${agent}`, 'show', 'HEAD'],
      { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return true;
  } catch { return false; }
}

describe('squad notes promote', () => {
  let dir = '';
  afterEach(() => { if (dir) cleanup(dir); dir = ''; });

  it('is a no-op when stateBackend is not two-layer', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    // Downgrade config to worktree.
    fs.writeFileSync(
      path.join(repo.squadDir, 'config.json'),
      JSON.stringify({ stateBackend: 'worktree', teamRoot: '.' }, null, 2),
    );
    const code = await runNotesPromote(dir, []);
    expect(code).toBe(0);
  });

  it('returns 0 with no squad notes refs present', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    const code = await runNotesPromote(dir, []);
    expect(code).toBe(0);
  });

  it('promotes flagged notes to permanent orphan storage and removes the source note', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'picard', {
      promote_to_permanent: true,
      decision: 'D1 — adopt two-layer backend',
    });
    expect(hasNote(dir, 'picard')).toBe(true);

    const code = await runNotesPromote(dir, []);
    expect(code).toBe(0);

    // Source note removed.
    expect(hasNote(dir, 'picard')).toBe(false);

    // Permanent copy written to orphan branch under promoted/.
    const sha = headSha(dir);
    const promotedPath = `promoted/squad/picard/${sha}.json`;
    const onBranch = execFileSync(
      'git', ['show', `refs/heads/squad-state:${promotedPath}`],
      { cwd: dir, encoding: 'utf-8' },
    );
    expect(onBranch).toContain('D1 — adopt two-layer backend');
  });

  it('archives flagged notes but keeps the source note', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'data', {
      archive_on_close: true,
      observation: 'B1 ENOBUFS edge case',
    });

    const code = await runNotesPromote(dir, []);
    expect(code).toBe(0);

    expect(hasNote(dir, 'data')).toBe(true); // archive = copy

    const sha = headSha(dir);
    const archivedPath = `archive/squad/data/${sha}.json`;
    const onBranch = execFileSync(
      'git', ['show', `refs/heads/squad-state:${archivedPath}`],
      { cwd: dir, encoding: 'utf-8' },
    );
    expect(onBranch).toContain('B1 ENOBUFS edge case');
  });

  it('is idempotent — second run finds nothing to promote', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'picard', { promote_to_permanent: true, decision: 'D2' });

    expect(await runNotesPromote(dir, [])).toBe(0);
    // Second invocation must succeed and be a no-op.
    expect(await runNotesPromote(dir, [])).toBe(0);
  });

  it('--ref restricts promotion to a single ref', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'picard', { promote_to_permanent: true, decision: 'pic' });
    addSquadNote(dir, 'data', { promote_to_permanent: true, decision: 'dat' });

    const code = await runNotesPromote(dir, ['--ref', 'squad/picard']);
    expect(code).toBe(0);

    // picard's note was promoted, data's was left alone.
    expect(hasNote(dir, 'picard')).toBe(false);
    expect(hasNote(dir, 'data')).toBe(true);
  });

  it('--dry-run reports work without writing or removing notes', { timeout: 30_000 }, async () => {
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'picard', { promote_to_permanent: true, decision: 'D3' });

    const code = await runNotesPromote(dir, ['--dry-run']);
    expect(code).toBe(0);

    // Note still in place.
    expect(hasNote(dir, 'picard')).toBe(true);
    // Orphan branch must not contain a promoted entry yet.
    const sha = headSha(dir);
    expect(() => execFileSync(
      'git', ['show', `refs/heads/squad-state:promoted/squad/picard/${sha}.json`],
      { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] },
    )).toThrow();
  });

  it('directly drives TwoLayerBackend.promoteNotes (smoke check)', { timeout: 30_000 }, async () => {
    // Belt-and-braces: even bypassing the CLI surface, the SDK API behaves as advertised.
    const repo = mkRepo();
    dir = repo.dir;
    addSquadNote(dir, 'picard', { promote_to_permanent: true, x: 1 });
    addSquadNote(dir, 'data', { archive_on_close: true, y: 2 });

    const backend = new TwoLayerBackend(dir);
    const r1 = backend.promoteNotes('squad/picard');
    expect(r1.promoted.length).toBe(1);
    expect(r1.archived.length).toBe(0);

    const r2 = backend.promoteNotes('squad/data');
    expect(r2.promoted.length).toBe(0);
    expect(r2.archived.length).toBe(1);
  });
});
