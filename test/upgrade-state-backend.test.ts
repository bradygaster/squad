/**
 * Regression test for the upgrade state-backend flow:
 *  - UPGRADE-FLAG-IGNORED: `--state-backend` must update config.json without
 *    duplicate keys.
 *  - UPGRADE-NO-MIGRATION: pre-existing `.squad/decisions.md` and agent
 *    histories must be carried onto the squad-state orphan branch.
 *  - WI-1: hook set (incl. pre-commit + post-commit) must be installed after
 *    migration.
 *
 * Evidence:
 * .squad/files/validation/TWOLAYER-BASELINE-INSIDER3-CONSOLIDATED.md (data-5)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { migrateStateBackend } from '../packages/squad-cli/src/cli/commands/migrate-backend.js';

function mkRepo(backend: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-mig-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Squad UpgradeTest'], { cwd: dir });
  // Seed an initial commit so HEAD exists and orphan creation works.
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });

  fs.mkdirSync(path.join(dir, '.squad', 'agents', 'data'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.squad', 'config.json'),
    JSON.stringify({ stateBackend: backend, teamRoot: '.' }, null, 2),
  );
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

describe('squad upgrade --state-backend migration', () => {
  let dir: string;
  afterEach(() => dir && cleanup(dir));

  it('UPGRADE-FLAG-IGNORED: writes stateBackend to config.json with no duplicate keys', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    await migrateStateBackend(dir, 'two-layer');

    const raw = fs.readFileSync(path.join(dir, '.squad', 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.stateBackend).toBe('two-layer');
    // Bug E guard: only one occurrence of "stateBackend" in the raw text.
    const occurrences = (raw.match(/"stateBackend"/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('UPGRADE-FLAG-IGNORED (clean target): writes stateBackend when config.json has no stateBackend field', { timeout: 30_000 }, async () => {
    // Regression for the original bug: an older squad install has config.json
    // with no stateBackend field at all. `squad upgrade --state-backend two-layer`
    // must add the field rather than silently drop it.
    dir = mkRepo('worktree');
    // Remove stateBackend so config only has other fields (e.g. teamRoot).
    const configPath = path.join(dir, '.squad', 'config.json');
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    delete existing['stateBackend'];
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');

    await migrateStateBackend(dir, 'two-layer');

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.stateBackend).toBe('two-layer');
    expect(parsed['teamRoot']).toBe('.');
    const occurrences = (raw.match(/"stateBackend"/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('WI-1: installs commit hooks after backend migration', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    await migrateStateBackend(dir, 'two-layer');

    for (const h of ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout', 'pre-commit', 'post-commit']) {
      expect(fs.existsSync(path.join(dir, '.git', 'hooks', h)), `hook ${h} should exist`).toBe(true);
    }
  });

  it('UPGRADE-NO-MIGRATION: copies decisions.md + agent history.md onto squad-state branch', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    fs.writeFileSync(
      path.join(dir, '.squad', 'decisions.md'),
      '# Squad Decisions\n\n## D1 — pre-upgrade decision\n\nKeep this.\n',
    );
    fs.writeFileSync(
      path.join(dir, '.squad', 'agents', 'data', 'history.md'),
      '# Data history\n\n- entry 1\n',
    );

    await migrateStateBackend(dir, 'two-layer');

    // Verify orphan branch contains the migrated files.
    const decisionsOnBranch = execFileSync(
      'git', ['show', 'refs/heads/squad-state:decisions.md'],
      { cwd: dir, encoding: 'utf-8' },
    );
    expect(decisionsOnBranch).toContain('pre-upgrade decision');

    const historyOnBranch = execFileSync(
      'git', ['show', 'refs/heads/squad-state:agents/data/history.md'],
      { cwd: dir, encoding: 'utf-8' },
    );
    expect(historyOnBranch).toContain('entry 1');
  });

  it('F1 (Round 5): migrated working-tree state files are removed after upgrade', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    fs.writeFileSync(
      path.join(dir, '.squad', 'decisions.md'),
      '# Squad Decisions\n\n## D1 — pre-upgrade decision\n',
    );
    fs.writeFileSync(
      path.join(dir, '.squad', 'agents', 'data', 'history.md'),
      '# Data history\n',
    );
    // A static file that must NOT be touched by the cleanup.
    fs.writeFileSync(
      path.join(dir, '.squad', 'charter.md'),
      '# Charter\nStatic content — do not delete on upgrade.\n',
    );

    await migrateStateBackend(dir, 'two-layer');

    // Working-tree mutable state must be gone (orphan branch is authoritative).
    expect(fs.existsSync(path.join(dir, '.squad', 'decisions.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.squad', 'agents', 'data', 'history.md'))).toBe(false);
    // The now-empty agent directory should also be cleaned up.
    expect(fs.existsSync(path.join(dir, '.squad', 'agents', 'data'))).toBe(false);
    // Static / config files must remain untouched.
    expect(fs.existsSync(path.join(dir, '.squad', 'charter.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.squad', 'config.json'))).toBe(true);
  });

  it('migration is idempotent: re-running with same target does not duplicate config or fail', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    await migrateStateBackend(dir, 'two-layer');
    await migrateStateBackend(dir, 'two-layer'); // no-op path

    const raw = fs.readFileSync(path.join(dir, '.squad', 'config.json'), 'utf-8');
    const occurrences = (raw.match(/"stateBackend"/g) || []).length;
    expect(occurrences).toBe(1);
    expect(JSON.parse(raw).stateBackend).toBe('two-layer');
  });
});
