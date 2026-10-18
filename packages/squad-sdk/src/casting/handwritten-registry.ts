/**
 * Tolerant repair of LLM-handwritten `.squad/casting/registry.json`.
 *
 * Models doing Init Mode often write the registry in an ad-hoc shape (role keys,
 * an `agents` array, `{ name, role, status }` entries, no schema fields). The
 * durable registry reader rejects those, which used to crash `squad upgrade`.
 * This module normalizes such shapes into the canonical
 * `squad-agent-provenance/v1` registry; canonical and valid legacy registries are
 * never touched.
 *
 * @module casting/handwritten-registry
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  acquireCastingRegistryLock,
  commitCastingRegistryPair,
  readCastingRegistryPair,
} from './durable-registry.js';
import {
  AGENT_PROVENANCE_SCHEMA,
  AGENT_PROVENANCE_VERSION,
  parseAgentProvenanceRegistry,
  type AgentProvenanceRecord,
  type AgentProvenanceRegistry,
  type AgentProvenanceStatus,
} from './agent-provenance.js';

const META_KEYS = new Set([
  'schema', 'schema_version', 'version', 'revision', 'generated_at', 'universe', 'created_at', 'updated_at', 'description', '$schema',
]);
const STATUSES: readonly AgentProvenanceStatus[] = ['active', 'inactive', 'retired'];

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
function normalizeStatus(v: unknown): AgentProvenanceStatus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (STATUSES as readonly string[]).includes(s) ? (s as AgentProvenanceStatus) : 'active';
}
const isTs = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));

export function toAgentId(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface RawEntry { key?: string; value: unknown }

function collectEntries(root: Record<string, unknown>): RawEntry[] {
  const agents = root['agents'];
  if (Array.isArray(agents)) return agents.map((value) => ({ value }));
  if (isRecord(agents)) return Object.entries(agents).map(([key, value]) => ({ key, value }));
  // no wrapper: every non-meta top-level key is an agent (or role) entry
  return Object.entries(root)
    .filter(([key, value]) => !META_KEYS.has(key) && (isRecord(value) || typeof value === 'string'))
    .map(([key, value]) => ({ key, value }));
}

/**
 * Normalize an arbitrary handwritten registry into the canonical shape.
 * Returns `undefined` when nothing usable can be recovered.
 */
export function normalizeHandwrittenCastingRegistry(value: unknown, now = new Date().toISOString()): AgentProvenanceRegistry | undefined {
  const rootRaw = Array.isArray(value) ? { agents: value } : value;
  if (!isRecord(rootRaw)) return undefined;
  const firstEntryUniverse = collectEntries(rootRaw).map((e) => (isRecord(e.value) ? str(e.value['universe']) : undefined)).find(Boolean);
  const universe = str(rootRaw['universe']) ?? firstEntryUniverse ?? 'unspecified';
  const generatedAt = isTs(rootRaw['generated_at']) ? rootRaw['generated_at'] : now;

  const agents: Record<string, AgentProvenanceRecord> = {};
  const names = new Set<string>();
  for (const { key, value: raw } of collectEntries(rootRaw)) {
    let name: string | undefined;
    let role: string | undefined;
    let rec: Record<string, unknown> = {};
    if (typeof raw === 'string') {
      // `"lead": "Avery"` (role -> name) or `"avery": "Lead / Architect"` is ambiguous; treat the key as the role
      name = str(raw);
      role = key;
    } else if (isRecord(raw)) {
      rec = raw;
      name = str(rec['persistent_name']) ?? str(rec['display_name']) ?? str(rec['name']) ?? str(rec['agent']) ?? str(rec['id']);
      role = str(rec['role']) ?? str(rec['title']);
      // role-keyed entry without an explicit role: the key is the role
      if (!role && key && name && toAgentId(key) !== toAgentId(name)) role = key;
      name ??= key;
    }
    if (!name) continue;
    const id = toAgentId(str(rec['id']) ?? (key && toAgentId(key) === toAgentId(name) ? key : name));
    if (!id || agents[id] || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    // A handwritten roster is a single genesis cast: one universe, everyone active, one timestamp.
    agents[id] = {
      display_name: name,
      persistent_name: name,
      role: role ?? id,
      universe,
      // preserve a recorded lifecycle status: a retired agent must not be silently resurrected
      status: normalizeStatus(rec['status']),
      ...(normalizeStatus(rec['status']) === 'retired' ? { retired_at: isTs(rec['retired_at']) ? rec['retired_at'] : generatedAt } : {}),
      created_at: generatedAt,
      updated_at: generatedAt,
    };
  }
  if (Object.keys(agents).length === 0) return undefined;
  return {
    schema: AGENT_PROVENANCE_SCHEMA,
    schema_version: AGENT_PROVENANCE_VERSION,
    revision: 1,
    generated_at: generatedAt,
    agents,
  };
}

function isAcceptable(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value['schema'] !== undefined) {
    try { return parseAgentProvenanceRegistry(value).completeness === 'complete'; } catch { return false; }
  }
  // legacy registries are read by the durable reader; only repair what it cannot read
  if (!isRecord(value['agents'])) return false;
  return Object.keys(value['agents']).length > 0 && Object.values(value['agents']).every((a) => isRecord(a)
    && !!str(a['persistent_name']) && isTs(a['created_at']) && !!str(a['universe'])
    && (STATUSES as readonly string[]).includes(String(a['status'])));
}

const COMMIT_MANIFEST = 'registry-history.commit.json';

function commitManifestMismatch(castingDir: string): boolean {
  try {
    readCastingRegistryPair(castingDir);
    return false;
  } catch (error) {
    return /commit manifest/i.test(error instanceof Error ? error.message : String(error));
  }
}

export interface RepairResult {
  repaired: boolean;
  /** Relative file names written or created inside the casting directory. */
  files: string[];
  /** Stale files backed up (as `*.handwritten.bak`) and removed, e.g. the commit manifest. */
  removed?: string[];
  reason?: string;
}

/**
 * Repair `registry.json` in place when it is handwritten and unreadable. The
 * original is kept as `registry.json.handwritten.bak`; `history.json` is (re)written
 * as the matching genesis cast (an existing one is backed up) so the pair is consistent. Already valid
 * registries, absent registries and unrecoverable content are left untouched.
 */
export function repairHandwrittenCastingRegistry(castingDir: string, now = new Date().toISOString()): RepairResult {
  const registryPath = path.join(castingDir, 'registry.json');
  if (!fs.existsSync(registryPath)) return { repaired: false, files: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    return { repaired: false, files: [], reason: 'registry.json is not valid JSON' };
  }
  const manifestPath = path.join(castingDir, COMMIT_MANIFEST);
  const hasManifest = fs.existsSync(manifestPath);
  // a hand-edited registry that is still well-formed can nevertheless disagree with the checksummed commit manifest
  const manifestMismatch = hasManifest && isAcceptable(parsed) && commitManifestMismatch(castingDir);
  if (isAcceptable(parsed) && !manifestMismatch) return { repaired: false, files: [] };
  // a well-formed registry that only disagrees with the manifest keeps its revision and history: just re-commit
  // the same pair through the canonical writer so the manifest matches again
  if (manifestMismatch && recommitExistingPair(castingDir)) {
    return { repaired: true, files: ['registry.json', 'history.json', COMMIT_MANIFEST] };
  }
  const normalized = normalizeHandwrittenCastingRegistry(parsed, now);
  if (!normalized) return { repaired: false, files: [], reason: 'registry.json has no recoverable agents' };

  return { repaired: true, ...writeGenesisPair(castingDir, normalized) };
}

/**
 * Re-commit an existing, individually valid registry/history pair so a stale commit manifest is replaced by a
 * canonical one. Returns false (leaving everything untouched) when the pair is not self-consistent, in which
 * case the caller rebuilds it from the registry's agents instead.
 */
function recommitExistingPair(castingDir: string): boolean {
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  if (!fs.existsSync(historyPath)) return false;
  const registryRaw = fs.readFileSync(registryPath, 'utf8');
  const historyRaw = fs.readFileSync(historyPath, 'utf8');
  let registry: unknown;
  let history: unknown;
  try { registry = JSON.parse(registryRaw); history = JSON.parse(historyRaw); } catch { return false; }
  if (!isRecord(registry) || !isRecord(history) || typeof registry['revision'] !== 'number') return false;
  const { transaction_id: _rt, ...reg } = registry;
  const { transaction_id: _ht, registry_revision: _hr, ...hist } = history;
  void _rt; void _ht; void _hr;
  for (const f of [registryPath, historyPath, path.join(castingDir, COMMIT_MANIFEST)]) {
    if (fs.existsSync(f) && !fs.existsSync(`${f}.handwritten.bak`)) fs.copyFileSync(f, `${f}.handwritten.bak`);
  }
  const release = acquireCastingRegistryLock(castingDir, 'casting manifest repair');
  try {
    commitCastingRegistryPair(castingDir, registryRaw, reg, historyRaw, hist, registry['revision']);
    readCastingRegistryPair(castingDir);
    return true;
  } catch {
    return false;
  } finally {
    release();
  }
}
/**
 * Write `normalized` as a repaired registry + history through the SDK's canonical commit writer, so the pair
 * carries a valid `registry-history.commit.json` manifest and passes `readCastingRegistryPair`. Whatever was
 * there is backed up as `*.handwritten.bak` first.
 *
 * History describes the same cast (one genesis snapshot listing every agent) or the durable reader rejects the
 * pair as mixed-generation. Recorded `retired` / `inactive` statuses are kept as-is (a retired agent gets a
 * `retired_at`), never silently reactivated.
 */
function writeGenesisPair(castingDir: string, normalized: AgentProvenanceRegistry): { files: string[]; removed?: string[] } {
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const manifestPath = path.join(castingDir, COMMIT_MANIFEST);
  for (const f of [registryPath, historyPath, manifestPath]) {
    if (fs.existsSync(f) && !fs.existsSync(`${f}.handwritten.bak`)) fs.copyFileSync(f, `${f}.handwritten.bak`);
  }
  const agents = Object.values(normalized.agents);
  const universe = agents[0]!.universe;
  const history: Record<string, unknown> = {
    universe_usage_history: [{ universe, used_at: normalized.generated_at }],
    assignment_cast_snapshots: {
      'handwritten-cast-import': {
        universe,
        created_at: normalized.generated_at,
        agents: Object.keys(normalized.agents),
      },
    },
  };
  const { transaction_id: _t, ...registry } = normalized as unknown as Record<string, unknown>;
  void _t;
  const release = acquireCastingRegistryLock(castingDir, 'handwritten registry repair');
  try {
    const previousRegistryRaw = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : undefined;
    const previousHistoryRaw = fs.existsSync(historyPath) ? fs.readFileSync(historyPath, 'utf8') : undefined;
    commitCastingRegistryPair(castingDir, previousRegistryRaw, registry, previousHistoryRaw, history, normalized.revision);
  } finally {
    release();
  }
  return { files: ['registry.json', 'history.json', COMMIT_MANIFEST] };
}
// ── backfill from team.md ───────────────────────────────────────────

const BUILTIN_NAMES = new Set(['scribe', 'ralph', 'rai', 'fact checker', 'fact-checker', 'squad', 'coordinator', 'copilot', '@copilot']);

export interface TeamRosterMember { name: string; role: string }

/** Parse specialist rows from `team.md` (`## Members` table, else the first Name/Role table). */
export function parseTeamRoster(teamMd: string): { members: TeamRosterMember[]; universe?: string } {
  const universe = /universe\**\s*[:|]\s*\**\s*([^\n|*]+)/i.exec(teamMd)?.[1]?.trim();
  const lines = teamMd.split(/\r?\n/);
  const membersHeading = lines.findIndex((l) => /^##\s+members\b/i.test(l.trim()));
  const scope = membersHeading === -1
    ? lines
    : lines.slice(membersHeading + 1, (() => { const n = lines.findIndex((l, i) => i > membersHeading && /^##\s/.test(l)); return n === -1 ? lines.length : n; })());
  const members: TeamRosterMember[] = [];
  let nameCol = -1;
  let roleCol = -1;
  let statusCol = -1;
  for (const line of scope) {
    if (!line.trim().startsWith('|')) { if (members.length > 0) break; nameCol = roleCol = statusCol = -1; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (nameCol === -1) {
      nameCol = cells.findIndex((x) => /^name$/i.test(x));
      roleCol = cells.findIndex((x) => /^role$/i.test(x));
      statusCol = cells.findIndex((x) => /^status$/i.test(x));
      continue;
    }
    if (roleCol === -1 || cells.every((x) => /^:?-+:?$/.test(x))) continue;
    const name = cells[nameCol]?.replace(/[*_`]/g, '').trim();
    const role = cells[roleCol]?.replace(/[*_`]/g, '').trim();
    const status = statusCol === -1 ? '' : (cells[statusCol] ?? '');
    if (!name || !role || BUILTIN_NAMES.has(name.toLowerCase()) || name.startsWith('@') || /human|retired|alumni/i.test(status) || /human/i.test(role)) continue;
    members.push({ name, role });
  }
  return { members, ...(universe ? { universe } : {}) };
}

/**
 * Backfill an EMPTY casting registry from the `team.md` roster. Models on older CLIs (no
 * `squad cast --name`) write team.md and charters directly and leave `registry.json` at
 * `agents: {}`. Registries that already have agents, absent registries and empty rosters
 * are left untouched.
 */
export function backfillCastingRegistryFromTeam(castingDir: string, teamMdPath: string, now = new Date().toISOString()): RepairResult {
  const registryPath = path.join(castingDir, 'registry.json');
  if (!fs.existsSync(registryPath) || !fs.existsSync(teamMdPath)) return { repaired: false, files: [] };
  let current: unknown;
  try { current = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch { return { repaired: false, files: [], reason: 'registry.json is not valid JSON' }; }
  if (!isRecord(current) || !isRecord(current['agents']) || Object.keys(current['agents']).length > 0) return { repaired: false, files: [] };
  const { members, universe } = parseTeamRoster(fs.readFileSync(teamMdPath, 'utf8'));
  const normalized = normalizeHandwrittenCastingRegistry({ universe, agents: members }, now);
  if (!normalized) return { repaired: false, files: [], reason: 'team.md has no specialist members' };
  return { repaired: true, ...writeGenesisPair(castingDir, normalized) };
}
