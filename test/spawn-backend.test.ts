import { describe, it, expect, vi } from 'vitest';
import {
  SessionSpawnBackend,
  TaskSpawnBackend,
  type CreateSessionFn,
  type SpawnHandle,
} from '@bradygaster/squad-sdk/coordinator';

describe('spawn backends', () => {
  it('TaskSpawnBackend creates a real session and sends the initial prompt', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const createSession = vi.fn(async () => ({
      sessionId: 'task-session-123',
      sendMessage,
    })) satisfies CreateSessionFn;

    const backend = new TaskSpawnBackend(createSession);
    const handle = await backend.spawn({
      agentName: 'fenster',
      name: 'fenster',
      description: 'fenster: fix the bug',
      prompt: 'Investigate and fix the bug',
      model: 'claude-sonnet-4.5',
      reasoningEffort: 'high',
    });

    expect(handle).toEqual({
      id: 'task-session-123',
      agentName: 'fenster',
      platform: 'cli',
      success: true,
    });
    expect(createSession).toHaveBeenCalledWith({
      model: 'claude-sonnet-4.5',
      clientName: 'squad-agent-fenster',
      reasoningEffort: 'high',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      prompt: 'Investigate and fix the bug',
      mode: 'immediate',
    });
  });

  it('SessionSpawnBackend creates a real sub-session with kickoff config', async () => {
    const createSession = vi.fn(async () => ({
      sessionId: 'sub-session-123',
      sendMessage: vi.fn(async () => undefined),
    })) satisfies CreateSessionFn;

    const backend = new SessionSpawnBackend(createSession, {
      projectId: 'project-123',
      coordinateWithCreator: false,
      notifyOnIdle: 'always',
      mode: 'plan',
    });

    const handle = await backend.spawn({
      agentName: 'verbal',
      name: 'verbal',
      description: 'Verbal drafting release notes',
      prompt: 'Draft release notes',
      model: 'claude-haiku-4.5',
      reasoningEffort: 'medium',
    });

    expect(handle).toEqual({
      id: 'sub-session-123',
      agentName: 'verbal',
      platform: 'app',
      success: true,
    });
    expect(createSession).toHaveBeenCalledWith({
      name: 'Verbal drafting release notes',
      coordinate_with_creator: false,
      notify_on_idle: 'always',
      project_id: 'project-123',
      kickoff: {
        prompt: 'Draft release notes',
        mode: 'plan',
        model: 'claude-haiku-4.5',
        reasoning_effort: 'medium',
      },
    });
    expect(backend.getActiveCount()).toBe(1);
  });

  it('SessionSpawnBackend rejects new spawns at the concurrency cap until release()', async () => {
    let sessionNumber = 0;
    const createSession = vi.fn(async () => ({
      sessionId: `sub-session-${++sessionNumber}`,
      sendMessage: vi.fn(async () => undefined),
    })) satisfies CreateSessionFn;

    const backend = new SessionSpawnBackend(createSession, { maxConcurrent: 1 });
    const firstHandle = await backend.spawn({
      agentName: 'fenster',
      name: 'fenster',
      description: 'Fenster implementing fix',
      prompt: 'Implement the fix',
    });

    const secondHandle = await backend.spawn({
      agentName: 'verbal',
      name: 'verbal',
      description: 'Verbal drafting notes',
      prompt: 'Draft release notes',
    });

    expect(firstHandle.success).toBe(true);
    expect(secondHandle).toMatchObject({
      id: '',
      agentName: 'verbal',
      platform: 'app',
      success: false,
    });
    expect(secondHandle.error).toMatch(/Spawn rejected.*no queue/i);

    backend.release(firstHandle as SpawnHandle);

    const thirdHandle = await backend.spawn({
      agentName: 'verbal',
      name: 'verbal',
      description: 'Verbal drafting notes',
      prompt: 'Draft release notes',
    });

    expect(thirdHandle.success).toBe(true);
    expect(backend.getActiveCount()).toBe(1);
  });

  it('isAvailable reflects the injected factory and an injected predicate', () => {
    const createSession = vi.fn(async () => ({
      sessionId: 'x',
      sendMessage: vi.fn(async () => undefined),
    })) satisfies CreateSessionFn;

    // Default heuristic: a usable factory means available (no more "always true" lie).
    expect(new TaskSpawnBackend(createSession).isAvailable()).toBe(true);
    expect(new SessionSpawnBackend(createSession).isAvailable()).toBe(true);

    // Injected predicate overrides the default.
    expect(
      new TaskSpawnBackend(createSession, { availabilityCheck: () => false }).isAvailable(),
    ).toBe(false);

    let avail = false;
    const session = new SessionSpawnBackend(createSession, { availabilityCheck: () => avail });
    expect(session.isAvailable()).toBe(false);
    avail = true;
    expect(session.isAvailable()).toBe(true);
  });

  it('SessionSpawnBackend times out a hung createSession and frees the slot', async () => {
    const createSession = vi.fn(() => new Promise<never>(() => {})) as unknown as CreateSessionFn;
    const backend = new SessionSpawnBackend(createSession, {
      createSessionTimeoutMs: 20,
      maxConcurrent: 1,
    });

    const handle = await backend.spawn({
      agentName: 'fenster',
      name: 'fenster',
      description: 'Fenster implementing fix',
      prompt: 'Implement the fix',
    });

    expect(handle.success).toBe(false);
    expect(handle.error).toMatch(/timed out/i);
    // finally{} must have decremented pendingSpawnCount so the slot is not leaked.
    expect(backend.getActiveCount()).toBe(0);
  });

  it('TaskSpawnBackend times out a hung createSession', async () => {
    const createSession = vi.fn(() => new Promise<never>(() => {})) as unknown as CreateSessionFn;
    const backend = new TaskSpawnBackend(createSession, { createSessionTimeoutMs: 20 });

    const handle = await backend.spawn({
      agentName: 'fenster',
      name: 'fenster',
      description: 'Fenster implementing fix',
      prompt: 'Implement the fix',
    });

    expect(handle.success).toBe(false);
    expect(handle.error).toMatch(/timed out/i);
  });
});
