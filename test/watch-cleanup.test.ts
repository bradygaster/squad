import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), `squad-cleanup-test-${Date.now()}`);
const SQUAD_DIR = path.join(TEST_ROOT, '.squad');

// We test the CleanupCapability by importing it directly
// (vitest resolves workspace paths, but we import from relative source)
import { CleanupCapability } from '../packages/squad-cli/src/cli/commands/watch/capabilities/cleanup.js';
import type { WatchContext } from '../packages/squad-cli/src/cli/commands/watch/types.js';

function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: TEST_ROOT,
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config: {},
    ...overrides,
  };
}

function writeFile(relativePath: string, content: string = ''): void {
  const full = path.join(TEST_ROOT, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  mkdirSync(SQUAD_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('CleanupCapability', () => {
  const cap = new CleanupCapability();

  it('has correct metadata', () => {
    expect(cap.name).toBe('cleanup');
    expect(cap.phase).toBe('housekeeping');
    expect(cap.configShape).toBe('object');
  });

  it('preflight succeeds when .squad/ exists', async () => {
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(true);
  });

  it('preflight fails when .squad/ is missing', async () => {
    rmSync(SQUAD_DIR, { recursive: true, force: true });
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(false);
  });

  it('clears all files in .squad/.scratch/', async () => {
    writeFile('.squad/.scratch/prompt-123.txt', 'hello');
    writeFile('.squad/.scratch/msg-456.tmp', 'world');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('scratch: 2 files cleared');
    expect(readdirSync(path.join(SQUAD_DIR, '.scratch'))).toHaveLength(0);
  });

  it('archives old orchestration-log entries', async () => {
    // Old file (date in filename older than 30 days)
    writeFile('.squad/orchestration-log/2025-01-01T00-00-00Z-agent.md', 'old');
    // Recent file (today)
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.squad/orchestration-log/${today}T12-00-00Z-agent.md`, 'recent');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('orchestration-log: 1 entries pruned');
    // Recent file should still exist
    const remaining = readdirSync(path.join(SQUAD_DIR, 'orchestration-log'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain(today);
  });

  it('archives old session log entries', async () => {
    writeFile('.squad/log/2025-02-15T10-00-00Z-session.md', 'old session');
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.squad/log/${today}T08-00-00Z-session.md`, 'fresh');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('log: 1 entries pruned');
  });

  it('warns about stale inbox files (>7 days)', async () => {
    writeFile('.squad/decisions/inbox/2025-03-01-old-decision.md', 'stale');
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.squad/decisions/inbox/${today}-fresh-decision.md`, 'fresh');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('stale inbox files');
  });

  it('skips cleanup on non-matching rounds', async () => {
    writeFile('.squad/.scratch/should-survive.txt', 'data');
    // everyNRounds defaults to 10; round 5 should skip
    const result = await cap.execute(makeContext({ round: 5, config: {} }));
    expect(result.success).toBe(true);
    expect(result.summary).toContain('skipped');
    expect(existsSync(path.join(SQUAD_DIR, '.scratch', 'should-survive.txt'))).toBe(true);
  });

  it('runs on round 10 (every 10th round)', async () => {
    writeFile('.squad/.scratch/temp.txt', 'data');
    const result = await cap.execute(makeContext({ round: 10 }));
    expect(result.success).toBe(true);
    expect(result.summary).not.toContain('skipped');
  });

  it('always runs on round 1', async () => {
    writeFile('.squad/.scratch/temp.txt', 'data');
    const result = await cap.execute(makeContext({ round: 1 }));
    expect(result.success).toBe(true);
    expect(result.summary).toContain('scratch: 1 files cleared');
  });

  it('respects custom everyNRounds config', async () => {
    writeFile('.squad/.scratch/temp.txt', 'data');
    // Custom config: every 3 rounds
    const result = await cap.execute(makeContext({ round: 3, config: { everyNRounds: 3 } }));
    expect(result.success).toBe(true);
    expect(result.summary).not.toContain('skipped');
  });

  it('reports nothing to do when all clean', async () => {
    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toBe('cleanup: nothing to do');
  });
});
