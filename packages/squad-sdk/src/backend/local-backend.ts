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
  NegotiatedCapabilities,
  ProtocolHello,
  ReadEventsOptions,
  SquadBackend,
} from './types.js';

interface StoredConversation {
  info: BackendConversation;
  transcript: BackendMessage[];
  turns: BackendTurn[];
  events?: BackendEnvelope[];
  approvals?: ApprovalRecord[];
}

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const ROOT = 'backend/conversations';

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

/** File-system store rooted at a `.squad` directory. */
export function createFileStateStore(squadDir: string): BackendStateStore {
  const resolve = (rel: string): string => {
    const full = path.resolve(squadDir, rel);
    if (!full.startsWith(path.resolve(squadDir) + path.sep)) {
      throw new BackendError('invalid-request', 'Path escapes state directory', 400);
    }
    return full;
  };
  return {
    read: rel => {
      try { return fs.readFileSync(resolve(rel), 'utf8'); } catch { return undefined; }
    },
    write: (rel, content) => {
      const full = resolve(rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const tmp = `${full}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, full);
    },
    exists: rel => fs.existsSync(resolve(rel)),
    list: rel => {
      try { return fs.readdirSync(resolve(rel)); } catch { return []; }
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
  }

  async sendMessage(conversationId: string, message: BackendMessage): Promise<BackendAdmission> {
    if (message?.parts?.length && !message.content) message = { ...message, content: partsToText(message.parts) };
    if (!message?.runId || !Number.isInteger(message.seq) || message.seq < 0) {
      throw new BackendError('invalid-request', 'message requires runId and a non-negative integer seq', 400);
    }
    const conv = this.load(conversationId);
    this.checkEpoch(conv, message.epoch);
    const dup = conv.turns.find(t => t.runId === message.runId && t.seq === message.seq);
    if (dup) {
      return {
        protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: dup.runId, seq: dup.seq, duplicate: true,
        state: dup.state, epoch: conv.info.epoch, correlationId: message.correlationId, cursor: this.tailCursor(conv),
      };
    }

    const adapter = message.harness ? this.harnesses.get(message.harness) : undefined;
    if (message.harness && !adapter) {
      throw new BackendError('invalid-request', `Unknown harness '${message.harness}'`, 400);
    }
    validateExtensions(message.extensions, adapter?.capabilities.extensionNamespaces);

    const stored: BackendMessage = { ...message, epoch: conv.info.epoch };
    const turn: BackendTurn = {
      conversationId,
      runId: message.runId,
      seq: message.seq,
      state: adapter ? 'running' : 'queued',
      tasks: [],
      messages: [stored],
      extensions: message.extensions,
    };
    conv.transcript.push(stored);
    conv.turns.push(turn);
    const accepted = this.emit(conv, 'control', 'message.accepted',
      { runId: message.runId, seq: message.seq, state: turn.state }, message.correlationId, message.causationId);
    this.save(conv);

    if (adapter) {
      this.ensureSubscribed(conversationId, adapter.id);
      try {
        await adapter.submit({
          conversationId, runId: message.runId, seq: message.seq,
          messages: [stored], extensions: message.extensions,
        });
      } catch (err) {
        const fresh = this.load(conversationId);
        const t = this.findTurn(fresh, message.runId, message.seq);
        if (t && !TERMINAL_RUN_STATES.includes(t.state)) {
          t.state = 'failed';
          t.error = err instanceof Error ? err.message : String(err);
          this.emit(fresh, 'control', 'turn.state', { runId: t.runId, seq: t.seq, state: 'failed', error: t.error }, message.correlationId, accepted.id);
          this.save(fresh);
        }
      }
    }
    const latest = this.load(conversationId);
    const final = this.findTurn(latest, message.runId, message.seq)!;
    return {
      protocol: BACKEND_PROTOCOL_VERSION, conversationId, runId: final.runId, seq: final.seq, duplicate: false,
      state: final.state, epoch: conv.info.epoch, correlationId: message.correlationId, cursor: accepted.cursor,
    };
  }

  async getTranscript(conversationId: string): Promise<BackendMessage[]> {
    return this.load(conversationId).transcript;
  }

  async getTurn(conversationId: string, seq: number): Promise<BackendTurn> {
    return this.requireTurn(this.load(conversationId), seq);
  }

  async cancelTurn(conversationId: string, seq: number): Promise<BackendTurn> {
    const conv = this.load(conversationId);
    const turn = this.requireTurn(conv, seq);
    await this.cancelInternal(conv, turn);
    return turn;
  }

  async cancelRun(conversationId: string, runId: string, reason?: string): Promise<BackendTurn> {
    const conv = this.load(conversationId);
    const turns = conv.turns.filter(t => t.runId === runId);
    if (turns.length === 0) throw new BackendError('not-found', `Run '${runId}' not found`, 404);
    for (const turn of turns) await this.cancelInternal(conv, turn, reason);
    return turns[turns.length - 1]!;
  }

  async getApprovals(conversationId: string): Promise<ApprovalRecord[]> {
    return this.load(conversationId).approvals ?? [];
  }
  async respondApproval(conversationId: string, response: ApprovalResponse): Promise<BackendTurn> {
    const conv = this.load(conversationId);
    this.checkEpoch(conv, response.epoch);
    const turn = conv.turns.find(t => t.pendingApproval?.approvalId === response.approvalId);
    if (!turn || !turn.pendingApproval) {
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
    this.save(conv);
    const adapter = this.adapterFor(turn);
    if (adapter) await adapter.respondApproval(conversationId, response);
    return this.requireTurn(this.load(conversationId), turn.seq);
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

  private async cancelInternal(conv: StoredConversation, turn: BackendTurn, reason?: string): Promise<void> {
    if (TERMINAL_RUN_STATES.includes(turn.state)) return;
    const record = (conv.approvals ?? []).find(a => a.approvalId === turn.pendingApproval?.approvalId);
    if (record) { record.state = 'cancelled'; }
    turn.state = 'cancelled';
    turn.pendingApproval = undefined;
    const requested = this.emit(conv, 'control', 'cancellation.requested', { runId: turn.runId, seq: turn.seq, reason });
    this.emit(conv, 'control', 'turn.state', { runId: turn.runId, seq: turn.seq, state: 'cancelled' }, undefined, requested.id);
    this.save(conv);
    const adapter = this.adapterFor(turn);
    if (adapter) await adapter.cancel(conv.info.conversationId, turn.runId, turn.seq);
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
    const ev = incoming;
    let emitted: object = ev;
    const conv = this.load(conversationId, false);
    if (!conv) return;
    const turn = this.findTurn(conv, ev.runId, ev.seq);
    if (!turn || TERMINAL_RUN_STATES.includes(turn.state)) return;
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
        turn.state = ev.state;
        if (ev.error) turn.error = ev.error;
        break;
    }
    this.emit(conv, ev.type === 'state' || ev.type === 'approval-requested' ? 'control' : 'execution',
      ev.type === 'state' ? 'turn.state' : ev.type === 'approval-requested' ? 'approval.requested' : `harness.${ev.type}`,
      { ...emitted });
    this.save(conv);
  }

  private checkEpoch(conv: StoredConversation, epoch: number | undefined): void {
    if (epoch === undefined) return;
    if (epoch < conv.info.epoch) {
      throw new BackendError('stale-epoch', `Epoch ${epoch} is stale; current epoch is ${conv.info.epoch}`, 409);
    }
    if (epoch > conv.info.epoch) {
      conv.info.epoch = epoch; // newer lease holder takes over (fencing)
      this.save(conv);
    }
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
