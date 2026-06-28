/**
 * Tests for Issue #259 (Session Traces) and #264 (Response Latency Metrics)
 *
 * Covers:
 * - SquadClient.sendMessage() OTel span creation
 * - SquadClient.closeSession() alias
 * - StreamingPipeline latency metric wiring (TTFT, duration, tokens/sec)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import { CopilotClient } from '@github/copilot-sdk';
import {
  StreamingPipeline,
  type StreamDelta,
  type UsageEvent,
} from '@bradygaster/squad-sdk/runtime/streaming';

// Mock CopilotClient
vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: vi.fn(function (this: object) {
      Object.assign(this, {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue([]),
        forceStop: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          send: vi.fn().mockResolvedValue('msg-1'),
          on: vi.fn().mockReturnValue(() => {}),
          destroy: vi.fn().mockResolvedValue(undefined),
        }),
        resumeSession: vi.fn().mockResolvedValue({
          sessionId: 'session-1',
          send: vi.fn().mockResolvedValue('msg-1'),
          on: vi.fn().mockReturnValue(() => {}),
          destroy: vi.fn().mockResolvedValue(undefined),
        }),
        listSessions: vi.fn().mockResolvedValue([]),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        getLastSessionId: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: Date.now() }),
        getStatus: vi.fn().mockResolvedValue({ version: '1.0.0' }),
        getAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
        listModels: vi.fn().mockResolvedValue([]),
        on: vi.fn().mockReturnValue(() => {}),
        onLifecycle: vi.fn().mockReturnValue(() => {}),
      });
    }),
    RuntimeConnection: {
      forStdio: vi.fn(() => ({})),
      forTcp: vi.fn(() => ({})),
      forUri: vi.fn(() => ({})),
    },
  };
});

// Mock otel-metrics to verify they're called
vi.mock('@bradygaster/squad-sdk/runtime/otel-metrics', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@bradygaster/squad-sdk/runtime/otel-metrics')>();
  return {
    ...orig,
    recordTimeToFirstToken: vi.fn(),
    recordResponseDuration: vi.fn(),
    recordTokensPerSecond: vi.fn(),
    recordTokenUsage: vi.fn(),
  };
});

import {
  recordTimeToFirstToken,
  recordResponseDuration,
  recordTokensPerSecond,
} from '@bradygaster/squad-sdk/runtime/otel-metrics';

// ============================================================================
// #259 — SquadClient.sendMessage()
// ============================================================================

describe('SquadClient.sendMessage() — squad.session.message span', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call session.sendMessage with options', async () => {
    const client = new SquadClient();
    await client.connect();
    const session = await client.createSession();
    const spy = vi.spyOn(session, 'sendMessage');

    await client.sendMessage(session, { prompt: 'hello world' });

    expect(spy).toHaveBeenCalledWith({ prompt: 'hello world' });
  });

  it('should propagate errors from session.sendMessage', async () => {
    const client = new SquadClient();
    await client.connect();
    const session = await client.createSession();
    vi.spyOn(session, 'sendMessage').mockRejectedValueOnce(new Error('stream failed'));

    await expect(
      client.sendMessage(session, { prompt: 'will fail' })
    ).rejects.toThrow('stream failed');
  });

  it('should register event listeners on session', async () => {
    const client = new SquadClient();
    await client.connect();
    const session = await client.createSession();
    const onSpy = vi.spyOn(session, 'on');

    await client.sendMessage(session, { prompt: 'test' });

    // on() should have been called for message_delta and usage listeners
    expect(onSpy).toHaveBeenCalledWith('message_delta', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('usage', expect.any(Function));
  });

  it('should clean up event listeners after completion', async () => {
    const client = new SquadClient();
    await client.connect();
    const session = await client.createSession();
    const offSpy = vi.spyOn(session, 'off');

    await client.sendMessage(session, { prompt: 'test' });

    expect(offSpy).toHaveBeenCalledWith('message_delta', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('usage', expect.any(Function));
  });
});

// ============================================================================
// #259 — SquadClient.closeSession()
// ============================================================================

describe('SquadClient.closeSession() — squad.session.close span', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete the session', async () => {
    const client = new SquadClient();
    await client.connect();

    await client.closeSession('session-42');

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    expect(instance.deleteSession).toHaveBeenCalledWith('session-42');
  });

  it('should propagate errors from deleteSession', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.deleteSession.mockRejectedValueOnce(new Error('not found'));

    await expect(client.closeSession('session-99')).rejects.toThrow('not found');
  });
});

// ============================================================================
// #264 — StreamingPipeline latency metrics wiring
// ============================================================================

describe('StreamingPipeline — Latency Metrics (#264)', () => {
  let pipeline: StreamingPipeline;

  beforeEach(() => {
    pipeline = new StreamingPipeline();
    vi.clearAllMocks();
  });

  it('should record TTFT when first delta arrives after markMessageStart', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    // Small delay to make TTFT measurable
    await new Promise(r => setTimeout(r, 5));

    await pipeline.processEvent(makeDelta('s1', 'hello', 0));

    expect(recordTimeToFirstToken).toHaveBeenCalledTimes(1);
    const ttft = (recordTimeToFirstToken as any).mock.calls[0][0];
    expect(ttft).toBeGreaterThanOrEqual(0);
  });

  it('should NOT record TTFT for subsequent deltas', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    await pipeline.processEvent(makeDelta('s1', 'hello', 0));
    await pipeline.processEvent(makeDelta('s1', ' world', 1));

    expect(recordTimeToFirstToken).toHaveBeenCalledTimes(1);
  });

  it('should NOT record TTFT without markMessageStart', async () => {
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeDelta('s1', 'hello', 0));

    expect(recordTimeToFirstToken).not.toHaveBeenCalled();
  });

  it('should record response duration on usage event', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    await new Promise(r => setTimeout(r, 5));

    await pipeline.processEvent(makeUsage('s1', 100, 50));

    expect(recordResponseDuration).toHaveBeenCalledTimes(1);
    const duration = (recordResponseDuration as any).mock.calls[0][0];
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should record tokens/sec on usage event', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    await new Promise(r => setTimeout(r, 5));

    await pipeline.processEvent(makeUsage('s1', 100, 200));

    expect(recordTokensPerSecond).toHaveBeenCalledTimes(1);
    const tps = (recordTokensPerSecond as any).mock.calls[0][0];
    expect(tps).toBeGreaterThan(0);
  });

  it('should NOT record tokens/sec when outputTokens is 0', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    await new Promise(r => setTimeout(r, 5));

    await pipeline.processEvent(makeUsage('s1', 100, 0));

    expect(recordTokensPerSecond).not.toHaveBeenCalled();
  });

  it('should NOT record latency metrics without markMessageStart', async () => {
    pipeline.attachToSession('s1');

    await pipeline.processEvent(makeUsage('s1', 100, 50));

    expect(recordResponseDuration).not.toHaveBeenCalled();
    expect(recordTokensPerSecond).not.toHaveBeenCalled();
  });

  it('should clean tracking state after usage event', async () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    await pipeline.processEvent(makeUsage('s1', 100, 50));

    // Second usage without markMessageStart should not record
    vi.clearAllMocks();
    await pipeline.processEvent(makeUsage('s1', 200, 100));

    expect(recordResponseDuration).not.toHaveBeenCalled();
  });

  it('should clear tracking state on clear()', () => {
    pipeline.attachToSession('s1');
    pipeline.markMessageStart('s1');

    pipeline.clear();

    expect(pipeline.isAttached('s1')).toBe(false);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeDelta(sessionId: string, content: string, index = 0): StreamDelta {
  return {
    type: 'message_delta',
    sessionId,
    content,
    index,
    timestamp: new Date(),
  };
}

function makeUsage(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCost = 0,
  agentName?: string,
): UsageEvent {
  return {
    type: 'usage',
    sessionId,
    agentName,
    model: 'claude-sonnet-4',
    inputTokens,
    outputTokens,
    estimatedCost,
    timestamp: new Date(),
  };
}
