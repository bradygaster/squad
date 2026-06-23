/**
 * NotesPromoteCapability — Ralph heartbeat integration test (Round 5, P0.3 A3 path B).
 *
 * Verifies the watch capability:
 *   - Skips cleanly when the backend is not two-layer.
 *   - Promotes flagged squad notes when running on a two-layer repo.
 *   - Is idempotent (subsequent rounds find nothing to promote).
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NotesPromoteCapability } from '../packages/squad-cli/src/cli/commands/watch/capabilities/notes-promote.js';
import type { WatchContext } from '../packages/squad-cli/src/cli/commands/watch/types.js';

function mkRepo(backend: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-cap-promote-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Squad CapTest'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.squad', 'config.json'),
    JSON.stringify({ stateBackend: backend, teamRoot: '.' }, null, 2),
  );
  return dir;
}

function makeContext(teamRoot: string, round = 1, config: Record<string, unknown> = {}): WatchContext {
  return {
    teamRoot,
    adapter: {} as WatchContext['adapter'],
    round,
    roster: [],
    config,
  };
}

describe('NotesPromoteCapability', () => {
  let dir = '';
  afterEach(() => {
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    dir = '';
  });

  const cap = new NotesPromoteCapability();

  it('has expected metadata', () => {
    expect(cap.name).toBe('notes-promote');
    expect(cap.phase).toBe('housekeeping');
    expect(cap.configShape).toBe('object');
  });

  it('preflight fails when backend is not two-layer', { timeout: 30_000 }, async () => {
    dir = mkRepo('worktree');
    const result = await cap.preflight(makeContext(dir));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not 'two-layer'");
  });

  it('preflight succeeds on a two-layer repo', { timeout: 30_000 }, async () => {
    dir = mkRepo('two-layer');
    const result = await cap.preflight(makeContext(dir));
    expect(result.ok).toBe(true);
  });

  it('execute promotes flagged notes on a two-layer repo', { timeout: 30_000 }, async () => {
    dir = mkRepo('two-layer');
    execFileSync(
      'git', ['notes', '--ref=squad/picard', 'add', '-f', '-m',
        JSON.stringify({ promote_to_permanent: true, decision: 'D1' }), 'HEAD'],
      { cwd: dir },
    );

    const result = await cap.execute(makeContext(dir));
    expect(result.success).toBe(true);
    expect(result.summary).toMatch(/promoted=1/);
    expect((result.data as { promoted: number }).promoted).toBe(1);

    // Second run: nothing left — idempotent.
    const again = await cap.execute(makeContext(dir));
    expect(again.success).toBe(true);
    expect((again.data as { promoted: number }).promoted).toBe(0);
  });

  it('respects everyNRounds throttle', { timeout: 30_000 }, async () => {
    dir = mkRepo('two-layer');
    // round=2 with everyNRounds=5 → skipped.
    const result = await cap.execute(makeContext(dir, 2, { everyNRounds: 5 }));
    expect(result.summary).toContain('skipped');
  });
});
