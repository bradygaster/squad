/**
 * Catalog refresh invariants (issue #1080 / #1183).
 *
 * Guards against stale/dead model IDs leaking into the fallback chains and
 * ensures every ID referenced by a fallback chain actually exists in the
 * MODEL_CATALOG. Covers BOTH chain sources: the SDK config chains
 * (DEFAULT_FALLBACK_CHAINS in config/models.ts) and the runtime chains
 * (MODELS.FALLBACK_CHAINS in runtime/constants.ts).
 *
 * @module test/catalog-refresh
 */

import { describe, it, expect } from 'vitest';
import { MODEL_CATALOG, DEFAULT_FALLBACK_CHAINS } from '@bradygaster/squad-sdk/config';
import { MODELS } from '@bradygaster/squad-sdk/runtime/constants';

/**
 * Model IDs verified as NOT picker-reachable via the copilot-cli models API
 * (verified 2026-07-04). Guards against reintroduction into fallback chains.
 *
 * NOTE: this list is deliberately NOT a superset of every ID this PR dropped.
 * Live-but-dropped-from-seed IDs (e.g. `claude-opus-4.5`, still GA + priced in
 * GitHub's public catalog, merely superseded in our seed) are intentionally
 * excluded here — they are not "dead" — and are instead covered by the
 * exact-catalog invariant below.
 */
const DEAD_MODEL_IDS = [
  'gpt-4.1',
  'gpt-5',
  'gemini-3-pro-preview',
  'claude-sonnet-4',
  'gpt-5.1',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'claude-opus-4.6-fast',
];

/**
 * The exact set of CLI-reachable seed model IDs (verified 2026-07-04). A
 * positive invariant: any unexpected reintroduction — including live-but-dropped
 * IDs like `claude-opus-4.5` — fails immediately, which a blocklist alone cannot
 * guarantee.
 */
const EXPECTED_CATALOG_IDS = [
  'claude-haiku-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'claude-sonnet-5',
  'gemini-2.5-pro',
  'gpt-5-mini',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
];

const CONFIG_CHAINS = DEFAULT_FALLBACK_CHAINS as Record<string, string[]>;
const RUNTIME_CHAINS = MODELS.FALLBACK_CHAINS as Record<string, string[]>;

describe('catalog refresh invariants (#1080/#1183)', () => {
  const catalogIds = new Set(MODEL_CATALOG.map(m => m.id));

  it('config fallback chains contain no dead/stale model IDs', () => {
    for (const [tier, chain] of Object.entries(CONFIG_CHAINS)) {
      for (const id of chain) {
        expect(DEAD_MODEL_IDS, `config chain "${tier}" must not contain dead ID "${id}"`).not.toContain(id);
      }
    }
  });

  it('runtime fallback chains contain no dead/stale model IDs', () => {
    for (const [tier, chain] of Object.entries(RUNTIME_CHAINS)) {
      for (const id of chain) {
        expect(DEAD_MODEL_IDS, `runtime chain "${tier}" must not contain dead ID "${id}"`).not.toContain(id);
      }
    }
  });

  it('every ID in every config fallback chain exists in MODEL_CATALOG', () => {
    for (const [tier, chain] of Object.entries(CONFIG_CHAINS)) {
      for (const id of chain) {
        expect(catalogIds.has(id), `config chain "${tier}" references unknown model "${id}"`).toBe(true);
      }
    }
  });

  it('every ID in every runtime fallback chain exists in MODEL_CATALOG', () => {
    for (const [tier, chain] of Object.entries(RUNTIME_CHAINS)) {
      for (const id of chain) {
        expect(catalogIds.has(id), `runtime chain "${tier}" references unknown model "${id}"`).toBe(true);
      }
    }
  });

  it('no MODEL_CATALOG entry is a known dead ID', () => {
    for (const model of MODEL_CATALOG) {
      expect(DEAD_MODEL_IDS, `catalog must not contain dead ID "${model.id}"`).not.toContain(model.id);
    }
  });

  it('MODEL_CATALOG ID set exactly equals the expected curated seed set', () => {
    const actual = [...catalogIds].sort();
    const expected = [...EXPECTED_CATALOG_IDS].sort();
    expect(actual).toEqual(expected);
  });
});
