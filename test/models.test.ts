/**
 * Tests for models configuration module
 */

import { describe, it, expect } from 'vitest';
import {
  ModelRegistry,
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
  getModelInfo,
  getFallbackChain,
  isModelAvailable
} from '@bradygaster/squad-sdk/config';

describe('MODEL_CATALOG', () => {
  it('contains all model tiers', () => {
    const premiumModels = MODEL_CATALOG.filter(m => m.tier === 'premium');
    const standardModels = MODEL_CATALOG.filter(m => m.tier === 'standard');
    const fastModels = MODEL_CATALOG.filter(m => m.tier === 'fast');

    expect(premiumModels.length).toBeGreaterThan(0);
    expect(standardModels.length).toBeGreaterThan(0);
    expect(fastModels.length).toBeGreaterThan(0);
  });

  it('marks every GA catalog model as vision-capable', () => {
    // Preview opt-in entries (#2014) do not claim capabilities that are not documented.
    const notVision = MODEL_CATALOG.filter(model => model.preview !== true && model.vision !== true).map(model => model.id);
    expect(notVision, `GA catalog models without vision: ${JSON.stringify(notVision)}`).toEqual([]);
  });

  it('includes expected premium models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);

    expect(modelIds).toContain('claude-opus-5.5');
    expect(modelIds).toContain('claude-opus-5');
    expect(modelIds).toContain('claude-opus-4.8');
    expect(modelIds).toContain('gpt-6.1-sol');
  });

  it('includes expected standard models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);

    expect(modelIds).toContain('claude-sonnet-5.5');
    expect(modelIds).toContain('gpt-5.4');
    expect(modelIds).toContain('gpt-5.6-terra');
  });

  it('includes expected fast models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);

    expect(modelIds).toContain('claude-haiku-5.5');
    expect(modelIds).toContain('claude-haiku-4.5');
    expect(modelIds).toContain('gpt-5.4-mini');
    expect(modelIds).toContain('gpt-5-mini');
    expect(modelIds).toContain('gpt-5.6-luna');
  });

  it('assigns correct providers', () => {
    const claude = MODEL_CATALOG.find(m => m.id === 'claude-sonnet-5.5');
    const gpt = MODEL_CATALOG.find(m => m.id === 'gpt-5.4');
    const gemini = MODEL_CATALOG.find(m => m.id === 'gemini-4-argon');
    const grok = MODEL_CATALOG.find(m => m.id === 'grok-4.7');
    const mai = MODEL_CATALOG.find(m => m.id === 'mai-code-1.1-flash');

    expect(claude?.provider).toBe('anthropic');
    expect(gpt?.provider).toBe('openai');
    expect(gemini?.provider).toBe('google');
    expect(grok?.provider).toBe('xai');
    expect(mai?.provider).toBe('microsoft');
  });
});

describe('DEFAULT_FALLBACK_CHAINS', () => {
  it('defines chains for all tiers', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium).toBeDefined();
    expect(DEFAULT_FALLBACK_CHAINS.standard).toBeDefined();
    expect(DEFAULT_FALLBACK_CHAINS.fast).toBeDefined();
  });

  it('has non-empty chains', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium.length).toBeGreaterThan(0);
    expect(DEFAULT_FALLBACK_CHAINS.standard.length).toBeGreaterThan(0);
    expect(DEFAULT_FALLBACK_CHAINS.fast.length).toBeGreaterThan(0);
  });

  it('starts premium chain with Claude Opus 5.5', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium[0]).toBe('claude-opus-5.5');
  });

  it('starts standard chain with Claude Sonnet 5.5', () => {
    expect(DEFAULT_FALLBACK_CHAINS.standard[0]).toBe('claude-sonnet-5.5');
  });

  it('starts fast chain with Claude Haiku 5.5', () => {
    expect(DEFAULT_FALLBACK_CHAINS.fast[0]).toBe('claude-haiku-5.5');
  });
});

describe('ModelRegistry', () => {
  const registry = new ModelRegistry();

  describe('getModelInfo', () => {
    it('returns info for valid model', () => {
      const info = registry.getModelInfo('claude-sonnet-5.5');

      expect(info).toBeDefined();
      expect(info?.id).toBe('claude-sonnet-5.5');
      expect(info?.tier).toBe('standard');
      expect(info?.provider).toBe('anthropic');
    });

    it('returns null for unknown model', () => {
      const info = registry.getModelInfo('unknown-model-xyz');

      expect(info).toBeNull();
    });
  });

  describe('isModelAvailable', () => {
    it('returns true for catalog models', () => {
      expect(registry.isModelAvailable('claude-opus-5.5')).toBe(true);
      expect(registry.isModelAvailable('gpt-5.4')).toBe(true);
      expect(registry.isModelAvailable('claude-haiku-4.5')).toBe(true);
    });

    it('returns false for unknown models', () => {
      expect(registry.isModelAvailable('gpt-6')).toBe(false);
      expect(registry.isModelAvailable('claude-ultra-5')).toBe(false);
    });
  });

  describe('getModelsByTier', () => {
    it('returns all premium models', () => {
      const premiumModels = registry.getModelsByTier('premium');

      expect(premiumModels.length).toBeGreaterThan(0);
      expect(premiumModels.every(m => m.tier === 'premium')).toBe(true);
    });

    it('returns all standard models', () => {
      const standardModels = registry.getModelsByTier('standard');

      expect(standardModels.length).toBeGreaterThan(0);
      expect(standardModels.every(m => m.tier === 'standard')).toBe(true);
    });

    it('returns all fast models', () => {
      const fastModels = registry.getModelsByTier('fast');

      expect(fastModels.length).toBeGreaterThan(0);
      expect(fastModels.every(m => m.tier === 'fast')).toBe(true);
    });
  });

  describe('getModelsByProvider', () => {
    it('returns anthropic models', () => {
      const models = registry.getModelsByProvider('anthropic');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every(m => m.provider === 'anthropic')).toBe(true);
      expect(models.some(m => m.id.includes('claude'))).toBe(true);
    });

    it('returns openai models', () => {
      const models = registry.getModelsByProvider('openai');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every(m => m.provider === 'openai')).toBe(true);
      expect(models.some(m => m.id.includes('gpt'))).toBe(true);
    });

    it('returns google models', () => {
      const models = registry.getModelsByProvider('google');

      expect(models.length).toBeGreaterThan(0);
      expect(models.every(m => m.provider === 'google')).toBe(true);
    });
  });

  describe('getFallbackChain', () => {
    it('returns default chain without preferences', () => {
      const chain = registry.getFallbackChain('standard', false);

      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
    });

    it('prefers same provider when enabled', () => {
      const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-5.5');

      // First models should be Claude (Anthropic)
      const firstFew = chain.slice(0, 2);
      const info = firstFew.map(id => registry.getModelInfo(id));
      expect(info.every(m => m?.provider === 'anthropic')).toBe(true);
    });

    it('handles unknown current model gracefully', () => {
      const chain = registry.getFallbackChain('standard', true, 'unknown-model');

      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
    });
  });

  describe('getNextFallback', () => {
    it('returns next model in chain', () => {
      const next = registry.getNextFallback('claude-opus-4.8', 'premium');

      // Same-provider preference walks Anthropic entries first, newest first.
      expect(next).toBe('claude-opus-5.5');
    });

    it('skips already attempted models', () => {
      const attempted = new Set(['claude-opus-5.5', 'claude-opus-5']);
      const next = registry.getNextFallback('claude-opus-4.8', 'premium', attempted);

      expect(next).not.toBeNull();
      expect(attempted.has(next!)).toBe(false);
    });

    it('returns null when chain exhausted', () => {
      const allModels = new Set(DEFAULT_FALLBACK_CHAINS.premium);
      const next = registry.getNextFallback('claude-opus-4.8', 'premium', allModels);

      expect(next).toBeNull();
    });
  });

  describe('getRecommendedModels', () => {
    it('recommends models for code generation', () => {
      const recommended = registry.getRecommendedModels('code generation');

      expect(recommended.length).toBeGreaterThan(0);
      // Should include codex models
      expect(recommended.some(m => m.id.includes('codex'))).toBe(true);
    });

    it('recommends models for specific use case', () => {
      const recommended = registry.getRecommendedModels('architecture proposals');

      expect(recommended.length).toBeGreaterThan(0);
      // Should include opus models (premium tier)
      expect(recommended.some(m => m.tier === 'premium')).toBe(true);
    });

    it('filters by tier when specified', () => {
      const recommended = registry.getRecommendedModels('code', 'fast');

      expect(recommended.every(m => m.tier === 'fast')).toBe(true);
    });
  });

  describe('getAllModelIds', () => {
    it('returns all model IDs', () => {
      const ids = registry.getAllModelIds();

      expect(ids.length).toBe(MODEL_CATALOG.length);
      expect(ids).toContain('claude-opus-5.5');
      expect(ids).toContain('gpt-5.4');
      expect(ids).toContain('claude-haiku-4.5');
    });
  });

  describe('getStats', () => {
    it('returns accurate statistics', () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(MODEL_CATALOG.length);
      expect(stats.byTier.premium).toBeGreaterThan(0);
      expect(stats.byTier.standard).toBeGreaterThan(0);
      expect(stats.byTier.fast).toBeGreaterThan(0);
      expect(stats.byProvider.anthropic).toBeGreaterThan(0);
      expect(stats.byProvider.openai).toBeGreaterThan(0);
    });
  });
});

describe('convenience functions', () => {
  it('getModelInfo works', () => {
    const info = getModelInfo('claude-sonnet-5.5');

    expect(info).toBeDefined();
    expect(info?.id).toBe('claude-sonnet-5.5');
  });

  it('getFallbackChain works', () => {
    const chain = getFallbackChain('standard');

    expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
  });

  it('isModelAvailable works', () => {
    expect(isModelAvailable('claude-opus-5.5')).toBe(true);
    expect(isModelAvailable('nonexistent-model')).toBe(false);
  });
});
