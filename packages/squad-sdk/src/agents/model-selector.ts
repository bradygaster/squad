/**
 * Per-Agent Model Selection (M1-9) + Model Fallback (M3-5, Issue #145)
 */

import { MODELS } from '../runtime/constants.js';
import {
  applyEconomyMode,
  DEFAULT_MODEL_SELECTION_PROFILE,
  HYDRAFUSION_MODEL_ID,
  isModelSelectionProfile,
  isPreviewModel,
  MODEL_CATALOG,
  type ModelSelectionProfile,
  CATEGORY_ORDER,
  type GitHubModelCategory,
  type CostPolicyConfig,
  type SessionCostPolicyOverride,
  type CostPolicyOutcome,
} from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';

export {
  DEFAULT_MODEL_SELECTION_PROFILE,
  MODEL_SELECTION_PROFILES,
  isModelSelectionProfile,
  type ModelSelectionProfile,
} from '../config/models.js';

/**
 * Task types that influence model selection. Quality-sensitive non-code work
 * (architecture, research, verification, review, security, design) is
 * distinguished from language work (docs, writing, planning) and mechanical
 * work (Scribe, git, release bookkeeping).
 */
export type TaskType =
  | 'code'
  | 'prompt'
  | 'docs'
  | 'visual'
  | 'planning'
  | 'mechanical'
  | 'architecture'
  | 'research'
  | 'verification'
  | 'review'
  | 'security'
  | 'design'
  | 'writing';

/**
 * Model tier classification.
 */
export type ModelTier = 'premium' | 'standard' | 'fast';

/**
 * Source of the model resolution, in precedence order:
 * - `user-override`: explicit per-spawn directive ("use X for this task")
 * - `config`: persistent `.squad/config.json` override (per-agent or `defaultModel`)
 * - `session`: model picked for the session; inherited by every sub-agent spawn
 * - `charter`: the agent charter's `## Model` → `**Preferred:**` value (not `auto`)
 * - `task-auto`: task-aware auto-selection
 * - `default`: nothing else matched
 * - `fallback`: chosen from the fallback chain after the preferred model was unavailable
 */
export type ModelResolutionSource =
  | 'user-override'
  | 'config'
  | 'session'
  | 'charter'
  | 'task-auto'
  | 'default'
  | 'fallback';

/**
 * Resolution precedence (first match wins). Fallback is not a layer: it only
 * applies after the selected model is known to be unavailable.
 */
export const MODEL_RESOLUTION_PRECEDENCE: readonly ModelResolutionSource[] = [
  'user-override',
  'config',
  'session',
  'charter',
  'task-auto',
  'default',
] as const;

/**
 * Options for model resolution.
 */
export interface ModelResolutionOptions {
  /** Explicit per-spawn model directive (highest precedence) */
  userOverride?: string;
  /**
   * Persistent `.squad/config.json` model for this agent: the caller passes
   * `agentModelOverrides[agent]` when present, otherwise `defaultModel`.
   */
  configModel?: string;
  /**
   * Model picked for the current session (by the user or the session itself).
   * Passed unchanged to every sub-agent spawn so it is inherited with source
   * `session`. Any model id passes through, including opt-in or preview ids.
   */
  sessionModel?: string;
  /** Model preference from agent's charter (## Model section) */
  charterPreference?: string;
  /** Type of task being performed. When omitted, task-aware selection is skipped. */
  taskType?: TaskType;
  /**
   * Caller-chosen task-aware model. When set (and not `auto`) it replaces the
   * tier pick of the `task-auto` layer; economy mode still applies to it.
   */
  taskModel?: string;
  /** Agent role (for context) */
  agentRole?: string;
  /**
   * Legacy economy switch. `true` selects the `economy` profile unless a
   * session profile is set.
   */
  economyMode?: boolean;
  /**
   * Persistent quality profile (`.squad/config.json` `modelProfile`). Defaults
   * to `quality-first`. Only automatic layers (task-auto, default) use it.
   */
  profile?: ModelSelectionProfile;
  /** Quality profile chosen for the current session; wins over `profile` and `economyMode`. */
  sessionProfile?: ModelSelectionProfile;
  /**
   * Persistent config carrying an optional cost policy (cost-ceiling axis).
   * When present with a `maxCategory`, resolution is finalized against it.
   */
  config?: { costPolicy?: CostPolicyConfig };
  /** Per-session cost policy override (wins over `config.costPolicy`). */
  sessionCostPolicy?: SessionCostPolicyOverride;
  /**
   * Model ids known to be unavailable (plan restriction, org policy, rate
   * limit, deprecation). When the resolved model is listed, the next available
   * fallback-chain entry after it is chosen with source `fallback`; a model
   * that is not in its chain searches the chain from the head. Under an
   * active cost ceiling, catalog-known candidates above it are skipped. When
   * no candidate remains, `omitModel` is set.
   */
  unavailableModels?: Iterable<string>;
  /**
   * Live model list supplied by the runtime (for example the session's model
   * enum). When present it is authoritative for availability: any id not in
   * it is treated as unavailable, for every source, and handled like
   * {@link unavailableModels}. Omit when no live list is known.
   */
  availableModels?: Iterable<string>;
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
  /**
   * Human-readable explanation of why this model was chosen. Always set on
   * {@link resolveModel} output (see {@link ModelResolution}); optional here so
   * consumer-constructed values stay valid.
   */
  rationale?: string;
  /** Quality profile in effect for this resolution (set by {@link resolveModel}). */
  profile?: ModelSelectionProfile;
  /** Model and source that were preferred before an availability fallback. */
  fallbackFrom?: { model: string; source: ModelResolutionSource };
  /**
   * True when every fallback candidate was unavailable: omit the `model`
   * parameter so the platform picks its default. `model` is then empty.
   */
  omitModel?: boolean;
}

/** Output of {@link resolveModel}: a {@link ResolvedModel} with guaranteed provenance. */
export type ModelResolution = ResolvedModel & { rationale: string };

/**
 * Effective (merged) cost policy after combining persistent config + session
 * override. Only produced when a `maxCategory` is actually set.
 */
export interface EffectiveCostPolicy {
  maxCategory: GitHubModelCategory;
}

/**
 * Central model resolver. Applies {@link MODEL_RESOLUTION_PRECEDENCE}, then
 * finalizes against the effective cost policy (cost-ceiling axis), then walks
 * the fallback chain if the chosen model is known to be unavailable.
 *
 * @param options - Model resolution options
 * @returns Resolved model with tier, source, rationale, fallback chain, and optional policy outcome
 */
export function resolveModel(options: ModelResolutionOptions): ModelResolution {
  const profile = resolveModelProfile(options);
  const base = resolveBaseModel(options, profile);
  const policy = buildEffectiveCostPolicy(options.config, options.sessionCostPolicy);
  const catalogMap = policy ? buildCatalogCategoryMap() : undefined;
  const finalized = policy && catalogMap ? finalizeResolvedModel(base, policy, catalogMap) : base;
  const ceiling = policy && catalogMap ? { maxCategory: policy.maxCategory, catalogMap } : undefined;
  const isUnavailable = buildAvailabilityCheck(options.unavailableModels, options.availableModels);
  const resolved = normalizeFallbackChain(applyAvailabilityFallback(finalized, isUnavailable, ceiling), isUnavailable);
  return { ...resolved, profile, rationale: resolved.rationale ?? resolved.source };
}

/**
 * Make the returned chain safe to retry in order: drop entries known to be
 * unavailable and, when the selected model is in its chain, start the chain
 * at that model so retries never move back toward the head. A model outside
 * its chain keeps head-first fallback.
 */
function normalizeFallbackChain(resolved: ResolvedModel, isUnavailable?: (id: string) => boolean): ResolvedModel {
  if (resolved.omitModel) return resolved;
  const key = resolved.model.toLowerCase();
  const position = resolved.fallbackChain.findIndex((id) => id.toLowerCase() === key);
  const forward = position > 0 ? resolved.fallbackChain.slice(position) : resolved.fallbackChain;
  const fallbackChain = isUnavailable ? forward.filter((id) => !isUnavailable(id)) : forward;
  if (position <= 0 && fallbackChain.length === resolved.fallbackChain.length) return resolved;
  return { ...resolved, fallbackChain };
}

/**
 * Effective quality profile: session profile, then legacy `economyMode: true`,
 * then the persistent profile, then `quality-first`. Unknown values are ignored.
 */
export function resolveModelProfile(
  options: Pick<ModelResolutionOptions, 'profile' | 'sessionProfile' | 'economyMode'>,
): ModelSelectionProfile {
  if (isModelSelectionProfile(options.sessionProfile)) return options.sessionProfile;
  if (options.economyMode === true) return 'economy';
  if (isModelSelectionProfile(options.profile)) return options.profile;
  return DEFAULT_MODEL_SELECTION_PROFILE;
}

function buildAvailabilityCheck(
  unavailableModels?: Iterable<string>,
  availableModels?: Iterable<string>,
): ((id: string) => boolean) | undefined {
  if (!unavailableModels && !availableModels) return undefined;
  const unavailable = new Set(Array.from(unavailableModels ?? [], (id) => id.toLowerCase()));
  const available = availableModels ? new Set(Array.from(availableModels, (id) => id.toLowerCase())) : undefined;
  return (id: string) => {
    const key = id.toLowerCase();
    return unavailable.has(key) || (available !== undefined && !available.has(key));
  };
}

/**
 * Documented provenance-returning entry point for agent model resolution.
 * Alias of {@link resolveModel} in `@bradygaster/squad-sdk/agents`; distinct
 * from the root `resolveModel` export, which is a legacy adapter returning
 * only the model id.
 */
export const resolveAgentModel: (options: ModelResolutionOptions) => ModelResolution = resolveModel;

/**
 * True when a layer value expresses a model preference. Empty values and the
 * `auto` sentinel (any case, surrounding whitespace ignored) mean "no
 * preference here; continue to the next layer".
 */
export function isModelPreference(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'auto';
}

/** Persistent `.squad/config.json` model fields consulted by {@link persistentConfigModel}. */
export interface PersistentModelConfig {
  defaultModel?: unknown;
  agentModelOverrides?: unknown;
}

/**
 * Pick the persistent `config` layer model for an agent: its
 * `agentModelOverrides` entry, otherwise `defaultModel`. `auto` at either
 * field means no preference there.
 */
export function persistentConfigModel(
  config: PersistentModelConfig | null | undefined,
  agentName?: string,
): string | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const overrides = config.agentModelOverrides;
  if (agentName && overrides && typeof overrides === 'object') {
    const agentModel = (overrides as Record<string, unknown>)[agentName];
    if (typeof agentModel === 'string' && isModelPreference(agentModel)) return agentModel.trim();
  }
  const defaultModel = config.defaultModel;
  if (typeof defaultModel === 'string' && isModelPreference(defaultModel)) return defaultModel.trim();
  return undefined;
}

function explicitModel(model: string, source: ModelResolutionSource, rationale: string): ResolvedModel {
  const tier = inferTierFromModel(model);
  return {
    model,
    tier,
    source,
    fallbackChain: [...MODELS.FALLBACK_CHAINS[tier]],
    rationale,
  };
}

/**
 * Layered base resolution. Explicit layers (user-override, config, session,
 * charter) are never altered by the quality profile or economy mode.
 */
function resolveBaseModel(options: ModelResolutionOptions, profile: ModelSelectionProfile): ResolvedModel {
  const { taskType, taskModel } = options;
  const economyMode = profile === 'economy';
  const userOverride = options.userOverride?.trim();
  const configModel = options.configModel?.trim();
  const sessionModel = options.sessionModel?.trim();
  const charterPreference = options.charterPreference?.trim();

  if (isModelPreference(userOverride)) {
    return explicitModel(userOverride, 'user-override', `explicit per-spawn directive selected '${userOverride}'`);
  }

  if (isModelPreference(configModel)) {
    return explicitModel(configModel, 'config', `persistent .squad/config.json override selected '${configModel}'`);
  }

  if (isModelPreference(sessionModel)) {
    return explicitModel(sessionModel, 'session', `session model '${sessionModel}' inherited by this spawn`);
  }

  if (isModelPreference(charterPreference)) {
    return explicitModel(charterPreference, 'charter', `charter preference selected '${charterPreference}'`);
  }

  // Layer 3: Task-Aware Auto-Selection (profile applies)
  const autoSelected = isModelPreference(taskModel)
    ? selectTaskModel(taskModel.trim(), economyMode)
    : taskType
      ? selectModelForTask(taskType, profile)
      : undefined;
  if (autoSelected) {
    return autoSelected;
  }

  // Layer 4: Default (profile applies). Economy keeps the cost-first default;
  // quality-first and balanced use the standard chain head.
  const defaultModel = economyMode
    ? applyEconomyMode(MODELS.SELECTOR_DEFAULT)
    : MODELS.FALLBACK_CHAINS.standard[0];
  const defaultTier = inferTierFromModel(defaultModel);
  return {
    model: defaultModel,
    tier: defaultTier,
    source: 'default',
    fallbackChain: getFallbackChain(defaultTier, economyMode),
    rationale: `${profile}: no override, session, charter, or task match; default '${defaultModel}'` +
      (economyMode ? ' (economy profile)' : ''),
  };
}

/**
 * Replace an unavailable model with the next available fallback-chain entry.
 * A model found in its chain searches only the entries after it (never back
 * toward the head); a model not in its chain searches the chain from the
 * head. Under an active cost ceiling, catalog-known candidates above the
 * ceiling are skipped: an automatic fallback is never an explicit opt-in.
 * When no candidate remains, signal that the `model` parameter should be
 * omitted so the platform default applies.
 */
function applyAvailabilityFallback(
  resolved: ResolvedModel,
  isUnavailable?: (id: string) => boolean,
  ceiling?: { maxCategory: GitHubModelCategory; catalogMap: Map<string, GitHubModelCategory> },
): ResolvedModel {
  if (!isUnavailable || !isUnavailable(resolved.model)) return resolved;

  const fallbackFrom = { model: resolved.model, source: resolved.source };
  const position = resolved.fallbackChain.findIndex((id) => id.toLowerCase() === resolved.model.toLowerCase());
  const start = position + 1; // 0 when the model is not in its chain
  const withinCeiling = (id: string): boolean => {
    if (!ceiling) return true;
    const cat = ceiling.catalogMap.get(id.toLowerCase());
    return cat === undefined || CATEGORY_ORDER[cat] <= CATEGORY_ORDER[ceiling.maxCategory];
  };
  const index = resolved.fallbackChain.findIndex(
    (id, i) => i >= start && !isUnavailable(id) && withinCeiling(id),
  );
  const next = index >= 0 ? resolved.fallbackChain[index] : undefined;
  const ceilingNote = ceiling ? ` within cost ceiling '${ceiling.maxCategory}'` : '';
  if (next) {
    return {
      ...resolved,
      model: next,
      tier: inferTierFromModel(next),
      source: 'fallback',
      fallbackChain: resolved.fallbackChain.slice(index).filter(withinCeiling),
      fallbackFrom,
      rationale: `'${resolved.model}' (${resolved.source}) unavailable; fell back to '${next}'${ceilingNote}`,
    };
  }
  return {
    ...resolved,
    model: '',
    source: 'fallback',
    fallbackChain: [],
    fallbackFrom,
    omitModel: true,
    rationale: `'${resolved.model}' (${resolved.source}) unavailable and no later fallback-chain candidate is available${ceilingNote}; omit the model parameter for the platform default`,
  };
}

/**
 * Select model based on task type and quality profile. The economy profile
 * also applies economy substitution.
 *
 * @param taskType - Type of task being performed
 * @param profile - Effective quality profile
 * @returns Resolved model or undefined if no match
 */
function selectModelForTask(taskType: TaskType, profile: ModelSelectionProfile): ResolvedModel | undefined {
  const taskTier = PROFILE_TASK_TIERS[profile][taskType];
  if (!taskTier) return undefined;

  if (profile === 'hydrafusion' && HYDRAFUSION_PROFILE_TASKS.has(taskType)) {
    return {
      model: HYDRAFUSION_MODEL_ID,
      tier: 'premium',
      source: 'task-auto',
      fallbackChain: [HYDRAFUSION_MODEL_ID, ...MODELS.FALLBACK_CHAINS.premium],
      rationale: `hydrafusion: ${taskType} task → opt-in '${HYDRAFUSION_MODEL_ID}', then the quality-first premium chain`,
    };
  }
  const economyMode = profile === 'economy';

  // Task-aware picks are the head of the tier's fallback chain, so the
  // catalog in runtime constants stays the single source of model ids.
  let model: string = MODELS.FALLBACK_CHAINS[taskTier][0];
  let tier: ModelTier = taskTier;

  if (economyMode) {
    model = applyEconomyMode(model);
    tier = inferTierFromModel(model);
  }

  return {
    model,
    tier,
    source: 'task-auto',
    fallbackChain: getFallbackChain(tier, economyMode === true),
    rationale: `${profile}: ${taskType} task → ${taskTier} tier '${model}'` + (economyMode ? ' (economy profile)' : ''),
  };
}

/** Caller-supplied task model (legacy `taskModel`), with optional economy substitution. */
function selectTaskModel(taskModel: string, economyMode?: boolean): ResolvedModel {
  const model = economyMode ? applyEconomyMode(taskModel) : taskModel;
  const tier = inferTierFromModel(model);
  return {
    model,
    tier,
    source: 'task-auto',
    fallbackChain: getFallbackChain(tier, economyMode === true),
    rationale: `task-aware model '${model}'` + (economyMode ? ' (economy profile)' : ''),
  };
}

function getFallbackChain(tier: ModelTier, includeCheaperTiers: boolean): string[] {
  const chain = [...MODELS.FALLBACK_CHAINS[tier]];
  if (!includeCheaperTiers) return chain;

  for (const cheaperTier of Object.keys(TIER_ORDER) as ModelTier[]) {
    if (TIER_ORDER[cheaperTier] > TIER_ORDER[tier]) {
      chain.push(...MODELS.FALLBACK_CHAINS[cheaperTier]);
    }
  }
  return chain;
}

/** quality-first task → tier table, shared by the opt-in `hydrafusion` profile. */
const QUALITY_FIRST_TASK_TIERS: Readonly<Record<TaskType, ModelTier>> = {
  architecture: 'premium',
  research: 'premium',
  verification: 'premium',
  review: 'premium',
  security: 'premium',
  design: 'premium',
  visual: 'premium',
  code: 'standard',
  prompt: 'standard',
  docs: 'standard',
  writing: 'standard',
  planning: 'standard',
  mechanical: 'fast',
};

/**
 * Quality-sensitive task types that the opt-in `hydrafusion` profile sends to
 * {@link HYDRAFUSION_MODEL_ID} first (#2014). Other tasks, including Scribe and
 * other mechanical work, follow `quality-first` unchanged.
 */
const HYDRAFUSION_PROFILE_TASKS: ReadonlySet<TaskType> = new Set<TaskType>([
  'architecture',
  'research',
  'verification',
  'review',
  'security',
  'design',
]);

/**
 * Task → tier per quality profile (#1598). quality-first sends
 * quality-sensitive non-code work to premium even when no code is written;
 * economy keeps the historical cost-first table and then substitutes via
 * {@link applyEconomyMode}. The opt-in `hydrafusion` profile uses the
 * quality-first tiers; {@link selectModelForTask} puts `hydrafusion` first for
 * quality-sensitive tasks.
 */
export const PROFILE_TASK_TIERS: Readonly<Record<ModelSelectionProfile, Readonly<Record<TaskType, ModelTier>>>> = {
  'quality-first': QUALITY_FIRST_TASK_TIERS,
  hydrafusion: QUALITY_FIRST_TASK_TIERS,
  balanced: {
    architecture: 'premium',
    verification: 'premium',
    review: 'premium',
    security: 'premium',
    design: 'premium',
    visual: 'premium',
    research: 'standard',
    code: 'standard',
    prompt: 'standard',
    docs: 'standard',
    writing: 'standard',
    planning: 'fast',
    mechanical: 'fast',
  },
  economy: {
    architecture: 'premium',
    verification: 'premium',
    review: 'premium',
    security: 'premium',
    design: 'premium',
    visual: 'premium',
    code: 'standard',
    prompt: 'standard',
    research: 'fast',
    docs: 'fast',
    writing: 'fast',
    planning: 'fast',
    mechanical: 'fast',
  },
};

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
  // Preview entries are opt-in only and never an implicit replacement (#2014).
  for (const info of MODEL_CATALOG) if (!isPreviewModel(info.id)) add(info.id);

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
 * - over ceiling + EXPLICIT source (user-override/config/session/charter) ⇒ warn-and-allow;
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

  const isExplicit =
    base.source === 'user-override' ||
    base.source === 'config' ||
    base.source === 'session' ||
    base.source === 'charter';

  if (isExplicit) {
    // AC6: honor the explicit over-ceiling selection, but warn loudly. Keep
    // only chain entries after the model's own position so availability
    // fallback stays forward-only (never back toward the chain head).
    const position = base.fallbackChain.findIndex((id) => id.toLowerCase() === base.model.toLowerCase());
    const prunedRest = pruneChainToCeiling(base.fallbackChain.slice(position + 1), maxCategory, catalogMap).filter(
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
      rationale: `${base.rationale ?? base.source}; downgraded to '${replacement}' to meet cost ceiling '${maxCategory}'`,
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
  /** Model that succeeded; empty when the platform default was used. */
  model: string;
  tier: ModelTier;
  attempts: FallbackAttempt[];
  didFallback: boolean;
  /** True when the request ran without a `model` parameter (platform default). */
  omitModel?: boolean;
}

export interface FallbackExecutorConfig {
  allowCrossTier?: boolean;
  eventBus?: EventBus;
}

/** Per-call options for {@link ModelFallbackExecutor.execute}. */
export interface FallbackExecuteOptions<T> {
  /**
   * Runs the request without a `model` parameter so the platform picks its
   * default. Called instead of the model callback when the resolution has
   * `omitModel` (every fallback candidate was unavailable).
   */
  platformDefault?: () => Promise<T>;
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
    options: FallbackExecuteOptions<T> = {},
  ): Promise<FallbackResult<T>> {
    const attempts: FallbackAttempt[] = [];
    const originalTier = resolved.tier;
    const economyAutoResolution =
      resolved.profile === 'economy' &&
      isAutomaticModelResolution(resolved);
    if (resolved.omitModel) {
      // Never send an empty model id: run model-less, or fail before calling fn.
      if (!options.platformDefault) {
        throw new Error(
          `No available model for agent '${agentName}' (resolution has omitModel); ` +
          `pass a platformDefault callback to run without a model parameter.`,
        );
      }
      const value = await options.platformDefault();
      return { value, model: '', tier: originalTier, attempts, didFallback: false, omitModel: true };
    }
    const candidates = this.buildCandidateList(resolved);

    for (const candidate of candidates) {
      const candidateTier = inferTierFromModel(candidate);
      const allowedByEconomyProfile =
        economyAutoResolution &&
        TIER_ORDER[candidateTier] >= TIER_ORDER[originalTier];
      const tierAllowed = economyAutoResolution
        ? allowedByEconomyProfile
        : isTierFallbackAllowed(originalTier, candidateTier, this.allowCrossTier);
      if (!tierAllowed) {
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
    if (resolved.model) add(resolved.model);
    for (const fb of resolved.fallbackChain) if (fb) add(fb);
    return result;
  }

  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.emit({ type: type as any, payload, timestamp: new Date() });
  }
}

function isAutomaticModelResolution(resolved: ResolvedModel): boolean {
  const source = resolved.source === 'fallback' ? resolved.fallbackFrom?.source : resolved.source;
  return source === 'task-auto' || source === 'default';
}
