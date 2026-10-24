/**
 * Tolerant repair of LLM-handwritten `.squad/casting/registry.json`.
 *
 * Models doing Init Mode often write the registry in an ad-hoc shape (role keys,
 * an `agents` array, `{ name, role, status }` entries, no schema fields). The
 * durable registry reader rejects those, which used to crash `squad upgrade`.
 * This module normalizes such shapes into the canonical
 * `squad-agent-provenance/v1` registry, record by record: records that already
 * parse as valid provenance records are preserved verbatim, incomplete records
 * only get their missing fields synthesized, and any record that would have to
 * be dropped fails the whole repair closed. Canonical and valid legacy
 * registries are never touched.
 *
 * @module casting/handwritten-registry
 */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CastingCommitInDoubtError,
  acquireCastingRegistryLock,
  commitCastingRegistryPair,
  readCastingRegistryPair,
  recoverCastingRegistryTransaction,
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
  'transaction_id', 'registry_revision',
]);
const CANONICAL_ROOT_KEYS = new Set([
  'schema', 'schema_version', 'revision', 'generated_at', 'agents', 'transaction_id', 'registry_revision',
]);
const IDENTITY_FIELDS = ['name', 'persistent_name', 'display_name', 'role'];
const STATUSES: readonly AgentProvenanceStatus[] = ['active', 'inactive', 'retired'];
const COMMIT_MANIFEST = 'registry-history.commit.json';
const JOURNAL_FILE = 'registry-history.transaction.json';
const ARCHIVE_PREFIX = 'handwritten-archive-';
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
function normalizeStatus(v: unknown): AgentProvenanceStatus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (STATUSES as readonly string[]).includes(s) ? (s as AgentProvenanceStatus) : 'active';
}
const isTs = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));
const stripBom = (raw: string): string => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
const sha256 = (...parts: Array<string | undefined>): string =>
  createHash('sha256').update(parts.map((p) => p ?? '').join('\u0000'), 'utf8').digest('hex');

export function toAgentId(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface DroppedRecord { name: string; reason: string }

/** Agent record with any producer-specific extra fields preserved. */
export type PreservedProvenanceRecord = AgentProvenanceRecord & Record<string, unknown>;

export interface NormalizeHandwrittenResult {
  /** Present only when every entry could be normalized. */
  registry?: AgentProvenanceRegistry & Record<string, unknown>;
  /** Entries that could not be normalized; non-empty means the repair fails closed. */
  dropped: DroppedRecord[];
  reason?: string;
}

interface RawEntry { key?: string; value: unknown }

function collectEntries(root: Record<string, unknown>): { entries: RawEntry[]; dropped: DroppedRecord[] } {
  const agents = root['agents'];
  if (Array.isArray(agents)) return { entries: agents.map((value) => ({ value })), dropped: [] };
  if (isRecord(agents)) {
    return { entries: Object.entries(agents).map(([key, value]) => ({ key, value })), dropped: [] };
  }
  // no wrapper: only non-meta keys whose value is a record carrying identity fields are agents
  const entries: RawEntry[] = [];
  const dropped: DroppedRecord[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (META_KEYS.has(key)) continue;
    if (!isRecord(value)) {
      dropped.push({ name: key, reason: typeof value === 'string'
        ? 'bare string value is ambiguous (role → name or name → role); write an object with name and role'
        : 'value is not an agent record' });
      continue;
    }
    if (!IDENTITY_FIELDS.some((f) => str(value[f]))) {
      dropped.push({ name: key, reason: 'record has none of name, persistent_name, display_name, or role' });
      continue;
    }
    entries.push({ key, value });
  }
  return { entries, dropped };
}

function recordDiagnostics(id: string, record: Record<string, unknown>): string[] {
  try {
    const parsed = parseAgentProvenanceRegistry({
      schema: AGENT_PROVENANCE_SCHEMA,
      schema_version: AGENT_PROVENANCE_VERSION,
      revision: 1,
      generated_at: '1970-01-01T00:00:00.000Z',
      agents: { [id]: record },
    });
    return parsed.diagnostics.map((d) => `${d.path.replace(/^agents\.[^.]+\.?/, '') || 'record'}: ${d.message}`);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/**
 * Normalize an arbitrary handwritten registry into the canonical shape. Valid
 * records are preserved verbatim; incomplete ones are completed in place. Any
 * entry that cannot be normalized is reported in `dropped` and no registry is
 * returned.
 */
export function normalizeHandwrittenCastingRegistry(value: unknown, now = new Date().toISOString()): NormalizeHandwrittenResult {
  const rootRaw = Array.isArray(value) ? { agents: value } : value;
  if (!isRecord(rootRaw)) return { dropped: [], reason: 'registry.json root is not an object or array' };
  if (rootRaw['schema'] !== undefined && rootRaw['schema'] !== AGENT_PROVENANCE_SCHEMA) {
    return { dropped: [], reason: 'registry.json has an unsupported schema' };
  }
  const { entries, dropped } = collectEntries(rootRaw);
  const firstEntryUniverse = entries.map((e) => (isRecord(e.value) ? str(e.value['universe']) : undefined)).find(Boolean);
  const rootUniverse = str(rootRaw['universe']) ?? firstEntryUniverse ?? 'unspecified';
  // a repair is a new generation: the registry is stamped `now`, but records missing created_at
  // inherit the author's generated_at when it is valid
  const authoredAt = isTs(rootRaw['generated_at']) ? rootRaw['generated_at'] : now;
  const previousRevision = Number.isSafeInteger(rootRaw['revision']) && (rootRaw['revision'] as number) >= 1
    ? (rootRaw['revision'] as number)
    : undefined;

  const agents: Record<string, PreservedProvenanceRecord> = {};
  const owners = new Map<string, string>();
  for (const { key, value: raw } of entries) {
    if (!isRecord(raw)) {
      dropped.push({ name: key ?? String(raw), reason: 'entry is not an agent record' });
      continue;
    }
    const explicitId = str(raw['id']);
    const validUnderKey = !explicitId && key !== undefined && ID_PATTERN.test(key) && recordDiagnostics(key, raw).length === 0;
    let name = str(raw['persistent_name']) ?? str(raw['display_name']) ?? str(raw['name']) ?? str(raw['agent']) ?? str(raw['id']);
    let role = str(raw['role']) ?? str(raw['title']);
    const keyMatchesNameSlug = Boolean(
      key && name && (
        toAgentId(key) === toAgentId(name)
        || toAgentId(key).replace(/-/g, '') === toAgentId(name).replace(/-/g, '')
      ),
    );
    const keyMatchesAvatarPath = Boolean(
      key && isRecord(raw['avatar']) && str(raw['avatar']['path'])?.startsWith(`.squad/agents/${key}/`),
    );
    // role-keyed entry without an explicit role: the key is the role
    if (!validUnderKey && !role && key && name && !keyMatchesNameSlug && !keyMatchesAvatarPath) role = key;
    name ??= key;
    if (!name) {
      dropped.push({ name: key ?? '(unnamed)', reason: 'entry has no name' });
      continue;
    }
    const id = validUnderKey
      ? key!
      : explicitId
        ? toAgentId(explicitId)
        : key && ID_PATTERN.test(key) && (keyMatchesNameSlug || keyMatchesAvatarPath)
          ? key
          : key && toAgentId(key) === toAgentId(name)
            ? key
            : toAgentId(name);
    if (!id || !ID_PATTERN.test(id)) {
      dropped.push({ name, reason: `cannot derive a lowercase kebab-case agent id from "${explicitId ?? key ?? name}"` });
      continue;
    }
    if (agents[id]) {
      dropped.push({ name, reason: `agent id "${id}" collides with "${agents[id].display_name}"` });
      continue;
    }
    const owner = owners.get(name.toLowerCase());
    if (owner) {
      dropped.push({ name, reason: `display name duplicates agent "${owner}"` });
      continue;
    }

    let record: Record<string, unknown> = raw;
    if (recordDiagnostics(id, raw).length > 0) {
      const status = normalizeStatus(raw['status']);
      // the id lives in the map key; an `id` field is only an input hint for incomplete records
      const { id: _id, ...fields } = raw;
      void _id;
      record = {
        ...fields,
        display_name: name,
        persistent_name: name,
        role: role ?? id,
        universe: str(raw['universe']) ?? rootUniverse,
        // preserve a recorded lifecycle status: a retired agent must not be silently resurrected
        status,
        created_at: isTs(raw['created_at']) ? raw['created_at'] : authoredAt,
        updated_at: isTs(raw['updated_at']) ? raw['updated_at'] : now,
        ...(status === 'retired' ? { retired_at: isTs(raw['retired_at']) ? raw['retired_at'] : now } : {}),
      };
      const remaining = recordDiagnostics(id, record);
      if (remaining.length > 0) {
        dropped.push({ name, reason: remaining.join('; ') });
        continue;
      }
    }
    owners.set(name.toLowerCase(), id);
    agents[id] = record as PreservedProvenanceRecord;
  }
  if (dropped.length > 0) {
    return { dropped, reason: `${dropped.length} registry entr${dropped.length === 1 ? 'y' : 'ies'} could not be normalized` };
  }
  if (Object.keys(agents).length === 0) return { dropped, reason: 'registry.json has no recoverable agents' };
  // keep harmless root metadata the author wrote (universe, description, ...) but never agent-like keys
  const extras = Object.fromEntries(Object.entries(rootRaw).filter(([k]) => META_KEYS.has(k) && !CANONICAL_ROOT_KEYS.has(k)));
  return {
    dropped,
    registry: {
      ...extras,
      schema: AGENT_PROVENANCE_SCHEMA,
      schema_version: AGENT_PROVENANCE_VERSION,
      revision: previousRevision === undefined ? 1 : previousRevision + 1,
      generated_at: now,
      agents,
    },
  };
}

function isAcceptable(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value['schema'] !== undefined) {
    try { return parseAgentProvenanceRegistry(value).completeness === 'complete'; } catch { return false; }
  }
  // legacy registries are read by the durable reader; only repair what it cannot read
  if (!isRecord(value['agents'])) return false;
  return Object.keys(value['agents']).length > 0 && Object.entries(value['agents']).every(([id, a]) => ID_PATTERN.test(id)
    && isRecord(a)
    && !!str(a['persistent_name']) && isTs(a['created_at']) && !!str(a['universe'])
    && (STATUSES as readonly string[]).includes(String(a['status']))
    && (a['status'] !== 'retired' || isTs(a['retired_at'])));
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
  for (const entry of fs.readdirSync(castingDir)) {
    if (entry.startsWith(ARCHIVE_PREFIX)) {
      assertNotSymlink(path.join(castingDir, entry));
    }
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

/** Write via temp file + fsync + rename so a crash never leaves a torn file in place. */
function writeFileDurably(filePath: string, bytes: Buffer): void {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    const descriptor = fs.openSync(tempPath, 'wx', 0o600);
    try {
      fs.writeSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
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
      if (!readOptionalBytes(filePath)?.equals(bytes)) writeFileDurably(filePath, bytes);
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

function attachRestoreFailure(error: unknown, restoreError: unknown): void {
  if (!(error instanceof Error)) return;
  const previous = (error as { cause?: unknown }).cause;
  (error as { cause?: unknown }).cause = previous === undefined
    ? restoreError
    : new AggregateError([previous, restoreError], 'Restoring the pre-repair casting snapshot also failed');
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
    return /commit manifest|registry revision does not match/i.test(
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * True when `history.json` records any cast evidence (assignment snapshots,
 * universe usage, or legacy assignments). Empty arrays and objects are not
 * history; unreadable history counts as history so callers fail closed.
 */
export function hasExistingCastHistory(historyRaw: string | undefined): boolean {
  if (historyRaw === undefined) return false;
  try {
    const history = JSON.parse(stripBom(historyRaw)) as unknown;
    if (!isRecord(history)) return true;
    return Object.entries(history).some(([key, value]) => {
      if (['transaction_id', 'registry_revision'].includes(key)) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (isRecord(value)) return Object.keys(value).length > 0;
      return value !== undefined && value !== null;
    });
  } catch {
    return true;
  }
}

const HISTORY_BLOCKER = 'history.json already contains cast history';

/**
 * Build the genesis history for a repaired registry. When `history.json` holds a
 * single model-written assignment snapshot that references only agents of the
 * repaired registry, that snapshot is normalized (id/name references resolved,
 * usage entry derived) instead of being treated as a blocker.
 */
function normalizeHandwrittenHistory(
  historyRaw: string | undefined,
  registry: AgentProvenanceRegistry,
): { history?: Record<string, unknown>; reason?: string } {
  const agents = registry.agents;
  const ids = Object.keys(agents);
  const universe = agents[ids[0]!]!.universe;
  const genesis = (): Record<string, unknown> => ({
    universe_usage_history: [{ universe, used_at: registry.generated_at }],
    assignment_cast_snapshots: {
      'handwritten-cast-import': { universe, created_at: registry.generated_at, agents: ids },
    },
  });
  if (!hasExistingCastHistory(historyRaw)) return { history: genesis() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(historyRaw!));
  } catch {
    return { reason: `${HISTORY_BLOCKER} that is not valid JSON` };
  }
  if (!isRecord(parsed)) return { reason: HISTORY_BLOCKER };
  const unknownKeys = Object.keys(parsed).filter((k) => !['universe_usage_history', 'assignment_cast_snapshots', 'transaction_id', 'registry_revision'].includes(k));
  if (unknownKeys.length > 0) {
    return { reason: `${HISTORY_BLOCKER} in an unsupported shape (${unknownKeys.join(', ')})` };
  }
  const snapshots = parsed['assignment_cast_snapshots'];
  const usage = parsed['universe_usage_history'] ?? [];
  if (!isRecord(snapshots) || !Array.isArray(usage)) return { reason: HISTORY_BLOCKER };
  const snapshotEntries = Object.entries(snapshots);
  if (snapshotEntries.length !== 1 || usage.length > 1) {
    return { reason: `${HISTORY_BLOCKER} (${snapshotEntries.length} snapshots, ${usage.length} usage entries); only a single Init Mode snapshot can be normalized` };
  }
  const [rawKey, rawSnapshot] = snapshotEntries[0]!;
  if (!isRecord(rawSnapshot)) return { reason: `${HISTORY_BLOCKER} with a malformed snapshot` };
  const byName = new Map(Object.entries(agents).map(([id, rec]) => [rec.display_name.toLowerCase(), id]));
  const resolveValue = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string') return undefined;
    const trimmed = ref.trim();
    if (!trimmed) return undefined;
    if (Object.hasOwn(agents, trimmed)) return trimmed;
    return byName.get(trimmed.toLowerCase()) ?? (Object.hasOwn(agents, toAgentId(trimmed)) ? toAgentId(trimmed) : undefined);
  };
  const rawAgents = rawSnapshot['agents'];
  const refs: Array<[unknown, string | undefined]> = Array.isArray(rawAgents)
    ? rawAgents.map((r) => [r, undefined])
    : isRecord(rawAgents) ? Object.entries(rawAgents).map(([k, v]) => [v, k]) : [];
  if (refs.length === 0) return { reason: `${HISTORY_BLOCKER} whose snapshot lists no agents` };
  const members: string[] = [];
  for (const [ref, hint] of refs) {
    const id = resolveValue(ref);
    if (!id) return { reason: `${HISTORY_BLOCKER} referencing unknown agent "${String(ref ?? hint)}"` };
    if (hint !== undefined) {
      const trimmedHint = hint.trim();
      const hintAgentId = Object.hasOwn(agents, trimmedHint)
        ? trimmedHint
        : byName.get(trimmedHint.toLowerCase());
      if (hintAgentId !== undefined && hintAgentId !== id) {
        return { reason: `${HISTORY_BLOCKER} where snapshot key "${hint}" disagrees with agent "${String(ref)}"` };
      }
    }
    if (members.includes(id)) return { reason: `${HISTORY_BLOCKER} referencing agent "${id}" twice` };
    members.push(id);
  }
  const key = str(rawSnapshot['assignment_id']) ?? str(rawKey);
  if (!key) return { reason: `${HISTORY_BLOCKER} with an unnamed snapshot` };
  const snapshotUniverse = str(rawSnapshot['universe']) ?? universe;
  const createdAt = isTs(rawSnapshot['created_at']) ? rawSnapshot['created_at'] : registry.generated_at;
  const rawUsage = usage[0];
  if (rawUsage !== undefined && !isRecord(rawUsage)) return { reason: `${HISTORY_BLOCKER} with malformed usage history` };
  const usageUniverse = rawUsage ? str(rawUsage['universe']) ?? snapshotUniverse : snapshotUniverse;
  const usedAt = rawUsage && isTs(rawUsage['used_at']) ? rawUsage['used_at'] : createdAt;
  return {
    history: {
      universe_usage_history: [{ universe: usageUniverse, used_at: usedAt }],
      assignment_cast_snapshots: { [key]: { universe: snapshotUniverse, created_at: createdAt, agents: members } },
    },
  };
}

export interface RepairHandwrittenOptions {
  /** Override the `generated_at` timestamp when normalizing a handwritten registry. */
  now?: string;
  /**
   * Archive the pre-repair `registry.json`, `history.json`, and commit manifest under
   * `handwritten-archive-<sha256>/` inside the casting directory. Defaults to true.
   */
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
    keepBackup: opts.keepBackup ?? true,
    dryRun: Boolean(opts.dryRun),
  };
}

export interface RepairResult {
  repaired: boolean;
  /** Relative file names written or created inside the casting directory. */
  files: string[];
  /** Relative directory inside the casting directory holding the pre-repair originals. */
  backupPath?: string;
  reason?: string;
  /** Entries that blocked the repair; present only when the repair failed closed because of them. */
  dropped?: DroppedRecord[];
}

const NOOP: RepairResult = { repaired: false, files: [] };

function failed(reason: string, dropped?: DroppedRecord[]): RepairResult {
  return { repaired: false, files: [], reason, ...(dropped && dropped.length > 0 ? { dropped } : {}) };
}

/**
 * Repair `registry.json` in place when it is handwritten and unreadable.
 * Acquires the casting writer lock BEFORE reading `registry.json`, `history.json`,
 * or `registry-history.commit.json`, and rolls a pending durable transaction
 * forward before taking its snapshot. Pre-repair originals are archived under
 * `handwritten-archive-<sha256>/` unless `options.keepBackup === false`. If
 * `commitCastingRegistryPair` fails before its journal is durable, the original
 * snapshot is restored and the error rethrown; once the journal is durable the
 * commit is only ever rolled forward (never falling back to a fresh cast).
 */
export function repairHandwrittenCastingRegistry(
  castingDir: string,
  nowOrOptions?: string | RepairHandwrittenOptions,
  maybeOptions?: RepairHandwrittenOptions,
): RepairResult {
  const options = resolveRepairOptions(nowOrOptions, maybeOptions);
  if (!verifyCastingDirectoryAndFiles(castingDir)) {
    return NOOP;
  }
  const release = options.dryRun
    ? () => {}
    : acquireCastingRegistryLock(castingDir, 'handwritten registry repair');
  try {
    verifyCastingDirectoryAndFiles(castingDir);
    if (!options.dryRun) recoverCastingRegistryTransaction(castingDir);
    const snapshot = captureDiskSnapshot(castingDir);
    if (snapshot.registryRaw === undefined) {
      return NOOP;
    }
    if (snapshot.journalRaw !== undefined) {
      return failed('a durable casting transaction is awaiting roll-forward');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(snapshot.registryRaw));
    } catch {
      return failed('registry.json is not valid JSON');
    }
    if (isRecord(parsed) && parsed['schema'] !== undefined && parsed['schema'] !== AGENT_PROVENANCE_SCHEMA) {
      return failed('registry.json has an unsupported schema');
    }
    const hasManifest = snapshot.manifestRaw !== undefined;
    const hasAgents = isRecord(parsed) && isRecord(parsed['agents']) && Object.keys(parsed['agents']).length > 0;
    const manifestMismatch = hasManifest && isAcceptable(parsed) && hasAgents && commitManifestMismatch(snapshot);
    if (isAcceptable(parsed) && !manifestMismatch) {
      return NOOP;
    }
    if (manifestMismatch) {
      const unmintedInitOverwrite = isRecord(parsed)
        && parsed['transaction_id'] === undefined
        && !hasExistingCastHistory(snapshot.historyRaw);
      if (!unmintedInitOverwrite) {
        return recommitExistingPair(castingDir, snapshot, options);
      }
    }
    const normalized = normalizeHandwrittenCastingRegistry(parsed, options.now);
    if (!normalized.registry) {
      return failed(normalized.reason ?? 'registry.json has no recoverable agents', normalized.dropped);
    }
    const history = normalizeHandwrittenHistory(snapshot.historyRaw, normalized.registry);
    if (!history.history) {
      return failed(history.reason ?? HISTORY_BLOCKER);
    }
    return commitGenesisPair(castingDir, snapshot, normalized.registry, history.history, options);
  } finally {
    release();
  }
}

function recommitExistingPair(
  castingDir: string,
  snapshot: CastingDiskSnapshot,
  options: Required<RepairHandwrittenOptions>,
): RepairResult {
  if (snapshot.registryRaw === undefined || snapshot.historyRaw === undefined || snapshot.manifestRaw === undefined) {
    return failed('history.json and commit manifest are required to recommit pair');
  }
  let registry: unknown;
  let history: unknown;
  let manifest: unknown;
  try {
    registry = JSON.parse(stripBom(snapshot.registryRaw));
    history = JSON.parse(stripBom(snapshot.historyRaw));
    manifest = JSON.parse(stripBom(snapshot.manifestRaw));
  } catch {
    return failed('registry.json, history.json, or commit manifest is not valid JSON');
  }
  if (!isRecord(history)) {
    return failed(`${HISTORY_BLOCKER} that is not an object`);
  }
  if (!isRecord(registry) || !Number.isSafeInteger(registry['revision']) || (registry['revision'] as number) < 1) {
    return failed('registry/history pair is missing revision metadata');
  }
  if (
    !isRecord(manifest)
    || manifest['version'] !== 1
    || typeof manifest['transaction_id'] !== 'string'
    || manifest['transaction_id'].length === 0
    || !Number.isSafeInteger(manifest['registry_revision'])
    || (manifest['registry_revision'] as number) < 1
  ) {
    return failed('commit manifest is malformed');
  }
  const expectedTxId = manifest['transaction_id'];
  const expectedRevision = manifest['registry_revision'] as number;
  if (
    registry['transaction_id'] !== expectedTxId
    || history['transaction_id'] !== expectedTxId
    || registry['revision'] !== expectedRevision
    || history['registry_revision'] !== expectedRevision
  ) {
    return failed('registry, history, and commit manifest generation metadata do not agree');
  }
  const nextRevision = expectedRevision + 1;
  const { transaction_id: _rt, ...reg } = registry;
  const { transaction_id: _ht, registry_revision: _hr, ...hist } = history;
  void _rt;
  void _ht;
  void _hr;
  return commitPairWithRollback(castingDir, snapshot, { ...reg, revision: nextRevision }, hist, nextRevision, options);
}

function commitGenesisPair(
  castingDir: string,
  snapshot: CastingDiskSnapshot,
  normalized: AgentProvenanceRegistry,
  history: Record<string, unknown>,
  options: Required<RepairHandwrittenOptions>,
): RepairResult {
  const { transaction_id: _t, ...registry } = normalized as unknown as Record<string, unknown>;
  void _t;
  return commitPairWithRollback(castingDir, snapshot, registry, history, normalized.revision, options);
}

function archiveOriginals(castingDir: string, snapshot: CastingDiskSnapshot): string {
  const archiveName = `${ARCHIVE_PREFIX}${sha256(snapshot.registryRaw, snapshot.historyRaw, snapshot.manifestRaw)}`;
  const archiveDir = path.join(castingDir, archiveName);
  const existingArchive = assertNotSymlink(archiveDir);
  if (existingArchive && !existingArchive.isDirectory()) {
    throw new Error(`Refusing to operate on non-directory casting archive path: ${archiveDir}`);
  }
  fs.mkdirSync(archiveDir, { recursive: true });
  assertNotSymlink(archiveDir);
  const originals: Array<[string, Buffer | undefined]> = [
    ['registry.json', snapshot.registryBytes],
    ['history.json', snapshot.historyBytes],
    [COMMIT_MANIFEST, snapshot.manifestBytes],
  ];
  for (const [name, bytes] of originals) {
    if (bytes === undefined) continue;
    const target = path.join(archiveDir, name);
    assertNotSymlink(target);
    const existing = readOptionalBytes(target);
    if (existing !== undefined && !existing.equals(bytes)) {
      throw new Error(`Cannot archive handwritten casting originals: archive differs at ${target}`);
    }
    if (existing === undefined) writeFileDurably(target, bytes);
  }
  return archiveName;
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
  const files = ['registry.json', 'history.json', COMMIT_MANIFEST];
  if (options.dryRun) {
    return { repaired: true, files };
  }
  let committed = false;
  try {
    const backupPath = options.keepBackup ? archiveOriginals(castingDir, snapshot) : undefined;
    commitCastingRegistryPair(
      castingDir,
      snapshot.registryRaw,
      registry,
      snapshot.historyRaw,
      history,
      targetRevision,
    );
    committed = true;
    readCastingRegistryPair(castingDir, 1);
    return { repaired: true, files, ...(backupPath ? { backupPath } : {}) };
  } catch (error) {
    // Once the journal is durable the commit must only roll forward; never restore previous bytes.
    if (committed || error instanceof CastingCommitInDoubtError) throw error;
    try {
      restoreDiskSnapshot(castingDir, snapshot);
    } catch (restoreError) {
      attachRestoreFailure(error, restoreError);
    }
    throw error;
  }
}

// ── backfill from team.md ───────────────────────────────────────────

const BUILTIN_NAMES = new Set(['scribe', 'ralph', 'rai', 'fact checker', 'fact-checker', 'squad', 'coordinator', 'copilot', '@copilot']);

export interface TeamRosterMember {
  name: string;
  role: string;
  /** Agent folder id taken from the `Charter` column (`.squad/agents/<id>/charter.md`), when present. */
  charterId?: string;
}

const UNIVERSE_LINE = /^\s*(?:[-*]\s+)?\*{0,2}universe\*{0,2}\s*:\s*\*{0,2}\s*([^\n|*]+?)\s*$/im;
const UNIVERSE_CELL = /^\s*\|\s*\*{0,2}universe\*{0,2}\s*\|\s*([^|\n]+?)\s*\|/im;

/** Parse specialist rows from `team.md` (`## Members` table, else the first Name/Role table). */
export function parseTeamRoster(teamMd: string): { members: TeamRosterMember[]; universe?: string } {
  const universe = (UNIVERSE_LINE.exec(teamMd)?.[1] ?? UNIVERSE_CELL.exec(teamMd)?.[1])?.replace(/[*_`]/g, '').trim();
  const lines = teamMd.split(/\r?\n/);
  const membersHeading = lines.findIndex((l) => /^##\s+members\b/i.test(l.trim()));
  const scope = membersHeading === -1
    ? lines
    : lines.slice(membersHeading + 1, (() => { const n = lines.findIndex((l, i) => i > membersHeading && /^##\s/.test(l)); return n === -1 ? lines.length : n; })());
  const members: TeamRosterMember[] = [];
  let nameCol = -1;
  let roleCol = -1;
  let statusCol = -1;
  let charterCol = -1;
  for (const line of scope) {
    if (!line.trim().startsWith('|')) { if (members.length > 0) break; nameCol = roleCol = statusCol = charterCol = -1; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (nameCol === -1) {
      nameCol = cells.findIndex((x) => /^name$/i.test(x));
      roleCol = cells.findIndex((x) => /^role$/i.test(x));
      statusCol = cells.findIndex((x) => /^status$/i.test(x));
      charterCol = cells.findIndex((x) => /^charter$/i.test(x));
      continue;
    }
    if (roleCol === -1 || cells.every((x) => /^:?-+:?$/.test(x))) continue;
    const name = cells[nameCol]?.replace(/[*_`]/g, '').trim();
    const role = cells[roleCol]?.replace(/[*_`]/g, '').trim();
    const status = statusCol === -1 ? '' : (cells[statusCol] ?? '');
    if (!name || !role || BUILTIN_NAMES.has(name.toLowerCase()) || name.startsWith('@') || /human|retired|alumni/i.test(status) || /human/i.test(role)) continue;
    const charterId = charterCol === -1 ? undefined : /agents[\\/]([^\\/|()\s]+)[\\/]charter\.md/i.exec(cells[charterCol] ?? '')?.[1];
    members.push({ name, role, ...(charterId ? { charterId } : {}) });
  }
  return { members, ...(universe ? { universe } : {}) };
}

/** Map charter `## Identity` names to the agent folders that declare them (duplicates retained to detect ambiguity). */
function charterIdentities(agentsDir: string): Map<string, string[]> {
  const identities = new Map<string, string[]>();
  if (!fs.existsSync(agentsDir)) return identities;
  for (const folder of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const charter = readOptionalBytes(path.join(agentsDir, folder.name, 'charter.md'))?.toString('utf8');
    if (charter === undefined) continue;
    for (const section of charter.matchAll(/^## Identity[ \t]*\r?\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/gm)) {
      for (const nameField of section[1]!.matchAll(/^- \*\*Name:\*\*[ \t]+([^\r\n]+)\r?$/gm)) {
        const name = nameField[1]!.trim().toLowerCase();
        identities.set(name, [...(identities.get(name) ?? []), folder.name]);
      }
    }
  }
  return identities;
}

/**
 * Resolve each roster row to its agent folder id. The registry id IS the agent
 * folder name, so ids are never derived from display names alone: the `Charter`
 * column path wins when its folder exists, then a charter whose `## Identity`
 * name matches, then a folder literally named `toAgentId(name)`.
 */
export function resolveRosterAgentIds(
  squadDir: string,
  members: readonly TeamRosterMember[],
): { resolved: Array<TeamRosterMember & { id: string }>; dropped: DroppedRecord[] } {
  const agentsDir = path.join(squadDir, 'agents');
  const identities = charterIdentities(agentsDir);
  const folderExists = (id: string): boolean => ID_PATTERN.test(id) && (assertNotSymlink(path.join(agentsDir, id))?.isDirectory() ?? false);
  const resolved: Array<TeamRosterMember & { id: string }> = [];
  const dropped: DroppedRecord[] = [];
  for (const member of members) {
    let id: string | undefined;
    if (member.charterId && folderExists(member.charterId)) {
      id = member.charterId;
    } else {
      const matches = identities.get(member.name.toLowerCase()) ?? [];
      if (matches.length > 1) {
        dropped.push({ name: member.name, reason: `charters of ${matches.join(', ')} all declare this name` });
        continue;
      }
      id = matches[0] && ID_PATTERN.test(matches[0]) ? matches[0] : undefined;
      if (!id && folderExists(toAgentId(member.name))) id = toAgentId(member.name);
    }
    if (!id) {
      dropped.push({
        name: member.name,
        reason: member.charterId
          ? `charter folder .squad/agents/${member.charterId}/ does not exist`
          : 'no .squad/agents/<id>/charter.md declares this name; the agent id cannot be proven',
      });
      continue;
    }
    if (resolved.some((r) => r.id === id)) {
      dropped.push({ name: member.name, reason: `agent folder "${id}" is already claimed by another roster row` });
      continue;
    }
    resolved.push({ ...member, id });
  }
  return { resolved, dropped };
}

/**
 * Backfill an EMPTY casting registry from the `team.md` roster. Models on older CLIs (no
 * `squad cast --name`) write team.md and charters directly and leave `registry.json` at
 * `agents: {}`. Registries that already have agents, absent registries and empty rosters
 * are left untouched. Every roster row must resolve to an existing agent folder and
 * team.md must declare a universe; otherwise the backfill fails closed with a reason.
 */
export function backfillCastingRegistryFromTeam(
  castingDir: string,
  teamMdPath: string,
  nowOrOptions?: string | RepairHandwrittenOptions,
  maybeOptions?: RepairHandwrittenOptions,
): RepairResult {
  const options = resolveRepairOptions(nowOrOptions, maybeOptions);
  if (!verifyCastingDirectoryAndFiles(castingDir, [teamMdPath])) {
    return NOOP;
  }
  const release = options.dryRun
    ? () => {}
    : acquireCastingRegistryLock(castingDir, 'team.md registry backfill');
  try {
    verifyCastingDirectoryAndFiles(castingDir, [teamMdPath]);
    const teamBytes = readOptionalBytes(teamMdPath);
    if (teamBytes === undefined) {
      return NOOP;
    }
    if (!options.dryRun) recoverCastingRegistryTransaction(castingDir);
    const snapshot = captureDiskSnapshot(castingDir);
    if (snapshot.registryRaw === undefined) {
      return NOOP;
    }
    if (snapshot.journalRaw !== undefined) {
      return failed('a durable casting transaction is awaiting roll-forward');
    }
    let current: unknown;
    try {
      current = JSON.parse(stripBom(snapshot.registryRaw));
    } catch {
      return failed('registry.json is not valid JSON');
    }
    if (!isRecord(current) || !isRecord(current['agents']) || Object.keys(current['agents']).length > 0) {
      return NOOP;
    }
    if (hasExistingCastHistory(snapshot.historyRaw)) {
      return NOOP;
    }
    const { members, universe } = parseTeamRoster(stripBom(teamBytes.toString('utf8')));
    if (members.length === 0) {
      return NOOP;
    }
    if (!universe) {
      return failed('team.md does not declare a universe (expected a `**Universe:** <name>` line); no universe will be invented');
    }
    const { resolved, dropped } = resolveRosterAgentIds(path.dirname(castingDir), members);
    if (dropped.length > 0) {
      return failed(`${dropped.length} team.md roster row${dropped.length === 1 ? '' : 's'} could not be mapped to an agent folder`, dropped);
    }
    const agents = Object.fromEntries(resolved.map(({ id, name, role }) => [id, { id, display_name: name, role }]));
    // the empty init pair's generated_at is a template placeholder; backfilled records are created `now`
    const normalized = normalizeHandwrittenCastingRegistry({ ...current, generated_at: options.now, universe, agents }, options.now);
    if (!normalized.registry) {
      return failed(normalized.reason ?? 'team.md has no specialist members', normalized.dropped);
    }
    const history = normalizeHandwrittenHistory(snapshot.historyRaw, normalized.registry);
    if (!history.history) {
      return failed(history.reason ?? HISTORY_BLOCKER);
    }
    return commitGenesisPair(castingDir, snapshot, normalized.registry, history.history, options);
  } finally {
    release();
  }
}
