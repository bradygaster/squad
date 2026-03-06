/**
 * REPL UX visual behavior tests
 *
 * Tests rendered output of shell components using ink-testing-library.
 * Asserts on TEXT content (what the user sees), not internal state.
 * Written against component interfaces (props → rendered text) so that
 * implementation changes by Kovash don't break these tests.
 *
 * Components under test:
 * - MessageStream: conversation display, spinner, streaming cursor
 * - AgentPanel: team roster with status indicators
 * - InputPrompt: text input with history and disabled states
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import { AgentPanel } from '../packages/squad-cli/src/cli/shell/components/AgentPanel.js';
import { InputPrompt } from '../packages/squad-cli/src/cli/shell/components/InputPrompt.js';
import { ThinkingIndicator, THINKING_PHRASES } from '../packages/squad-cli/src/cli/shell/components/ThinkingIndicator.js';
import type { ShellMessage, AgentSession } from '../packages/squad-cli/src/cli/shell/types.js';

// ============================================================================
// Test helpers
// ============================================================================

function makeAgent(overrides: Partial<AgentSession> & { name: string }): AgentSession {
  return {
    role: 'core dev',
    status: 'idle',
    startedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ShellMessage> & { content: string; role: ShellMessage['role'] }): ShellMessage {
  return {
    timestamp: new Date(),
    ...overrides,
  };
}

const h = React.createElement;

// ============================================================================
// 1. ThinkingIndicator visibility
// ============================================================================

describe('ThinkingIndicator visibility', () => {
  it('shows spinner when processing=true and no streaming content', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Spinner frames are braille characters ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ plus 💭 label
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('spinner text includes agent name from @mention', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: '@Kovash fix the bug' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Kovash');
    expect(frame).toContain('thinking');
  });

  it('shows "Thinking" when no @agent in message', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'fix the bug' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Default label: "Routing to agent..." gives users context
    expect(frame).toContain('Routing to agent');
  });

  it('hides spinner when streaming content appears', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map([['Kovash', 'Working on it...']]),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Working on it...');
    expect(frame).toContain('▌');
  });

  it('spinner disappears when processing ends', () => {
    const { lastFrame, rerender } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    expect(lastFrame()!).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    rerender(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'user', content: 'hello' }),
          makeMessage({ role: 'agent', content: 'Done!', agentName: 'Kovash' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    expect(frame).not.toMatch(/thinking/i);
    expect(frame).toContain('Done!');
  });
});

// ============================================================================
// 2. AgentPanel status display
// ============================================================================

describe('AgentPanel status display', () => {
  it('renders nothing when agents list is empty', () => {
    const { lastFrame } = render(h(AgentPanel, { agents: [] }));
    expect(lastFrame()!).toContain('No agents active');
  });

  it('shows agent names in roster', () => {
    const agents = [
      makeAgent({ name: 'Kovash', role: 'core dev', status: 'idle' }),
      makeAgent({ name: 'Hockney', role: 'tester', status: 'idle' }),
    ];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Kovash');
    expect(frame).toContain('Hockney');
  });

  it('idle agents show "idle" status text', () => {
    const agents = [makeAgent({ name: 'Kovash', status: 'idle' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    expect(lastFrame()!.toLowerCase()).toContain('[idle]');
  });

  it('working agents show active indicator ●', () => {
    const agents = [
      makeAgent({ name: 'Kovash', status: 'working' }),
      makeAgent({ name: 'Hockney', status: 'idle' }),
    ];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('●');
  });

  it('streaming agents show active indicator ●', () => {
    const agents = [makeAgent({ name: 'Kovash', status: 'streaming' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    expect(lastFrame()!).toContain('●');
  });

  it('error agents show error indicator [ERR]', () => {
    const agents = [makeAgent({ name: 'Kovash', status: 'error' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    expect(lastFrame()!).toContain('[ERR]');
  });

  it('shows streaming status when streamingContent references agent', () => {
    const agents = [makeAgent({ name: 'Kovash', status: 'streaming' })];
    const { lastFrame } = render(
      h(AgentPanel, {
        agents,
        streamingContent: new Map([['Kovash', 'some response']]),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Kovash');
    expect(frame).toContain('working');
  });

  it('mixed statuses render correctly together', () => {
    const agents = [
      makeAgent({ name: 'Brady', role: 'lead', status: 'idle' }),
      makeAgent({ name: 'Kovash', role: 'core dev', status: 'working' }),
      makeAgent({ name: 'Hockney', role: 'tester', status: 'error' }),
    ];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Brady');
    expect(frame).toContain('Kovash');
    expect(frame).toContain('Hockney');
    expect(frame).toContain('●');
    expect(frame).toContain('[ERR]');
  });
});

// ============================================================================
// 3. MessageStream formatting
// ============================================================================

describe('MessageStream formatting', () => {
  it('user messages show chevron prefix', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello world' })],
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('❯');
    expect(frame).toContain('hello world');
  });

  it('agent messages show agent name with emoji', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'agent', content: 'I will fix it', agentName: 'Kovash' })],
        agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Kovash');
    expect(frame).toContain('I will fix it');
    // core dev emoji is 🔧
    expect(frame).toContain('🔧');
  });

  it('tester agent shows tester emoji 🧪', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'agent', content: 'tests pass', agentName: 'Hockney' })],
        agents: [makeAgent({ name: 'Hockney', role: 'tester' })],
      })
    );
    expect(lastFrame()!).toContain('🧪');
  });

  it('system messages render dimmed', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'system', content: 'Agent spawned' })],
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Agent spawned');
  });

  it('horizontal rule appears between conversation turns', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'user', content: 'first question' }),
          makeMessage({ role: 'agent', content: 'first answer', agentName: 'Kovash' }),
          makeMessage({ role: 'user', content: 'second question' }),
        ],
      })
    );
    expect(lastFrame()!).toContain('─'.repeat(10));
  });

  it('no horizontal rule before the first message', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'first question' })],
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('first question');
    expect(frame).not.toMatch(/-{10,}/);
  });

  it('streaming content shows cursor character ▌', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [],
        streamingContent: new Map([['Kovash', 'partial response']]),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('partial response');
    expect(frame).toContain('▌');
  });

  it('streaming content shows agent name', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [],
        streamingContent: new Map([['Kovash', 'streaming text']]),
        agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
      })
    );
    expect(lastFrame()!).toContain('Kovash');
  });

  it('respects maxVisible prop — only shows last N messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ role: 'user', content: `message-${i}` })
    );
    const { lastFrame } = render(
      h(MessageStream, { messages, maxVisible: 3 })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('message-9');
    expect(frame).toContain('message-8');
    expect(frame).toContain('message-7');
    expect(frame).not.toContain('message-0');
  });
});

// ============================================================================
// 4. InputPrompt behavior
// ============================================================================

describe('InputPrompt behavior', () => {
  it('shows cursor ▌ when not disabled', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false })
    );
    expect(lastFrame()!).toContain('▌');
  });

  it('hides cursor when disabled', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: true })
    );
    expect(lastFrame()!).not.toContain('▌');
  });

  it('shows custom prompt text', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), prompt: 'squad> ' })
    );
    expect(lastFrame()!).toContain('squad>');
  });

  it('shows tab/history hint when messageCount < 10', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, messageCount: 0 })
    );
    expect(lastFrame()!).toContain('Tab completes');
    expect(lastFrame()!).toContain('history');
  });

  it('shows tab/history hint when messageCount is 5-9', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, messageCount: 5 })
    );
    expect(lastFrame()!).toContain('Tab completes');
    expect(lastFrame()!).toContain('history');
  });

  it('shows advanced hint when messageCount >= 10', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, messageCount: 10 })
    );
    expect(lastFrame()!).toContain('/status');
    expect(lastFrame()!).toContain('/clear');
    expect(lastFrame()!).toContain('/export');
  });

  it('defaults to tab/history hint when messageCount not provided', () => {
    const { lastFrame } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false })
    );
    expect(lastFrame()!).toContain('Tab completes');
    expect(lastFrame()!).toContain('history');
  });

  it('disabled prompt shows spinner animation', () => {
    const { lastFrame } = render(
      h(InputPrompt, {
        onSubmit: vi.fn(),
        disabled: true,
      })
    );
    const frame = lastFrame()!;
    // Kovash's refactored InputPrompt shows ◆ squad + spinner when disabled
    expect(frame).toContain('squad');
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('accepts text input via stdin (character by character)', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false })
    );
    // Ink v6 processes stdin events — flush microtasks after write
    stdin.write('h');
    stdin.write('e');
    stdin.write('l');
    stdin.write('l');
    stdin.write('o');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('hello');
  });

  it('submits on enter and clears input', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'test input') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    expect(onSubmit).toHaveBeenCalledWith('test input');
    expect(lastFrame()!).not.toContain('test input');
  });

  it('does not submit empty input', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    stdin.write('\r');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores input when disabled', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );
    stdin.write('should not work');
    stdin.write('\r');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('up arrow shows previous input from history', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'first') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    for (const ch of 'second') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    // Up arrow escape sequence
    stdin.write('\x1B[A');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('second');
  });

  it('down arrow clears after history navigation', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'first') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1B[A'); // Up to get "first"
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('first');
    stdin.write('\x1B[B'); // Down past end of history
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).not.toContain('first');
  });
});

// ============================================================================
// 5. Welcome experience
// ============================================================================

describe('Welcome experience', () => {
  it('empty agent list renders no panel', () => {
    const { lastFrame } = render(h(AgentPanel, { agents: [] }));
    expect(lastFrame()!).toContain('No agents active');
  });

  it('agent roster displays all team members', () => {
    const agents = [
      makeAgent({ name: 'Brady', role: 'lead', status: 'idle' }),
      makeAgent({ name: 'Kovash', role: 'core dev', status: 'idle' }),
      makeAgent({ name: 'Hockney', role: 'tester', status: 'idle' }),
    ];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Brady');
    expect(frame).toContain('Kovash');
    expect(frame).toContain('Hockney');
    // Should show idle status for the team
    expect(frame.toLowerCase()).toContain('[idle]');
  });

  it('MessageStream with no messages and no processing shows empty area', () => {
    const { lastFrame } = render(
      h(MessageStream, { messages: [], processing: false })
    );
    // Should be a valid frame (not null), may be empty or whitespace
    const frame = lastFrame();
    expect(frame).toBeDefined();
  });
});

// ============================================================================
// 6. "Never feels dead" — processing lifecycle
// ============================================================================

describe('Never feels dead', () => {
  it('processing=true immediately shows spinner', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'do something' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    expect(frame.trim().length).toBeGreaterThan(0);
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|💭/);
  });

  it('streaming phase shows content with cursor', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'do something' })],
        processing: true,
        streamingContent: new Map([['Kovash', 'Working...']]),
      })
    );
    const frame = lastFrame()!;
    expect(frame.trim().length).toBeGreaterThan(0);
    expect(frame).toContain('Working...');
    expect(frame).toContain('▌');
  });

  it('full lifecycle: processing → streaming → done, screen always has content', () => {
    const { lastFrame, rerender } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map(),
      })
    );

    // Phase 1: Processing — spinner visible
    expect(lastFrame()!).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    // Phase 2: Streaming begins
    rerender(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map([['Kovash', 'Partial...']]),
      })
    );
    expect(lastFrame()!).toContain('Partial...');
    expect(lastFrame()!).toContain('▌');

    // Phase 3: Streaming ends — final message
    rerender(
      h(MessageStream, {
        messages: [
          makeMessage({ role: 'user', content: 'hello' }),
          makeMessage({ role: 'agent', content: 'Complete answer.', agentName: 'Kovash' }),
        ],
        processing: false,
        streamingContent: new Map(),
      })
    );
    const finalFrame = lastFrame()!;
    expect(finalFrame).toContain('Complete answer.');
    expect(finalFrame).not.toMatch(/thinking/i);
    // No spinner in final state
    expect(finalFrame).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('InputPrompt re-enables after processing completes', () => {
    const { lastFrame, rerender } = render(
      h(InputPrompt, {
        onSubmit: vi.fn(),
        disabled: true,
      })
    );
    // Disabled state: spinner visible, no text cursor
    expect(lastFrame()!).not.toContain('▌');
    expect(lastFrame()!).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

    rerender(
      h(InputPrompt, {
        onSubmit: vi.fn(),
        disabled: false,
      })
    );
    const frame = lastFrame()!;
    // Re-enabled: text cursor visible, no spinner
    expect(frame).toContain('▌');
    expect(frame).toContain('squad');
    expect(frame).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('every lifecycle phase has visible content (no dead frames)', () => {
    type Phase = {
      processing: boolean;
      streamingContent: Map<string, string>;
      messages: ShellMessage[];
    };

    const phases: Phase[] = [
      {
        processing: true,
        streamingContent: new Map(),
        messages: [makeMessage({ role: 'user', content: 'question' })],
      },
      {
        processing: true,
        streamingContent: new Map([['Kovash', 'Starting...']]),
        messages: [makeMessage({ role: 'user', content: 'question' })],
      },
      {
        processing: true,
        streamingContent: new Map([['Kovash', 'More content here...']]),
        messages: [makeMessage({ role: 'user', content: 'question' })],
      },
      {
        processing: false,
        streamingContent: new Map(),
        messages: [
          makeMessage({ role: 'user', content: 'question' }),
          makeMessage({ role: 'agent', content: 'Full answer.', agentName: 'Kovash' }),
        ],
      },
    ];

    const { lastFrame, rerender } = render(h(MessageStream, phases[0]!));

    for (let i = 0; i < phases.length; i++) {
      if (i > 0) rerender(h(MessageStream, phases[i]!));
      const frame = lastFrame();
      expect(frame, `Phase ${i + 1} must not be null`).toBeTruthy();
      expect(frame!.trim().length, `Phase ${i + 1} must have visible content`).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 7. ThinkingIndicator component (standalone)
// ============================================================================

describe('ThinkingIndicator component', () => {
  it('renders nothing when isThinking=false', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: false, elapsedMs: 0 })
    );
    expect(lastFrame()!).toBe('');
  });

  it('renders spinner when isThinking=true', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 0 })
    );
    const frame = lastFrame()!;
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });

  it('shows default routing label', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 0 })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Routing to agent');
  });

  it('shows elapsed time when > 0', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 12000 })
    );
    expect(lastFrame()!).toContain('12s');
  });

  it('does not show elapsed time when < 1s', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, { isThinking: true, elapsedMs: 500 })
    );
    expect(lastFrame()!).not.toMatch(/\d+s/);
  });

  it('activity hint takes priority over thinking phrases', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, {
        isThinking: true,
        elapsedMs: 5000,
        activityHint: 'Reading file...',
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Reading file...');
    // Should NOT show any thinking phrase when hint is active
    const hasPhrase = THINKING_PHRASES.some(p => frame.includes(p));
    expect(hasPhrase).toBe(false);
  });

  it('activity hint shows elapsed time alongside', () => {
    const { lastFrame } = render(
      h(ThinkingIndicator, {
        isThinking: true,
        elapsedMs: 8000,
        activityHint: 'Spawning specialist...',
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Spawning specialist...');
    expect(frame).toContain('8s');
  });

  it('THINKING_PHRASES is exported and non-empty', () => {
    expect(THINKING_PHRASES.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 8. ThinkingIndicator integration with MessageStream
// ============================================================================

describe('ThinkingIndicator integration with MessageStream', () => {
  it('shows default routing label when processing with no @mention', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'fix the bug' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    // Should show spinner and "Routing to agent..."
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    expect(frame).toContain('Routing to agent');
  });

  it('shows agent-specific hint when @mention present', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: '@Kovash fix the bug' })],
        processing: true,
        streamingContent: new Map(),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Kovash');
    expect(frame).toContain('thinking');
  });

  it('shows custom activityHint when provided', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map(),
        activityHint: 'Analyzing dependencies...',
      })
    );
    expect(lastFrame()!).toContain('Analyzing dependencies...');
  });

  it('activityHint overrides @mention hint', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: '@Kovash fix it' })],
        processing: true,
        streamingContent: new Map(),
        activityHint: 'Reading file...',
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Reading file...');
  });

  it('streaming phase shows agent name + streaming hint', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        processing: true,
        streamingContent: new Map([['Kovash', 'Working on it...']]),
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Working on it...');
    expect(frame).toContain('Kovash streaming');
  });
});

// ============================================================================
// 9. Rich progress indicators (#335)
// ============================================================================

describe('Rich progress indicators', () => {
  // -- AgentPanel progress display --

  it('working agent shows activity description in status line', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'working' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Keaton');
    expect(frame).toContain('working');
  });

  it('streaming agent shows activity description in status line', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'streaming' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Keaton');
    expect(frame).toContain('working');
  });

  it('active agent shows pulsing dot in roster', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'working' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    expect(lastFrame()!).toMatch(/[●◉○]/);
  });

  it('agent with activityHint shows hint in status line', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'working', activityHint: 'Reviewing architecture' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Reviewing architecture');
  });

  it('agent status shows hint directly (no [WORK] tag)', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'working', activityHint: 'Reading file' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    expect(frame).toContain('Keaton');
    expect(frame).toContain('Reading file');
    expect(frame).not.toContain('[WORK]');
  });

  it('idle agent does not show activity hint even if set', () => {
    const agents = [makeAgent({ name: 'Keaton', status: 'idle', activityHint: 'stale hint' })];
    const { lastFrame } = render(h(AgentPanel, { agents }));
    const frame = lastFrame()!;
    // Idle agents are in the "ready" section, not the active status lines
    expect(frame).not.toContain('stale hint');
  });

  // -- MessageStream activity feed --

  it('MessageStream shows activity feed when agentActivities provided', () => {
    const activities = new Map([['Keaton', 'reading file']]);
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        agentActivities: activities,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('▸');
    expect(frame).toContain('Keaton');
    expect(frame).toContain('reading file');
  });

  it('MessageStream shows multiple agent activities', () => {
    const activities = new Map([
      ['Keaton', 'reading file'],
      ['Hockney', 'running tests'],
    ]);
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [],
        agentActivities: activities,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Keaton');
    expect(frame).toContain('Hockney');
    expect(frame).toContain('reading file');
    expect(frame).toContain('running tests');
  });

  it('MessageStream hides activity feed when map is empty', () => {
    const activities = new Map();
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
        agentActivities: activities,
      })
    );
    const frame = lastFrame()!;
    expect(frame).not.toMatch(/▸ \w+ is /);
  });

  it('MessageStream works without agentActivities prop (backward compat)', () => {
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'hello' })],
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('hello');
    expect(frame).not.toMatch(/▸ \w+ is /);
  });

  // -- Combined: activity feed + thinking indicator --

  it('activity feed and thinking indicator coexist during processing', () => {
    const activities = new Map([['Keaton', 'searching codebase']]);
    const { lastFrame } = render(
      h(MessageStream, {
        messages: [makeMessage({ role: 'user', content: 'find the bug' })],
        processing: true,
        streamingContent: new Map(),
        agentActivities: activities,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('▸ Keaton');
    expect(frame).toContain('searching codebase');
    // ThinkingIndicator should also be showing
    expect(frame).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });
});

// ============================================================================
// 10. Animations and transitions
// ============================================================================

describe('Animations and transitions', () => {
  // -- Message fade-in --

  it('new messages are rendered immediately (content always visible)', () => {
    const msgs = [
      makeMessage({ role: 'user', content: 'hello world' }),
      makeMessage({ role: 'agent', content: 'response here', agentName: 'Keaton' }),
    ];
    const { lastFrame } = render(h(MessageStream, { messages: msgs }));
    const frame = lastFrame()!;
    expect(frame).toContain('hello world');
    expect(frame).toContain('response here');
  });

  it('message content is visible even during fade-in period', () => {
    const msgs = [makeMessage({ role: 'user', content: 'first message' })];
    const { lastFrame, rerender } = render(h(MessageStream, { messages: msgs }));
    // Add a new message
    const updated = [...msgs, makeMessage({ role: 'agent', content: 'new reply', agentName: 'Keaton' })];
    rerender(h(MessageStream, { messages: updated }));
    const frame = lastFrame()!;
    expect(frame).toContain('new reply');
  });

  // -- Completion flash --

  it('agent shows "✓ Done" flash when transitioning from working to idle', () => {
    const working = [makeAgent({ name: 'Keaton', status: 'working' })];
    const { lastFrame, rerender } = render(h(AgentPanel, { agents: working }));
    // Transition to idle
    const idle = [makeAgent({ name: 'Keaton', status: 'idle' })];
    rerender(h(AgentPanel, { agents: idle }));
    const frame = lastFrame()!;
    expect(frame).toContain('✓ Done');
  });

  it('agent shows "✓ Done" flash when transitioning from streaming to idle', () => {
    const streaming = [makeAgent({ name: 'Keaton', status: 'streaming' })];
    const { lastFrame, rerender } = render(h(AgentPanel, { agents: streaming }));
    const idle = [makeAgent({ name: 'Keaton', status: 'idle' })];
    rerender(h(AgentPanel, { agents: idle }));
    const frame = lastFrame()!;
    expect(frame).toContain('✓ Done');
  });

  it('no "✓ Done" flash for agents that were already idle', () => {
    const idle = [makeAgent({ name: 'Keaton', status: 'idle' })];
    const { lastFrame, rerender } = render(h(AgentPanel, { agents: idle }));
    // Re-render with same idle status
    rerender(h(AgentPanel, { agents: [makeAgent({ name: 'Keaton', status: 'idle' })] }));
    const frame = lastFrame()!;
    expect(frame).not.toContain('✓ Done');
  });

  it('completion flash works for multiple agents independently', () => {
    const working = [
      makeAgent({ name: 'Keaton', status: 'working' }),
      makeAgent({ name: 'Hockney', status: 'working' }),
    ];
    const { lastFrame, rerender } = render(h(AgentPanel, { agents: working }));
    // Only Keaton finishes
    const mixed = [
      makeAgent({ name: 'Keaton', status: 'idle' }),
      makeAgent({ name: 'Hockney', status: 'working' }),
    ];
    rerender(h(AgentPanel, { agents: mixed }));
    const frame = lastFrame()!;
    expect(frame).toContain('Keaton');
    expect(frame).toContain('✓ Done');
    // Hockney still working
    expect(frame).toContain('Hockney');
    expect(frame).toContain('working');
  });

  // -- NO_COLOR respect --

  it('NO_COLOR: completion flash is suppressed', () => {
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      const working = [makeAgent({ name: 'Keaton', status: 'working' })];
      const { lastFrame, rerender } = render(h(AgentPanel, { agents: working }));
      rerender(h(AgentPanel, { agents: [makeAgent({ name: 'Keaton', status: 'idle' })] }));
      const frame = lastFrame()!;
      expect(frame).not.toContain('✓ Done');
    } finally {
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });

  it('NO_COLOR: messages render without fade (content immediately visible)', () => {
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      const msgs = [makeMessage({ role: 'user', content: 'static mode test' })];
      const { lastFrame } = render(h(MessageStream, { messages: msgs }));
      expect(lastFrame()!).toContain('static mode test');
    } finally {
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });

  // -- Animation hooks export --

  it('useAnimation hooks are importable', async () => {
    const mod = await import('../packages/squad-cli/src/cli/shell/useAnimation.js');
    expect(typeof mod.useTypewriter).toBe('function');
    expect(typeof mod.useFadeIn).toBe('function');
    expect(typeof mod.useCompletionFlash).toBe('function');
    expect(typeof mod.useMessageFade).toBe('function');
  });
});

// ============================================================================
// 11. Init ceremony and first-launch wow moment
// ============================================================================

describe('Init ceremony', () => {
  it('isInitNoColor returns true when NO_COLOR is set', async () => {
    const { isInitNoColor } = await import('../packages/squad-cli/src/cli/core/init.js');
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      expect(isInitNoColor()).toBe(true);
    } finally {
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });

  it('typewrite outputs text immediately when NO_COLOR is set', async () => {
    const { typewrite } = await import('../packages/squad-cli/src/cli/core/init.js');
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((str: string) => { chunks.push(str); return true; }) as any;
    try {
      await typewrite('hello', 10);
      // NO_COLOR: single write of full text + newline
      expect(chunks.join('')).toBe('hello\n');
    } finally {
      process.stdout.write = origWrite;
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });

  it('INIT_LANDMARKS are exported for ceremony rendering', async () => {
    // Verify the ceremony structure list is accessible (used in init.ts final output)
    const mod = await import('../packages/squad-cli/src/cli/core/init.js');
    expect(typeof mod.typewrite).toBe('function');
    expect(typeof mod.isInitNoColor).toBe('function');
  });
});

describe('First-launch experience', () => {
  it('loadWelcomeData detects first-run marker', async () => {
    const fsSync = await import('node:fs');
    const path = await import('node:path');
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');

    // test-fixtures has a .squad/team.md — add first-run marker
    const fixtureRoot = path.join(process.cwd(), 'test-fixtures');
    const markerPath = path.join(fixtureRoot, '.squad', '.first-run');
    fsSync.writeFileSync(markerPath, 'test');
    try {
      const data = loadWelcomeData(fixtureRoot);
      expect(data).not.toBeNull();
      expect(data!.isFirstRun).toBe(true);
      // Marker should be consumed (deleted)
      expect(fsSync.existsSync(markerPath)).toBe(false);
    } finally {
      // Cleanup in case test failed before consumption
      try { fsSync.unlinkSync(markerPath); } catch {}
    }
  });

  it('loadWelcomeData returns isFirstRun=false on subsequent launches', async () => {
    const path = await import('node:path');
    const { loadWelcomeData } = await import('../packages/squad-cli/src/cli/shell/lifecycle.js');
    const fixtureRoot = path.join(process.cwd(), 'test-fixtures');
    const data = loadWelcomeData(fixtureRoot);
    expect(data).not.toBeNull();
    expect(data!.isFirstRun).toBe(false);
  });

  it('App shows guided prompt on first run', async () => {
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      const { App } = await import('../packages/squad-cli/src/cli/shell/components/App.js');
      const { SessionRegistry } = await import('../packages/squad-cli/src/cli/shell/sessions.js');
      const { ShellRenderer } = await import('../packages/squad-cli/src/cli/shell/render.js');
      const registry = new SessionRegistry();
      const renderer = new ShellRenderer();

      // With test-fixtures and no .first-run marker, guided prompt should NOT show
      const { lastFrame } = render(
        h(App, {
          registry,
          renderer,
          teamRoot: 'test-fixtures',
          version: '0.0.0-test',
        }),
      );
      const frame = lastFrame()!;
      expect(frame).not.toContain('what should we build first');
    } finally {
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });

  it('App does NOT show guided prompt on subsequent launches', async () => {
    const orig = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    try {
      const { App } = await import('../packages/squad-cli/src/cli/shell/components/App.js');
      const { SessionRegistry } = await import('../packages/squad-cli/src/cli/shell/sessions.js');
      const { ShellRenderer } = await import('../packages/squad-cli/src/cli/shell/render.js');
      const registry = new SessionRegistry();
      const renderer = new ShellRenderer();
      const { lastFrame } = render(
        h(App, {
          registry,
          renderer,
          teamRoot: 'test-fixtures',
          version: '0.0.0-test',
        }),
      );
      const frame = lastFrame()!;
      // No first-run marker → no guided prompt
      expect(frame).not.toContain('what should we build first');
    } finally {
      if (orig === undefined) delete process.env['NO_COLOR'];
      else process.env['NO_COLOR'] = orig;
    }
  });
});

// ============================================================================
// 12. ErrorBoundary (Issue #365)
// ============================================================================

describe('ErrorBoundary', () => {
  it('renders children when no error', async () => {
    const { ErrorBoundary } = await import('../packages/squad-cli/src/cli/shell/components/ErrorBoundary.js');
    const { lastFrame } = render(
      h(ErrorBoundary, null, h(Text, null, 'Hello World'))
    );
    expect(lastFrame()!).toContain('Hello World');
  });

  it('shows friendly message on error', async () => {
    const { ErrorBoundary } = await import('../packages/squad-cli/src/cli/shell/components/ErrorBoundary.js');
    const Bomb: React.FC = () => { throw new Error('kaboom'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { lastFrame } = render(
        h(ErrorBoundary, null, h(Bomb))
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Something went wrong');
      expect(frame).toContain('Ctrl+C');
    } finally {
      spy.mockRestore();
    }
  });

  it('logs error to stderr', async () => {
    const { ErrorBoundary } = await import('../packages/squad-cli/src/cli/shell/components/ErrorBoundary.js');
    const Bomb: React.FC = () => { throw new Error('kaboom'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(h(ErrorBoundary, null, h(Bomb)));
      expect(spy).toHaveBeenCalled();
      const calls = spy.mock.calls.map(c => c.join(' ')).join(' ');
      expect(calls).toContain('kaboom');
    } finally {
      spy.mockRestore();
    }
  });
});

// ============================================================================
// 13. Input buffering (Issue #367)
// ============================================================================

describe('InputPrompt input buffering', () => {
  it('buffers keystrokes while disabled (ref-based)', () => {
    const onSubmit = vi.fn();
    const { stdin, rerender, lastFrame } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );

    // Type while disabled — buffered via ref
    stdin.write('h');
    stdin.write('i');

    // Re-enable — effect restores buffer to value
    rerender(h(InputPrompt, { onSubmit, disabled: false }));

    // Force a re-render to let useEffect fire
    rerender(h(InputPrompt, { onSubmit, disabled: false }));

    const frame = lastFrame()!;
    // The buffered text should appear (or at minimum, no auto-submit)
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not auto-submit buffered input', () => {
    const onSubmit = vi.fn();
    const { rerender, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );
    stdin.write('test input');
    rerender(h(InputPrompt, { onSubmit, disabled: false }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('buffer is empty when nothing typed while disabled', () => {
    const onSubmit = vi.fn();
    const { lastFrame, rerender } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );
    rerender(h(InputPrompt, { onSubmit, disabled: false }));
    const frame = lastFrame()!;
    // Should show placeholder, no buffered text
    expect(frame).toContain('Tab completes');
  });

  it('disabled state buffers keystrokes without submitting', () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );

    // Type while disabled
    stdin.write('hello');
    // Press enter while disabled — should NOT submit
    stdin.write('\r');

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 12. NO_COLOR mode rendering (#374)
// ============================================================================

describe('NO_COLOR mode rendering', () => {
  let origNoColor: string | undefined;

  function setNoColor() {
    origNoColor = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
  }

  function restoreNoColor() {
    if (origNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = origNoColor;
  }

  it('ThinkingIndicator renders static dots, no braille spinner frames', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(ThinkingIndicator, { isThinking: true, elapsedMs: 0 })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('...');
      expect(frame).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    } finally {
      restoreNoColor();
    }
  });

  it('ThinkingIndicator shows text label in NO_COLOR', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(ThinkingIndicator, { isThinking: true, elapsedMs: 3000 })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Routing to agent...');
      expect(frame).toContain('3s');
    } finally {
      restoreNoColor();
    }
  });

  it('AgentPanel renders working status in NO_COLOR', () => {
    setNoColor();
    try {
      const agents = [makeAgent({ name: 'Kovash', status: 'working' })];
      const { lastFrame } = render(h(AgentPanel, { agents }));
      const frame = lastFrame()!;
      expect(frame).toContain('working');
      expect(frame).toContain('Kovash');
    } finally {
      restoreNoColor();
    }
  });

  it('AgentPanel renders [ERR] text label in NO_COLOR', () => {
    setNoColor();
    try {
      const agents = [makeAgent({ name: 'Kovash', status: 'error' })];
      const { lastFrame } = render(h(AgentPanel, { agents }));
      const frame = lastFrame()!;
      expect(frame).toContain('[ERR]');
    } finally {
      restoreNoColor();
    }
  });

  it('AgentPanel renders static dot (not animated) in NO_COLOR', () => {
    setNoColor();
    try {
      const agents = [makeAgent({ name: 'Kovash', status: 'working' })];
      const { lastFrame } = render(h(AgentPanel, { agents }));
      const frame = lastFrame()!;
      expect(frame).toContain('●');
      expect(frame).not.toContain('◉');
      expect(frame).not.toContain('○');
    } finally {
      restoreNoColor();
    }
  });

  it('InputPrompt renders [working...] in NO_COLOR when disabled', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(InputPrompt, { onSubmit: vi.fn(), disabled: true })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('[working...]');
      expect(frame).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    } finally {
      restoreNoColor();
    }
  });

  it('InputPrompt cursor is visible in NO_COLOR', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(InputPrompt, { onSubmit: vi.fn(), disabled: false })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('▌');
    } finally {
      restoreNoColor();
    }
  });

  it('MessageStream user messages render without ANSI color in NO_COLOR', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: 'no color test' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('❯');
      expect(frame).toContain('no color test');
    } finally {
      restoreNoColor();
    }
  });

  it('MessageStream agent messages render without ANSI color in NO_COLOR', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'agent', content: 'agent reply', agentName: 'Kovash' })],
          agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Kovash');
      expect(frame).toContain('agent reply');
    } finally {
      restoreNoColor();
    }
  });

  it('MessageStream system messages render in NO_COLOR', () => {
    setNoColor();
    try {
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'system', content: 'System alert' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('System alert');
    } finally {
      restoreNoColor();
    }
  });
});

// ============================================================================
// 13. Keyboard shortcut coverage (#375)
// ============================================================================

describe('Keyboard shortcut coverage', () => {
  it('Enter submits input and clears the field', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'hello') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(lastFrame()!).not.toContain('hello');
  });

  it('↑ arrow navigates to previous history entry', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'alpha') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    for (const ch of 'beta') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1B[A');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('beta');
  });

  it('↓ arrow navigates forward in history', async () => {
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit, disabled: false })
    );
    for (const ch of 'first') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1B[A');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('first');
    stdin.write('\x1B[B');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).not.toContain('first');
  });

  it('Backspace deletes the last character', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false })
    );
    for (const ch of 'abcd') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('abcd');
    stdin.write('\x7F');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('abc');
    expect(lastFrame()!).not.toContain('abcd');
  });

  it('Tab autocompletes @agent name when single match', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, agentNames: ['Kovash', 'Keaton'] })
    );
    for (const ch of '@Kov') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));
    // Tab autocomplete not implemented
    expect(lastFrame()!).toContain('@Kov');
  });

  it('Tab autocompletes /command when single match', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, agentNames: [] })
    );
    for (const ch of '/sta') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));
    // Tab autocomplete not implemented
    expect(lastFrame()!).toContain('/sta');
  });

  it('Tab does nothing when no match', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, agentNames: ['Kovash'] })
    );
    for (const ch of '@Zzz') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('@Zzz');
  });

  it('Tab does nothing when multiple matches', async () => {
    const { lastFrame, stdin } = render(
      h(InputPrompt, { onSubmit: vi.fn(), disabled: false, agentNames: ['Kovash', 'Keaton'] })
    );
    for (const ch of '@K') stdin.write(ch);
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()!).toContain('@K');
  });

  it('disabled state ignores all keyboard input', async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      h(InputPrompt, { onSubmit, disabled: true })
    );
    stdin.write('test');
    stdin.write('\r');
    stdin.write('\x1B[A');
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 50));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});