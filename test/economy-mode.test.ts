/**
 * Tests for economy mode model selection (issue #500).
 *
 * Validates that when economy mode is active:
 *   - Layer 3 (task-aware) and Layer 4 (default) models are downgraded
 *   - Layer 0–2 (explicit preferences) are never overridden
 *   - config.json read/write round-trips correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveModel,
  readEconomyMode,
  writeEconomyMode,
  applyEconomyMode,
  ECONOMY_MODEL_MAP,
} from '@bradygaster/squad-sdk/config';
import {
  resolveModel as sdkResolveModel,
} from '@bradygaster/squad-sdk/agents';

let squadDir: string;

beforeEach(() => {
  squadDir = mkdtempSync(join(tmpdir(), 'squad-economy-'));
});

afterEach(() => {
  rmSync(squadDir, { recursive: true, force: true });
});

// ============================================================================
// ECONOMY_MODEL_MAP + applyEconomyMode
// ============================================================================

describe('ECONOMY_MODEL_MAP', () => {
  it('maps premium models to standard', () => {
    expect(ECONOMY_MODEL_MAP['claude-opus-4.6']).toBe('claude-sonnet-4.5');
    expect(ECONOMY_MODEL_MAP['claude-opus-4.6-fast']).toBe('claude-sonnet-4.5');
    expect(ECONOMY_MODEL_MAP['claude-opus-4.5']).toBe('claude-sonnet-4.5');
  });

  it('maps standard sonnet models to fast', () => {
    expect(ECONOMY_MODEL_MAP['claude-sonnet-4.6']).toBe('gpt-4.1');
    expect(ECONOMY_MODEL_MAP['claude-sonnet-4.5']).toBe('gpt-4.1');
  });

  it('maps haiku to cheapest fast', () => {
    expect(ECONOMY_MODEL_MAP['claude-haiku-4.5']).toBe('gpt-4.1');
  });
});

describe('applyEconomyMode', () => {
  it('returns economy model for known models', () => {
    expect(applyEconomyMode('claude-opus-4.6')).toBe('claude-sonnet-4.5');
    expect(applyEconomyMode('claude-sonnet-4.6')).toBe('gpt-4.1');
    expect(applyEconomyMode('claude-haiku-4.5')).toBe('gpt-4.1');
  });

  it('returns original model when no economy mapping exists', () => {
    expect(applyEconomyMode('gpt-4.1')).toBe('gpt-4.1');
    expect(applyEconomyMode('gpt-5-mini')).toBe('gpt-5-mini');
    expect(applyEconomyMode('unknown-model-xyz')).toBe('unknown-model-xyz');
  });
});

// ============================================================================
// readEconomyMode / writeEconomyMode
// ============================================================================

describe('readEconomyMode', () => {
  it('returns false when config.json does not exist', () => {
    expect(readEconomyMode(squadDir)).toBe(false);
  });

  it('returns false when economyMode field is absent', () => {
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readEconomyMode(squadDir)).toBe(false);
  });

  it('returns false when economyMode is false', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, economyMode: false })
    );
    expect(readEconomyMode(squadDir)).toBe(false);
  });

  it('returns true when economyMode is true', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, economyMode: true })
    );
    expect(readEconomyMode(squadDir)).toBe(true);
  });

  it('returns false on malformed JSON', () => {
    writeFileSync(join(squadDir, 'config.json'), '{ bad json');
    expect(readEconomyMode(squadDir)).toBe(false);
  });
});

describe('writeEconomyMode', () => {
  it('creates config.json with economyMode: true', () => {
    writeEconomyMode(squadDir, true);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.economyMode).toBe(true);
    expect(raw.version).toBe(1);
  });

  it('removes economyMode field when set to false', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, economyMode: true })
    );
    writeEconomyMode(squadDir, false);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('economyMode');
  });

  it('merges with existing config without clobbering other fields', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeEconomyMode(squadDir, true);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.economyMode).toBe(true);
  });

  it('round-trips: write on → read true', () => {
    writeEconomyMode(squadDir, true);
    expect(readEconomyMode(squadDir)).toBe(true);
  });

  it('round-trips: write off → read false', () => {
    writeEconomyMode(squadDir, true);
    writeEconomyMode(squadDir, false);
    expect(readEconomyMode(squadDir)).toBe(false);
  });
});

// ============================================================================
// resolveModel — economy mode option
// ============================================================================

describe('resolveModel economy mode (option)', () => {
  it('Layer 4 default: uses gpt-4.1 instead of haiku when economyMode: true', () => {
    expect(resolveModel({ economyMode: true })).toBe('gpt-4.1');
  });

  it('Layer 4 default: uses haiku when economyMode: false', () => {
    expect(resolveModel({ economyMode: false })).toBe('claude-haiku-4.5');
  });

  it('Layer 3 code task: uses gpt-4.1 instead of sonnet when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-sonnet-4.6', economyMode: true })).toBe('gpt-4.1');
  });

  it('Layer 3 architecture task: uses sonnet instead of opus when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-opus-4.6', economyMode: true })).toBe('claude-sonnet-4.5');
  });

  it('Layer 3 docs task: uses gpt-4.1 instead of haiku when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-haiku-4.5', economyMode: true })).toBe('gpt-4.1');
  });

  it('Layer 2 charter preference: NOT overridden by economy mode', () => {
    expect(
      resolveModel({ charterPreference: 'claude-opus-4.6', economyMode: true })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 1 session directive: NOT overridden by economy mode', () => {
    expect(
      resolveModel({ sessionDirective: 'claude-opus-4.6', economyMode: true })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 0b global config: NOT overridden by economy mode', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveModel({ squadDir, taskModel: 'claude-sonnet-4.6', economyMode: true })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 0a per-agent override: NOT overridden by economy mode', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentModelOverrides: { eecom: 'claude-opus-4.6' },
      })
    );
    expect(
      resolveModel({ agentName: 'eecom', squadDir, taskModel: 'claude-haiku-4.5', economyMode: true })
    ).toBe('claude-opus-4.6');
  });
});

// ============================================================================
// resolveModel — economy mode from config.json
// ============================================================================

describe('resolveModel economy mode (from config)', () => {
  it('uses economy model when economyMode: true in config', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, economyMode: true })
    );
    expect(resolveModel({ squadDir, taskModel: 'claude-sonnet-4.6' })).toBe('gpt-4.1');
  });

  it('uses normal model when economyMode absent from config', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1 })
    );
    expect(resolveModel({ squadDir, taskModel: 'claude-sonnet-4.6' })).toBe('claude-sonnet-4.6');
  });

  it('explicit economyMode option overrides config setting', () => {
    writeFileSync(
      join(squadDir, 'config.json'),
      JSON.stringify({ version: 1, economyMode: false })
    );
    // Option says true, config says false → option wins
    expect(
      resolveModel({ squadDir, taskModel: 'claude-sonnet-4.6', economyMode: true })
    ).toBe('gpt-4.1');
  });
});

// ============================================================================
// SDK model-selector resolveModel economy mode
// ============================================================================

describe('SDK resolveModel (agents) economy mode', () => {
  it('code task → gpt-4.1 when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'code', economyMode: true });
    expect(result.model).toBe('gpt-4.1');
    expect(result.source).toBe('task-auto');
  });

  it('docs task → gpt-4.1 when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'docs', economyMode: true });
    expect(result.model).toBe('gpt-4.1');
  });

  it('mechanical task → gpt-4.1 when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'mechanical', economyMode: true });
    expect(result.model).toBe('gpt-4.1');
  });

  it('visual task → claude-sonnet-4.5 when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'visual', economyMode: true });
    expect(result.model).toBe('claude-sonnet-4.5');
  });

  it('code task → claude-sonnet-4.6 when economyMode: false', () => {
    const result = sdkResolveModel({ taskType: 'code', economyMode: false });
    expect(result.model).toBe('claude-sonnet-4.6');
  });

  it('user override NOT affected by economy mode', () => {
    const result = sdkResolveModel({
      taskType: 'code',
      userOverride: 'claude-opus-4.6',
      economyMode: true,
    });
    expect(result.model).toBe('claude-opus-4.6');
    expect(result.source).toBe('user-override');
  });

  it('charter preference NOT affected by economy mode', () => {
    const result = sdkResolveModel({
      taskType: 'code',
      charterPreference: 'claude-opus-4.6',
      economyMode: true,
    });
    expect(result.model).toBe('claude-opus-4.6');
    expect(result.source).toBe('charter');
  });
});
