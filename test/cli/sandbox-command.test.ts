import { describe, it, expect } from 'vitest';
import { buildSandboxCommand } from '../../packages/squad-cli/src/cli/commands/sandbox-command.js';

describe('sandbox-command', () => {
  it('builds sandcastle command with mapped prompt args and sandbox flags', () => {
    const result = buildSandboxCommand({
      sandbox: 'sandcastle',
      sandboxFlags: '--isolation strict --trace',
      permissionProfile: 'autopilot',
      baseArgs: ['-p', 'hello', '--yolo', '--autopilot', '--model', 'gpt-5'],
    });

    expect(result.cmd).toBe('sandcastle');
    expect(result.args).toEqual([
      '--isolation', 'strict', '--trace', '--prompt', 'hello',
    ]);
  });

  it('passes through --prompt-file for sandcastle', () => {
    const result = buildSandboxCommand({
      sandbox: 'sandcastle',
      baseArgs: ['--prompt-file', '/tmp/prompt.md'],
    });

    expect(result.cmd).toBe('sandcastle');
    expect(result.args).toEqual(['--prompt-file', '/tmp/prompt.md']);
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
