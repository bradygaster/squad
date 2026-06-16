/**
 * Integration tests for SquadClient adapter (M0-9, Issue #85)
 * 
 * Tests connection lifecycle, session CRUD, and error recovery.
 * Uses vi.mock to stub CopilotClient since it requires a real CLI server.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SquadClient, type SquadClientOptions } from '@bradygaster/squad-sdk/client';
import { CopilotClient } from '@github/copilot-sdk';

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
      });
    }),
  };
});

describe('SquadClient — Connection Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should construct with minimal options', () => {
    const client = new SquadClient();
    expect(client).toBeDefined();
    expect(client.getState()).toBe('disconnected');
  });

  it('should construct with custom options', () => {
    const options: SquadClientOptions = {
      cwd: '/tmp/test',
      port: 8080,
      useStdio: false,
      logLevel: 'error',
      autoStart: false,
      autoReconnect: false,
      maxReconnectAttempts: 5,
      reconnectDelayMs: 2000,
    };
    const client = new SquadClient(options);
    expect(client).toBeDefined();
    expect(client.getState()).toBe('disconnected');
  });

  it('should connect and transition to connected state', async () => {
    const client = new SquadClient();
    expect(client.isConnected()).toBe(false);

    await client.connect();

    expect(client.getState()).toBe('connected');
    expect(client.isConnected()).toBe(true);
  });

  it('should not connect twice when already connected', async () => {
    const client = new SquadClient();
    await client.connect();
    expect(client.getState()).toBe('connected');

    // Second connect should be no-op
    await client.connect();
    expect(client.getState()).toBe('connected');
  });

  it('should deduplicate concurrent connect calls', async () => {
    const client = new SquadClient();
    
    // Make start() slow so both calls overlap
    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.start.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    // Fire two concurrent connect calls — second should wait, not throw
    const [result1, result2] = await Promise.all([
      client.connect(),
      client.connect(),
    ]);

    expect(result1).toBeUndefined();
    expect(result2).toBeUndefined();
    expect(client.getState()).toBe('connected');
    // start() should only be called once — the second call piggybacked
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('should handle concurrent createSession calls that trigger auto-connect', async () => {
    const client = new SquadClient({ autoStart: true });
    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.start.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)));

    // Both createSession calls should succeed — second waits for connect
    const [session1, session2] = await Promise.all([
      client.createSession({ model: 'claude-sonnet-4.5' }),
      client.createSession({ model: 'claude-sonnet-4.5' }),
    ]);

    expect(session1.sessionId).toBe('session-1');
    expect(session2.sessionId).toBe('session-1');
    expect(client.isConnected()).toBe(true);
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('should propagate connect failure to concurrent callers', async () => {
    const client = new SquadClient();
    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.start.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('server down')), 50))
    );

    const results = await Promise.allSettled([
      client.connect(),
      client.connect(),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect((results[0] as PromiseRejectedResult).reason.message).toContain('server down');
    expect((results[1] as PromiseRejectedResult).reason.message).toContain('server down');
    expect(client.getState()).toBe('error');
  });

  it('should start fresh connect after failed concurrent connect', async () => {
    const client = new SquadClient();
    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    // First connect attempt fails
    instance.start.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('server down')), 50))
    );

    await Promise.allSettled([client.connect(), client.connect()]);
    expect(client.getState()).toBe('error');

    // Restore start to succeed
    instance.start.mockResolvedValue(undefined);

    // New connect should start fresh (connectPromise was cleared on failure)
    await client.connect();
    expect(client.getState()).toBe('connected');
    expect(instance.start).toHaveBeenCalledTimes(2); // 1 failed + 1 fresh
  });

  it('should disconnect gracefully', async () => {
    const client = new SquadClient();
    await client.connect();

    const errors = await client.disconnect();

    expect(errors).toEqual([]);
    expect(client.getState()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);
  });

  it('should force disconnect without graceful cleanup', async () => {
    const client = new SquadClient();
    await client.connect();

    await client.forceDisconnect();

    expect(client.getState()).toBe('disconnected');
  });

  it('should reset reconnect attempts on successful connect', async () => {
    const client = new SquadClient({ maxReconnectAttempts: 3 });
    
    await client.connect();
    expect(client.getState()).toBe('connected');
    
    await client.disconnect();
    await client.connect();
    
    expect(client.getState()).toBe('connected');
  });
});

describe('SquadClient — Auto-Reconnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should auto-reconnect on ECONNREFUSED', async () => {
    const client = new SquadClient({ autoReconnect: true, reconnectDelayMs: 10 });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    // First call fails with ECONNREFUSED, second succeeds
    instance.createSession
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ sessionId: 'session-1', send: vi.fn().mockResolvedValue('msg-1'), on: vi.fn().mockReturnValue(() => {}), destroy: vi.fn().mockResolvedValue(undefined) });

    const session = await client.createSession({ model: 'claude-sonnet-4.5' });
    
    expect(session).toBeDefined();
    expect(session.sessionId).toBe('session-1');
    expect(instance.stop).toHaveBeenCalled();
    expect(instance.start).toHaveBeenCalledTimes(2); // initial + reconnect
  });

  it('should auto-reconnect on ECONNRESET', async () => {
    const client = new SquadClient({ autoReconnect: true, reconnectDelayMs: 10 });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    instance.listSessions
      .mockRejectedValueOnce(new Error('Connection error: ECONNRESET'))
      .mockResolvedValueOnce([]);

    const sessions = await client.listSessions();
    
    expect(sessions).toEqual([]);
  });

  it('should auto-reconnect on EPIPE', async () => {
    const client = new SquadClient({ autoReconnect: true, reconnectDelayMs: 10 });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    instance.ping
      .mockRejectedValueOnce(new Error('EPIPE'))
      .mockResolvedValueOnce({ message: 'pong', timestamp: Date.now() });

    const result = await client.ping();
    
    expect(result.message).toBe('pong');
  });

  it('should exhaust max reconnect attempts', async () => {
    const client = new SquadClient({ autoReconnect: true, maxReconnectAttempts: 2, reconnectDelayMs: 10 });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    // Always fail
    instance.createSession.mockRejectedValue(new Error('ECONNREFUSED'));
    instance.start.mockRejectedValue(new Error('Connection failed'));

    await expect(client.createSession()).rejects.toThrow();
  });

  it('should not auto-reconnect when autoReconnect is false', async () => {
    const client = new SquadClient({ autoReconnect: false });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    instance.createSession.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client.createSession()).rejects.toThrow('ECONNREFUSED');
  });

  it('should provide approve-once guidance for permission handler errors', async () => {
    const client = new SquadClient({ autoReconnect: false });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    instance.createSession.mockRejectedValue(new Error('onPermissionRequest is required'));

    await expect(client.createSession()).rejects.toThrow('kind: "approve-once"');
  });

  it('should not auto-reconnect after manual disconnect', async () => {
    const client = new SquadClient({ autoReconnect: true, autoStart: false });
    await client.connect();
    await client.disconnect();

    await expect(client.createSession()).rejects.toThrow('Client not connected');
  });

  it('should use exponential backoff for reconnect delays', async () => {
    const client = new SquadClient({ autoReconnect: true, maxReconnectAttempts: 3, reconnectDelayMs: 100 });
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;

    // Fail on first attempt, succeed on second
    instance.createSession
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ sessionId: 'session-1', send: vi.fn().mockResolvedValue('msg-1'), on: vi.fn().mockReturnValue(() => {}), destroy: vi.fn().mockResolvedValue(undefined) });

    // First reconnect succeeds
    instance.stop.mockResolvedValue([]);
    instance.start.mockResolvedValue(undefined);

    const startTime = Date.now();
    const session = await client.createSession();
    const elapsed = Date.now() - startTime;

    // First delay: 100ms minimum
    expect(elapsed).toBeGreaterThan(90);
    expect(session.sessionId).toBe('session-1');
  });
});

describe('SquadClient — Session CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session when connected', async () => {
    const client = new SquadClient();
    await client.connect();

    const session = await client.createSession({ model: 'claude-sonnet-4.5' });

    expect(session).toBeDefined();
    expect(session.sessionId).toBe('session-1');
  });

  it('should auto-connect when creating session with autoStart enabled', async () => {
    const client = new SquadClient({ autoStart: true });
    expect(client.isConnected()).toBe(false);

    const session = await client.createSession({ model: 'claude-sonnet-4.5' });

    expect(client.isConnected()).toBe(true);
    expect(session.sessionId).toBe('session-1');
  });

  it('should throw when creating session without connection and autoStart disabled', async () => {
    const client = new SquadClient({ autoStart: false });

    await expect(client.createSession()).rejects.toThrow('Client not connected');
  });

  it('should resume existing session', async () => {
    const client = new SquadClient();
    await client.connect();

    const session = await client.resumeSession('session-1', { model: 'claude-opus-4.6' });

    expect(session).toBeDefined();
    expect(session.sessionId).toBe('session-1');
  });

  it('should list sessions', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.listSessions.mockResolvedValue([
      { sessionId: 'session-1', startTime: new Date(), modifiedTime: new Date(), isRemote: false },
      { sessionId: 'session-2', startTime: new Date(), modifiedTime: new Date(), isRemote: false },
    ]);

    const sessions = await client.listSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe('session-1');
    expect(sessions[1].sessionId).toBe('session-2');
  });

  it('should delete session', async () => {
    const client = new SquadClient();
    await client.connect();

    await client.deleteSession('session-1');

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    expect(instance.deleteSession).toHaveBeenCalledWith('session-1');
  });

  it('should get last session ID', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.getLastSessionId.mockResolvedValue('session-42');

    const lastId = await client.getLastSessionId();

    expect(lastId).toBe('session-42');
  });
});

describe('SquadClient — Status Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ping server', async () => {
    const client = new SquadClient();
    await client.connect();

    const result = await client.ping('hello');

    expect(result.message).toBe('pong');
    expect(result.timestamp).toBeDefined();
  });

  it('should get status', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.getStatus.mockResolvedValue({ 
      version: '1.0.0', 
      protocolVersion: 2,
    });

    const status = await client.getStatus();

    expect(status.version).toBe('1.0.0');
    expect(status.protocolVersion).toBe(2);
  });

  it('should get auth status', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.getAuthStatus.mockResolvedValue({ 
      isAuthenticated: true,
      login: 'testuser'
    });

    const authStatus = await client.getAuthStatus();

    expect(authStatus.isAuthenticated).toBe(true);
    expect(authStatus.login).toBe('testuser');
  });

  it('should list models', async () => {
    const client = new SquadClient();
    await client.connect();

    const MockedCopilotClient = CopilotClient as unknown as ReturnType<typeof vi.fn>;
    const instance = MockedCopilotClient.mock.results[0].value;
    instance.listModels.mockResolvedValue([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4.6', name: 'Claude Opus 4.6' },
    ]);

    const models = await client.listModels();

    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('claude-sonnet-4.5');
  });

  it('should throw when calling operations while disconnected', async () => {
    const client = new SquadClient();

    await expect(client.ping()).rejects.toThrow('Client not connected');
    await expect(client.getStatus()).rejects.toThrow('Client not connected');
    await expect(client.getAuthStatus()).rejects.toThrow('Client not connected');
    await expect(client.listModels()).rejects.toThrow('Client not connected');
    await expect(client.listSessions()).rejects.toThrow('Client not connected');
    await expect(client.deleteSession('test')).rejects.toThrow('Client not connected');
  });
});

describe('SquadClient — Event Subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should subscribe to typed events', () => {
    const client = new SquadClient();
    const handler = vi.fn();

    const unsubscribe = client.on('session.created', handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should subscribe to all events', () => {
    const client = new SquadClient();
    const handler = vi.fn();

    const unsubscribe = client.on(handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });
});
