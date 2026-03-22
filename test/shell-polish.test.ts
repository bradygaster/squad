/**
 * Tests for shell UX polish improvements (issue #478).
 *
 * Covers:
 * - Autocomplete completeness (all slash commands present)
 * - /history validation (NaN, negative, zero)
 * - Unknown command "Did you mean?" suggestions
 * - @Agent with empty body routes to coordinator
 * - Comma-syntax with empty body routes to coordinator
 * - Error message improvements (nap, resume, generic)
 * - StreamBridge buffer size limits
 * - New error guidance types (timeout, unknownCommand)
 */

import { describe, it, expect } from 'vitest';
import { createCompleter } from '../packages/squad-cli/src/cli/shell/autocomplete.js';
import { executeCommand, type CommandContext } from '@bradygaster/squad-cli/shell/commands';
import { parseInput } from '@bradygaster/squad-cli/shell/router';
import { SessionRegistry } from '@bradygaster/squad-cli/shell/sessions';
import { ShellRenderer } from '@bradygaster/squad-cli/shell/render';
import {
  timeoutGuidance,
  unknownCommandGuidance,
  genericGuidance,
  formatGuidance,
} from '@bradygaster/squad-cli/shell/error-messages';
import { StreamBridge } from '@bradygaster/squad-cli/shell/stream-bridge';

// ============================================================================
// 1. Autocomplete — all slash commands present
// ============================================================================

describe('Autocomplete completeness', () => {
  const completer = createCompleter(['Fenster', 'Hockney']);

  it('includes /sessions in completions', () => {
    const [matches] = completer('/ses');
    expect(matches).toContain('/sessions');
  });

  it('includes /resume in completions', () => {
    const [matches] = completer('/res');
    expect(matches).toContain('/resume');
  });

  it('includes /init in completions', () => {
    const [matches] = completer('/ini');
    expect(matches).toContain('/init');
  });

  it('includes /nap in completions', () => {
    const [matches] = completer('/na');
    expect(matches).toContain('/nap');
  });

  it('includes /version in completions', () => {
    const [matches] = completer('/ver');
    expect(matches).toContain('/version');
  });

  it('lists all 12 commands for bare /', () => {
    const [matches] = completer('/');
    expect(matches.length).toBe(12);
  });
});

// ============================================================================
// 2. /history validation
// ============================================================================

describe('/history input validation', () => {
  const context: CommandContext = {
    registry: new SessionRegistry(),
    renderer: new ShellRenderer(),
    messageHistory: [
      { role: 'user', content: 'Hello', timestamp: new Date() },
      { role: 'agent', agentName: 'Fenster', content: 'Hi there', timestamp: new Date() },
    ],
    teamRoot: '/tmp',
  };

  it('rejects NaN input', () => {
    const result = executeCommand('history', ['abc'], context);
    expect(result.output).toContain('positive number');
  });

  it('rejects negative numbers', () => {
    const result = executeCommand('history', ['-5'], context);
    expect(result.output).toContain('positive number');
  });

  it('rejects zero', () => {
    const result = executeCommand('history', ['0'], context);
    expect(result.output).toContain('positive number');
  });

  it('accepts valid positive number', () => {
    const result = executeCommand('history', ['5'], context);
    expect(result.output).toContain('Last 2 message');
  });

  it('defaults to 10 with no argument', () => {
    const result = executeCommand('history', [], context);
    expect(result.output).toContain('Last 2 message');
  });
});

// ============================================================================
// 3. Unknown command — "Did you mean?" suggestions
// ============================================================================

describe('Unknown command suggestions', () => {
  const context: CommandContext = {
    registry: new SessionRegistry(),
    renderer: new ShellRenderer(),
    messageHistory: [],
    teamRoot: '/tmp',
  };

  it('suggests /status for /st', () => {
    const result = executeCommand('st', [], context);
    expect(result.output).toContain('Did you mean /status?');
  });

  it('suggests /help for /he', () => {
    const result = executeCommand('he', [], context);
    expect(result.output).toContain('Did you mean /help?');
  });

  it('suggests /init for /in', () => {
    const result = executeCommand('in', [], context);
    expect(result.output).toContain('Did you mean /init?');
  });

  it('does not suggest for completely unmatched input', () => {
    const result = executeCommand('zzzzz', [], context);
    expect(result.output).toContain('Unknown command');
    expect(result.output).not.toContain('Did you mean');
  });
});

// ============================================================================
// 4. @Agent with empty body routes to coordinator
// ============================================================================

describe('@Agent with empty body', () => {
  const agents = ['Fenster', 'Hockney', 'Keaton'];

  it('@Agent with no message routes to coordinator', () => {
    const result = parseInput('@Fenster', agents);
    expect(result.type).toBe('coordinator');
    expect(result.raw).toBe('@Fenster');
  });

  it('@Agent with whitespace-only routes to coordinator', () => {
    const result = parseInput('@Fenster   ', agents);
    expect(result.type).toBe('coordinator');
  });

  it('@Agent with message stays direct_agent', () => {
    const result = parseInput('@Fenster fix the bug', agents);
    expect(result.type).toBe('direct_agent');
    expect(result.agentName).toBe('Fenster');
    expect(result.content).toBe('fix the bug');
  });

  it('Comma syntax with no message routes to coordinator', () => {
    const result = parseInput('Fenster, ', agents);
    expect(result.type).toBe('coordinator');
  });

  it('Comma syntax with message stays direct_agent', () => {
    const result = parseInput('Fenster, fix the bug', agents);
    expect(result.type).toBe('direct_agent');
    expect(result.agentName).toBe('Fenster');
    expect(result.content).toBe('fix the bug');
  });
});

// ============================================================================
// 5. Error message improvements
// ============================================================================

describe('Error message improvements', () => {
  it('nap result includes report for valid path', () => {
    const context: CommandContext = {
      registry: new SessionRegistry(),
      renderer: new ShellRenderer(),
      messageHistory: [],
      teamRoot: '/nonexistent/path/that/will/succeed',
    };
    const result = executeCommand('nap', [], context);
    // Should succeed or fail with a descriptive message (not bare "Nap failed.")
    expect(result.output).toBeTruthy();
    expect(result.output).not.toBe('Nap failed.');
  });

  it('resume with bad ID includes helpful context', () => {
    const context: CommandContext = {
      registry: new SessionRegistry(),
      renderer: new ShellRenderer(),
      messageHistory: [],
      teamRoot: '/tmp',
    };
    const result = executeCommand('resume', ['nonexistent123'], context);
    expect(result.output).toContain('nonexistent123');
    expect(result.output).toContain('/sessions');
  });
});

// ============================================================================
// 6. New error guidance types
// ============================================================================

describe('New error guidance types', () => {
  it('timeoutGuidance provides agent-specific message', () => {
    const g = timeoutGuidance('Fenster');
    expect(g.message).toContain('Fenster');
    expect(g.message).toContain('timed out');
    expect(g.recovery.length).toBeGreaterThanOrEqual(3);
    expect(g.recovery.some(r => r.includes('SQUAD_REPL_TIMEOUT'))).toBe(true);
  });

  it('timeoutGuidance provides generic message when no agent', () => {
    const g = timeoutGuidance();
    expect(g.message).toContain('Request timed out');
  });

  it('unknownCommandGuidance includes command name', () => {
    const g = unknownCommandGuidance('foobar');
    expect(g.message).toContain('foobar');
    expect(g.recovery.some(r => r.includes('/help'))).toBe(true);
  });

  it('genericGuidance now has 3 recovery steps', () => {
    const g = genericGuidance('Something broke');
    expect(g.recovery.length).toBe(3);
    expect(g.recovery.some(r => r.includes('internet'))).toBe(true);
  });

  it('formatGuidance renders all recovery steps', () => {
    const g = timeoutGuidance('Fenster');
    const formatted = formatGuidance(g);
    expect(formatted).toContain('❌');
    expect(formatted).toContain('Fenster');
    for (const step of g.recovery) {
      expect(formatted).toContain(step);
    }
  });
});

// ============================================================================
// 7. StreamBridge buffer size limits
// ============================================================================

describe('StreamBridge buffer size limits', () => {
  it('has a MAX_BUFFER_SIZE constant', () => {
    expect(StreamBridge.MAX_BUFFER_SIZE).toBe(1024 * 1024);
  });

  it('truncates buffer when exceeding MAX_BUFFER_SIZE', () => {
    const registry = new SessionRegistry();
    registry.register('test', 'Test Agent');
    let lastContent = '';
    const bridge = new StreamBridge(registry, {
      onContent: (_agent, content) => { lastContent = content; },
      onComplete: () => {},
    });

    // Push content that exceeds the limit
    const bigChunk = 'x'.repeat(StreamBridge.MAX_BUFFER_SIZE + 100);
    bridge.handleEvent({
      type: 'message_delta',
      sessionId: 'test',
      agentName: 'test',
      content: bigChunk,
      index: 0,
      timestamp: new Date(),
    } as never);

    const buffer = bridge.getBuffer('test');
    expect(buffer.length).toBeLessThanOrEqual(StreamBridge.MAX_BUFFER_SIZE);
    // Most recent content is preserved (truncated from front)
    expect(buffer.endsWith('x')).toBe(true);
    expect(lastContent).toBe(bigChunk); // onContent gets the original delta
  });

  it('allows content under the limit without truncation', () => {
    const registry = new SessionRegistry();
    registry.register('test', 'Test Agent');
    const bridge = new StreamBridge(registry, {
      onContent: () => {},
      onComplete: () => {},
    });

    bridge.handleEvent({
      type: 'message_delta',
      sessionId: 'test',
      agentName: 'test',
      content: 'hello world',
      index: 0,
      timestamp: new Date(),
    } as never);

    expect(bridge.getBuffer('test')).toBe('hello world');
  });
});
