/**
 * Upstream resolver — reads upstream.json and resolves all upstream Squad sources.
 *
 * Implements the resolution the coordinator and CLI run at session start:
 * 1. Read `upstream.json` from the local squad directory.
 * 2. For each declared upstream, locate its locally materialized `.squad/` directory
 *    (local path, `.squad/_upstream_repos/<name>` for git, or an export file).
 *    Nothing is fetched here: `squad upstream sync` is the only network step.
 * 3. Read skills, decisions, wisdom, casting policy and routing, tagging every item
 *    with provenance (`upstream:<name>@<ref>`).
 * 4. Recurse into the upstream's own `upstream.json` (depth-first, declared order) until
 *    the depth limit, and refuse cycles.
 *
 * Precedence is deterministic: the local `.squad/` wins, then upstreams in the order
 * returned by {@link resolveUpstreams} (declared order, each followed by its own upstreams).
 *
 * @module upstream/resolver
 */

import path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import type {
  EffectiveUpstreamContext,
  InheritedDocument,
  InheritedSkill,
  ResolveUpstreamsOptions,
  ResolvedUpstream,
  UpstreamConfig,
  UpstreamResolution,
  UpstreamSource,
  UpstreamStatus,
  UpstreamType,
} from './types.js';

const defaultStorage: StorageProvider = new FSStorageProvider();

/** Default inheritance depth limit (direct upstreams are depth 1). */
export const DEFAULT_UPSTREAM_MAX_DEPTH = 3;
/** Default number of days after which a synced git clone is reported stale. */
export const DEFAULT_UPSTREAM_STALE_DAYS = 30;

const SQUAD_DIR_NAMES: readonly string[] = ['.squad', '.ai-team'];

/**
 * Read and parse upstream.json from a squad directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readUpstreamConfig(squadDir: string, storage: StorageProvider = defaultStorage): UpstreamConfig | null {
  const configPath = path.join(squadDir, 'upstream.json');
  if (!storage.existsSync(configPath)) return null;

  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw) as UpstreamConfig;
    if (!parsed.upstreams || !Array.isArray(parsed.upstreams)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Find the squad directory for a declared source path.
 * Accepts a project root (looks for `.squad/`, then `.ai-team/`) or a path that already
 * is a squad directory (`…/.squad`, `…/.ai-team`, or a directory holding `team.md`).
 */
function findSquadDir(sourcePath: string, storage: StorageProvider = defaultStorage): string | null {
  for (const name of SQUAD_DIR_NAMES) {
    const nested = path.join(sourcePath, name);
    if (storage.existsSync(nested) && storage.isDirectorySync(nested)) return nested;
  }
  if (!storage.existsSync(sourcePath) || !storage.isDirectorySync(sourcePath)) return null;
  if (SQUAD_DIR_NAMES.includes(path.basename(sourcePath))) return sourcePath;
  if (storage.existsSync(path.join(sourcePath, 'team.md')) || storage.existsSync(path.join(sourcePath, 'decisions.md'))) {
    return sourcePath;
  }
  return null;
}

/**
 * Read all skills from a squad directory's skills/ folder.
 */
function readSkills(squadDir: string, storage: StorageProvider = defaultStorage): Array<{ name: string; content: string }> {
  const projectDir = path.dirname(squadDir);
  const candidateDirs = [
    { dir: path.join(projectDir, '.copilot', 'skills'), layout: 'nested' as const },
    { dir: path.join(squadDir, 'skills'), layout: 'nested' as const },
    { dir: path.join(projectDir, '.ai-team', 'skills'), layout: 'flat' as const },
  ];
  const source = candidateDirs.find(({ dir }) => storage.existsSync(dir));
  if (!source) return [];

  const skills: Array<{ name: string; content: string }> = [];
  try {
    for (const entry of storage.listSync(source.dir)) {
      const skillFile = source.layout === 'nested'
        ? path.join(source.dir, entry, 'SKILL.md')
        : path.join(source.dir, entry);
      if (storage.existsSync(skillFile)) {
        const name = source.layout === 'nested' ? entry : path.basename(entry, '.md');
        skills.push({ name, content: storage.readSync(skillFile) ?? '' });
      }
    }
  } catch {
    // Graceful degradation — return what we found
  }
  return skills;
}

/**
 * Read a text file if it exists, otherwise return null.
 */
function readOptionalFile(filePath: string, storage: StorageProvider = defaultStorage): string | null {
  if (!storage.existsSync(filePath)) return null;
  try {
    return storage.readSync(filePath) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file if it exists, otherwise return null.
 */
function readOptionalJson(filePath: string, storage: StorageProvider = defaultStorage): Record<string, unknown> | null {
  const raw = readOptionalFile(filePath, storage);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Provenance tag for an upstream entry: `upstream:<name>@<ref>`. */
export function upstreamProvenance(name: string, type: UpstreamType, ref?: string): string {
  const suffix = type === 'git' ? (ref || 'main') : type;
  return `upstream:${name}@${suffix}`;
}

interface Frame {
  depth: number;
  via: string[];
  /** Identities (resolved squad dirs) already on the inheritance chain, root first. */
  chain: string[];
}

function emptyUpstream(entry: UpstreamSource, frame: Frame, status: UpstreamStatus, diagnostic: string | null): ResolvedUpstream {
  return {
    name: entry.name,
    type: entry.type,
    provenance: upstreamProvenance(entry.name, entry.type, entry.ref),
    origin: entry.source,
    ...(entry.ref ? { ref: entry.ref } : {}),
    depth: frame.depth,
    via: [...frame.via],
    status,
    diagnostic,
    squadDir: null,
    lastSynced: entry.last_synced ?? null,
    skills: [],
    decisions: null,
    wisdom: null,
    castingPolicy: null,
    routing: null,
  };
}

/**
 * Resolve content from a single upstream's .squad/ directory.
 */
function resolveFromSquadDir(
  entry: UpstreamSource,
  upstreamSquadDir: string,
  frame: Frame,
  status: UpstreamStatus,
  diagnostic: string | null,
  storage: StorageProvider,
): ResolvedUpstream {
  return {
    ...emptyUpstream(entry, frame, status, diagnostic),
    squadDir: upstreamSquadDir,
    skills: readSkills(upstreamSquadDir, storage),
    decisions: readOptionalFile(path.join(upstreamSquadDir, 'decisions.md'), storage),
    wisdom: readOptionalFile(path.join(upstreamSquadDir, 'identity', 'wisdom.md'), storage),
    castingPolicy: readOptionalJson(path.join(upstreamSquadDir, 'casting', 'policy.json'), storage),
    routing: readOptionalFile(path.join(upstreamSquadDir, 'routing.md'), storage),
  };
}

/**
 * Resolve content from an export JSON file.
 */
function resolveFromExport(entry: UpstreamSource, exportPath: string, frame: Frame, storage: StorageProvider): ResolvedUpstream {
  let manifest: { version?: string; skills?: string[]; casting?: { policy?: Record<string, unknown> } };
  try {
    manifest = JSON.parse(storage.readSync(exportPath) ?? '') as typeof manifest;
  } catch (err) {
    return emptyUpstream(entry, frame, 'invalid', `${entry.name}: export file is not valid JSON (${exportPath}): ${(err as Error).message}`);
  }

  const resolved = emptyUpstream(entry, frame, 'ok', null);
  resolved.squadDir = exportPath;
  if (Array.isArray(manifest.skills)) {
    for (const skillContent of manifest.skills) {
      const nameMatch = skillContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      const skillName = nameMatch ? nameMatch[1]!.trim() : 'unknown';
      resolved.skills.push({ name: skillName, content: skillContent });
    }
  }
  if (manifest.casting?.policy) {
    resolved.castingPolicy = manifest.casting.policy;
  }
  return resolved;
}

/** Stable identity for cycle detection: resolved absolute path, case-folded on Windows. */
function identityOf(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function staleReason(entry: UpstreamSource, staleAfterDays: number, now: Date): string | null {
  if (!entry.last_synced) return 'never synced';
  const synced = Date.parse(entry.last_synced);
  if (Number.isNaN(synced)) return `last_synced is not a valid timestamp (${entry.last_synced})`;
  const ageDays = (now.getTime() - synced) / 86_400_000;
  if (ageDays > staleAfterDays) return `last synced ${Math.floor(ageDays)} days ago`;
  return null;
}

function isValidEntry(entry: unknown): entry is UpstreamSource {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return typeof e['name'] === 'string' && e['name'].length > 0
    && (e['type'] === 'local' || e['type'] === 'git' || e['type'] === 'export')
    && typeof e['source'] === 'string' && e['source'].length > 0;
}

function placeholderEntry(raw: unknown): UpstreamSource {
  const name = raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>)['name'] === 'string'
    ? String((raw as Record<string, unknown>)['name'])
    : '(unnamed)';
  return { name, type: 'local', source: '', added_at: '', last_synced: null };
}

function cycleDiagnostic(entry: UpstreamSource, frame: Frame, dir: string): string {
  return `${entry.name}: cycle detected (${[...frame.via, entry.name].join(' -> ')} resolves back to ${dir}); not read`;
}

function resolveOne(
  squadDir: string,
  entry: UpstreamSource,
  frame: Frame,
  storage: StorageProvider,
  staleAfterDays: number,
  now: Date,
): ResolvedUpstream {
  if (entry.type === 'local') {
    const upstreamSquadDir = findSquadDir(entry.source, storage);
    if (!upstreamSquadDir) {
      return emptyUpstream(entry, frame, 'missing',
        `${entry.name}: local source not found (${entry.source}); fix the path or run "squad upstream remove ${entry.name}"`);
    }
    if (frame.chain.includes(identityOf(upstreamSquadDir))) {
      return emptyUpstream(entry, frame, 'cycle', cycleDiagnostic(entry, frame, upstreamSquadDir));
    }
    return resolveFromSquadDir(entry, upstreamSquadDir, frame, 'ok', null, storage);
  }

  if (entry.type === 'git') {
    const cloneDir = path.join(squadDir, '_upstream_repos', entry.name);
    const cloneSquadDir = findSquadDir(cloneDir, storage);
    if (!cloneSquadDir) {
      return emptyUpstream(entry, frame, 'unavailable',
        `${entry.name}: git upstream is not materialized locally (${path.join('.squad', '_upstream_repos', entry.name)} missing); run "squad upstream sync ${entry.name}" — session start never fetches`);
    }
    if (frame.chain.includes(identityOf(cloneSquadDir))) {
      return emptyUpstream(entry, frame, 'cycle', cycleDiagnostic(entry, frame, cloneSquadDir));
    }
    const stale = staleReason(entry, staleAfterDays, now);
    return resolveFromSquadDir(
      entry,
      cloneSquadDir,
      frame,
      stale ? 'stale' : 'ok',
      stale ? `${entry.name}: using the local clone but it may be out of date (${stale}); run "squad upstream sync ${entry.name}" to refresh` : null,
      storage,
    );
  }

  const exportPath = path.resolve(entry.source);
  if (!storage.existsSync(exportPath)) {
    return emptyUpstream(entry, frame, 'missing',
      `${entry.name}: export file not found (${entry.source}); fix the path or run "squad upstream remove ${entry.name}"`);
  }
  return resolveFromExport(entry, exportPath, frame, storage);
}

/**
 * Resolve all upstream sources for a squad directory.
 *
 * For each upstream in upstream.json:
 * - Local paths: read directly from the source's .squad/
 * - Git URLs: read from .squad/_upstream_repos/{name}/ (materialized by `squad upstream sync`)
 * - Export files: read from the JSON file
 *
 * Never fetches. Recurses into each upstream's own `upstream.json` (depth-first, declared
 * order) up to `maxDepth`, and reports cycles instead of following them.
 *
 * @param squadDir - The .squad/ directory of the current repo
 * @returns Resolved upstream content, or null if no upstream.json exists
 */
export function resolveUpstreams(
  squadDir: string,
  storage: StorageProvider = defaultStorage,
  options: ResolveUpstreamsOptions = {},
): UpstreamResolution | null {
  const config = readUpstreamConfig(squadDir, storage);
  if (!config) return null;

  const maxDepth = Math.max(1, options.maxDepth ?? DEFAULT_UPSTREAM_MAX_DEPTH);
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_UPSTREAM_STALE_DAYS;
  const now = options.now ?? new Date();
  const results: ResolvedUpstream[] = [];
  const diagnostics: string[] = [];
  // Squad dirs already read in this resolution: a diamond (repo -> org, repo -> team -> org)
  // inherits org once, from its earliest (highest-precedence) position.
  const seen = new Set<string>();

  const push = (u: ResolvedUpstream): void => {
    results.push(u);
    if (u.status !== 'ok' && u.diagnostic) diagnostics.push(u.diagnostic);
  };

  const visit = (dir: string, cfg: UpstreamConfig, frame: Frame): void => {
    for (const raw of cfg.upstreams) {
      if (!isValidEntry(raw)) {
        const entry = placeholderEntry(raw);
        push(emptyUpstream(entry, frame, 'invalid',
          `${entry.name}: malformed upstream.json entry in ${path.join(dir, 'upstream.json')} (needs name, type local|git|export, source)`));
        continue;
      }

      const resolved = resolveOne(dir, raw, frame, storage, staleAfterDays, now);
      const readable = resolved.status === 'ok' || resolved.status === 'stale';
      if (readable && resolved.squadDir) {
        const id = identityOf(resolved.squadDir);
        if (seen.has(id)) continue;
        seen.add(id);
      }
      push(resolved);

      if (!readable || resolved.type === 'export' || !resolved.squadDir) continue;

      const nested = readUpstreamConfig(resolved.squadDir, storage);
      if (!nested || nested.upstreams.length === 0) continue;

      const nextFrame: Frame = {
        depth: frame.depth + 1,
        via: [...frame.via, raw.name],
        chain: [...frame.chain, identityOf(resolved.squadDir)],
      };
      if (nextFrame.depth > maxDepth) {
        for (const n of nested.upstreams) {
          const entry = isValidEntry(n) ? n : placeholderEntry(n);
          push(emptyUpstream(entry, nextFrame, 'depth-exceeded',
            `${entry.name}: declared by ${raw.name} at depth ${nextFrame.depth}, beyond the limit of ${maxDepth}; not read`));
        }
        continue;
      }
      visit(resolved.squadDir, nested, nextFrame);
    }
  };

  visit(squadDir, config, { depth: 1, via: [], chain: [identityOf(squadDir)] });
  return { upstreams: results, diagnostics, maxDepth };
}

/**
 * Apply precedence to a resolution: the local squad wins, then upstreams in resolution order.
 *
 * @param resolution - Output of {@link resolveUpstreams}
 * @param localSkillNames - Skill names already present in the local squad (they win)
 * @param localCastingPolicy - Whether the local squad has its own casting policy (it wins)
 */
export function buildEffectiveUpstreamContext(
  resolution: UpstreamResolution | null,
  localSkillNames: Iterable<string> = [],
  localCastingPolicy = false,
): EffectiveUpstreamContext {
  const empty: EffectiveUpstreamContext = { skills: [], decisions: [], routing: [], wisdom: [], castingPolicy: null };
  if (!resolution) return empty;

  const winners = new Map<string, string>();
  for (const name of localSkillNames) winners.set(name, 'local');

  const skills: InheritedSkill[] = [];
  const decisions: InheritedDocument[] = [];
  const routing: InheritedDocument[] = [];
  const wisdom: InheritedDocument[] = [];
  let castingPolicy: EffectiveUpstreamContext['castingPolicy'] = null;

  for (const u of resolution.upstreams) {
    if (u.status !== 'ok' && u.status !== 'stale') continue;
    for (const s of u.skills) {
      const winner = winners.get(s.name) ?? null;
      if (!winner) winners.set(s.name, u.provenance);
      skills.push({ name: s.name, content: s.content, provenance: u.provenance, overriddenBy: winner });
    }
    if (u.decisions) decisions.push({ provenance: u.provenance, content: u.decisions });
    if (u.routing) routing.push({ provenance: u.provenance, content: u.routing });
    if (u.wisdom) wisdom.push({ provenance: u.provenance, content: u.wisdom });
    if (u.castingPolicy && !castingPolicy && !localCastingPolicy) {
      castingPolicy = { provenance: u.provenance, policy: u.castingPolicy };
    }
  }

  return { skills, decisions, routing, wisdom, castingPolicy };
}

function describeStatus(u: ResolvedUpstream): string {
  switch (u.status) {
    case 'ok': return 'ok';
    case 'stale': return 'stale (read anyway)';
    case 'missing': return 'missing';
    case 'unavailable': return 'unavailable (not synced)';
    case 'invalid': return 'invalid';
    case 'cycle': return 'cycle (skipped)';
    case 'depth-exceeded': return 'depth limit (skipped)';
  }
}

function summarizeContent(u: ResolvedUpstream): string {
  const parts: string[] = [];
  if (u.skills.length > 0) parts.push(`${u.skills.length} skill${u.skills.length > 1 ? 's' : ''}`);
  if (u.decisions) parts.push('decisions');
  if (u.wisdom) parts.push('wisdom');
  if (u.castingPolicy) parts.push('casting');
  if (u.routing) parts.push('routing');
  return parts.join(', ');
}

/**
 * Render a resolution as text for the `squad_state_upstreams` tool and the CLI.
 *
 * Always lists every upstream with provenance, status and diagnostic, followed by the
 * effective inherited skills (with the winner on name conflicts). With `detail`, the
 * inherited decisions, routing, wisdom and skill bodies are appended under provenance
 * headers so a coordinator can load them without touching the filesystem.
 */
export function formatUpstreamReport(
  resolution: UpstreamResolution | null,
  effective: EffectiveUpstreamContext,
  options: { detail?: boolean } = {},
): string {
  if (!resolution) return 'No upstream.json: this squad inherits nothing.';
  if (resolution.upstreams.length === 0) return 'upstream.json declares no upstreams: this squad inherits nothing.';

  const lines: string[] = [];
  lines.push(`Upstream inheritance (precedence: local .squad/ wins, then the order below; depth limit ${resolution.maxDepth}; nothing is fetched at session start — run "squad upstream sync" to refresh).`);
  lines.push('');
  lines.push('Upstreams:');
  for (const u of resolution.upstreams) {
    const indent = '  '.repeat(u.depth);
    const content = summarizeContent(u);
    const via = u.via.length > 0 ? ` via ${u.via.join(' -> ')}` : '';
    lines.push(`${indent}- ${u.name} [${u.provenance}] ${u.type}: ${u.origin}${via} — ${describeStatus(u)}${content ? ` — ${content}` : ''}`);
    if (u.diagnostic) lines.push(`${indent}  ! ${u.diagnostic}`);
  }

  lines.push('');
  if (effective.skills.length === 0) {
    lines.push('Inherited skills: none');
  } else {
    lines.push('Inherited skills (name — source — outcome):');
    for (const s of effective.skills) {
      const outcome = s.overriddenBy ? `overridden by ${s.overriddenBy}` : 'active';
      lines.push(`  - ${s.name} — ${s.provenance} — ${outcome}`);
    }
  }
  const docs = [
    ['decisions', effective.decisions],
    ['routing', effective.routing],
    ['wisdom', effective.wisdom],
  ] as const;
  for (const [label, items] of docs) {
    lines.push(`Inherited ${label}: ${items.length === 0 ? 'none' : items.map(d => d.provenance).join(', ')}`);
  }
  lines.push(`Inherited casting policy: ${effective.castingPolicy ? effective.castingPolicy.provenance : 'none (local policy applies)'}`);

  if (options.detail) {
    for (const [label, items] of docs) {
      for (const d of items) {
        lines.push('', `--- ${label} from ${d.provenance} ---`, d.content.trimEnd());
      }
    }
    for (const s of effective.skills) {
      if (s.overriddenBy) continue;
      lines.push('', `--- skill ${s.name} from ${s.provenance} ---`, s.content.trimEnd());
    }
    if (effective.castingPolicy) {
      lines.push('', `--- casting policy from ${effective.castingPolicy.provenance} ---`, JSON.stringify(effective.castingPolicy.policy, null, 2));
    }
  }

  return lines.join('\n');
}

/**
 * Build the INHERITED CONTEXT block for agent spawn prompts.
 */
export function buildInheritedContextBlock(resolution: UpstreamResolution | null): string {
  if (!resolution || resolution.upstreams.length === 0) return '';

  const lines = ['INHERITED CONTEXT: (local .squad/ wins; then in this order)'];
  for (const u of resolution.upstreams) {
    const parts: string[] = [];
    if (u.skills.length > 0) parts.push(`skills (${u.skills.length})`);
    if (u.decisions) parts.push('decisions ✓');
    if (u.wisdom) parts.push('wisdom ✓');
    if (u.castingPolicy) parts.push('casting ✓');
    if (u.routing) parts.push('routing ✓');
    const status = u.status === 'ok' ? '' : ` [${u.status}]`;
    lines.push(`  ${u.name}: ${parts.join(', ') || '(empty)'} (${u.provenance})${status}`);
  }
  return lines.join('\n');
}

/**
 * Build user-facing display for session start greeting and `squad status` / `squad doctor`.
 */
export function buildSessionDisplay(resolution: UpstreamResolution | null): string {
  if (!resolution || resolution.upstreams.length === 0) return '';

  const lines = ['📡 Inherited context:'];
  for (const u of resolution.upstreams) {
    const indent = '  '.repeat(u.depth);
    const content = summarizeContent(u);
    if (u.status === 'ok' || u.status === 'stale') {
      const stale = u.status === 'stale' ? ' ⚠️ stale' : '';
      lines.push(`${indent}${u.name} (${u.type}) [${u.provenance}] — ${content || '(empty)'}${stale}`);
    } else {
      lines.push(`${indent}⚠️ ${u.name} (${u.type}) [${u.provenance}] — ${describeStatus(u)}`);
    }
    if (u.diagnostic) lines.push(`${indent}   ${u.diagnostic}`);
  }
  return lines.join('\n');
}