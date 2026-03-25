/**
 * Tests for the template renderer helper.
 */

import { describe, it, expect } from 'vitest';
import { renderTemplate, RUNTIME_DEFAULTS } from '../../src/templates/renderer.js';
import type { TemplateTokens } from '../../src/templates/renderer.js';

describe('RUNTIME_DEFAULTS', () => {
  it('should define copilot defaults', () => {
    expect(RUNTIME_DEFAULTS['copilot']).toEqual({
      CODING_AGENT_HANDLE: '@copilot',
      CODING_AGENT_LABEL: 'squad:copilot',
      CODING_AGENT_ASSIGNEE: 'copilot-swe-agent[bot]',
    });
  });

  it('should define claude-code defaults', () => {
    expect(RUNTIME_DEFAULTS['claude-code']).toEqual({
      CODING_AGENT_HANDLE: '@claude',
      CODING_AGENT_LABEL: 'squad:claude',
      CODING_AGENT_ASSIGNEE: 'claude-code[bot]',
    });
  });

  it('should have entries for both supported runtimes', () => {
    expect(Object.keys(RUNTIME_DEFAULTS)).toContain('copilot');
    expect(Object.keys(RUNTIME_DEFAULTS)).toContain('claude-code');
  });
});

describe('renderTemplate', () => {
  const copilotTokens = RUNTIME_DEFAULTS['copilot'];
  const claudeTokens = RUNTIME_DEFAULTS['claude-code'];

  it('should replace {{CODING_AGENT_HANDLE}} with the correct value', () => {
    expect(renderTemplate('Hello {{CODING_AGENT_HANDLE}}', copilotTokens)).toBe('Hello @copilot');
    expect(renderTemplate('Hello {{CODING_AGENT_HANDLE}}', claudeTokens)).toBe('Hello @claude');
  });

  it('should replace {{CODING_AGENT_LABEL}} with the correct value', () => {
    expect(renderTemplate('label: {{CODING_AGENT_LABEL}}', copilotTokens)).toBe('label: squad:copilot');
    expect(renderTemplate('label: {{CODING_AGENT_LABEL}}', claudeTokens)).toBe('label: squad:claude');
  });

  it('should replace {{CODING_AGENT_ASSIGNEE}} with the correct value', () => {
    expect(renderTemplate("assignees: ['{{CODING_AGENT_ASSIGNEE}}']", copilotTokens)).toBe(
      "assignees: ['copilot-swe-agent[bot]']",
    );
    expect(renderTemplate("assignees: ['{{CODING_AGENT_ASSIGNEE}}']", claudeTokens)).toBe(
      "assignees: ['claude-code[bot]']",
    );
  });

  it('should replace all three tokens in a single template', () => {
    const template =
      'Handle: {{CODING_AGENT_HANDLE}}, Label: {{CODING_AGENT_LABEL}}, Assignee: {{CODING_AGENT_ASSIGNEE}}';
    expect(renderTemplate(template, copilotTokens)).toBe(
      'Handle: @copilot, Label: squad:copilot, Assignee: copilot-swe-agent[bot]',
    );
    expect(renderTemplate(template, claudeTokens)).toBe(
      'Handle: @claude, Label: squad:claude, Assignee: claude-code[bot]',
    );
  });

  it('should replace multiple occurrences of the same token', () => {
    const template = '{{CODING_AGENT_HANDLE}} and {{CODING_AGENT_HANDLE}} again';
    expect(renderTemplate(template, copilotTokens)).toBe('@copilot and @copilot again');
  });

  it('should leave non-token content untouched', () => {
    const template = 'No tokens here. Keep this exactly.';
    expect(renderTemplate(template, copilotTokens)).toBe('No tokens here. Keep this exactly.');
  });

  it('should work with custom tokens', () => {
    const custom: TemplateTokens = {
      CODING_AGENT_HANDLE: '@mybot',
      CODING_AGENT_LABEL: 'squad:mybot',
      CODING_AGENT_ASSIGNEE: 'mybot[bot]',
    };
    expect(renderTemplate('{{CODING_AGENT_HANDLE}} / {{CODING_AGENT_LABEL}} / {{CODING_AGENT_ASSIGNEE}}', custom)).toBe(
      '@mybot / squad:mybot / mybot[bot]',
    );
  });

  it('should return an empty string unchanged', () => {
    expect(renderTemplate('', copilotTokens)).toBe('');
  });
});
