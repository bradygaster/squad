/**
 * Tests for SDK input-router — parseInput() + parseDispatchTargets().
 * Validates the pure string-parsing routing logic extracted from shell/router.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  parseInput,
  parseDispatchTargets,
  type MessageType,
  type ParsedInput,
  type DispatchTargets,
} from '@bradygaster/squad-sdk/runtime/input-router';

const KNOWN_AGENTS = ['Fenster', 'Hockney', 'McManus'];

describe('parseInput', () => {
  // --- Slash commands ---
  describe('slash commands', () => {
    it('routes /help as a slash command', () => {
      const result = parseInput('/help', KNOWN_AGENTS);
      expect(result.type).toBe('slash_command');
      expect(result.command).toBe('help');
      expect(result.args).toEqual([]);
    });

    it('parses command with arguments', () => {
      const result = parseInput('/status arg1 arg2', KNOWN_AGENTS);
      expect(result.type).toBe('slash_command');
      expect(result.command).toBe('status');
      expect(result.args).toEqual(['arg1', 'arg2']);
    });

    it('lowercases the command name', () => {
      const result = parseInput('/UPPER', KNOWN_AGENTS);
      expect(result.type).toBe('slash_command');
      expect(result.command).toBe('upper');
    });

    it('preserves raw input', () => {
      const result = parseInput('  /help  ', KNOWN_AGENTS);
      expect(result.raw).toBe('/help');
    });
  });

  // --- @Agent routing ---
  describe('@Agent routing', () => {
    it('routes @KnownAgent with message as direct_agent', () => {
      const result = parseInput('@Fenster fix the bug', KNOWN_AGENTS);
      expect(result.type).toBe('direct_agent');
      expect(result.agentName).toBe('Fenster');
      expect(result.content).toBe('fix the bug');
    });

    it('case-insensitive matching: @fenster matches Fenster', () => {
      const result = parseInput('@fenster do stuff', KNOWN_AGENTS);
      expect(result.type).toBe('direct_agent');
      expect(result.agentName).toBe('Fenster');
      expect(result.content).toBe('do stuff');
    });

    it('unknown @mention falls through to coordinator', () => {
      const result = parseInput('@Unknown hello world', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
      expect(result.content).toBe('@Unknown hello world');
    });

    it('empty body after @Agent routes to coordinator', () => {
      const result = parseInput('@Fenster', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
      expect(result.content).toBe('@Fenster');
      expect(result.agentName).toBeUndefined();
    });

    it('whitespace-only body after @Agent routes to coordinator', () => {
      const result = parseInput('@Fenster   ', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
      expect(result.content).toBe('@Fenster');
    });
  });

  // --- Comma syntax ---
  describe('comma syntax', () => {
    it('routes "Fenster, fix the bug" as direct_agent', () => {
      const result = parseInput('Fenster, fix the bug', KNOWN_AGENTS);
      expect(result.type).toBe('direct_agent');
      expect(result.agentName).toBe('Fenster');
      expect(result.content).toBe('fix the bug');
    });

    it('case-insensitive comma matching', () => {
      const result = parseInput('hockney, review this', KNOWN_AGENTS);
      expect(result.type).toBe('direct_agent');
      expect(result.agentName).toBe('Hockney');
    });

    it('unknown comma name falls through to coordinator', () => {
      const result = parseInput('Nobody, do something', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
      expect(result.content).toBe('Nobody, do something');
    });

    it('empty body after comma routes to coordinator', () => {
      const result = parseInput('Fenster,  ', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
    });
  });

  // --- Plain text ---
  describe('plain text', () => {
    it('routes plain text to coordinator', () => {
      const result = parseInput('just some text', KNOWN_AGENTS);
      expect(result.type).toBe('coordinator');
      expect(result.content).toBe('just some text');
    });

    it('trims whitespace', () => {
      const result = parseInput('  hello world  ', KNOWN_AGENTS);
      expect(result.raw).toBe('hello world');
      expect(result.content).toBe('hello world');
    });
  });
});

describe('parseDispatchTargets', () => {
  it('extracts multiple known @agent mentions', () => {
    const result = parseDispatchTargets('@Fenster @Hockney fix and test', KNOWN_AGENTS);
    expect(result.agents).toEqual(['Fenster', 'Hockney']);
    expect(result.content).toBe('fix and test');
  });

  it('deduplicates case-insensitive mentions', () => {
    const result = parseDispatchTargets('@Fenster @fenster hello', KNOWN_AGENTS);
    expect(result.agents).toEqual(['Fenster']);
    expect(result.content).toBe('hello');
  });

  it('ignores unknown @mentions in agents list but strips them from content', () => {
    const result = parseDispatchTargets('@Fenster @Unknown do it', KNOWN_AGENTS);
    expect(result.agents).toEqual(['Fenster']);
    expect(result.content).toBe('do it');
  });

  it('returns empty agents for plain text', () => {
    const result = parseDispatchTargets('plain message', KNOWN_AGENTS);
    expect(result.agents).toEqual([]);
    expect(result.content).toBe('plain message');
  });

  it('handles all three agents', () => {
    const result = parseDispatchTargets('@Fenster @Hockney @McManus all hands', KNOWN_AGENTS);
    expect(result.agents).toEqual(['Fenster', 'Hockney', 'McManus']);
    expect(result.content).toBe('all hands');
  });

  it('collapses extra whitespace after stripping mentions', () => {
    const result = parseDispatchTargets('@Fenster   @Hockney   go', KNOWN_AGENTS);
    expect(result.content).toBe('go');
  });

  // Type-level checks — ensure types are properly exported
  it('exported types are usable', () => {
    const mt: MessageType = 'coordinator';
    const pi: ParsedInput = { type: 'coordinator', raw: 'test', content: 'test' };
    const dt: DispatchTargets = { agents: [], content: '' };
    expect(mt).toBe('coordinator');
    expect(pi.type).toBe('coordinator');
    expect(dt.agents).toEqual([]);
  });
});
