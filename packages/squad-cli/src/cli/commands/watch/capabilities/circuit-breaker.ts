/**
 * Enhanced Circuit Breaker capability — model-level fallback with cooldown.
 *
 * Ported from ralph-watch.ps1 `Get-CircuitBreakerState` / `Update-CircuitBreakerOn*`.
 * Tracks model failures, auto-fallback through a configurable chain, and
 * cooldown timer.  State persisted to `.squad/ralph-circuit-breaker.json`.
 *
 * This is a **utility module** consumed by the main watch loop, not a
 * phase-based capability (it gates every round, not a specific phase).
 *
 * Config (via squad.config.ts → watch.circuitBreaker):
 *   preferredModel   – default model to use (default: "claude-sonnet-4")
 *   fallbackChain    – ordered list of fallback models
 *   cooldownMinutes  – minutes before half-open probe (default: 10)
 *   requiredSuccessesToClose – successes in half-open before closing (default: 2)
 */

import path from 'node:path';
import fs from 'node:fs';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ModelCircuitBreakerState {
  state: CircuitState;
  preferredModel: string;
  currentModel: string;
  fallbackChain: string[];
  lastRateLimitHit: string | null;
  cooldownMinutes: number;
  consecutiveSuccesses: number;
  requiredSuccessesToClose: number;
  totalFallbacks: number;
  totalRecoveries: number;
}

export interface CircuitBreakerConfig {
  preferredModel?: string;
  fallbackChain?: string[];
  cooldownMinutes?: number;
  requiredSuccessesToClose?: number;
}

const DEFAULT_STATE: ModelCircuitBreakerState = {
  state: 'closed',
  preferredModel: 'claude-sonnet-4',
  currentModel: 'claude-sonnet-4',
  fallbackChain: ['gpt-4.1', 'claude-haiku-4.5'],
  lastRateLimitHit: null,
  cooldownMinutes: 10,
  consecutiveSuccesses: 0,
  requiredSuccessesToClose: 2,
  totalFallbacks: 0,
  totalRecoveries: 0,
};

export class ModelCircuitBreaker {
  private statePath: string;

  constructor(squadDir: string, config?: CircuitBreakerConfig) {
    this.statePath = path.join(squadDir, 'ralph-circuit-breaker.json');
    // Ensure defaults incorporate any user config
    if (config) {
      const state = this.load();
      let dirty = false;
      if (config.preferredModel && state.preferredModel !== config.preferredModel) {
        state.preferredModel = config.preferredModel;
        if (state.state === 'closed') state.currentModel = config.preferredModel;
        dirty = true;
      }
      if (config.fallbackChain) { state.fallbackChain = config.fallbackChain; dirty = true; }
      if (config.cooldownMinutes) { state.cooldownMinutes = config.cooldownMinutes; dirty = true; }
      if (config.requiredSuccessesToClose) { state.requiredSuccessesToClose = config.requiredSuccessesToClose; dirty = true; }
      if (dirty) this.save(state);
    }
  }

  load(): ModelCircuitBreakerState {
    try {
      if (!fs.existsSync(this.statePath)) return { ...DEFAULT_STATE };
      const raw = fs.readFileSync(this.statePath, 'utf-8');
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw) as Partial<ModelCircuitBreakerState>;
      // Handle legacy nested schema (model_fallback wrapper)
      const legacy = parsed as Record<string, unknown>;
      if (!parsed.preferredModel && legacy['model_fallback']) {
        const mf = legacy['model_fallback'] as Record<string, unknown>;
        return {
          ...DEFAULT_STATE,
          preferredModel: (mf['preferred'] as string) ?? DEFAULT_STATE.preferredModel,
          currentModel: (mf['preferred'] as string) ?? DEFAULT_STATE.currentModel,
          fallbackChain: (mf['fallback_chain'] as string[]) ?? DEFAULT_STATE.fallbackChain,
        };
      }
      return { ...DEFAULT_STATE, ...parsed };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  save(state: ModelCircuitBreakerState): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch { /* best-effort */ }
  }

  /** Get the model to use for the current round. */
  getCurrentModel(): string {
    const state = this.load();
    if (state.state === 'closed') return state.preferredModel;
    if (state.state === 'open') {
      if (state.lastRateLimitHit) {
        const elapsed = Date.now() - new Date(state.lastRateLimitHit).getTime();
        if (elapsed >= state.cooldownMinutes * 60_000) {
          state.state = 'half-open';
          state.currentModel = state.preferredModel;
          this.save(state);
          return state.preferredModel;
        }
      }
      return state.currentModel;
    }
    // half-open — probe preferred
    return state.preferredModel;
  }

  /** Call after a successful round. */
  onSuccess(): void {
    const state = this.load();
    if (state.state === 'half-open') {
      state.consecutiveSuccesses++;
      if (state.consecutiveSuccesses >= state.requiredSuccessesToClose) {
        state.state = 'closed';
        state.currentModel = state.preferredModel;
        state.consecutiveSuccesses = 0;
        state.totalRecoveries++;
      }
      this.save(state);
    }
  }

  /** Call when a rate limit or model error is detected. */
  onRateLimit(): void {
    const state = this.load();
    state.state = 'open';
    state.lastRateLimitHit = new Date().toISOString();
    state.consecutiveSuccesses = 0;
    state.totalFallbacks++;
    // Pick first fallback
    if (state.fallbackChain.length > 0) {
      state.currentModel = state.fallbackChain[0]!;
    }
    this.save(state);
  }

  /** Reset to defaults (used by post-failure remediation). */
  reset(): void {
    this.save({ ...DEFAULT_STATE });
  }

  /** Get full state for diagnostics. */
  getState(): ModelCircuitBreakerState {
    return this.load();
  }
}


