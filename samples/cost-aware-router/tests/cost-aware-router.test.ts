/**
 * Tests for the cost-aware-router sample.
 *
 * Validates that SDK tier selection and cost tracking work as expected
 * with the task definitions from the demo.
 */

import { describe, it, expect } from 'vitest';
import {
  CostTracker,
  selectResponseTier,
  getTier,
  MODELS,
} from '@bradygaster/squad-sdk';

import type { SquadConfig, TierName } from '@bradygaster/squad-sdk';

// ── Shared config (mirrors index.ts) ──

const config: SquadConfig = {
  version: '0.8.0',
  team: { name: 'Test Suite' },
  routing: {
    rules: [
      { pattern: 'typo', agents: ['Agent1'], tier: 'direct' },
    ],
  },
  models: {
    default: MODELS.DEFAULT,
    defaultTier: 'standard',
    tiers: {
      premium: [...MODELS.FALLBACK_CHAINS.premium],
      standard: [...MODELS.FALLBACK_CHAINS.standard],
      fast: [...MODELS.FALLBACK_CHAINS.fast],
    },
  },
  agents: [],
};

// ── Tier selection tests ──

describe('selectResponseTier', () => {
  it('routes a typo fix to the direct tier via config override', () => {
    const tier = selectResponseTier('Fix typo in README: "teh" → "the"', config);
    expect(tier.tier).toBe('direct');
    expect(tier.modelTier).toBe('none');
    expect(tier.maxAgents).toBe(0);
  });

  it('routes a list/search message to the lightweight tier', () => {
    const tier = selectResponseTier(
      'List the outdated docs pages and update the API reference',
      config,
    );
    expect(tier.tier).toBe('lightweight');
    expect(tier.modelTier).toBe('fast');
  });

  it('routes a feature implementation to the full tier', () => {
    const tier = selectResponseTier(
      'Implement a new feature: webhook retry module with exponential backoff and dead-letter queue',
      config,
    );
    expect(tier.tier).toBe('full');
    expect(tier.modelTier).toBe('premium');
  });

  it('routes a full review to the full tier', () => {
    const tier = selectResponseTier(
      'Full review of the event bus architecture — check coupling, error flows, and scaling limits',
      config,
    );
    expect(tier.tier).toBe('full');
    expect(tier.modelTier).toBe('premium');
  });

  it('routes a security audit to the full tier', () => {
    const tier = selectResponseTier(
      'Security audit of the authentication and authorization subsystem',
      config,
    );
    expect(tier.tier).toBe('full');
    expect(tier.modelTier).toBe('premium');
  });
});

// ── getTier tests ──

describe('getTier', () => {
  it.each<[TierName, number]>([
    ['direct', 0],
    ['lightweight', 1],
    ['standard', 1],
    ['full', 5],
  ])('returns correct maxAgents for %s tier', (name, expected) => {
    expect(getTier(name).maxAgents).toBe(expected);
  });

  it('returns a copy, not a reference', () => {
    const a = getTier('standard');
    const b = getTier('standard');
    a.timeout = 999;
    expect(b.timeout).not.toBe(999);
  });
});

// ── CostTracker tests ──

describe('CostTracker', () => {
  it('accumulates costs across multiple recordUsage calls', () => {
    const tracker = new CostTracker();

    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4.5',
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCost: 0.01,
    });

    tracker.recordUsage({
      sessionId: 's2',
      agentName: 'Agent2',
      model: 'claude-opus-4.6',
      inputTokens: 5000,
      outputTokens: 2000,
      estimatedCost: 0.25,
    });

    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(6000);
    expect(summary.totalOutputTokens).toBe(2500);
    expect(summary.totalEstimatedCost).toBeCloseTo(0.26, 2);
    expect(summary.agents.size).toBe(2);
    expect(summary.sessions.size).toBe(2);
  });

  it('merges turns for the same agent', () => {
    const tracker = new CostTracker();

    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4.5',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.001,
    });

    tracker.recordUsage({
      sessionId: 's2',
      agentName: 'Agent1',
      model: 'claude-sonnet-4.5',
      inputTokens: 200,
      outputTokens: 100,
      estimatedCost: 0.002,
    });

    const summary = tracker.getSummary();
    const agent = summary.agents.get('Agent1');
    expect(agent).toBeDefined();
    expect(agent!.turnCount).toBe(2);
    expect(agent!.inputTokens).toBe(300);
  });

  it('tracks fallbacks', () => {
    const tracker = new CostTracker();

    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent3',
      model: 'claude-opus-4.6',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.01,
      isFallback: true,
    });

    const summary = tracker.getSummary();
    expect(summary.agents.get('Agent3')!.fallbackCount).toBe(1);
  });

  it('resets all data', () => {
    const tracker = new CostTracker();

    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4.5',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCost: 0.001,
    });

    tracker.reset();
    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.agents.size).toBe(0);
    expect(summary.sessions.size).toBe(0);
  });

  it('produces a formatted summary string', () => {
    const tracker = new CostTracker();

    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent2',
      model: 'claude-opus-4.6',
      inputTokens: 5000,
      outputTokens: 2000,
      estimatedCost: 0.25,
    });

    const output = tracker.formatSummary();
    expect(output).toContain('Squad Cost Summary');
    expect(output).toContain('Agent2');
    expect(output).toContain('$0.2500');
  });
});

// ── MODELS constant tests ──

describe('MODELS', () => {
  it('has fallback chains for all three tiers', () => {
    expect(MODELS.FALLBACK_CHAINS.premium.length).toBeGreaterThan(0);
    expect(MODELS.FALLBACK_CHAINS.standard.length).toBeGreaterThan(0);
    expect(MODELS.FALLBACK_CHAINS.fast.length).toBeGreaterThan(0);
  });

  it('has a default model', () => {
    expect(typeof MODELS.DEFAULT).toBe('string');
    expect(MODELS.DEFAULT.length).toBeGreaterThan(0);
  });
});
