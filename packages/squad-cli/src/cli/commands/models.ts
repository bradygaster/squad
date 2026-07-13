/**
 * `squad models` — model catalog diagnostics (issue #1080 / #1183).
 *
 * `squad models refresh` reconciles Squad's committed SEED catalog against the
 * live, CLI-reachable model list. Sourcing is AUTH-FREE-FIRST HYBRID:
 *
 *   1. CANONICAL (optional auth): `GET https://api.githubcopilot.com/models`
 *      with `Copilot-Integration-Id: copilot-cli`, using `gh auth token`
 *      directly as a Bearer token (verified auth spike B0 — no
 *      copilot_internal token exchange needed). Provides ids +
 *      `model_picker_category`.
 *   2. GRACEFUL FALLBACK (no auth): the public github/docs YAML
 *      `models-and-pricing.yml` — provides category + pricing + release_status.
 *   3. The committed {@link MODEL_CATALOG} is a SEED, never the sole truth.
 *
 * Discovered internal ids are written ONLY to the gitignored local cache
 * (`.squad/.cache/models.json`) — never persisted to committed/deployed files.
 *
 * The token value is NEVER printed or logged.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { MODEL_CATALOG, type ModelInfo, type GitHubModelCategory } from '@bradygaster/squad-sdk/config';
import { BOLD, RESET, GREEN, DIM, YELLOW } from '../core/output.js';

const execFileAsync = promisify(execFile);

const API_URL = 'https://api.githubcopilot.com/models';
const DOCS_YAML_URL =
  'https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml';
const COPILOT_INTEGRATION_ID = 'copilot-cli';

/** A model discovered from a live source (API or docs YAML). */
export interface DiscoveredModel {
  id: string;
  githubCategory?: GitHubModelCategory;
  releaseStatus?: string;
  /** Best-effort pricing from the docs YAML (per 1M tokens); never hardcoded. */
  pricing?: { input?: string; output?: string };
}

/** Which source ultimately produced the discovered set. */
export type RefreshSource = 'api' | 'docs-fallback' | 'seed-only';

export interface RefreshResult {
  source: RefreshSource;
  models: DiscoveredModel[];
  /** discovered ids absent from the seed */
  added: string[];
  /** seed ids absent from the discovered set (candidates to prune) */
  removed: string[];
}

/** Injectable side effects (network + auth), so both paths are unit-testable. */
export interface RefreshDeps {
  /** Returns a Copilot token, or null when `gh` is unavailable/unauthenticated. */
  getToken: () => Promise<string | null>;
  /** Fetches the Copilot models API. MUST reject on 401/400/network. */
  fetchApiModels: (token: string) => Promise<unknown>;
  /** Fetches the raw docs YAML text. */
  fetchDocsYaml: () => Promise<string>;
  /** The committed seed catalog. */
  seed: ModelInfo[];
}

const CATEGORY_LITERALS: readonly GitHubModelCategory[] = ['lightweight', 'versatile', 'powerful'];

function normalizeCategory(raw: unknown): GitHubModelCategory | undefined {
  if (typeof raw !== 'string') return undefined;
  const lower = raw.trim().toLowerCase();
  return (CATEGORY_LITERALS as readonly string[]).includes(lower)
    ? (lower as GitHubModelCategory)
    : undefined;
}

/**
 * Parse the Copilot models API response into CLI-reachable, picker-enabled
 * models. Shape: `{ data: [{ id, model_picker_category, model_picker_enabled }] }`.
 */
export function parseApiModels(json: unknown): DiscoveredModel[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: DiscoveredModel[] = [];
  for (const entry of data) {
    const e = entry as Record<string, unknown>;
    if (typeof e['id'] !== 'string') continue;
    // Only surface picker-enabled models (reachable from the CLI surface).
    if (e['model_picker_enabled'] === false) continue;
    out.push({
      id: e['id'] as string,
      githubCategory: normalizeCategory(e['model_picker_category']),
    });
  }
  return out;
}

/**
 * Best-effort display-name → id map for the docs YAML fallback. Unmatched
 * entries are intentionally skipped (the YAML uses human display names, not ids).
 */
export const DOCS_NAME_TO_ID: Record<string, string> = {
  // Keyed by the LOWERCASED spaced display name exactly as it appears in the
  // docs `- model:` field. Every id below is present in the 13-model seed
  // MODEL_CATALOG; ids without a docs display name simply won't get pricing.
  'gpt-5 mini': 'gpt-5-mini',
  'gpt-5.4 mini': 'gpt-5.4-mini',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.5': 'gpt-5.5',
  'gpt-5.6 luna': 'gpt-5.6-luna',
  'gpt-5.6 sol': 'gpt-5.6-sol',
  'gpt-5.6 terra': 'gpt-5.6-terra',
  'claude haiku 4.5': 'claude-haiku-4.5',
  'claude sonnet 4.5': 'claude-sonnet-4.5',
  'claude sonnet 4.6': 'claude-sonnet-4.6',
  'claude sonnet 5': 'claude-sonnet-5',
  'claude opus 4.6': 'claude-opus-4.6',
  'claude opus 4.7': 'claude-opus-4.7',
  'claude opus 4.8': 'claude-opus-4.8',
  'gemini 2.5 pro': 'gemini-2.5-pro',
};

/**
 * Minimal, tolerant parser for the docs `models-and-pricing.yml` flat list of
 * `- model:` blocks. Avoids adding a YAML dependency; unmatched names skipped.
 */
export function parseDocsYaml(text: string): DiscoveredModel[] {
  const out: DiscoveredModel[] = [];
  const blocks = text.split(/^-\s+model:/m).slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/^\s*['"]?(.+?)['"]?\s*$/m);
    if (!nameMatch) continue;
    const displayName = nameMatch[1]!
      .trim()
      // strip trailing markdown footnote markers, e.g. `Claude Sonnet 5[^sonnet-5-promo]`
      .replace(/\[\^[^\]]*\]/g, '')
      .trim();
    const id = DOCS_NAME_TO_ID[displayName.toLowerCase()];
    if (!id) continue; // best-effort join — skip unmatched
    const category = normalizeCategory(block.match(/^\s*category:\s*(.+)$/m)?.[1]);
    const releaseStatus = block.match(/^\s*release_status:\s*(.+)$/m)?.[1]?.trim();
    const input = block.match(/^\s*input:\s*(.+)$/m)?.[1]?.trim();
    const output = block.match(/^\s*output:\s*(.+)$/m)?.[1]?.trim();
    out.push({
      id,
      githubCategory: category,
      releaseStatus,
      ...(input || output ? { pricing: { input, output } } : {}),
    });
  }
  return out;
}

function computeDiff(seedIds: string[], discoveredIds: string[]): { added: string[]; removed: string[] } {
  const seedSet = new Set(seedIds);
  const discoveredSet = new Set(discoveredIds);
  return {
    added: discoveredIds.filter((id) => !seedSet.has(id)),
    removed: seedIds.filter((id) => !discoveredSet.has(id)),
  };
}

/**
 * Enrich API-discovered models with pricing (and releaseStatus) from the docs
 * YAML, joined by model id. The API stays authoritative for id/category/
 * reachability; docs only SUPPLIES `pricing`/`releaseStatus` for ids the API
 * already returned. No ids are added, and unmatched API models are returned
 * unchanged. Pure and side-effect-free.
 */
export function enrichWithPricing(
  apiModels: DiscoveredModel[],
  docsModels: DiscoveredModel[],
): DiscoveredModel[] {
  const docsById = new Map<string, DiscoveredModel>();
  for (const d of docsModels) docsById.set(d.id, d);

  return apiModels.map((m) => {
    const docs = docsById.get(m.id);
    if (!docs || (!docs.pricing && !docs.releaseStatus)) return m;
    return {
      ...m,
      ...(docs.pricing ? { pricing: docs.pricing } : {}),
      ...(m.releaseStatus === undefined && docs.releaseStatus
        ? { releaseStatus: docs.releaseStatus }
        : {}),
    };
  });
}

/**
 * Core refresh logic. Tries the canonical API first; on ANY failure (no gh,
 * 401/400, network) falls back to the public docs YAML; if that also yields
 * nothing usable, reports seed-only. NEVER hard-fails on the API arm.
 */
export async function refreshModelCatalog(deps: RefreshDeps): Promise<RefreshResult> {
  const seedIds = deps.seed.map((m) => m.id);
  let models: DiscoveredModel[] = [];
  let source: RefreshSource = 'seed-only';

  const token = await deps.getToken().catch(() => null);
  if (token) {
    try {
      const json = await deps.fetchApiModels(token);
      const parsed = parseApiModels(json);
      if (parsed.length > 0) {
        models = parsed;
        source = 'api';
      }
    } catch {
      // fall through to docs YAML — the feature must never hard-depend on auth
    }
  }

  // On the API happy path the docs YAML is the only pricing source, so fetch it
  // ALONGSIDE the canonical catalog and enrich by id. Best-effort / fail-open:
  // if the docs fetch or parse throws, keep the API models (without pricing) and
  // keep source: 'api'. Refresh must never hard-fail because enrichment failed.
  if (source === 'api') {
    try {
      const yamlText = await deps.fetchDocsYaml();
      const docsModels = parseDocsYaml(yamlText);
      models = enrichWithPricing(models, docsModels);
    } catch {
      // swallow — API catalog stands on its own without pricing
    }
  }

  if (source !== 'api') {
    try {
      const yamlText = await deps.fetchDocsYaml();
      const parsed = parseDocsYaml(yamlText);
      if (parsed.length > 0) {
        models = parsed;
        source = 'docs-fallback';
      }
    } catch {
      // fall through to seed-only
    }
  }

  const discoveredIds = models.map((m) => m.id);
  const { added, removed } = source === 'seed-only'
    ? { added: [], removed: [] }
    : computeDiff(seedIds, discoveredIds);

  return { source, models, added, removed };
}

// --- Real dependency wiring -------------------------------------------------

async function ghToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 5000 });
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function fetchApi(token: string): Promise<unknown> {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Copilot-Integration-Id': COPILOT_INTEGRATION_ID,
    },
  });
  if (!res.ok) {
    throw new Error(`Copilot models API returned HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchDocs(): Promise<string> {
  const res = await fetch(DOCS_YAML_URL);
  if (!res.ok) {
    throw new Error(`docs YAML returned HTTP ${res.status}`);
  }
  return res.text();
}

const DEFAULT_DEPS: RefreshDeps = {
  getToken: ghToken,
  fetchApiModels: fetchApi,
  fetchDocsYaml: fetchDocs,
  seed: MODEL_CATALOG,
};

function resolveCacheDir(cwd: string): string {
  return join(cwd, '.squad', '.cache');
}

export async function runModels(cwd: string, subArgs: string[]): Promise<void> {
  const sub = subArgs[0]?.toLowerCase();

  if (sub !== 'refresh') {
    console.log(`\n${BOLD}squad models${RESET}\n`);
    console.log(`  ${BOLD}refresh${RESET}   Reconcile the seed catalog against live model sources.`);
    console.log(`\n  ${DIM}Sources: Copilot models API (canonical, via gh token) →`);
    console.log(`  public github/docs YAML (auth-free fallback) → committed seed.${RESET}\n`);
    return;
  }

  const result = await refreshModelCatalog(DEFAULT_DEPS);

  const sourceLabel = {
    api: `${GREEN}Copilot models API (canonical)${RESET}`,
    'docs-fallback': `${YELLOW}public docs YAML (fallback — API unavailable)${RESET}`,
    'seed-only': `${YELLOW}committed seed only (no live source reachable)${RESET}`,
  }[result.source];

  console.log(`\n${BOLD}Model catalog refresh${RESET}\n`);
  console.log(`  Source:     ${sourceLabel}`);
  console.log(`  Discovered: ${result.models.length} model(s)`);
  console.log(`  ${GREEN}Added${RESET}:      ${result.added.length ? result.added.join(', ') : `${DIM}none${RESET}`}`);
  console.log(`  ${YELLOW}Removed${RESET}:    ${result.removed.length ? result.removed.join(', ') : `${DIM}none${RESET}`}`);

  const cacheDir = resolveCacheDir(cwd);
  const cachePath = join(cacheDir, 'models.json');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    cachePath,
    JSON.stringify({ refreshedAt: new Date().toISOString(), ...result }, null, 2),
    'utf-8',
  );
  console.log(`\n  ${DIM}Cached to: ${cachePath} (gitignored)${RESET}\n`);
}
