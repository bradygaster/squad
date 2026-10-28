import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExec, mockReadFile } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({ exec: mockExec }));
vi.mock('node:fs', () => ({ readFileSync: mockReadFile }));

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
    mockReadFile.mockReturnValue(JSON.stringify({
      scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .' },
    }));
    mockExec.mockImplementation((_command: string, _options: unknown, callback: (...args: unknown[]) => void) => {
      callback(null, '', '');
      return {};
    });
  });

  it('detects build, test, and lint scripts in order', () => {
    expect(resolveVerificationCommands('/repo', {})).toEqual({
      commands: ['npm run build', 'npm run test', 'npm run lint'],
    });
  });

  it('uses explicitly configured commands instead of package scripts', () => {
    expect(resolveVerificationCommands('/repo', { commands: ['make check'] })).toEqual({
      commands: ['make check'],
    });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('fails clearly when no standard scripts are available', () => {
    mockReadFile.mockReturnValue(JSON.stringify({ scripts: { start: 'node app.js' } }));
    expect(resolveVerificationCommands('/repo', {})).toMatchObject({ error: expect.stringContaining('no build, test, or lint scripts') });
  });

  it('runs checks sequentially and stops on the first failure', async () => {
    mockExec.mockImplementation((command: string, _options: unknown, callback: (...args: unknown[]) => void) => {
      if (command === 'npm run test') callback(new Error('exit 1'), '', 'test failed');
      else callback(null, '', '');
      return {};
    });

    const result = await new VerificationCapability().execute(makeContext({
      commands: ['npm run build', 'npm run test', 'npm run lint'],
    }));

    expect(mockExec.mock.calls.map(call => call[0])).toEqual(['npm run build', 'npm run test']);
    expect(result).toMatchObject({ success: false, data: { failedCommand: 'npm run test', checks: 3 } });
    expect(result.summary).toContain('test failed');
  });

});
