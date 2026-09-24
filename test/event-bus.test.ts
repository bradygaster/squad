/**
 * Integration tests for EventBus implementations (M0-9, Issue #85)
 * 
 * Tests both client/event-bus.ts and runtime/event-bus.ts implementations.
 * Covers subscribe/emit patterns, error isolation, and unsubscribe behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus as ClientEventBus } from '@bradygaster/squad-sdk/client';
import { EventBus as RuntimeEventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { createSquadEvent, isSquadEventOfType } from '@bradygaster/squad-sdk/runtime/event-payloads';

describe('ClientEventBus', () => {
  let bus: ClientEventBus;

  beforeEach(() => {
    bus = new ClientEventBus();
  });

  it('should construct empty bus', () => {
    expect(bus).toBeDefined();
  });

  it('should subscribe to specific event type', () => {
    const handler = vi.fn();
    const unsubscribe = bus.on('session.created', handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should emit event to specific type handler', async () => {
    const handler = vi.fn();
    bus.on('session.created', handler);

    await bus.emit({
      type: 'session.created',
      sessionId: 'session-1',
      payload: { model: 'claude-sonnet-4.5' },
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session.created',
        sessionId: 'session-1',
      })
    );
  });

  it('should not call handler for different event type', async () => {
    const handler = vi.fn();
    bus.on('session.created', handler);

    await bus.emit({
      type: 'session.destroyed',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should subscribe to all events via onAny', () => {
    const handler = vi.fn();
    const unsubscribe = bus.onAny(handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should emit to wildcard handlers', async () => {
    const handler = vi.fn();
    bus.onAny(handler);

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
    await bus.emit({ type: 'session.destroyed', payload: null, timestamp: new Date() });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should emit to both specific and wildcard handlers', async () => {
    const specificHandler = vi.fn();
    const wildcardHandler = vi.fn();

    bus.on('session.created', specificHandler);
    bus.onAny(wildcardHandler);

    await bus.emit({
      type: 'session.created',
      payload: null,
      timestamp: new Date(),
    });

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledTimes(1);
  });

  it('should support multiple handlers for same event type', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('session.created', handler1);
    bus.on('session.created', handler2);

    await bus.emit({
      type: 'session.created',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via returned function', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.on('session.created', handler);

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  it('should unsubscribe wildcard handler', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.onAny(handler);

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle async handlers', async () => {
    const handler = vi.fn(async (event) => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    bus.on('session.created', handler);

    await bus.emit({
      type: 'session.created',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should clear all handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('session.created', handler1);
    bus.onAny(handler2);

    bus.clear();

    await bus.emit({ type: 'session.created', payload: null, timestamp: new Date() });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});

describe('RuntimeEventBus', () => {
  let bus: RuntimeEventBus;

  beforeEach(() => {
    bus = new RuntimeEventBus();
  });

  it('should construct empty bus', () => {
    expect(bus).toBeDefined();
  });

  it('should preserve the typed context utilization payload', async () => {
    const handler = vi.fn();
    bus.subscribe('context:utilization', handler);
    const event = createSquadEvent('context:utilization', {
      occupiedTokens: 80,
      contextWindowTokens: 100,
      utilization: 0.8,
      warningThreshold: 0.8,
      warning: true,
      thresholdCrossed: true,
      source: 'runtime',
      model: 'gpt-5.6-luna',
    }, { sessionId: 's1', agentName: 'fenster' });

    await bus.emit(event);

    expect(isSquadEventOfType(event, 'context:utilization')).toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ utilization: 0.8, source: 'runtime' }),
    }));
  });

  it('should subscribe to specific event type', () => {
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('session:created', handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should emit event to specific type handler', async () => {
    const handler = vi.fn();
    bus.subscribe('session:created', handler);

    await bus.emit({
      type: 'session:created',
      sessionId: 'session-1',
      payload: { model: 'claude-sonnet-4.5' },
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:created',
        sessionId: 'session-1',
      })
    );
  });

  it('should not call handler for different event type', async () => {
    const handler = vi.fn();
    bus.subscribe('session:created', handler);

    await bus.emit({
      type: 'session:destroyed',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should subscribe to all events via subscribeAll', () => {
    const handler = vi.fn();
    const unsubscribe = bus.subscribeAll(handler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should emit to wildcard handlers', async () => {
    const handler = vi.fn();
    bus.subscribeAll(handler);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    await bus.emit({ type: 'session:destroyed', payload: null, timestamp: new Date() });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should emit to both specific and wildcard handlers', async () => {
    const specificHandler = vi.fn();
    const wildcardHandler = vi.fn();

    bus.subscribe('session:created', specificHandler);
    bus.subscribeAll(wildcardHandler);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledTimes(1);
  });

  it('should support multiple handlers for same event type', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.subscribe('session:created', handler1);
    bus.subscribe('session:created', handler2);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via returned function', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('session:created', handler);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe wildcard handler', async () => {
    const handler = vi.fn();
    const unsubscribe = bus.subscribeAll(handler);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via unsubscribe method', async () => {
    const handler = vi.fn();
    bus.subscribe('session:created', handler);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.unsubscribe('session:created', handler);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should isolate handler errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingHandler = vi.fn(() => { throw new Error('Handler failed'); });
    const successHandler = vi.fn();

    bus.subscribe('session:created', failingHandler);
    bus.subscribe('session:created', successHandler);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(failingHandler).toHaveBeenCalled();
    expect(successHandler).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should register error handler', () => {
    const errorHandler = vi.fn();
    const unsubscribe = bus.onError(errorHandler);

    expect(unsubscribe).toBeInstanceOf(Function);
  });

  it('should call error handler on handler failure', async () => {
    const errorHandler = vi.fn();
    bus.onError(errorHandler);

    const failingHandler = vi.fn(() => { throw new Error('Test error'); });
    bus.subscribe('session:created', failingHandler);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ type: 'session:created' })
    );
  });

  it('should not propagate handler errors to emit caller', async () => {
    const failingHandler = vi.fn(() => { throw new Error('Test error'); });
    bus.subscribe('session:created', failingHandler);

    await expect(bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    })).resolves.toBeUndefined();
  });

  it('should handle async handlers', async () => {
    const handler = vi.fn(async (event) => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    bus.subscribe('session:created', handler);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should get handler count for event type', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    expect(bus.getHandlerCount('session:created')).toBe(0);

    bus.subscribe('session:created', handler1);
    expect(bus.getHandlerCount('session:created')).toBe(1);

    bus.subscribe('session:created', handler2);
    expect(bus.getHandlerCount('session:created')).toBe(2);
  });

  it('should get wildcard handler count', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    expect(bus.getAllHandlerCount()).toBe(0);

    bus.subscribeAll(handler1);
    expect(bus.getAllHandlerCount()).toBe(1);

    bus.subscribeAll(handler2);
    expect(bus.getAllHandlerCount()).toBe(2);
  });

  it('should clear all handlers', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const errorHandler = vi.fn();

    bus.subscribe('session:created', handler1);
    bus.subscribeAll(handler2);
    bus.onError(errorHandler);

    bus.clear();

    expect(bus.getHandlerCount('session:created')).toBe(0);
    expect(bus.getAllHandlerCount()).toBe(0);

    await bus.emit({ type: 'session:created', payload: null, timestamp: new Date() });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should handle multiple error handlers', async () => {
    const errorHandler1 = vi.fn();
    const errorHandler2 = vi.fn();
    bus.onError(errorHandler1);
    bus.onError(errorHandler2);

    const failingHandler = vi.fn(() => { throw new Error('Test error'); });
    bus.subscribe('session:created', failingHandler);

    await bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    });

    expect(errorHandler1).toHaveBeenCalledTimes(1);
    expect(errorHandler2).toHaveBeenCalledTimes(1);
  });

  it('should handle error handler failure gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingErrorHandler = vi.fn(() => { throw new Error('Error handler failed'); });
    bus.onError(failingErrorHandler);

    const failingHandler = vi.fn(() => { throw new Error('Test error'); });
    bus.subscribe('session:created', failingHandler);

    await expect(bus.emit({
      type: 'session:created',
      payload: null,
      timestamp: new Date(),
    })).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should clean up empty handler sets after unsubscribe', () => {
    const handler = vi.fn();
    bus.subscribe('session:created', handler);
    
    expect(bus.getHandlerCount('session:created')).toBe(1);
    
    bus.unsubscribe('session:created', handler);
    
    expect(bus.getHandlerCount('session:created')).toBe(0);
  });
});
