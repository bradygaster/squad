/**
 * Per-Agent Model Selection (M1-9) + Model Fallback (M3-5, Issue #145)
 */

import { MODELS } from '../runtime/constants.js';
import {
  MODEL_CATALOG,
  applyEconomyMode,
  type CostPolicyConfig,
  type CostPolicyOutcome,
  type GitHubModelCategory,
  type ModelInfo,
  type ModelPreferenceConfig,
  type SessionCostPolicyOverride,
} from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';

const MODEL_CATALOG_MAP = new Map<string, ModelInfo>(MODEL_CATALOG.map(model => [model.id, model]));
const CATEGORY_ORDER: Record<GitHubModelCategory, number> = {
  lightweight: 0,
  versatile: 1,
  powerful: 2,
};
const CHEAPER_TIERS: Record<ModelTier, ModelTier[]> = {
  premium: ['standard', 'fast'],
  standard: ['fast'],
  fast: [],
};

/**
 * Task types that influence model selection.
 */
export type TaskType = 'code' | 'prompt' | 'docs' | 'visual' | 'planning' | 'mechanical';

/**
 * Model tier classification.
 */
export type ModelTier = 'premium' | 'standard' | 'fast';

/**
 * Narrow shape for persistent local model preferences.
 */
export interface SquadLocalConfig {
  models?: ModelPreferenceConfig;
}

/**
 * Source of the model resolution.
 */
export type ModelResolutionSource =
  | 'persistent-agent-override'
  | 'persistent-default'
  | 'session-explicit'
  | 'user-override'
  | 'charter'
  | 'task-auto'
  | 'default';

interface BaseModelSelection extends ResolvedModel {}

/**
 * Options for model resolution.
 */
export interface ModelResolutionOptions {
  /** User-specified model override */
  userOverride?: string;
  /** Structured session explicit model override */
  sessionExplicitModel?: string;
  /** Model preference from agent's charter (## Model section) */
  charterPreference?: string;
  /** Persistent local config for model preferences */
  config?: SquadLocalConfig;
  /** Session-scoped cost policy override */
  sessionCostPolicy?: SessionCostPolicyOverride;
  /** Type of task being performed */
  taskType: TaskType;
  /** Agent role (used for per-agent persistent overrides) */
  agentRole?: string;
  /** When true, apply economy mode substitution at Layer 3/4 */
  economyMode?: boolean;
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
  /** Cost policy outcome, when policy evaluation ran */
  policy?: CostPolicyOutcome;
}

/**
 * Resolve the appropriate model using the layered selector, then apply cost policy.
 *
 * @param options - Model resolution options
 * @returns Resolved model with tier, source, fallback chain, and policy outcome
 */
export function resolveModel(options: ModelResolutionOptions): ResolvedModel {
  const base = resolveBaseModel(options);
  const policy = buildEffectiveCostPolicy(options.config ?? {}, options.sessionCostPolicy);
  return finalizeResolvedModel(base, policy, MODEL_CATALOG_MAP);
}

function resolveBaseModel(options: ModelResolutionOptions): BaseModelSelection {
  const { userOverride, sessionExplicitModel, charterPreference, taskType, economyMode, config, agentRole } = options;

  const persistentAgentOverride = agentRole ? config?.models?.agentModelOverrides?.[agentRole] : undefined;
  if (persistentAgentOverride && persistentAgentOverride.trim().length > 0) {
    return createResolvedModel(persistentAgentOverride, 'persistent-agent-override');
  }

  const persistentDefault = config?.models?.defaultModel;
  if (persistentDefault && persistentDefault.trim().length > 0) {
    return createResolvedModel(persistentDefault, 'persistent-default');
  }

  // Layer 1: Session explicit override (explicit — economy does not apply)
  if (sessionExplicitModel && sessionExplicitModel.trim().length > 0) {
    return createResolvedModel(sessionExplicitModel, 'session-explicit');
  }

  // Layer 1b: User override (explicit — economy does not apply)
  if (userOverride && userOverride.trim().length > 0) {
    return createResolvedModel(userOverride, 'user-override');
  }

  // Layer 2: Charter Preference (economy does not apply)
  if (charterPreference && charterPreference.trim().length > 0 && charterPreference !== 'auto') {
    return createResolvedModel(charterPreference, 'charter');
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
  return createResolvedModel(defaultModel, 'default');
}

export function buildEffectiveCostPolicy(
  config: SquadLocalConfig,
  sessionPolicy?: SessionCostPolicyOverride,
): CostPolicyConfig | undefined {
  const persistentPolicy = config.models?.costPolicy;
  const maxCategory = sessionPolicy?.maxCategory ?? persistentPolicy?.maxCategory;
  const preferIncluded = sessionPolicy?.preferIncluded ?? persistentPolicy?.preferIncluded ?? false;

  if (maxCategory === undefined && sessionPolicy?.preferIncluded === undefined && persistentPolicy?.preferIncluded === undefined) {
    return undefined;
  }

  return { maxCategory, preferIncluded };
}

export function finalizeResolvedModel(
  base: ResolvedModel,
  policy: CostPolicyConfig | undefined,
  catalog: Map<string, ModelInfo>,
): ResolvedModel {
  if (!policy) {
    return base;
  }

  const selectedModel = catalog.get(base.model);
  if (!selectedModel) {
    return base;
  }

  const appliedPolicy: Required<CostPolicyConfig> = {
    maxCategory: policy.maxCategory ?? 'powerful',
    preferIncluded: policy.preferIncluded ?? false,
  };

  if (selectedModel.githubCategory === undefined) {
    return attachPolicy(base, {
      appliedPolicy,
      action: 'none',
      originalModel: base.model,
      finalModel: base.model,
    });
  }

  const explicitSource = isExplicitSource(base.source);
  const overCeiling = !isWithinCategory(selectedModel.githubCategory, appliedPolicy.maxCategory);

  if (overCeiling && explicitSource) {
    return attachPolicy(base, {
      appliedPolicy,
      action: 'warn-allow-explicit',
      originalModel: base.model,
      finalModel: base.model,
      warning: `⚠️ ${base.model} is above the current cost policy ceiling (${appliedPolicy.maxCategory}), but it was explicitly requested.`,
    });
  }

  if (overCeiling) {
    const replacement = findReplacementModel(base, appliedPolicy, catalog);
    if (!replacement) {
      return attachPolicy(base, {
        appliedPolicy,
        action: 'none',
        originalModel: base.model,
        finalModel: base.model,
      });
    }

    return {
      ...base,
      model: replacement.id,
      tier: replacement.tier,
      fallbackChain: buildPolicyFallbackChain(MODELS.FALLBACK_CHAINS[replacement.tier], appliedPolicy, catalog),
      policy: {
        appliedPolicy,
        action: 'downgraded-to-ceiling',
        originalModel: base.model,
        finalModel: replacement.id,
      },
    };
  }

  if (!explicitSource && appliedPolicy.preferIncluded) {
    const includedModel = findIncludedModelForTier(base.tier, appliedPolicy, catalog, base.model);
    if (includedModel && includedModel.id !== base.model) {
      return {
        ...base,
        model: includedModel.id,
        tier: includedModel.tier,
        fallbackChain: buildPolicyFallbackChain(MODELS.FALLBACK_CHAINS[includedModel.tier], appliedPolicy, catalog),
        policy: {
          appliedPolicy,
          action: 'preferred-included',
          originalModel: base.model,
          finalModel: includedModel.id,
        },
      };
    }
  }

  const prunedFallbackChain = buildPolicyFallbackChain(base.fallbackChain, appliedPolicy, catalog);
  if (!arraysEqual(base.fallbackChain, prunedFallbackChain)) {
    return {
      ...base,
      fallbackChain: prunedFallbackChain,
      policy: {
        appliedPolicy,
        action: 'fallback-chain-pruned',
        originalModel: base.model,
        finalModel: base.model,
      },
    };
  }

  return attachPolicy(base, {
    appliedPolicy,
    action: 'none',
    originalModel: base.model,
    finalModel: base.model,
  });
}

/**
 * Select model based on task type, with optional economy mode substitution.
 *
 * @param taskType - Type of task being performed
 * @param economyMode - When true, downgrade model to cheaper alternative
 * @returns Resolved model or undefined if no match
 */
function selectModelForTask(taskType: TaskType, economyMode?: boolean): BaseModelSelection | undefined {
  let model: string | undefined;
  let tier: ModelTier | undefined;

  switch (taskType) {
    case 'code':
      model = 'claude-sonnet-4.6';
      tier = 'standard';
      break;
    case 'prompt':
      model = 'claude-sonnet-4.6';
      tier = 'standard';
      break;
    case 'visual':
      model = 'claude-opus-4.6';
      tier = 'premium';
      break;
    case 'docs':
    case 'planning':
    case 'mechanical':
      model = 'claude-haiku-4.5';
      tier = 'fast';
      break;
    default:
      return undefined;
  }

  if (economyMode) {
    model = applyEconomyMode(model);
    tier = inferTierFromModel(model);
  }

  return createResolvedModel(model, 'task-auto', tier);
}

function createResolvedModel(
  model: string,
  source: ModelResolutionSource,
  tier: ModelTier = inferTierFromModel(model),
): BaseModelSelection {
  return {
    model,
    tier,
    source,
    fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
  };
}

function isExplicitSource(source: ModelResolutionSource): boolean {
  return source === 'persistent-agent-override'
    || source === 'persistent-default'
    || source === 'session-explicit'
    || source === 'user-override';
}

function isWithinCategory(category: GitHubModelCategory, maxCategory: GitHubModelCategory): boolean {
  return CATEGORY_ORDER[category] <= CATEGORY_ORDER[maxCategory];
}

function isPolicyCompliant(model: ModelInfo, policy: Required<CostPolicyConfig>): boolean {
  if (model.availability !== 'active') {
    return false;
  }

  if (model.githubCategory === undefined) {
    return true;
  }

  return isWithinCategory(model.githubCategory, policy.maxCategory);
}

function findReplacementModel(
  base: ResolvedModel,
  policy: Required<CostPolicyConfig>,
  catalog: Map<string, ModelInfo>,
): ModelInfo | undefined {
  const sameTierReplacement = selectCandidateFromTier(base.tier, policy, catalog, base.model, policy.preferIncluded);
  if (sameTierReplacement) {
    return sameTierReplacement;
  }

  for (const tier of CHEAPER_TIERS[base.tier]) {
    const cheaperTierReplacement = selectCandidateFromTier(tier, policy, catalog);
    if (cheaperTierReplacement) {
      return cheaperTierReplacement;
    }
  }

  return undefined;
}

function findIncludedModelForTier(
  tier: ModelTier,
  policy: Required<CostPolicyConfig>,
  catalog: Map<string, ModelInfo>,
  currentModel: string,
): ModelInfo | undefined {
  const candidates = getOrderedTierCandidates(tier, catalog, currentModel)
    .filter(model => model.includedInCopilot === true && isPolicyCompliant(model, policy));
  return candidates[0];
}

function selectCandidateFromTier(
  tier: ModelTier,
  policy: Required<CostPolicyConfig>,
  catalog: Map<string, ModelInfo>,
  currentModel?: string,
  preferIncluded: boolean = false,
): ModelInfo | undefined {
  const candidates = getOrderedTierCandidates(tier, catalog, currentModel)
    .filter(model => isPolicyCompliant(model, policy));

  if (!preferIncluded) {
    return candidates[0];
  }

  return candidates.find(model => model.includedInCopilot === true) ?? candidates[0];
}

function getOrderedTierCandidates(
  tier: ModelTier,
  catalog: Map<string, ModelInfo>,
  currentModel?: string,
): ModelInfo[] {
  const seen = new Set<string>();
  const orderedIds: string[] = [];

  const add = (modelId: string | undefined): void => {
    if (!modelId || seen.has(modelId)) {
      return;
    }

    const info = catalog.get(modelId);
    if (!info || info.tier !== tier) {
      return;
    }

    seen.add(modelId);
    orderedIds.push(modelId);
  };

  add(currentModel);
  for (const modelId of MODELS.FALLBACK_CHAINS[tier]) {
    add(modelId);
  }
  for (const model of MODEL_CATALOG) {
    if (model.tier === tier) {
      add(model.id);
    }
  }

  return orderedIds
    .map(modelId => catalog.get(modelId))
    .filter((model): model is ModelInfo => model !== undefined);
}

function buildPolicyFallbackChain(
  chain: readonly string[],
  policy: Required<CostPolicyConfig>,
  catalog: Map<string, ModelInfo>,
): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const modelId of chain) {
    if (seen.has(modelId)) {
      continue;
    }

    const info = catalog.get(modelId);
    if (info && !isPolicyCompliant(info, policy)) {
      continue;
    }

    seen.add(modelId);
    filtered.push(modelId);
  }

  return filtered;
}

function attachPolicy(base: ResolvedModel, outcome: CostPolicyOutcome): ResolvedModel {
  return {
    ...base,
    policy: outcome,
  };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
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
