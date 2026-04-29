/**
 * Ghost response retry logic — pure async retry with exponential backoff.
 * Zero dependencies on shell infrastructure.
 */

/** Options for ghost response retry. */
export interface GhostRetryOptions {
  maxRetries?: number;
  backoffMs?: readonly number[];
  onRetry?: (attempt: number, maxRetries: number) => void;
  onExhausted?: (maxRetries: number) => void;
  debugLog?: (...args: unknown[]) => void;
  promptPreview?: string;
}

/**
 * Retry a send function when the response is empty (ghost response).
 * Ghost responses occur when session.idle fires before assistant.message,
 * causing sendAndWait() to return undefined or empty content.
 */
export async function withGhostRetry(
  sendFn: () => Promise<string>,
  options: GhostRetryOptions = {},
): Promise<string> {
  const maxRetries = options.maxRetries ?? 3;
  const backoffMs = options.backoffMs ?? [1000, 2000, 4000];
  const log = options.debugLog ?? (() => {});
  const preview = options.promptPreview ?? '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log('ghost response detected', {
        timestamp: new Date().toISOString(),
        attempt,
        promptPreview: preview.slice(0, 80),
      });
      options.onRetry?.(attempt, maxRetries);
      const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 4000;
      await new Promise<void>(r => setTimeout(r, delay));
    }
    const result = await sendFn();
    if (result) return result;
  }

  log('ghost response: all retries exhausted', {
    timestamp: new Date().toISOString(),
    promptPreview: preview.slice(0, 80),
  });
  options.onExhausted?.(maxRetries);
  return '';
}
