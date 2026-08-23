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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { MODEL_CATALOG, DEFAULT_FALLBACK_CHAINS } from '@bradygaster/squad-sdk/config';
import { MODELS } from '@bradygaster/squad-sdk/runtime/constants';

/**
 * Model IDs verified as NOT picker-reachable via the copilot-cli models API
 * (verified 2026-07-04). Guards against reintroduction into fallback chains
 * AND shipped prompt/template assets.
 *
 * NOTE: `claude-opus-4.5` and `claude-opus-4.6-fast` are classified as
 * "live-but-dropped-from-seed" for runtime chain purposes (they are still GA
 * in GitHub's public catalog), so the runtime chain invariants below do NOT
 * require them to be absent from chains. However, templates steering agent
 * spawns toward them will behave unpredictably in practice, so they ARE
 * included here for the template-asset scan that follows.
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
  'claude-opus-4.5',
];

/**
 * The exact set of CLI-reachable seed model IDs.
 * gpt-5.6-sol/terra/luna added 2026-07-13 (env-observed as reachable via
 * Copilot CLI; tamirdresher follow-up request on PR #1444).
 */
const EXPECTED_CATALOG_IDS = [
  'claude-haiku-4.5',
  'claude-opus-5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'claude-sonnet-5',
  'gemini-3.1-pro',
  'gpt-5-mini',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
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

  // ── Ordering invariants (tamirdresher PR #1444 follow-up) ──────────────────
  // Prefer the NEWEST model in each series at [0]. Verified 2026-07-13.

  it('config premium chain[0] is gpt-5.6-sol (GPT-first premium routing)', () => {
    expect(CONFIG_CHAINS.premium[0]).toBe('gpt-5.6-sol');
  });

  it('config standard chain[0] is gpt-5.6-terra (Terra-first standard routing)', () => {
    expect(CONFIG_CHAINS.standard[0]).toBe('gpt-5.6-terra');
  });

  it('runtime premium chain[0] is gpt-5.6-sol (GPT-first premium routing)', () => {
    expect(RUNTIME_CHAINS.premium[0]).toBe('gpt-5.6-sol');
  });

  it('runtime standard chain[0] is gpt-5.6-terra (Terra-first standard routing)', () => {
    expect(RUNTIME_CHAINS.standard[0]).toBe('gpt-5.6-terra');
  });

  // ── GPT-5.6 catalog membership (tamirdresher PR #1444 follow-up) ──────────

  it('MODEL_CATALOG contains gpt-5.6-sol', () => {
    expect(catalogIds.has('gpt-5.6-sol')).toBe(true);
  });

  it('MODEL_CATALOG contains gpt-5.6-terra', () => {
    expect(catalogIds.has('gpt-5.6-terra')).toBe(true);
  });

  it('MODEL_CATALOG contains gpt-5.6-luna', () => {
    expect(catalogIds.has('gpt-5.6-luna')).toBe(true);
  });

  it('gpt-5.6-sol appears in config premium fallback chain', () => {
    expect(CONFIG_CHAINS.premium).toContain('gpt-5.6-sol');
  });

  it('gpt-5.6-sol appears in runtime premium fallback chain', () => {
    expect(RUNTIME_CHAINS.premium).toContain('gpt-5.6-sol');
  });
});

// ---------------------------------------------------------------------------
// Resolve repo root relative to this test file so globs work regardless of
// where vitest is invoked from.
// ---------------------------------------------------------------------------
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('template asset catalog invariants (#1080/#1183)', () => {
  // Scan canonical sources only — not sync targets — to avoid triple-counting
  // the same bug across squad-cli/templates, squad-sdk/templates, .squad-templates.
  const TEMPLATE_GLOBS = [
    '.squad-templates/**/*.md',
    '.squad/skills/**/*.md',
    '.copilot/skills/**/*.md',
  ];

  const templateFiles = TEMPLATE_GLOBS.flatMap(g =>
    globSync(g, { cwd: REPO_ROOT })
  );

  it('no shipped template asset references a dead model ID', () => {
    const violations: string[] = [];
    for (const relPath of templateFiles) {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8');
      for (const deadId of DEAD_MODEL_IDS) {
        // Escape regex metacharacters in the ID (e.g. the dots in "gpt-4.1"),
        // then use a negative lookahead (?![-.\d]) so that "gpt-5" does not
        // match inside "gpt-5-mini" or "gpt-5.4", and "claude-sonnet-4" does
        // not match inside "claude-sonnet-4.5".
        const escaped = deadId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped + '(?![-\\.\\d])', 'g');
        if (pattern.test(content)) {
          violations.push(`${relPath}: contains dead ID "${deadId}"`);
        }
      }
    }
    expect(violations, `Dead model IDs found in shipped template assets`).toEqual([]);
  });
});
