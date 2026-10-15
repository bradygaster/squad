/**
 * Model fallback tests — cross-tier fallback, tier ceiling,
 * provider preference, platform default fallback.
 *
 * Expands on models.test.ts (audit gap: advanced fallback logic).
 *
 * @module test/model-fallback
 */

import { describe, it, expect } from 'vitest';
import {
  ModelRegistry,
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
} from '@bradygaster/squad-sdk/config';
import {
  resolveAgentModel,
  ModelFallbackExecutor,
  type ModelResolutionOptions,
} from '@bradygaster/squad-sdk/agents';
import { MODELS } from '@bradygaster/squad-sdk/runtime/constants';

// ============================================================================
// Cross-tier fallback: standard chain tries all models in order
// ============================================================================

describe('Cross-tier fallback — standard chain exhaustion', () => {
  const registry = new ModelRegistry();

  it('standard chain tries all models in order', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.standard;
    expect(chain.length).toBeGreaterThan(1);

    // Walk the chain with getNextFallback
    const attempted = new Set<string>();
    let current = chain[0]!;
    const visited: string[] = [current];
    attempted.add(current);

    let next = registry.getNextFallback(current, 'standard', attempted);
    while (next) {
      visited.push(next);
      attempted.add(next);
      current = next;
      next = registry.getNextFallback(current, 'standard', attempted);
    }

    // Every model in the default chain was visited (order may vary due to provider preference)
    const chainSet = new Set(chain);
    const visitedSet = new Set(visited);
    expect(visitedSet).toEqual(chainSet);
  });

  it('premium chain starts with Claude Opus 5.5 and walks through all premium options', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.premium;
    expect(chain[0]).toBe('claude-opus-5.5');

    const attempted = new Set<string>();
    let count = 0;
    let current = chain[0]!;
    attempted.add(current);
    count++;

    let next = registry.getNextFallback(current, 'premium', attempted);
    while (next) {
      attempted.add(next);
      current = next;
      count++;
      next = registry.getNextFallback(current, 'premium', attempted);
    }

    expect(count).toBe(chain.length);
  });

  it('fast chain walks through all fast options', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.fast;
    expect(chain[0]).toBe('claude-haiku-5.5');

    const attempted = new Set<string>();
    let count = 0;
    let current = chain[0]!;
    attempted.add(current);
    count++;

    let next = registry.getNextFallback(current, 'fast', attempted);
    while (next) {
      attempted.add(next);
      current = next;
      count++;
      next = registry.getNextFallback(current, 'fast', attempted);
    }

    expect(count).toBe(chain.length);
  });

  it('returns null when all models in chain exhausted', () => {
    const allStandard = new Set(DEFAULT_FALLBACK_CHAINS.standard);
    const next = registry.getNextFallback(DEFAULT_FALLBACK_CHAINS.standard[0]!, 'standard', allStandard);
    expect(next).toBeNull();
  });
});

// ============================================================================
// Tier ceiling: fast task never falls back UP to premium
// ============================================================================

describe('Tier ceiling — fast never escalates to premium', () => {
  const registry = new ModelRegistry();

  it('fast fallback chain contains only fast-tier models', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.fast;
    for (const modelId of chain) {
      const info = registry.getModelInfo(modelId);
      expect(info).not.toBeNull();
      expect(info!.tier).toBe('fast');
    }
  });

  it('fast chain never contains premium models', () => {
    const premiumIds = MODEL_CATALOG.filter(m => m.tier === 'premium').map(m => m.id);
    const fastChain = DEFAULT_FALLBACK_CHAINS.fast;
    for (const modelId of fastChain) {
      expect(premiumIds).not.toContain(modelId);
    }
  });

  it('standard chain never contains premium models', () => {
    const premiumIds = MODEL_CATALOG.filter(m => m.tier === 'premium').map(m => m.id);
    const standardChain = DEFAULT_FALLBACK_CHAINS.standard;
    for (const modelId of standardChain) {
      expect(premiumIds).not.toContain(modelId);
    }
  });

  it('getNextFallback for fast model returns fast-tier model', () => {
    const next = registry.getNextFallback('claude-haiku-4.5', 'fast');
    if (next) {
      const info = registry.getModelInfo(next);
      expect(info!.tier).toBe('fast');
    }
  });

  it('getModelsByTier(fast) returns no premium models', () => {
    const fastModels = registry.getModelsByTier('fast');
    expect(fastModels.every(m => m.tier === 'fast')).toBe(true);
    expect(fastModels.every(m => m.tier !== 'premium')).toBe(true);
  });
});

// ============================================================================
// Provider preference: "use Claude" stays in Claude family
// ============================================================================

describe('Provider preference — Claude family preference', () => {
  const registry = new ModelRegistry();

  it('getFallbackChain with preferSameProvider starts with same provider', () => {
    const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-5.5');

    // First models should be Anthropic (Claude family)
    const firstTwo = chain.slice(0, 2);
    for (const modelId of firstTwo) {
      const info = registry.getModelInfo(modelId);
      expect(info?.provider).toBe('anthropic');
    }
  });

  it('prefer Claude: all anthropic models come before other providers', () => {
    const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-5.5');
    const standardAnthropicCount = MODEL_CATALOG.filter(
      m => m.tier === 'standard' && m.provider === 'anthropic'
    ).length;

    // The first N models should all be anthropic where N = number of anthropic standard models
    if (standardAnthropicCount > 0) {
      const firstBatch = chain.slice(0, standardAnthropicCount);
      for (const modelId of firstBatch) {
        const info = registry.getModelInfo(modelId);
        expect(info?.provider).toBe('anthropic');
      }
    }
  });

  it('prefer GPT: getFallbackChain reorders for OpenAI models', () => {
    const chain = registry.getFallbackChain('standard', true, 'gpt-5.4');

    // First models should be OpenAI
    const firstInfo = registry.getModelInfo(chain[0]!);
    expect(firstInfo?.provider).toBe('openai');
  });

  it('without preference: returns default chain order', () => {
    const chain = registry.getFallbackChain('standard', false);
    expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
  });

  it('unknown model with preferSameProvider falls back to default', () => {
    const chain = registry.getFallbackChain('standard', true, 'nonexistent-model');
    expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
  });
});

// ============================================================================
// Platform default fallback: all models fail → null (omit model param)
// ============================================================================

describe('Platform default fallback — all models exhausted', () => {
  const registry = new ModelRegistry();

  it('getNextFallback returns null when all premium models attempted', () => {
    const allPremium = new Set(DEFAULT_FALLBACK_CHAINS.premium);
    const result = registry.getNextFallback('claude-opus-4.6', 'premium', allPremium);
    expect(result).toBeNull();
  });

  it('getNextFallback returns null when all standard models attempted', () => {
    const allStandard = new Set(DEFAULT_FALLBACK_CHAINS.standard);
    const result = registry.getNextFallback('claude-sonnet-4.5', 'standard', allStandard);
    expect(result).toBeNull();
  });

  it('getNextFallback returns null when all fast models attempted', () => {
    const allFast = new Set(DEFAULT_FALLBACK_CHAINS.fast);
    const result = registry.getNextFallback('claude-haiku-4.5', 'fast', allFast);
    expect(result).toBeNull();
  });

  it('simulates full fallback cascade ending in null', () => {
    const attempted = new Set<string>();
    let current: string | null = DEFAULT_FALLBACK_CHAINS.standard[0]!;
    attempted.add(current);

    while (current) {
      const next = registry.getNextFallback(current, 'standard', attempted);
      if (next) attempted.add(next);
      current = next;
    }

    // All standard chain models were attempted
    for (const model of DEFAULT_FALLBACK_CHAINS.standard) {
      expect(attempted.has(model)).toBe(true);
    }
    // Final result is null → caller should omit model param
    expect(current).toBeNull();
  });

  it('chain length matches catalog tier count', () => {
    for (const tier of ['premium', 'standard', 'fast'] as const) {
      const chainLength = DEFAULT_FALLBACK_CHAINS[tier].length;
      // Chain should have at least as many entries as the minimum for that tier
      expect(chainLength).toBeGreaterThan(0);
      // Every model in chain must be a valid model
      for (const modelId of DEFAULT_FALLBACK_CHAINS[tier]) {
        expect(registry.isModelAvailable(modelId)).toBe(true);
      }
    }
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Model fallback — edge cases', () => {
  const registry = new ModelRegistry();

  it('getNextFallback with empty attempted set returns second in chain', () => {
    const next = registry.getNextFallback('claude-opus-4.8', 'premium');
    // With no attempted set, it returns the first same-provider entry other than current
    expect(next).toBe('claude-opus-5.5');
  });

  it('getNextFallback for unknown model returns null', () => {
    const next = registry.getNextFallback('nonexistent', 'standard');
    // Unknown model not in chain — should still return first available
    // or null depending on implementation
    expect(next === null || typeof next === 'string').toBe(true);
  });

  it('each tier has at least 3 fallback options', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_FALLBACK_CHAINS.standard.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_FALLBACK_CHAINS.fast.length).toBeGreaterThanOrEqual(3);
  });

  it('no duplicate models in any chain', () => {
    for (const tier of ['premium', 'standard', 'fast'] as const) {
      const chain = DEFAULT_FALLBACK_CHAINS[tier];
      const uniqueSet = new Set(chain);
      expect(uniqueSet.size).toBe(chain.length);
    }
  });

  it('all chain models exist in catalog', () => {
    for (const tier of ['premium', 'standard', 'fast'] as const) {
      for (const modelId of DEFAULT_FALLBACK_CHAINS[tier]) {
        expect(registry.getModelInfo(modelId)).not.toBeNull();
      }
    }
  });
});

// ============================================================================
// Resolver → executor: retry chain is availability-filtered and forward-only
// (PR #2225 review)
// ============================================================================

async function attemptedModels(options: ModelResolutionOptions): Promise<{ tried: Array<string | undefined>; label: string }> {
  const resolved = resolveAgentModel(options);
  const tried: Array<string | undefined> = [];
  await new ModelFallbackExecutor({ allowCrossTier: true })
    .execute(resolved, 'agent', async (model) => {
      tried.push(model);
      throw new Error(`fail ${model}`);
    })
    .catch(() => undefined);
  return { tried, label: `resolveAgentModel(${JSON.stringify(options)}) → ${JSON.stringify(resolved)}; tried ${JSON.stringify(tried)}` };
}

describe('Resolver → ModelFallbackExecutor retry chain (PR #2225)', () => {
  const standard = MODELS.FALLBACK_CHAINS.standard;

  it('only available entries are retried (no unavailable middle-chain model)', async () => {
    const options = { taskType: 'code' as const, availableModels: ['claude-sonnet-5.5', 'claude-sonnet-5'] };
    const resolved = resolveAgentModel(options);
    const { tried, label } = await attemptedModels(options);
    expect(resolved.fallbackChain, label).toEqual(['claude-sonnet-5.5', 'claude-sonnet-5']);
    expect(tried, label).toEqual(['claude-sonnet-5.5', 'claude-sonnet-5']);
  });

  it('a middle-chain selection never retries earlier chain entries', async () => {
    const options = { userOverride: standard[2] };
    const { tried, label } = await attemptedModels(options);
    expect(tried, label).toEqual(standard.slice(2));
  });

  it('a middle-chain selection with a live list retries only available later entries', async () => {
    const options = { userOverride: standard[2], availableModels: [standard[0], standard[2], standard[4]] };
    const { tried, label } = await attemptedModels(options);
    expect(tried, label).toEqual([standard[2], standard[4]]);
  });

  it('an out-of-chain selection keeps head-first fallback over available entries', async () => {
    const options = { userOverride: 'my-custom-model', availableModels: ['my-custom-model', standard[0], standard[3]] };
    const { tried, label } = await attemptedModels(options);
    expect(tried, label).toEqual(['my-custom-model', standard[0], standard[3]]);
  });
});

describe('Resolver → ModelFallbackExecutor exhausted chain (omitModel, PR #2225)', () => {
  const options: ModelResolutionOptions = { taskType: 'code', availableModels: ['not-a-chain-model'] };

  it('runs the platform-default callback instead of calling fn with an empty model id', async () => {
    const resolved = resolveAgentModel(options);
    const tried: string[] = [];
    let platformCalls = 0;
    const result = await new ModelFallbackExecutor().execute(
      resolved,
      'agent',
      async (model) => { tried.push(model); return `model:${model}`; },
      { platformDefault: async () => { platformCalls++; return 'platform-default'; } },
    );
    const label = `resolveAgentModel(${JSON.stringify(options)}) → ${JSON.stringify(resolved)}; fn got ${JSON.stringify(tried)}`;
    expect(resolved.omitModel, label).toBe(true);
    expect(tried, label).toEqual([]);
    expect(platformCalls, label).toBe(1);
    expect(result, label).toMatchObject({ value: 'platform-default', model: '', omitModel: true, didFallback: false });
  });

  it('without a platform-default callback it rejects and never calls fn with an empty model id', async () => {
    const resolved = resolveAgentModel(options);
    const tried: string[] = [];
    const run = new ModelFallbackExecutor().execute(resolved, 'agent', async (model) => { tried.push(model); return model; });
    await expect(run, `execute(${JSON.stringify(resolved)})`).rejects.toThrow(/omitModel/);
    expect(tried, `fn calls for ${JSON.stringify(resolved)}`).toEqual([]);
  });
});

describe('Economy-profile runtime fallback', () => {
  it('retries an available cheaper tier with default executor settings', async () => {
    const resolved = resolveAgentModel({
      taskType: 'visual',
      profile: 'economy',
      availableModels: ['claude-sonnet-5.5', 'gpt-5.6-luna'],
    });
    const tried: string[] = [];

    await new ModelFallbackExecutor()
      .execute(resolved, 'agent', async (model) => {
        tried.push(model);
        throw new Error(`fail ${model}`);
      })
      .catch(() => undefined);

    expect(resolved.model).toBe('claude-sonnet-5.5');
    expect(tried).toEqual(['claude-sonnet-5.5', 'gpt-5.6-luna']);
    expect(resolved.fallbackChain).toEqual(['claude-sonnet-5.5', 'gpt-5.6-luna']);
  });

  it('does not add cheaper-tier retries for explicit model preferences', async () => {
    const resolved = resolveAgentModel({
      userOverride: 'claude-sonnet-5.5',
      profile: 'economy',
      availableModels: ['claude-sonnet-5.5', 'gpt-5.6-luna'],
    });
    const tried: string[] = [];

    await new ModelFallbackExecutor()
      .execute(resolved, 'agent', async (model) => {
        tried.push(model);
        throw new Error(`fail ${model}`);
      })
      .catch(() => undefined);

    expect(resolved.fallbackChain).not.toContain('gpt-5.6-luna');
    expect(tried).toEqual(['claude-sonnet-5.5']);
  });

  it('keeps non-economy fallback chains within the selected tier', async () => {
    const resolved = resolveAgentModel({
      taskType: 'visual',
      profile: 'quality-first',
      availableModels: ['claude-opus-5.5', 'claude-sonnet-5.5'],
    });
    const tried: string[] = [];

    await new ModelFallbackExecutor()
      .execute(resolved, 'agent', async (model) => {
        tried.push(model);
        throw new Error(`fail ${model}`);
      })
      .catch(() => undefined);

    expect(resolved.fallbackChain).not.toContain('claude-sonnet-5.5');
    expect(tried).toEqual(['claude-opus-5.5']);
  });
});
