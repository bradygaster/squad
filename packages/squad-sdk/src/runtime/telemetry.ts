/**
 * Telemetry & Update Notifications (M4-7, Issue #108)
 *
 * Privacy-first, opt-in telemetry collection for Squad.
 * No PII, no code content — only aggregate usage metrics.
 *
 * @module runtime/telemetry
 */

// ============================================================================
// Types
// ============================================================================

/** Recognised telemetry event names. */
export type TelemetryEventName =
  | 'squad.init'
  | 'squad.run'
  | 'squad.agent.spawn'
  | 'squad.error'
  | 'squad.upgrade';

/** A single telemetry event. */
export interface TelemetryEvent {
  /** Event name */
  name: TelemetryEventName;
  /** Arbitrary metadata (must not contain PII or code) */
  properties?: Record<string, string | number | boolean>;
  /** Timestamp (defaults to Date.now()) */
  timestamp?: number;
}

/** Configuration for telemetry. */
export interface TelemetryConfig {
  /** Master switch — disabled by default */
  enabled: boolean;
  /** HTTP endpoint for flushing events */
  endpoint?: string;
  /** Whether to strip identifying data even from properties */
  anonymize?: boolean;
  /** Event names to exclude from collection */
  excludeEvents?: TelemetryEventName[];
}

/** Pluggable transport — how events are actually sent. */
export type TelemetryTransport = (events: TelemetryEvent[], endpoint: string) => Promise<void>;

// ============================================================================
// Default (no-op) transport
// ============================================================================

let _transport: TelemetryTransport = async () => {
  // no-op until consumer provides a real transport
};

/** Register a custom transport for flushing events. */
export function setTelemetryTransport(fn: TelemetryTransport): void {
  _transport = fn;
}

// ============================================================================
// TelemetryCollector
// ============================================================================

/**
 * Opt-in, privacy-respecting telemetry collector.
 *
 * Events are queued in memory and only sent when `flush()` is called.
 * The collector respects the consent flag and never transmits when disabled.
 *
 * ```ts
 * const telemetry = new TelemetryCollector({ enabled: false });
 * telemetry.setConsent(true);
 * telemetry.collectEvent({ name: 'squad.init' });
 * await telemetry.flush();
 * ```
 */
export class TelemetryCollector {
  /** Cap queued events to prevent unbounded memory growth. */
  static readonly MAX_QUEUE_SIZE = 500;

  private queue: TelemetryEvent[] = [];
  private config: TelemetryConfig;

  constructor(config?: Partial<TelemetryConfig>) {
    this.config = {
      enabled: false,
      endpoint: '',
      anonymize: false,
      excludeEvents: [],
      ...config,
    };
  }

  // --------------------------------------------------------------------------
  // Consent management
  // --------------------------------------------------------------------------

  /** Returns the current consent (enabled) status. */
  getConsentStatus(): boolean {
    return this.config.enabled;
  }

  /** Set consent status. When false, collectEvent becomes a no-op. */
  setConsent(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  // --------------------------------------------------------------------------
  // Event collection
  // --------------------------------------------------------------------------

  /**
   * Queue a telemetry event.
   *
   * Does nothing when consent is not given or the event name is excluded.
   */
  collectEvent(event: TelemetryEvent): void {
    if (!this.config.enabled) return;

    if (this.config.excludeEvents?.includes(event.name)) return;

    const stored: TelemetryEvent = {
      name: event.name,
      properties: this.config.anonymize
        ? undefined
        : event.properties ? { ...event.properties } : undefined,
      timestamp: event.timestamp ?? Date.now(),
    };

    this.queue.push(stored);

    // Evict oldest events when queue exceeds cap (FIFO)
    if (this.queue.length > TelemetryCollector.MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-TelemetryCollector.MAX_QUEUE_SIZE);
    }
  }

  /**
   * Send all queued events via the configured transport, then clear the queue.
   * Returns the number of events flushed.
   */
  async flush(): Promise<number> {
    if (!this.config.enabled || this.queue.length === 0) return 0;

    const endpoint = this.config.endpoint ?? '';
    const batch = [...this.queue];
    this.queue = [];

    await _transport(batch, endpoint);
    return batch.length;
  }

  /** Return the number of queued (unflushed) events. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Discard all queued events without sending. */
  drain(): void {
    this.queue = [];
  }

  /** Return a copy of the current config. */
  getConfig(): Readonly<TelemetryConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// Update notification helpers
// ============================================================================

/**
 * Decide whether the user should be notified about available updates.
 *
 * @param lastCheck - Timestamp of the last update check
 * @param intervalMs - Minimum milliseconds between notifications
 * @returns true if enough time has elapsed since the last check
 */
export function shouldNotifyUpdate(lastCheck: Date, intervalMs: number): boolean {
  const elapsed = Date.now() - lastCheck.getTime();
  return elapsed >= intervalMs;
}
