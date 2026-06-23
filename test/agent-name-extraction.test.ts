/**
 * Tests for agent name extraction from task descriptions.
 *
 * Validates the parseAgentFromDescription helper that extracts agent identity
 * from free-form task description strings used in the shell UI.
 *
 * @module test/agent-name-extraction
 */

import { describe, it, expect } from 'vitest';
import { parseAgentFromDescription } from '@bradygaster/squad-cli/shell/agent-name-parser';

const KNOWN = ['eecom', 'flight', 'scribe', 'fido', 'vox', 'dsky', 'pao'];

// ============================================================================
// Happy-path: standard "emoji NAME: summary" format
// ============================================================================
describe('parseAgentFromDescription — happy path', () => {
  it('parses emoji + uppercase name + colon', () => {
    const result = parseAgentFromDescription('🔧 EECOM: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });

  it('parses Flight with building emoji', () => {
    const result = parseAgentFromDescription('🏗️ Flight: Reviewing architecture', KNOWN);
    expect(result).toEqual({ agentName: 'flight', taskSummary: 'Reviewing architecture' });
  });

  it('parses Scribe with clipboard emoji', () => {
    const result = parseAgentFromDescription('📋 Scribe: Log session & merge decisions', KNOWN);
    expect(result).toEqual({ agentName: 'scribe', taskSummary: 'Log session & merge decisions' });
  });

  it('parses FIDO with test tube emoji', () => {
    const result = parseAgentFromDescription('🧪 FIDO: Writing test cases', KNOWN);
    expect(result).toEqual({ agentName: 'fido', taskSummary: 'Writing test cases' });
  });
});

// ============================================================================
// Emoji variations
// ============================================================================
describe('parseAgentFromDescription — emoji variations', () => {
  it('handles multi-byte emoji (⚛️)', () => {
    const result = parseAgentFromDescription('⚛️ DSKY: Building TUI', KNOWN);
    expect(result).toEqual({ agentName: 'dsky', taskSummary: 'Building TUI' });
  });

  it('handles no emoji prefix', () => {
    const result = parseAgentFromDescription('EECOM: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });

  it('handles multiple spaces after emoji', () => {
    const result = parseAgentFromDescription('🔧  EECOM: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });
});

// ============================================================================
// Case insensitivity
// ============================================================================
describe('parseAgentFromDescription — case insensitivity', () => {
  it('matches lowercase input against lowercase known', () => {
    const result = parseAgentFromDescription('🔧 eecom: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });

  it('matches UPPERCASE input against lowercase known', () => {
    const result = parseAgentFromDescription('🔧 EECOM: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });

  it('matches Mixed case input against lowercase known', () => {
    const result = parseAgentFromDescription('🔧 Eecom: Fix auth module', KNOWN);
    expect(result).toEqual({ agentName: 'eecom', taskSummary: 'Fix auth module' });
  });
});

// ============================================================================
// Fuzzy fallback (name present but format differs)
// ============================================================================
describe('parseAgentFromDescription — fuzzy fallback', () => {
  it('finds agent name mentioned without colon pattern', () => {
    const result = parseAgentFromDescription('general-purpose task for EECOM', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
    expect(result!.taskSummary).toBe('general-purpose task for EECOM');
  });

  it('finds VOX in a differently structured sentence', () => {
    const result = parseAgentFromDescription('Working on shell — VOX task', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('vox');
  });
});

// ============================================================================
// No match → null
// ============================================================================
describe('parseAgentFromDescription — no match', () => {
  it('returns null for generic description with no known name', () => {
    expect(
      parseAgentFromDescription('general-purpose agent working on task', ['eecom', 'flight']),
    ).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAgentFromDescription('', KNOWN)).toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(parseAgentFromDescription('Dispatching to agent...', ['eecom', 'flight'])).toBeNull();
  });
});

// ============================================================================
// Edge cases
// ============================================================================
describe('parseAgentFromDescription — edge cases', () => {
  it('picks first agent when multiple known names appear', () => {
    const result = parseAgentFromDescription('🔧 EECOM: Fix bug found by FIDO', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
  });

  it('matches agent name that is substring-safe (vox vs invoice)', () => {
    const result = parseAgentFromDescription('🔧 VOX: Fixed invoice rendering', KNOWN);
    expect(result!.agentName).toBe('vox');
  });

  it('handles description that is just the agent name', () => {
    const result = parseAgentFromDescription('EECOM', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
    expect(result!.taskSummary).toBeDefined();
  });

  it('truncates very long descriptions in taskSummary', () => {
    const longDesc = '🔧 EECOM: ' + 'A'.repeat(500);
    const result = parseAgentFromDescription(longDesc, KNOWN);
    expect(result).not.toBeNull();
    expect(result!.taskSummary.length).toBeLessThanOrEqual(60);
  });

  it('handles special characters in description', () => {
    const result = parseAgentFromDescription('🔧 EECOM: Fix auth (OAuth 2.0) — urgent!', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
    expect(result!.taskSummary).toContain('OAuth 2.0');
  });

  it('matches agent name embedded in kebab-case value (fuzzy)', () => {
    const result = parseAgentFromDescription('eecom-fix-auth', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
  });

  it('returns null for empty knownAgentNames array', () => {
    expect(parseAgentFromDescription('🔧 EECOM: Fix auth', [])).toBeNull();
  });

  it('returns null when description is only emoji', () => {
    expect(parseAgentFromDescription('🔧', KNOWN)).toBeNull();
  });

  it('handles agent name with numbers', () => {
    const result = parseAgentFromDescription('🔧 agent1: checking build', ['agent1']);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('agent1');
  });

  it('handles unicode characters in description but not in name', () => {
    const result = parseAgentFromDescription('🔧 EECOM: Fix für Überprüfung', KNOWN);
    expect(result).not.toBeNull();
    expect(result!.agentName).toBe('eecom');
  });
});

// ============================================================================
// Adversarial inputs
// ============================================================================
describe('parseAgentFromDescription — adversarial inputs', () => {
  it('returns null for null input', () => {
    expect(parseAgentFromDescription(null as unknown as string, KNOWN)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseAgentFromDescription(undefined as unknown as string, KNOWN)).toBeNull();
  });

  it('returns null for numeric input', () => {
    expect(parseAgentFromDescription(42 as unknown as string, KNOWN)).toBeNull();
  });

  it('returns null for null knownAgentNames', () => {
    expect(parseAgentFromDescription('🔧 EECOM: Fix auth', null as unknown as string[])).toBeNull();
  });

  it('returns null for undefined knownAgentNames', () => {
    expect(
      parseAgentFromDescription('🔧 EECOM: Fix auth', undefined as unknown as string[]),
    ).toBeNull();
  });
});
