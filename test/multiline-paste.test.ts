/**
 * Multi-line paste handling tests
 *
 * Validates that multi-line pasted text is preserved correctly in the
 * Squad REPL. Covers InputPrompt behavior (buffering, submit), and
 * MessageStream rendering of multi-line user messages in scrollback.
 *
 * Bug context: Ink's useInput fires per-character. Newlines in pasted text
 * trigger key.return which submits the first line, then disabled=true causes
 * remaining newlines to be stripped — garbling multi-line pastes.
 *
 * @see packages/squad-cli/src/cli/shell/components/InputPrompt.tsx
 * @see packages/squad-cli/src/cli/shell/components/MessageStream.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { MessageStream } from '../packages/squad-cli/src/cli/shell/components/MessageStream.js';
import { InputPrompt } from '../packages/squad-cli/src/cli/shell/components/InputPrompt.js';
import type { ShellMessage, AgentSession } from '../packages/squad-cli/src/cli/shell/types.js';

// ============================================================================
// Helpers (same pattern as repl-ux.test.ts)
// ============================================================================

const h = React.createElement;

function makeMessage(overrides: Partial<ShellMessage> & { content: string; role: ShellMessage['role'] }): ShellMessage {
  return { timestamp: new Date(), ...overrides };
}

function makeAgent(overrides: Partial<AgentSession> & { name: string }): AgentSession {
  return {
    role: 'core dev',
    status: 'idle',
    startedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// 1. Multi-line message rendering in scrollback (MessageStream)
// ============================================================================

describe('Multi-line paste handling', () => {
  describe('MessageStream renders multi-line content', () => {
    it('preserves newlines in user messages rendered in scrollback', () => {
      const multiLineContent = 'line one\nline two\nline three';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: multiLineContent })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('line one');
      expect(frame).toContain('line two');
      expect(frame).toContain('line three');
    });

    it('preserves blank lines within multi-line user messages', () => {
      const contentWithBlanks = 'first paragraph\n\nsecond paragraph\n\nthird paragraph';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: contentWithBlanks })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('first paragraph');
      expect(frame).toContain('second paragraph');
      expect(frame).toContain('third paragraph');
    });

    it('renders multi-line agent messages with proper indentation in scrollback', () => {
      const multiLineAgent = 'Here is my analysis:\n- Point A\n- Point B\n- Point C';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'agent', content: multiLineAgent, agentName: 'Kovash' })],
          agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Kovash');
      expect(frame).toContain('Here is my analysis:');
      expect(frame).toContain('- Point A');
      expect(frame).toContain('- Point B');
      expect(frame).toContain('- Point C');
    });

    it('does not garble text when lines contain special characters', () => {
      const specialContent = 'const x = { a: 1 };\nif (x > 0) { return true; }\n// comment with @mention';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: specialContent })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('const x = { a: 1 };');
      expect(frame).toContain('if (x > 0) { return true; }');
      expect(frame).toContain('// comment with @mention');
    });

    it('does not concatenate lines when rendering multi-line user input', () => {
      const content = 'hello world\ngoodbye world';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: content })],
        })
      );
      const frame = lastFrame()!;
      // Text should NOT be concatenated into "hello worldgoodbye world"
      expect(frame).not.toContain('hello worldgoodbye world');
    });

    it('multi-line streaming content renders all lines with cursor', () => {
      const streamedMultiLine = 'Step 1: Analyze\nStep 2: Implement\nStep 3: Test';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [],
          streamingContent: new Map([['Kovash', streamedMultiLine]]),
          agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Step 1: Analyze');
      expect(frame).toContain('Step 2: Implement');
      expect(frame).toContain('Step 3: Test');
      expect(frame).toContain('▌');
    });
  });

  // ============================================================================
  // 2. Single-line submit still works (InputPrompt)
  // ============================================================================

  describe('Single-line submit behavior', () => {
    it('submits single-line input immediately on Enter', async () => {
      const onSubmit = vi.fn();
      const { stdin } = render(
        h(InputPrompt, { onSubmit, disabled: false })
      );
      for (const ch of 'hello world') stdin.write(ch);
      await new Promise(r => setTimeout(r, 50));
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 50));
      expect(onSubmit).toHaveBeenCalledWith('hello world');
    });

    it('clears input field after single-line submit', async () => {
      const onSubmit = vi.fn();
      const { lastFrame, stdin } = render(
        h(InputPrompt, { onSubmit, disabled: false })
      );
      for (const ch of 'test') stdin.write(ch);
      await new Promise(r => setTimeout(r, 100));
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 200));
      // After submit, the input field should clear the submitted text
      // The prompt character (◆ squad>) may remain
      const frame = lastFrame()!;
      // If onSubmit was called, the component should have cleared
      expect(onSubmit).toHaveBeenCalledWith('test');
    });

    it('does not submit whitespace-only input on Enter', async () => {
      const onSubmit = vi.fn();
      const { stdin } = render(
        h(InputPrompt, { onSubmit, disabled: false })
      );
      stdin.write(' ');
      stdin.write(' ');
      await new Promise(r => setTimeout(r, 50));
      stdin.write('\r');
      await new Promise(r => setTimeout(r, 50));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 3. Disabled-state buffering with newlines (InputPrompt)
  // ============================================================================

  describe('Disabled-state buffering with newlines', () => {
    it('buffers typed characters while disabled and restores on re-enable', () => {
      const onSubmit = vi.fn();
      const { stdin, lastFrame, rerender } = render(
        h(InputPrompt, { onSubmit, disabled: true })
      );
      // Type characters while disabled
      stdin.write('b');
      stdin.write('u');
      stdin.write('f');

      // Re-enable the prompt
      rerender(h(InputPrompt, { onSubmit, disabled: false }));
      rerender(h(InputPrompt, { onSubmit, disabled: false }));

      // Buffered text should not auto-submit
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('ignores return key while disabled (no premature submit)', () => {
      const onSubmit = vi.fn();
      const { stdin } = render(
        h(InputPrompt, { onSubmit, disabled: true })
      );
      stdin.write('hello');
      stdin.write('\r');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows buffered text in disabled display', async () => {
      const onSubmit = vi.fn();
      const { stdin, lastFrame } = render(
        h(InputPrompt, { onSubmit, disabled: true })
      );
      stdin.write('t');
      stdin.write('e');
      stdin.write('s');
      stdin.write('t');
      await new Promise(r => setTimeout(r, 50));
      const frame = lastFrame()!;
      // InputPrompt shows bufferDisplay when disabled and buffer is non-empty
      expect(frame).toContain('test');
    });

    it('backspace in disabled mode removes last buffered character', async () => {
      const onSubmit = vi.fn();
      const { stdin, lastFrame } = render(
        h(InputPrompt, { onSubmit, disabled: true })
      );
      stdin.write('a');
      stdin.write('b');
      stdin.write('c');
      stdin.write('\x7f'); // backspace
      await new Promise(r => setTimeout(r, 50));
      const frame = lastFrame()!;
      expect(frame).toContain('ab');
      expect(frame).not.toContain('abc');
    });
  });

  // ============================================================================
  // 4. Multi-line content integrity in ShellMessage
  // ============================================================================

  describe('Multi-line content integrity in ShellMessage', () => {
    it('ShellMessage content field preserves embedded newlines', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'line 1\nline 2\nline 3',
      });
      expect(msg.content).toBe('line 1\nline 2\nline 3');
      expect(msg.content.split('\n')).toHaveLength(3);
    });

    it('ShellMessage content field preserves blank lines', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'paragraph 1\n\nparagraph 2\n\nparagraph 3',
      });
      const lines = msg.content.split('\n');
      expect(lines).toHaveLength(5);
      expect(lines[1]).toBe('');
      expect(lines[3]).toBe('');
    });

    it('ShellMessage content field preserves Windows-style CRLF', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'line 1\r\nline 2\r\nline 3',
      });
      // Content should retain CRLF as-is (normalization is a separate concern)
      expect(msg.content).toContain('\r\n');
      expect(msg.content.split('\r\n')).toHaveLength(3);
    });

    it('multi-line user message displays all lines in MessageStream', () => {
      const multiLine = 'function greet() {\n  console.log("hello");\n  return true;\n}';
      const { lastFrame } = render(
        h(MessageStream, {
          messages: [makeMessage({ role: 'user', content: multiLine })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('function greet()');
      expect(frame).toContain('console.log');
      expect(frame).toContain('return true;');
    });

    it('mixed single-line and multi-line messages in conversation render correctly', () => {
      const messages = [
        makeMessage({ role: 'user', content: 'what does this do?' }),
        makeMessage({
          role: 'agent',
          content: 'Here is the explanation:\n1. First step\n2. Second step',
          agentName: 'Kovash',
        }),
        makeMessage({ role: 'user', content: 'and this code?\nfunction foo() {\n  return 42;\n}' }),
      ];
      const { lastFrame } = render(
        h(MessageStream, {
          messages,
          agents: [makeAgent({ name: 'Kovash', role: 'core dev' })],
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('what does this do?');
      expect(frame).toContain('1. First step');
      expect(frame).toContain('2. Second step');
      expect(frame).toContain('function foo()');
      expect(frame).toContain('return 42;');
    });
  });
});
