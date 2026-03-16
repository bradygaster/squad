/**
 * Per-Agent Model Selection (M1-9) + Model Fallback (M3-5, Issue #145)
 */

import { MODELS } from '../runtime/constants.js';
import type { EventBus } from '../runtime/event-bus.js';

/**
 * Task types that influence model selection.
 */
export type TaskType = 'code' | 'prompt' | 'docs' | 'visual' | 'planning' | 'mechanical';

/**
 * Model tier classification.
 */
export type ModelTier = 'premium' | 'standard' | 'fast';

/**
 * Source of the model resolution.
 */
export type ModelResolutionSource = 'user-override' | 'charter' | 'task-auto' | 'default';

/**
 * Options for model resolution.
 */
export interface ModelResolutionOptions {
  /** User-specified model override */
  userOverride?: string;
  /** Model preference from agent's charter (## Model section) */
  charterPreference?: string;
  /** Type of task being performed */
  taskType: TaskType;
  /** Agent role (for context) */
  agentRole?: string;
}

/**
 * Result of model resolution.
 */
export interface ResolvedModel {
  /** Selected model identifier */
  model: string;
  /** Model tier classification */
  tier: ModelTier;
  /** Source that determined the model */
  source: ModelResolutionSource;
  /** Fallback chain for this tier */
  fallbackChain: string[];
}

/**
 * Resolve the appropriate model using the 4-layer priority system.
 * 
 * @param options - Model resolution options
 * @returns Resolved model with tier and fallback chain
 */
export function resolveModel(options: ModelResolutionOptions): ResolvedModel {
  const { userOverride, charterPreference, taskType } = options;

  // Layer 1: User Override
  if (userOverride && userOverride.trim().length > 0) {
    const tier = inferTierFromModel(userOverride);
    return {
      model: userOverride,
      tier,
      source: 'user-override',
      fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
    };
  }

  // Layer 2: Charter Preference
  if (charterPreference && charterPreference.trim().length > 0 && charterPreference !== 'auto') {
    const tier = inferTierFromModel(charterPreference);
    return {
      model: charterPreference,
      tier,
      source: 'charter',
      fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
    };
  }

  // Layer 3: Task-Aware Auto-Selection
  const autoSelected = selectModelForTask(taskType);
  if (autoSelected) {
    return autoSelected;
  }

  // Layer 4: Default
  return {
    model: MODELS.SELECTOR_DEFAULT,
    tier: MODELS.SELECTOR_DEFAULT_TIER,
    source: 'default',
    fallbackChain: [...MODELS.FALLBACK_CHAINS[MODELS.SELECTOR_DEFAULT_TIER]],
  };
}

/**
 * Select model based on task type.
 * 
 * @param taskType - Type of task being performed
 * @returns Resolved model or undefined if no match
 */
function selectModelForTask(taskType: TaskType): ResolvedModel | undefined {
  switch (taskType) {
    case 'code':
      return {
        model: 'claude-sonnet-4.6',
        tier: 'standard',
        source: 'task-auto',
        fallbackChain: [...MODELS.FALLBACK_CHAINS.standard],
      };
    
    case 'prompt':
      return {
        model: 'claude-sonnet-4.6',
        tier: 'standard',
        source: 'task-auto',
        fallbackChain: [...MODELS.FALLBACK_CHAINS.standard],
      };
    
    case 'visual':
      return {
        model: 'claude-opus-4.6',
        tier: 'premium',
        source: 'task-auto',
        fallbackChain: [...MODELS.FALLBACK_CHAINS.premium],
      };
    
    case 'docs':
    case 'planning':
    case 'mechanical':
      return {
        model: 'claude-haiku-4.5',
        tier: 'fast',
        source: 'task-auto',
        fallbackChain: [...MODELS.FALLBACK_CHAINS.fast],
      };
    
    default:
      return undefined;
  }
}

export function inferTierFromModel(model: string): ModelTier {
  const lowerModel = model.toLowerCase();
  
  if (lowerModel.includes('opus')) {
    return 'premium';
  }
  
  if (lowerModel.includes('haiku') || lowerModel.includes('mini')) {
    return 'fast';
  }
  
  // Default to standard for sonnet, gpt-5.x, etc.
  return 'standard';
}

// ============================================================================
// Model Fallback Executor (M3-5, Issue #145)
// ============================================================================

const TIER_ORDER: Record<ModelTier, number> = { premium: 0, standard: 1, fast: 2 };

export function isTierFallbackAllowed(
  fromTier: ModelTier,
  toTier: ModelTier,
  allowCrossTier: boolean,
): boolean {
  if (allowCrossTier) return true;
  if (fromTier === toTier) return true;
  return TIER_ORDER[toTier] <= TIER_ORDER[fromTier];
}

export interface FallbackAttempt {
  model: string;
  tier: ModelTier;
  error: string;
  timestamp: Date;
}

export interface FallbackResult<T> {
  value: T;
  model: string;
  tier: ModelTier;
  attempts: FallbackAttempt[];
  didFallback: boolean;
}

export interface FallbackExecutorConfig {
  allowCrossTier?: boolean;
  eventBus?: EventBus;
}

export class ModelFallbackExecutor {
  private allowCrossTier: boolean;
  private eventBus?: EventBus;
  private history: Map<string, FallbackAttempt[]> = new Map();

  constructor(config: FallbackExecutorConfig = {}) {
    this.allowCrossTier = config.allowCrossTier ?? false;
    this.eventBus = config.eventBus;
  }

  async execute<T>(
    resolved: ResolvedModel,
    agentName: string,
    fn: (model: string) => Promise<T>,
  ): Promise<FallbackResult<T>> {
    const attempts: FallbackAttempt[] = [];
    const originalTier = resolved.tier;
    const candidates = this.buildCandidateList(resolved);

    for (const candidate of candidates) {
      const candidateTier = inferTierFromModel(candidate);
      if (!isTierFallbackAllowed(originalTier, candidateTier, this.allowCrossTier)) {
        continue;
      }
      try {
        const value = await fn(candidate);
        if (!this.history.has(agentName)) this.history.set(agentName, []);
        this.history.get(agentName)!.push(...attempts);
        return { value, model: candidate, tier: candidateTier, attempts, didFallback: attempts.length > 0 };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const attempt: FallbackAttempt = { model: candidate, tier: candidateTier, error: errorMsg, timestamp: new Date() };
        attempts.push(attempt);
        await this.emitEvent('agent:milestone', { event: 'model.fallback', agentName, failedModel: candidate, failedTier: candidateTier, error: errorMsg, attemptNumber: attempts.length });
      }
    }

    if (!this.history.has(agentName)) this.history.set(agentName, []);
    this.history.get(agentName)!.push(...attempts);
    await this.emitEvent('agent:milestone', { event: 'model.exhausted', agentName, originalModel: resolved.model, originalTier, totalAttempts: attempts.length });
    throw new Error(`All models exhausted for agent '${agentName}'. Tried ${attempts.length} model(s): ${attempts.map(a => a.model).join(', ')}`);
  }

  getHistory(agentName: string): FallbackAttempt[] {
    return this.history.get(agentName) ?? [];
  }

  clearHistory(): void {
    this.history.clear();
  }

  private buildCandidateList(resolved: ResolvedModel): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    const add = (m: string) => { if (!seen.has(m)) { seen.add(m); result.push(m); } };
    add(resolved.model);
    for (const fb of resolved.fallbackChain) add(fb);
    return result;
  }

  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit({ type: type as any, payload, timestamp: new Date() });
  }
}
