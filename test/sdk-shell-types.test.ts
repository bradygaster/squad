/**
 * Type-check tests for shell-types module extracted to SDK.
 * Verifies that interfaces are importable and structurally correct.
 */
import { describe, it, expect } from 'vitest';
import type { ShellState, ShellMessage, AgentSession } from '@bradygaster/squad-sdk/runtime/shell-types';

describe('Shell types (SDK)', () => {
  it('ShellMessage interface is structurally correct', () => {
    const msg: ShellMessage = {
      role: 'user',
      content: 'hello',
      timestamp: new Date(),
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('ShellMessage supports optional agentName', () => {
    const msg: ShellMessage = {
      role: 'agent',
      agentName: 'control',
      content: 'response',
      timestamp: new Date(),
    };
    expect(msg.agentName).toBe('control');
  });

  it('AgentSession interface is structurally correct', () => {
    const session: AgentSession = {
      name: 'control',
      role: 'engineer',
      status: 'idle',
      startedAt: new Date(),
    };
    expect(session.name).toBe('control');
    expect(session.status).toBe('idle');
  });

  it('AgentSession supports optional fields', () => {
    const session: AgentSession = {
      name: 'scribe',
      role: 'writer',
      status: 'working',
      startedAt: new Date(),
      activityHint: 'writing docs',
      model: 'gpt-4',
    };
    expect(session.activityHint).toBe('writing docs');
    expect(session.model).toBe('gpt-4');
  });

  it('ShellState interface is structurally correct', () => {
    const state: ShellState = {
      status: 'ready',
      activeAgents: new Map(),
      messageHistory: [],
    };
    expect(state.status).toBe('ready');
    expect(state.activeAgents).toBeInstanceOf(Map);
    expect(state.messageHistory).toEqual([]);
  });

  it('ShellState status accepts all valid values', () => {
    const statuses: ShellState['status'][] = ['initializing', 'ready', 'processing', 'error'];
    for (const s of statuses) {
      const state: ShellState = {
        status: s,
        activeAgents: new Map(),
        messageHistory: [],
      };
      expect(state.status).toBe(s);
    }
  });

  it('AgentSession status accepts all valid values', () => {
    const statuses: AgentSession['status'][] = ['idle', 'working', 'streaming', 'error'];
    for (const s of statuses) {
      const session: AgentSession = {
        name: 'test',
        role: 'tester',
        status: s,
        startedAt: new Date(),
      };
      expect(session.status).toBe(s);
    }
  });
});
