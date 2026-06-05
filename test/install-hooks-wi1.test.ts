/**
 * WI-1 regression test — verifies that two-layer / orphan backends install
 * pre-commit + post-commit hooks (plus the existing sync hooks) and that
 * ensureHooksForBackend re-installs hooks if any required one is missing.
 *
 * Bug evidence: .squad/files/validation/TWOLAYER-BASELINE-INSIDER3-CONSOLIDATED.md
 * - Fresh init two-layer installed pre-push / post-merge / post-rewrite / post-checkout
 *   but NOT pre-commit / post-commit.
 * - Upgrade --state-backend two-layer installed zero hooks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  installGitHooks,
  ensureHooksForBackend,
} from '../packages/squad-cli/src/cli/commands/install-hooks.js';

function mkTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-wi1-'));
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
  // Required minimum git config for commits / hook installs.
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Squad WI-1 Test'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
}

function writeConfig(dir: string, backend: string): void {
  fs.writeFileSync(
    path.join(dir, '.squad', 'config.json'),
    JSON.stringify({ stateBackend: backend }, null, 2),
  );
}

const REQUIRED_HOOKS = [
  'pre-push',
  'post-merge',
  'post-rewrite',
  'post-checkout',
  'pre-commit',
  'post-commit',
];

describe('WI-1: install-hooks installs commit hooks on two-layer / orphan', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkTempRepo();
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('installGitHooks installs ALL required hooks (incl. pre-commit + post-commit) when backend is two-layer', () => {
    writeConfig(dir, 'two-layer');
    installGitHooks(dir, { force: false });

    for (const hook of REQUIRED_HOOKS) {
      const p = path.join(dir, '.git', 'hooks', hook);
      expect(fs.existsSync(p), `hook ${hook} should exist`).toBe(true);
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toContain('squad-sync-hook');
    }
  });

  it('installGitHooks installs ALL required hooks when backend is orphan', () => {
    writeConfig(dir, 'orphan');
    installGitHooks(dir, { force: false });

    for (const hook of REQUIRED_HOOKS) {
      expect(fs.existsSync(path.join(dir, '.git', 'hooks', hook))).toBe(true);
    }
  });

  it('installGitHooks skips hook installation for local backend', () => {
    writeConfig(dir, 'local');
    installGitHooks(dir, { force: false });

    for (const hook of REQUIRED_HOOKS) {
      expect(fs.existsSync(path.join(dir, '.git', 'hooks', hook))).toBe(false);
    }
  });

  it('ensureHooksForBackend reinstalls missing pre-commit / post-commit on existing two-layer repos', () => {
    writeConfig(dir, 'two-layer');
    // Simulate an insider.3-era install: only the four sync hooks present, no commit hooks.
    const hooksDir = path.join(dir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    for (const h of ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout']) {
      fs.writeFileSync(
        path.join(hooksDir, h),
        '#!/bin/sh\n# --- squad-sync-hook ---\nexit 0\n',
        { mode: 0o755 },
      );
    }

    expect(fs.existsSync(path.join(hooksDir, 'pre-commit'))).toBe(false);
    expect(fs.existsSync(path.join(hooksDir, 'post-commit'))).toBe(false);

    ensureHooksForBackend(dir);

    expect(fs.existsSync(path.join(hooksDir, 'pre-commit'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, 'post-commit'))).toBe(true);
  });

  it('pre-commit hook content guards against committing two-layer state into working tree', () => {
    writeConfig(dir, 'two-layer');
    installGitHooks(dir, { force: false });
    const preCommit = fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(preCommit).toContain('decisions');
    expect(preCommit).toContain('agents');
    expect(preCommit).toContain('history');
  });
});
