/**
 * INSIDER3-INIT-LEAK regression test.
 *
 * Bug: `squad init --state-backend two-layer|orphan` leaves the freshly-init'd
 * mutable state files (decisions.md, agents/<n>/history.md) in the working
 * tree, where they shadow the squad-state orphan branch and bypass the runtime
 * state bridge. The user thinks they have a clean orphan-backed setup; in
 * reality the files leaked into the worktree commit graph.
 *
 * Fix: liftInitMutableStateOntoOrphan() pushes those files onto the squad-state
 * branch and unlinks them from the working tree, preserving static config
 * (team.md, charters, ceremonies.md, casting/*) which legitimately lives on disk.
 *
 * Bug evidence: data-3 baseline — `.squad/files/validation/UPGRADE-PATH-BASELINE-INSIDER3-REPORT.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ensureOrphanBranch,
  liftInitMutableStateOntoOrphan,
} from '../packages/squad-cli/src/cli/commands/migrate-backend.js';

function mkTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-init-leak-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Squad Init Leak Test'], { cwd: dir });
  // Seed a commit so HEAD exists.
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function seedSquadDir(dest: string): void {
  const squadDir = path.join(dest, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'decisions.md'), '# Squad Decisions\n\n## Active Decisions\n\nNo decisions recorded yet.\n');
  // Static files (must NOT be lifted)
  fs.writeFileSync(path.join(squadDir, 'team.md'), '# Squad Team\n');
  fs.writeFileSync(path.join(squadDir, 'ceremonies.md'), '# Ceremonies\n');
  fs.mkdirSync(path.join(squadDir, 'casting'), { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'casting', 'roles.md'), '# Roles\n');
  // Agents — charter (static) + history (mutable)
  const aliceDir = path.join(squadDir, 'agents', 'alice');
  const bobDir = path.join(squadDir, 'agents', 'bob');
  fs.mkdirSync(aliceDir, { recursive: true });
  fs.mkdirSync(bobDir, { recursive: true });
  fs.writeFileSync(path.join(aliceDir, 'charter.md'), '# Alice charter\n');
  fs.writeFileSync(path.join(aliceDir, 'history.md'), '# Alice history\n\nFirst entry\n');
  fs.writeFileSync(path.join(bobDir, 'charter.md'), '# Bob charter\n');
  fs.writeFileSync(path.join(bobDir, 'history.md'), '# Bob history\n');
}

function readBlobAtBranch(dest: string, branch: string, relPath: string): string {
  return execFileSync('git', ['show', `refs/heads/${branch}:${relPath}`], {
    cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('INSIDER3-INIT-LEAK — lift mutable state onto orphan branch after init', () => {
  let dest: string;

  beforeEach(() => { dest = mkTempRepo(); seedSquadDir(dest); ensureOrphanBranch(dest); });
  afterEach(() => { fs.rmSync(dest, { recursive: true, force: true }); });

  it('moves decisions.md + each agent history.md onto squad-state and removes from worktree', () => {
    const lifted = liftInitMutableStateOntoOrphan(dest);

    expect(lifted.sort()).toEqual([
      'agents/alice/history.md',
      'agents/bob/history.md',
      'decisions.md',
    ]);

    // Working tree no longer contains them
    expect(fs.existsSync(path.join(dest, '.squad', 'decisions.md'))).toBe(false);
    expect(fs.existsSync(path.join(dest, '.squad', 'agents', 'alice', 'history.md'))).toBe(false);
    expect(fs.existsSync(path.join(dest, '.squad', 'agents', 'bob', 'history.md'))).toBe(false);

    // Squad-state branch DOES contain them with exact original content
    expect(readBlobAtBranch(dest, 'squad-state', 'decisions.md')).toContain('# Squad Decisions');
    expect(readBlobAtBranch(dest, 'squad-state', 'agents/alice/history.md')).toContain('First entry');
    expect(readBlobAtBranch(dest, 'squad-state', 'agents/bob/history.md')).toContain('# Bob history');
  });

  it('preserves static config files (team.md, charters, ceremonies.md, casting/*) on disk', () => {
    liftInitMutableStateOntoOrphan(dest);

    // Static files must remain on disk — they're not mutable state.
    expect(fs.existsSync(path.join(dest, '.squad', 'team.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.squad', 'ceremonies.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.squad', 'casting', 'roles.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.squad', 'agents', 'alice', 'charter.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.squad', 'agents', 'bob', 'charter.md'))).toBe(true);
  });

  it('returns empty when there is no mutable state to lift', () => {
    // Remove the mutable files first to simulate a no-op call.
    fs.unlinkSync(path.join(dest, '.squad', 'decisions.md'));
    fs.unlinkSync(path.join(dest, '.squad', 'agents', 'alice', 'history.md'));
    fs.unlinkSync(path.join(dest, '.squad', 'agents', 'bob', 'history.md'));

    expect(liftInitMutableStateOntoOrphan(dest)).toEqual([]);
  });
});
