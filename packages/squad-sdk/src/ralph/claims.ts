/**
 * Work Claims — executor-side exclusion for Ralph / `squad watch`.
 *
 * Implements the `WorkClaimProvider` contract from ADR 002
 * (`docs/specification/adr-002-work-claims-and-external-queues.md`).
 *
 * A claim gives one executor (machine + process) the right to work on one
 * issue or work item for a lease period. Providers differ in how strong that
 * exclusion is, reported through `guarantees`:
 *
 * | Provider                | exclusion     | leases | fencing |
 * |-------------------------|---------------|--------|---------|
 * | `NoopClaimProvider`     | `none`        | false  | false   |
 * | `InMemoryClaimProvider` | `local`       | true   | true    |
 * | `GitRefClaimProvider`   | `distributed` | true   | true    |
 *
 * `PlatformAdapter` is intentionally untouched: claims are a separate seam.
 */

import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { getPodId } from './capabilities.js';

// --- Contract types (ADR 002) ---

/** Identifies one unit of work on one platform. */
export interface WorkKey {
  /** `'github' | 'azure-devops' | 'planner' | …` */
  platform: string;
  /** owner/name, org/project, or plan id */
  repo: string;
  /** Issue or work item id */
  id: string;
}

/** Who holds a claim. Two watchers on one machine are distinct holders. */
export interface ExecutorIdentity {
  machineId: string;
  /** `crypto.randomUUID()`, generated once per process. */
  instanceId: string;
  /** Platform login; informational only, never used to decide ownership. */
  actor?: string;
}

/** A claim as last observed or written by a provider. */
export interface ClaimRecord {
  key: WorkKey;
  /** Opaque compare-and-swap token; the commit SHA for `git-ref`. */
  handle: string;
  holder: ExecutorIdentity;
  epoch: number;
  /** Unix ms */
  acquiredAt: number;
  /** Unix ms */
  expiresAt: number;
}

export type AcquireResult =
  | { status: 'acquired'; claim: ClaimRecord }
  | { status: 'held'; by: ClaimRecord }
  | { status: 'unavailable'; reason: string };

export type RenewResult =
  | { status: 'renewed'; claim: ClaimRecord }
  | { status: 'fenced'; by?: ClaimRecord };

export interface ReleaseResult {
  status: 'released' | 'fenced' | 'already-released';
}

export type FinishOutcome = 'completed' | 'cancelled' | 'abandoned';

export interface ClaimOptions {
  /** Lease length in milliseconds; must be positive, finite, and at most {@link MAX_CLAIM_TTL_MS}. */
  ttlMs: number;
}

export interface ClaimProviderGuarantees {
  exclusion: 'none' | 'local' | 'distributed';
  leases: boolean;
  fencing: boolean;
}

/**
 * Arbitrates which executor works on a {@link WorkKey}.
 *
 * Obligations:
 * - `acquire` is atomic: concurrent callers on one unexpired key get at most
 *   one `acquired`. Contention returns `held`; transport failure returns
 *   `unavailable`. Neither throws.
 * - `renew` and `release` compare-and-swap on `handle`. Renew increments
 *   `epoch`. Releasing a missing claim returns `already-released`.
 */
export interface WorkClaimProvider {
  readonly name: string;
  readonly guarantees: ClaimProviderGuarantees;
  acquire(key: WorkKey, o: ClaimOptions): Promise<AcquireResult>;
  renew(c: ClaimRecord, o: ClaimOptions): Promise<RenewResult>;
  release(c: ClaimRecord, outcome: FinishOutcome): Promise<ReleaseResult>;
  inspect?(key: WorkKey): Promise<ClaimRecord | null>;
}

// --- Defaults (ADR 002 "Delivery semantics"; tunable per provider) ---

/** Default lease length: 15 minutes. Holders renew every `ttlMs / 3`. */
export const DEFAULT_CLAIM_TTL_MS = 15 * 60 * 1000;

/** Default clock-skew margin applied before takeover and self-fencing: 2 minutes. */
export const DEFAULT_CLAIM_SKEW_MARGIN_MS = 2 * 60 * 1000;

/** Shortest lease an executor may be configured with: 30 seconds. */
export const MIN_CLAIM_TTL_MS = 30 * 1000;

/** Longest lease any provider writes or honors: 24 hours. */
export const MAX_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Largest skew margin an executor may be configured with, and the furthest a
 * record's `acquiredAt` may lie in the observer's future before the record is
 * implausible: 1 hour.
 */
export const MAX_CLAIM_SKEW_MARGIN_MS = 60 * 60 * 1000;

/** Largest epoch a record may carry; beyond it `epoch + 1` would lose precision. */
export const MAX_CLAIM_EPOCH = 2 ** 52;

/**
 * Check lease timing an executor will schedule renewals with. Returns a
 * reason string, or `null` when the timing is safe: `skewMarginMs` in
 * `[0, MAX_CLAIM_SKEW_MARGIN_MS]`, `ttlMs` in `[minTtlMs, MAX_CLAIM_TTL_MS]`,
 * and `ttlMs > 2 * skewMarginMs` (so the renew delay `min(ttlMs / 3,
 * ttlMs - skewMarginMs)` stays positive and below the `setTimeout` limit).
 */
export function claimTimingError(
  timing: { ttlMs: number; skewMarginMs: number },
  opts: { minTtlMs?: number } = {},
): string | null {
  const minTtlMs = opts.minTtlMs ?? MIN_CLAIM_TTL_MS;
  const { ttlMs, skewMarginMs } = timing;
  if (typeof skewMarginMs !== 'number' || !Number.isFinite(skewMarginMs) || skewMarginMs < 0) {
    return 'skewMarginMs must be a non-negative number of milliseconds';
  }
  if (skewMarginMs > MAX_CLAIM_SKEW_MARGIN_MS) {
    return `skewMarginMs must be at most ${MAX_CLAIM_SKEW_MARGIN_MS} (1 hour)`;
  }
  if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return 'ttlMs must be a positive number of milliseconds';
  }
  if (ttlMs < minTtlMs) return `ttlMs must be at least ${minTtlMs}`;
  if (ttlMs > MAX_CLAIM_TTL_MS) return `ttlMs must be at most ${MAX_CLAIM_TTL_MS} (24 hours)`;
  if (ttlMs <= 2 * skewMarginMs) {
    return `ttlMs (${ttlMs}) must be greater than twice skewMarginMs (${skewMarginMs})`;
  }
  return null;
}

/**
 * Why a stored claim record cannot be honored, or `null` when it is
 * plausible. A record is implausible when its `epoch` exceeds
 * {@link MAX_CLAIM_EPOCH}, its `acquiredAt` lies more than
 * {@link MAX_CLAIM_SKEW_MARGIN_MS} in the observer's future, or its
 * `expiresAt` lies more than `MAX_CLAIM_TTL_MS + MAX_CLAIM_SKEW_MARGIN_MS`
 * in the observer's future (no holder can have written it with a legal
 * lease). Providers treat implausible records as expired: eligible for
 * takeover with a compare-and-swap on the observed handle.
 */
export function claimRecordImplausibility(
  record: Pick<ClaimRecord, 'epoch' | 'acquiredAt' | 'expiresAt'>,
  now: number,
): string | null {
  if (!Number.isSafeInteger(record.epoch) || record.epoch < 1 || record.epoch > MAX_CLAIM_EPOCH) {
    return `epoch ${record.epoch} is outside [1, 2^52]`;
  }
  if (!Number.isFinite(record.acquiredAt) || record.acquiredAt > now + MAX_CLAIM_SKEW_MARGIN_MS) {
    return `acquiredAt ${record.acquiredAt} is more than ${MAX_CLAIM_SKEW_MARGIN_MS} ms in the future`;
  }
  if (!Number.isFinite(record.expiresAt) || record.expiresAt > now + MAX_CLAIM_TTL_MS + MAX_CLAIM_SKEW_MARGIN_MS) {
    return `expiresAt ${record.expiresAt} is beyond the longest legal lease`;
  }
  return null;
}

// --- Work keys ---

function assertKeyPart(value: unknown, field: keyof WorkKey): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`WorkKey.${field} must be a non-empty string`);
  }
}

/**
 * Return `key` with `platform` and `repo` lower-cased. `id` is kept as-is.
 *
 * @throws TypeError when a field is empty, `platform` contains `:`, or `repo`
 *   contains `#` (either would make the canonical string ambiguous).
 */
export function normalizeWorkKey(key: WorkKey): WorkKey {
  assertKeyPart(key?.platform, 'platform');
  assertKeyPart(key.repo, 'repo');
  assertKeyPart(key.id, 'id');
  if (key.platform.includes(':')) {
    throw new TypeError('WorkKey.platform must not contain ":"');
  }
  if (key.repo.includes('#')) {
    throw new TypeError('WorkKey.repo must not contain "#"');
  }
  return { platform: key.platform.toLowerCase(), repo: key.repo.toLowerCase(), id: key.id };
}

/**
 * Canonical work key string `<platform>:<repo>#<id>`, with `platform` and
 * `repo` lower-cased — for example `github:bradygaster/squad#123`.
 *
 * @throws TypeError for keys rejected by {@link normalizeWorkKey}.
 */
export function workKeyToString(key: WorkKey): string {
  const k = normalizeWorkKey(key);
  return `${k.platform}:${k.repo}#${k.id}`;
}

// --- Executor identity ---

export interface ResolveExecutorIdentityOptions {
  /** Loaded machine capabilities (see `loadCapabilities`); only `machine` is read. */
  capabilities?: { machine?: string } | null;
  /** Platform login; informational only. */
  actor?: string;
  /** Environment to read; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Hostname source; defaults to `os.hostname`. Injectable for tests. */
  hostname?: () => string;
  /**
   * Salt for the hostname pseudonym (see {@link resolveExecutorIdentity}).
   * Watch passes the absolute team root path, which is never published;
   * defaults to `process.cwd()`.
   */
  hostnameSalt?: string;
  /** Override the per-process instance id. Injectable for tests. */
  instanceId?: string;
}

let processInstanceId: string | undefined;

function firstSet(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Published stand-in for a hostname: `h-` plus the first 12 hex digits of
 * `sha256(hostname + "\0" + salt)`. Stable per machine and salt, so one
 * machine's watchers agree, without publishing the hostname itself.
 */
export function hostnamePseudonym(hostname: string, salt: string): string {
  return `h-${createHash('sha256').update(`${hostname}\0${salt}`, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * Resolve this executor's claim identity.
 *
 * `machineId` is the first value set, in order: `SQUAD_MACHINE_ID`,
 * `capabilities.machine`, `SQUAD_POD_ID` (all used verbatim), then a
 * {@link hostnamePseudonym} of `os.hostname()` salted with `hostnameSalt`,
 * because claim records are readable by everyone who can fetch the remote.
 * `instanceId` is generated once per process, so repeated calls agree and two
 * watchers on one machine are distinct holders.
 */
export function resolveExecutorIdentity(opts: ResolveExecutorIdentityOptions = {}): ExecutorIdentity {
  const env = opts.env ?? process.env;
  const hostname = opts.hostname ?? os.hostname;
  const explicit = firstSet(env.SQUAD_MACHINE_ID, opts.capabilities?.machine, getPodId(env));
  let machineId = explicit;
  if (!machineId) {
    const host = firstSet(hostname());
    machineId = host ? hostnamePseudonym(host, opts.hostnameSalt ?? process.cwd()) : 'unknown-host';
  }
  const instanceId = firstSet(opts.instanceId) ?? (processInstanceId ??= randomUUID());
  const actor = firstSet(opts.actor);
  return actor ? { machineId, instanceId, actor } : { machineId, instanceId };
}

// --- Shared helpers ---

/**
 * @throws RangeError unless `o.ttlMs` is a positive finite number no larger
 *   than {@link MAX_CLAIM_TTL_MS} (a provider never writes a lease it would
 *   itself treat as implausible).
 */
export function assertClaimTtl(o: ClaimOptions): void {
  if (!o || typeof o.ttlMs !== 'number' || !Number.isFinite(o.ttlMs) || o.ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive finite number');
  }
  if (o.ttlMs > MAX_CLAIM_TTL_MS) {
    throw new RangeError(`ttlMs must be at most ${MAX_CLAIM_TTL_MS} (24 hours)`);
  }
}

function cloneRecord(record: ClaimRecord): ClaimRecord {
  return { ...record, key: { ...record.key }, holder: { ...record.holder } };
}

export interface ClaimProviderOptions {
  /** Holder identity; defaults to {@link resolveExecutorIdentity}(). */
  identity?: ExecutorIdentity;
  /** Clock in Unix ms; defaults to `Date.now`. */
  now?: () => number;
}

// --- NoopClaimProvider ---

/**
 * Today's behavior: no exclusion. `acquire` always succeeds with a synthetic
 * record so callers keep one code path; `renew` never fences and `release`
 * always reports `released`.
 */
export class NoopClaimProvider implements WorkClaimProvider {
  readonly name = 'none';
  readonly guarantees: ClaimProviderGuarantees = Object.freeze({
    exclusion: 'none',
    leases: false,
    fencing: false,
  });

  private readonly identity: ExecutorIdentity;
  private readonly now: () => number;

  constructor(opts: ClaimProviderOptions = {}) {
    this.identity = { ...(opts.identity ?? resolveExecutorIdentity()) };
    this.now = opts.now ?? Date.now;
  }

  async acquire(key: WorkKey, o: ClaimOptions): Promise<AcquireResult> {
    assertClaimTtl(o);
    const now = this.now();
    return {
      status: 'acquired',
      claim: {
        key: normalizeWorkKey(key),
        handle: `noop:${randomUUID()}`,
        holder: { ...this.identity },
        epoch: 1,
        acquiredAt: now,
        expiresAt: now + o.ttlMs,
      },
    };
  }

  async renew(c: ClaimRecord, o: ClaimOptions): Promise<RenewResult> {
    assertClaimTtl(o);
    const claim = cloneRecord(c);
    claim.handle = `noop:${randomUUID()}`;
    claim.epoch = c.epoch + 1;
    claim.expiresAt = this.now() + o.ttlMs;
    return { status: 'renewed', claim };
  }

  async release(_c: ClaimRecord, _outcome: FinishOutcome): Promise<ReleaseResult> {
    return { status: 'released' };
  }
}

// --- InMemoryClaimProvider ---

/**
 * Claim table shared by {@link InMemoryClaimProvider} instances. Give several
 * providers (different identities) one store to model contending executors
 * inside a single process.
 */
export class InMemoryClaimStore {
  private readonly records = new Map<string, ClaimRecord>();

  get(keyString: string): ClaimRecord | undefined {
    return this.records.get(keyString);
  }

  set(keyString: string, record: ClaimRecord): void {
    this.records.set(keyString, record);
  }

  delete(keyString: string): boolean {
    return this.records.delete(keyString);
  }

  get size(): number {
    return this.records.size;
  }

  clear(): void {
    this.records.clear();
  }
}

export interface InMemoryClaimProviderOptions extends ClaimProviderOptions {
  /** Shared claim table; defaults to a private store. */
  store?: InMemoryClaimStore;
  /** Takeover is allowed only once `expiresAt + skewMarginMs < now`. Default 0. */
  skewMarginMs?: number;
}

/**
 * Single-process provider backed by a `Map` and an injectable clock. Mirrors
 * the `git-ref` semantics (epochs, expiry takeover, handle compare-and-swap)
 * so it is a faithful test double. Each operation reads and writes the store
 * without yielding, so concurrent async callers on one key see exactly one
 * winner.
 */
export class InMemoryClaimProvider implements WorkClaimProvider {
  readonly name = 'in-memory';
  readonly guarantees: ClaimProviderGuarantees = Object.freeze({
    exclusion: 'local',
    leases: true,
    fencing: true,
  });

  readonly store: InMemoryClaimStore;
  private readonly identity: ExecutorIdentity;
  private readonly now: () => number;
  private readonly skewMarginMs: number;

  constructor(opts: InMemoryClaimProviderOptions = {}) {
    this.identity = { ...(opts.identity ?? resolveExecutorIdentity()) };
    this.now = opts.now ?? Date.now;
    this.store = opts.store ?? new InMemoryClaimStore();
    const skew = opts.skewMarginMs ?? 0;
    if (!Number.isFinite(skew) || skew < 0 || skew > MAX_CLAIM_SKEW_MARGIN_MS) {
      throw new RangeError(`skewMarginMs must be a finite number in [0, ${MAX_CLAIM_SKEW_MARGIN_MS}]`);
    }
    this.skewMarginMs = skew;
  }

  async acquire(key: WorkKey, o: ClaimOptions): Promise<AcquireResult> {
    assertClaimTtl(o);
    const normalized = normalizeWorkKey(key);
    const id = workKeyToString(normalized);
    const now = this.now();
    const current = this.store.get(id);
    const plausible = current && claimRecordImplausibility(current, now) === null;
    if (current && plausible && current.expiresAt + this.skewMarginMs >= now) {
      return { status: 'held', by: cloneRecord(current) };
    }
    const claim: ClaimRecord = {
      key: normalized,
      handle: randomUUID(),
      holder: { ...this.identity },
      // An implausible record is taken over as if expired, restarting at epoch 1.
      epoch: current && plausible ? current.epoch + 1 : 1,
      acquiredAt: now,
      expiresAt: now + o.ttlMs,
    };
    this.store.set(id, claim);
    return { status: 'acquired', claim: cloneRecord(claim) };
  }

  async renew(c: ClaimRecord, o: ClaimOptions): Promise<RenewResult> {
    assertClaimTtl(o);
    const id = workKeyToString(c.key);
    const current = this.store.get(id);
    if (!current) return { status: 'fenced' };
    if (current.handle !== c.handle) return { status: 'fenced', by: cloneRecord(current) };
    const claim: ClaimRecord = {
      ...cloneRecord(current),
      handle: randomUUID(),
      epoch: current.epoch + 1,
      expiresAt: this.now() + o.ttlMs,
    };
    this.store.set(id, claim);
    return { status: 'renewed', claim: cloneRecord(claim) };
  }

  async release(c: ClaimRecord, _outcome: FinishOutcome): Promise<ReleaseResult> {
    const id = workKeyToString(c.key);
    const current = this.store.get(id);
    if (!current) return { status: 'already-released' };
    if (current.handle !== c.handle) return { status: 'fenced' };
    this.store.delete(id);
    return { status: 'released' };
  }

  async inspect(key: WorkKey): Promise<ClaimRecord | null> {
    const current = this.store.get(workKeyToString(key));
    return current ? cloneRecord(current) : null;
  }
}
