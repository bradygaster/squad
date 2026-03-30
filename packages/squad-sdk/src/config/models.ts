/**
 * Model Configuration & Registry
 * 
 * Defines the full model catalog and provides model lookup, fallback chains,
 * and availability checking. Implements the model tier system from squad.agent.md.
 * 
 * @module config/models
 */

import { join } from 'path';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import type { ModelId, ModelTier } from '../runtime/config.js';

/**
 * Per-token pricing in USD.
 */
export interface ModelPricing {
  /** Cost per input token in USD */
  inputPerToken: number;
  /** Cost per output token in USD */
  outputPerToken: number;
}

/**
 * Model capability information.
 */
export interface ModelInfo {
  /** Model identifier */
  id: ModelId;
  
  /** Model tier */
  tier: ModelTier;
  
  /** Provider (anthropic, openai, google) */
  provider: 'anthropic' | 'openai' | 'google';
  
  /** Model family */
  family: 'claude' | 'gpt' | 'gemini';
  
  /** Supports vision/multimodal input */
  vision?: boolean;
  
  /** Typical use cases */
  useCases?: string[];
  
  /** Relative cost (1-10 scale, 10 = most expensive) */
  cost?: number;
  
  /** Relative speed (1-10 scale, 10 = fastest) */
  speed?: number;

  /** Per-token pricing in USD (if known) */
  pricing?: ModelPricing;
}

/**
 * Full model catalog from squad.agent.md.
 */
export const MODEL_CATALOG: ModelInfo[] = [
  // Premium tier - highest quality, slowest, most expensive
  {
    id: 'claude-opus-4.6',
    tier: 'premium',
    provider: 'anthropic',
    family: 'claude',
    vision: true,
    useCases: ['architecture proposals', 'security audits', 'complex design'],
    cost: 10,
    speed: 3,
    pricing: { inputPerToken: 0.000015, outputPerToken: 0.000075 },
  },
  {
    id: 'claude-opus-4.6-fast',
    tier: 'premium',
    provider: 'anthropic',
    family: 'claude',
    vision: true,
    useCases: ['architecture proposals', 'urgent reviews'],
    cost: 9,
    speed: 6,
    pricing: { inputPerToken: 0.000015, outputPerToken: 0.000075 },
  },
  {
    id: 'claude-opus-4.5',
    tier: 'premium',
    provider: 'anthropic',
    family: 'claude',
    vision: true,
    useCases: ['architecture proposals', 'reviewer gates'],
    cost: 9,
    speed: 3,
    pricing: { inputPerToken: 0.000015, outputPerToken: 0.000075 },
  },
  
  // Standard tier - balanced quality, speed, cost
  {
    id: 'claude-sonnet-4.6',
    tier: 'standard',
    provider: 'anthropic',
    family: 'claude',
    vision: true,
    useCases: ['code generation', 'test writing', 'refactoring', 'prompt engineering'],
    cost: 5,
    speed: 7,
    pricing: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
  },
  {
    id: 'claude-sonnet-4.5',
    tier: 'standard',
    provider: 'anthropic',
    family: 'claude',
    vision: true,
    useCases: ['code generation', 'test writing', 'refactoring'],
    cost: 5,
    speed: 7,
    pricing: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
  },
  {
    id: 'claude-sonnet-4',
    tier: 'standard',
    provider: 'anthropic',
    family: 'claude',
    useCases: ['code generation', 'documentation'],
    cost: 4,
    speed: 7,
    pricing: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
  },
  {
    id: 'gpt-5.4',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['general purpose', 'code generation', 'analysis'],
    cost: 6,
    speed: 7,
    pricing: { inputPerToken: 0.000005, outputPerToken: 0.000015 },
  },
  {
    id: 'gpt-5.3-codex',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['heavy code generation', 'multi-file refactors'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5.2-codex',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['heavy code generation', 'multi-file refactors'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5.2',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['general coding', 'analysis'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5.1-codex-max',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['complex implementation', 'large codebases'],
    cost: 6,
    speed: 5,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5.1-codex',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['code generation', 'implementation'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5.1',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['general purpose', 'analysis'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gpt-5',
    tier: 'standard',
    provider: 'openai',
    family: 'gpt',
    useCases: ['general purpose'],
    cost: 5,
    speed: 6,
    pricing: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  },
  {
    id: 'gemini-3-pro-preview',
    tier: 'standard',
    provider: 'google',
    family: 'gemini',
    useCases: ['code reviews', 'second opinion', 'diversity'],
    cost: 5,
    speed: 7,
    pricing: { inputPerToken: 0.00000125, outputPerToken: 0.00001 },
  },
  
  // Fast tier - lowest cost, fastest, good enough quality
  {
    id: 'claude-haiku-4.5',
    tier: 'fast',
    provider: 'anthropic',
    family: 'claude',
    useCases: ['boilerplate', 'changelogs', 'simple fixes'],
    cost: 2,
    speed: 9,
    pricing: { inputPerToken: 0.0000008, outputPerToken: 0.000004 },
  },
  {
    id: 'gpt-5.1-codex-mini',
    tier: 'fast',
    provider: 'openai',
    family: 'gpt',
    useCases: ['scaffolding', 'test boilerplate'],
    cost: 2,
    speed: 9,
    pricing: { inputPerToken: 0.0000003, outputPerToken: 0.0000012 },
  },
  {
    id: 'gpt-5-mini',
    tier: 'fast',
    provider: 'openai',
    family: 'gpt',
    useCases: ['typo fixes', 'renames', 'simple tasks'],
    cost: 1,
    speed: 10,
    pricing: { inputPerToken: 0.00000015, outputPerToken: 0.0000006 },
  },
  {
    id: 'gpt-4.1',
    tier: 'fast',
    provider: 'openai',
    family: 'gpt',
    useCases: ['lightweight tasks', 'triage'],
    cost: 2,
    speed: 9,
    pricing: { inputPerToken: 0.0000002, outputPerToken: 0.0000008 },
  }
];

/**
 * Default fallback chains per tier from squad.agent.md.
 */
export const DEFAULT_FALLBACK_CHAINS: Record<ModelTier, ModelId[]> = {
  premium: ['claude-opus-4.6', 'claude-opus-4.6-fast', 'claude-opus-4.5', 'claude-sonnet-4.6'],
  standard: ['claude-sonnet-4.6', 'gpt-5.4', 'claude-sonnet-4.5', 'gpt-5.3-codex', 'claude-sonnet-4', 'gpt-5.2'],
  fast: ['claude-haiku-4.5', 'gpt-5.1-codex-mini', 'gpt-4.1', 'gpt-5-mini']
};

/**
 * Model registry for lookups and availability checking.
 */
export class ModelRegistry {
  private catalog: Map<ModelId, ModelInfo>;
  private tierIndex: Map<ModelTier, ModelInfo[]>;
  private providerIndex: Map<string, ModelInfo[]>;
  
  constructor(catalog: ModelInfo[] = MODEL_CATALOG) {
    this.catalog = new Map(catalog.map(model => [model.id, model]));
    
    // Build tier index
    this.tierIndex = new Map();
    for (const tier of ['premium', 'standard', 'fast'] as ModelTier[]) {
      this.tierIndex.set(
        tier,
        catalog.filter(m => m.tier === tier)
      );
    }
    
    // Build provider index
    this.providerIndex = new Map();
    for (const model of catalog) {
      const existing = this.providerIndex.get(model.provider) || [];
      existing.push(model);
      this.providerIndex.set(model.provider, existing);
    }
  }
  
  /**
   * Gets model information by ID.
   * 
   * @param id - Model identifier
   * @returns Model info if found, null otherwise
   */
  getModelInfo(id: ModelId): ModelInfo | null {
    return this.catalog.get(id) || null;
  }
  
  /**
   * Checks if a model is available in the catalog.
   * 
   * @param id - Model identifier
   * @returns True if model exists in catalog
   */
  isModelAvailable(id: ModelId): boolean {
    return this.catalog.has(id);
  }
  
  /**
   * Gets all models for a specific tier.
   * 
   * @param tier - Model tier
   * @returns Array of models in that tier
   */
  getModelsByTier(tier: ModelTier): ModelInfo[] {
    return this.tierIndex.get(tier) || [];
  }
  
  /**
   * Gets all models from a specific provider.
   * 
   * @param provider - Provider name
   * @returns Array of models from that provider
   */
  getModelsByProvider(provider: string): ModelInfo[] {
    return this.providerIndex.get(provider) || [];
  }
  
  /**
   * Gets the fallback chain for a specific tier.
   * 
   * @param tier - Model tier
   * @param preferSameProvider - If true, prefer models from same provider
   * @param currentModel - Current model (for provider preference)
   * @returns Ordered array of fallback model IDs
   */
  getFallbackChain(
    tier: ModelTier,
    preferSameProvider: boolean = true,
    currentModel?: ModelId
  ): ModelId[] {
    const defaultChain = DEFAULT_FALLBACK_CHAINS[tier] || [];
    
    if (!preferSameProvider || !currentModel) {
      return defaultChain;
    }
    
    // Get current model's provider
    const current = this.getModelInfo(currentModel);
    if (!current) {
      return defaultChain;
    }
    
    // Reorder chain to prefer same provider
    const sameProvider = defaultChain.filter(id => {
      const model = this.getModelInfo(id);
      return model?.provider === current.provider;
    });
    
    const otherProvider = defaultChain.filter(id => {
      const model = this.getModelInfo(id);
      return model?.provider !== current.provider;
    });
    
    return [...sameProvider, ...otherProvider];
  }
  
  /**
   * Gets the next fallback model in the chain.
   * 
   * @param currentModel - Current model that failed
   * @param tier - Model tier
   * @param attemptedModels - Models already attempted
   * @returns Next fallback model ID, or null if chain exhausted
   */
  getNextFallback(
    currentModel: ModelId,
    tier: ModelTier,
    attemptedModels: Set<ModelId> = new Set()
  ): ModelId | null {
    const chain = this.getFallbackChain(tier, true, currentModel);
    
    // Find next model in chain that hasn't been attempted
    for (const modelId of chain) {
      if (modelId !== currentModel && !attemptedModels.has(modelId)) {
        return modelId;
      }
    }
    
    return null;
  }
  
  /**
   * Gets model recommendations based on use case.
   * 
   * @param useCase - Desired use case
   * @param tier - Optional tier constraint
   * @returns Recommended models sorted by relevance
   */
  getRecommendedModels(useCase: string, tier?: ModelTier): ModelInfo[] {
    const useCaseLower = useCase.toLowerCase();
    const candidates = tier
      ? this.getModelsByTier(tier)
      : Array.from(this.catalog.values());
    
    // Score models by use case match
    const scored = candidates
      .map(model => ({
        model,
        score: model.useCases?.some(uc => 
          uc.toLowerCase().includes(useCaseLower) ||
          useCaseLower.includes(uc.toLowerCase())
        ) ? 10 : 0
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    
    return scored.map(item => item.model);
  }
  
  /**
   * Gets all model IDs in the catalog.
   * 
   * @returns Array of all model IDs
   */
  getAllModelIds(): ModelId[] {
    return Array.from(this.catalog.keys());
  }
  
  /**
   * Gets catalog statistics.
   * 
   * @returns Catalog stats
   */
  getStats(): {
    total: number;
    byTier: Record<ModelTier, number>;
    byProvider: Record<string, number>;
  } {
    const byTier: Record<ModelTier, number> = {
      premium: 0,
      standard: 0,
      fast: 0
    };
    
    const byProvider: Record<string, number> = {};
    
    for (const model of this.catalog.values()) {
      byTier[model.tier]++;
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;
    }
    
    return {
      total: this.catalog.size,
      byTier,
      byProvider
    };
  }
}

/**
 * Default model registry instance.
 */
export const defaultRegistry = new ModelRegistry();

/**
 * Gets model information by ID (convenience function).
 */
export function getModelInfo(id: ModelId): ModelInfo | null {
  return defaultRegistry.getModelInfo(id);
}

/**
 * Gets fallback chain for a tier (convenience function).
 */
export function getFallbackChain(tier: ModelTier): ModelId[] {
  return defaultRegistry.getFallbackChain(tier);
}

/**
 * Checks if model is available (convenience function).
 */
export function isModelAvailable(id: ModelId): boolean {
  return defaultRegistry.isModelAvailable(id);
}

/**
 * Estimate the cost of a model invocation based on token counts and
 * the SDK's built-in pricing table.
 *
 * @returns Estimated cost in USD, or 0 if pricing is unavailable for the model.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const info = defaultRegistry.getModelInfo(model as ModelId);
  if (!info?.pricing) return 0;
  return (inputTokens * info.pricing.inputPerToken) + (outputTokens * info.pricing.outputPerToken);
}

// ============================================================================
// Persistent Model Preference (Layer 0)
// ============================================================================

/**
 * Economy mode model map: normal model → cheaper alternative.
 *
 * Applied at Layer 3 (task-aware auto) and Layer 4 (default) when
 * economy mode is active. Layers 0–2 (explicit preferences) are
 * never substituted — the user's explicit choice always wins.
 *
 * Table source: issue #500
 */
export const ECONOMY_MODEL_MAP: Record<string, string> = {
  // Premium → standard downgrade (architecture/review tasks)
  'claude-opus-4.6':      'claude-sonnet-4.5',
  'claude-opus-4.6-fast': 'claude-sonnet-4.5',
  'claude-opus-4.5':      'claude-sonnet-4.5',
  // Standard → fast downgrade (code writing, docs, planning, triage)
  'claude-sonnet-4.6':    'gpt-4.1',
  'claude-sonnet-4.5':    'gpt-4.1',
  // Fast → cheapest fast (scribe/mechanical, docs)
  'claude-haiku-4.5':     'gpt-4.1',
};

/**
 * Applies economy mode substitution to a model ID.
 * Returns the cheaper economy alternative, or the original if no mapping exists.
 */
export function applyEconomyMode(model: string): string {
  return ECONOMY_MODEL_MAP[model] ?? model;
}

/**
 * Shape of model preference fields within `.squad/config.json`.
 */
export interface ModelPreferenceConfig {
  defaultModel?: string;
  agentModelOverrides?: Record<string, string>;
  economyMode?: boolean;
}

/**
 * Reads the economy mode setting from `.squad/config.json`.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @returns True if economyMode is enabled, false otherwise
 */
export function readEconomyMode(squadDir: string, storage: StorageProvider = new FSStorageProvider()): boolean {
  const configPath = join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return false;
  }
  try {
    const raw = storage.readSync(configPath);
    if (raw === undefined) return false;
    const parsed = JSON.parse(raw);
    return parsed !== null &&
      typeof parsed === 'object' &&
      parsed.economyMode === true;
  } catch {
    return false;
  }
}

/**
 * Writes the economy mode setting to `.squad/config.json`.
 * Merges with existing config — does not overwrite other fields.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @param enabled - Whether economy mode should be enabled
 */
export function writeEconomyMode(squadDir: string, enabled: boolean, storage: StorageProvider = new FSStorageProvider()): void {
  const configPath = join(squadDir, 'config.json');
  let config: Record<string, unknown> = {};
  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath);
      config = raw !== undefined ? JSON.parse(raw) : { version: 1 };
    } catch {
      config = { version: 1 };
    }
  } else {
    config = { version: 1 };
  }

  if (enabled) {
    config.economyMode = true;
  } else {
    delete config.economyMode;
  }

  storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Reads the persistent model preference from `.squad/config.json`.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @returns The defaultModel string if set, or null
 */
export function readModelPreference(squadDir: string, storage: StorageProvider = new FSStorageProvider()): string | null {
  const configPath = join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = storage.readSync(configPath);
    if (raw === undefined) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.defaultModel === 'string' &&
      parsed.defaultModel.length > 0
    ) {
      return parsed.defaultModel;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads per-agent model overrides from `.squad/config.json`.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @returns Record of agent name → model ID, or empty object
 */
export function readAgentModelOverrides(squadDir: string, storage: StorageProvider = new FSStorageProvider()): Record<string, string> {
  const configPath = join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = storage.readSync(configPath);
    if (raw === undefined) return {};
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.agentModelOverrides === 'object' &&
      parsed.agentModelOverrides !== null
    ) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed.agentModelOverrides)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Writes a persistent model preference to `.squad/config.json`.
 * Merges with existing config — does not overwrite other fields.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @param model - Model ID to persist, or null to clear
 */
export function writeModelPreference(squadDir: string, model: string | null, storage: StorageProvider = new FSStorageProvider()): void {
  const configPath = join(squadDir, 'config.json');
  let config: Record<string, unknown> = {};
  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath);
      config = raw !== undefined ? JSON.parse(raw) : { version: 1 };
    } catch {
      config = { version: 1 };
    }
  } else {
    config = { version: 1 };
  }

  if (model === null) {
    delete config.defaultModel;
  } else {
    config.defaultModel = model;
  }

  storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Writes per-agent model overrides to `.squad/config.json`.
 * Merges with existing config — does not overwrite other fields.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @param overrides - Record of agent name → model ID, or null to clear
 */
export function writeAgentModelOverrides(
  squadDir: string,
  overrides: Record<string, string> | null,
  storage: StorageProvider = new FSStorageProvider()
): void {
  const configPath = join(squadDir, 'config.json');
  let config: Record<string, unknown> = {};
  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath);
      config = raw !== undefined ? JSON.parse(raw) : { version: 1 };
    } catch {
      config = { version: 1 };
    }
  } else {
    config = { version: 1 };
  }

  if (overrides === null || Object.keys(overrides).length === 0) {
    delete config.agentModelOverrides;
  } else {
    config.agentModelOverrides = overrides;
  }

  storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Resolves the effective model for an agent spawn using the 5-layer hierarchy:
 *   Layer 0: Persistent config (.squad/config.json defaultModel)
 *   Layer 1: Session-wide user directive ("always use opus")
 *   Layer 2: Charter preference (agent's ## Model section)
 *   Layer 3: Task-aware auto-selection (code → sonnet, docs → haiku)
 *   Layer 4: Default (claude-haiku-4.5)
 *
 * Per-agent overrides from config.json take priority over the global defaultModel.
 *
 * Economy mode modifier: when active (via economyMode option or config.json),
 * shifts model selection at Layer 3 and Layer 4 to cheaper alternatives per
 * ECONOMY_MODEL_MAP. Layers 0–2 (explicit user preferences) are never overridden.
 *
 * @param options - Resolution inputs
 * @returns Resolved model ID
 */
export function resolveModel(options: {
  agentName?: string;
  squadDir?: string;
  sessionDirective?: string | null;
  charterPreference?: string | null;
  taskModel?: string | null;
  /** When true, apply economy mode substitution at Layer 3/4. Overrides config. */
  economyMode?: boolean;
  /** Storage provider for config file access. */
  storage?: StorageProvider;
}): string {
  const { agentName, squadDir, sessionDirective, charterPreference, taskModel } = options;
  const storage = options.storage ?? new FSStorageProvider();

  // Layer 0a: Per-agent persistent override (explicit — economy does not apply)
  if (squadDir && agentName) {
    const agentOverrides = readAgentModelOverrides(squadDir, storage);
    if (agentOverrides[agentName]) {
      return agentOverrides[agentName]!;
    }
  }

  // Layer 0b: Global persistent config (explicit — economy does not apply)
  if (squadDir) {
    const persistedModel = readModelPreference(squadDir, storage);
    if (persistedModel) {
      return persistedModel;
    }
  }

  // Layer 1: Session-wide user directive (explicit — economy does not apply)
  if (sessionDirective) {
    return sessionDirective;
  }

  // Layer 2: Charter preference (explicit — economy does not apply)
  if (charterPreference) {
    return charterPreference;
  }

  // Determine if economy mode is active (option takes precedence over config)
  const isEconomy =
    options.economyMode !== undefined
      ? options.economyMode
      : (squadDir ? readEconomyMode(squadDir, storage) : false);

  // Layer 3: Task-aware auto-selection (economy mode applies)
  if (taskModel) {
    return isEconomy ? applyEconomyMode(taskModel) : taskModel;
  }

  // Layer 4: Default (economy mode applies)
  const defaultModel = 'claude-haiku-4.5';
  return isEconomy ? applyEconomyMode(defaultModel) : defaultModel;
}
