/**
 * Per-session context-window utilization tracking.
 *
 * Runtime-provided samples are authoritative. Token usage events provide a
 * best-effort fallback for clients that do not expose live context accounting.
 */

export const DEFAULT_CONTEXT_WARNING_THRESHOLD = 0.8;

export type ContextUtilizationSource = 'runtime' | 'estimated';

export type ContextWindowResolver = (model: string) => number | undefined;

export interface ContextUtilizationSnapshot {
  sessionId: string;
  agentName?: string;
  model?: string;
  occupiedTokens: number;
  contextWindowTokens: number;
  utilization: number;
  warningThreshold: number;
  warning: boolean;
  thresholdCrossed: boolean;
  source: ContextUtilizationSource;
  timestamp: Date;
}

export interface RuntimeContextUsageSample {
  sessionId: string;
  agentName?: string;
  model?: string;
  currentTokens: number;
  tokenLimit: number;
  timestamp?: Date;
}

export interface EstimatedContextUsageSample {
  sessionId: string;
  agentName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp?: Date;
}

export interface ContextUtilizationTrackerOptions {
  warningThreshold?: number;
  resolveContextWindow?: ContextWindowResolver;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateWarningThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError('Context warning threshold must be greater than 0 and at most 1');
  }
  return value;
}

export class ContextUtilizationTracker {
  private readonly warningThreshold: number;
  private readonly resolveContextWindow?: ContextWindowResolver;
  private readonly snapshots = new Map<string, ContextUtilizationSnapshot>();
  private readonly sessionsAboveThreshold = new Set<string>();
  private readonly sessionsWithRuntimeSamples = new Set<string>();

  constructor(options: ContextUtilizationTrackerOptions = {}) {
    this.warningThreshold = validateWarningThreshold(
      options.warningThreshold ?? DEFAULT_CONTEXT_WARNING_THRESHOLD,
    );
    this.resolveContextWindow = options.resolveContextWindow;
  }

  recordRuntime(sample: RuntimeContextUsageSample): ContextUtilizationSnapshot | undefined {
    if (!sample.sessionId || !isNonNegativeInteger(sample.currentTokens) || !isPositiveInteger(sample.tokenLimit)) {
      return undefined;
    }

    this.sessionsWithRuntimeSamples.add(sample.sessionId);
    return this.record({
      sessionId: sample.sessionId,
      agentName: sample.agentName,
      model: sample.model,
      occupiedTokens: sample.currentTokens,
      contextWindowTokens: sample.tokenLimit,
      source: 'runtime',
      timestamp: sample.timestamp ?? new Date(),
    });
  }

  recordEstimated(sample: EstimatedContextUsageSample): ContextUtilizationSnapshot | undefined {
    if (
      !sample.sessionId
      || !sample.model
      || !isNonNegativeInteger(sample.inputTokens)
      || !isNonNegativeInteger(sample.outputTokens)
      || this.sessionsWithRuntimeSamples.has(sample.sessionId)
    ) {
      return undefined;
    }

    const contextWindowTokens = this.resolveContextWindow?.(sample.model);
    if (contextWindowTokens === undefined || !isPositiveInteger(contextWindowTokens)) {
      return undefined;
    }

    return this.record({
      sessionId: sample.sessionId,
      agentName: sample.agentName,
      model: sample.model,
      occupiedTokens: sample.inputTokens + sample.outputTokens,
      contextWindowTokens,
      source: 'estimated',
      timestamp: sample.timestamp ?? new Date(),
    });
  }

  getLatest(sessionId: string): ContextUtilizationSnapshot | undefined {
    return this.snapshots.get(sessionId);
  }

  getAll(): ContextUtilizationSnapshot[] {
    return [...this.snapshots.values()];
  }

  clear(): void {
    this.snapshots.clear();
    this.sessionsAboveThreshold.clear();
    this.sessionsWithRuntimeSamples.clear();
  }

  private record(
    sample: Omit<ContextUtilizationSnapshot, 'utilization' | 'warningThreshold' | 'warning' | 'thresholdCrossed'>,
  ): ContextUtilizationSnapshot {
    const utilization = sample.occupiedTokens / sample.contextWindowTokens;
    const warning = utilization >= this.warningThreshold;
    const wasAboveThreshold = this.sessionsAboveThreshold.has(sample.sessionId);

    if (warning) {
      this.sessionsAboveThreshold.add(sample.sessionId);
    } else {
      this.sessionsAboveThreshold.delete(sample.sessionId);
    }

    const snapshot: ContextUtilizationSnapshot = {
      ...sample,
      utilization,
      warningThreshold: this.warningThreshold,
      warning,
      thresholdCrossed: warning && !wasAboveThreshold,
    };
    this.snapshots.set(sample.sessionId, snapshot);
    return snapshot;
  }
}
