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
} from '@bradygaster/squad-sdk/config';

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
  it('Layer 4: returns default haiku when nothing is set', () => {
    expect(resolveModel({})).toBe('claude-haiku-4.5');
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
  });

  it('returns undefined for unrecognized effort value', () => {
    expect(clampReasoningEffort('turbo', ['low', 'medium', 'high'])).toBeUndefined();
  });

  it('handles model that only supports low', () => {
    expect(clampReasoningEffort('xhigh', ['low'])).toBe('low');
    expect(clampReasoningEffort('low', ['low'])).toBe('low');
  });
});
