/**
 * `squad models refresh` catalog reconciliation tests (issue #1080 / #1183).
 *
 * Covers BOTH sourcing arms — the canonical Copilot models API path and the
 * auth-free public docs-YAML fallback — plus the seed-only degradation. The
 * feature must NEVER hard-fail on the (optional) authenticated API.
 *
 * @module test/models-refresh
 */

import { describe, it, expect } from 'vitest';
import {
  parseApiModels,
  parseDocsYaml,
  refreshModelCatalog,
  enrichWithPricing,
  normalizeDisplayName,
  type RefreshDeps,
} from '../packages/squad-cli/src/cli/commands/models.js';
import type { ModelInfo } from '@bradygaster/squad-sdk/config';

const SEED: ModelInfo[] = [
  { id: 'claude-sonnet-4.6', tier: 'standard', provider: 'anthropic', family: 'claude', githubCategory: 'versatile' },
  { id: 'gpt-5-mini', tier: 'fast', provider: 'openai', family: 'gpt', githubCategory: 'lightweight' },
  { id: 'legacy-dead-model', tier: 'premium', provider: 'openai', family: 'gpt', githubCategory: 'powerful' },
];

const API_JSON = {
  object: 'list',
  data: [
    { id: 'claude-sonnet-4.6', model_picker_category: 'versatile', model_picker_enabled: true },
    { id: 'gpt-5-mini', model_picker_category: 'lightweight', model_picker_enabled: true },
    { id: 'gpt-5.5', model_picker_category: 'powerful', model_picker_enabled: true },
    { id: 'gpt-image-1', model_picker_category: 'powerful', model_picker_enabled: false }, // disabled → excluded
  ],
};

const DOCS_YAML = `# comment
- model: 'GPT-5 mini'
  provider: openai
  release_status: GA
  category: Lightweight
  input: $0.25
  output: $2.00

- model: Claude Sonnet 4.6
  provider: anthropic
  release_status: GA
  category: Versatile
  input: $3.00
  output: $15.00

- model: Some Unlisted Vision Model
  provider: openai
  release_status: Public preview
  category: Powerful
`;

// Real-shaped docs YAML: spaced Claude display names + a footnote-suffixed name.
const DOCS_YAML_REAL = `# github/docs models-and-pricing.yml (shape)
- model: Claude Haiku 4.5
  provider: anthropic
  release_status: GA
  category: Lightweight
  input: $1.00
  output: $5.00

- model: Claude Sonnet 4.6
  provider: anthropic
  release_status: GA
  category: Versatile
  input: $3.00
  output: $15.00

- model: Claude Sonnet 5[^sonnet-5-promo]
  provider: anthropic
  release_status: GA
  category: Powerful
  input: $5.00
  output: $25.00

- model: 'GPT-5 mini'
  provider: openai
  release_status: GA
  category: Lightweight
  input: $0.25
  output: $2.00
`;

// gpt-5.6 fixture — mirrors the live docs YAML two-row format (Default + Long context).
// Asserts that "GPT-5.6 Luna/Sol/Terra" (proper-noun word suffixes) normalize correctly
// to their hyphenated catalog ids via the algorithmic normalizeDisplayName function.
const DOCS_YAML_GPT56 = `# github/docs models-and-pricing.yml (gpt-5.6 section)
- model: GPT-5.6 Luna
  provider: openai
  release_status: GA
  category: Lightweight
  input: $1.00
  output: $6.00

- model: GPT-5.6 Luna
  provider: openai
  release_status: GA
  category: Lightweight
  context_window: Long context
  input: $1.20
  output: $7.20

- model: GPT-5.6 Sol
  provider: openai
  release_status: GA
  category: Powerful
  input: $5.00
  output: $30.00

- model: GPT-5.6 Sol
  provider: openai
  release_status: GA
  category: Powerful
  context_window: Long context
  input: $6.00
  output: $36.00

- model: GPT-5.6 Terra
  provider: openai
  release_status: GA
  category: Versatile
  input: $2.50
  output: $15.00

- model: GPT-5.6 Terra
  provider: openai
  release_status: GA
  category: Versatile
  context_window: Long context
  input: $3.00
  output: $18.00
`;

describe('normalizeDisplayName', () => {
  // Unit tests for the algorithmic docs-name → catalog-id normalization.
  // RED until normalizeDisplayName is exported from models.ts.
  it('lowercases and replaces spaces with hyphens', () => {
    expect(normalizeDisplayName('GPT-5.6 Luna')).toBe('gpt-5.6-luna');
    expect(normalizeDisplayName('GPT-5 mini')).toBe('gpt-5-mini');
    expect(normalizeDisplayName('Claude Haiku 4.5')).toBe('claude-haiku-4.5');
    expect(normalizeDisplayName('Gemini 2.5 Pro')).toBe('gemini-2.5-pro');
    expect(normalizeDisplayName('GPT-5.3-Codex')).toBe('gpt-5.3-codex');
    expect(normalizeDisplayName('GPT-5.6 Sol')).toBe('gpt-5.6-sol');
    expect(normalizeDisplayName('GPT-5.6 Terra')).toBe('gpt-5.6-terra');
  });

  it('strips markdown footnote markers before normalizing', () => {
    expect(normalizeDisplayName('Claude Sonnet 5[^sonnet-5-promo]')).toBe('claude-sonnet-5');
    expect(normalizeDisplayName('GPT-5.4[^note]')).toBe('gpt-5.4');
  });

  it('keeps parenthetical words as hyphenated tokens so different SKUs get distinct ids', () => {
    // Parenthetical qualifier denotes a DIFFERENT product SKU — it must NOT collapse to the
    // base model id. "Claude Opus 4.8 (fast mode) (preview)" and "Claude Opus 4.8" are
    // different rows in the docs YAML; stripping the parenthetical would cause the fast-mode
    // pricing ($10/$50) to overwrite the real model pricing ($5/$25) via last-wins in the Map.
    // Fix: strip `(` and `)` chars but KEEP the words, producing a longer non-matching id.
    expect(normalizeDisplayName('Claude Opus 4.8 (fast mode) (preview)')).toBe('claude-opus-4.8-fast-mode-preview');
    expect(normalizeDisplayName('GPT-5 mini (legacy)')).toBe('gpt-5-mini-legacy');
    // Base model (no parenthetical) still normalizes cleanly to the catalog id
    expect(normalizeDisplayName('Claude Opus 4.8')).toBe('claude-opus-4.8');
  });

  it('collapses multiple spaces to a single hyphen', () => {
    expect(normalizeDisplayName('Claude  Sonnet  4.6')).toBe('claude-sonnet-4.6');
  });
});

describe('parseDocsYaml — parenthetical SKU collision protection', () => {
  // Regression guard: the docs YAML has "Claude Opus 4.8" ($5/$25) AND
  // "Claude Opus 4.8 (fast mode) (preview)" ($10/$50) as separate rows.
  // Both used to normalize to "claude-opus-4.8" (last-wins → wrong price).
  // Now only the base row matches the catalog id; the fast-mode row is harmlessly ignored.
  const OPUS_COLLISION_YAML = `# two rows — only the base one should enrich claude-opus-4.8
- model: Claude Opus 4.8
  provider: anthropic
  release_status: GA
  category: Powerful
  input: $5.00
  output: $25.00

- model: Claude Opus 4.8 (fast mode) (preview)
  provider: anthropic
  release_status: Public preview
  category: Powerful
  input: $10.00
  output: $50.00
`;

  it('base "Claude Opus 4.8" row wins; fast-mode row is harmlessly ignored (non-catalog id)', () => {
    const models = parseDocsYaml(OPUS_COLLISION_YAML);
    // Base row normalizes to catalog id "claude-opus-4.8"
    const base = models.find((m) => m.id === 'claude-opus-4.8');
    expect(base).toBeDefined();
    expect(base!.pricing?.input).toBe('$5.00');
    expect(base!.pricing?.output).toBe('$25.00');
    // Fast-mode row normalizes to "claude-opus-4.8-fast-mode-preview" — not a catalog id
    const fastMode = models.find((m) => m.id === 'claude-opus-4.8-fast-mode-preview');
    expect(fastMode).toBeDefined(); // present in parsed output...
    // ...but enrichWithPricing ignores it because it's not in the API/seed catalog
  });

  it('enrichWithPricing: fast-mode row is filtered out during join (not a catalog id)', () => {
    const apiModels = [
      { id: 'claude-opus-4.8', githubCategory: 'powerful' as const },
    ];
    const docsModels = parseDocsYaml(OPUS_COLLISION_YAML);
    const merged = enrichWithPricing(apiModels, docsModels);
    const opus = merged.find((m) => m.id === 'claude-opus-4.8')!;
    expect(opus.pricing?.input).toBe('$5.00');   // base price, not fast-mode
    expect(opus.pricing?.output).toBe('$25.00');
    // No fast-mode SKU injected into the enriched set
    expect(merged.find((m) => m.id === 'claude-opus-4.8-fast-mode-preview')).toBeUndefined();
  });
});

describe('parseApiModels', () => {
  it('maps id + category and drops picker-disabled models', () => {
    const models = parseApiModels(API_JSON);
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(['claude-sonnet-4.6', 'gpt-5-mini', 'gpt-5.5']);
    expect(ids).not.toContain('gpt-image-1');
    expect(models.find((m) => m.id === 'gpt-5.5')!.githubCategory).toBe('powerful');
  });

  it('returns [] for a malformed response', () => {
    expect(parseApiModels({})).toEqual([]);
    expect(parseApiModels(null)).toEqual([]);
  });
});

describe('parseDocsYaml', () => {
  it('parses category + pricing and best-effort joins names to ids (skips unmatched)', () => {
    const models = parseDocsYaml(DOCS_YAML);
    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-5-mini');
    expect(ids).toContain('claude-sonnet-4.6');
    // unmatched display name is skipped
    expect(ids).not.toContain('Some Unlisted Vision Model');
    const mini = models.find((m) => m.id === 'gpt-5-mini')!;
    expect(mini.githubCategory).toBe('lightweight');
    expect(mini.pricing?.input).toBe('$0.25');
  });

  it('joins spaced Claude display names and strips footnote markers', () => {
    const models = parseDocsYaml(DOCS_YAML_REAL);
    const ids = models.map((m) => m.id);
    // spaced Claude names must resolve to their hyphenated ids
    expect(ids).toContain('claude-haiku-4.5');
    expect(ids).toContain('claude-sonnet-4.6');
    // footnote-suffixed "Claude Sonnet 5[^sonnet-5-promo]" must be stripped and matched
    expect(ids).toContain('claude-sonnet-5');
    const haiku = models.find((m) => m.id === 'claude-haiku-4.5')!;
    expect(haiku.pricing?.input).toBe('$1.00');
    expect(haiku.pricing?.output).toBe('$5.00');
    const sonnet5 = models.find((m) => m.id === 'claude-sonnet-5')!;
    expect(sonnet5.pricing?.input).toBe('$5.00');
  });

  it('maps GPT-5.6 Luna/Sol/Terra display names to their hyphenated catalog ids with pricing', () => {
    // Normalization: "GPT-5.6 Luna" → lowercase + spaces→hyphens → "gpt-5.6-luna".
    // Previously broken when DOCS_NAME_TO_ID had no entries; now algorithmic.
    const models = parseDocsYaml(DOCS_YAML_GPT56);
    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-5.6-luna');
    expect(ids).toContain('gpt-5.6-sol');
    expect(ids).toContain('gpt-5.6-terra');

    const luna = models.find((m) => m.id === 'gpt-5.6-luna')!;
    expect(luna.githubCategory).toBe('lightweight');
    expect(luna.pricing?.input).toBe('$1.00');
    expect(luna.pricing?.output).toBe('$6.00');
    expect(luna.releaseStatus).toBe('GA');

    const sol = models.find((m) => m.id === 'gpt-5.6-sol')!;
    expect(sol.githubCategory).toBe('powerful');
    expect(sol.pricing?.input).toBe('$5.00');
    expect(sol.pricing?.output).toBe('$30.00');

    const terra = models.find((m) => m.id === 'gpt-5.6-terra')!;
    expect(terra.githubCategory).toBe('versatile');
    expect(terra.pricing?.input).toBe('$2.50');
    expect(terra.pricing?.output).toBe('$15.00');
  });
});

describe('refreshModelCatalog — canonical API path', () => {
  it('uses the API when a token is present and diffs against the seed', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      // Enrichment fetch throws here — must be swallowed (fail-open), see below.
      fetchDocsYaml: async () => {
        throw new Error('docs YAML unavailable');
      },
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api');
    expect(result.added).toContain('gpt-5.5'); // new vs seed
    expect(result.removed).toContain('legacy-dead-model'); // seed id no longer reachable
  });
});

describe('enrichWithPricing (pure merge helper)', () => {
  it('attaches pricing + releaseStatus from docs to matching API ids only', () => {
    const apiModels = parseApiModels(API_JSON); // claude-sonnet-4.6, gpt-5-mini, gpt-5.5
    const docsModels = parseDocsYaml(DOCS_YAML); // gpt-5-mini, claude-sonnet-4.6 (with pricing)
    const merged = enrichWithPricing(apiModels, docsModels);

    // API stays authoritative for id/category; docs only supplies pricing.
    const sonnet = merged.find((m) => m.id === 'claude-sonnet-4.6')!;
    expect(sonnet.githubCategory).toBe('versatile'); // from API
    expect(sonnet.pricing?.input).toBe('$3.00'); // from docs
    expect(sonnet.releaseStatus).toBe('GA'); // from docs

    // gpt-5.5 has no docs entry → remains price-less, still present.
    const gpt55 = merged.find((m) => m.id === 'gpt-5.5')!;
    expect(gpt55).toBeDefined();
    expect(gpt55.pricing).toBeUndefined();

    // No ids added beyond what the API returned.
    expect(merged.map((m) => m.id).sort()).toEqual(apiModels.map((m) => m.id).sort());
  });

  it('returns API models unchanged when docs set is empty', () => {
    const apiModels = parseApiModels(API_JSON);
    const merged = enrichWithPricing(apiModels, []);
    expect(merged.map((m) => m.id)).toEqual(apiModels.map((m) => m.id));
    expect(merged.every((m) => m.pricing === undefined)).toBe(true);
  });
});

describe('refreshModelCatalog — pricing enrichment on the API happy path', () => {
  it('enriches API models with docs pricing when both succeed (source stays api)', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      fetchDocsYaml: async () => DOCS_YAML,
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api');
    const mini = result.models.find((m) => m.id === 'gpt-5-mini')!;
    expect(mini.githubCategory).toBe('lightweight'); // API authoritative
    expect(mini.pricing?.input).toBe('$0.25'); // docs enrichment
    expect(mini.pricing?.output).toBe('$2.00');
  });

  it('fails open: enrichment fetch throwing does NOT break the API result', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      fetchDocsYaml: async () => {
        throw new Error('network down during enrichment');
      },
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api'); // catalog still came from the API
    expect(result.models.map((m) => m.id)).toContain('gpt-5-mini');
    expect(result.models.every((m) => m.pricing === undefined)).toBe(true); // no pricing, no crash
  });

  it('enriches only the subset of API ids that docs pricing covers', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      fetchDocsYaml: async () => DOCS_YAML, // covers gpt-5-mini + claude-sonnet-4.6, NOT gpt-5.5
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api');
    expect(result.models.find((m) => m.id === 'gpt-5-mini')!.pricing?.input).toBe('$0.25');
    expect(result.models.find((m) => m.id === 'gpt-5.5')!.pricing).toBeUndefined();
  });
});

describe('refreshModelCatalog — auth-free docs fallback', () => {
  it('falls back to docs YAML when no token is available (never hard-fails)', async () => {
    const deps: RefreshDeps = {
      getToken: async () => null, // no gh / unauthenticated
      fetchApiModels: async () => {
        throw new Error('API should not be reached without a token');
      },
      fetchDocsYaml: async () => DOCS_YAML,
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('docs-fallback');
    expect(result.models.map((m) => m.id)).toContain('claude-sonnet-4.6');
  });

  it('falls back to docs YAML when the API errors (401/400/network)', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => {
        throw new Error('HTTP 401');
      },
      fetchDocsYaml: async () => DOCS_YAML,
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('docs-fallback');
  });
});

describe('refreshModelCatalog — seed-only degradation', () => {
  it('reports seed-only when no live source is reachable, with empty diff', async () => {
    const deps: RefreshDeps = {
      getToken: async () => null,
      fetchApiModels: async () => {
        throw new Error('unreachable');
      },
      fetchDocsYaml: async () => {
        throw new Error('network down');
      },
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('seed-only');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});

describe('parseDocsYaml — Default-tier row selection (Comment 1 fix)', () => {
  // The docs YAML has two rows per model: "Default" (≤threshold) and "Long context" (>threshold).
  // Only the Default row should be used for pricing — the Long context row is a different billing
  // tier and makes cached prices misleading for typical usage.
  // RED until parseDocsYaml skips rows with a non-empty `context_window` field.
  const TWO_ROW_YAML = `# Default row ($10/$45) + Long-context row ($12/$54) for gpt-5.5
- model: GPT-5.5
  provider: openai
  release_status: GA
  category: Powerful
  tier: Default
  input: $10.00
  output: $45.00

- model: GPT-5.5
  provider: openai
  release_status: GA
  category: Powerful
  tier: Long context
  input: $12.00
  output: $54.00
`;

  it('skips Long-context rows and emits only the Default-tier pricing entry per model', () => {
    const models = parseDocsYaml(TWO_ROW_YAML);
    const entries = models.filter((m) => m.id === 'gpt-5.5');
    // exactly ONE entry — the Default row
    expect(entries).toHaveLength(1);
    expect(entries[0].pricing?.input).toBe('$10.00');
    expect(entries[0].pricing?.output).toBe('$45.00');
  });

  it('enrichWithPricing uses Default-tier price (not Long-context) for two-row models', () => {
    const apiModels = [{ id: 'gpt-5.5', githubCategory: 'powerful' as const }];
    const docsModels = parseDocsYaml(TWO_ROW_YAML);
    const merged = enrichWithPricing(apiModels, docsModels);
    expect(merged[0].pricing?.input).toBe('$10.00');   // Default, not $12.00 Long-context
    expect(merged[0].pricing?.output).toBe('$45.00');  // Default, not $54.00 Long-context
  });
});

describe('refreshModelCatalog — unpricedIds suppression when enrichment fails (Comment 2 fix)', () => {
  // unpricedIds must NOT fire when docs enrichment itself failed or returned nothing —
  // that signals a source problem, not genuinely new/unpriced models.
  // RED until refreshModelCatalog tracks whether enrichment ran.
  it('unpricedIds is empty when docs fetch throws (no spurious warning)', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      fetchDocsYaml: async () => { throw new Error('network down during enrichment'); },
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api');
    // All models are unpriced but that's because enrichment failed — suppress the warning.
    expect(result.models.every((m) => m.pricing === undefined)).toBe(true);
    expect(result.unpricedIds).toEqual([]);
  });

  it('unpricedIds is empty when docs fetch returns no usable pricing (all models stay unpriced)', async () => {
    const EMPTY_YAML = '# no model entries\n';
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON,
      fetchDocsYaml: async () => EMPTY_YAML,
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('api');
    expect(result.unpricedIds).toEqual([]);
  });
});

describe('refreshModelCatalog — unpricedIds warning (loud unmatched signal)', () => {
  // RED until RefreshResult.unpricedIds exists and is computed in refreshModelCatalog.
  it('lists catalog models present in API response but absent from docs pricing', async () => {
    // API returns gpt-5.5 but DOCS_YAML has no gpt-5.5 entry → unpricedIds includes it.
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => API_JSON, // includes gpt-5.5
      fetchDocsYaml: async () => DOCS_YAML, // covers gpt-5-mini + claude-sonnet-4.6 only
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.unpricedIds).toBeDefined();
    expect(result.unpricedIds).toContain('gpt-5.5');
    // priced models must NOT appear in the list
    expect(result.unpricedIds).not.toContain('gpt-5-mini');
    expect(result.unpricedIds).not.toContain('claude-sonnet-4.6');
  });

  it('unpricedIds is empty when every discovered model has pricing', async () => {
    const deps: RefreshDeps = {
      getToken: async () => 'fake-token',
      fetchApiModels: async () => ({
        object: 'list',
        data: [
          { id: 'gpt-5-mini', model_picker_category: 'lightweight', model_picker_enabled: true },
        ],
      }),
      fetchDocsYaml: async () => DOCS_YAML, // gpt-5-mini IS in DOCS_YAML with pricing
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.unpricedIds).toEqual([]);
  });

  it('unpricedIds is empty for seed-only source (no enrichment attempted)', async () => {
    const deps: RefreshDeps = {
      getToken: async () => null,
      fetchApiModels: async () => { throw new Error('unreachable'); },
      fetchDocsYaml: async () => { throw new Error('network down'); },
      seed: SEED,
    };
    const result = await refreshModelCatalog(deps);
    expect(result.source).toBe('seed-only');
    expect(result.unpricedIds).toEqual([]);
  });
});
