/**
 * Tests for Parallel Fan-Out Session Spawning (M1-10, Issue #130)
 * 
 * Validates:
 * - Parallel spawning of multiple agents
 * - Error isolation (one failure doesn't affect others)
 * - Event aggregation to coordinator's event bus
 * - Charter compilation → model resolution → session creation flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spawnParallel,
  aggregateSessionEvents,
  type AgentSpawnConfig,
  type SpawnResult,
  type FanOutDependencies,
} from '@bradygaster/squad-sdk/coordinator';
import { EventBus } from '@bradygaster/squad-sdk/client';
import { SessionPool } from '@bradygaster/squad-sdk/client';
import type { AgentCharter } from '@bradygaster/squad-sdk/agents';

describe('spawnParallel', () => {
  let mockDeps: FanOutDependencies;
  let eventBus: EventBus;
  let sessionPool: SessionPool;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionPool = new SessionPool({ maxConcurrent: 10, idleTimeout: 60000, healthCheckInterval: 30000 });

    mockDeps = {
      compileCharter: vi.fn(async (agentName: string) => ({
        name: agentName,
        displayName: `${agentName} Agent`,
        role: 'Developer',
        expertise: ['TypeScript'],
        style: 'Professional',
        prompt: `You are ${agentName}`,
        modelPreference: 'claude-sonnet-4.5',
      } as AgentCharter)),

      resolveModel: vi.fn(async (charter: AgentCharter, override?: string) => {
        return override || charter.modelPreference || 'claude-sonnet-4.5';
      }),

      createSession: vi.fn(async (config: any) => {
        const sessionId = `session-${Math.random().toString(36).slice(2, 11)}`;
        return {
          sessionId,
          sendMessage: vi.fn(async (opts: any) => {
            // Mock message send
          }),
        };
      }),

      sessionPool,
      eventBus,
    };
  });

  it('should spawn multiple agents in parallel', async () => {
    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Implement feature A' },
      { agentName: 'verbal', task: 'Write documentation' },
      { agentName: 'hockney', task: 'Create tests' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'success')).toBe(true);
    expect(results.every(r => r.sessionId)).toBe(true);

    // Verify all charters were compiled
    expect(mockDeps.compileCharter).toHaveBeenCalledTimes(3);
    expect(mockDeps.compileCharter).toHaveBeenCalledWith('fenster');
    expect(mockDeps.compileCharter).toHaveBeenCalledWith('verbal');
    expect(mockDeps.compileCharter).toHaveBeenCalledWith('hockney');

    // Verify all sessions were created
    expect(mockDeps.createSession).toHaveBeenCalledTimes(3);

    // Verify all sessions were added to pool
    expect(sessionPool.size).toBe(3);
  });

  it('should handle priority levels', async () => {
    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Critical bug fix', priority: 'critical' },
      { agentName: 'verbal', task: 'Documentation update', priority: 'low' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === 'success')).toBe(true);
  });

  it('should pass context to agents', async () => {
    const configs: AgentSpawnConfig[] = [
      {
        agentName: 'fenster',
        task: 'Implement API endpoint',
        context: 'Related to PRD-5, use Express framework',
      },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].status).toBe('success');

    // Verify sendMessage was called with context in prompt
    const createSessionMock = mockDeps.createSession as any;
    const mockSession = await createSessionMock.mock.results[0].value;
    expect(mockSession.sendMessage).toHaveBeenCalled();
    
    const sentPrompt = mockSession.sendMessage.mock.calls[0][0].prompt;
    expect(sentPrompt).toContain('Implement API endpoint');
    expect(sentPrompt).toContain('Related to PRD-5');
  });

  it('should include current date in prompt', async () => {
    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Build feature' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].status).toBe('success');

    const createSessionMock = mockDeps.createSession as any;
    const mockSession = await createSessionMock.mock.results[0].value;
    const sentPrompt = mockSession.sendMessage.mock.calls[0][0].prompt;

    // Prompt must contain a Current Date with ISO timestamp
    expect(sentPrompt).toContain('**Current Date:**');
    const dateMatch = sentPrompt.match(/\*\*Current Date:\*\*\s*(\S+)/);
    expect(dateMatch).not.toBeNull();
    const timestamp = dateMatch![1];
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should handle model overrides', async () => {
    const configs: AgentSpawnConfig[] = [
      {
        agentName: 'fenster',
        task: 'Complex refactoring',
        modelOverride: 'claude-opus-4.6',
      },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].status).toBe('success');
    
    // When modelOverride is provided, resolveModel should not be called
    expect(mockDeps.resolveModel).not.toHaveBeenCalled();
    
    // Verify the session was created with the override model
    expect(mockDeps.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4.6',
      })
    );
  });

  it('should isolate errors - one failure does not affect others', async () => {
    // Make one charter compilation fail
    (mockDeps.compileCharter as any).mockImplementation(async (agentName: string) => {
      if (agentName === 'failing-agent') {
        throw new Error('Charter compilation failed');
      }
      return {
        name: agentName,
        displayName: `${agentName} Agent`,
        role: 'Developer',
        expertise: ['TypeScript'],
        style: 'Professional',
        prompt: `You are ${agentName}`,
        modelPreference: 'claude-sonnet-4.5',
      } as AgentCharter;
    });

    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Task 1' },
      { agentName: 'failing-agent', task: 'Task 2' },
      { agentName: 'verbal', task: 'Task 3' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results).toHaveLength(3);

    // First and third should succeed
    expect(results[0].status).toBe('success');
    expect(results[0].agentName).toBe('fenster');
    expect(results[2].status).toBe('success');
    expect(results[2].agentName).toBe('verbal');

    // Second should fail
    expect(results[1].status).toBe('failed');
    expect(results[1].agentName).toBe('failing-agent');
    expect(results[1].error).toContain('Charter compilation failed');
    expect(results[1].sessionId).toBeUndefined();

    // Two successful sessions should be in pool
    expect(sessionPool.size).toBe(2);
  });

  it('should emit spawn events to event bus', async () => {
    const emittedEvents: any[] = [];
    eventBus.on('session.created', (event) => {
      emittedEvents.push(event);
    });

    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Task 1' },
      { agentName: 'verbal', task: 'Task 2' },
    ];

    await spawnParallel(configs, mockDeps);

    expect(emittedEvents).toHaveLength(2);
    expect(emittedEvents[0].payload.agentName).toBe('fenster');
    expect(emittedEvents[1].payload.agentName).toBe('verbal');
  });

  it('should emit spawn failure events', async () => {
    (mockDeps.compileCharter as any).mockRejectedValue(new Error('Network error'));

    const failureEvents: any[] = [];
    eventBus.on('session.error', (event) => {
      failureEvents.push(event);
    });

    const configs: AgentSpawnConfig[] = [
      { agentName: 'failing-agent', task: 'Task' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].status).toBe('failed');
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0].payload.agentName).toBe('failing-agent');
    expect(failureEvents[0].payload.error).toContain('Network error');
  });

  it('should track spawn timing', async () => {
    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Task' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].startTime).toBeInstanceOf(Date);
    expect(results[0].endTime).toBeInstanceOf(Date);
    expect(results[0].endTime.getTime()).toBeGreaterThanOrEqual(results[0].startTime.getTime());
  });

  it('should handle empty config array', async () => {
    const results = await spawnParallel([], mockDeps);
    expect(results).toHaveLength(0);
  });

  it('should handle session creation failures', async () => {
    (mockDeps.createSession as any).mockRejectedValue(new Error('Session creation failed'));

    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'Task' },
    ];

    const results = await spawnParallel(configs, mockDeps);

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('Session creation failed');
  });
});

describe('aggregateSessionEvents', () => {
  it('should forward session events to coordinator event bus', () => {
    const coordinatorEventBus = new EventBus();
    const receivedEvents: any[] = [];

    coordinatorEventBus.on('tool.start', (event) => {
      receivedEvents.push(event);
    });

    const mockSession = {
      on: vi.fn((eventType: string, handler: any) => {
        // Simulate tool.start event
        if (eventType === 'tool.start') {
          handler({ toolName: 'squad_route', timestamp: Date.now() });
        }
      }),
    };

    aggregateSessionEvents('session-123', 'fenster', mockSession, coordinatorEventBus);

    expect(mockSession.on).toHaveBeenCalled();
    expect(receivedEvents.length).toBeGreaterThan(0);
  });

  it('should add agent name to forwarded events', () => {
    const coordinatorEventBus = new EventBus();
    const receivedEvents: any[] = [];

    coordinatorEventBus.on('message.complete', (event) => {
      receivedEvents.push(event);
    });

    const mockSession = {
      on: vi.fn((eventType: string, handler: any) => {
        if (eventType === 'message.complete') {
          handler({ content: 'Task complete' });
        }
      }),
    };

    aggregateSessionEvents('session-456', 'verbal', mockSession, coordinatorEventBus);

    expect(receivedEvents.length).toBeGreaterThan(0);
    expect(receivedEvents[0].payload.agentName).toBe('verbal');
  });

  it('should handle session without event emitter', () => {
    const coordinatorEventBus = new EventBus();
    const mockSession = {}; // No 'on' method

    // Should not throw
    expect(() => {
      aggregateSessionEvents('session-789', 'fenster', mockSession, coordinatorEventBus);
    }).not.toThrow();
  });
});
