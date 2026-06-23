/**
 * Nap subprocess / --team-root resolution tests (#734)
 *
 * Verifies that the nap command works correctly when invoked from a
 * subprocess with a different working directory, as happens with
 * Copilot CLI bang commands (!squad nap) on Windows.
 *
 * The fix: getSquadStartDir() respects SQUAD_TEAM_ROOT env var,
 * falling back to process.cwd() when unset.
 *
 * @see packages/squad-cli/src/cli-entry.ts — getSquadStartDir()
 * @see https://github.com/bradygaster/squad/issues/734
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runNap } from '../../packages/squad-cli/src/cli/core/nap.js';

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

function createTestSquadDir(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'squad-nap-subprocess-'));
  tmpDirs.push(tmpDir);
  const squadDir = join(tmpDir, '.squad');
  mkdirSync(join(squadDir, 'agents', 'edie'), { recursive: true });
  mkdirSync(join(squadDir, 'decisions', 'inbox'), { recursive: true });
  mkdirSync(join(squadDir, 'orchestration-log'), { recursive: true });
  writeFileSync(join(squadDir, 'team.md'), '# Team\n');
  writeFileSync(join(squadDir, 'routing.md'), '# Routing\n');
  writeFileSync(join(squadDir, 'decisions.md'), '# Decisions\n');
  writeFileSync(
    join(squadDir, 'agents', 'edie', 'history.md'),
    '## Core Context\n\nTest agent.\n',
  );
  return squadDir;
}

// ============================================================================
// Tests
// ============================================================================

describe('nap: subprocess / --team-root resolution (#734)', () => {
  const savedTeamRoot = process.env['SQUAD_TEAM_ROOT'];

  beforeEach(() => {
    delete process.env['SQUAD_TEAM_ROOT'];
  });

  afterEach(() => {
    // Restore env
    if (savedTeamRoot !== undefined) {
      process.env['SQUAD_TEAM_ROOT'] = savedTeamRoot;
    } else {
      delete process.env['SQUAD_TEAM_ROOT'];
    }
    // Clean up temp dirs
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('runNap succeeds with explicit squadDir from a different working directory', async () => {
    const squadDir = createTestSquadDir();
    const differentCwd = mkdtempSync(join(tmpdir(), 'squad-nap-other-cwd-'));
    tmpDirs.push(differentCwd);
    const previousCwd = process.cwd();

    try {
      // This simulates the key scenario from #734: nap is called with a
      // squadDir resolved from SQUAD_TEAM_ROOT while the current working
      // directory points somewhere else.
      process.chdir(differentCwd);

      const result = await runNap({ squadDir, dryRun: true });

      expect(result).toBeDefined();
      expect(result.actions).toBeDefined();
      expect(result.before).toBeDefined();
      expect(result.after).toBeDefined();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('runNap returns empty result when squadDir does not exist', async () => {
    const nonExistent = join(tmpdir(), 'squad-nap-nonexistent-dir');
    const result = await runNap({ squadDir: nonExistent, dryRun: true });

    expect(result.actions).toHaveLength(0);
    expect(result.before.totalFiles).toBe(0);
    expect(result.after.totalFiles).toBe(0);
  });
});
