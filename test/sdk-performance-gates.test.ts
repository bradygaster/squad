/**
 * Performance gate tests for SDK runtime modules — Batch 9.
 *
 * Guards against performance regressions using generous thresholds (3-5x
 * expected time) to avoid CI flakes. These are regression gates, not
 * micro-benchmarks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parseInput } from '@bradygaster/squad-sdk/runtime/input-router';
import { parseCoordinatorResponse } from '@bradygaster/squad-sdk/runtime/coordinator-parser';
import { SessionRegistry } from '@bradygaster/squad-sdk/runtime/session-registry';
import { MemoryManager } from '@bradygaster/squad-sdk/runtime/memory-manager';

const AGENTS = ['Fenster', 'Hockney', 'McManus', 'Keaton', 'Kobayashi'];

// ─── parseInput performance ─────────────────────────────────────────────
describe('parseInput — performance gates', () => {
  it('1000 sequential calls complete within 200ms', () => {
    const inputs = [
      'hello world',
      '/help',
      '@Fenster fix it',
      'Hockney, review this',
      'plain coordinator message',
    ];
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      parseInput(inputs[i % inputs.length]!, AGENTS);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('large input (50KB) parses within 50ms', () => {
    const bigInput = 'a'.repeat(50_000);
    const start = performance.now();
    parseInput(bigInput, AGENTS);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ─── parseCoordinatorResponse performance ───────────────────────────────
describe('parseCoordinatorResponse — performance gates', () => {
  it('1000 typical responses parsed within 500ms', () => {
    const responses = [
      'DIRECT: The answer is 42.',
      'ROUTE: Fenster\nTASK: Fix the bug\nCONTEXT: User reported crash',
      `MULTI:\n- Ripley: Review code\n- Kane: Write tests\n- Lambert: Deploy`,
      'I will handle this myself — no routing needed.',
    ];

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      parseCoordinatorResponse(responses[i % responses.length]!);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('large response (100KB) parsed within 100ms', () => {
    const bigResponse = 'DIRECT: ' + 'x'.repeat(100_000);
    const start = performance.now();
    parseCoordinatorResponse(bigResponse);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── SessionRegistry performance ────────────────────────────────────────
describe('SessionRegistry — performance gates', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  it('register + lookup 1000 sessions within 200ms', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      registry.register(`Agent_${i}`, 'dev');
    }
    for (let i = 0; i < 1000; i++) {
      registry.get(`Agent_${i}`);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(registry.getAll()).toHaveLength(1000);
  });

  it('clear 1000 sessions within 100ms', () => {
    for (let i = 0; i < 1000; i++) {
      registry.register(`Agent_${i}`, 'dev');
    }
    const start = performance.now();
    registry.clear();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(registry.getAll()).toHaveLength(0);
  });
});

// ─── MemoryManager performance ──────────────────────────────────────────
describe('MemoryManager — performance gates', () => {
  it('trackBuffer for 500 sessions within 200ms', () => {
    const mm = new MemoryManager({ maxStreamBuffer: 10_000_000 });
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      mm.trackBuffer(`session_${i}`, 100);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(mm.getStats().sessions).toBe(500);
  });

  it('getStats across 500 sessions within 100ms', () => {
    const mm = new MemoryManager({ maxStreamBuffer: 10_000_000 });
    for (let i = 0; i < 500; i++) {
      mm.trackBuffer(`session_${i}`, 100);
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      mm.getStats();
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('trimMessages on 10000-element array within 50ms', () => {
    const mm = new MemoryManager({ maxMessages: 200 });
    const msgs = Array.from({ length: 10_000 }, (_, i) => ({ id: i, text: `msg ${i}` }));
    const start = performance.now();
    const trimmed = mm.trimMessages(msgs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(trimmed).toHaveLength(200);
  });
});
