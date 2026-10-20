/**
 * Tests for persistent model preference (Layer 0) — the fix for #284.
 *
 * Validates that model preferences written to `.squad/config.json`
 * are correctly read back, merged without clobbering other fields,
 * and that the 5-layer resolveModel() hierarchy works as documented.
 *
 * @module test/model-preference
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readModelPreference,
  readAgentModelOverrides,
  writeModelPreference,
  writeAgentModelOverrides,
  resolveModel,
  readReasoningEffort,
  readAgentReasoningEffortOverrides,
  writeReasoningEffort,
  writeAgentReasoningEffortOverrides,
  resolveReasoningEffort,
  clampReasoningEffort,
  readContextTier,
  readAgentContextTierOverrides,
  writeContextTier,
  writeAgentContextTierOverrides,
  resolveContextTier,
  clampContextTier,
  CATEGORY_ORDER,
  type GitHubModelCategory,
} from '@bradygaster/squad-sdk/config';
import {
  resolveAgentModel,
  resolveModel as centralResolveModel,
  MODEL_RESOLUTION_PRECEDENCE,
  buildCatalogCategoryMap,
  type ModelResolutionOptions,
  type ResolvedModel,
} from '@bradygaster/squad-sdk/agents';
import { MODELS } from '@bradygaster/squad-sdk';

// Temp directory for each test
let squadDir: string;

beforeEach(() => {
  squadDir = mkdtempSync(join(tmpdir(), 'squad-model-pref-'));
});

afterEach(() => {
  rmSync(squadDir, { recursive: true, force: true });
});

// ============================================================================
// readModelPreference
// ============================================================================

describe('readModelPreference', () => {
  it('returns null when config.json does not exist', () => {
    expect(readModelPreference(squadDir)).toBeNull();
  });

  it('returns null when config.json has no defaultModel', () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readModelPreference(squadDir)).toBeNull();
  });

  it('returns null when defaultModel is empty string', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: '' })
    );
    expect(readModelPreference(squadDir)).toBeNull();
  });

  it('returns null when defaultModel is not a string', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 42 })
    );
    expect(readModelPreference(squadDir)).toBeNull();
  });

  it('returns the model when defaultModel is set', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(readModelPreference(squadDir)).toBe('claude-opus-4.6');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(squadDir, 'config.json'), '{ broken json');
    expect(readModelPreference(squadDir)).toBeNull();
  });
});

// ============================================================================
// readAgentModelOverrides
// ============================================================================

describe('readAgentModelOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentModelOverrides(squadDir)).toEqual({});
  });

  it('returns empty object when no overrides field', () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readAgentModelOverrides(squadDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentModelOverrides: {
          fenster: 'claude-sonnet-4.6',
          mcmanus: 'claude-haiku-4.5',
        },
      })
    );
    const overrides = readAgentModelOverrides(squadDir);
    expect(overrides.fenster).toBe('claude-sonnet-4.6');
    expect(overrides.mcmanus).toBe('claude-haiku-4.5');
  });

  it('ignores non-string values in overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentModelOverrides: { fenster: 'claude-sonnet-4.6', bad: 123 },
      })
    );
    const overrides = readAgentModelOverrides(squadDir);
    expect(overrides.fenster).toBe('claude-sonnet-4.6');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeModelPreference
// ============================================================================

describe('writeModelPreference', () => {
  it('creates config.json if missing', () => {
    writeModelPreference(squadDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, platform: 'azure-devops', custom: true })
    );
    writeModelPreference(squadDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.platform).toBe('azure-devops');
    expect(raw.custom).toBe(true);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('removes defaultModel when set to null', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeModelPreference(squadDir, null);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('defaultModel');
  });

  it('overwrites existing defaultModel', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-haiku-4.5' })
    );
    writeModelPreference(squadDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('handles malformed existing config gracefully', () => {
    writeFileSync(join(squadDir, 'config.json'), '{ broken');
    writeModelPreference(squadDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });
});

// ============================================================================
// writeAgentModelOverrides
// ============================================================================

describe('writeAgentModelOverrides', () => {
  it('writes per-agent overrides', () => {
    writeAgentModelOverrides(squadDir, { fenster: 'claude-sonnet-4.6' });
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.agentModelOverrides.fenster).toBe('claude-sonnet-4.6');
  });

  it('removes overrides when set to null', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, agentModelOverrides: { fenster: 'claude-sonnet-4.6' } })
    );
    writeAgentModelOverrides(squadDir, null);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('agentModelOverrides');
  });

  it('removes overrides when set to empty object', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, agentModelOverrides: { fenster: 'claude-sonnet-4.6' } })
    );
    writeAgentModelOverrides(squadDir, {});
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('agentModelOverrides');
  });

  it('merges without clobbering other config fields', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeAgentModelOverrides(squadDir, { fenster: 'claude-sonnet-4.6' });
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.agentModelOverrides.fenster).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// resolveModel — 5-layer hierarchy
// ============================================================================

describe('resolveModel', () => {
  it('Layer 4: returns the quality-first standard default when nothing is set', () => {
    expect(resolveModel({})).toBe(MODELS.FALLBACK_CHAINS.standard[0]);
  });

  it('Layer 3: task model wins over default', () => {
    expect(resolveModel({ taskModel: 'claude-sonnet-4.6' })).toBe('claude-sonnet-4.6');
  });

  it('Layer 2: charter preference wins over task model', () => {
    expect(
      resolveModel({
        charterPreference: 'claude-opus-4.6',
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 1: session directive wins over charter preference', () => {
    expect(
      resolveModel({
        sessionDirective: 'gpt-5.4',
        charterPreference: 'claude-opus-4.6',
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('gpt-5.4');
  });

  it('Layer 0b: persistent config wins over session directive', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveModel({
        squadDir,
        sessionDirective: 'gpt-5.4',
        charterPreference: 'claude-sonnet-4.6',
        taskModel: 'claude-haiku-4.5',
      })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 0a: per-agent override wins over global defaultModel', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultModel: 'claude-opus-4.6',
        agentModelOverrides: { fenster: 'gpt-5.3-codex' },
      })
    );
    expect(
      resolveModel({
        agentName: 'fenster',
        squadDir,
        sessionDirective: 'gpt-5.4',
      })
    ).toBe('gpt-5.3-codex');
  });

  it('Layer 0b: global config used when agent has no per-agent override', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultModel: 'claude-opus-4.6',
        agentModelOverrides: { fenster: 'gpt-5.3-codex' },
      })
    );
    expect(
      resolveModel({
        agentName: 'mcmanus',
        squadDir,
        sessionDirective: 'gpt-5.4',
      })
    ).toBe('claude-opus-4.6');
  });

  it('falls through all layers correctly when no config file exists', () => {
    const nonexistentDir = join(squadDir, 'nonexistent');
    expect(
      resolveModel({
        agentName: 'fenster',
        squadDir: nonexistentDir,
        sessionDirective: null,
        charterPreference: null,
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-sonnet-4.6');
  });

  it('null session directive is treated as absent', () => {
    expect(
      resolveModel({
        sessionDirective: null,
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// Round-trip: write then read
// ============================================================================

describe('round-trip persistence', () => {
  it('writeModelPreference → readModelPreference', () => {
    writeModelPreference(squadDir, 'claude-opus-4.6');
    expect(readModelPreference(squadDir)).toBe('claude-opus-4.6');
  });

  it('write → clear → read returns null', () => {
    writeModelPreference(squadDir, 'claude-opus-4.6');
    writeModelPreference(squadDir, null);
    expect(readModelPreference(squadDir)).toBeNull();
  });

  it('write → overwrite → read returns latest', () => {
    writeModelPreference(squadDir, 'claude-opus-4.6');
    writeModelPreference(squadDir, 'gpt-5.4');
    expect(readModelPreference(squadDir)).toBe('gpt-5.4');
  });

  it('model + agent overrides coexist', () => {
    writeModelPreference(squadDir, 'claude-opus-4.6');
    writeAgentModelOverrides(squadDir, { fenster: 'claude-sonnet-4.6' });
    expect(readModelPreference(squadDir)).toBe('claude-opus-4.6');
    expect(readAgentModelOverrides(squadDir).fenster).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// readReasoningEffort
// ============================================================================

describe('readReasoningEffort', () => {
  it('returns null when config.json does not exist', () => {
    expect(readReasoningEffort(squadDir)).toBeNull();
  });

  it('returns null when config.json has no defaultReasoningEffort', () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readReasoningEffort(squadDir)).toBeNull();
  });

  it('returns the effort when defaultReasoningEffort is set', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'xhigh' })
    );
    expect(readReasoningEffort(squadDir)).toBe('xhigh');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(squadDir, 'config.json'), '{ broken json');
    expect(readReasoningEffort(squadDir)).toBeNull();
  });
});

// ============================================================================
// readAgentReasoningEffortOverrides
// ============================================================================

describe('readAgentReasoningEffortOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentReasoningEffortOverrides(squadDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentReasoningEffortOverrides: {
          fenster: 'xhigh',
          mcmanus: 'low',
        },
      })
    );
    const overrides = readAgentReasoningEffortOverrides(squadDir);
    expect(overrides.fenster).toBe('xhigh');
    expect(overrides.mcmanus).toBe('low');
  });

  it('ignores invalid effort values in overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentReasoningEffortOverrides: { fenster: 'xhigh', bad: 'invalid-effort' },
      })
    );
    const overrides = readAgentReasoningEffortOverrides(squadDir);
    expect(overrides.fenster).toBe('xhigh');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeReasoningEffort
// ============================================================================

describe('writeReasoningEffort', () => {
  it('creates config.json if missing', () => {
    writeReasoningEffort(squadDir, 'xhigh');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultReasoningEffort).toBe('xhigh');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeReasoningEffort(squadDir, 'high');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.defaultReasoningEffort).toBe('high');
  });

  it('removes defaultReasoningEffort when set to null', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'xhigh' })
    );
    writeReasoningEffort(squadDir, null);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('defaultReasoningEffort');
  });

  it('accepts max as a valid effort level', () => {
    writeReasoningEffort(squadDir, 'max');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.defaultReasoningEffort).toBe('max');
    expect(readReasoningEffort(squadDir)).toBe('max');
  });
});

// ============================================================================
// resolveReasoningEffort — layered hierarchy
// ============================================================================

describe('resolveReasoningEffort', () => {
  it('returns undefined when nothing is set', () => {
    expect(resolveReasoningEffort({})).toBeUndefined();
  });

  it('Layer 2: charter preference wins over default', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'high' })
    ).toBe('high');
  });

  it('Layer 1: spawn override wins over charter', () => {
    expect(
      resolveReasoningEffort({
        spawnOverride: 'xhigh',
        charterPreference: 'high',
      })
    ).toBe('xhigh');
  });

  it('Layer 0b: persistent config wins over spawn override', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'medium' })
    );
    expect(
      resolveReasoningEffort({
        squadDir,
        spawnOverride: 'xhigh',
        charterPreference: 'high',
      })
    ).toBe('medium');
  });

  it('Layer 0a: per-agent override wins over global', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultReasoningEffort: 'medium',
        agentReasoningEffortOverrides: { fenster: 'xhigh' },
      })
    );
    expect(
      resolveReasoningEffort({
        agentName: 'fenster',
        squadDir,
        spawnOverride: 'high',
      })
    ).toBe('xhigh');
  });

  it('auto is treated as absent at all layers', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'auto' })
    ).toBeUndefined();

    expect(
      resolveReasoningEffort({ spawnOverride: 'auto', charterPreference: 'high' })
    ).toBe('high');
  });

  it('falls through to charter when config has no effort', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveReasoningEffort({
        squadDir,
        charterPreference: 'xhigh',
      })
    ).toBe('xhigh');
  });

  it('clamps to model max when supportedEfforts provided', () => {
    // GPT-5.5 only supports up to "high"
    expect(
      resolveReasoningEffort({
        charterPreference: 'xhigh',
        supportedEfforts: ['low', 'medium', 'high'],
      })
    ).toBe('high');
  });

  it('passes through when within model capabilities', () => {
    expect(
      resolveReasoningEffort({
        charterPreference: 'high',
        supportedEfforts: ['low', 'medium', 'high', 'xhigh'],
      })
    ).toBe('high');
  });

  it('returns undefined when model has no effort support', () => {
    expect(
      resolveReasoningEffort({
        charterPreference: 'xhigh',
        supportedEfforts: [],
      })
    ).toBeUndefined();
  });

  it('ignores invalid spawnOverride values', () => {
    expect(
      resolveReasoningEffort({ spawnOverride: 'invalid', charterPreference: 'high' })
    ).toBe('high');
  });

  it('ignores invalid charterPreference values', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'turbo' })
    ).toBeUndefined();
  });

  it('ignores invalid persisted defaultReasoningEffort', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'invalid' })
    );
    expect(
      resolveReasoningEffort({
        squadDir,
        charterPreference: 'high',
      })
    ).toBe('high');
  });

  it('ignores all-invalid layers and returns undefined', () => {
    expect(
      resolveReasoningEffort({
        spawnOverride: 'invalid',
        charterPreference: 'auto',
      })
    ).toBeUndefined();
  });
});

// ============================================================================
// clampReasoningEffort
// ============================================================================

describe('clampReasoningEffort', () => {
  it('returns undefined when no effort requested', () => {
    expect(clampReasoningEffort(undefined, ['low', 'medium', 'high'])).toBeUndefined();
  });

  it('returns undefined when model has no effort support', () => {
    expect(clampReasoningEffort('xhigh', undefined)).toBeUndefined();
    expect(clampReasoningEffort('xhigh', [])).toBeUndefined();
  });

  it('passes through when effort is directly supported', () => {
    expect(clampReasoningEffort('high', ['low', 'medium', 'high', 'xhigh'])).toBe('high');
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
  });

  it('clamps xhigh to high when model max is high (GPT-5.5)', () => {
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high'])).toBe('high');
  });

  it('clamps high to medium when model max is medium', () => {
    expect(clampReasoningEffort('high', ['low', 'medium'])).toBe('medium');
  });

  it('clamps xhigh to medium for Claude Sonnet (single-effort models)', () => {
    expect(clampReasoningEffort('xhigh', ['medium'])).toBe('medium');
  });

  it('treats max and xhigh as equivalent', () => {
    // xhigh requested, model supports max
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high', 'max'])).toBe('xhigh');
    // max requested, model supports xhigh
    expect(clampReasoningEffort('max', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
  });

  it('passes through max when model directly supports max', () => {
    expect(clampReasoningEffort('max', ['low', 'medium', 'high', 'max'])).toBe('max');
  });

  it('clamps max to xhigh for models that use that name at the top tier', () => {
    expect(clampReasoningEffort('max', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
  });

  it('returns undefined for unrecognized effort value', () => {
    expect(clampReasoningEffort('turbo', ['low', 'medium', 'high'])).toBeUndefined();
  });

  it('handles model that only supports low', () => {
    expect(clampReasoningEffort('xhigh', ['low'])).toBe('low');
    expect(clampReasoningEffort('low', ['low'])).toBe('low');
  });

  it('clamps UP to model minimum when requested is below supported range', () => {
    // Model only supports [high] — requesting "low" clamps up to "high"
    expect(clampReasoningEffort('low', ['high'])).toBe('high');
    // Model only supports [medium, high] — requesting "low" clamps up to "medium"
    expect(clampReasoningEffort('low', ['medium', 'high'])).toBe('medium');
  });
});

// ============================================================================
// readContextTier
// ============================================================================

describe('readContextTier', () => {
  it('returns null when config.json does not exist', () => {
    expect(readContextTier(squadDir)).toBeNull();
  });

  it('returns null when config.json has no defaultContextTier', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1 })
    );
    expect(readContextTier(squadDir)).toBeNull();
  });

  it('returns the tier when defaultContextTier is set', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'long_context' })
    );
    expect(readContextTier(squadDir)).toBe('long_context');
  });

  it('returns "auto" when persisted (sentinel is readable)', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'auto' })
    );
    expect(readContextTier(squadDir)).toBe('auto');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(squadDir, 'config.json'), '{ broken json');
    expect(readContextTier(squadDir)).toBeNull();
  });
});

// ============================================================================
// readAgentContextTierOverrides
// ============================================================================

describe('readAgentContextTierOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentContextTierOverrides(squadDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: {
          fenster: 'long_context',
          mcmanus: 'default',
        },
      })
    );
    const overrides = readAgentContextTierOverrides(squadDir);
    expect(overrides.fenster).toBe('long_context');
    expect(overrides.mcmanus).toBe('default');
  });

  it('drops "auto" and invalid values in overrides', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: {
          fenster: 'long_context',
          keaton: 'auto',
          bad: 'invalid-tier',
        },
      })
    );
    const overrides = readAgentContextTierOverrides(squadDir);
    expect(overrides.fenster).toBe('long_context');
    expect(overrides).not.toHaveProperty('keaton');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeContextTier
// ============================================================================

describe('writeContextTier', () => {
  it('creates config.json if missing', () => {
    writeContextTier(squadDir, 'long_context');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultContextTier).toBe('long_context');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeContextTier(squadDir, 'long_context');
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.defaultContextTier).toBe('long_context');
  });

  it('removes defaultContextTier when set to null', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'long_context' })
    );
    writeContextTier(squadDir, null);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('defaultContextTier');
  });

  it('does not write an invalid tier', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeContextTier(squadDir, 'invalid-tier' as never);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('defaultContextTier');
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });
});

// ============================================================================
// writeAgentContextTierOverrides
// ============================================================================

describe('writeAgentContextTierOverrides', () => {
  it('creates config.json with overrides', () => {
    writeAgentContextTierOverrides(squadDir, { fenster: 'long_context' });
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw.agentContextTierOverrides.fenster).toBe('long_context');
  });

  it('removes the field when set to null', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    writeAgentContextTierOverrides(squadDir, null);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('agentContextTierOverrides');
  });

  it('removes the field when given an empty object', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    writeAgentContextTierOverrides(squadDir, {});
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('agentContextTierOverrides');
  });

  it('keeps valid entries and drops invalid ones', () => {
    writeAgentContextTierOverrides(squadDir, {
      fenster: 'long_context',
      bad: 'invalid-tier' as never,
    });
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf8'));
    expect(raw.agentContextTierOverrides.fenster).toBe('long_context');
    expect(raw.agentContextTierOverrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// resolveContextTier
// ============================================================================

describe('resolveContextTier', () => {
  it('returns undefined when nothing is set', () => {
    expect(resolveContextTier({})).toBeUndefined();
  });

  it('Layer 2: charter preference wins over default', () => {
    expect(
      resolveContextTier({ charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('Layer 1: spawn override wins over charter', () => {
    expect(
      resolveContextTier({
        spawnOverride: 'long_context',
        charterPreference: 'default',
      })
    ).toBe('long_context');
  });

  it('Layer 0b: persistent config wins over spawn override', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'default' })
    );
    expect(
      resolveContextTier({
        squadDir,
        spawnOverride: 'long_context',
        charterPreference: 'long_context',
      })
    ).toBe('default');
  });

  it('Layer 0a: per-agent override wins over global', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultContextTier: 'default',
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    expect(
      resolveContextTier({
        agentName: 'fenster',
        squadDir,
        spawnOverride: 'default',
      })
    ).toBe('long_context');
  });

  it('auto is treated as absent at all layers', () => {
    expect(
      resolveContextTier({ charterPreference: 'auto' })
    ).toBeUndefined();

    expect(
      resolveContextTier({ spawnOverride: 'auto', charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('falls through to charter when config has no tier', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveContextTier({
        squadDir,
        charterPreference: 'long_context',
      })
    ).toBe('long_context');
  });

  it('clamps to fallback when requested tier is unsupported', () => {
    // Model only supports the default tier — requesting long_context clamps to default
    expect(
      resolveContextTier({
        charterPreference: 'long_context',
        supportedContextTiers: ['default'],
      })
    ).toBe('default');
  });

  it('passes through when within model capabilities', () => {
    expect(
      resolveContextTier({
        charterPreference: 'long_context',
        supportedContextTiers: ['default', 'long_context'],
      })
    ).toBe('long_context');
  });

  it('ignores invalid spawnOverride values', () => {
    expect(
      resolveContextTier({ spawnOverride: 'invalid', charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('ignores invalid charterPreference values', () => {
    expect(
      resolveContextTier({ charterPreference: 'turbo' })
    ).toBeUndefined();
  });

  it('ignores invalid persisted defaultContextTier', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'invalid' })
    );
    expect(
      resolveContextTier({
        squadDir,
        charterPreference: 'long_context',
      })
    ).toBe('long_context');
  });

  it('ignores all-invalid layers and returns undefined', () => {
    expect(
      resolveContextTier({
        spawnOverride: 'invalid',
        charterPreference: 'auto',
      })
    ).toBeUndefined();
  });
});

// ============================================================================
// clampContextTier
// ============================================================================

describe('clampContextTier', () => {
  it('returns undefined when no tier requested', () => {
    expect(clampContextTier(undefined, ['default', 'long_context'])).toBeUndefined();
  });

  it('trusts a valid request when model support is unknown', () => {
    expect(clampContextTier('long_context', undefined)).toBe('long_context');
    expect(clampContextTier('long_context', [])).toBe('long_context');
  });

  it('passes through when tier is directly supported', () => {
    expect(clampContextTier('default', ['default', 'long_context'])).toBe('default');
    expect(clampContextTier('long_context', ['default', 'long_context'])).toBe('long_context');
  });

  it('clamps to default when requested tier is unsupported', () => {
    expect(clampContextTier('long_context', ['default'])).toBe('default');
  });

  it('clamps to the model default when provided', () => {
    // long_context unsupported, model default is explicitly "default"
    expect(clampContextTier('long_context', ['default'], 'default')).toBe('default');
  });

  it('returns fallback for an unrecognized tier value', () => {
    expect(clampContextTier('turbo', ['default', 'long_context'])).toBe('default');
  });
});

// ============================================================================
// Central model resolver (agents/model-selector) — #1720
// ============================================================================

describe('central resolver: config, session, fallback sources + rationale (#1720)', () => {
  type Opts = ModelResolutionOptions;
  const describeCall = (opts: Opts) =>
    `resolveAgentModel(${JSON.stringify(opts, (_k, v) => (v instanceof Set ? [...v] : v))})`;

  function expectResolution(opts: Opts, model: string, source: string): ResolvedModel {
    const result = resolveAgentModel(opts);
    expect(
      { model: result.model, source: result.source },
      `${describeCall(opts)} should pick '${model}' from '${source}', got '${result.model}' from '${result.source}'`,
    ).toEqual({ model, source });
    expect(
      typeof result.rationale === 'string' && result.rationale.length > 0,
      `${describeCall(opts)} returned no rationale`,
    ).toBe(true);
    return result;
  }

  it('exports the documented precedence order', () => {
    expect(
      [...MODEL_RESOLUTION_PRECEDENCE],
      'MODEL_RESOLUTION_PRECEDENCE must be user-override > config > session > charter > task-auto > default',
    ).toEqual(['user-override', 'config', 'session', 'charter', 'task-auto', 'default']);
  });

  it('config source: persistent .squad/config.json model wins over session, charter and task', () => {
    const r = expectResolution(
      { configModel: 'cfg-model', sessionModel: 'sess-model', charterPreference: 'charter-model', taskType: 'code' },
      'cfg-model',
      'config',
    );
    expect(r.rationale, `config rationale should name the model and config file: '${r.rationale}'`).toMatch(
      /config\.json.*'cfg-model'/,
    );
  });

  it('session source: session model wins over charter and task', () => {
    const r = expectResolution(
      { sessionModel: 'sess-model', charterPreference: 'charter-model', taskType: 'visual' },
      'sess-model',
      'session',
    );
    expect(r.rationale, `session rationale should say the model is inherited: '${r.rationale}'`).toMatch(
      /session model 'sess-model' inherited/,
    );
  });

  it('user-override still beats config and session', () => {
    expectResolution(
      { userOverride: 'spawn-model', configModel: 'cfg-model', sessionModel: 'sess-model' },
      'spawn-model',
      'user-override',
    );
  });

  it('applies every precedence layer in order as higher layers are removed', () => {
    const full: Opts = {
      userOverride: 'L-user',
      configModel: 'L-config',
      sessionModel: 'L-session',
      charterPreference: 'L-charter',
      taskType: 'code',
    };
    const keys: (keyof Opts)[] = ['userOverride', 'configModel', 'sessionModel', 'charterPreference', 'taskType'];
    const observed: string[] = [];
    const opts: Opts = { ...full };
    for (const key of [...keys, undefined]) {
      const result = resolveAgentModel(opts);
      observed.push(`${result.source}`);
      expect(result.rationale, `${describeCall(opts)} returned no rationale`).toBeTruthy();
      if (key) delete opts[key];
    }
    expect(observed, `sources observed while peeling layers off ${JSON.stringify(full)}`).toEqual([
      ...MODEL_RESOLUTION_PRECEDENCE,
    ]);
  });

  it("'auto' at config or session means no preference and falls through", () => {
    expectResolution({ configModel: 'auto', sessionModel: 'auto', charterPreference: 'charter-model' }, 'charter-model', 'charter');
  });

  it('session inheritance: every sub-agent spawn inherits the session model, whatever its charter or task', () => {
    const sessionModel = 'hydrafusion';
    const spawns: Opts[] = [
      { charterPreference: 'auto', taskType: 'docs' },
      { charterPreference: 'gpt-5.6-sol', taskType: 'visual' },
      { taskType: 'code', economyMode: true },
      { taskType: 'mechanical' },
      {},
    ];
    for (const spawn of spawns) {
      expectResolution({ ...spawn, sessionModel }, sessionModel, 'session');
    }
  });

  it('task-auto and default results carry a rationale', () => {
    const task = expectResolution({ taskType: 'mechanical' }, MODELS.FALLBACK_CHAINS.fast[0], 'task-auto');
    expect(task.rationale, `task-auto rationale should name the task type: '${task.rationale}'`).toMatch(/mechanical task/);
    const def = expectResolution({}, MODELS.FALLBACK_CHAINS.standard[0], 'default');
    expect(def.rationale, `default rationale should say nothing matched: '${def.rationale}'`).toMatch(/default/);
  });

  it('fallback source: an unavailable chosen model is replaced by the next available chain entry', () => {
    const chain = MODELS.FALLBACK_CHAINS.standard;
    const opts: Opts = { charterPreference: chain[0], unavailableModels: [chain[0], chain[1]] };
    const r = expectResolution(opts, chain[2], 'fallback');
    expect(r.fallbackFrom, `${describeCall(opts)} should record what it fell back from`).toEqual({
      model: chain[0],
      source: 'charter',
    });
    expect(r.rationale, `fallback rationale should name the unavailable model: '${r.rationale}'`).toContain(
      `'${chain[0]}' (charter) unavailable`,
    );
  });

  it('fallback source: an exhausted chain asks the caller to omit the model parameter', () => {
    const chain = MODELS.FALLBACK_CHAINS.fast;
    const opts: Opts = { taskType: 'mechanical', unavailableModels: [...chain] };
    const r = resolveAgentModel(opts);
    expect(
      { source: r.source, omitModel: r.omitModel, model: r.model },
      `${describeCall(opts)} should signal omit-model fallback`,
    ).toEqual({ source: 'fallback', omitModel: true, model: '' });
  });

  it('available models are not touched by the fallback step', () => {
    expectResolution({ sessionModel: 'sess-model', unavailableModels: ['other-model'] }, 'sess-model', 'session');
  });
});

// ============================================================================
// Central resolver revision: forward fallback, sentinel, legacy adapter (#1720)
// ============================================================================

describe('central resolver: forward fallback from the chosen chain position (#1720)', () => {
  const chain = MODELS.FALLBACK_CHAINS.standard;

  it('a middle-chain pick falls forward to the next available candidate, never back to the head', () => {
    const opts: ModelResolutionOptions = { charterPreference: chain[2], taskType: 'code', unavailableModels: [chain[2]] };
    const r = resolveAgentModel(opts);
    expect(
      { model: r.model, source: r.source },
      `resolveModel(charterPreference=${chain[2]}, unavailable=[${chain[2]}]) must pick next candidate ${chain[3]}, got '${r.model}' (${r.source})`,
    ).toEqual({ model: chain[3], source: 'fallback' });
    expect(r.fallbackChain[0], `fallbackChain must start at the chosen fallback '${chain[3]}'`).toBe(chain[3]);
  });

  it('skips unavailable subsequent candidates and keeps searching forward', () => {
    const opts: ModelResolutionOptions = { charterPreference: chain[1], taskType: 'code', unavailableModels: [chain[1], chain[2]] };
    const r = resolveAgentModel(opts);
    expect(r.model, `charter ${chain[1]} with ${chain[1]},${chain[2]} unavailable must pick ${chain[3]}, got '${r.model}'`).toBe(chain[3]);
  });

  it('the last chain entry being unavailable exhausts the chain: omit the model rather than wrapping to the head', () => {
    const last = chain[chain.length - 1]!;
    const r = resolveAgentModel({ charterPreference: last, taskType: 'code', unavailableModels: [last] });
    expect(
      { omitModel: r.omitModel, model: r.model, source: r.source },
      `last-entry '${last}' unavailable must omit the model param, got '${r.model}' omit=${r.omitModel}`,
    ).toEqual({ omitModel: true, model: '', source: 'fallback' });
    expect(r.fallbackFrom, 'exhausted fallback must still record what it fell back from').toEqual({ model: last, source: 'charter' });
  });

  it('an out-of-chain pick searches its tier chain from the head', () => {
    const r = resolveAgentModel({ sessionModel: 'custom-out-of-chain', taskType: 'code', unavailableModels: ['custom-out-of-chain', chain[0]] });
    expect(r.model, `out-of-chain 'custom-out-of-chain' unavailable must pick first available ${chain[1]}, got '${r.model}'`).toBe(chain[1]);
    expect(r.fallbackFrom).toEqual({ model: 'custom-out-of-chain', source: 'session' });
  });
});

describe("central resolver: 'auto' sentinel at every layer (#1720)", () => {
  it("userOverride 'auto' means no preference and falls through to config", () => {
    const opts: ModelResolutionOptions = { userOverride: 'auto', configModel: 'saved-model', taskType: 'docs' };
    const r = resolveAgentModel(opts);
    expect(
      { model: r.model, source: r.source },
      `resolveModel(${JSON.stringify(opts)}) must skip the 'auto' override; got '${r.model}' (${r.source})`,
    ).toEqual({ model: 'saved-model', source: 'config' });
  });

  it("'auto' is case- and whitespace-insensitive at every explicit layer", () => {
    const opts: ModelResolutionOptions = {
      userOverride: ' AUTO ',
      configModel: 'Auto',
      sessionModel: 'auto ',
      charterPreference: 'AUTO',
      taskType: 'mechanical',
    };
    const r = resolveAgentModel(opts);
    expect(
      { model: r.model, source: r.source },
      `resolveModel(${JSON.stringify(opts)}) must treat every 'auto' as no preference; got '${r.model}' (${r.source})`,
    ).toEqual({ model: MODELS.FALLBACK_CHAINS.fast[0], source: 'task-auto' });
  });
});

describe('legacy config resolveModel delegates to the central resolver (#1720)', () => {
  it("charter 'auto' with a task model returns the task model, not the literal sentinel", () => {
    const taskModel = MODELS.FALLBACK_CHAINS.fast[0];
    const got = resolveModel({ charterPreference: 'auto', taskModel });
    expect(got, `legacy resolveModel({charterPreference:'auto', taskModel:'${taskModel}'}) returned '${got}'`).toBe(taskModel);
  });

  it("'auto' session directive and config defaultModel fall through", () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1, defaultModel: 'auto', agentModelOverrides: { fenster: 'auto' } }));
    const got = resolveModel({ agentName: 'fenster', squadDir, sessionDirective: 'auto', charterPreference: 'charter-model' });
    expect(got, `legacy resolveModel with every higher layer 'auto' must pick the charter model, got '${got}'`).toBe('charter-model');
  });

  it('agrees with the central resolver for persistent config', () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1, agentModelOverrides: { fenster: 'persisted' } }));
    const legacy = resolveModel({ agentName: 'fenster', squadDir, sessionDirective: 'sess', charterPreference: 'charter' });
    const central = resolveAgentModel({ configModel: 'persisted', sessionModel: 'sess', charterPreference: 'charter', taskType: 'code' });
    expect(legacy, `legacy '${legacy}' must equal central '${central.model}'`).toBe(central.model);
  });
});

describe('documented resolver entry point (#1720)', () => {
  it('@bradygaster/squad-sdk/agents exports resolveAgentModel as the same function as its resolveModel', () => {
    expect(typeof resolveAgentModel, '@bradygaster/squad-sdk/agents must export resolveAgentModel').toBe('function');
    expect(resolveAgentModel, 'resolveAgentModel must be an alias of the agents resolveModel, not a fork').toBe(centralResolveModel);
  });

  it('model-selection-reference names the subpath that exports resolveAgentModel with provenance', async () => {
    const reference = readFileSync(join(import.meta.dirname, '..', '.squad-templates', 'model-selection-reference.md'), 'utf8');
    const match = reference.match(/`resolveAgentModel` (?:from|in) `(@bradygaster\/squad-sdk[^`]*)`/);
    expect(match, 'model-selection-reference.md must name the module that exports resolveAgentModel').toBeTruthy();
    const mod = (await import(match![1]!)) as { resolveAgentModel?: (o: unknown) => unknown };
    expect(typeof mod.resolveAgentModel, `${match![1]} must export resolveAgentModel`).toBe('function');
    const r = mod.resolveAgentModel!({ taskType: 'docs', charterPreference: 'auto' }) as ResolvedModel;
    expect(
      typeof r === 'object' && r !== null && typeof r.source === 'string' && typeof r.rationale === 'string',
      `${match![1]} resolveAgentModel must return {model, source, rationale}; got ${JSON.stringify(r)}`,
    ).toBe(true);
  });
});

describe('cost policy composes with forward-only availability fallback (#1720)', () => {
  const versatile = { costPolicy: { maxCategory: 'versatile' as const } };
  const chain = MODELS.FALLBACK_CHAINS.standard;

  it('explicit over-ceiling pick that is unavailable never falls back to an earlier chain entry', () => {
    const opts: ModelResolutionOptions = { userOverride: 'gpt-5.4', config: versatile, unavailableModels: ['gpt-5.4'] };
    const r = resolveAgentModel(opts);
    const earlier = chain.slice(0, chain.indexOf('gpt-5.4'));
    expect(earlier, `${JSON.stringify(opts)} chose '${r.model}', which precedes 'gpt-5.4' in ${JSON.stringify(chain)}`).not.toContain(r.model);
    // Every entry after 'gpt-5.4' is over the versatile ceiling, so the forward
    // search exhausts and omits the model rather than stepping back to the head.
    expect(
      { model: r.model, source: r.source, omitModel: r.omitModel, fallbackFrom: r.fallbackFrom },
      `${JSON.stringify(opts)} must not wrap back past 'gpt-5.4' in ${JSON.stringify(chain)}`,
    ).toEqual({ model: '', source: 'fallback', omitModel: true, fallbackFrom: { model: 'gpt-5.4', source: 'user-override' } });
    expect(r.policy?.action).toBe('warn-allow-explicit');
  });

  it('explicit over-ceiling pick with every later in-ceiling entry unavailable omits the model instead of wrapping', () => {
    const opts: ModelResolutionOptions = {
      userOverride: 'gpt-5.4', config: versatile, unavailableModels: ['gpt-5.4', 'claude-sonnet-4.5'],
    };
    const r = resolveAgentModel(opts);
    expect({ model: r.model, omitModel: r.omitModel }, `${JSON.stringify(opts)} chose '${r.model}'`).toEqual({ model: '', omitModel: true });
  });

  it('session over-ceiling pick keeps the forward cursor under a session cost policy', () => {
    const opts: ModelResolutionOptions = {
      sessionModel: 'gpt-5.5', sessionCostPolicy: { maxCategory: 'versatile' }, unavailableModels: ['gpt-5.5'],
    };
    const r = resolveAgentModel(opts);
    const earlier = chain.slice(0, chain.indexOf('gpt-5.5'));
    expect(earlier, `${JSON.stringify(opts)} chose '${r.model}', which precedes 'gpt-5.5'`).not.toContain(r.model);
    expect({ model: r.model, source: r.source }, `${JSON.stringify(opts)} chose '${r.model}'`).toEqual({ model: '', source: 'fallback' });
  });

  it('within-ceiling pick that is unavailable moves forward over pruned entries', () => {
    // gemini-3.8-flash (versatile) follows gpt-5.6-luna in the fast chain and is pruned by a lightweight ceiling.
    const opts: ModelResolutionOptions = {
      userOverride: 'gpt-5.6-luna', config: { costPolicy: { maxCategory: 'lightweight' } }, unavailableModels: ['gpt-5.6-luna'],
    };
    const r = resolveAgentModel(opts);
    expect({ model: r.model, source: r.source }, `${JSON.stringify(opts)} chose '${r.model}'`).toEqual({ model: 'claude-haiku-4.5', source: 'fallback' });
  });
});

describe('availability fallback respects the active cost ceiling (#1720)', () => {
  const standard = MODELS.FALLBACK_CHAINS.standard;
  const fast = MODELS.FALLBACK_CHAINS.fast;
  const ceilingSources = [
    { label: 'config.costPolicy', policy: (maxCategory: GitHubModelCategory) => ({ config: { costPolicy: { maxCategory } } }) },
    { label: 'sessionCostPolicy', policy: (maxCategory: GitHubModelCategory) => ({ sessionCostPolicy: { maxCategory } }) },
  ] as const;
  const categories = buildCatalogCategoryMap();
  const overCeiling = (ids: readonly string[], ceiling: GitHubModelCategory) =>
    ids.filter((id) => {
      const cat = categories.get(id);
      return cat !== undefined && CATEGORY_ORDER[cat] > CATEGORY_ORDER[ceiling];
    });

  for (const { label, policy } of ceilingSources) {
    it(`[${label}] available out-of-catalog 'hydrafusion' is still honored unchanged under a lightweight ceiling`, () => {
      const opts: ModelResolutionOptions = { sessionModel: 'hydrafusion', taskType: 'code', ...policy('lightweight') };
      const r = resolveAgentModel(opts);
      expect(
        { model: r.model, source: r.source, omitModel: r.omitModel },
        `${JSON.stringify(opts)} (ceiling lightweight via ${label}) picked '${r.model}' (${r.source}); explicit opt-in must pass through`,
      ).toEqual({ model: 'hydrafusion', source: 'session', omitModel: undefined });
    });

    it(`[${label}] unavailable 'hydrafusion' with no in-ceiling chain entry omits the model instead of exceeding a lightweight ceiling`, () => {
      const opts: ModelResolutionOptions = {
        sessionModel: 'hydrafusion', taskType: 'code', unavailableModels: ['hydrafusion'], ...policy('lightweight'),
      };
      const r = resolveAgentModel(opts);
      expect(
        { model: r.model, omitModel: r.omitModel, source: r.source, fallbackFrom: r.fallbackFrom },
        `${JSON.stringify(opts)} (ceiling lightweight via ${label}) picked '${r.model}' (category ${categories.get(r.model) ?? 'none'}); ` +
          'an automatic fallback must not exceed the ceiling',
      ).toEqual({ model: '', omitModel: true, source: 'fallback', fallbackFrom: { model: 'hydrafusion', source: 'session' } });
    });

    it(`[${label}] unavailable explicit out-of-catalog pick skips over-ceiling entries and lands on an allowed later entry`, () => {
      // lightweight ceiling: gemini-3.8-flash (versatile) must be skipped, not chosen, after the earlier lightweight entries are unavailable.
      const unavailable = ['custom-mini', ...fast.slice(0, fast.indexOf('gemini-3.8-flash'))];
      const opts: ModelResolutionOptions = {
        userOverride: 'custom-mini', unavailableModels: unavailable, ...policy('lightweight'),
      };
      const r = resolveAgentModel(opts);
      const picked = categories.get(r.model);
      expect(
        { model: r.model, source: r.source },
        `${JSON.stringify(opts)} (ceiling lightweight via ${label}) picked '${r.model}' (category ${picked ?? 'none'})`,
      ).toEqual({ model: 'claude-haiku-4.5', source: 'fallback' });
      expect(
        overCeiling(r.fallbackChain, 'lightweight'),
        `${JSON.stringify(opts)} (ceiling lightweight via ${label}) left over-ceiling entries in fallbackChain ${JSON.stringify(r.fallbackChain)}`,
      ).toEqual([]);
    });

    it(`[${label}] unavailable fast-tier out-of-catalog pick falls back to an in-ceiling lightweight entry`, () => {
      const opts: ModelResolutionOptions = {
        configModel: 'custom-mini', unavailableModels: ['custom-mini'], ...policy('lightweight'),
      };
      const r = resolveAgentModel(opts);
      expect(
        { model: r.model, source: r.source },
        `${JSON.stringify(opts)} (ceiling lightweight via ${label}) picked '${r.model}' (category ${categories.get(r.model) ?? 'none'})`,
      ).toEqual({ model: fast[0], source: 'fallback' });
    });
  }

  it('without a cost policy the out-of-catalog availability fallback is unchanged', () => {
    // 'hydrafusion' is a catalog entry since #2014; use a truly out-of-catalog id.
    const opts: ModelResolutionOptions = { sessionModel: 'custom-preview-model', taskType: 'code', unavailableModels: ['custom-preview-model'] };
    const r = resolveAgentModel(opts);
    expect({ model: r.model, source: r.source }, `${JSON.stringify(opts)} picked '${r.model}'`).toEqual({ model: standard[0], source: 'fallback' });
  });
});
