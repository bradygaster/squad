import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager, DEFAULT_LIMITS } from '@bradygaster/squad-sdk/runtime/memory-manager';

describe('MemoryManager', () => {
  let mm: MemoryManager;

  beforeEach(() => {
    mm = new MemoryManager();
  });

  it('DEFAULT_LIMITS has correct values', () => {
    expect(DEFAULT_LIMITS.maxMessages).toBe(200);
    expect(DEFAULT_LIMITS.maxStreamBuffer).toBe(1024 * 1024);
    expect(DEFAULT_LIMITS.maxSessions).toBe(10);
    expect(DEFAULT_LIMITS.sessionIdleTimeout).toBe(5 * 60 * 1000);
  });

  it('canCreateSession() enforces maxSessions', () => {
    expect(mm.canCreateSession(9)).toBe(true);
    expect(mm.canCreateSession(10)).toBe(false);
    expect(mm.canCreateSession(11)).toBe(false);
  });

  it('trackBuffer() enforces maxStreamBuffer', () => {
    const limit = DEFAULT_LIMITS.maxStreamBuffer;
    expect(mm.trackBuffer('s1', limit)).toBe(true);
    // Adding even 1 more byte should fail
    expect(mm.trackBuffer('s1', 1)).toBe(false);
  });

  it('trackBuffer() accumulates across calls', () => {
    const half = DEFAULT_LIMITS.maxStreamBuffer / 2;
    expect(mm.trackBuffer('s1', half)).toBe(true);
    expect(mm.trackBuffer('s1', half)).toBe(true);
    expect(mm.trackBuffer('s1', 1)).toBe(false);
  });

  it('trimMessages() keeps recent messages', () => {
    const small = new MemoryManager({ maxMessages: 3 });
    const msgs = [1, 2, 3, 4, 5];
    expect(small.trimMessages(msgs)).toEqual([3, 4, 5]);
  });

  it('trimMessages() returns all if under limit', () => {
    const msgs = [1, 2, 3];
    expect(mm.trimMessages(msgs)).toEqual([1, 2, 3]);
  });

  it('trimWithArchival() splits messages correctly', () => {
    const small = new MemoryManager({ maxMessages: 2 });
    const result = small.trimWithArchival([1, 2, 3, 4]);
    expect(result.kept).toEqual([3, 4]);
    expect(result.archived).toEqual([1, 2]);
  });

  it('trimWithArchival() returns all as kept when under limit', () => {
    const result = mm.trimWithArchival([1, 2]);
    expect(result.kept).toEqual([1, 2]);
    expect(result.archived).toEqual([]);
  });

  it('clearBuffer() resets tracking', () => {
    mm.trackBuffer('s1', 100);
    mm.clearBuffer('s1');
    expect(mm.getStats().sessions).toBe(0);
    expect(mm.getStats().totalBufferBytes).toBe(0);
  });

  it('getStats() returns correct counts', () => {
    mm.trackBuffer('s1', 100);
    mm.trackBuffer('s2', 200);
    const stats = mm.getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.totalBufferBytes).toBe(300);
  });

  it('getLimits() returns configured limits', () => {
    const limits = mm.getLimits();
    expect(limits.maxMessages).toBe(DEFAULT_LIMITS.maxMessages);
    expect(limits.maxSessions).toBe(DEFAULT_LIMITS.maxSessions);
  });

  it('custom limits override defaults', () => {
    const custom = new MemoryManager({ maxSessions: 5, maxMessages: 50 });
    const limits = custom.getLimits();
    expect(limits.maxSessions).toBe(5);
    expect(limits.maxMessages).toBe(50);
    // Non-overridden values stay at defaults
    expect(limits.maxStreamBuffer).toBe(DEFAULT_LIMITS.maxStreamBuffer);
  });
});
