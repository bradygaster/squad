/**
 * OTel Metrics (Issues #261, #262, #263, #264)
 *
 * Provides counters, histograms, and gauges for token usage,
 * agent performance, session pool, and response latency.
 * No-op when OTel is not configured (getMeter returns a no-op meter).
 *
 * @module runtime/otel-metrics
 */

import { getMeter } from './otel.js';
import type { UsageEvent } from './streaming.js';
import type { PrReworkResult, ReworkSummary } from './rework.js';

// ============================================================================
// #261 — Token Usage Metrics
// ============================================================================

interface TokenMetrics {
  inputCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  outputCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  costCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  totalCounter: ReturnType<ReturnType<typeof getMeter>['createUpDownCounter']>;
}

let _tokenMetrics: TokenMetrics | undefined;

function ensureTokenMetrics(): TokenMetrics {
  if (!_tokenMetrics) {
    const meter = getMeter('squad-sdk');
    _tokenMetrics = {
      inputCounter: meter.createCounter('squad.tokens.input', {
        description: 'Total input tokens consumed',
        unit: 'tokens',
      }),
      outputCounter: meter.createCounter('squad.tokens.output', {
        description: 'Total output tokens produced',
        unit: 'tokens',
      }),
      costCounter: meter.createCounter('squad.tokens.cost', {
        description: 'Estimated cost in USD',
        unit: 'USD',
      }),
      totalCounter: meter.createUpDownCounter('squad.tokens.total', {
        description: 'Running total of all tokens',
        unit: 'tokens',
      }),
    };
  }
  return _tokenMetrics;
}

/**
 * Record token usage from a UsageEvent.
 * Safe to call when OTel is not configured — metrics are no-ops.
 */
export function recordTokenUsage(event: UsageEvent): void {
  const m = ensureTokenMetrics();
  const attrs = {
    'agent.name': event.agentName ?? 'unknown',
    'model': event.model,
  };
  m.inputCounter.add(event.inputTokens, attrs);
  m.outputCounter.add(event.outputTokens, attrs);
  m.costCounter.add(event.estimatedCost, attrs);
  m.totalCounter.add(event.inputTokens + event.outputTokens, attrs);
}

// ============================================================================
// #262 — Agent Performance Metrics
// ============================================================================

interface AgentMetrics {
  spawnsCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  durationHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  errorsCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  activeGauge: ReturnType<ReturnType<typeof getMeter>['createUpDownCounter']>;
}

let _agentMetrics: AgentMetrics | undefined;

function ensureAgentMetrics(): AgentMetrics {
  if (!_agentMetrics) {
    const meter = getMeter('squad-sdk');
    _agentMetrics = {
      spawnsCounter: meter.createCounter('squad.agent.spawns', {
        description: 'Total agent spawns',
      }),
      durationHistogram: meter.createHistogram('squad.agent.duration', {
        description: 'Agent task duration in milliseconds',
        unit: 'ms',
      }),
      errorsCounter: meter.createCounter('squad.agent.errors', {
        description: 'Total agent errors',
      }),
      activeGauge: meter.createUpDownCounter('squad.agent.active', {
        description: 'Currently active agent sessions',
      }),
    };
  }
  return _agentMetrics;
}

/** Record an agent spawn event. */
export function recordAgentSpawn(agentName: string, mode: string = 'sync'): void {
  const m = ensureAgentMetrics();
  m.spawnsCounter.add(1, { 'agent.name': agentName, mode });
  m.activeGauge.add(1, { 'agent.name': agentName });
}

/** Record agent task completion with duration. */
export function recordAgentDuration(agentName: string, durationMs: number, status: 'success' | 'error' = 'success'): void {
  const m = ensureAgentMetrics();
  m.durationHistogram.record(durationMs, { 'agent.name': agentName, status });
  if (status === 'error') {
    m.errorsCounter.add(1, { 'agent.name': agentName, 'error.type': 'task_failure' });
  }
}

/** Record an agent error. */
export function recordAgentError(agentName: string, errorType: string): void {
  const m = ensureAgentMetrics();
  m.errorsCounter.add(1, { 'agent.name': agentName, 'error.type': errorType });
}

/** Record agent session destruction (decrements active count). */
export function recordAgentDestroy(agentName: string): void {
  const m = ensureAgentMetrics();
  m.activeGauge.add(-1, { 'agent.name': agentName });
}

// ============================================================================
// #263 — Session Pool Metrics
// ============================================================================

interface SessionPoolMetrics {
  activeCounter: ReturnType<ReturnType<typeof getMeter>['createUpDownCounter']>;
  idleCounter: ReturnType<ReturnType<typeof getMeter>['createUpDownCounter']>;
  createdCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  closedCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
  errorsCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']>;
}

let _sessionPoolMetrics: SessionPoolMetrics | undefined;

function ensureSessionPoolMetrics(): SessionPoolMetrics {
  if (!_sessionPoolMetrics) {
    const meter = getMeter('squad-sdk');
    _sessionPoolMetrics = {
      activeCounter: meter.createUpDownCounter('squad.sessions.active', {
        description: 'Currently active sessions',
      }),
      idleCounter: meter.createUpDownCounter('squad.sessions.idle', {
        description: 'Currently idle pooled sessions',
      }),
      createdCounter: meter.createCounter('squad.sessions.created', {
        description: 'Total sessions created',
      }),
      closedCounter: meter.createCounter('squad.sessions.closed', {
        description: 'Total sessions closed',
      }),
      errorsCounter: meter.createCounter('squad.sessions.errors', {
        description: 'Session creation/streaming failures',
      }),
    };
  }
  return _sessionPoolMetrics;
}

/** Record a new session being created. */
export function recordSessionCreated(): void {
  const m = ensureSessionPoolMetrics();
  m.createdCounter.add(1);
  m.activeCounter.add(1);
}

/** Record a session becoming idle. */
export function recordSessionIdle(): void {
  const m = ensureSessionPoolMetrics();
  m.activeCounter.add(-1);
  m.idleCounter.add(1);
}

/** Record an idle session becoming active again. */
export function recordSessionReactivated(): void {
  const m = ensureSessionPoolMetrics();
  m.idleCounter.add(-1);
  m.activeCounter.add(1);
}

/** Record a session being closed. */
export function recordSessionClosed(): void {
  const m = ensureSessionPoolMetrics();
  m.activeCounter.add(-1);
  m.closedCounter.add(1);
}

/** Record a session error. */
export function recordSessionError(): void {
  const m = ensureSessionPoolMetrics();
  m.errorsCounter.add(1);
}

// ============================================================================
// #264 — Response Latency Metrics
// ============================================================================

interface LatencyMetrics {
  ttftHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  durationHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  tokensPerSecGauge: ReturnType<ReturnType<typeof getMeter>['createGauge']>;
}

let _latencyMetrics: LatencyMetrics | undefined;

function ensureLatencyMetrics(): LatencyMetrics {
  if (!_latencyMetrics) {
    const meter = getMeter('squad-sdk');
    _latencyMetrics = {
      ttftHistogram: meter.createHistogram('squad.response.ttft', {
        description: 'Time to first token in milliseconds',
        unit: 'ms',
      }),
      durationHistogram: meter.createHistogram('squad.response.duration', {
        description: 'Total response duration in milliseconds',
        unit: 'ms',
      }),
      tokensPerSecGauge: meter.createGauge('squad.response.tokens_per_second', {
        description: 'Streaming throughput (tokens/second)',
        unit: 'tokens/s',
      }),
    };
  }
  return _latencyMetrics;
}

/** Record time to first token. */
export function recordTimeToFirstToken(ttftMs: number): void {
  const m = ensureLatencyMetrics();
  m.ttftHistogram.record(ttftMs);
}

/** Record total response duration. */
export function recordResponseDuration(durationMs: number): void {
  const m = ensureLatencyMetrics();
  m.durationHistogram.record(durationMs);
}

/** Record streaming throughput. */
export function recordTokensPerSecond(tokensPerSec: number): void {
  const m = ensureLatencyMetrics();
  m.tokensPerSecGauge.record(tokensPerSec);
}

// ============================================================================
// #265 — Rework Rate Metrics
// ============================================================================

interface ReworkMetrics {
  rateGauge: ReturnType<ReturnType<typeof getMeter>['createGauge']>;
  cyclesHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
  rejectionRateGauge: ReturnType<ReturnType<typeof getMeter>['createGauge']>;
  timeHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']>;
}

let _reworkMetrics: ReworkMetrics | undefined;

function ensureReworkMetrics(): ReworkMetrics {
  if (!_reworkMetrics) {
    const meter = getMeter('squad-sdk');
    _reworkMetrics = {
      rateGauge: meter.createGauge('squad.rework.rate', {
        description: 'Current rework rate percentage',
        unit: '%',
      }),
      cyclesHistogram: meter.createHistogram('squad.rework.cycles', {
        description: 'Review cycles per PR',
      }),
      rejectionRateGauge: meter.createGauge('squad.rework.rejection_rate', {
        description: 'Percentage of PRs with changes requested',
        unit: '%',
      }),
      timeHistogram: meter.createHistogram('squad.rework.time_ms', {
        description: 'Time spent in rework in milliseconds',
        unit: 'ms',
      }),
    };
  }
  return _reworkMetrics;
}

/** Record rework metrics for a single PR analysis result. */
export function recordReworkMetrics(result: PrReworkResult): void {
  const m = ensureReworkMetrics();
  const attrs = {
    'pr.number': result.number,
    'pr.author': result.author,
  };
  m.rateGauge.record(result.reworkRate, attrs);
  m.cyclesHistogram.record(result.reviewCycles, attrs);
  if (result.reworkTimeMs !== null) {
    m.timeHistogram.record(result.reworkTimeMs, attrs);
  }
}

/** Record aggregate rework summary metrics across multiple PRs. */
export function recordReworkSummary(summary: ReworkSummary): void {
  const m = ensureReworkMetrics();
  if (summary.avgReworkRate != null) {
    m.rateGauge.record(summary.avgReworkRate, { scope: 'summary' });
  }
  if (summary.rejectionRate != null) {
    m.rejectionRateGauge.record(summary.rejectionRate, { scope: 'summary' });
  }
  if (summary.avgReviewCycles != null) {
    m.cyclesHistogram.record(summary.avgReviewCycles, { scope: 'summary' });
  }
  if (summary.avgReworkTimeHours != null) {
    m.timeHistogram.record(summary.avgReworkTimeHours * 3_600_000, { scope: 'summary' });
  }
}

// ============================================================================
// Reset (for testing)
// ============================================================================

/** Reset all cached metric instances. Used in tests only. */
export function _resetMetrics(): void {
  _tokenMetrics = undefined;
  _agentMetrics = undefined;
  _sessionPoolMetrics = undefined;
  _latencyMetrics = undefined;
  _reworkMetrics = undefined;
}
