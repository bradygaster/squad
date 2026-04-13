/**
 * Integration tests for SDK runtime modules — session registry, coordinator parser.
 *
 * Originally tested shell internals; updated to import from SDK after shell removal.
 *
 * @module test/shell
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SessionRegistry } from '@bradygaster/squad-sdk/runtime/session-registry';
import {
  parseCoordinatorResponse,
  formatConversationContext,
} from '@bradygaster/squad-sdk/runtime/coordinator-parser';
import type { ShellMessage } from '@bradygaster/squad-sdk/runtime/shell-types';

// ============================================================================
// 1. SessionRegistry
// ============================================================================

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('register creates a session with idle status', () => {
    const s = registry.register('hockney', 'Tester');
    expect(s.name).toBe('hockney');
    expect(s.role).toBe('Tester');
    expect(s.status).toBe('idle');
    expect(s.startedAt).toBeInstanceOf(Date);
  });

  it('get retrieves a registered session', () => {
    registry.register('fenster', 'Core Dev');
    expect(registry.get('fenster')?.role).toBe('Core Dev');
  });

  it('get returns undefined for unknown name', () => {
    expect(registry.get('nobody')).toBeUndefined();
  });

  it('getAll returns every registered session', () => {
    registry.register('a', 'r1');
    registry.register('b', 'r2');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getActive filters to working/streaming sessions', () => {
    registry.register('idle-agent', 'role');
    registry.register('busy-agent', 'role');
    registry.register('stream-agent', 'role');
    registry.updateStatus('busy-agent', 'working');
    registry.updateStatus('stream-agent', 'streaming');
    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.name).sort()).toEqual(['busy-agent', 'stream-agent']);
  });

  it('updateStatus changes session status', () => {
    registry.register('x', 'role');
    registry.updateStatus('x', 'error');
    expect(registry.get('x')?.status).toBe('error');
  });

  it('remove deletes a session and returns true', () => {
    registry.register('x', 'role');
    expect(registry.remove('x')).toBe(true);
    expect(registry.get('x')).toBeUndefined();
  });

  it('remove returns false for unknown name', () => {
    expect(registry.remove('ghost')).toBe(false);
  });

  it('clear removes all sessions', () => {
    registry.register('a', 'r');
    registry.register('b', 'r');
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});

// ============================================================================
// 2. Coordinator parser
// ============================================================================

describe('Coordinator', () => {
  describe('parseCoordinatorResponse', () => {
    it('parses DIRECT responses', () => {
      const result = parseCoordinatorResponse('DIRECT: The build is green.');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('The build is green.');
    });

    it('parses ROUTE responses', () => {
      const result = parseCoordinatorResponse(
        'ROUTE: Fenster\nTASK: Fix the parser\nCONTEXT: Related to issue #42',
      );
      expect(result.type).toBe('route');
      expect(result.routes).toHaveLength(1);
      expect(result.routes![0]!.agent).toBe('Fenster');
      expect(result.routes![0]!.task).toBe('Fix the parser');
      expect(result.routes![0]!.context).toBe('Related to issue #42');
    });

    it('parses ROUTE without CONTEXT', () => {
      const result = parseCoordinatorResponse('ROUTE: Hockney\nTASK: Run tests');
      expect(result.type).toBe('route');
      expect(result.routes![0]!.agent).toBe('Hockney');
      expect(result.routes![0]!.context).toBeUndefined();
    });

    it('parses MULTI responses', () => {
      const result = parseCoordinatorResponse(
        'MULTI:\n- Fenster: Implement the feature\n- Hockney: Write tests',
      );
      expect(result.type).toBe('multi');
      expect(result.routes).toHaveLength(2);
      expect(result.routes![0]!.agent).toBe('Fenster');
      expect(result.routes![1]!.agent).toBe('Hockney');
    });

    it('falls back to direct for unknown format', () => {
      const result = parseCoordinatorResponse('Just some random text');
      expect(result.type).toBe('direct');
      expect(result.directAnswer).toBe('Just some random text');
    });
  });

  describe('formatConversationContext', () => {
    const msgs: ShellMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'user' as const,
      content: `message-${i}`,
      timestamp: new Date(),
    }));

    it('formats all messages with role prefix', () => {
      const ctx = formatConversationContext(msgs, 10);
      expect(ctx).toContain('[user]: message-0');
      expect(ctx).toContain('[user]: message-4');
    });

    it('respects maxMessages limit', () => {
      const ctx = formatConversationContext(msgs, 2);
      expect(ctx).not.toContain('message-0');
      expect(ctx).toContain('message-3');
      expect(ctx).toContain('message-4');
    });

    it('uses agentName prefix when present', () => {
      const agentMsgs: ShellMessage[] = [
        { role: 'agent', agentName: 'fenster', content: 'done', timestamp: new Date() },
      ];
      const ctx = formatConversationContext(agentMsgs);
      expect(ctx).toContain('[fenster]: done');
    });
  });
});
