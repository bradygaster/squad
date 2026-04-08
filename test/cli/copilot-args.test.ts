/**
 * copilot-args — Unit tests for centralized Copilot CLI argument builder.
 *
 * Ensures the prompt flag (`-p`) is used consistently and that custom
 * agentCmd / copilotFlags overrides are handled correctly.
 */

import { describe, it, expect } from 'vitest';
import { buildCopilotArgs } from '../../packages/squad-cli/src/cli/commands/copilot-args.js';

describe('buildCopilotArgs', () => {
  it('uses gh copilot -p by default', () => {
    const { cmd, args } = buildCopilotArgs('Do the work');
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'Do the work']);
  });

  it('never produces --message flag', () => {
    const { args: defaultArgs } = buildCopilotArgs('test');
    expect(defaultArgs).not.toContain('--message');

    const { args: withFlags } = buildCopilotArgs('test', { copilotFlags: '--model gpt-4' });
    expect(withFlags).not.toContain('--message');

    const { args: withCmd } = buildCopilotArgs('test', { agentCmd: 'custom-agent' });
    expect(withCmd).not.toContain('--message');
  });

  it('appends copilotFlags after prompt', () => {
    const { cmd, args } = buildCopilotArgs('Run this', { copilotFlags: '--model gpt-4 --yolo' });
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'Run this', '--model', 'gpt-4', '--yolo']);
  });

  it('uses custom agentCmd when provided', () => {
    const { cmd, args } = buildCopilotArgs('Do stuff', { agentCmd: 'custom-agent --flag val' });
    expect(cmd).toBe('custom-agent');
    expect(args).toEqual(['--flag', 'val', '-p', 'Do stuff']);
  });

  it('agentCmd takes precedence over copilotFlags', () => {
    const { cmd, args } = buildCopilotArgs('work', {
      agentCmd: 'my-agent',
      copilotFlags: '--model gpt-4',
    });
    expect(cmd).toBe('my-agent');
    expect(args).toEqual(['-p', 'work']);
    // copilotFlags are ignored when agentCmd is set
    expect(args).not.toContain('--model');
  });

  it('handles empty options gracefully', () => {
    const { cmd, args } = buildCopilotArgs('test', {});
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'test']);
  });

  it('handles undefined options', () => {
    const { cmd, args } = buildCopilotArgs('test', undefined);
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'test']);
  });

  it('ignores whitespace-only agentCmd', () => {
    const { cmd, args } = buildCopilotArgs('test', { agentCmd: '   ' });
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'test']);
  });

  it('ignores whitespace-only copilotFlags', () => {
    const { cmd, args } = buildCopilotArgs('test', { copilotFlags: '   ' });
    expect(cmd).toBe('gh');
    expect(args).toEqual(['copilot', '-p', 'test']);
  });

  it('preserves prompt with special characters', () => {
    const prompt = 'Fix issue #42: "auth" redirect & encoding';
    const { args } = buildCopilotArgs(prompt);
    expect(args[2]).toBe(prompt);
  });

  it('preserves multi-line prompt as single arg', () => {
    const prompt = 'Line one.\n\nLine two.';
    const { args } = buildCopilotArgs(prompt);
    expect(args[2]).toBe(prompt);
  });
});
