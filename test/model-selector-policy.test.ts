/**
 * Cost-policy resolution tests (issue #1080 / #1183).
 *
 * Rebuilds the policy scenarios from the abandoned PR #1089 MINUS the dropped
 * `included`/`preferIncluded` concept, and adds the two gaps #1089 never
 * covered: fail-closed when no in-ceiling model exists (AC8) and the
 * empty-pruned-chain path (AC9).
 *
 * @module test/model-selector-policy
 */

import { describe, it, expect } from 'vitest';
import {
  resolveModel,
  finalizeResolvedModel,
  buildEffectiveCostPolicy,
  buildCatalogCategoryMap,
  pruneChainToCeiling,
  ModelFallbackExecutor,
  type ResolvedModel,
} from '@bradygaster/squad-sdk/agents';
import type { GitHubModelCategory } from '@bradygaster/squad-sdk/config';

describe('cost policy — resolveModel integration', () => {
  it('AC5: implicit over-ceiling selection is downgraded deterministically', () => {
    const resolved = resolveModel({
      taskType: 'visual', // task-auto → gpt-5.6-sol (powerful, premium)
      sessionCostPolicy: { maxCategory: 'versatile' },
    });

    expect(resolved.policy).toBeDefined();
    expect(resolved.policy!.action).toBe('downgraded-to-ceiling');
    expect(resolved.policy!.originalModel).toBe('gpt-5.6-sol');
    expect(resolved.policy!.finalModel).toBe('claude-sonnet-4.6');
    expect(resolved.model).toBe('claude-sonnet-4.6');
    // pruned chain must not contain any powerful model
    const catMap = buildCatalogCategoryMap();
    for (const id of resolved.fallbackChain) {
      const cat = catMap.get(id);
      if (cat) expect(cat).not.toBe('powerful');
    }
  });

  it('AC6: explicit over-ceiling override is warned-and-allowed (warning populated)', () => {
    const resolved = resolveModel({
      taskType: 'code',
      userOverride: 'claude-opus-4.8', // explicit, powerful
      sessionCostPolicy: { maxCategory: 'versatile' },
    });

    expect(resolved.policy).toBeDefined();
    expect(resolved.policy!.action).toBe('warn-allow-explicit');
    expect(resolved.model).toBe('claude-opus-4.8'); // explicit intent wins
    expect(resolved.policy!.warning).toBeTruthy();
    expect(resolved.policy!.warning).toContain('versatile');
  });

  it('AC10: unknown/out-of-catalog model passes through with no policy action', () => {
    const resolved = resolveModel({
      taskType: 'code',
      userOverride: 'some-unknown-model-xyz',
      sessionCostPolicy: { maxCategory: 'lightweight' },
    });

    expect(resolved.model).toBe('some-unknown-model-xyz');
    expect(resolved.policy).toBeUndefined();
  });

  it('no policy configured ⇒ behaves exactly as today (no policy field)', () => {
    const resolved = resolveModel({ taskType: 'visual' });
    expect(resolved.model).toBe('gpt-5.6-sol');
    expect(resolved.policy).toBeUndefined();
  });
});

describe('buildEffectiveCostPolicy', () => {
  it('returns undefined when neither config nor session set a ceiling', () => {
    expect(buildEffectiveCostPolicy(undefined, undefined)).toBeUndefined();
    expect(buildEffectiveCostPolicy({}, {})).toBeUndefined();
    expect(buildEffectiveCostPolicy({ costPolicy: {} }, undefined)).toBeUndefined();
  });

  it('session override wins over persistent config', () => {
    const eff = buildEffectiveCostPolicy(
      { costPolicy: { maxCategory: 'powerful' } },
      { maxCategory: 'lightweight' },
    );
    expect(eff).toBeDefined();
    expect(eff!.maxCategory).toBe('lightweight');
  });

  it('falls back to persistent config when no session override', () => {
    const eff = buildEffectiveCostPolicy({ costPolicy: { maxCategory: 'versatile' } }, undefined);
    expect(eff!.maxCategory).toBe('versatile');
  });
});

describe('pruneChainToCeiling (AC7)', () => {
  it('removes above-ceiling entries and preserves order', () => {
    const catMap = buildCatalogCategoryMap();
    const chain = ['claude-sonnet-4.6', 'gpt-5.4', 'claude-sonnet-4.5', 'gpt-5.3-codex'];
    const pruned = pruneChainToCeiling(chain, 'versatile', catMap);
    expect(pruned).toEqual(['claude-sonnet-4.6', 'claude-sonnet-4.5']);
    for (const id of pruned) {
      expect(catMap.get(id)).not.toBe('powerful');
    }
  });

  it('keeps uncategorized (unknown) entries as passthrough', () => {
    const catMap = buildCatalogCategoryMap();
    const chain = ['claude-sonnet-4.6', 'totally-unknown-model'];
    const pruned = pruneChainToCeiling(chain, 'lightweight', catMap);
    expect(pruned).toContain('totally-unknown-model');
  });
});

describe('finalizeResolvedModel — fail-closed (AC8)', () => {
  it('emits a loud warning and does NOT mark an over-ceiling model compliant', () => {
    // Craft a catalog map where nothing is within a versatile ceiling.
    const catMap = new Map<string, GitHubModelCategory>([
      ['only-powerful-a', 'powerful'],
      ['only-powerful-b', 'powerful'],
    ]);
    const base: ResolvedModel = {
      model: 'only-powerful-a',
      tier: 'premium',
      source: 'task-auto', // implicit
      fallbackChain: ['only-powerful-a', 'only-powerful-b'],
    };
    const finalized = finalizeResolvedModel(base, { maxCategory: 'versatile' }, catMap);
    expect(finalized.policy).toBeDefined();
    expect(finalized.policy!.action).toBe('no-compliant-model');
    expect(finalized.policy!.warning).toBeTruthy();
    // last-resort model is transparent, NOT silently marked "none"/compliant
    expect(finalized.policy!.action).not.toBe('none');
  });
});

describe('empty-pruned-chain path (AC9)', () => {
  it('pruning to empty does not throw and executor degrades gracefully', async () => {
    const catMap = new Map<string, GitHubModelCategory>([
      ['powerful-only', 'powerful'],
    ]);
    const pruned = pruneChainToCeiling(['powerful-only'], 'lightweight', catMap);
    expect(pruned).toEqual([]);

    const resolved: ResolvedModel = {
      model: 'powerful-only',
      tier: 'premium',
      source: 'task-auto',
      fallbackChain: [], // empty pruned chain
    };
    const executor = new ModelFallbackExecutor();
    // Every attempt fails → executor should exhaust gracefully (reject), not crash.
    await expect(
      executor.execute(resolved, 'test-agent', async () => {
        throw new Error('model unavailable');
      }),
    ).rejects.toThrow(/exhausted/i);
  });
});
