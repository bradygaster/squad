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
  validateCastingRegistryPairForCommit,
  validateCastingRegistryPairRaw,
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
const COMMIT_MANIFEST = 'registry-history.commit.json';
const JOURNAL_FILE = 'registry-history.transaction.json';

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
  if (rootRaw['schema'] !== undefined && rootRaw['schema'] !== AGENT_PROVENANCE_SCHEMA) {
    return undefined;
  }
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
    const status = normalizeStatus(rec['status']);
    agents[id] = {
      display_name: name,
      persistent_name: name,
      role: role ?? id,
      universe,
      // preserve a recorded lifecycle status: a retired agent must not be silently resurrected
      status,
      ...(status === 'retired' ? { retired_at: isTs(rec['retired_at']) ? rec['retired_at'] : generatedAt } : {}),
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

interface CastingDiskSnapshot {
  registryBytes: Buffer | undefined;
  registryRaw: string | undefined;
  historyBytes: Buffer | undefined;
  historyRaw: string | undefined;
  manifestBytes: Buffer | undefined;
  manifestRaw: string | undefined;
  journalBytes: Buffer | undefined;
  journalRaw: string | undefined;
  existingEntries: Set<string>;
}

function readOptionalBytes(filePath: string): Buffer | undefined {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined;
    }
    throw error;
  }
}

function assertNotSymlink(targetPath: string): fs.Stats | undefined {
  try {
    const st = fs.lstatSync(targetPath);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing to operate on symlinked casting path: ${targetPath}`);
    }
    return st;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined;
    }
    throw error;
  }
}

function verifyCastingDirectoryAndFiles(castingDir: string, extraPaths: string[] = []): boolean {
  const parentSt = assertNotSymlink(path.dirname(castingDir));
  if (!parentSt || !parentSt.isDirectory()) return false;
  const dirSt = assertNotSymlink(castingDir);
  if (!dirSt || !dirSt.isDirectory()) return false;
  for (const name of ['registry.json', 'history.json', COMMIT_MANIFEST, JOURNAL_FILE]) {
    assertNotSymlink(path.join(castingDir, name));
  }
  for (const extra of extraPaths) {
    assertNotSymlink(extra);
  }
  return true;
}

function captureDiskSnapshot(castingDir: string): CastingDiskSnapshot {
  const registryBytes = readOptionalBytes(path.join(castingDir, 'registry.json'));
  const historyBytes = readOptionalBytes(path.join(castingDir, 'history.json'));
  const manifestBytes = readOptionalBytes(path.join(castingDir, COMMIT_MANIFEST));
  const journalBytes = readOptionalBytes(path.join(castingDir, JOURNAL_FILE));
  return {
    registryBytes,
    registryRaw: registryBytes?.toString('utf8'),
    historyBytes,
    historyRaw: historyBytes?.toString('utf8'),
    manifestBytes,
    manifestRaw: manifestBytes?.toString('utf8'),
    journalBytes,
    journalRaw: journalBytes?.toString('utf8'),
    existingEntries: new Set(fs.readdirSync(castingDir)),
  };
}

function restoreDiskSnapshot(castingDir: string, snapshot: CastingDiskSnapshot): void {
  const tracked: Array<[string, Buffer | undefined]> = [
    [path.join(castingDir, 'registry.json'), snapshot.registryBytes],
    [path.join(castingDir, 'history.json'), snapshot.historyBytes],
    [path.join(castingDir, COMMIT_MANIFEST), snapshot.manifestBytes],
    [path.join(castingDir, JOURNAL_FILE), snapshot.journalBytes],
  ];
  for (const [filePath, bytes] of tracked) {
    if (bytes !== undefined) {
      fs.writeFileSync(filePath, bytes);
    } else {
      fs.rmSync(filePath, { force: true });
    }
  }
  for (const entry of fs.readdirSync(castingDir)) {
    if (entry.startsWith('registry.lock')) continue;
    if (!snapshot.existingEntries.has(entry)) {
      fs.rmSync(path.join(castingDir, entry), { recursive: true, force: true });
    }
  }
}

function commitManifestMismatch(snapshot: CastingDiskSnapshot): boolean {
  if (snapshot.manifestRaw === undefined) return false;
  try {
    validateCastingRegistryPairRaw(
      snapshot.registryRaw,
      snapshot.historyRaw,
      snapshot.journalRaw,
      snapshot.manifestRaw,
    );
    return false;
  } catch (error) {
    return /commit manifest/i.test(error instanceof Error ? error.message : String(error));
  }
}

function hasExistingCastHistory(historyRaw: string | undefined): boolean {
  if (historyRaw === undefined) return false;
  try {
    const history = JSON.parse(historyRaw) as unknown;
    if (!isRecord(history)) return true;
    const snapshots = history['assignment_cast_snapshots'];
    const usage = history['universe_usage_history'];
    const assignments = history['assignments'];
    const hasSnapshots = isRecord(snapshots) && Object.keys(snapshots).length > 0;
    const hasUsage = Array.isArray(usage) && usage.length > 0;
    const hasAssignments = Array.isArray(assignments);
    return hasSnapshots || hasUsage || hasAssignments;
  } catch {
    return true;
  }
}

export interface RepairHandwrittenOptions {
  /** Override the `generated_at` timestamp when normalizing a handwritten registry. */
  now?: string;
  /** When true, keep `*.handwritten.bak` copies of pre-repair files. Defaults to false. */
  keepBackup?: boolean;
  /** When true, validate that repair would succeed in memory without mutating disk. */
  dryRun?: boolean;
}

function resolveRepairOptions(
  nowOrOptions?: string | RepairHandwrittenOptions,
  maybeOptions?: RepairHandwrittenOptions,
): Required<RepairHandwrittenOptions> {
  const opts = typeof nowOrOptions === 'object' && nowOrOptions !== null ? nowOrOptions : (maybeOptions ?? {});
  const now = typeof nowOrOptions === 'string' ? nowOrOptions : (opts.now ?? new Date().toISOString());
  return {
    now,
    keepBackup: Boolean(opts.keepBackup),
    dryRun: Boolean(opts.dryRun),
  };
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
 * Repair `registry.json` in place when it is handwritten and unreadable.
 * Acquires the casting writer lock BEFORE reading `registry.json`, `history.json`,
 * or `registry-history.commit.json`. By default no `*.handwritten.bak` files are
 * left behind unless `options.keepBackup === true`. If `commitCastingRegistryPair`
 * fails or throws, the original in-memory snapshot is restored to disk and the
 * error is rethrown (never falling back to a fresh cast).
 */
export function repairHandwrittenCastingRegistry(
  castingDir: string,
  nowOrOptions?: string | RepairHandwrittenOptions,
  maybeOptions?: RepairHandwrittenOptions,
): RepairResult {
  const options = resolveRepairOptions(nowOrOptions, maybeOptions);
  if (!verifyCastingDirectoryAndFiles(castingDir)) {
    return { repaired: false, files: [] };
  }
  const release = options.dryRun
    ? () => {}
    : acquireCastingRegistryLock(castingDir, 'handwritten registry repair');
  try {
    verifyCastingDirectoryAndFiles(castingDir);
    const snapshot = captureDiskSnapshot(castingDir);
    if (snapshot.registryRaw === undefined) {
      return { repaired: false, files: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshot.registryRaw);
    } catch {
      return { repaired: false, files: [], reason: 'registry.json is not valid JSON' };
    }
    if (isRecord(parsed) && parsed['schema'] !== undefined && parsed['schema'] !== AGENT_PROVENANCE_SCHEMA) {
      return { repaired: false, files: [], reason: 'registry.json has an unsupported schema' };
    }
    const hasManifest = snapshot.manifestRaw !== undefined;
    const hasAgents = isRecord(parsed) && isRecord(parsed['agents']) && Object.keys(parsed['agents']).length > 0;
    const manifestMismatch = hasManifest && isAcceptable(parsed) && hasAgents && commitManifestMismatch(snapshot);
    if (isAcceptable(parsed) && !manifestMismatch) {
      return { repaired: false, files: [] };
    }
    if (manifestMismatch) {
      return recommitExistingPair(castingDir, snapshot, options);
    }
    if (hasExistingCastHistory(snapshot.historyRaw)) {
      return { repaired: false, files: [], reason: 'history.json already contains cast history' };
    }
    const normalized = normalizeHandwrittenCastingRegistry(parsed, options.now);
    if (!normalized) {
      return { repaired: false, files: [], reason: 'registry.json has no recoverable agents' };
    }
    return commitGenesisPair(castingDir, snapshot, normalized, options);
  } finally {
    release();
  }
}

function recommitExistingPair(
  castingDir: string,
  snapshot: CastingDiskSnapshot,
  options: Required<RepairHandwrittenOptions>,
): RepairResult {
  if (snapshot.registryRaw === undefined || snapshot.historyRaw === undefined) {
    return { repaired: false, files: [], reason: 'history.json is required to recommit pair' };
  }
  let registry: unknown;
  let history: unknown;
  try {
    registry = JSON.parse(snapshot.registryRaw);
    history = JSON.parse(snapshot.historyRaw);
  } catch {
    return { repaired: false, files: [], reason: 'registry.json or history.json is not valid JSON' };
  }
  if (!isRecord(registry) || !isRecord(history) || typeof registry['revision'] !== 'number') {
    return { repaired: false, files: [], reason: 'registry/history pair is missing revision metadata' };
  }
  const { transaction_id: _rt, ...reg } = registry;
  const { transaction_id: _ht, registry_revision: _hr, ...hist } = history;
  void _rt;
  void _ht;
  void _hr;
  return commitPairWithRollback(castingDir, snapshot, reg, hist, registry['revision'], options);
}

function commitGenesisPair(
  castingDir: string,
  snapshot: CastingDiskSnapshot,
  normalized: AgentProvenanceRegistry,
  options: Required<RepairHandwrittenOptions>,
): RepairResult {
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
  return commitPairWithRollback(castingDir, snapshot, registry, history, normalized.revision, options);
}

function commitPairWithRollback(
  castingDir: string,
  snapshot: CastingDiskSnapshot,
  registry: Record<string, unknown>,
  history: Record<string, unknown>,
  targetRevision: number,
  options: Required<RepairHandwrittenOptions>,
): RepairResult {
  validateCastingRegistryPairForCommit(registry, history, targetRevision);
  if (options.dryRun) {
    return { repaired: true, files: ['registry.json', 'history.json', COMMIT_MANIFEST] };
  }
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const manifestPath = path.join(castingDir, COMMIT_MANIFEST);
  try {
    if (options.keepBackup) {
      for (const [filePath, bytes] of [
        [registryPath, snapshot.registryBytes],
        [historyPath, snapshot.historyBytes],
        [manifestPath, snapshot.manifestBytes],
      ] as const) {
        const bakPath = `${filePath}.handwritten.bak`;
        if (bytes !== undefined && !fs.existsSync(bakPath)) {
          fs.writeFileSync(bakPath, bytes);
        }
      }
    }
    commitCastingRegistryPair(
      castingDir,
      snapshot.registryRaw,
      registry,
      snapshot.historyRaw,
      history,
      targetRevision,
    );
    readCastingRegistryPair(castingDir, 1);
    return { repaired: true, files: ['registry.json', 'history.json', COMMIT_MANIFEST] };
  } catch (error) {
    restoreDiskSnapshot(castingDir, snapshot);
    throw error;
  }
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
export function backfillCastingRegistryFromTeam(
  castingDir: string,
  teamMdPath: string,
  nowOrOptions?: string | RepairHandwrittenOptions,
  maybeOptions?: RepairHandwrittenOptions,
): RepairResult {
  const options = resolveRepairOptions(nowOrOptions, maybeOptions);
  if (!verifyCastingDirectoryAndFiles(castingDir, [teamMdPath])) {
    return { repaired: false, files: [] };
  }
  const release = options.dryRun
    ? () => {}
    : acquireCastingRegistryLock(castingDir, 'team.md registry backfill');
  try {
    verifyCastingDirectoryAndFiles(castingDir, [teamMdPath]);
    const teamBytes = readOptionalBytes(teamMdPath);
    if (teamBytes === undefined) {
      return { repaired: false, files: [] };
    }
    const snapshot = captureDiskSnapshot(castingDir);
    if (snapshot.registryRaw === undefined) {
      return { repaired: false, files: [] };
    }
    let current: unknown;
    try {
      current = JSON.parse(snapshot.registryRaw);
    } catch {
      return { repaired: false, files: [], reason: 'registry.json is not valid JSON' };
    }
    if (!isRecord(current) || !isRecord(current['agents']) || Object.keys(current['agents']).length > 0) {
      return { repaired: false, files: [] };
    }
    if (hasExistingCastHistory(snapshot.historyRaw)) {
      return { repaired: false, files: [] };
    }
    const { members, universe } = parseTeamRoster(teamBytes.toString('utf8'));
    const normalized = normalizeHandwrittenCastingRegistry({ universe, agents: members }, options.now);
    if (!normalized) {
      return { repaired: false, files: [], reason: 'team.md has no specialist members' };
    }
    return commitGenesisPair(castingDir, snapshot, normalized, options);
  } finally {
    release();
  }
}
