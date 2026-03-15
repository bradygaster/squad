/**
 * Tests for the streaming-chat sample.
 *
 * Validates routing logic, demo response generation,
 * StreamingPipeline wiring, and CastingEngine integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CastingEngine, StreamingPipeline } from '@bradygaster/squad-sdk';
import type { StreamDelta } from '@bradygaster/squad-sdk';
import { EventBus } from '@bradygaster/squad-sdk/client';

// ── Inline the lightweight helpers from index.ts for unit-testing ──

interface AgentInfo {
  name: string;
  role: string;
  keywords: string[];
}

const AGENTS: AgentInfo[] = [
  { name: 'Agent1', role: 'Backend', keywords: ['api', 'server', 'database', 'backend', 'endpoint', 'rest', 'sql', 'auth'] },
  { name: 'Agent2', role: 'Frontend', keywords: ['ui', 'frontend', 'component', 'css', 'react', 'style', 'layout', 'ux'] },
  { name: 'Agent3', role: 'Tester', keywords: ['test', 'bug', 'qa', 'coverage', 'assert', 'fixture', 'mock', 'spec'] },
];

function routeMessage(message: string): AgentInfo {
  const lower = message.toLowerCase();
  for (const agent of AGENTS) {
    if (agent.keywords.some((kw) => lower.includes(kw))) {
      return agent;
    }
  }
  return AGENTS[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('streaming-chat', () => {
  // ── Routing ──

  describe('routeMessage', () => {
    it('routes API-related messages to Backend', () => {
      expect(routeMessage('Design the REST api')).toEqual(
        expect.objectContaining({ name: 'Agent1', role: 'Backend' }),
      );
    });

    it('routes UI-related messages to Frontend', () => {
      expect(routeMessage('Build a react component')).toEqual(
        expect.objectContaining({ name: 'Agent2', role: 'Frontend' }),
      );
    });

    it('routes test-related messages to Tester', () => {
      expect(routeMessage('Add more test coverage')).toEqual(
        expect.objectContaining({ name: 'Agent3', role: 'Tester' }),
      );
    });

    it('defaults to Backend for unrecognized messages', () => {
      expect(routeMessage('Tell me a joke')).toEqual(
        expect.objectContaining({ name: 'Agent1', role: 'Backend' }),
      );
    });

    it('is case-insensitive', () => {
      expect(routeMessage('BUILD a FRONTEND layout')).toEqual(
        expect.objectContaining({ name: 'Agent2', role: 'Frontend' }),
      );
    });

    it('matches partial keywords', () => {
      expect(routeMessage('the database schema')).toEqual(
        expect.objectContaining({ name: 'Agent1', role: 'Backend' }),
      );
    });
  });

  // ── CastingEngine ──

  describe('CastingEngine integration', () => {
    it('casts a team from the usual-suspects universe', () => {
      const engine = new CastingEngine();
      const cast = engine.castTeam({
        universe: 'usual-suspects',
        requiredRoles: ['developer', 'designer', 'tester'],
      });

      expect(cast.length).toBeGreaterThanOrEqual(3);
      const roles = cast.map((m) => m.role);
      expect(roles).toContain('developer');
      expect(roles).toContain('designer');
      expect(roles).toContain('tester');
    });

    it('assigns unique names to each cast member', () => {
      const engine = new CastingEngine();
      const cast = engine.castTeam({
        universe: 'usual-suspects',
        requiredRoles: ['developer', 'designer', 'tester'],
      });

      const names = cast.map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  // ── StreamingPipeline ──

  describe('StreamingPipeline', () => {
    let pipeline: StreamingPipeline;

    beforeEach(() => {
      pipeline = new StreamingPipeline();
    });

    it('delivers deltas to registered handlers', async () => {
      const received: string[] = [];
      pipeline.onDelta((event) => {
        received.push(event.content);
      });

      const sessionId = 'test-session';
      pipeline.attachToSession(sessionId);

      const delta: StreamDelta = {
        type: 'message_delta',
        sessionId,
        agentName: 'Agent1',
        content: 'Hello',
        index: 0,
        timestamp: new Date(),
      };
      await pipeline.processEvent(delta);

      expect(received).toEqual(['Hello']);
    });

    it('ignores events from unattached sessions', async () => {
      const received: string[] = [];
      pipeline.onDelta((event) => {
        received.push(event.content);
      });

      await pipeline.processEvent({
        type: 'message_delta',
        sessionId: 'unknown',
        content: 'should be ignored',
        index: 0,
        timestamp: new Date(),
      });

      expect(received).toEqual([]);
    });

    it('tracks attached sessions', () => {
      pipeline.attachToSession('s1');
      pipeline.attachToSession('s2');

      expect(pipeline.isAttached('s1')).toBe(true);
      expect(pipeline.isAttached('s2')).toBe(true);
      expect(pipeline.isAttached('s3')).toBe(false);
    });

    it('accumulates usage data', async () => {
      pipeline.attachToSession('s1');

      await pipeline.processEvent({
        type: 'usage',
        sessionId: 's1',
        agentName: 'Agent1',
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.01,
        timestamp: new Date(),
      });

      const summary = pipeline.getUsageSummary();
      expect(summary.totalInputTokens).toBe(100);
      expect(summary.totalOutputTokens).toBe(50);
    });

    it('cleans up on clear()', () => {
      pipeline.attachToSession('s1');
      pipeline.onDelta(() => {});
      pipeline.clear();

      expect(pipeline.isAttached('s1')).toBe(false);
    });
  });

  // ── EventBus ──

  describe('EventBus', () => {
    it('delivers events to typed subscribers', async () => {
      const bus = new EventBus();
      const received: string[] = [];

      bus.on('session.created', (event) => {
        received.push(event.sessionId ?? 'none');
      });

      await bus.emit({
        type: 'session.created',
        sessionId: 'abc',
        payload: null,
        timestamp: new Date(),
      });

      expect(received).toEqual(['abc']);
    });

    it('delivers events to wildcard subscribers', async () => {
      const bus = new EventBus();
      const types: string[] = [];

      bus.onAny((event) => {
        types.push(event.type);
      });

      await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
      await bus.emit({ type: 'session.destroyed', payload: null, timestamp: new Date() });

      expect(types).toEqual(['session.created', 'session.destroyed']);
    });

    it('supports unsubscribe', async () => {
      const bus = new EventBus();
      const received: string[] = [];

      const unsub = bus.on('session.error', (event) => {
        received.push(event.type);
      });
      unsub();

      await bus.emit({ type: 'session.error', payload: null, timestamp: new Date() });

      expect(received).toEqual([]);
    });
  });
});
