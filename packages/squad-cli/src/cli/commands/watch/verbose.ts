/**
 * Verbose logger for squad watch debugging.
 * Only outputs when --verbose is enabled.
 */
export function createVerboseLogger(enabled: boolean) {
  return {
    log: (...args: unknown[]) => {
      if (enabled) console.log('[verbose]', ...args);
    },
    warn: (...args: unknown[]) => {
      if (enabled) console.log('[verbose] ⚠️', ...args);
    },
    section: (title: string) => {
      if (enabled) console.log(`[verbose] ── ${title} ──`);
    },
    table: (data: Record<string, unknown>) => {
      if (enabled) {
        for (const [k, v] of Object.entries(data)) {
          console.log(`[verbose]   ${k}: ${v}`);
        }
      }
    },
  };
}

export type VerboseLogger = ReturnType<typeof createVerboseLogger>;
