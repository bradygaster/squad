import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('sandcastle missing');
  }),
}));

import {
  applyPermissionProfileArgs,
  resolveExecutionConfig,
  ExecutionConfigError,
} from '../../packages/squad-cli/src/cli/core/execution-config.js';

describe('execution-config', () => {
  const execFileSyncMock = vi.mocked(execFileSync);

  it('accepts sandcastle when help output matches expected CLI surface', () => {
    execFileSyncMock.mockReturnValueOnce('Usage: sandcastle --prompt <text> [--prompt-file <path>]');

    const result = resolveExecutionConfig({ cliSandbox: 'sandcastle' });

    expect(result.sandbox).toBe('sandcastle');
    expect(result.sandboxSource).toBe('cli');
  });

  it('rejects incompatible sandcastle binaries', () => {
    execFileSyncMock.mockReturnValueOnce('Usage: some-other-sandcastle --version');

    expect(() => resolveExecutionConfig({ cliSandbox: 'sandcastle' })).toThrowError(ExecutionConfigError);
    try {
      resolveExecutionConfig({ cliSandbox: 'sandcastle' });
    } catch (err) {
      const execErr = err as ExecutionConfigError;
      expect(execErr.code).toBe('SQUAD_SANDBOX_UNAVAILABLE');
      expect(execErr.message).toContain('@ai-hero/sandcastle');
    }
  });

  it('resolves defaults when no inputs are provided', () => {
    const result = resolveExecutionConfig({});
    expect(result.sandbox).toBe('copilot');
    expect(result.permissionProfile).toBe('yolo');
    expect(result.sourceOfTruth).toBe('default');
  });

  it('applies precedence CLI > config > env > default', () => {
    const result = resolveExecutionConfig({
      cliSandbox: 'copilot',
      configSandbox: 'sandcastle',
      envSandbox: 'sandcastle',
      cliPermissionProfile: 'autopilot',
      configPermissionProfile: 'interactive',
      envPermissionProfile: 'interactive',
    });

    expect(result.sandbox).toBe('copilot');
    expect(result.sandboxSource).toBe('cli');
    expect(result.permissionProfile).toBe('autopilot');
    expect(result.permissionProfileSource).toBe('cli');
    expect(result.sourceOfTruth).toBe('cli');
  });

  it('throws stable invalid sandbox error code', () => {
    expect(() => resolveExecutionConfig({ cliSandbox: 'bogus' })).toThrowError(ExecutionConfigError);
    try {
      resolveExecutionConfig({ cliSandbox: 'bogus' });
    } catch (err) {
      expect((err as ExecutionConfigError).code).toBe('SQUAD_SANDBOX_INVALID_VALUE');
    }
  });

  it('throws stable invalid permission profile error code', () => {
    expect(() => resolveExecutionConfig({ cliPermissionProfile: 'always-yes' })).toThrowError(ExecutionConfigError);
    try {
      resolveExecutionConfig({ cliPermissionProfile: 'always-yes' });
    } catch (err) {
      expect((err as ExecutionConfigError).code).toBe('SQUAD_PERMISSION_PROFILE_INVALID_VALUE');
    }
  });

  it('throws conflict error when explicit sandbox and agentCmd are both set', () => {
    expect(() => resolveExecutionConfig({
      cliSandbox: 'copilot',
      agentCmd: 'custom-agent --x',
    })).toThrowError(ExecutionConfigError);

    try {
      resolveExecutionConfig({ cliSandbox: 'copilot', agentCmd: 'custom-agent --x' });
    } catch (err) {
      expect((err as ExecutionConfigError).code).toBe('SQUAD_SANDBOX_OVERRIDE_CONFLICT');
    }
  });

  it('normalizes profile flags deterministically', () => {
    const base = ['-p', 'hello', '--yolo', '--autopilot'];
    expect(applyPermissionProfileArgs(base, 'interactive')).toEqual(['-p', 'hello']);
    expect(applyPermissionProfileArgs(base, 'yolo')).toEqual(['-p', 'hello', '--yolo']);
    expect(applyPermissionProfileArgs(base, 'autopilot')).toEqual(['-p', 'hello', '--yolo', '--autopilot']);
  });
});
