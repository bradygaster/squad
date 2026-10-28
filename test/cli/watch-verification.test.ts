import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunProcessTreeCommand } = vi.hoisted(() => ({
  mockRunProcessTreeCommand: vi.fn(),
}));

vi.mock('../../packages/squad-cli/src/cli/commands/watch/agent-spawn.js', () => ({
  runProcessTreeCommand: mockRunProcessTreeCommand,
}));

import {
  resolveVerificationCommands,
  VerificationCapability,
} from '../../packages/squad-cli/src/cli/commands/watch/capabilities/verification.js';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';

function makeContext(config: Record<string, unknown> = {}): WatchContext {
  return {
    teamRoot: '/repo',
    stateRoot: '/repo/.squad',
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config,
  };
}

describe('watch verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunProcessTreeCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      timedOut: false,
      cancelled: false,
    });
  });

  it('requires explicit commands instead of reading scripts from the working tree', () => {
    expect(resolveVerificationCommands({})).toMatchObject({
      error: expect.stringContaining('watch.verify.commands'),
    });
    expect(resolveVerificationCommands({ commands: ['npm run build', 'npm test'] })).toEqual({
      commands: ['npm run build', 'npm test'],
    });
  });

  it('rejects empty or invalid command lists', () => {
    expect(resolveVerificationCommands({ commands: [] })).toMatchObject({ error: expect.any(String) });
    expect(resolveVerificationCommands({ commands: ['npm test', '  '] })).toMatchObject({ error: expect.any(String) });
    expect(resolveVerificationCommands({ commands: ['npm test', 5] })).toMatchObject({ error: expect.any(String) });
  });

  it('warns once that configured commands run with watch permissions', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const capability = new VerificationCapability();
    const context = makeContext({ commands: ['npm test'] });

    await capability.preflight(context);
    await capability.execute(context);

    expect(log.mock.calls.flat().join(' ')).toContain('SECURITY');
    expect(log.mock.calls.flat().join(' ')).toContain('permissions and environment');
    expect(log).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });

  it('runs configured checks sequentially and stops on the first failure', async () => {
    mockRunProcessTreeCommand.mockImplementation(async (shell: string, args: string[]) => {
      const command = process.platform === 'win32' ? shell : args.at(-1);
      if (command === 'npm test') {
        return { error: new Error('exit 1'), stdout: '', stderr: 'test failed', timedOut: false, cancelled: false };
      }
      return { stdout: '', stderr: '', timedOut: false, cancelled: false };
    });

    const result = await new VerificationCapability().execute(makeContext({
      commands: ['npm run build', 'npm test', 'npm run lint'],
    }));

    const expectedCommand = process.platform === 'win32' ? 'npm run build' : '/bin/sh';
    const expectedArgs = process.platform === 'win32' ? [] : ['-c', 'npm run build'];
    expect(mockRunProcessTreeCommand.mock.calls.map(call => process.platform === 'win32' ? call[0] : call[1].at(-1)))
      .toEqual(process.platform === 'win32' ? ['npm run build', 'npm test'] : ['npm run build', 'npm test']);
    expect(mockRunProcessTreeCommand.mock.calls[0]?.[0]).toBe(expectedCommand);
    expect(mockRunProcessTreeCommand.mock.calls[0]?.[1]).toEqual(expectedArgs);
    expect(mockRunProcessTreeCommand.mock.calls[0]?.[2]).toMatchObject({ cwd: '/repo', shell: process.platform === 'win32' });
    expect(result).toMatchObject({ success: false, data: { failedCommand: 'npm test', checks: 3 } });
    expect(result.summary).toContain('test failed');
  });

  it('reports process-tree timeouts as failed verification', async () => {
    mockRunProcessTreeCommand.mockResolvedValue({
      error: new Error('killed'),
      stdout: '',
      stderr: '',
      timedOut: true,
      cancelled: false,
    });

    const result = await new VerificationCapability().execute(makeContext({
      commands: ['npm test'],
      timeout: 1,
    }));

    expect(mockRunProcessTreeCommand.mock.calls[0]?.[2]).toMatchObject({ timeoutMs: 60_000, shell: process.platform === 'win32' });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Timed out after 60s');
  });
});
