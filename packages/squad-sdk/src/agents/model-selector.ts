/**
 * Per-Agent Model Selection (M1-9) + Model Fallback (M3-5, Issue #145)
 */

import { MODELS } from '../runtime/constants.js';
import {
  applyEconomyMode,
  MODEL_CATALOG,
  CATEGORY_ORDER,
  type GitHubModelCategory,
  type CostPolicyConfig,
  type SessionCostPolicyOverride,
  type CostPolicyOutcome,
} from '../config/models.js';
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
  /** When true, apply economy mode substitution at Layer 3/4 */
  economyMode?: boolean;
  /**
   * Persistent config carrying an optional cost policy (cost-ceiling axis).
   * When present with a `maxCategory`, resolution is finalized against it.
   */
  config?: { costPolicy?: CostPolicyConfig };
  /** Per-session cost policy override (wins over `config.costPolicy`). */
  sessionCostPolicy?: SessionCostPolicyOverride;
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
  /** Cost-policy outcome, present only when a policy was applied. */
  policy?: CostPolicyOutcome;
}

/**
 * Effective (merged) cost policy after combining persistent config + session
 * override. Only produced when a `maxCategory` is actually set.
 */
export interface EffectiveCostPolicy {
  maxCategory: GitHubModelCategory;
}

/**
 * Resolve the appropriate model using the 4-layer priority system, then
 * finalize against the effective cost policy (cost-ceiling axis).
 *
 * @param options - Model resolution options
 * @returns Resolved model with tier, fallback chain, and optional policy outcome
 */
export function resolveModel(options: ModelResolutionOptions): ResolvedModel {
  const base = resolveBaseModel(options);
  const policy = buildEffectiveCostPolicy(options.config, options.sessionCostPolicy);
  if (!policy) return base;
  return finalizeResolvedModel(base, policy, buildCatalogCategoryMap());
}

/**
 * Layered base resolution (the original 4-layer selector). Unchanged behavior;
 * split out so {@link resolveModel} can finalize the result against a policy.
 */
function resolveBaseModel(options: ModelResolutionOptions): ResolvedModel {
  const { userOverride, charterPreference, taskType, economyMode } = options;

  // Layer 1: User Override (explicit — economy does not apply)
  if (userOverride && userOverride.trim().length > 0) {
    const tier = inferTierFromModel(userOverride);
    return {
      model: userOverride,
      tier,
      source: 'user-override',
      fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
    };
  }

  // Layer 2: Charter Preference (explicit — economy does not apply)
  if (charterPreference && charterPreference.trim().length > 0 && charterPreference !== 'auto') {
    const tier = inferTierFromModel(charterPreference);
    return {
      model: charterPreference,
      tier,
      source: 'charter',
      fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
    };
  }

  // Layer 3: Task-Aware Auto-Selection (economy mode applies)
  const autoSelected = selectModelForTask(taskType, economyMode);
  if (autoSelected) {
    return autoSelected;
  }

  // Layer 4: Default (economy mode applies)
  const defaultModel = economyMode
    ? applyEconomyMode(MODELS.SELECTOR_DEFAULT)
    : MODELS.SELECTOR_DEFAULT;
  const defaultTier = inferTierFromModel(defaultModel);
  return {
    model: defaultModel,
    tier: defaultTier,
    source: 'default',
    fallbackChain: [...MODELS.FALLBACK_CHAINS[defaultTier]],
  };
}

/**
 * Select model based on task type, with optional economy mode substitution.
 *
 * @param taskType - Type of task being performed
 * @param economyMode - When true, downgrade model to cheaper alternative
 * @returns Resolved model or undefined if no match
 */
function selectModelForTask(taskType: TaskType, economyMode?: boolean): ResolvedModel | undefined {
  let model: string | undefined;
  let tier: ModelTier | undefined;

  switch (taskType) {
    case 'code':
      model = 'gpt-5.6-terra';
      tier = 'standard';
      break;
    case 'prompt':
      model = 'gpt-5.6-terra';
      tier = 'standard';
      break;
    case 'visual':
      model = 'gpt-5.6-sol';
      tier = 'premium';
      break;
    case 'docs':
    case 'planning':
    case 'mechanical':
      model = 'gpt-5.6-luna';
      tier = 'fast';
      break;
    default:
      return undefined;
  }

  if (economyMode) {
    model = applyEconomyMode(model);
    tier = inferTierFromModel(model);
  }

  return {
    model,
    tier,
    source: 'task-auto',
    fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
  };
}

export function inferTierFromModel(model: string): ModelTier {
  const lowerModel = model.toLowerCase();
  const catalogModel = MODEL_CATALOG.find(modelInfo => modelInfo.id === lowerModel);

  if (catalogModel) {
    return catalogModel.tier;
  }

  if (lowerModel.includes('opus')) {
    return 'premium';
  }

  if (lowerModel.includes('haiku') || lowerModel.includes('mini')) {
    return 'fast';
  }

  // Default to standard for unknown sonnet, gpt-5.x, and other models.
  return 'standard';
}

// ============================================================================
// Cost Policy (Cost-Ceiling Axis, Issue #1080 / #1183)
// ============================================================================

/**
 * Build the catalog id → cost-ceiling category lookup from MODEL_CATALOG.
 * Out-of-catalog ids are simply absent (⇒ passthrough).
 */
export function buildCatalogCategoryMap(): Map<string, GitHubModelCategory> {
  const map = new Map<string, GitHubModelCategory>();
  for (const info of MODEL_CATALOG) {
    if (info.githubCategory) map.set(info.id, info.githubCategory);
  }
  return map;
}

/**
 * Merge a persistent cost policy with an optional per-session override.
 * The session override wins. Returns undefined when neither sets a ceiling
 * (⇒ no-op / passthrough).
 */
export function buildEffectiveCostPolicy(
  config?: { costPolicy?: CostPolicyConfig },
  sessionPolicy?: SessionCostPolicyOverride,
): EffectiveCostPolicy | undefined {
  const maxCategory = sessionPolicy?.maxCategory ?? config?.costPolicy?.maxCategory;
  if (!maxCategory) return undefined;
  return { maxCategory };
}

/**
 * Prune a fallback chain to the cost ceiling: drop entries whose category is
 * strictly above the ceiling. Uncategorized (out-of-catalog) entries are kept
 * as passthrough (unknown cost, not "above"). Order is preserved.
 */
export function pruneChainToCeiling(
  chain: string[],
  maxCategory: GitHubModelCategory,
  catalogMap: Map<string, GitHubModelCategory>,
): string[] {
  const ceiling = CATEGORY_ORDER[maxCategory];
  return chain.filter((id) => {
    const cat = catalogMap.get(id);
    if (cat === undefined) return true; // passthrough unknown ids
    return CATEGORY_ORDER[cat] <= ceiling;
  });
}

/**
 * Find the best in-ceiling replacement for an over-ceiling implicit pick.
 * Deterministic: search the current model, its tier chain, then the catalog
 * in declared order (premium → standard → fast); pick the first id whose
 * category is within the ceiling.
 */
function findInCeilingReplacement(
  base: ResolvedModel,
  maxCategory: GitHubModelCategory,
  catalogMap: Map<string, GitHubModelCategory>,
): string | undefined {
  const ceiling = CATEGORY_ORDER[maxCategory];
  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      candidates.push(id);
    }
  };
  add(base.model);
  for (const id of base.fallbackChain) add(id);
  for (const info of MODEL_CATALOG) add(info.id);

  for (const id of candidates) {
    const cat = catalogMap.get(id);
    if (cat !== undefined && CATEGORY_ORDER[cat] <= ceiling) return id;
  }
  return undefined;
}

/**
 * Finalize a base-resolved model against an effective cost policy.
 *
 * Branches:
 * - uncategorized model ⇒ passthrough (no policy action).
 * - within ceiling ⇒ prune the fallback chain to the ceiling.
 * - over ceiling + EXPLICIT source (user-override/charter) ⇒ warn-and-allow;
 *   the explicit model is kept as chain head, the rest pruned.
 * - over ceiling + IMPLICIT source (task-auto/default) ⇒ deterministic
 *   downgrade to the best in-ceiling model.
 * - no in-ceiling model anywhere ⇒ FAIL-CLOSED + LOUD warning; the original
 *   model is kept as a transparent last resort (action ≠ 'none').
 */
export function finalizeResolvedModel(
  base: ResolvedModel,
  policy: EffectiveCostPolicy,
  catalogMap: Map<string, GitHubModelCategory>,
): ResolvedModel {
  const { maxCategory } = policy;
  const ceiling = CATEGORY_ORDER[maxCategory];
  const baseCat = catalogMap.get(base.model);

  // Passthrough: out-of-catalog model — unknown cost, no policy action (AC10).
  if (baseCat === undefined) return base;

  const withinCeiling = CATEGORY_ORDER[baseCat] <= ceiling;

  if (withinCeiling) {
    // AC7: within ceiling — just prune the chain.
    return {
      ...base,
      fallbackChain: pruneChainToCeiling(base.fallbackChain, maxCategory, catalogMap),
      policy: { action: 'none', originalModel: base.model, finalModel: base.model },
    };
  }

  const isExplicit = base.source === 'user-override' || base.source === 'charter';

  if (isExplicit) {
    // AC6: honor the explicit over-ceiling selection, but warn loudly.
    const prunedRest = pruneChainToCeiling(base.fallbackChain, maxCategory, catalogMap).filter(
      (id) => id !== base.model,
    );
    return {
      ...base,
      fallbackChain: [base.model, ...prunedRest],
      policy: {
        action: 'warn-allow-explicit',
        originalModel: base.model,
        finalModel: base.model,
        warning:
          `Explicit model '${base.model}' (${baseCat}) exceeds the configured cost ceiling ` +
          `'${maxCategory}'. Honoring the explicit selection; consider lowering the model or ` +
          `raising the ceiling.`,
      },
    };
  }

  // Implicit over-ceiling — attempt a deterministic downgrade (AC5).
  const replacement = findInCeilingReplacement(base, maxCategory, catalogMap);
  if (replacement) {
    const newTier = inferTierFromModel(replacement);
    const prunedChain = pruneChainToCeiling(
      [...MODELS.FALLBACK_CHAINS[newTier]],
      maxCategory,
      catalogMap,
    );
    return {
      model: replacement,
      tier: newTier,
      source: base.source,
      fallbackChain: prunedChain.length > 0 ? prunedChain : [replacement],
      policy: {
        action: 'downgraded-to-ceiling',
        originalModel: base.model,
        finalModel: replacement,
        warning:
          `Model '${base.model}' (${baseCat}) exceeds the cost ceiling '${maxCategory}'; ` +
          `automatically downgraded to '${replacement}' (${catalogMap.get(replacement)}).`,
      },
    };
  }

  // AC8: fail-closed + loud — no in-ceiling model exists anywhere. Never
  // silently pass an over-ceiling model off as compliant.
  return {
    ...base,
    policy: {
      action: 'no-compliant-model',
      originalModel: base.model,
      finalModel: base.model,
      warning:
        `Cost ceiling '${maxCategory}' cannot be satisfied: no in-ceiling model is available. ` +
        `Falling back to '${base.model}' (${baseCat}) as a transparent last resort — review ` +
        `your model catalog or raise the ceiling.`,
    },
  };
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
