import { describe, it, expect } from 'vitest';
import { buildSandboxCommand } from '../../packages/squad-cli/src/cli/commands/sandbox-command.js';

describe('sandbox-command', () => {
  it('builds sandcastle command with sandbox flags', () => {
    const result = buildSandboxCommand({
      sandbox: 'sandcastle',
      sandboxFlags: '--isolation strict --trace',
      permissionProfile: 'autopilot',
      baseArgs: ['-p', 'hello'],
    });

    expect(result.cmd).toBe('sandcastle');
    expect(result.args).toEqual([
      '--isolation', 'strict', '--trace', '-p', 'hello', '--yolo', '--autopilot',
    ]);
  });

  it('builds copilot command and normalizes permission flags', () => {
    const result = buildSandboxCommand({
      sandbox: 'copilot',
      permissionProfile: 'interactive',
      baseArgs: ['-p', 'hello', '--yolo', '--autopilot'],
    });

    expect(result.cmd).toBe('copilot');
    expect(result.args).toEqual(['-p', 'hello']);
  });
});
