/**
 * Preset application scaffolders.
 *
 * `applyPreset` copies agent charters into `.squad/agents/`, but to make the
 * resulting squad usable by the coordinator (and to satisfy the post-init
 * "Established Mode" mode-switch check) we must also wire the preset agents
 * into team.md, routing.md, and the casting state files. These helpers do
 * that in a merge-friendly way so calling `applyPreset` repeatedly is
 * idempotent and does not clobber pre-existing rows or entries.
 *
 * The cast command (`packages/squad-cli/src/cli/core/cast.ts`) has its own
 * fresh-write versions of these writers — see #1288 follow-up for a possible
 * future refactor that shares the logic. For now, the scope of #1288 is
 * focused on making preset apply produce a Coordinator-ready squad.
 *
 * @module presets/scaffold
 */

import {
  closeSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { reconcileAgentProvenanceRegistry } from '../casting/agent-provenance.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { PresetAgent } from './types.js';

const storage = new FSStorageProvider();

const MEMBERS_HEADER = '## Members';
const ROUTING_HEADER = '## Work Type → Agent';
const REGISTRY_UPDATE_MAX_ATTEMPTS = 8;
const REGISTRY_LOCK_TIMEOUT_MS = 30_000;
const REGISTRY_LOCK_RETRY_MS = 25;
const REGISTRY_LOCK_STALE_MS = 5_000;
const LOCK_METADATA_VERSION = 1;
const CASTING_TRANSACTION_VERSION = 2;
const syncWaitBuffer = new Int32Array(new SharedArrayBuffer(4));
let atomicWriteSequence = 0;

interface PresetRegistryTestHooks {
  afterSnapshot?: (context: { registryPath: string; attempt: number }) => void;
  beforeWrite?: (context: { filePath: string; stage: string }) => void;
  beforeRename?: (context: {
    registryPath: string;
    tempPath: string;
    attempt: number;
    filePath?: string;
    stage?: string;
  }) => void;
  afterStaleLockSnapshot?: (context: {
    lockPath: string;
    ownerToken: string;
  }) => void;
  beforeFsync?: (context: {
    filePath: string;
    stage: string;
    target: 'file' | 'directory';
  }) => void;
  afterDurabilityBoundary?: (context: {
    filePath: string;
    stage: string;
    boundary: 'file-fsync' | 'rename' | 'directory-fsync' | 'unlink';
  }) => void;
  now?: () => number;
  wait?: (milliseconds: number) => void;
  isProcessAlive?: (pid: number) => boolean | undefined;
  lockTimeoutMs?: number;
  staleLockAgeMs?: number;
}

let presetRegistryTestHooks: PresetRegistryTestHooks | null = null;

/** @internal Test-only deterministic conflict/failure injection. */
export function _setPresetRegistryHooksForTesting(
  hooks: PresetRegistryTestHooks | null,
): void {
  presetRegistryTestHooks = hooks;
}

interface ScaffoldOptions {
  /** Universe tag for the casting registry. Defaults to `preset:<name>`. */
  universe: string;
}

function waitSync(milliseconds: number): void {
  if (presetRegistryTestHooks?.wait) {
    presetRegistryTestHooks.wait(milliseconds);
    return;
  }
  Atomics.wait(syncWaitBuffer, 0, 0, milliseconds);
}

interface CastingLockMetadata {
  version: 1;
  pid: number;
  hostname: string;
  created_at: string;
  owner_token: string;
}

function nowMilliseconds(): number {
  return presetRegistryTestHooks?.now?.() ?? Date.now();
}

function createOwnerToken(): string {
  return `${process.pid}-${nowMilliseconds()}-${randomUUID()}`;
}

class SimulatedCastingCrash extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function durabilityBoundary(
  filePath: string,
  stage: string,
  boundary: 'file-fsync' | 'rename' | 'directory-fsync' | 'unlink',
): void {
  try {
    presetRegistryTestHooks?.afterDurabilityBoundary?.({ filePath, stage, boundary });
  } catch (error) {
    throw new SimulatedCastingCrash(error);
  }
}

function sameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function fsyncDirectory(directoryPath: string, stage: string, filePath: string): void {
  presetRegistryTestHooks?.beforeFsync?.({
    filePath,
    stage,
    target: 'directory',
  });
  if (process.platform === 'win32') {
    durabilityBoundary(filePath, stage, 'directory-fsync');
    return;
  }
  const descriptor = openSync(directoryPath, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  durabilityBoundary(filePath, stage, 'directory-fsync');
}

function durableUnlink(filePath: string, stage: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  durabilityBoundary(filePath, stage, 'unlink');
  fsyncDirectory(path.dirname(filePath), stage, filePath);
}

function writeAllSync(descriptor: number, content: string): void {
  const buffer = Buffer.from(content, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(descriptor, buffer, offset, buffer.length - offset);
    if (written === 0) throw new Error('Unable to make progress writing durable file');
    offset += written;
  }
}

function parseCastingLockMetadata(raw: string | undefined): CastingLockMetadata | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CastingLockMetadata>;
    if (
      value.version !== LOCK_METADATA_VERSION
      || !Number.isSafeInteger(value.pid)
      || (value.pid ?? 0) <= 0
      || typeof value.hostname !== 'string'
      || value.hostname.length === 0
      || typeof value.created_at !== 'string'
      || !Number.isFinite(Date.parse(value.created_at))
      || typeof value.owner_token !== 'string'
      || value.owner_token.length === 0
    ) {
      return null;
    }
    return value as CastingLockMetadata;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean | undefined {
  if (presetRegistryTestHooks?.isProcessAlive) {
    return presetRegistryTestHooks.isProcessAlive(pid);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return undefined;
  }
}

function tryRecoverStaleCastingLock(lockPath: string): boolean {
  const raw = storage.readSync(lockPath);
  const metadata = parseCastingLockMetadata(raw);
  if (!metadata || metadata.hostname !== hostname()) return false;

  const age = nowMilliseconds() - Date.parse(metadata.created_at);
  const staleAge = presetRegistryTestHooks?.staleLockAgeMs ?? REGISTRY_LOCK_STALE_MS;
  if (age < staleAge || isProcessAlive(metadata.pid) !== false) return false;

  let observedIdentity;
  try {
    observedIdentity = lstatSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
  presetRegistryTestHooks?.afterStaleLockSnapshot?.({
    lockPath,
    ownerToken: metadata.owner_token,
  });

  const stalePath = `${lockPath}.stale-${createOwnerToken()}`;
  try {
    linkSync(lockPath, stalePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }

  try {
    const claimedIdentity = lstatSync(stalePath);
    const currentIdentity = lstatSync(lockPath);
    const claimedMetadata = parseCastingLockMetadata(storage.readSync(stalePath));
    if (
      !sameFileIdentity(observedIdentity, claimedIdentity)
      || !sameFileIdentity(claimedIdentity, currentIdentity)
      || claimedMetadata?.owner_token !== metadata.owner_token
      || storage.readSync(stalePath) !== raw
    ) {
      return false;
    }

    unlinkSync(lockPath);
    fsyncDirectory(path.dirname(lockPath), 'stale-lock-remove', lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  } finally {
    try {
      unlinkSync(stalePath);
      fsyncDirectory(path.dirname(stalePath), 'stale-lock-claim-remove', stalePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function acquireCastingLock(lockPath: string): () => void {
  const ownerToken = createOwnerToken();
  const deadline = nowMilliseconds()
    + (presetRegistryTestHooks?.lockTimeoutMs ?? REGISTRY_LOCK_TIMEOUT_MS);
  while (true) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      try {
        const metadata: CastingLockMetadata = {
          version: LOCK_METADATA_VERSION,
          pid: process.pid,
          hostname: hostname(),
          created_at: new Date(nowMilliseconds()).toISOString(),
          owner_token: ownerToken,
        };
        writeAllSync(descriptor, JSON.stringify(metadata) + '\n');
        fsyncSync(descriptor);
        fsyncDirectory(path.dirname(lockPath), 'lock-create', lockPath);
      } catch (error) {
        const openedIdentity = fstatSync(descriptor);
        closeSync(descriptor);
        try {
          const currentIdentity = lstatSync(lockPath);
          if (sameFileIdentity(openedIdentity, currentIdentity)) {
            durableUnlink(lockPath, 'lock-create-rollback');
          }
        } catch (cleanupError) {
          if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError;
        }
        throw error;
      }
      const openedIdentity = fstatSync(descriptor);
      return () => {
        try {
          closeSync(descriptor);
        } finally {
          const current = parseCastingLockMetadata(storage.readSync(lockPath));
          if (current?.owner_token !== ownerToken) return;
          try {
            const currentIdentity = lstatSync(lockPath);
            if (!sameFileIdentity(openedIdentity, currentIdentity)) return;
            durableUnlink(lockPath, 'lock-release');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (tryRecoverStaleCastingLock(lockPath)) continue;
      if (nowMilliseconds() >= deadline) {
        throw new Error(`Timed out waiting for concurrent preset scaffold lock: ${lockPath}`);
      }
      waitSync(REGISTRY_LOCK_RETRY_MS);
    }
  }
}

interface CastingHistory {
  assignment_cast_snapshots: Record<string, {
    created_at: string;
    agents: string[];
    universe: string;
  }>;
  universe_usage_history: Array<{ universe: string; used_at: string }>;
}

function readCastingHistory(historyPath: string): { raw: string | undefined; value: CastingHistory } {
  const raw = storage.readSync(historyPath);
  if (raw === undefined) {
    return {
      raw,
      value: { assignment_cast_snapshots: {}, universe_usage_history: [] },
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('history root must be an object');
    }
    const snapshots = parsed['assignment_cast_snapshots'];
    const usage = parsed['universe_usage_history'];
    if (
      snapshots !== undefined
      && (typeof snapshots !== 'object' || snapshots === null || Array.isArray(snapshots))
    ) {
      throw new Error('assignment_cast_snapshots must be an object');
    }
    if (usage !== undefined && !Array.isArray(usage)) {
      throw new Error('universe_usage_history must be an array');
    }
    return {
      raw,
      value: {
        assignment_cast_snapshots: (snapshots ?? {}) as CastingHistory['assignment_cast_snapshots'],
        universe_usage_history: (usage ?? []) as CastingHistory['universe_usage_history'],
      },
    };
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/history.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateCastingPolicy(policyPath: string): void {
  const raw = storage.readSync(policyPath);
  if (raw === undefined) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('policy root must be an object');
    }
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/policy.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readRegistrySnapshot(
  registryPath: string,
): { raw: string | undefined; value: unknown } {
  const raw = storage.readSync(registryPath);
  if (!raw?.trim()) return { raw, value: undefined };
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/registry.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function atomicWriteFile(
  filePath: string,
  content: string,
  stage: string,
  registryPath: string,
  attempt: number,
): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${nowMilliseconds()}-${attempt}-${atomicWriteSequence++}`;
  let descriptor: number | undefined;
  let renamed = false;
  let crashed = false;
  try {
    presetRegistryTestHooks?.beforeWrite?.({ filePath, stage });
    descriptor = openSync(tempPath, 'wx');
    writeAllSync(descriptor, content);
    presetRegistryTestHooks?.beforeFsync?.({ filePath, stage, target: 'file' });
    fsyncSync(descriptor);
    durabilityBoundary(filePath, stage, 'file-fsync');
    closeSync(descriptor);
    descriptor = undefined;
    presetRegistryTestHooks?.beforeRename?.({
      registryPath,
      tempPath,
      attempt,
      filePath,
      stage,
    });
    renameSync(tempPath, filePath);
    renamed = true;
    durabilityBoundary(filePath, stage, 'rename');
    fsyncDirectory(path.dirname(filePath), stage, filePath);
  } catch (error) {
    crashed = error instanceof SimulatedCastingCrash;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!renamed && !crashed) {
      try {
        unlinkSync(tempPath);
        fsyncDirectory(path.dirname(tempPath), `${stage}-temp-cleanup`, tempPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  atomicWriteFile(
    filePath,
    JSON.stringify(value, null, 2) + '\n',
    'policy',
    filePath,
    0,
  );
}

interface CastingTransactionJournal {
  version: 2;
  generation: string;
  registry: { previous: string | null; next: string };
  history: { previous: string | null; next: string };
}

interface FileRollbackState {
  previous: string | undefined;
  written: string;
}

function parseCastingTransactionJournal(
  journalPath: string,
): CastingTransactionJournal | null {
  const raw = storage.readSync(journalPath);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as CastingTransactionJournal;
    if (
      parsed.version !== CASTING_TRANSACTION_VERSION
      || typeof parsed.generation !== 'string'
      || parsed.generation.length === 0
      || !parsed.registry
      || !parsed.history
      || (parsed.registry.previous !== null && typeof parsed.registry.previous !== 'string')
      || typeof parsed.registry.next !== 'string'
      || (parsed.history.previous !== null && typeof parsed.history.previous !== 'string')
      || typeof parsed.history.next !== 'string'
    ) {
      throw new Error('invalid transaction journal shape');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Cannot recover malformed casting transaction journal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface ConsistentCastingState {
  generation: string | null;
  registryRaw: string | undefined;
  historyRaw: string | undefined;
}

/**
 * Read registry/history as one logical generation. While a durable journal is
 * present, a half-renamed pair is projected back to the previous generation;
 * the next generation becomes visible only after both files match it.
 */
export function readConsistentCastingState(castingDir: string): ConsistentCastingState {
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');

  for (let attempt = 0; attempt < REGISTRY_UPDATE_MAX_ATTEMPTS; attempt++) {
    const journalRaw = storage.readSync(journalPath);
    const registryRaw = storage.readSync(registryPath);
    const historyRaw = storage.readSync(historyPath);
    if (storage.readSync(journalPath) !== journalRaw) continue;
    if (journalRaw === undefined) {
      return { generation: null, registryRaw, historyRaw };
    }

    const journal = parseCastingTransactionJournal(journalPath);
    if (!journal || storage.readSync(journalPath) !== journalRaw) continue;
    const registry = registryRaw ?? null;
    const history = historyRaw ?? null;
    const previousRegistry = journal.registry.previous;
    const previousHistory = journal.history.previous;
    const registryKnown = registry === previousRegistry || registry === journal.registry.next;
    const historyKnown = history === previousHistory || history === journal.history.next;
    if (!registryKnown || !historyKnown) {
      throw new Error('Cannot read casting state because a file changed outside the journal');
    }
    if (registry === journal.registry.next && history === journal.history.next) {
      return {
        generation: journal.generation,
        registryRaw: journal.registry.next,
        historyRaw: journal.history.next,
      };
    }
    return {
      generation: null,
      registryRaw: previousRegistry ?? undefined,
      historyRaw: previousHistory ?? undefined,
    };
  }
  throw new Error('Casting transaction changed repeatedly while reading registry/history');
}

function restoreTransactionFile(
  filePath: string,
  content: string | null,
  registryPath: string,
  stage: string,
): void {
  if (content === null) {
    durableUnlink(filePath, stage);
    return;
  }
  atomicWriteFile(filePath, content, stage, registryPath, 0);
}

function rollbackTransactionFile(
  filePath: string,
  state: { previous: string | null; next: string },
  registryPath: string,
  stage: string,
): string | null {
  const current = storage.readSync(filePath) ?? null;
  if (current === state.previous) return null;
  if (current !== state.next) {
    return `${filePath} changed outside the casting transaction`;
  }
  restoreTransactionFile(filePath, state.previous, registryPath, stage);
  return null;
}

function rollbackFile(
  filePath: string,
  state: FileRollbackState | undefined,
): string | null {
  if (!state) return null;
  const current = storage.readSync(filePath);
  if (current === state.previous) return null;
  if (current !== state.written) {
    return `${filePath} changed outside the preset transaction`;
  }
  if (state.previous === undefined) storage.deleteSync(filePath);
  else storage.writeSync(filePath, state.previous);
  return null;
}

function recoverCastingTransaction(castingDir: string): void {
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');
  const journal = parseCastingTransactionJournal(journalPath);
  if (!journal) return;

  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const registryRaw = storage.readSync(registryPath) ?? null;
  const historyRaw = storage.readSync(historyPath) ?? null;
  const isPrevious = registryRaw === journal.registry.previous
    && historyRaw === journal.history.previous;
  const isNext = registryRaw === journal.registry.next
    && historyRaw === journal.history.next;

  if (isPrevious || isNext) {
    durableUnlink(journalPath, 'journal-delete');
    return;
  }

  const registryKnown = registryRaw === journal.registry.previous
    || registryRaw === journal.registry.next;
  const historyKnown = historyRaw === journal.history.previous
    || historyRaw === journal.history.next;
  if (!registryKnown || !historyKnown) {
    throw new Error('Cannot recover casting transaction because a file changed outside the journal');
  }

  restoreTransactionFile(
    historyPath,
    journal.history.next,
    registryPath,
    'recovery-history',
  );
  restoreTransactionFile(
    registryPath,
    journal.registry.next,
    registryPath,
    'recovery-registry',
  );
  durableUnlink(journalPath, 'journal-delete');
}

function removeOrphanedCastingTemps(castingDir: string): void {
  let removed = false;
  const transactionPrefixes = [
    'registry.json.tmp-',
    'history.json.tmp-',
    'registry-history.transaction.json.tmp-',
    'policy.json.tmp-',
  ];
  for (const name of readdirSync(castingDir)) {
    if (!transactionPrefixes.some(prefix => name.startsWith(prefix))) continue;
    try {
      unlinkSync(path.join(castingDir, name));
      removed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (removed) fsyncDirectory(castingDir, 'orphan-temp-cleanup', castingDir);
}

function commitRegistryAndHistory(
  castingDir: string,
  registryRaw: string | undefined,
  nextRegistryRaw: string,
  historyRaw: string | undefined,
  nextHistoryRaw: string,
  attempt: number,
): void {
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');
  const journal: CastingTransactionJournal = {
    version: CASTING_TRANSACTION_VERSION,
    generation: createOwnerToken(),
    registry: { previous: registryRaw ?? null, next: nextRegistryRaw },
    history: { previous: historyRaw ?? null, next: nextHistoryRaw },
  };

  try {
    atomicWriteFile(
      journalPath,
      JSON.stringify(journal, null, 2) + '\n',
      'journal',
      registryPath,
      attempt,
    );
    atomicWriteFile(historyPath, nextHistoryRaw, 'history', registryPath, attempt);
    atomicWriteFile(registryPath, nextRegistryRaw, 'registry', registryPath, attempt);
    durableUnlink(journalPath, 'journal-delete');
  } catch (error) {
    if (error instanceof SimulatedCastingCrash) throw error;
    const rollbackFailures: string[] = [];
    for (const [filePath, state, stage] of [
      [historyPath, journal.history, 'rollback-history'],
      [registryPath, journal.registry, 'rollback-registry'],
    ] as const) {
      try {
        const conflict = rollbackTransactionFile(filePath, state, registryPath, stage);
        if (conflict) rollbackFailures.push(conflict);
      } catch (rollbackError) {
        rollbackFailures.push(`${filePath}: ${String(rollbackError)}`);
      }
    }
    if (rollbackFailures.length === 0) {
      durableUnlink(journalPath, 'journal-delete');
      throw error;
    }
    throw new Error(
      `Casting transaction failed (${String(error)}) and rollback requires recovery: ${rollbackFailures.join('; ')}`,
    );
  }
}

/**
 * Map an agent's role to the Members-table Status cell.
 *
 * Mirrors the role-to-status mapping in `packages/squad-cli/src/cli/core/cast.ts:652-655`
 * so a team produced by `preset apply` looks identical to one produced by
 * a fresh cast — Scribe/Ralph/Rai/Fact-Checker each get their canonical
 * status label instead of all rows being '✅ Active'. Per-role rather
 * than per-name because presets may rename the agent but keep the role.
 */
function statusForRole(role: string): string {
  // Case-insensitive comparison so presets that lowercase "session logger"
  // still get the silent status.
  const r = role.toLowerCase();
  if (r === 'session logger' || r === 'scribe') return '📋 Silent';
  if (r === 'work monitor' || r === 'ralph') return '🔄 Monitor';
  if (r === 'rai reviewer' || r === 'rai') return '🛡️ RAI';
  if (r === 'fact checker' || r === 'fact-checker') return '🔍 Verifier';
  return '✅ Active';
}

/**
 * Build a single Members table row for a preset agent.
 */
function memberRow(agent: PresetAgent): string {
  const nameLower = agent.name.toLowerCase();
  return `| ${agent.name} | ${agent.role} | \`.squad/agents/${nameLower}/charter.md\` | ${statusForRole(agent.role)} |`;
}

/**
 * Build a single routing table row for a preset agent (work type = role).
 */
function routingRow(agent: PresetAgent): string {
  return `| ${agent.role} | ${agent.name} | — |`;
}

/**
 * Parse the existing Members table from team.md content (if any) and return
 * the set of names already present (case-insensitive comparison key).
 */
function existingMemberNames(teamContent: string): Set<string> {
  const names = new Set<string>();
  const idx = teamContent.indexOf(MEMBERS_HEADER);
  if (idx === -1) return names;
  const afterHeader = teamContent.slice(idx + MEMBERS_HEADER.length);
  const nextHeaderIdx = afterHeader.search(/\n## /);
  const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
  // Match table rows: "| Name | Role | Charter | Status |"
  // Skip header row and the separator row.
  const rowRe = /^\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(section)) !== null) {
    const first = match[1]!.trim();
    if (!first || first === 'Name' || /^-+$/.test(first)) continue;
    names.add(first.toLowerCase());
  }
  return names;
}

/**
 * Parse the existing routing table from routing.md content (if any) and
 * return the set of agent names already present.
 */
function existingRoutingAgents(routingContent: string): Set<string> {
  const names = new Set<string>();
  const idx = routingContent.indexOf(ROUTING_HEADER);
  if (idx === -1) return names;
  const afterHeader = routingContent.slice(idx + ROUTING_HEADER.length);
  const nextHeaderIdx = afterHeader.search(/\n## /);
  const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
  // Routing rows: "| <Work Type> | <Primary> | <Secondary> |"
  // We want the Primary column (2nd cell).
  const rowRe = /^\|\s*[^|]+?\s*\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(section)) !== null) {
    const primary = match[1]!.trim();
    if (!primary || primary === 'Primary' || /^-+$/.test(primary)) continue;
    names.add(primary.toLowerCase());
  }
  return names;
}

/**
 * Write or update `.squad/team.md` so its `## Members` table contains the
 * preset's agents. Existing members are preserved; only new names are added.
 * If team.md does not exist, a minimal one is created.
 */
function writeOrMergeTeamMembers(
  squadDir: string,
  agents: PresetAgent[],
  presetName: string,
): string | undefined {
  const teamPath = path.join(squadDir, 'team.md');
  const existing = storage.existsSync(teamPath) ? (storage.readSync(teamPath) ?? '') : '';

  if (!existing) {
    // Create from scratch (preset apply onto a bare .squad/ directory)
    const fresh = [
      '# Squad Team',
      '',
      `> Created by \`squad preset apply ${presetName}\``,
      '',
      '## Coordinator',
      '',
      '| Name | Role | Notes |',
      '|------|------|-------|',
      '| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |',
      '',
      MEMBERS_HEADER,
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...agents.map(memberRow),
      '',
      '## Project Context',
      '',
      `- **Preset:** ${presetName}`,
      `- **Created:** ${new Date().toISOString().split('T')[0]}`,
      '',
    ].join('\n');
    storage.mkdirSync(squadDir, { recursive: true });
    storage.writeSync(teamPath, fresh);
    return fresh;
  }

  // team.md exists — merge into existing ## Members table
  const already = existingMemberNames(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(memberRow);
  if (newRows.length === 0) return undefined; // nothing to do, all already present

  const membersIdx = existing.indexOf(MEMBERS_HEADER);
  if (membersIdx === -1) {
    // No Members section — append one
    const block = [
      '',
      MEMBERS_HEADER,
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...newRows,
      '',
    ].join('\n');
    const updated = existing.trimEnd() + '\n' + block;
    storage.writeSync(teamPath, updated);
    return updated;
  }

  // Members section exists — find end of its table and insert rows there
  const afterHeader = existing.slice(membersIdx);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const sectionEnd = nextHeaderMatch
    ? membersIdx + (nextHeaderMatch.index ?? afterHeader.length)
    : existing.length;
  const section = existing.slice(membersIdx, sectionEnd);

  // Find the last table row in the section (line starting with `|`)
  const sectionLines = section.split('\n');
  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) { lastTableLineRel = i; break; }
  }

  if (lastTableLineRel === -1) {
    // Section has the header but no table — append a fresh table
    const headerLines = [
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...newRows,
      '',
    ];
    const newSection = MEMBERS_HEADER + '\n' + headerLines.join('\n') + '\n';
    const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
    storage.writeSync(teamPath, updated);
    return updated;
  }

  // Append new rows after the last existing table row
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(teamPath, updated);
  return updated;
}

/**
 * Write or update `.squad/routing.md` so it includes a `## Work Type → Agent`
 * table with the preset's agents. Existing rows are preserved; only new
 * primary agents are added. If routing.md does not exist, a minimal one is
 * created.
 */
function writeOrMergeRouting(squadDir: string, agents: PresetAgent[]): string | undefined {
  const routingPath = path.join(squadDir, 'routing.md');
  const existing = storage.existsSync(routingPath) ? (storage.readSync(routingPath) ?? '') : '';

  if (!existing) {
    const fresh = [
      '# Squad Routing',
      '',
      ROUTING_HEADER,
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...agents.map(routingRow),
      '',
      '## Governance',
      '',
      '- Route based on work type and agent expertise',
      '- Update this file as team capabilities evolve',
      '',
    ].join('\n');
    storage.mkdirSync(squadDir, { recursive: true });
    storage.writeSync(routingPath, fresh);
    return fresh;
  }

  const already = existingRoutingAgents(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(routingRow);
  if (newRows.length === 0) return undefined;

  const headerIdx = existing.indexOf(ROUTING_HEADER);
  if (headerIdx === -1) {
    // Append a fresh routing block
    const block = [
      '',
      ROUTING_HEADER,
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...newRows,
      '',
    ].join('\n');
    const updated = existing.trimEnd() + '\n' + block;
    storage.writeSync(routingPath, updated);
    return updated;
  }

  // Existing routing section — append new rows after its last table row
  const afterHeader = existing.slice(headerIdx);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const sectionEnd = nextHeaderMatch
    ? headerIdx + (nextHeaderMatch.index ?? afterHeader.length)
    : existing.length;
  const section = existing.slice(headerIdx, sectionEnd);
  const sectionLines = section.split('\n');
  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) { lastTableLineRel = i; break; }
  }
  if (lastTableLineRel === -1) {
    const headerLines = [
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...newRows,
      '',
    ];
    const newSection = ROUTING_HEADER + '\n' + headerLines.join('\n') + '\n';
    const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
    storage.writeSync(routingPath, updated);
    return updated;
  }
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(routingPath, updated);
  return updated;
}

/**
 * Write or update `.squad/casting/registry.json`, `history.json`, and
 * `policy.json` with entries for the preset's agents. Registry entries are
 * merged (new agents added, existing entries left untouched). A new
 * preset-apply snapshot is appended to history.json. policy.json is created
 * with sensible defaults only if missing.
 */
function writeOrMergeCastingState(
  squadDir: string,
  agents: PresetAgent[],
  options: ScaffoldOptions,
  recordPolicyWrite?: (content: string) => void,
): void {
  const castingDir = path.join(squadDir, 'casting');
  storage.mkdirSync(castingDir, { recursive: true });
  const now = new Date().toISOString();

  // ---- registry.json ----
  const registryPath = path.join(castingDir, 'registry.json');
  const candidates = agents.map((agent) => ({
    id: agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    displayName: agent.name,
    role: agent.role,
    universe: options.universe,
  }));

  // ---- history.json ----
  const historyPath = path.join(castingDir, 'history.json');
  const policyPath = path.join(castingDir, 'policy.json');
  if (!storage.existsSync(policyPath)) {
    const policy = JSON.stringify({ universe_allowlist: ['*'], max_capacity: 25 }, null, 2) + '\n';
    atomicWriteJson(policyPath, { universe_allowlist: ['*'], max_capacity: 25 });
    recordPolicyWrite?.(policy);
  }
  for (let attempt = 1; attempt <= REGISTRY_UPDATE_MAX_ATTEMPTS; attempt++) {
    const snapshot = readRegistrySnapshot(registryPath);
    const registry = reconcileAgentProvenanceRegistry(
      snapshot.value,
      candidates,
      { generatedAt: now, retireMissing: false },
    );
    const historySnapshot = readCastingHistory(historyPath);
    const history = structuredClone(historySnapshot.value);
    const snapshotKey = `preset-${options.universe}-revision-${registry.revision}-${now}`;
    history.assignment_cast_snapshots[snapshotKey] = {
      created_at: now,
      agents: agents.map(a => a.name.toLowerCase()),
      universe: options.universe,
    };
    history.universe_usage_history.push({ universe: options.universe, used_at: now });

    presetRegistryTestHooks?.afterSnapshot?.({ registryPath, attempt });
    if (storage.readSync(registryPath) !== snapshot.raw) {
      continue;
    }
    if (storage.readSync(historyPath) !== historySnapshot.raw) {
      continue;
    }
    commitRegistryAndHistory(
      castingDir,
      snapshot.raw,
      JSON.stringify(registry, null, 2) + '\n',
      historySnapshot.raw,
      JSON.stringify(history, null, 2) + '\n',
      attempt,
    );

    return;
  }
  throw new Error(
    `Casting registry changed during ${REGISTRY_UPDATE_MAX_ATTEMPTS} update attempts`,
  );
}

/**
 * Wire a preset's agents into team.md, routing.md, and casting state files.
 *
 * Call this after `applyPreset` has copied the agent charters. The function
 * is merge-friendly: it preserves existing rows, agents, and snapshots, and
 * only adds entries that aren't already present.
 */
export function scaffoldPresetIntoSquad(
  squadDir: string,
  agents: PresetAgent[],
  presetName: string,
  prepareOutputs?: () => PresetAgent[],
): void {
  const universe = `preset:${presetName}`;
  const castingDir = path.join(squadDir, 'casting');
  storage.mkdirSync(castingDir, { recursive: true });
  const releaseLock = acquireCastingLock(path.join(castingDir, 'registry.lock'));
  const teamPath = path.join(squadDir, 'team.md');
  const routingPath = path.join(squadDir, 'routing.md');
  const policyPath = path.join(castingDir, 'policy.json');
  try {
    removeOrphanedCastingTemps(castingDir);
    recoverCastingTransaction(castingDir);
    readRegistrySnapshot(path.join(castingDir, 'registry.json'));
    readCastingHistory(path.join(castingDir, 'history.json'));
    validateCastingPolicy(path.join(castingDir, 'policy.json'));

    const wireableAgents = prepareOutputs?.() ?? agents;
    if (wireableAgents.length === 0) return;

    const originalTeam = storage.readSync(teamPath);
    const originalRouting = storage.readSync(routingPath);
    const originalPolicy = storage.readSync(policyPath);
    let teamRollback: FileRollbackState | undefined;
    let routingRollback: FileRollbackState | undefined;
    let policyRollback: FileRollbackState | undefined;
    try {
      const writtenTeam = writeOrMergeTeamMembers(squadDir, wireableAgents, presetName);
      if (writtenTeam !== undefined) {
        teamRollback = { previous: originalTeam, written: writtenTeam };
      }
      const writtenRouting = writeOrMergeRouting(squadDir, wireableAgents);
      if (writtenRouting !== undefined) {
        routingRollback = { previous: originalRouting, written: writtenRouting };
      }
      writeOrMergeCastingState(squadDir, wireableAgents, { universe }, (writtenPolicy) => {
        if (writtenPolicy !== originalPolicy) {
          policyRollback = { previous: originalPolicy, written: writtenPolicy };
        }
      });
    } catch (error) {
      const conflicts = [
        rollbackFile(teamPath, teamRollback),
        rollbackFile(routingPath, routingRollback),
        rollbackFile(policyPath, policyRollback),
      ].filter((conflict): conflict is string => conflict !== null);
      if (conflicts.length > 0) {
        throw new Error(
          `Preset scaffold failed (${String(error)}) and rollback requires recovery: ${conflicts.join('; ')}`,
        );
      }
      throw error;
    }
  } finally {
    releaseLock();
  }
}
