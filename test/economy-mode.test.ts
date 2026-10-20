/**
 * Tests for economy mode model selection (issue #500).
 *
 * Validates that when economy mode is active:
 *   - Layer 3 (task-aware) and Layer 4 (default) models are downgraded
 *   - Layer 0–2 (explicit preferences) are never overridden
 *   - config.json read/write round-trips correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
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
import { runEconomy } from '../packages/squad-cli/src/cli/commands/economy.js';

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
    expect(ECONOMY_MODEL_MAP['gpt-6.1-sol']).toBe('gpt-5.6-terra');
    expect(ECONOMY_MODEL_MAP['gpt-6-sol']).toBe('gpt-5.6-terra');
    expect(ECONOMY_MODEL_MAP['gpt-5.6-sol']).toBe('gpt-5.6-terra');
    expect(ECONOMY_MODEL_MAP['claude-opus-5.5']).toBe('claude-sonnet-5.5');
    expect(ECONOMY_MODEL_MAP['claude-opus-5']).toBe('claude-sonnet-5');
    expect(ECONOMY_MODEL_MAP['claude-opus-4.8']).toBe('claude-sonnet-5');
  });

  it('maps standard sonnet models to fast', () => {
    expect(ECONOMY_MODEL_MAP['claude-sonnet-5.5']).toBe('gpt-5.6-luna');
    expect(ECONOMY_MODEL_MAP['claude-sonnet-5']).toBe('gpt-5.6-luna');
  });

  it('maps Terra to the preferred fast model', () => {
    expect(ECONOMY_MODEL_MAP['gpt-5.6-terra']).toBe('gpt-5.6-luna');
  });

  it('maps haiku to cheapest fast', () => {
    expect(ECONOMY_MODEL_MAP['claude-haiku-5.5']).toBe('gpt-5.6-luna');
    expect(ECONOMY_MODEL_MAP['claude-haiku-4.5']).toBe('gpt-5.6-luna');
  });
});

describe('squad economy status', () => {
  it('shows current economy substitutions and preserves the explicit override notice', async () => {
    const teamDir = join(squadDir, '.squad');
    mkdirSync(teamDir);
    writeFileSync(join(teamDir, 'config.json'), JSON.stringify({ version: 1, economyMode: true }));

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runEconomy(squadDir, []);
      const output = log.mock.calls.map((call) => call.join(' ')).join('\n');

      expect(output).toContain('claude-opus-5.5  → claude-sonnet-5.5');
      expect(output).toContain('gpt-6.1-sol      → gpt-5.6-terra');
      expect(output).toContain('gpt-5.6-terra    → gpt-5.6-luna');
      expect(output).toContain('claude-haiku-5.5 → gpt-5.6-luna');
      expect(output).toContain('Explicit overrides (config.json, charter) are never changed.');

      expect(ECONOMY_MODEL_MAP['claude-opus-5.5']).toBe('claude-sonnet-5.5');
      expect(ECONOMY_MODEL_MAP['gpt-6.1-sol']).toBe('gpt-5.6-terra');
      expect(ECONOMY_MODEL_MAP['gpt-5.6-terra']).toBe('gpt-5.6-luna');
      expect(ECONOMY_MODEL_MAP['claude-haiku-5.5']).toBe('gpt-5.6-luna');
    } finally {
      log.mockRestore();
    }
  });
});

describe('applyEconomyMode', () => {
  it('returns economy model for known models', () => {
    expect(applyEconomyMode('gpt-5.6-sol')).toBe('gpt-5.6-terra');
    expect(applyEconomyMode('claude-opus-5.5')).toBe('claude-sonnet-5.5');
    expect(applyEconomyMode('claude-sonnet-5.5')).toBe('gpt-5.6-luna');
    expect(applyEconomyMode('gpt-5.6-terra')).toBe('gpt-5.6-luna');
    expect(applyEconomyMode('claude-haiku-4.5')).toBe('gpt-5.6-luna');
  });

  it('returns original model when no economy mapping exists', () => {
    expect(applyEconomyMode('gpt-5.6-luna')).toBe('gpt-5.6-luna');
    expect(applyEconomyMode('gpt-5-mini')).toBe('gpt-5-mini');
    expect(applyEconomyMode('unknown-model-xyz')).toBe('unknown-model-xyz');
    // Stale ids are no longer mapped; explicit use passes through unchanged.
    expect(applyEconomyMode('claude-opus-4.6')).toBe('claude-opus-4.6');
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

  it("reports enabled for a persisted modelProfile 'economy' without economyMode", () => {
    const config = { version: 1, modelProfile: 'economy' };
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify(config));
    expect(readEconomyMode(squadDir), `readEconomyMode(${JSON.stringify(config)})`).toBe(true);
  });

  it("economy off clears a persisted modelProfile 'economy' so selection leaves economy", () => {
    const config = { version: 1, modelProfile: 'economy', defaultModel: 'auto' };
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify(config));
    writeEconomyMode(squadDir, false);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    const label = `after writeEconomyMode(false) on ${JSON.stringify(config)} → ${JSON.stringify(raw)}`;
    expect(raw.modelProfile, label).toBeUndefined();
    expect(raw.defaultModel, label).toBe('auto');
    expect(readEconomyMode(squadDir), label).toBe(false);
    expect(resolveModel({ squadDir }), label).toBe(sdkResolveModel({}).model);
  });

  it('economy off keeps a non-economy modelProfile', () => {
    const config = { version: 1, economyMode: true, modelProfile: 'balanced' };
    writeFileSync(join(squadDir, 'config.json'), JSON.stringify(config));
    writeEconomyMode(squadDir, false);
    const raw = JSON.parse(readFileSync(join(squadDir, 'config.json'), 'utf-8'));
    const label = `after writeEconomyMode(false) on ${JSON.stringify(config)} → ${JSON.stringify(raw)}`;
    expect(raw.modelProfile, label).toBe('balanced');
    expect(raw.economyMode, label).toBeUndefined();
  });
});

// ============================================================================
// resolveModel — economy mode option
// ============================================================================

describe('resolveModel economy mode (option)', () => {
  it('Layer 4 default: uses Luna instead of haiku when economyMode: true', () => {
    expect(resolveModel({ economyMode: true })).toBe('gpt-5.6-luna');
  });

  it('Layer 4 default: uses the quality-first standard default when economyMode: false', () => {
    expect(resolveModel({ economyMode: false })).toBe('claude-sonnet-5.5');
  });

  it('Layer 3 code task: uses Luna instead of sonnet when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-sonnet-5.5', economyMode: true })).toBe('gpt-5.6-luna');
  });

  it('Layer 3 architecture task: uses sonnet instead of opus when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-opus-5.5', economyMode: true })).toBe('claude-sonnet-5.5');
  });

  it('Layer 3 docs task: uses Luna instead of haiku when economyMode: true', () => {
    expect(resolveModel({ taskModel: 'claude-haiku-4.5', economyMode: true })).toBe('gpt-5.6-luna');
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
    expect(resolveModel({ squadDir, taskModel: 'claude-sonnet-5.5' })).toBe('gpt-5.6-luna');
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
      resolveModel({ squadDir, taskModel: 'claude-sonnet-5.5', economyMode: true })
    ).toBe('gpt-5.6-luna');
  });
});

// ============================================================================
// SDK model-selector resolveModel economy mode
// ============================================================================

describe('SDK resolveModel (agents) economy mode', () => {
  it('code task → Luna when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'code', economyMode: true });
    expect(result.model).toBe('gpt-5.6-luna');
    expect(result.source).toBe('task-auto');
  });

  it('docs task → Luna when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'docs', economyMode: true });
    expect(result.model).toBe('gpt-5.6-luna');
  });

  it('mechanical task → Luna when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'mechanical', economyMode: true });
    expect(result.model).toBe('gpt-5.6-luna');
  });

  it('visual task → standard Sonnet 5.5 (not premium) when economyMode: true', () => {
    const result = sdkResolveModel({ taskType: 'visual', economyMode: true });
    expect(result.model).toBe('claude-sonnet-5.5');
  });

  it('code task → standard chain head when economyMode: false', () => {
    const result = sdkResolveModel({ taskType: 'code', economyMode: false });
    expect(result.model).toBe('claude-sonnet-5.5');
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
