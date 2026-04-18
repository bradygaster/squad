/**
 * Tests for identity formatting utilities — comment bodies and commit messages.
 *
 * formatComment() produces the standard agent attribution block used in GitHub
 * issue/PR comments across all identity tiers.
 *
 * formatCommitMessage() prefixes conventional commit messages with `[AgentName]`
 * for greppable git history attribution.
 *
 * @see docs/proposals/agent-github-identity.md — "Standard Format" + "Commit Message Format"
 * @module test/identity/formatting
 */

import { describe, it, expect } from 'vitest';
import { formatComment, formatCommitMessage } from '@bradygaster/squad-sdk/identity';

// ============================================================================
// formatComment
// ============================================================================
describe('formatComment', () => {
  it('formats with emoji, bold agent name, role in parens, body below', () => {
    const result = formatComment({
      agentName: 'Flight',
      role: 'Lead',
      body: 'Architecture review complete. Approved.',
    });

    // Standard format: emoji **Name** (Role)\n\nbody
    expect(result).toContain('**Flight**');
    expect(result).toContain('(Lead)');
    expect(result).toContain('Architecture review complete. Approved.');
    // Body is separated from the header by a blank line
    expect(result).toMatch(/\*\*Flight\*\* \(Lead\)\n\n/);
  });

  it('handles multi-line body', () => {
    const body = 'Line one.\nLine two.\nLine three.';
    const result = formatComment({
      agentName: 'EECOM',
      role: 'Backend Developer',
      body,
    });

    expect(result).toContain('**EECOM**');
    expect(result).toContain('(Backend Developer)');
    expect(result).toContain('Line one.\nLine two.\nLine three.');
  });

  it('handles empty body', () => {
    const result = formatComment({
      agentName: 'FIDO',
      role: 'Tester',
      body: '',
    });

    expect(result).toContain('**FIDO**');
    expect(result).toContain('(Tester)');
    // Should still produce a valid comment (header present, body empty)
    expect(result).toMatch(/\*\*FIDO\*\* \(Tester\)/);
  });

  it('includes a role-appropriate emoji prefix', () => {
    const result = formatComment({
      agentName: 'Flight',
      role: 'Lead',
      body: 'Looks good.',
    });

    // The comment should start with an emoji (any emoji character)
    // Emoji is the first character(s) before the bold agent name
    expect(result).toMatch(/^.+\s\*\*Flight\*\*/);
  });
});

// ============================================================================
// formatCommitMessage
// ============================================================================
describe('formatCommitMessage', () => {
  it('prefixes with [AgentName]', () => {
    const result = formatCommitMessage({
      agentName: 'Flight',
      message: 'refactor: extract auth module',
    });

    expect(result).toBe('[Flight] refactor: extract auth module');
  });

  it('preserves conventional commit format', () => {
    const result = formatCommitMessage({
      agentName: 'Flight',
      message: 'refactor: extract auth module',
    });

    // Should be [AgentName] type: description
    expect(result).toMatch(/^\[Flight\] refactor: extract auth module$/);
  });

  it('handles agent names with spaces', () => {
    const result = formatCommitMessage({
      agentName: 'Core Dev',
      message: 'fix: resolve null pointer',
    });

    expect(result).toBe('[Core Dev] fix: resolve null pointer');
  });

  it('handles multi-word commit messages', () => {
    const result = formatCommitMessage({
      agentName: 'EECOM',
      message: 'feat(auth): add JWT refresh token rotation',
    });

    expect(result).toBe('[EECOM] feat(auth): add JWT refresh token rotation');
  });
});
