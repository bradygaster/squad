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
  | { id: string; kind: 'cancel'; runId: string; seq: number }
  | { id: string; kind: 'approval'; runId: string; seq: number; response: ApprovalResponse };

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
}

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const ROOT = 'backend/conversations';
const LOCKS = 'backend/locks';

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

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

/** File-system store rooted at a `.squad` directory. Never follows symlinks/junctions below the root. */
export function createFileStateStore(squadDir: string): BackendStateStore {
  const root = path.resolve(squadDir);
  const resolve = (rel: string): string => {
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) {
      throw new BackendError('invalid-request', 'Path escapes state directory', 400);
    }
    // a lexical prefix check is not containment: reject any existing symlink/junction between root and target
    let cur = root;
    for (const part of path.relative(root, full).split(path.sep)) {
      cur = path.join(cur, part);
      let st: fs.Stats;
      try { st = fs.lstatSync(cur); } catch { break; } // the rest does not exist yet
      if (st.isSymbolicLink()) {
        throw new BackendError('invalid-request', 'State path contains a symbolic link or junction', 400);
      }
    }
    return full;
  };
  return {
    lock: key => {
      const lockPath = resolve(`${key}.lock`);
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      const deadline = Date.now() + LOCK_TIMEOUT_MS;
      for (;;) {
        try {
          const fd = fs.openSync(lockPath, 'wx');
          fs.writeSync(fd, String(process.pid));
          fs.closeSync(fd);
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
          try {
            if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) { fs.rmSync(lockPath, { force: true }); continue; }
          } catch { continue; }
          if (Date.now() > deadline) throw new BackendError('unavailable', 'Timed out waiting for the conversation lock', 503);
          sleepSync(10);
        }
      }
      return () => { try { fs.rmSync(lockPath, { force: true }); } catch { /* already gone */ } };
    },
    read: rel => {
      try { return fs.readFileSync(resolve(rel), 'utf8'); } catch (e) {
        if (e instanceof BackendError) throw e;
        return undefined;
      }
    },
    write: (rel, content) => {
      const full = resolve(rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      resolve(rel); // re-check after directories were created
      const tmp = `${full}.${process.pid}.${randomUUID()}.tmp`;
      fs.writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(tmp, full);
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

  constructor(options: LocalSquadBackendOptions = {}) {
    this.kind = options.kind ?? 'local';
    this.state = options.state ?? new MemoryStateStore();
    this.harnesses = options.harnesses ?? new DefaultHarnessRegistry();
  }

  async createConversation(options: CreateConversationOptions = {}): Promise<BackendConversation> {
    validateExtensions(options.metadata);
    const id = options.conversationId ?? randomUUID();
    this.assertId(id);
    const release = this.state.lock?.(`${LOCKS}/${id}`);
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
    const admitted = this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, msg.epoch);
      const dup = conv.turns.find(t => t.runId === msg.runId && t.seq === msg.seq);
      if (dup) {
        return {
          duplicate: true as const,
          admission: {
            protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: dup.runId, seq: dup.seq, duplicate: true,
            state: dup.state, epoch: conv.info.epoch, correlationId: msg.correlationId, cursor: this.tailCursor(conv),
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
      const accepted = this.emit(conv, 'control', 'message.accepted',
        { runId: msg.runId, seq: msg.seq, state: turn.state }, msg.correlationId, msg.causationId);
      return { duplicate: false as const, adapter, stored, epoch, accepted };
    });
    if (admitted.duplicate) return admitted.admission;

    const { adapter, stored, epoch, accepted } = admitted;
    if (adapter) {
      this.ensureSubscribed(conversationId, adapter.id);
      try {
        await adapter.submit({
          conversationId, runId: msg.runId, seq: msg.seq,
          messages: [stored], extensions: msg.extensions, epoch,
        });
      } catch (err) {
        this.tx(conversationId, (fresh) => {
          const t = this.findTurn(fresh, msg.runId, msg.seq);
          if (t && !TERMINAL_RUN_STATES.includes(t.state)) {
            t.state = 'failed';
            t.error = err instanceof Error ? err.message : String(err);
            this.emit(fresh, 'control', 'turn.state', { runId: t.runId, seq: t.seq, state: 'failed', error: t.error }, msg.correlationId, accepted.id);
          }
        });
      }
    }
    const latest = this.load(conversationId);
    const final = this.findTurn(latest, msg.runId, msg.seq)!;
    return {
      protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: final.runId, seq: final.seq, duplicate: false,
      state: final.state, epoch: latest.info.epoch, correlationId: msg.correlationId, cursor: accepted.cursor,
    };
  }

  async getTranscript(conversationId: string): Promise<BackendMessage[]> {
    return this.load(conversationId).transcript;
  }

  async getTurn(conversationId: string, seq: number): Promise<BackendTurn> {
    return this.requireTurn(this.load(conversationId), seq);
  }

  async cancelTurn(conversationId: string, seq: number, epoch?: LeaseEpoch): Promise<BackendTurn> {
    const target = this.tx(conversationId, (conv) => {
      this.checkEpoch(conv, epoch);
      const turn = this.requireTurn(conv, seq);
      this.markCancelled(conv, turn);
      return { runId: turn.runId, seq: turn.seq };
    });
    await this.flushDeliveries(conversationId);
    return this.findTurn(this.load(conversationId), target.runId, target.seq)!;
  }

  async cancelRun(conversationId: string, runId: string, reason?: string, epoch?: LeaseEpoch): Promise<BackendTurn> {
    const last = this.tx(conversationId, (conv) => {
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
    const target = this.tx(conversationId, (conv) => {
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
        record.version = 2;
        record.state = response.decision === 'approve' ? 'approved' : 'denied';
        record.decision = response.decision;
        record.reason = response.reason;
        record.decidedAt = new Date().toISOString();
      }
      this.emit(conv, 'control', 'approval.resolved',
        { runId: turn.runId, seq: turn.seq, approvalId: response.approvalId, decision: response.decision, version: 2, state: turn.state });
      if (this.adapterFor(turn)) {
        (conv.deliveries ??= []).push({ id: randomUUID(), kind: 'approval', runId: turn.runId, seq: turn.seq, response });
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
   * (when the store provides one). Harness calls must never run inside `fn`.
   */
  private tx<T>(conversationId: string, fn: (conv: StoredConversation) => T): T {
    this.assertId(conversationId);
    const release = this.state.lock?.(`${LOCKS}/${conversationId}`);
    try {
      const conv = this.load(conversationId);
      const result = fn(conv);
      this.save(conv);
      return result;
    } finally {
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
      record.version = 2;
      record.decidedAt = new Date().toISOString();
      this.emit(conv, 'control', 'approval.resolved',
        { runId: turn.runId, seq: turn.seq, approvalId, version: 2, state: 'cancelled' });
    }
    turn.pendingApproval = undefined;
  }

  /** Persist the cancellation (and an outstanding harness delivery); the harness call happens later. */
  private markCancelled(conv: StoredConversation, turn: BackendTurn, reason?: string): void {
    if (TERMINAL_RUN_STATES.includes(turn.state)) return;
    this.cancelPendingApproval(conv, turn);
    turn.state = 'cancelled';
    const requested = this.emit(conv, 'control', 'cancellation.requested', { runId: turn.runId, seq: turn.seq, reason });
    this.emit(conv, 'control', 'turn.state', { runId: turn.runId, seq: turn.seq, state: 'cancelled' }, undefined, requested.id);
    if (this.adapterFor(turn)) {
      (conv.deliveries ??= []).push({ id: randomUUID(), kind: 'cancel', runId: turn.runId, seq: turn.seq });
    }
  }

  /**
   * Deliver persisted decisions to their harnesses. A delivery is removed only after the harness acknowledged
   * it, so a failure leaves it queued and a verbatim retry re-delivers; adapters must treat `cancel` and
   * `respondApproval` as idempotent. Failure surfaces as a retryable `unavailable` error.
   */
  private async flushDeliveries(conversationId: string): Promise<void> {
    for (;;) {
      const conv = this.load(conversationId);
      const next = conv.deliveries?.[0];
      if (!next) return;
      const turn = this.findTurn(conv, next.runId, next.seq);
      const adapter = turn ? this.adapterFor(turn) : undefined;
      try {
        if (adapter) {
          if (next.kind === 'cancel') await adapter.cancel(conversationId, next.runId, next.seq);
          else await adapter.respondApproval(conversationId, next.response);
        }
      } catch (err) {
        throw new BackendError('unavailable',
          `Harness ${next.kind} delivery failed and will be retried: ${err instanceof Error ? err.message : String(err)}`, 503);
      }
      this.tx(conversationId, (fresh) => {
        fresh.deliveries = (fresh.deliveries ?? []).filter(d => d.id !== next.id);
      });
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
    this.subscriptions.set(key, adapter.subscribe(conversationId, ev => this.applyEvent(conversationId, ev)));
  }

  private applyEvent(conversationId: string, incoming: HarnessEventEnvelope): void {
    try {
      this.tx(conversationId, conv => this.applyEventLocked(conv, incoming));
    } catch (err) {
      if (err instanceof BackendError && err.code === 'not-found') return;
      throw err;
    }
  }

  private applyEventLocked(conv: StoredConversation, ev: HarnessEventEnvelope): void {
    let emitted: object = ev;
    const turn = this.findTurn(conv, ev.runId, ev.seq);
    if (!turn || TERMINAL_RUN_STATES.includes(turn.state)) return;
    // fencing: output issued under an older lease than the conversation's current one is stale
    const eventEpoch = ev.epoch ?? turn.epoch ?? 1;
    if (eventEpoch < conv.info.epoch) return;
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
        if (TERMINAL_RUN_STATES.includes(ev.state)) this.cancelPendingApproval(conv, turn);
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
    if (!ID_RE.test(id)) throw new BackendError('invalid-request', `Invalid conversation id '${id}'`, 400);
  }

  private load(id: string): StoredConversation;
  private load(id: string, required: false): StoredConversation | undefined;
  private load(id: string, required = true): StoredConversation | undefined {
    this.assertId(id);
    const raw = this.state.read(`${ROOT}/${id}.json`);
    if (!raw) {
      if (required) throw new BackendError('not-found', `Conversation '${id}' not found`, 404);
      return undefined;
    }
    const conv = JSON.parse(raw) as StoredConversation;
    this.rehydrate(conv);
    return conv;
  }

  private save(conv: StoredConversation): void {
    this.state.write(`${ROOT}/${conv.info.conversationId}.json`, JSON.stringify(conv, null, 2));
  }
}

function encodeCursor(conversationId: string, sequence: number): BackendCursor {
  return Buffer.from(`c1:${conversationId}:${sequence}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: BackendCursor, conversationId: string): number {
  const m = /^c1:(.+):(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!m || m[1] !== conversationId) throw new BackendError('invalid-request', 'Invalid cursor', 400);
  return Number(m[2]);
}
