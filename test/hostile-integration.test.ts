/**
 * Hostile Integration Tests
 *
 * Wires the 95-string nasty-inputs corpus into actual test execution.
 * Every hostile string gets run through parseInput(), executeCommand(),
 * and MessageStream rendering. None may crash the process.
 *
 * Closes #376
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  NASTY_INPUTS,
  CLI_SAFE_NASTY_INPUTS,
  UNICODE_NASTY_INPUTS,
  type NastyInput,
} from './acceptance/fixtures/nasty-inputs.js';
import {
  parseInput,
  executeCommand,
  SessionRegistry,
  ShellRenderer,
} from '../packages/squad-cli/src/cli/shell/index.js';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import type { ShellMessage } from '../packages/squad-cli/src/cli/shell/types.js';

const h = React.createElement;

// Known agents for parseInput routing
const KNOWN_AGENTS = ['Agent1', 'Agent2', 'Agent3', 'Agent4'];

function makeMessage(content: string, role: ShellMessage['role'] = 'agent'): ShellMessage {
  return { role, content, timestamp: new Date(), agentName: role === 'agent' ? 'TestAgent' : undefined };
}

function makeCommandContext() {
  return {
    registry: new SessionRegistry(),
    renderer: new ShellRenderer(),
    messageHistory: [] as ShellMessage[],
    teamRoot: '/tmp/test-team',
  };
}

// ============================================================================
// 1. parseInput — every nasty string must not throw
// ============================================================================

describe('Hostile corpus → parseInput()', () => {
  it(`processes all ${NASTY_INPUTS.length} hostile strings without throwing`, () => {
    for (const input of NASTY_INPUTS) {
      expect(() => {
        const result = parseInput(input.value, KNOWN_AGENTS);
        // Must return a valid ParsedInput
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('raw');
        expect(['slash_command', 'direct_agent', 'coordinator']).toContain(result.type);
      }).not.toThrow();
    }
  });

  it('handles slash-command-shaped hostile inputs', () => {
    // Inputs starting with '/' should parse as slash commands
    const slashInputs = NASTY_INPUTS.filter(i => i.value.trimStart().startsWith('/'));
    for (const input of slashInputs) {
      const result = parseInput(input.value, KNOWN_AGENTS);
      expect(result.type).toBe('slash_command');
      expect(result.command).toBeDefined();
    }
  });

  it('handles empty and whitespace inputs gracefully', () => {
    const whitespaceInputs = NASTY_INPUTS.filter(i =>
      i.label.includes('empty') || i.label.includes('space') || i.label.includes('tab') ||
      i.label.includes('newline') || i.label.includes('crlf') || i.label.includes('whitespace')
    );
    for (const input of whitespaceInputs) {
      expect(() => parseInput(input.value, KNOWN_AGENTS)).not.toThrow();
    }
  });

  it('handles injection-like strings without executing', () => {
    const injections = NASTY_INPUTS.filter(i => i.label.includes('injection') || i.label.includes('xss') || i.label.includes('traversal'));
    for (const input of injections) {
      const result = parseInput(input.value, KNOWN_AGENTS);
      // These should route to coordinator (not treated as commands)
      expect(result.type).toBe('coordinator');
    }
  });

  it('handles unicode edge cases', () => {
    for (const input of UNICODE_NASTY_INPUTS) {
      expect(() => parseInput(input.value, KNOWN_AGENTS)).not.toThrow();
    }
  });
});

// ============================================================================
// 2. executeCommand — slash command strings must not throw
// ============================================================================

describe('Hostile corpus → executeCommand()', () => {
  it('executes all hostile strings as commands without throwing', () => {
    const context = makeCommandContext();
    for (const input of NASTY_INPUTS) {
      expect(() => {
        // Treat each hostile string as a command name with no args
        const result = executeCommand(input.value, [], context);
        // Must return a valid CommandResult
        expect(result).toHaveProperty('handled');
      }).not.toThrow();
    }
  });

  it('handles hostile strings as command arguments', () => {
    const context = makeCommandContext();
    for (const input of CLI_SAFE_NASTY_INPUTS) {
      expect(() => {
        executeCommand('history', [input.value], context);
        executeCommand('status', [input.value], context);
        executeCommand('help', [input.value], context);
      }).not.toThrow();
    }
  });

  it('handles extremely long command names', () => {
    const context = makeCommandContext();
    const longInputs = NASTY_INPUTS.filter(i => i.label.includes('kb-string'));
    for (const input of longInputs) {
      expect(() => {
        const result = executeCommand(input.value, [], context);
        expect(result.handled).toBe(false); // Unknown command
      }).not.toThrow();
    }
  });
});

// ============================================================================
// 3. MessageStream rendering — hostile content must not crash React
// ============================================================================

describe('Hostile corpus → MessageStream render()', () => {
  it(`renders all ${NASTY_INPUTS.length} hostile strings as message content without crashing`, () => {
    for (const input of NASTY_INPUTS) {
      expect(() => {
        const messages = [makeMessage(input.value, 'user'), makeMessage(input.value, 'agent')];
        const { unmount } = render(h(MessageStream, { messages }));
        unmount();
      }).not.toThrow();
    }
  }, 30000);

  it('renders hostile strings in streaming content without crashing', () => {
    for (const input of CLI_SAFE_NASTY_INPUTS) {
      expect(() => {
        const { unmount } = render(
          h(MessageStream, {
            messages: [makeMessage('test', 'user')],
            streamingContent: new Map([['TestAgent', input.value]]),
            processing: true,
          })
        );
        unmount();
      }).not.toThrow();
    }
  });

  it('renders unicode edge cases without crashing', () => {
    for (const input of UNICODE_NASTY_INPUTS) {
      expect(() => {
        const messages = [
          makeMessage(input.value, 'user'),
          makeMessage(`Response to: ${input.value}`, 'agent'),
        ];
        const { unmount } = render(h(MessageStream, { messages }));
        unmount();
      }).not.toThrow();
    }
  });

  it('renders hostile agent names without crashing', () => {
    for (const input of CLI_SAFE_NASTY_INPUTS) {
      expect(() => {
        const messages: ShellMessage[] = [{
          role: 'agent',
          content: 'Normal content',
          timestamp: new Date(),
          agentName: input.value,
        }];
        const { unmount } = render(h(MessageStream, { messages }));
        unmount();
      }).not.toThrow();
    }
  });

  it('renders hostile activity hints without crashing', () => {
    const hints = NASTY_INPUTS.slice(0, 20);
    for (const input of hints) {
      expect(() => {
        const { unmount } = render(
          h(MessageStream, {
            messages: [makeMessage('test', 'user')],
            processing: true,
            activityHint: input.value,
          })
        );
        unmount();
      }).not.toThrow();
    }
  });
});

// ============================================================================
// 4. Full pipeline — parseInput → executeCommand chain
// ============================================================================

describe('Hostile corpus → full pipeline', () => {
  it('parses then executes slash-like inputs without throwing', () => {
    const context = makeCommandContext();
    for (const input of CLI_SAFE_NASTY_INPUTS) {
      expect(() => {
        const parsed = parseInput(input.value, KNOWN_AGENTS);
        if (parsed.type === 'slash_command' && parsed.command) {
          executeCommand(parsed.command, parsed.args ?? [], context);
        }
      }).not.toThrow();
    }
  });

  it('corpus count is at least 60 strings', () => {
    // Sanity check: corpus hasn't been silently truncated
    expect(NASTY_INPUTS.length).toBeGreaterThanOrEqual(60);
  });

  it('CLI_SAFE subset excludes null bytes and long strings', () => {
    for (const input of CLI_SAFE_NASTY_INPUTS) {
      expect(input.value).not.toContain('\x00');
      expect(input.value.length).toBeLessThan(2048);
    }
  });
});
