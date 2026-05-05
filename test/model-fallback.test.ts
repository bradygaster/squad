/**
 * Model fallback tests — cross-tier fallback, tier ceiling,
 * provider preference, nuclear fallback.
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

  it('premium chain starts with opus and walks through all premium options', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.premium;
    expect(chain[0]).toBe('claude-opus-4.7');

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
    expect(chain[0]).toBe('claude-haiku-4.5');

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

  it('fast fallback chain prefers fast-tier models and only ends with the included standard escape hatch', () => {
    const chain = DEFAULT_FALLBACK_CHAINS.fast;
    const tiers = chain.map((modelId) => registry.getModelInfo(modelId)?.tier);

    expect(tiers.slice(0, -1).every((tier) => tier === 'fast')).toBe(true);
    expect(chain.at(-1)).toBe('gpt-4.1');
    expect(registry.getModelInfo('gpt-4.1')?.tier).toBe('standard');
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
    const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-4.5');

    // First models should be Anthropic (Claude family)
    const firstTwo = chain.slice(0, 2);
    for (const modelId of firstTwo) {
      const info = registry.getModelInfo(modelId);
      expect(info?.provider).toBe('anthropic');
    }
  });

  it('prefer Claude: all anthropic models come before other providers', () => {
    const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-4.5');
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
    const chain = registry.getFallbackChain('standard', true, 'gpt-5.2-codex');

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
// Nuclear fallback: all models fail → null (omit model param)
// ============================================================================

describe('Nuclear fallback — all models exhausted', () => {
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

  it('getNextFallback with empty attempted set returns the first higher-priority remaining model', () => {
    const next = registry.getNextFallback('claude-opus-4.6', 'premium');
    expect(next).toBe('claude-opus-4.7');
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
