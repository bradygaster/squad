import { describe, expect, it } from 'vitest';
import { resolveModel } from '@bradygaster/squad-sdk/agents';

describe('model selector cost policy', () => {
  it('warns and allows explicit session overrides above the ceiling', () => {
    const result = resolveModel({
      taskType: 'code',
      userOverride: 'claude-opus-4.7',
      sessionCostPolicy: { source: 'conversation', maxCategory: 'versatile' },
    });

    expect(result.model).toBe('claude-opus-4.7');
    expect(result.source).toBe('user-override');
    expect(result.policy).toMatchObject({
      action: 'warn-allow-explicit',
      originalModel: 'claude-opus-4.7',
      finalModel: 'claude-opus-4.7',
      appliedPolicy: {
        maxCategory: 'versatile',
        preferIncluded: false,
      },
    });
    expect(result.policy?.warning).toContain('above the current cost policy ceiling');
    expect(result.fallbackChain[0]).toBe('claude-opus-4.7');
  });

  it('warns and allows persistent agent overrides above the ceiling', () => {
    const result = resolveModel({
      taskType: 'docs',
      agentRole: 'eecom',
      config: {
        models: {
          agentModelOverrides: {
            eecom: 'claude-opus-4.7',
          },
          costPolicy: {
            maxCategory: 'versatile',
          },
        },
      },
    });

    expect(result.model).toBe('claude-opus-4.7');
    expect(result.source).toBe('persistent-agent-override');
    expect(result.policy?.action).toBe('warn-allow-explicit');
  });

  it('downgrades automatic selections to a compliant cheaper tier', () => {
    const result = resolveModel({
      taskType: 'visual',
      config: {
        models: {
          costPolicy: {
            maxCategory: 'versatile',
          },
        },
      },
    });

    expect(result.model).toBe('claude-sonnet-4.6');
    expect(result.tier).toBe('standard');
    expect(result.source).toBe('task-auto');
    expect(result.policy).toMatchObject({
      action: 'downgraded-to-ceiling',
      originalModel: 'claude-opus-4.6',
      finalModel: 'claude-sonnet-4.6',
    });
    expect(result.fallbackChain).toEqual([
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.4',
      'claude-sonnet-4',
      'gpt-4.1',
    ]);
  });

  it('prefers included same-tier models when requested', () => {
    const result = resolveModel({
      taskType: 'code',
      config: {
        models: {
          costPolicy: {
            maxCategory: 'versatile',
            preferIncluded: false,
          },
        },
      },
      sessionCostPolicy: {
        source: 'command',
        preferIncluded: true,
      },
    });

    expect(result.model).toBe('gpt-4.1');
    expect(result.tier).toBe('standard');
    expect(result.policy).toMatchObject({
      action: 'preferred-included',
      originalModel: 'claude-sonnet-4.6',
      finalModel: 'gpt-4.1',
      appliedPolicy: {
        maxCategory: 'versatile',
        preferIncluded: true,
      },
    });
  });

  it('prunes non-compliant fallback models even when the selected model is allowed', () => {
    const result = resolveModel({
      taskType: 'docs',
      config: {
        models: {
          costPolicy: {
            maxCategory: 'lightweight',
          },
        },
      },
    });

    expect(result.model).toBe('claude-haiku-4.5');
    expect(result.policy?.action).toBe('fallback-chain-pruned');
    expect(result.fallbackChain).toEqual([
      'claude-haiku-4.5',
      'gpt-5.4-mini',
      'gpt-5-mini',
    ]);
  });

  it('gracefully skips policy enforcement for models outside the catalog', () => {
    const result = resolveModel({
      taskType: 'code',
      userOverride: 'custom-model-xyz',
      sessionCostPolicy: { source: 'conversation', maxCategory: 'lightweight' },
    });

    expect(result.model).toBe('custom-model-xyz');
    expect(result.source).toBe('user-override');
    expect(result.policy).toBeUndefined();
  });
});
