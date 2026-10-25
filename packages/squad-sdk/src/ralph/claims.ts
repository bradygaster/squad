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
import { randomUUID } from 'node:crypto';
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
  /** Lease length in milliseconds; must be a positive finite number. */
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
 * Resolve this executor's claim identity.
 *
 * `machineId` is the first value set, in order: `SQUAD_MACHINE_ID`,
 * `capabilities.machine`, `SQUAD_POD_ID`, `os.hostname()`. `instanceId` is
 * generated once per process, so repeated calls agree and two watchers on one
 * machine are distinct holders.
 */
export function resolveExecutorIdentity(opts: ResolveExecutorIdentityOptions = {}): ExecutorIdentity {
  const env = opts.env ?? process.env;
  const hostname = opts.hostname ?? os.hostname;
  const machineId =
    firstSet(env.SQUAD_MACHINE_ID, opts.capabilities?.machine, getPodId(env), hostname()) ?? 'unknown-host';
  const instanceId = firstSet(opts.instanceId) ?? (processInstanceId ??= randomUUID());
  const actor = firstSet(opts.actor);
  return actor ? { machineId, instanceId, actor } : { machineId, instanceId };
}

// --- Shared helpers ---

function assertTtl(o: ClaimOptions): void {
  if (!o || typeof o.ttlMs !== 'number' || !Number.isFinite(o.ttlMs) || o.ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive finite number');
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
    assertTtl(o);
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
    assertTtl(o);
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
    if (!Number.isFinite(skew) || skew < 0) {
      throw new RangeError('skewMarginMs must be a non-negative finite number');
    }
    this.skewMarginMs = skew;
  }

  async acquire(key: WorkKey, o: ClaimOptions): Promise<AcquireResult> {
    assertTtl(o);
    const normalized = normalizeWorkKey(key);
    const id = workKeyToString(normalized);
    const now = this.now();
    const current = this.store.get(id);
    if (current && current.expiresAt + this.skewMarginMs >= now) {
      return { status: 'held', by: cloneRecord(current) };
    }
    const claim: ClaimRecord = {
      key: normalized,
      handle: randomUUID(),
      holder: { ...this.identity },
      epoch: current ? current.epoch + 1 : 1,
      acquiredAt: now,
      expiresAt: now + o.ttlMs,
    };
    this.store.set(id, claim);
    return { status: 'acquired', claim: cloneRecord(claim) };
  }

  async renew(c: ClaimRecord, o: ClaimOptions): Promise<RenewResult> {
    assertTtl(o);
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
