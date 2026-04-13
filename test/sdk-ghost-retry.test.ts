/**
 * Tests for ghost-retry module extracted to SDK.
 * Imports from @bradygaster/squad-sdk/runtime/ghost-retry.
 */
import { describe, it, expect, vi } from 'vitest';
import { withGhostRetry } from '@bradygaster/squad-sdk/runtime/ghost-retry';
import type { GhostRetryOptions } from '@bradygaster/squad-sdk/runtime/ghost-retry';

describe('withGhostRetry (SDK)', () => {
  it('returns immediately on non-empty first response', async () => {
    const sendFn = vi.fn().mockResolvedValue('hello');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    expect(result).toBe('hello');
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('retries on empty string response', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('recovered');
    const result = await withGhostRetry(sendFn, { backoffMs: [0] });
    expect(result).toBe('recovered');
    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('retries on falsy (empty string) response', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('got it');
    const result = await withGhostRetry(sendFn, { backoffMs: [0, 0, 0] });
    expect(result).toBe('got it');
    expect(sendFn).toHaveBeenCalledTimes(3);
  });

  it('respects maxRetries option', async () => {
    const sendFn = vi.fn().mockResolvedValue('');
    const result = await withGhostRetry(sendFn, { maxRetries: 2, backoffMs: [0, 0] });
    expect(result).toBe('');
    // initial attempt + 2 retries = 3 calls
    expect(sendFn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry callback with correct attempt number', async () => {
    const onRetry = vi.fn();
    const sendFn = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('ok');

    await withGhostRetry(sendFn, { onRetry, backoffMs: [0, 0] });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, 3); // attempt 1, maxRetries 3
    expect(onRetry).toHaveBeenCalledWith(2, 3); // attempt 2, maxRetries 3
  });

  it('calls onExhausted when all retries fail', async () => {
    const onExhausted = vi.fn();
    const sendFn = vi.fn().mockResolvedValue('');

    await withGhostRetry(sendFn, { maxRetries: 1, onExhausted, backoffMs: [0] });

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(1);
  });

  it('returns empty string when all retries exhausted', async () => {
    const sendFn = vi.fn().mockResolvedValue('');
    const result = await withGhostRetry(sendFn, { maxRetries: 2, backoffMs: [0, 0] });
    expect(result).toBe('');
  });

  it('uses custom backoffMs delays', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('done');

    const start = Date.now();
    const result = await withGhostRetry(sendFn, { backoffMs: [10] });
    const elapsed = Date.now() - start;

    expect(result).toBe('done');
    // Should have waited at least ~10ms for the backoff
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  it('calls debugLog on retry and exhaustion', async () => {
    const debugLog = vi.fn();
    const sendFn = vi.fn().mockResolvedValue('');

    await withGhostRetry(sendFn, {
      maxRetries: 1,
      debugLog,
      promptPreview: 'test prompt',
      backoffMs: [0],
    });

    // One retry log + one exhaustion log
    expect(debugLog).toHaveBeenCalledTimes(2);
    expect(debugLog).toHaveBeenCalledWith('ghost response detected', expect.objectContaining({
      attempt: 1,
      promptPreview: 'test prompt',
    }));
    expect(debugLog).toHaveBeenCalledWith('ghost response: all retries exhausted', expect.objectContaining({
      promptPreview: 'test prompt',
    }));
  });

  it('GhostRetryOptions interface is structurally correct', () => {
    const opts: GhostRetryOptions = {
      maxRetries: 5,
      backoffMs: [100, 200],
      onRetry: (_attempt, _max) => {},
      onExhausted: (_max) => {},
      debugLog: (..._args) => {},
      promptPreview: 'hello',
    };
    expect(opts.maxRetries).toBe(5);
    expect(opts.backoffMs).toEqual([100, 200]);
  });
});
