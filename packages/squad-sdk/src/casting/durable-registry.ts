import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';

const LOCK_VERSION = 1;
const TRANSACTION_VERSION = 2;
const MANIFEST_VERSION = 1;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_LOCK_AGE_MS = 5_000;
const LOCK_RETRY_MS = 25;
const PAIR_READ_ATTEMPTS = 8;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

export type CastingDurabilityBoundary =
  | 'lock:candidate-owner-write'
  | 'lock:candidate-owner-fsync'
  | 'lock:candidate-dir-fsync'
  | 'lock:before-publish'
  | 'lock:after-publish'
  | 'lock:before-release-quarantine'
  | 'lock:after-release-quarantine'
  | 'lock:recovery-guard-acquired'
  | 'lock:before-stale-quarantine'
  | 'lock:after-stale-quarantine'
  | 'payload:registry-write'
  | 'payload:registry-fsync'
  | 'payload:history-write'
  | 'payload:history-fsync'
  | 'payload:dir-fsync'
  | 'payload:parent-fsync'
  | 'journal:write'
  | 'journal:file-fsync'
  | 'journal:rename'
  | 'journal:parent-fsync'
  | 'history:write'
  | 'history:file-fsync'
  | 'history:rename'
  | 'history:parent-fsync'
  | 'manifest:write'
  | 'manifest:file-fsync'
  | 'manifest:rename'
  | 'manifest:parent-fsync'
  | 'registry:write'
  | 'registry:file-fsync'
  | 'registry:rename'
  | 'registry:parent-fsync'
  | 'cleanup:journal-unlink'
  | 'cleanup:journal-parent-fsync'
  | 'cleanup:payload-remove'
  | 'cleanup:payload-parent-fsync';

export interface CastingDurabilityHooks {
  boundary?: (context: {
    boundary: CastingDurabilityBoundary;
    path: string;
    transactionId?: string;
  }) => void;
  now?: () => number;
  wait?: (milliseconds: number) => void;
  isProcessAlive?: (pid: number) => boolean | undefined;
  lockTimeoutMs?: number;
  staleLockAgeMs?: number;
}

let hooks: CastingDurabilityHooks | null = null;

/** @internal Test-only deterministic concurrency and crash injection. */
export function _setCastingDurabilityHooksForTesting(
  nextHooks: CastingDurabilityHooks | null,
): void {
  hooks = nextHooks;
}

interface LockOwner {
  version: 1;
  token: string;
  pid: number;
  hostname: string;
  created_at: string;
}

interface PairJournal {
  version: 2;
  transaction_id: string;
  target_revision: number;
  payload_dir: string;
  registry: { previous_sha256: string | null; next_sha256: string };
  history: { previous_sha256: string | null; next_sha256: string };
  manifest: { previous_sha256: string | null; next_sha256: string };
}

interface PairManifest {
  version: 1;
  transaction_id: string;
  registry_revision: number;
  registry_sha256: string;
  history_sha256: string;
}

export interface CastingPairSnapshot {
  registryRaw: string | undefined;
  historyRaw: string | undefined;
  registry: Record<string, unknown> | undefined;
  history: Record<string, unknown> | undefined;
  transactionId?: string;
}

export class CastingCommitInDoubtError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'CastingCommitInDoubtError';
    this.cause = cause;
  }
}

function now(): number {
  return hooks?.now?.() ?? Date.now();
}

function wait(milliseconds: number): void {
  if (hooks?.wait) {
    hooks.wait(milliseconds);
    return;
  }
  Atomics.wait(waitBuffer, 0, 0, milliseconds);
}

function boundary(
  name: CastingDurabilityBoundary,
  targetPath: string,
  transactionId?: string,
): void {
  hooks?.boundary?.({ boundary: name, path: targetPath, transactionId });
}

function readText(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined;
    }
    throw error;
  }
}

function flushDirectory(directoryPath: string): void {
  const descriptor = openSync(directoryPath, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeDurableFile(
  filePath: string,
  content: string,
  writeBoundary: CastingDurabilityBoundary,
  fsyncBoundary: CastingDurabilityBoundary,
  transactionId?: string,
): void {
  boundary(writeBoundary, filePath, transactionId);
  const descriptor = openSync(filePath, 'wx', 0o600);
  try {
    writeSync(descriptor, content, undefined, 'utf8');
    boundary(fsyncBoundary, filePath, transactionId);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function durableReplace(
  filePath: string,
  content: string,
  stage: 'journal' | 'history' | 'manifest' | 'registry',
  transactionId: string,
): void {
  const tempPath = `${filePath}.tmp-${transactionId}-${randomUUID()}`;
  try {
    writeDurableFile(
      tempPath,
      content,
      `${stage}:write`,
      `${stage}:file-fsync`,
      transactionId,
    );
    boundary(`${stage}:rename`, filePath, transactionId);
    renameSync(tempPath, filePath);
    boundary(`${stage}:parent-fsync`, path.dirname(filePath), transactionId);
    flushDirectory(path.dirname(filePath));
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function sha256(content: string | undefined): string | null {
  return content === undefined
    ? null
    : createHash('sha256').update(content, 'utf8').digest('hex');
}

function parseObject(raw: string | undefined, label: string): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Cannot parse ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseOwner(raw: string | undefined): LockOwner | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LockOwner>;
    if (
      value.version !== LOCK_VERSION
      || typeof value.token !== 'string'
      || value.token.length === 0
      || !Number.isSafeInteger(value.pid)
      || (value.pid ?? 0) <= 0
      || typeof value.hostname !== 'string'
      || value.hostname.length === 0
      || typeof value.created_at !== 'string'
      || !Number.isFinite(Date.parse(value.created_at))
    ) {
      return null;
    }
    return value as LockOwner;
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean | undefined {
  if (hooks?.isProcessAlive) return hooks.isProcessAlive(pid);
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return undefined;
    return undefined;
  }
}

function ownerPath(lockDirectory: string): string {
  return path.join(lockDirectory, 'owner.json');
}

function createOwnedDirectory(directoryPath: string, token: string): LockOwner {
  mkdirSync(directoryPath);
  const owner: LockOwner = {
    version: LOCK_VERSION,
    token,
    pid: process.pid,
    hostname: hostname(),
    created_at: new Date(now()).toISOString(),
  };
  const ownerFile = ownerPath(directoryPath);
  boundary('lock:candidate-owner-write', ownerFile);
  const descriptor = openSync(ownerFile, 'wx', 0o600);
  try {
    writeSync(descriptor, JSON.stringify(owner, null, 2) + '\n', undefined, 'utf8');
    boundary('lock:candidate-owner-fsync', ownerFile);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  boundary('lock:candidate-dir-fsync', directoryPath);
  flushDirectory(directoryPath);
  flushDirectory(path.dirname(directoryPath));
  return owner;
}

function quarantineOwnedDirectory(
  directoryPath: string,
  expectedToken: string,
  quarantineKind: 'released' | 'stale',
): boolean {
  const owner = parseOwner(readText(ownerPath(directoryPath)));
  if (owner?.token !== expectedToken) return false;
  const quarantinePath = `${directoryPath}.${quarantineKind}-${expectedToken}-${randomUUID()}`;
  boundary(
    quarantineKind === 'released'
      ? 'lock:before-release-quarantine'
      : 'lock:before-stale-quarantine',
    directoryPath,
  );
  try {
    renameSync(directoryPath, quarantinePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  boundary(
    quarantineKind === 'released'
      ? 'lock:after-release-quarantine'
      : 'lock:after-stale-quarantine',
    quarantinePath,
  );
  const quarantinedOwner = parseOwner(readText(ownerPath(quarantinePath)));
  if (quarantinedOwner?.token !== expectedToken) {
    if (!existsSync(directoryPath)) renameSync(quarantinePath, directoryPath);
    throw new Error(`Casting lock ownership changed while quarantining ${directoryPath}`);
  }
  rmSync(quarantinePath, { recursive: true });
  flushDirectory(path.dirname(directoryPath));
  return true;
}

function acquireRecoveryGuard(lockPath: string): { token: string; release: () => void } | null {
  const guardPath = `${lockPath}.recovery`;
  const token = randomUUID();
  try {
    createOwnedDirectory(guardPath, token);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw error;
  }
  boundary('lock:recovery-guard-acquired', guardPath);
  return {
    token,
    release: () => {
      if (!quarantineOwnedDirectory(guardPath, token, 'released')) {
        throw new Error(`Casting lock recovery guard ownership changed: ${guardPath}`);
      }
    },
  };
}

function tryRecoverStaleLock(lockPath: string): boolean {
  const guard = acquireRecoveryGuard(lockPath);
  if (!guard) return false;
  try {
    const activeOwner = parseOwner(readText(ownerPath(lockPath)));
    if (!activeOwner) return false;
    if (activeOwner.hostname !== hostname()) return false;
    const staleAge = hooks?.staleLockAgeMs ?? DEFAULT_STALE_LOCK_AGE_MS;
    if (now() - Date.parse(activeOwner.created_at) < staleAge) return false;
    if (processAlive(activeOwner.pid) !== false) return false;
    return quarantineOwnedDirectory(lockPath, activeOwner.token, 'stale');
  } finally {
    guard.release();
  }
}

/**
 * Acquire the shared casting writer lock. The active pathname is never
 * compare-then-unlinked: release and stale recovery serialize through the
 * recovery guard and move only token-owned directories to unique quarantine.
 */
export function acquireCastingRegistryLock(
  castingDir: string,
  purpose = 'casting writer',
): () => void {
  mkdirSync(castingDir, { recursive: true });
  const lockPath = path.join(castingDir, 'registry.lock');
  const guardPath = `${lockPath}.recovery`;
  const token = randomUUID();
  const candidatePath = `${lockPath}.candidate-${token}`;
  createOwnedDirectory(candidatePath, token);
  const deadline = now() + (hooks?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  let published = false;
  try {
    while (true) {
      if (!existsSync(guardPath)) {
        try {
          boundary('lock:before-publish', lockPath);
          renameSync(candidatePath, lockPath);
          published = true;
          boundary('lock:after-publish', lockPath);
          flushDirectory(castingDir);
          while (existsSync(guardPath)) {
            if (now() >= deadline) {
              throw new Error(
                `Timed out waiting for casting lock recovery guard after acquisition: ${guardPath}`,
              );
            }
            wait(LOCK_RETRY_MS);
          }
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!['EEXIST', 'ENOTEMPTY', 'ENOTDIR'].includes(code ?? '')) throw error;
        }
      }
      if (tryRecoverStaleLock(lockPath)) continue;
      if (now() >= deadline) {
        throw new Error(`Timed out waiting for concurrent ${purpose} lock: ${lockPath}`);
      }
      wait(LOCK_RETRY_MS);
    }
  } catch (error) {
    if (!published) rmSync(candidatePath, { recursive: true, force: true });
    throw error;
  }

  return () => {
    const deadline = now() + (hooks?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
    let guard = acquireRecoveryGuard(lockPath);
    while (!guard) {
      if (now() >= deadline) {
        throw new Error(`Timed out acquiring casting lock recovery guard for release: ${guardPath}`);
      }
      wait(LOCK_RETRY_MS);
      guard = acquireRecoveryGuard(lockPath);
    }
    try {
      if (!quarantineOwnedDirectory(lockPath, token, 'released')) {
        throw new Error(`Casting lock ownership changed before release: ${lockPath}`);
      }
    } finally {
      guard.release();
    }
  };
}

/** Async waiter variant for callers whose critical section yields the event loop. */
export async function acquireCastingRegistryLockAsync(
  castingDir: string,
  purpose = 'casting writer',
): Promise<() => void> {
  mkdirSync(castingDir, { recursive: true });
  const lockPath = path.join(castingDir, 'registry.lock');
  const guardPath = `${lockPath}.recovery`;
  const token = randomUUID();
  const candidatePath = `${lockPath}.candidate-${token}`;
  createOwnedDirectory(candidatePath, token);
  const deadline = now() + (hooks?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  let published = false;
  const waitAsync = async (): Promise<void> => {
    if (hooks?.wait) hooks.wait(LOCK_RETRY_MS);
    else await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
  };
  try {
    while (true) {
      if (!existsSync(guardPath)) {
        try {
          boundary('lock:before-publish', lockPath);
          renameSync(candidatePath, lockPath);
          published = true;
          boundary('lock:after-publish', lockPath);
          flushDirectory(castingDir);
          while (existsSync(guardPath)) {
            if (now() >= deadline) {
              throw new Error(
                `Timed out waiting for casting lock recovery guard after acquisition: ${guardPath}`,
              );
            }
            await waitAsync();
          }
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!['EEXIST', 'ENOTEMPTY', 'ENOTDIR'].includes(code ?? '')) throw error;
        }
      }
      if (tryRecoverStaleLock(lockPath)) continue;
      if (now() >= deadline) {
        throw new Error(`Timed out waiting for concurrent ${purpose} lock: ${lockPath}`);
      }
      await waitAsync();
    }
  } catch (error) {
    if (!published) rmSync(candidatePath, { recursive: true, force: true });
    throw error;
  }

  return () => {
    const releaseDeadline = now() + (hooks?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
    let guard = acquireRecoveryGuard(lockPath);
    while (!guard) {
      if (now() >= releaseDeadline) {
        throw new Error(`Timed out acquiring casting lock recovery guard for release: ${guardPath}`);
      }
      wait(LOCK_RETRY_MS);
      guard = acquireRecoveryGuard(lockPath);
    }
    try {
      if (!quarantineOwnedDirectory(lockPath, token, 'released')) {
        throw new Error(`Casting lock ownership changed before release: ${lockPath}`);
      }
    } finally {
      guard.release();
    }
  };
}

function transactionPaths(castingDir: string): {
  registryPath: string;
  historyPath: string;
  journalPath: string;
  manifestPath: string;
} {
  return {
    registryPath: path.join(castingDir, 'registry.json'),
    historyPath: path.join(castingDir, 'history.json'),
    journalPath: path.join(castingDir, 'registry-history.transaction.json'),
    manifestPath: path.join(castingDir, 'registry-history.commit.json'),
  };
}

function parseJournal(raw: string | undefined): PairJournal | null {
  if (raw === undefined) return null;
  const value = parseObject(raw, 'casting transaction journal') as Partial<PairJournal>;
  if (
    value.version !== TRANSACTION_VERSION
    || typeof value.transaction_id !== 'string'
    || !Number.isSafeInteger(value.target_revision)
    || typeof value.payload_dir !== 'string'
    || path.basename(value.payload_dir) !== value.payload_dir
    || !value.registry
    || !value.history
    || !value.manifest
  ) {
    throw new Error('Cannot recover malformed casting transaction journal');
  }
  return value as PairJournal;
}

function parseManifest(raw: string | undefined): PairManifest | null {
  if (raw === undefined) return null;
  const value = parseObject(raw, 'casting commit manifest') as Partial<PairManifest>;
  if (
    value.version !== MANIFEST_VERSION
    || typeof value.transaction_id !== 'string'
    || !Number.isSafeInteger(value.registry_revision)
    || typeof value.registry_sha256 !== 'string'
    || typeof value.history_sha256 !== 'string'
  ) {
    throw new Error('Cannot parse malformed casting commit manifest');
  }
  return value as PairManifest;
}

function managedPairRaw(
  registry: Record<string, unknown>,
  history: Record<string, unknown>,
  transactionId: string,
  revision: number,
): { registryRaw: string; historyRaw: string } {
  return {
    registryRaw: JSON.stringify({
      ...registry,
      transaction_id: transactionId,
    }, null, 2) + '\n',
    historyRaw: JSON.stringify({
      ...history,
      transaction_id: transactionId,
      registry_revision: revision,
    }, null, 2) + '\n',
  };
}

function expectedState(
  raw: string | undefined,
  previousHash: string | null,
  nextHash: string,
  label: string,
): 'previous' | 'next' {
  const actual = sha256(raw);
  if (actual === previousHash) return 'previous';
  if (actual === nextHash) return 'next';
  throw new Error(`Cannot recover casting transaction: ${label} changed outside the journal`);
}

function removeJournalAndPayload(
  castingDir: string,
  journalPath: string,
  payloadPath: string,
  transactionId: string,
): void {
  try {
    boundary('cleanup:journal-unlink', journalPath, transactionId);
    unlinkSync(journalPath);
    boundary('cleanup:journal-parent-fsync', castingDir, transactionId);
    flushDirectory(castingDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
  }
  try {
    boundary('cleanup:payload-remove', payloadPath, transactionId);
    rmSync(payloadPath, { recursive: true, force: true });
    boundary('cleanup:payload-parent-fsync', castingDir, transactionId);
    flushDirectory(castingDir);
  } catch {
    // The committed pair and manifest are authoritative; later recovery cleans up.
  }
}

/** Roll a durable journal forward. This function never restores previous bytes. */
export function recoverCastingRegistryTransaction(castingDir: string): void {
  const { registryPath, historyPath, journalPath, manifestPath } = transactionPaths(castingDir);
  const journal = parseJournal(readText(journalPath));
  if (!journal) {
    for (const name of readdirSync(castingDir)) {
      if (
        name.startsWith('registry-history.transaction.')
        && name.endsWith('.payload')
      ) {
        rmSync(path.join(castingDir, name), { recursive: true, force: true });
      }
    }
    flushDirectory(castingDir);
    return;
  }
  const payloadPath = path.join(castingDir, journal.payload_dir);
  const nextRegistryRaw = readText(path.join(payloadPath, 'registry.next'));
  const nextHistoryRaw = readText(path.join(payloadPath, 'history.next'));
  if (
    nextRegistryRaw === undefined
    || nextHistoryRaw === undefined
    || sha256(nextRegistryRaw) !== journal.registry.next_sha256
    || sha256(nextHistoryRaw) !== journal.history.next_sha256
  ) {
    throw new Error('Cannot recover casting transaction: durable payload is missing or corrupt');
  }
  const nextManifest: PairManifest = {
    version: MANIFEST_VERSION,
    transaction_id: journal.transaction_id,
    registry_revision: journal.target_revision,
    registry_sha256: journal.registry.next_sha256,
    history_sha256: journal.history.next_sha256,
  };
  const nextManifestRaw = JSON.stringify(nextManifest, null, 2) + '\n';
  if (sha256(nextManifestRaw) !== journal.manifest.next_sha256) {
    throw new Error('Cannot recover casting transaction: manifest hash is corrupt');
  }

  const registryState = expectedState(
    readText(registryPath),
    journal.registry.previous_sha256,
    journal.registry.next_sha256,
    'registry.json',
  );
  const historyState = expectedState(
    readText(historyPath),
    journal.history.previous_sha256,
    journal.history.next_sha256,
    'history.json',
  );
  const manifestState = expectedState(
    readText(manifestPath),
    journal.manifest.previous_sha256,
    journal.manifest.next_sha256,
    'commit manifest',
  );

  if (historyState === 'previous') {
    durableReplace(historyPath, nextHistoryRaw, 'history', journal.transaction_id);
  }
  if (manifestState === 'previous') {
    durableReplace(manifestPath, nextManifestRaw, 'manifest', journal.transaction_id);
  }
  if (registryState === 'previous') {
    durableReplace(registryPath, nextRegistryRaw, 'registry', journal.transaction_id);
  }
  removeJournalAndPayload(castingDir, journalPath, payloadPath, journal.transaction_id);
}

/**
 * Commit registry/history as an immutable roll-forward transaction. Once the
 * journal rename and parent fsync complete, any error is recovered forward.
 */
export function commitCastingRegistryPair(
  castingDir: string,
  previousRegistryRaw: string | undefined,
  registry: Record<string, unknown>,
  previousHistoryRaw: string | undefined,
  history: Record<string, unknown>,
  targetRevision: number,
): { transactionId: string; registryRaw: string; historyRaw: string } {
  mkdirSync(castingDir, { recursive: true });
  const { registryPath, historyPath, journalPath, manifestPath } = transactionPaths(castingDir);
  if (existsSync(journalPath)) {
    recoverCastingRegistryTransaction(castingDir);
  }
  if (
    readText(registryPath) !== previousRegistryRaw
    || readText(historyPath) !== previousHistoryRaw
  ) {
    throw new Error('Casting registry/history changed before transaction preparation');
  }
  const transactionId = randomUUID();
  const payloadName = `registry-history.transaction.${transactionId}.payload`;
  const payloadPath = path.join(castingDir, payloadName);
  mkdirSync(payloadPath);
  const pair = managedPairRaw(registry, history, transactionId, targetRevision);
  const previousManifestRaw = readText(manifestPath);
  const manifest: PairManifest = {
    version: MANIFEST_VERSION,
    transaction_id: transactionId,
    registry_revision: targetRevision,
    registry_sha256: sha256(pair.registryRaw)!,
    history_sha256: sha256(pair.historyRaw)!,
  };
  const manifestRaw = JSON.stringify(manifest, null, 2) + '\n';
  let journalDurable = false;
  try {
    writeDurableFile(
      path.join(payloadPath, 'registry.next'),
      pair.registryRaw,
      'payload:registry-write',
      'payload:registry-fsync',
      transactionId,
    );
    writeDurableFile(
      path.join(payloadPath, 'history.next'),
      pair.historyRaw,
      'payload:history-write',
      'payload:history-fsync',
      transactionId,
    );
    boundary('payload:dir-fsync', payloadPath, transactionId);
    flushDirectory(payloadPath);
    boundary('payload:parent-fsync', castingDir, transactionId);
    flushDirectory(castingDir);
    if (
      readText(registryPath) !== previousRegistryRaw
      || readText(historyPath) !== previousHistoryRaw
      || readText(manifestPath) !== previousManifestRaw
    ) {
      throw new Error('Casting registry/history changed before durable journal publication');
    }

    const journal: PairJournal = {
      version: TRANSACTION_VERSION,
      transaction_id: transactionId,
      target_revision: targetRevision,
      payload_dir: payloadName,
      registry: {
        previous_sha256: sha256(previousRegistryRaw),
        next_sha256: manifest.registry_sha256,
      },
      history: {
        previous_sha256: sha256(previousHistoryRaw),
        next_sha256: manifest.history_sha256,
      },
      manifest: {
        previous_sha256: sha256(previousManifestRaw),
        next_sha256: sha256(manifestRaw)!,
      },
    };
    durableReplace(
      journalPath,
      JSON.stringify(journal, null, 2) + '\n',
      'journal',
      transactionId,
    );
    journalDurable = true;
    durableReplace(historyPath, pair.historyRaw, 'history', transactionId);
    durableReplace(manifestPath, manifestRaw, 'manifest', transactionId);
    durableReplace(registryPath, pair.registryRaw, 'registry', transactionId);
    removeJournalAndPayload(castingDir, journalPath, payloadPath, transactionId);
    return { transactionId, ...pair };
  } catch (error) {
    if (!journalDurable) {
      if (existsSync(journalPath)) {
        unlinkSync(journalPath);
        flushDirectory(castingDir);
      }
      rmSync(payloadPath, { recursive: true, force: true });
      flushDirectory(castingDir);
      throw error;
    }
    try {
      recoverCastingRegistryTransaction(castingDir);
      return { transactionId, ...pair };
    } catch (recoveryError) {
      throw new CastingCommitInDoubtError(
        `Casting registry/history commit ${transactionId} is in doubt after ${String(error)}`,
        recoveryError,
      );
    }
  }
}

/**
 * Read a registry/history snapshot that is either a fully legacy pair or a
 * stable manifest-backed transaction pair. Mixed and in-progress states are
 * retried boundedly, then rejected.
 */
export function readCastingRegistryPair(
  castingDir: string,
  attempts = PAIR_READ_ATTEMPTS,
): CastingPairSnapshot {
  const { registryPath, historyPath, journalPath, manifestPath } = transactionPaths(castingDir);
  let lastReason = 'pair changed while reading';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const journalBefore = readText(journalPath);
    const manifestBefore = readText(manifestPath);
    const registryRaw = readText(registryPath);
    const historyRaw = readText(historyPath);
    const manifestAfter = readText(manifestPath);
    const journalAfter = readText(journalPath);
    if (journalBefore !== journalAfter || manifestBefore !== manifestAfter) {
      lastReason = 'transaction metadata changed while reading';
      wait(LOCK_RETRY_MS);
      continue;
    }
    if (journalAfter !== undefined) {
      lastReason = 'a durable casting transaction is awaiting roll-forward';
      wait(LOCK_RETRY_MS);
      continue;
    }
    const registry = parseObject(registryRaw, 'casting/registry.json');
    const history = parseObject(historyRaw, 'casting/history.json');
    const registryTransaction = registry?.['transaction_id'];
    const historyTransaction = history?.['transaction_id'];
    const historyRevision = history?.['registry_revision'];
    if (manifestAfter === undefined) {
      if (
        registryTransaction === undefined
        && historyTransaction === undefined
        && historyRevision === undefined
      ) {
        return { registryRaw, historyRaw, registry, history };
      }
      lastReason = 'transaction metadata exists without a commit manifest';
      wait(LOCK_RETRY_MS);
      continue;
    }
    const manifest = parseManifest(manifestAfter)!;
    if (
      registryTransaction === manifest.transaction_id
      && historyTransaction === manifest.transaction_id
      && historyRevision === manifest.registry_revision
      && registry?.['revision'] === manifest.registry_revision
      && sha256(registryRaw) === manifest.registry_sha256
      && sha256(historyRaw) === manifest.history_sha256
    ) {
      return {
        registryRaw,
        historyRaw,
        registry,
        history,
        transactionId: manifest.transaction_id,
      };
    }
    lastReason = 'registry/history bytes do not match the stable commit manifest';
    wait(LOCK_RETRY_MS);
  }
  throw new Error(`Cannot read a consistent casting registry/history pair: ${lastReason}`);
}
