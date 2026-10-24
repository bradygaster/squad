import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultHarnessRegistry, validateExtensions } from './harness-registry.js';
import {
  ALL_CONTENT_PART_TYPES,
  BACKEND_CAPABILITIES,
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  intersectCapabilities,
  partsToText,
  TERMINAL_RUN_STATES,
} from './types.js';
import type {
  ApprovalRecord,
  ApprovalRequest,
  ApprovalResponse,
  BackendAdmission,
  BackendConversation,
  BackendCursor,
  BackendEnvelope,
  BackendEventPage,
  BackendHealth,
  BackendMessage,
  BackendStateStore,
  BackendTurn,
  CreateConversationOptions,
  HarnessEventEnvelope,
  HarnessRegistry,
  LeaseEpoch,
  NegotiatedCapabilities,
  ProtocolHello,
  ReadEventsOptions,
  SquadBackend,
} from './types.js';

/** A harness call (cancel / approval) that was decided and persisted but not yet acknowledged. */
type PendingDelivery =
  | { operationId: string; kind: 'cancel'; runId: string; seq: number }
  | { operationId: string; kind: 'approval'; runId: string; seq: number; response: ApprovalResponse };

interface StoredConversation {
  info: BackendConversation;
  transcript: BackendMessage[];
  turns: BackendTurn[];
  events?: BackendEnvelope[];
  approvals?: ApprovalRecord[];
  /** Set once any caller presented an epoch: from then on every write must present one. */
  fenced?: boolean;
  /** Decisions awaiting an idempotent harness acknowledgement; retried until delivered. */
  deliveries?: PendingDelivery[];
  /** Admitted turns whose initial harness.submit(...) has not yet completed; retried on same-(runId, seq) sendMessage. */
  pendingSubmissions?: Array<{ operationId?: string; runId: string; seq: number }>;
}

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
/** Windows reserved device names are valid ID_RE matches but cannot be used as file names. */
const WINDOWS_RESERVED_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const ROOT = 'backend/conversations';
const LOCKS = 'backend/locks';

export function isValidConversationId(id: string): boolean {
  return ID_RE.test(id) && !WINDOWS_RESERVED_RE.test(id);
}

export class MemoryStateStore implements BackendStateStore {
  private readonly files = new Map<string, string>();
  read(p: string): string | undefined { return this.files.get(p); }
  write(p: string, content: string): void { this.files.set(p, content); }
  exists(p: string): boolean { return this.files.has(p); }
  list(dir: string): string[] {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return [...this.files.keys()].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 10;

/**
 * Remove an abandoned lock under an exclusive `.recover` mutex. While holding it the lock is re-read: it is
 * only removed if it is still byte-for-byte (and mtime-for-mtime) the stale lock that was observed, so a lock
 * a faster waiter has since re-acquired is never touched and two waiters can never both own the lock.
 *
 * The mutex itself is protected against a reclaimer that dies while holding it: it carries an owner token and
 * is only held for microseconds, so once it is older than `recoverStaleMs` it is claimed by atomic rename
 * (one winner), re-verified against the token that was observed, and discarded. A live mutex is never taken.
 */
function recoverStaleLock(lockPath: string, observed: string, observedMtime: number, staleLockMs: number, recoverStaleMs: number): boolean {
  const mutex = `${lockPath}.recover`;
  const token = `${process.pid}:${randomUUID()}`;
  let fd: number;
  try {
    fd = fs.openSync(mutex, 'wx');
    fs.writeSync(fd, token);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    reclaimAbandonedMutex(mutex, recoverStaleMs);
    return false;
  }
  try {
    let current: string;
    let mtime: number;
    try { current = fs.readFileSync(lockPath, 'utf8'); mtime = fs.statSync(lockPath).mtimeMs; } catch { return true; } // already gone
    if (current !== observed || mtime !== observedMtime || Date.now() - mtime <= staleLockMs) return true; // replaced by a live holder
    fs.rmSync(lockPath, { force: true });
    return true;
  } finally {
    fs.closeSync(fd);
    try { if (fs.readFileSync(mutex, 'utf8') === token) fs.rmSync(mutex, { force: true }); } catch { /* already reclaimed */ }
  }
}

function reclaimAbandonedMutex(mutex: string, recoverStaleMs: number): void {
  let observed: string;
  try {
    if (Date.now() - fs.statSync(mutex).mtimeMs <= recoverStaleMs) return; // held by a live reclaimer
    observed = fs.readFileSync(mutex, 'utf8');
  } catch { return; }
  const dead = `${mutex}.dead.${process.pid}.${randomUUID()}`;
  try { fs.renameSync(mutex, dead); } catch { return; } // another waiter claimed it first
  let claimed: string | undefined;
  try { claimed = fs.readFileSync(dead, 'utf8'); } catch { /* unreadable: treat as the abandoned one */ }
  if (claimed !== undefined && claimed !== observed) {
    // we raced a fresh mutex: put it back (no-op if a newer one already exists)
    try { fs.linkSync(dead, mutex); } catch { /* newer owner present */ }
  }
  fs.rmSync(dead, { force: true });
}
/** File-system store rooted at a `.squad` directory. Never follows symlinks/junctions below the root. */
export interface FileStateStoreOptions {
  /** A lock file untouched for longer than this is treated as abandoned by a crashed holder. */
  staleLockMs?: number;
  lockTimeoutMs?: number;
  /** An abandoned .recover mutex (its holder died) older than this is reclaimed. Defaults to min(staleLockMs, 2s). */
  recoverStaleMs?: number;
  /** Test seam: runs after a stale lock was observed and before recovery starts. */
  beforeStaleRecovery?: (lockPath: string) => void;
  /** Test seam: overrides reading/stat'ing an existing lock file during contention. */
  inspectLockFile?: (lockPath: string) => { observed: string; observedMtime: number };
}

export function createFileStateStore(squadDir: string, options: FileStateStoreOptions = {}): BackendStateStore {
  const staleLockMs = options.staleLockMs ?? LOCK_STALE_MS;
  const lockTimeoutMs = options.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  const recoverStaleMs = options.recoverStaleMs ?? Math.min(staleLockMs, 2_000);
  const root = path.resolve(squadDir);
  const assertNotSymlink = (target: string): boolean => {
    let st: fs.Stats;
    try { st = fs.lstatSync(target); } catch { return false; }
    if (st.isSymbolicLink()) {
      throw new BackendError('invalid-request', 'State path contains a symbolic link or junction', 400);
    }
    return true;
  };
  const resolve = (rel: string): string => {
    const parent = path.dirname(root);
    if (path.basename(parent) === '.squad') assertNotSymlink(parent);
    assertNotSymlink(root);
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) {
      throw new BackendError('invalid-request', 'Path escapes state directory', 400);
    }
    // a lexical prefix check is not containment: reject any existing symlink/junction between root and target
    let cur = root;
    for (const part of path.relative(root, full).split(path.sep)) {
      cur = path.join(cur, part);
      if (!assertNotSymlink(cur)) break; // the rest does not exist yet
    }
    return full;
  };
  /**
   * One acquisition attempt. Returns the release function when the lock was taken, or `'wait'` when the
   * caller should sleep and retry; throws once the deadline has passed.
   */
  const tryAcquire = (lockPath: string, token: string, deadline: number): (() => void) | 'wait' => {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, token);
      fs.closeSync(fd);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // another process pruned the (empty) lock directory between our mkdir and open: recreate and retry
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
        return 'wait';
      }
      if (code !== 'EEXIST') throw err;
      // Crash recovery: an abandoned lock is claimed by atomic rename, so exactly one waiter wins it.
      // The claimed file is re-checked; if it turns out to be a live holder's lock it is put back untouched.
      try {
        const { observed, observedMtime } = options.inspectLockFile
          ? options.inspectLockFile(lockPath)
          : { observed: fs.readFileSync(lockPath, 'utf8'), observedMtime: fs.statSync(lockPath).mtimeMs };
        if (Date.now() - observedMtime > staleLockMs) {
          options.beforeStaleRecovery?.(lockPath);
          if (recoverStaleLock(lockPath, observed, observedMtime, staleLockMs, recoverStaleMs)) return 'wait';
        }
      } catch {
        // Fall through to the deadline check and sleep so a persistent permission error (EACCES/EPERM)
        // or race on lockPath respects lockTimeoutMs instead of spinning forever.
      }
      if (Date.now() > deadline) {
        throw new BackendError('unavailable', 'Timed out waiting for the conversation lock', 503);
      }
      return 'wait';
    }
    return () => {
      try { if (fs.readFileSync(lockPath, 'utf8') === token) fs.rmSync(lockPath, { force: true }); } catch { /* already gone */ }
    };
  };
  const prepareLock = (key: string): { lockPath: string; token: string; deadline: number } => {
    const lockPath = resolve(`${key}.lock`);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    resolve(`${key}.lock`);
    return { lockPath, token: `${process.pid}:${randomUUID()}`, deadline: Date.now() + lockTimeoutMs };
  };
  const readFile = (rel: string): string | undefined => {
    try { return fs.readFileSync(resolve(rel), 'utf8'); } catch (e) {
      if (e instanceof BackendError) throw e;
      // only a missing file is "absent"; EPERM/EBUSY/EIO must not be mistaken for an empty slot
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new BackendError('unavailable', `Cannot read state file '${rel}': ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}`, 503);
    }
  };
  return {
    lock: key => {
      const { lockPath, token, deadline } = prepareLock(key);
      for (;;) {
        const r = tryAcquire(lockPath, token, deadline);
        if (r !== 'wait') return r;
        sleepSync(LOCK_POLL_MS);
      }
    },
    lockAsync: async key => {
      const { lockPath, token, deadline } = prepareLock(key);
      for (;;) {
        const r = tryAcquire(lockPath, token, deadline);
        if (r !== 'wait') return r;
        await sleep(LOCK_POLL_MS);
      }
    },
    read: readFile,
    write: (rel, content) => {
      const full = resolve(rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      resolve(rel); // re-check after directories were created
      const tmp = `${full}.${process.pid}.${randomUUID()}.tmp`;
      const fd = fs.openSync(tmp, 'wx');
      try {
        fs.writeSync(fd, content, null, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      try {
        fs.renameSync(tmp, full);
      } catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
    },
    exists: rel => fs.existsSync(resolve(rel)),
    list: rel => {
      try { return fs.readdirSync(resolve(rel)); } catch (e) {
        if (e instanceof BackendError) throw e;
        return [];
      }
    },
  };
}

export interface LocalSquadBackendOptions {
  state?: BackendStateStore;
  harnesses?: HarnessRegistry;
  kind?: string;
}

export class LocalSquadBackend implements SquadBackend {
  readonly kind: string;
  private readonly state: BackendStateStore;
  readonly harnesses: HarnessRegistry;
  private readonly subscriptions = new Map<string, () => void>();
  private readonly loading = new Map<string, StoredConversation>();
  private readonly txActive = new Set<string>();
  private readonly inflightSubmissions = new Map<string, Promise<void>>();

  constructor(options: LocalSquadBackendOptions = {}) {
    this.kind = options.kind ?? 'local';
    this.state = options.state ?? new MemoryStateStore();
    this.harnesses = options.harnesses ?? new DefaultHarnessRegistry();
  }

  async createConversation(options: CreateConversationOptions = {}): Promise<BackendConversation> {
    validateExtensions(options.metadata);
    const id = options.conversationId ?? randomUUID();
    this.assertId(id);
    const release = await this.acquire(id);
    try {
      const existing = this.load(id, false);
      if (existing) return existing.info; // idempotent create
      const info: BackendConversation = {
        conversationId: id,
        epoch: 1,
        createdAt: new Date().toISOString(),
        title: options.title,
        metadata: options.metadata,
      };
      const conv: StoredConversation = { info, transcript: [], turns: [], events: [] };
      this.emit(conv, 'control', 'conversation.created', { conversationId: id });
      this.save(conv);
      return info;
    } finally {
      release?.();
    }
  }

  async sendMessage(conversationId: string, message: BackendMessage): Promise<BackendAdmission> {
    if (message?.parts?.length && !message.content) message = { ...message, content: partsToText(message.parts) };
    if (!message?.runId || !Number.isInteger(message.seq) || message.seq < 0) {
      throw new BackendError('invalid-request', 'message requires runId and a non-negative integer seq', 400);
    }
    const msg = message;
    const submissionOpId = `${conversationId}:${msg.runId}:${msg.seq}`;
    const dispatchKey = `${conversationId}\u0000${msg.runId}\u0000${msg.seq}`;
    const admitted = await this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, msg.epoch);
      const dup = conv.turns.find(t => t.runId === msg.runId && t.seq === msg.seq);
      if (dup) {
        // (runId, seq) is an idempotency key: the same key with a different payload is a client bug, not a retry
        const original = dup.messages[0];
        if (original && !sameMessagePayload(original, msg)) {
          throw new BackendError('conflict', `Idempotency key (${msg.runId}, ${msg.seq}) was reused with a different message payload`, 409);
        }
        const cursor = this.admissionCursor(conv, dup);
        const pendingEntry = conv.pendingSubmissions?.find(s => s.runId === dup.runId && s.seq === dup.seq);
        const pendingSubmit = Boolean(pendingEntry) && !TERMINAL_RUN_STATES.includes(dup.state);
        if (pendingSubmit && original?.harness) {
          const retryAdapter = this.harnesses.get(original.harness);
          if (!retryAdapter) {
            throw new BackendError(
              'unavailable',
              `Harness '${original.harness}' is not registered; the submit delivery stays queued and will be retried`,
              503,
            );
          }
          pendingEntry!.operationId ??= submissionOpId;
          return {
            duplicate: true as const,
            needsSubmit: true as const,
            adapter: retryAdapter,
            stored: original,
            epoch: dup.epoch ?? conv.info.epoch,
            cursor,
            operationId: pendingEntry!.operationId,
          };
        }
        return {
          duplicate: true as const,
          needsSubmit: false as const,
          admission: {
            protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: dup.runId, seq: dup.seq, duplicate: true,
            state: dup.state, epoch: conv.info.epoch, correlationId: msg.correlationId,
            // the cursor at the ORIGINAL admission, so a client that lost the first response replays everything after it
            cursor,
          } satisfies BackendAdmission,
        };
      }

      const adapter = msg.harness ? this.harnesses.get(msg.harness) : undefined;
      if (msg.harness && !adapter) {
        throw new BackendError('invalid-request', `Unknown harness '${msg.harness}'`, 400);
      }
      validateExtensions(msg.extensions, adapter?.capabilities.extensionNamespaces);

      const epoch = conv.info.epoch;
      const stored: BackendMessage = { ...msg, epoch };
      const turn: BackendTurn = {
        conversationId,
        runId: msg.runId,
        seq: msg.seq,
        state: adapter ? 'running' : 'queued',
        tasks: [],
        messages: [stored],
        extensions: msg.extensions,
        epoch,
      };
      conv.transcript.push(stored);
      conv.turns.push(turn);
      if (adapter) {
        (conv.pendingSubmissions ??= []).push({ operationId: submissionOpId, runId: msg.runId, seq: msg.seq });
      }
      const accepted = this.emit(conv, 'control', 'message.accepted',
        { runId: msg.runId, seq: msg.seq, state: turn.state }, msg.correlationId, msg.causationId);
      return {
        duplicate: false as const,
        needsSubmit: Boolean(adapter),
        adapter,
        stored,
        epoch,
        cursor: accepted.cursor,
        operationId: submissionOpId,
      };
    });
    if (!admitted.needsSubmit && admitted.duplicate) return admitted.admission;

    const { adapter, stored, epoch, cursor, operationId } = admitted;
    if (adapter) {
      this.ensureSubscribed(conversationId, adapter.id);
      let inflight = this.inflightSubmissions.get(dispatchKey);
      if (!inflight) {
        inflight = (async () => {
          try {
            await adapter.submit({
              conversationId, runId: msg.runId, seq: msg.seq, operationId,
              messages: [stored], extensions: stored.extensions, epoch,
            });
          } catch (err) {
            throw new BackendError(
              'unavailable',
              `Harness submit delivery failed and will be retried: ${err instanceof Error ? err.message : String(err)}`,
              503,
            );
          }
          await this.tx(conversationId, (fresh) => {
            this.clearPendingSubmission(fresh, msg.runId, msg.seq);
          });
        })().finally(() => {
          this.inflightSubmissions.delete(dispatchKey);
        });
        this.inflightSubmissions.set(dispatchKey, inflight);
      }
      await inflight;
    }
    const latest = this.load(conversationId);
    const final = this.findTurn(latest, msg.runId, msg.seq)!;
    return {
      protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: final.runId, seq: final.seq, duplicate: admitted.duplicate,
      state: final.state, epoch: latest.info.epoch, correlationId: msg.correlationId, cursor,
    };
  }

  async getTranscript(conversationId: string): Promise<BackendMessage[]> {
    return this.load(conversationId).transcript;
  }

  async getTurn(conversationId: string, seq: number): Promise<BackendTurn> {
    return this.requireTurn(this.load(conversationId), seq);
  }

  async cancelTurn(conversationId: string, seq: number, epoch?: LeaseEpoch): Promise<BackendTurn> {
    const target = await this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, epoch);
      const turn = this.requireTurn(conv, seq);
      this.markCancelled(conv, turn);
      return { runId: turn.runId, seq: turn.seq };
    });
    await this.flushDeliveries(conversationId);
    return this.findTurn(this.load(conversationId), target.runId, target.seq)!;
  }

  async cancelRun(conversationId: string, runId: string, reason?: string, epoch?: LeaseEpoch): Promise<BackendTurn> {
    const last = await this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, epoch);
      const turns = conv.turns.filter(t => t.runId === runId);
      if (turns.length === 0) throw new BackendError('not-found', `Run '${runId}' not found`, 404);
      for (const turn of turns) this.markCancelled(conv, turn, reason);
      const tail = turns[turns.length - 1]!;
      return { runId: tail.runId, seq: tail.seq };
    });
    // harness calls happen outside the transaction; each acknowledgement reloads fresh state
    await this.flushDeliveries(conversationId);
    return this.findTurn(this.load(conversationId), last.runId, last.seq)!;
  }

  async getApprovals(conversationId: string): Promise<ApprovalRecord[]> {
    return this.load(conversationId).approvals ?? [];
  }

  async respondApproval(conversationId: string, response: ApprovalResponse): Promise<BackendTurn> {
    const target = await this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, response.epoch);
      const turn = conv.turns.find(t => t.pendingApproval?.approvalId === response.approvalId);
      if (!turn || !turn.pendingApproval || turn.state !== 'awaiting-approval') {
        // an already-decided approval whose harness acknowledgement is still outstanding may be retried verbatim
        const outstanding = (conv.deliveries ?? []).find(d => d.kind === 'approval'
          && d.response.approvalId === response.approvalId
          && d.response.hash === response.hash
          && d.response.decision === response.decision);
        if (outstanding) return { runId: outstanding.runId, seq: outstanding.seq };
        throw new BackendError('approval-not-pending', `No pending approval '${response.approvalId}'`, 409);
      }
      if (turn.pendingApproval.hash !== response.hash) {
        throw new BackendError('approval-hash-mismatch', 'Approval hash does not match the pending request', 409);
      }
      turn.pendingApproval = undefined;
      turn.state = response.decision === 'approve' ? 'running' : 'cancelled';
      const record = (conv.approvals ?? []).find(a => a.approvalId === response.approvalId);
      if (record) {
        record.version = (record.version ?? 1) + 1;
        record.state = response.decision === 'approve' ? 'approved' : 'denied';
        record.decision = response.decision;
        record.reason = response.reason;
        record.decidedAt = new Date().toISOString();
      }
      this.emit(conv, 'control', 'approval.resolved',
        { runId: turn.runId, seq: turn.seq, approvalId: response.approvalId, decision: response.decision, version: record?.version ?? 2, state: turn.state });
      if (turn.messages[0]?.harness) {
        (conv.deliveries ??= []).push({ operationId: randomUUID(), kind: 'approval', runId: turn.runId, seq: turn.seq, response });
      }
      return { runId: turn.runId, seq: turn.seq };
    });
    await this.flushDeliveries(conversationId);
    // reload by the approval's own (runId, seq): different runs may share a seq
    return this.findTurn(this.load(conversationId), target.runId, target.seq)!;
  }

  async negotiate(hello: ProtocolHello): Promise<NegotiatedCapabilities> {
    if (!hello?.protocols?.includes(BACKEND_PROTOCOL_VERSION)) {
      throw new BackendError('unsupported-protocol',
        `Server speaks protocol ${BACKEND_PROTOCOL_VERSION}; client offered [${(hello?.protocols ?? []).join(', ')}]`, 400);
    }
    const server = new Set(this.harnesses.list().flatMap(h => h.capabilities.extensionNamespaces));
    const wanted = hello.extensionNamespaces;
    const effective = intersectCapabilities(BACKEND_CAPABILITIES, hello.capabilities, hello.policyCapabilities);
    const typed = effective.includes('typed-content-parts');
    const parts = (hello.contentParts ?? ALL_CONTENT_PART_TYPES).filter(p => typed || p === 'text');
    return {
      protocol: BACKEND_PROTOCOL_VERSION,
      clientCapabilities: hello.capabilities ? [...hello.capabilities] : [...BACKEND_CAPABILITIES],
      backendCapabilities: [...BACKEND_CAPABILITIES],
      policyCapabilities: hello.policyCapabilities ? [...hello.policyCapabilities] : undefined,
      effectiveCapabilities: effective,
      contentParts: ALL_CONTENT_PART_TYPES.filter(p => parts.includes(p)),
      extensionNamespaces: [...server].filter(ns => !wanted || wanted.includes(ns)),
      streams: ['control', 'execution'],
      atLeastOnce: true,
      resume: effective.includes('cursor-reconnect'),
      approvals: effective.includes('approvals'),
      harnesses: this.harnesses.list().map(h => h.id),
    };
  }

  async readEvents(conversationId: string, options: ReadEventsOptions = {}): Promise<BackendEventPage> {
    const conv = this.load(conversationId);
    const tail = conv.events?.[conv.events.length - 1]?.sequence ?? 0;
    const lastAcceptedSeq = tail;
    const after = options.after === undefined ? 0 : decodeCursor(options.after, conversationId);
    if (after > tail) {
      return { events: [], nextCursor: encodeCursor(conversationId, tail), lastAcceptedSeq, resumable: false };
    }
    let events = (conv.events ?? []).filter(e => (e.sequence ?? 0) > after);
    if (options.stream) events = events.filter(e => e.stream === options.stream);
    if (options.limit !== undefined && options.limit > 0) events = events.slice(0, options.limit);
    const last = events[events.length - 1];
    return {
      events,
      nextCursor: last?.cursor ?? options.after ?? encodeCursor(conversationId, 0),
      lastAcceptedSeq,
      resumable: true,
    };
  }

  async health(): Promise<BackendHealth> {
    return { ok: true, live: true, ready: true, backend: this.kind, detail: `${this.harnesses.list().length} harness(es)` };
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * One complete read-modify-write of a conversation, serialized across processes by the store lock
   * (when the store provides one). Harness calls must never run inside `fn`. The lock wait is
   * asynchronous (timer based) so a contended conversation never stalls the host event loop.
   */
  private async tx<T>(conversationId: string, fn: (conv: StoredConversation) => T): Promise<T> {
    this.assertId(conversationId);
    const release = await this.acquire(conversationId);
    return this.locked(conversationId, fn, release);
  }

  /**
   * Synchronous variant for harness event callbacks, which are delivered synchronously by the SPI and have
   * no way to await. Falls back to the store's blocking `lock` when it offers one.
   */
  private txSync<T>(conversationId: string, fn: (conv: StoredConversation) => T): T {
    this.assertId(conversationId);
    return this.locked(conversationId, fn, this.state.lock?.(`${LOCKS}/${conversationId}`));
  }

  private async acquire(conversationId: string): Promise<(() => void) | undefined> {
    if (this.state.lockAsync) return this.state.lockAsync(`${LOCKS}/${conversationId}`);
    return this.state.lock?.(`${LOCKS}/${conversationId}`);
  }

  private locked<T>(conversationId: string, fn: (conv: StoredConversation) => T, release: (() => void) | undefined): T {
    this.txActive.add(conversationId);
    try {
      const conv = this.load(conversationId);
      const result = fn(conv);
      this.save(conv);
      return result;
    } finally {
      this.txActive.delete(conversationId);
      release?.();
    }
  }

  private emit(
    conv: StoredConversation,
    stream: BackendEnvelope['stream'],
    type: string,
    payload: unknown,
    correlationId?: string,
    causationId?: string,
  ): BackendEnvelope {
    conv.events ??= [];
    const sequence = (conv.events[conv.events.length - 1]?.sequence ?? 0) + 1;
    const id = conv.info.conversationId;
    const env: BackendEnvelope = {
      protocol: BACKEND_PROTOCOL_VERSION,
      id: `evt_${id}_${sequence}`,
      kind: 'event', stream, type, conversationId: id, sequence,
      cursor: encodeCursor(id, sequence), correlationId, causationId,
      timestamp: new Date().toISOString(), payload,
    };
    conv.events.push(env);
    return env;
  }

  private admissionCursor(conv: StoredConversation, turn: BackendTurn): BackendCursor {
    const accepted = (conv.events ?? []).find(e => e.type === 'message.accepted'
      && (e.payload as { runId?: string; seq?: number }).runId === turn.runId
      && (e.payload as { runId?: string; seq?: number }).seq === turn.seq);
    return accepted?.cursor ?? this.tailCursor(conv);
  }

  private tailCursor(conv: StoredConversation): BackendCursor {
    return conv.events?.[conv.events.length - 1]?.cursor ?? encodeCursor(conv.info.conversationId, 0);
  }

  /** Resolve a still-pending approval as cancelled: advance its version and stamp the decision time. */
  private cancelPendingApproval(conv: StoredConversation, turn: BackendTurn): void {
    const approvalId = turn.pendingApproval?.approvalId;
    if (!approvalId) return;
    const record = (conv.approvals ?? []).find(a => a.approvalId === approvalId);
    if (record && record.state === 'pending') {
      record.state = 'cancelled';
      record.version = (record.version ?? 1) + 1;
      record.decidedAt = new Date().toISOString();
      this.emit(conv, 'control', 'approval.resolved',
        { runId: turn.runId, seq: turn.seq, approvalId, version: record.version, state: 'cancelled' });
    }
    turn.pendingApproval = undefined;
  }

  private clearPendingSubmission(conv: StoredConversation, runId: string, seq: number): void {
    if (!conv.pendingSubmissions) return;
    conv.pendingSubmissions = conv.pendingSubmissions.filter(s => !(s.runId === runId && s.seq === seq));
    if (conv.pendingSubmissions.length === 0) delete conv.pendingSubmissions;
  }

  private clearQueuedApprovals(conv: StoredConversation, runId: string, seq: number): void {
    if (!conv.deliveries?.length) return;
    conv.deliveries = conv.deliveries.filter(
      d => !(d.kind === 'approval' && d.runId === runId && d.seq === seq),
    );
  }

  /** Persist the cancellation (and an outstanding harness delivery); the harness call happens later. */
  private markCancelled(conv: StoredConversation, turn: BackendTurn, reason?: string): void {
    if (TERMINAL_RUN_STATES.includes(turn.state)) return;
    this.clearPendingSubmission(conv, turn.runId, turn.seq);
    this.clearQueuedApprovals(conv, turn.runId, turn.seq);
    this.cancelPendingApproval(conv, turn);
    turn.state = 'cancelled';
    const requested = this.emit(conv, 'control', 'cancellation.requested', { runId: turn.runId, seq: turn.seq, reason });
    this.emit(conv, 'control', 'turn.state', { runId: turn.runId, seq: turn.seq, state: 'cancelled' }, undefined, requested.id);
    if (turn.messages[0]?.harness) {
      (conv.deliveries ??= []).push({ operationId: randomUUID(), kind: 'cancel', runId: turn.runId, seq: turn.seq });
    }
  }

  /**
   * Deliver persisted decisions to their harnesses. A delivery is removed only after the harness acknowledged
   * it, so a failure leaves it queued and a verbatim retry re-delivers; adapters must treat `cancel` and
   * `respondApproval` as idempotent. Failure surfaces as a retryable `unavailable` error.
   */
  private async flushDeliveries(conversationId: string): Promise<void> {
    // Legacy entries (`id`, or no `operationId`) are normalized deterministically on load; write that back under
    // the lock BEFORE any external delivery so a crash mid-delivery restarts with the very same operationId.
    if (this.outboxNeedsWriteThrough(conversationId)) await this.tx(conversationId, () => undefined);
    for (;;) {
      const conv = this.load(conversationId);
      const next = conv.deliveries?.[0];
      if (!next) return;
      const turn = this.findTurn(conv, next.runId, next.seq);
      const harness = turn?.messages[0]?.harness;
      const adapter = harness ? this.harnesses.get(harness) : undefined;
      if (harness && !adapter) {
        // never discard a durable delivery because the harness is not registered (yet): keep it for a retry
        throw new BackendError('unavailable',
          `Harness '${harness}' is not registered; the ${next.kind} delivery stays queued and will be retried`, 503);
      }
      try {
        if (adapter) {
          if (next.kind === 'cancel') await adapter.cancel(conversationId, next.runId, next.seq, next.operationId);
          else await adapter.respondApproval(conversationId, next.response, next.operationId);
        }
      } catch (err) {
        throw new BackendError('unavailable',
          `Harness ${next.kind} delivery failed and will be retried: ${err instanceof Error ? err.message : String(err)}`, 503);
      }
      await this.tx(conversationId, (fresh) => {
        fresh.deliveries = (fresh.deliveries ?? []).filter(d => d.operationId !== next.operationId);
      });
    }
  }

  private outboxNeedsWriteThrough(conversationId: string): boolean {
    try {
      const raw = this.state.read(`${ROOT}/${conversationId}.json`);
      const deliveries = raw ? (JSON.parse(raw) as { deliveries?: Array<Record<string, unknown>> }).deliveries : undefined;
      return !!deliveries?.some(d => !d['operationId'] || 'id' in d);
    } catch {
      return false;
    }
  }

  private adapterFor(turn: BackendTurn) {
    const harness = turn.messages[0]?.harness;
    return harness ? this.harnesses.get(harness) : undefined;
  }

  /** After a broker restart, re-attach to harnesses of in-flight turns so their events keep flowing. */
  private rehydrate(conv: StoredConversation): void {
    for (const turn of conv.turns) {
      const harness = turn.messages[0]?.harness;
      if (harness && !TERMINAL_RUN_STATES.includes(turn.state) && this.harnesses.get(harness)) {
        this.ensureSubscribed(conv.info.conversationId, harness);
      }
    }
  }

  private ensureSubscribed(conversationId: string, harnessId: string): void {
    const key = `${conversationId}\u0000${harnessId}`;
    if (this.subscriptions.has(key)) return;
    const adapter = this.harnesses.get(harnessId)!;
    // track BEFORE subscribing: an adapter that replays synchronously must not re-enter rehydration
    this.subscriptions.set(key, () => undefined);
    try {
      this.subscriptions.set(key, adapter.subscribe(conversationId, ev => this.applyEvent(conversationId, harnessId, ev)));
    } catch (err) {
      this.subscriptions.delete(key);
      throw err;
    }
  }

  private applyEvent(conversationId: string, harnessId: string, incoming: HarnessEventEnvelope): void {
    const loading = this.loading.get(conversationId);
    if (loading) {
      // synchronous replay while this conversation is being loaded: apply to the in-memory state instead of
      // re-entering load() (and the non-reentrant lock). Persisted by the enclosing tx, or re-applied
      // (idempotently) right after the load when there is none.
      this.applyEventLocked(loading, harnessId, incoming);
      if (!this.txActive.has(conversationId)) queueMicrotask(() => this.applyEvent(conversationId, harnessId, incoming));
      return;
    }
    try {
      this.txSync(conversationId, conv => this.applyEventLocked(conv, harnessId, incoming));
    } catch (err) {
      if (err instanceof BackendError && err.code === 'not-found') return;
      throw err;
    }
  }

  private applyEventLocked(conv: StoredConversation, harnessId: string, ev: HarnessEventEnvelope): void {
    let emitted: object = ev;
    const turn = this.findTurn(conv, ev.runId, ev.seq);
    if (!turn || TERMINAL_RUN_STATES.includes(turn.state)) return;
    if (turn.messages[0]?.harness !== harnessId) return;
    // fencing: output issued under an older lease than the conversation's current one is stale
    const eventEpoch = ev.epoch ?? turn.epoch ?? 1;
    if (eventEpoch < conv.info.epoch) {
      this.emit(conv, 'control', 'harness.epoch-rejected',
        { runId: turn.runId, seq: turn.seq, eventType: ev.type, rejectedEpoch: eventEpoch, currentEpoch: conv.info.epoch });
      return;
    }
    this.clearPendingSubmission(conv, turn.runId, turn.seq);
    switch (ev.type) {
      case 'message':
        if (turn.messages.some(m => m.runId === ev.message.runId && m.seq === ev.message.seq && m.role === ev.message.role && m.content === ev.message.content)) return;
        turn.messages.push(ev.message);
        conv.transcript.push(ev.message);
        break;
      case 'task': {
        const task = turn.tasks.find(t => t.id === ev.id);
        if (task && task.state === ev.state && (ev.title === undefined || ev.title === task.title)) return;
        if (task) { task.state = ev.state; task.title = ev.title ?? task.title; }
        else turn.tasks.push({ id: ev.id, state: ev.state, title: ev.title });
        break;
      }
      case 'approval-requested': {
        // harness delivery is at-least-once: a redelivered request must not create a second approval
        if ((conv.approvals ?? []).some(a => a.approvalId === ev.request.approvalId)) return;
        // single-pending-approval model per turn: reject a second distinct request before replacing the first
        if (turn.pendingApproval) return;
        const request: ApprovalRequest = {
          ...ev.request, version: 1, scope: ev.request.scope ?? { kind: 'turn', runId: turn.runId, seq: turn.seq },
        };
        turn.pendingApproval = request;
        turn.state = 'awaiting-approval';
        (conv.approvals ??= []).push({
          ...request, state: 'pending', runId: turn.runId, requestedAt: new Date().toISOString(),
        });
        emitted = { ...ev, request };
        break;
      }
      case 'state':
        if (turn.state === ev.state) return;
        if (turn.pendingApproval && !TERMINAL_RUN_STATES.includes(ev.state)) return; // only a decision resumes an awaiting turn
        // a terminal state closes any approval still pending so a late decision cannot revive the turn
        if (TERMINAL_RUN_STATES.includes(ev.state)) {
          this.clearQueuedApprovals(conv, turn.runId, turn.seq);
          this.cancelPendingApproval(conv, turn);
        }
        turn.state = ev.state;
        if (ev.error) turn.error = ev.error;
        break;
    }
    this.emit(conv, ev.type === 'state' || ev.type === 'approval-requested' ? 'control' : 'execution',
      ev.type === 'state' ? 'turn.state' : ev.type === 'approval-requested' ? 'approval.requested' : `harness.${ev.type}`,
      { ...emitted });
  }

  /**
   * Lease fencing. Once any caller has presented an epoch the conversation is fenced: writes must present the
   * current (or a newer, taking over) epoch, and omitting it is rejected rather than treated as a bypass.
   */
  private checkEpoch(conv: StoredConversation, epoch: number | undefined): void {
    if (epoch === undefined) {
      if (conv.fenced) {
        throw new BackendError('stale-epoch',
          `Conversation is lease-fenced at epoch ${conv.info.epoch}; the write must present its epoch`, 409);
      }
      return;
    }
    if (!Number.isInteger(epoch) || epoch < 1) throw new BackendError('invalid-request', 'epoch must be a positive integer', 400);
    if (epoch < conv.info.epoch) {
      throw new BackendError('stale-epoch', `Epoch ${epoch} is stale; current epoch is ${conv.info.epoch}`, 409);
    }
    conv.fenced = true;
    if (epoch > conv.info.epoch) conv.info.epoch = epoch; // newer lease holder takes over
  }

  private findTurn(conv: StoredConversation, runId: string, seq: number): BackendTurn | undefined {
    return conv.turns.find(t => t.runId === runId && t.seq === seq);
  }

  private requireTurn(conv: StoredConversation, seq: number): BackendTurn {
    const turn = [...conv.turns].reverse().find(t => t.seq === seq);
    if (!turn) throw new BackendError('not-found', `Turn ${seq} not found`, 404);
    return turn;
  }

  private assertId(id: string): void {
    if (!isValidConversationId(id)) throw new BackendError('invalid-request', `Invalid conversation id '${id}'`, 400);
  }

  private load(id: string): StoredConversation;
  private load(id: string, required: false): StoredConversation | undefined;
  private load(id: string, required = true): StoredConversation | undefined {
    this.assertId(id);
    const file = `${ROOT}/${id}.json`;
    const raw = this.state.read(file);
    if (!raw) {
      if (required) throw new BackendError('not-found', `Conversation '${id}' not found`, 404);
      return undefined;
    }
    let conv: StoredConversation;
    try {
      conv = JSON.parse(raw) as StoredConversation;
    } catch (err) {
      // a corrupt snapshot is an operator problem, never a silent "new conversation"
      throw new BackendError('unavailable', `Conversation file '${file}' is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, 503, { path: file });
    }
    if (!conv || typeof conv !== 'object' || !conv.info || !Array.isArray(conv.turns)) {
      throw new BackendError('unavailable', `Conversation file '${file}' has an unexpected shape`, 503, { path: file });
    }
    normalizeDeliveries(conv);
    this.loading.set(id, conv);
    try {
      this.rehydrate(conv);
    } finally {
      this.loading.delete(id);
    }
    return conv;
  }

  private save(conv: StoredConversation): void {
    this.state.write(`${ROOT}/${conv.info.conversationId}.json`, JSON.stringify(conv, null, 2));
  }
}

/** Compare the idempotency-relevant payload of an accepted message with a retried one. */
function sameMessagePayload(a: BackendMessage, b: BackendMessage): boolean {
  return a.role === b.role
    && a.content === b.content
    && (b.harness === undefined || a.harness === b.harness)
    && JSON.stringify(a.parts ?? null) === JSON.stringify(b.parts ?? null)
    && JSON.stringify(a.extensions ?? null) === JSON.stringify(b.extensions ?? null);
}

/**
 * Outbox entries persisted by earlier versions carry `id` (or nothing) instead of `operationId`. Normalize them
 * deterministically so each entry is individually addressable: acknowledging one must never drop another.
 */
function normalizeDeliveries(conv: StoredConversation): void {
  if (!conv.deliveries?.length) return;
  const seen = new Set<string>();
  conv.deliveries.forEach((d, i) => {
    const legacy = d as PendingDelivery & { id?: string };
    let op = legacy.operationId || legacy.id || `legacy:${d.kind}:${d.runId}:${d.seq}:${i}`;
    if (seen.has(op)) op = `${op}:${i}`;
    seen.add(op);
    legacy.operationId = op;
    delete legacy.id;
  });
}

function encodeCursor(conversationId: string, sequence: number): BackendCursor {
  return Buffer.from(`c1:${conversationId}:${sequence}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: BackendCursor, conversationId: string): number {
  const m = /^c1:(.+):(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!m || m[1] !== conversationId) throw new BackendError('invalid-request', 'Invalid cursor', 400);
  return Number(m[2]);
}
