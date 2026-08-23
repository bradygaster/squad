/**
 * Tests for the shared agent-spawn utilities (issue #994).
 *
 * `buildCopilotCommand()` and the pid-tracking branch of `spawnAgent()`
 * replace logic that used to be duplicated across the `execute` and
 * `wave-dispatch` capabilities — cover them directly here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';

const { mockExecFile, mockFsExistsSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn((...args: unknown[]) => {
    const cb = args.find(a => typeof a === 'function') as
      | ((...cbArgs: unknown[]) => void)
      | undefined;
    if (cb) cb(null, '', '');
    return { pid: 1234, on: vi.fn() };
  }),
  mockFsExistsSync: vi.fn((): boolean => false),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockFsExistsSync,
}));

import { buildCopilotCommand, spawnAgent } from '../../packages/squad-cli/src/cli/commands/watch/agent-spawn.js';

function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: '/fake/team',
    stateRoot: '/fake/team/.squad',
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config: {},
    ...overrides,
  };
}

describe('agent-spawn: buildCopilotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFsExistsSync.mockReturnValue(false);
  });

  it('uses agentCmd override and skips MCP injection', () => {
    const ctx = makeContext({ agentCmd: 'my-agent --flag' });
    const { cmd, args } = buildCopilotCommand('hello', ctx);
    expect(cmd).toBe('my-agent');
    expect(args).toEqual(['--flag', '-p', 'hello']);
  });

  it('defaults to the bare copilot binary and appends copilotFlags', () => {
    const ctx = makeContext({ copilotFlags: '--foo' });
    const { cmd, args } = buildCopilotCommand('hello', ctx);
    expect(cmd).toBe('copilot');
    expect(args).toEqual(['-p', 'hello', '--foo']);
  });

  it('injects --additional-mcp-config/--yolo when .mcp.json exists at teamRoot', () => {
    mockFsExistsSync.mockReturnValue(true);
    const ctx = makeContext({ teamRoot: '/repo' });
    const { cmd, args } = buildCopilotCommand('hello', ctx);
    expect(cmd).toBe('copilot');
    expect(args[0]).toBe('--yolo');
    expect(args).toContain('--additional-mcp-config');
    expect(args).toContain('-p');
    expect(args).toContain('hello');
  });
});

describe('agent-spawn: spawnAgent pid tracking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tracks and untracks the child pid when pidTracking is provided', async () => {
    let exitHandler: (() => void) | undefined;
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args.find(a => typeof a === 'function') as
        | ((...cbArgs: unknown[]) => void)
        | undefined;
      if (cb) cb(null, '', '');
      return {
        pid: 4242,
        on: (event: string, handler: () => void) => {
          if (event === 'exit') exitHandler = handler;
        },
      };
    });
    const track = vi.fn();
    const untrack = vi.fn();

    const result = await spawnAgent('copilot', ['-p', 'x'], '/repo', 1000, {
      tracker: { track, untrack },
      label: 'copilot-session-#1',
    });

    expect(result.success).toBe(true);
    expect(track).toHaveBeenCalledWith(4242, 'copilot-session-#1');
    expect(untrack).not.toHaveBeenCalled();
    exitHandler?.();
    expect(untrack).toHaveBeenCalledWith(4242);
  });

  it('does not touch a tracker when pidTracking is omitted', async () => {
    const result = await spawnAgent('copilot', ['-p', 'x'], '/repo', 1000);
    expect(result.success).toBe(true);
  });
});
