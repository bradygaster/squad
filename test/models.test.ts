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

  it('includes expected premium models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);
    
    expect(modelIds).toContain('claude-opus-4.7');
    expect(modelIds).toContain('claude-opus-4.6');
    expect(modelIds).toContain('claude-opus-4.5');
  });

  it('includes expected standard models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);
    
    expect(modelIds).toContain('claude-sonnet-4.6');
    expect(modelIds).toContain('gpt-5.2-codex');
    expect(modelIds).toContain('gemini-3.1-pro');
  });

  it('includes expected fast models', () => {
    const modelIds = MODEL_CATALOG.map(m => m.id);
    
    expect(modelIds).toContain('claude-haiku-4.5');
    expect(modelIds).toContain('gpt-5.4-mini');
    expect(modelIds).toContain('gpt-5-mini');
  });

  it('assigns correct providers', () => {
    const claude = MODEL_CATALOG.find(m => m.id === 'claude-sonnet-4.6');
    const gpt = MODEL_CATALOG.find(m => m.id === 'gpt-5.2-codex');
    const gemini = MODEL_CATALOG.find(m => m.id === 'gemini-3.1-pro');
    
    expect(claude?.provider).toBe('anthropic');
    expect(gpt?.provider).toBe('openai');
    expect(gemini?.provider).toBe('google');
  });
});

describe('MODEL_CATALOG — new fields', () => {
  const categoryOrder = {
    lightweight: 0,
    versatile: 1,
    powerful: 2,
  } as const;

  it('all active models have githubCategory set', () => {
    const activeModels = MODEL_CATALOG.filter((model) => model.availability === 'active');
    expect(activeModels.every((model) => model.githubCategory)).toBe(true);
  });

  it('included models (gpt-4.1, gpt-5-mini) are marked included and priced at zero', () => {
    const includedIds = ['gpt-4.1', 'gpt-5-mini'];
    const includedModels = MODEL_CATALOG.filter((model) => includedIds.includes(model.id));

    expect(includedModels.map((model) => model.id)).toEqual(includedIds);
    expect(includedModels.every((model) => model.includedInCopilot === true)).toBe(true);
    expect(includedModels.every((model) => model.pricing?.inputPerToken === 0 && model.pricing?.outputPerToken === 0)).toBe(true);
  });

  it('deprecated models are marked deprecated and phantom IDs are not active', () => {
    const phantomIds = [
      'gpt-5.1',
      'gpt-5.1-codex',
      'claude-opus-4.6-fast',
      'gpt-5.1-codex-mini',
    ];

    for (const modelId of phantomIds) {
      const model = MODEL_CATALOG.find((entry) => entry.id === modelId);
      expect(model?.availability).toBe('deprecated');
    }

    const activeIds = new Set(MODEL_CATALOG.filter((model) => model.availability === 'active').map((model) => model.id));
    expect(phantomIds.every((modelId) => !activeIds.has(modelId))).toBe(true);
  });

  it('category ordering is consistent (lightweight < versatile < powerful)', () => {
    const categories = Array.from(new Set(MODEL_CATALOG.map((model) => model.githubCategory).filter(Boolean))) as Array<keyof typeof categoryOrder>;
    const ordered = [...categories].sort((left, right) => categoryOrder[left] - categoryOrder[right]);

    expect(ordered).toEqual(['lightweight', 'versatile', 'powerful']);
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

  it('starts premium chain with opus models', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium[0]).toBe('claude-opus-4.7');
  });

  it('starts standard chain with sonnet', () => {
    expect(DEFAULT_FALLBACK_CHAINS.standard[0]).toBe('claude-sonnet-4.6');
  });

  it('starts fast chain with haiku', () => {
    expect(DEFAULT_FALLBACK_CHAINS.fast[0]).toBe('claude-haiku-4.5');
  });
});

describe('ModelRegistry', () => {
  const registry = new ModelRegistry();

  describe('getModelInfo', () => {
    it('returns info for valid model', () => {
      const info = registry.getModelInfo('claude-sonnet-4.5');
      
      expect(info).toBeDefined();
      expect(info?.id).toBe('claude-sonnet-4.5');
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
      expect(registry.isModelAvailable('claude-opus-4.6')).toBe(true);
      expect(registry.isModelAvailable('gpt-5.2-codex')).toBe(true);
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
      const chain = registry.getFallbackChain('standard', true, 'claude-sonnet-4.5');
      
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
      const next = registry.getNextFallback('claude-opus-4.6', 'premium');
      
      expect(next).toBe('claude-opus-4.7');
    });

    it('skips already attempted models', () => {
      const attempted = new Set(['claude-opus-4.7', 'claude-opus-4.5']);
      const next = registry.getNextFallback('claude-opus-4.6', 'premium', attempted);
      
      expect(next).not.toBeNull();
      expect(attempted.has(next!)).toBe(false);
    });

    it('returns null when chain exhausted', () => {
      const allModels = new Set(DEFAULT_FALLBACK_CHAINS.premium);
      const next = registry.getNextFallback('claude-opus-4.6', 'premium', allModels);
      
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
      expect(ids).toContain('claude-opus-4.6');
      expect(ids).toContain('gpt-5.2-codex');
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
    const info = getModelInfo('claude-sonnet-4.6');
    
    expect(info).toBeDefined();
    expect(info?.id).toBe('claude-sonnet-4.6');
  });

  it('getFallbackChain works', () => {
    const chain = getFallbackChain('standard');
    
    expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.standard);
  });

  it('isModelAvailable works', () => {
    expect(isModelAvailable('claude-opus-4.6')).toBe(true);
    expect(isModelAvailable('nonexistent-model')).toBe(false);
  });
});
