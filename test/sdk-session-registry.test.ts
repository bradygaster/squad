import { describe, it, expect, beforeEach } from 'vitest';
import { SessionRegistry } from '@bradygaster/squad-sdk/runtime/session-registry';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('register() creates session with correct initial state', () => {
    const session = registry.register('Alice', 'dev');
    expect(session.name).toBe('Alice');
    expect(session.role).toBe('dev');
    expect(session.status).toBe('idle');
    expect(session.startedAt).toBeInstanceOf(Date);
  });

  it('get() returns registered session (case-insensitive)', () => {
    registry.register('Alice', 'dev');
    expect(registry.get('ALICE')).toBeDefined();
    expect(registry.get('alice')).toBeDefined();
    expect(registry.get('Alice')).toBeDefined();
  });

  it('get() returns undefined for unknown agent', () => {
    expect(registry.get('ghost')).toBeUndefined();
  });

  it('getAll() returns all sessions', () => {
    registry.register('Alice', 'dev');
    registry.register('Bob', 'qa');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getActive() returns only working/streaming sessions', () => {
    registry.register('Alice', 'dev');
    registry.register('Bob', 'qa');
    registry.register('Carol', 'ops');
    registry.updateStatus('Alice', 'working');
    registry.updateStatus('Bob', 'streaming');
    // Carol stays idle
    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(s => s.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('updateStatus() changes session status', () => {
    registry.register('Alice', 'dev');
    registry.updateStatus('Alice', 'working');
    expect(registry.get('Alice')!.status).toBe('working');
  });

  it('updateStatus() clears activityHint on idle/error', () => {
    registry.register('Alice', 'dev');
    registry.updateActivityHint('Alice', 'compiling');
    registry.updateStatus('Alice', 'idle');
    expect(registry.get('Alice')!.activityHint).toBeUndefined();

    registry.updateActivityHint('Alice', 'testing');
    registry.updateStatus('Alice', 'error');
    expect(registry.get('Alice')!.activityHint).toBeUndefined();
  });

  it('updateActivityHint() sets the hint', () => {
    registry.register('Alice', 'dev');
    registry.updateActivityHint('Alice', 'building');
    expect(registry.get('Alice')!.activityHint).toBe('building');
  });

  it('updateModel() sets the model', () => {
    registry.register('Alice', 'dev');
    registry.updateModel('Alice', 'gpt-4');
    expect(registry.get('Alice')!.model).toBe('gpt-4');
  });

  it('remove() deletes a session', () => {
    registry.register('Alice', 'dev');
    expect(registry.remove('Alice')).toBe(true);
    expect(registry.get('Alice')).toBeUndefined();
  });

  it('clear() removes all sessions', () => {
    registry.register('Alice', 'dev');
    registry.register('Bob', 'qa');
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
