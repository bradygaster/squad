/**
 * Tests for BoardCapability — covers `--owner` propagation so org-owned
 * ProjectV2 boards work (not just `@me` personal projects).
 *
 * Closes #1079
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ExecFileCall {
  cmd: string;
  args: readonly string[];
}

const cpMocks = vi.hoisted(() => {
  const calls: ExecFileCall[] = [];
  // promisify(execFile) uses util.promisify.custom — without that symbol,
  // promisify falls back to (err, value) → resolve(value). Shape the value
  // as { stdout, stderr } so destructuring in the capability still works.
  type ExecCb = (err: Error | null, value: { stdout: string; stderr: string }) => void;
  return {
    calls,
    execFile: vi.fn((cmd: string, args: readonly string[], ...rest: unknown[]) => {
      calls.push({ cmd, args });
      const cb = rest[rest.length - 1] as ExecCb | undefined;
      if (typeof cb === 'function') {
        cb(null, { stdout: JSON.stringify({ items: [] }), stderr: '' });
      }
    }),
    execFileSync: vi.fn(() => 'owner/repo'),
  };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, execFile: cpMocks.execFile, execFileSync: cpMocks.execFileSync };
});

import { BoardCapability } from '../packages/squad-cli/src/cli/commands/watch/capabilities/board.js';
import type { WatchContext } from '../packages/squad-cli/src/cli/commands/watch/types.js';

function makeContext(config: Record<string, unknown>): WatchContext {
  return {
    teamRoot: '/tmp/team',
    // The capability never touches the adapter — only `config`.
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config,
  };
}

beforeEach(() => {
  cpMocks.calls.length = 0;
  cpMocks.execFile.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BoardCapability owner config', () => {
  it('passes a configured owner through to gh project item-list', async () => {
    const cap = new BoardCapability();
    const result = await cap.execute(makeContext({ projectNumber: 22, owner: 'my-org' }));

    expect(result.success).toBe(true);

    const itemList = cpMocks.calls.find(
      (c) => c.cmd === 'gh' && c.args[0] === 'project' && c.args[1] === 'item-list',
    );
    expect(itemList).toBeDefined();
    const ownerIdx = itemList!.args.indexOf('--owner');
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(itemList!.args[ownerIdx + 1]).toBe('my-org');
    // Project number should also be respected
    expect(itemList!.args[2]).toBe('22');
  });

  it('defaults owner to @me when none is configured', async () => {
    const cap = new BoardCapability();
    await cap.execute(makeContext({ projectNumber: 1 }));

    const itemList = cpMocks.calls.find(
      (c) => c.cmd === 'gh' && c.args[0] === 'project' && c.args[1] === 'item-list',
    );
    expect(itemList).toBeDefined();
    const ownerIdx = itemList!.args.indexOf('--owner');
    expect(itemList!.args[ownerIdx + 1]).toBe('@me');
  });
});
