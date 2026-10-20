import { describe, it, expect, vi } from 'vitest';
import {
  BACKEND_CONTRACT_STAGE,
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  DefaultHarnessRegistry,
  DurableHttpSquadBackend,
  LocalSquadBackend,
  MemoryStateStore,
  createFileStateStore,
  createSquadBackend,
  createStateBackendStore,
  extensionNamespace,
  validateExtensions,
  partsToText,
  type HarnessApprovalRequest,
  type HarnessAdapter,
  type HarnessEventEnvelope,
} from '../packages/squad-sdk/src/backend/index.js';

class FakeHarness implements HarnessAdapter {
  readonly id = 'copilot';
  readonly capabilities = { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: ['x-copilot'] };
  submitted: Array<{ runId: string; seq: number }> = [];
  cancelled: number[] = [];
  approvals: string[] = [];
  private listeners = new Set<(e: HarnessEventEnvelope) => void>();
  async submit(s: { runId: string; seq: number }) { this.submitted.push({ runId: s.runId, seq: s.seq }); }
  subscribe(_c: string, l: (e: HarnessEventEnvelope) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async cancel(_c: string, _r: string, seq: number) { this.cancelled.push(seq); }
  ops: Array<string | undefined> = [];
  async respondApproval(_c: string, r: { approvalId: string }, op?: string) { this.approvals.push(r.approvalId); this.ops.push(op); }
  describe() { return { id: this.id, capabilities: this.capabilities }; }
  emit(e: HarnessEventEnvelope) { this.listeners.forEach(l => l(e)); }
}

const msg = (runId: string, seq: number, extra: object = {}) => ({ runId, seq, role: 'user' as const, content: `m${seq}`, ...extra });

async function rejectCode(p: Promise<unknown>): Promise<string | undefined> {
  try { await p; } catch (e) { return e instanceof BackendError ? e.code : 'other'; }
  return undefined;
}

describe('LocalSquadBackend', () => {
  it('runs the conversation lifecycle', async () => {
    const b = new LocalSquadBackend();
    const conv = await b.createConversation({ conversationId: 'c1', title: 'T' });
    expect(conv.epoch).toBe(1);
    expect((await b.createConversation({ conversationId: 'c1' })).createdAt).toBe(conv.createdAt);
    const adm = await b.sendMessage('c1', msg('r1', 1));
    expect(adm).toMatchObject({ duplicate: false, state: 'queued', runId: 'r1', seq: 1 });
    expect(await b.getTranscript('c1')).toHaveLength(1);
    expect((await b.getTurn('c1', 1)).messages[0]?.content).toBe('m1');
    expect((await b.cancelTurn('c1', 1)).state).toBe('cancelled');
    expect((await b.health()).ok).toBe(true);
    expect(await rejectCode(b.getTurn('c1', 9))).toBe('not-found');
    expect(await rejectCode(b.getTranscript('nope'))).toBe('not-found');
  });

  it('dedups on (runId, seq)', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r1', 1));
    const dup = await b.sendMessage('c', msg('r1', 1));
    expect(dup.duplicate).toBe(true);
    expect(await rejectCode(b.sendMessage('c', msg('r1', 1, { content: 'changed' })))).toBe('conflict');
    await b.sendMessage('c', msg('r2', 1));
    const t = await b.getTranscript('c');
    expect(t).toHaveLength(2);
    expect(t[0]?.content).toBe('m1');
  });

  it('fences with lease epochs', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    expect((await b.sendMessage('c', msg('r', 1, { epoch: 3 }))).epoch).toBe(3);
    expect(await rejectCode(b.sendMessage('c', msg('r', 2, { epoch: 2 })))).toBe('stale-epoch');
  });

  it('persists through the state store', async () => {
    const state = new MemoryStateStore();
    await new LocalSquadBackend({ state }).createConversation({ conversationId: 'p' });
    expect(await new LocalSquadBackend({ state }).getTranscript('p')).toEqual([]);
  });

  it('verifies hash-bound approvals', async () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    const adm = await b.sendMessage('c', msg('r', 1, { harness: 'copilot', extensions: { 'x-copilot.model': 'x' } }));
    expect(adm.state).toBe('running');
    const req: HarnessApprovalRequest = { approvalId: 'a1', turnSeq: 1, action: 'rm', hash: 'h1' };
    h.emit({ type: 'approval-requested', request: req, runId: 'r', seq: 1 });
    expect((await b.getTurn('c', 1)).state).toBe('awaiting-approval');

    expect(await rejectCode(b.respondApproval('c', { approvalId: 'a1', hash: 'bad', decision: 'approve' }))).toBe('approval-hash-mismatch');
    expect(await rejectCode(b.respondApproval('c', { approvalId: 'zz', hash: 'h1', decision: 'approve' }))).toBe('approval-not-pending');
    const turn = await b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' });
    expect(turn.state).toBe('running');
    expect(h.approvals).toEqual(['a1']);
    expect(await rejectCode(b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' }))).toBe('approval-not-pending');

    h.emit({ type: 'message', runId: 'r', seq: 1, message: { runId: 'r', seq: 2, role: 'assistant', content: 'done' } });
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1 });
    expect((await b.getTurn('c', 1)).state).toBe('completed');
    expect(await b.getTranscript('c')).toHaveLength(2);
    await b.cancelTurn('c', 1);
    expect(h.cancelled).toEqual([]);
  });

  it('rejects unknown harnesses and bad extensions', async () => {
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(new FakeHarness());
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    expect(await rejectCode(b.sendMessage('c', msg('r', 1, { harness: 'nope' })))).toBe('invalid-request');
    expect(await rejectCode(b.sendMessage('c', msg('r', 2, { harness: 'copilot', extensions: { 'x-claude.k': 1 } })))).toBe('invalid-request');
    expect(await rejectCode(b.sendMessage('c', msg('r', 3, { extensions: { model: 1 } })))).toBe('invalid-request');
  });
});

describe('canonical envelope protocol', () => {
  it('negotiates protocol and capabilities', async () => {
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(new FakeHarness());
    const b = new LocalSquadBackend({ harnesses });
    const caps = await b.negotiate({ protocols: ['9.9', BACKEND_PROTOCOL_VERSION], contentParts: ['text', 'resource'] });
    expect(caps).toMatchObject({ protocol: BACKEND_PROTOCOL_VERSION, contentParts: ['text', 'resource'], atLeastOnce: true, harnesses: ['copilot'], resume: true, approvals: true });
    expect(caps.extensionNamespaces).toEqual(['x-copilot']);
    expect(await rejectCode(b.negotiate({ protocols: ['1.0'] }))).toBe('unsupported-protocol');
  });

  it('emits ordered envelopes with correlation/causation and resumable opaque cursors', async () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    const adm = await b.sendMessage('c', msg('r', 1, { harness: 'copilot', correlationId: 'corr-1' }));
    expect(adm.protocol).toBe(BACKEND_PROTOCOL_VERSION);
    expect(adm.correlationId).toBe('corr-1');
    h.emit({ type: 'message', runId: 'r', seq: 1, message: { runId: 'r', seq: 2, role: 'assistant', content: 'hi' } });
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1 });

    const page = await b.readEvents('c');
    expect(page.events.map(e => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(page.events.map(e => e.type)).toEqual(['conversation.created', 'message.accepted', 'harness.message', 'turn.state']);
    expect(page.events.map(e => e.stream)).toEqual(['control', 'control', 'execution', 'control']);
    expect(page.events.every(e => e.protocol === BACKEND_PROTOCOL_VERSION && e.kind === 'event')).toBe(true);
    expect(page.events[1]!.correlationId).toBe('corr-1');
    expect(adm.cursor).toBe(page.events[1]!.cursor);

    // resume after the admission cursor; at-least-once re-reads are stable
    const rest = await b.readEvents('c', { after: adm.cursor });
    expect(rest.events.map(e => e.sequence)).toEqual([3, 4]);
    expect((await b.readEvents('c', { after: adm.cursor })).events.map(e => e.id)).toEqual(rest.events.map(e => e.id));
    expect((await b.readEvents('c', { after: rest.nextCursor })).events).toEqual([]);
    expect((await b.readEvents('c', { stream: 'execution' })).events).toHaveLength(1);
    expect((await b.readEvents('c', { limit: 2 })).events).toHaveLength(2);
    expect(await rejectCode(b.readEvents('c', { after: 'garbage' }))).toBe('invalid-request');
  });

  it('keeps typed content parts and derives text', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', { runId: 'r', seq: 1, role: 'user', content: '', parts: [
      { type: 'text', text: 'look' }, { type: 'resource', uri: 'file:///a.ts', title: 'a.ts' },
    ] });
    const [m] = await b.getTranscript('c');
    expect(m!.parts).toHaveLength(2);
    expect(m!.content).toBe('look\na.ts');
    expect(partsToText([{ type: 'tool-result', callId: 'x' }])).toBe('[tool-result x]');
  });

  it('exposes canonical error structure', async () => {
    const b = new LocalSquadBackend();
    try { await b.getTranscript('missing'); } catch (e) {
      expect((e as BackendError).toInfo()).toMatchObject({ code: 'not-found', retryable: false, status: 404 });
    }
    expect(new BackendError('unavailable', 'x').toInfo().retryable).toBe(true);
  });
});

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DurableHttpSquadBackend', () => {
  const mk = (fetchImpl: typeof fetch, extra: object = {}) =>
    new DurableHttpSquadBackend({ baseUrl: 'https://x/', token: 'tok', fetch: fetchImpl, retryDelayMs: 1, ...extra });

  it('speaks the /v1/conversations wire protocol', async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      if (url.endsWith('/v1/conversations')) return jsonRes(200, { conversationId: 'c', epoch: 4, createdAt: 'now' });
      if (url.endsWith('/messages')) return jsonRes(200, { conversationId: 'c', runId: 'r', seq: 1, duplicate: false, state: 'queued', epoch: 4 });
      if (url.endsWith('/transcript')) return jsonRes(200, { messages: [{ runId: 'r', seq: 1, role: 'user', content: 'hi' }] });
      if (url.endsWith('/cancel')) return jsonRes(200, { state: 'cancelled' });
      if (url.endsWith('/health/live') || url.endsWith('/health/ready')) return jsonRes(200, { status: 'ok', version: '1' });
      return jsonRes(200, { state: 'running', seq: 1 });
    });
    const b = mk(f as unknown as typeof fetch);
    await b.createConversation();
    await b.sendMessage('c', msg('r', 1));
    expect(await b.getTranscript('c')).toHaveLength(1);
    await b.getTurn('c', 1);
    await b.cancelTurn('c', 1);
    await b.respondApproval('c', { approvalId: 'a', hash: 'h', decision: 'approve' });
    expect((await b.health()).version).toBe('1');

    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      'POST https://x/v1/conversations',
      'POST https://x/v1/conversations/c/messages',
      'GET https://x/v1/conversations/c/transcript',
      'GET https://x/v1/conversations/c/turns/1',
      'POST https://x/v1/conversations/c/turns/1/cancel',
      'POST https://x/v1/conversations/c/approvals/a',
      'GET https://x/health/live',
      'GET https://x/health/ready',
    ]);
    const send = calls[1]!;
    expect(send.headers['Idempotency-Key']).toBe('r:1');
    expect(send.headers['X-Lease-Epoch']).toBe('4'); // learned from createConversation
    expect(send.headers['Authorization']).toBe('Bearer tok');
  });

  it('retries transient failures with the same idempotency key', async () => {
    const keys: string[] = [];
    let n = 0;
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']!);
      n++;
      if (n === 1) throw new Error('ECONNRESET');
      if (n === 2) return jsonRes(503, { error: 'busy' });
      return jsonRes(200, { conversationId: 'c', runId: 'r', seq: 1, duplicate: false, state: 'queued', epoch: 1 });
    });
    const adm = await mk(f as unknown as typeof fetch).sendMessage('c', msg('r', 1));
    expect(adm.state).toBe('queued');
    expect(f).toHaveBeenCalledTimes(3);
    expect(new Set(keys)).toEqual(new Set(['r:1']));
  });

  it('does not retry 4xx and maps stale epoch', async () => {
    const f = vi.fn(async () => jsonRes(409, { code: 'stale-epoch', message: 'epoch 1 < 2' }));
    const b = mk(f as unknown as typeof fetch);
    expect(await rejectCode(b.sendMessage('c', msg('r', 1, { epoch: 1 })))).toBe('stale-epoch');
    expect(f).toHaveBeenCalledTimes(1);
    const f404 = vi.fn(async () => jsonRes(404, {}));
    expect(await rejectCode(mk(f404 as unknown as typeof fetch).getTurn('c', 1))).toBe('not-found');
  });

  it('probes /health/live and /health/ready, falls back to /health, reports not-ready', async () => {
    const urls: string[] = [];
    const ready503 = vi.fn(async (url: string) => {
      urls.push(url);
      return url.endsWith('/health/ready') ? jsonRes(503, { detail: 'warming up' }) : jsonRes(200, { version: '2' });
    });
    expect(await mk(ready503 as unknown as typeof fetch).health()).toMatchObject({ ok: false, live: true, ready: false, detail: 'warming up' });
    expect(urls.sort()).toEqual(['https://x/health/live', 'https://x/health/ready']); // 503 not retried

    const legacy = vi.fn(async (url: string) => (url.endsWith('/health') ? jsonRes(200, {}) : jsonRes(404, {})));
    expect(await mk(legacy as unknown as typeof fetch).health()).toMatchObject({ ok: true, live: true, ready: true });
    expect(legacy).toHaveBeenLastCalledWith('https://x/health', expect.anything());
  });

  it('cancels by runId and lists approvals over HTTP', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      return url.endsWith('/approvals') ? jsonRes(200, { approvals: [{ approvalId: 'a', version: 2 }] }) : jsonRes(200, { runId: 'r/1', state: 'cancelled' });
    });
    const b = mk(f as unknown as typeof fetch, { epoch: 5 });
    await b.cancelRun('c', 'r/1', 'why');
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://x/v1/conversations/c/runs/r%2F1/cancel' });
    expect(seen[0]!.headers['X-Lease-Epoch']).toBe('5');
    expect(JSON.parse(seen[0]!.body!)).toEqual({ reason: 'why' });
    expect(await b.getApprovals('c')).toEqual([{ approvalId: 'a', version: 2 }]);
    expect(seen[1]).toMatchObject({ method: 'GET', url: 'https://x/v1/conversations/c/approvals' });
  });

  it('maps canonical error bodies, sends protocol/correlation headers, and reads events', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string> });
      if (url.includes('/events')) return jsonRes(200, { events: [], nextCursor: 'cur' });
      if (url.endsWith('/v1/capabilities')) return jsonRes(200, { protocol: '2.0', contentParts: ['text'] });
      return jsonRes(409, { error: { code: 'approval-hash-mismatch', message: 'bad hash', retryable: false, details: { approvalId: 'a' }, correlationId: 'corr-9' } });
    });
    const b = mk(f as unknown as typeof fetch);
    expect((await b.readEvents('c', { after: 'x y', limit: 5, stream: 'control' })).nextCursor).toBe('cur');
    expect(seen[0]!.url).toBe('https://x/v1/conversations/c/events?after=x+y&limit=5&stream=control');
    expect(seen[0]!.headers['X-Squad-Protocol']).toBe(BACKEND_PROTOCOL_VERSION);
    expect((await b.negotiate({ protocols: ['2.0'] })).protocol).toBe('2.0');
    expect(seen[1]!.url).toBe('https://x/v1/capabilities');
    try {
      await b.respondApproval('c', { approvalId: 'a', hash: 'h', decision: 'approve' });
      expect.unreachable();
    } catch (e) {
      expect((e as BackendError).toInfo()).toMatchObject({
        code: 'approval-hash-mismatch', retryable: false, correlationId: 'corr-9', details: { approvalId: 'a' },
      });
    }
    await b.sendMessage('c', msg('r', 1, { correlationId: 'corr-1' })).catch(() => undefined);
    expect(seen[seen.length - 1]!.headers['X-Correlation-Id']).toBe('corr-1');
  });

  it('gives up after maxRetries and health reports failure', async () => {
    const f = vi.fn(async () => jsonRes(500, {}));
    const b = mk(f as unknown as typeof fetch, { maxRetries: 2 });
    expect(await rejectCode(b.getTranscript('c'))).toBe('unavailable');
    expect(f).toHaveBeenCalledTimes(3);
    expect((await b.health()).ok).toBe(false);
  });
});

describe('squad 2.0 wire lock-in', () => {
  it('cancels by stable runId (distinct from seq), idempotently', async () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    const adm = await b.sendMessage('c', msg('run-A', 7, { harness: 'copilot' }));
    expect(adm).toMatchObject({ runId: 'run-A', seq: 7 });
    expect(await b.getTurn('c', 7)).toMatchObject({ runId: 'run-A', seq: 7 });
    const turn = await b.cancelRun('c', 'run-A', 'user asked');
    expect(turn).toMatchObject({ runId: 'run-A', seq: 7, state: 'cancelled' });
    await b.cancelRun('c', 'run-A');
    expect(h.cancelled).toEqual([7]);
    const types = (await b.readEvents('c')).events.map(e => e.type);
    expect(types.filter(t => t === 'cancellation.requested')).toHaveLength(1);
    expect((await b.readEvents('c')).events.find(e => e.type === 'cancellation.requested')!.payload).toMatchObject({ runId: 'run-A', reason: 'user asked' });
    expect(await rejectCode(b.cancelRun('c', 'nope'))).toBe('not-found');
  });

  it('computes effective capabilities as client ∩ backend ∩ policy', async () => {
    const b = new LocalSquadBackend();
    const caps = await b.negotiate({
      protocols: [BACKEND_PROTOCOL_VERSION],
      capabilities: ['approvals', 'cursor-reconnect', 'typed-content-parts', 'telepathy'],
      policyCapabilities: ['approvals', 'typed-content-parts', 'cancel-run'],
    });
    expect(caps.effectiveCapabilities).toEqual(['approvals', 'typed-content-parts']);
    expect(caps.clientCapabilities).toContain('telepathy');
    expect(caps.backendCapabilities).not.toContain('telepathy');
    expect(caps.policyCapabilities).toEqual(['approvals', 'typed-content-parts', 'cancel-run']);
    expect(caps).toMatchObject({ approvals: true, resume: false, streams: ['control', 'execution'] });
    const noTyped = await new LocalSquadBackend().negotiate({ protocols: [BACKEND_PROTOCOL_VERSION], capabilities: ['approvals'] });
    expect(noTyped.contentParts).toEqual(['text']);
    const open = await b.negotiate({ protocols: [BACKEND_PROTOCOL_VERSION] });
    expect(open.effectiveCapabilities).toEqual(open.backendCapabilities);
  });

  it('exposes approvals as durable versioned resources', async () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'rm', hash: 'h' } });
    const [pending] = await b.getApprovals('c');
    expect(pending).toMatchObject({ approvalId: 'a1', version: 1, state: 'pending', runId: 'r', scope: { kind: 'turn', runId: 'r', seq: 1 } });
    expect((await b.getTurn('c', 1)).pendingApproval?.version).toBe(1);
    await b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'deny', reason: 'no' });
    const [decided] = await b.getApprovals('c');
    expect(decided).toMatchObject({ version: 2, state: 'denied', decision: 'deny', reason: 'no' });
    expect(decided!.decidedAt).toBeDefined();
  });

  it('reports lastAcceptedSeq and resumable on event pages', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 4));
    const page = await b.readEvents('c');
    expect(page).toMatchObject({ lastAcceptedSeq: 2, resumable: true });
    const other = new LocalSquadBackend();
    await other.createConversation({ conversationId: 'c' });
    await other.sendMessage('c', msg('r', 1));
    await other.sendMessage('c', msg('r', 2));
    const ahead = await other.readEvents('c');
    const fresh = new LocalSquadBackend();
    await fresh.createConversation({ conversationId: 'c' });
    const stale = await fresh.readEvents('c', { after: ahead.nextCursor });
    expect(stale).toMatchObject({ resumable: false, events: [], lastAcceptedSeq: 1 });
  });

  describe('golden trace', () => {
    const normalize = (events: Array<{ type: string; stream: string; sequence?: number; payload: unknown }>) =>
      events.map(e => ({ type: e.type, stream: e.stream, sequence: e.sequence, payload: e.payload }));

    async function run(disconnect: boolean) {
      const h = new FakeHarness();
      const harnesses = new DefaultHarnessRegistry();
      harnesses.register(h);
      const state = new MemoryStateStore();
      let client = new LocalSquadBackend({ state, harnesses });
      await client.createConversation({ conversationId: 'c' });

      // TurnAccepted(runId, seq)
      const adm = await client.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
      expect(adm).toMatchObject({ runId: 'r', seq: 1, duplicate: false });
      // ApprovalRequested(v1)
      h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'deploy', hash: 'hh' } });
      const seen = new Map<string, { type: string; stream: string; sequence?: number; payload: unknown; cursor?: string }>();
      const first = await client.readEvents('c');
      first.events.forEach(e => seen.set(e.id, e));
      let cursor = first.nextCursor;

      if (disconnect) {
        // disconnect: drop the client; reconnect (new instance, same durable state) from the last cursor.
        client = new LocalSquadBackend({ state, harnesses });
        const replay = await client.readEvents('c', { after: first.events[0]!.cursor });
        expect(replay.resumable).toBe(true);
        replay.events.forEach(e => seen.set(e.id, e)); // at-least-once redelivery, deduped by id
      }

      // ApprovalDecided(v2), retried (at-most-once effect)
      const decided = await client.respondApproval('c', { approvalId: 'a1', hash: 'hh', decision: 'approve' });
      expect(decided.state).toBe('running');
      expect(await rejectCode(client.respondApproval('c', { approvalId: 'a1', hash: 'hh', decision: 'approve' }))).toBe('approval-not-pending');
      expect((await client.sendMessage('c', msg('r', 1, { harness: 'copilot' }))).duplicate).toBe(true);
      // CancellationRequested(runId) -> terminal, retried
      expect((await client.cancelRun('c', 'r')).state).toBe('cancelled');
      await client.cancelRun('c', 'r');

      const rest = await client.readEvents('c', { after: cursor });
      rest.events.forEach(e => seen.set(e.id, e));
      const all = await client.readEvents('c');
      expect([...seen.keys()]).toEqual(all.events.map(e => e.id));
      return { h, events: all.events, approvals: await client.getApprovals('c') };
    }

    it('keeps identical canonical history across disconnect/reconnect with at-most-once effects', async () => {
      const steady = await run(false);
      const resumed = await run(true);
      expect(normalize(resumed.events)).toEqual(normalize(steady.events));
      expect(resumed.events.map(e => e.type)).toEqual([
        'conversation.created', 'message.accepted', 'approval.requested',
        'approval.resolved', 'cancellation.requested', 'turn.state',
      ]);
      const requested = resumed.events.find(e => e.type === 'approval.requested')!;
      const decided = resumed.events.find(e => e.type === 'approval.resolved')!;
      expect((requested.payload as { request: { version: number } }).request.version).toBe(1);
      expect(decided.payload).toMatchObject({ approvalId: 'a1', version: 2, decision: 'approve' });
      expect(resumed.events[5]!.payload).toMatchObject({ runId: 'r', state: 'cancelled' });
      expect(resumed.events[5]!.causationId).toBe(resumed.events[4]!.id);
      expect(resumed.approvals[0]).toMatchObject({ version: 2, state: 'approved' });
      for (const r of [steady, resumed]) {
        expect(r.h.submitted).toEqual([{ runId: 'r', seq: 1 }]);
        expect(r.h.approvals).toEqual(['a1']);
        expect(r.h.cancelled).toEqual([1]);
      }
    });
  });
});

describe('harness registry and extensions', () => {
  it('registers, lists and rejects duplicates / bad ids', () => {
    const r = new DefaultHarnessRegistry();
    const h = new FakeHarness();
    r.register(h);
    expect(r.get('copilot')).toBe(h);
    expect(r.list().map(d => d.id)).toEqual(['copilot']);
    expect(() => r.register(h)).toThrow(/already registered/);
    expect(() => r.register({ ...h, id: 'Bad Id' } as unknown as HarnessAdapter)).toThrow(/Invalid harness id/);
  });

  it('validates x-<harness>.* keys', () => {
    expect(extensionNamespace('x-copilot.model')).toBe('copilot');
    expect(extensionNamespace('x-claude-code.a.b')).toBe('claude-code');
    expect(extensionNamespace('copilot.model')).toBeUndefined();
    expect(extensionNamespace('x-copilot')).toBeUndefined();
    expect(() => validateExtensions({ 'x-a.b': 1 })).not.toThrow();
    expect(() => validateExtensions({ bad: 1 })).toThrow(BackendError);
    expect(() => validateExtensions({ 'x-a.b': 1 }, ['x-c'])).toThrow(/not supported/);
    expect(() => validateExtensions({ 'x-c.b': 1 }, ['x-c'])).not.toThrow();
  });
});

describe('createSquadBackend', () => {
  it('builds each backend kind', () => {
    expect(createSquadBackend({ kind: 'local', squadDir: '.', state: new MemoryStateStore() }).kind).toBe('local');
    expect(createSquadBackend({ kind: 'mcp', squadDir: '.', state: new MemoryStateStore() }).kind).toBe('mcp');
    expect(createSquadBackend({ kind: 'durable-http', baseUrl: 'https://x' }).kind).toBe('durable-http');
  });
});

describe('PR #2238 review regressions (local backend)', () => {
  const setup = (opts: { failApprovals?: { n: number }; state?: MemoryStateStore } = {}) => {
    const h = new FakeHarness();
    const origApprove = h.respondApproval.bind(h);
    h.respondApproval = async (c: string, r: { approvalId: string }) => {
      if (opts.failApprovals && opts.failApprovals.n > 0) { opts.failApprovals.n--; throw new Error('harness down'); }
      return origApprove(c, r);
    };
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = opts.state ?? new MemoryStateStore();
    return { h, harnesses, state, make: () => new LocalSquadBackend({ state, harnesses }) };
  };
  const ask = (runId: string, seq: number, id = 'a1') =>
    ({ type: 'approval-requested' as const, runId, seq, request: { approvalId: id, turnSeq: seq, action: 'x', hash: 'h' } });

  it('1. rejects symlinked/junctioned state paths', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-sym-'));
    try {
      const root = path.join(base, 'squad'); const outside = path.join(base, 'outside');
      fs.mkdirSync(root); fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(root, 'backend'), 'junction');
      const b = new LocalSquadBackend({ state: createFileStateStore(root) });
      expect(await rejectCode(b.createConversation({ conversationId: 'c' }))).toBe('invalid-request');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  it('2+6. concurrent writers on one file store never lose an update', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-lock-'));
    try {
      const a = new LocalSquadBackend({ state: createFileStateStore(dir) });
      const b = new LocalSquadBackend({ state: createFileStateStore(dir) });
      await a.createConversation({ conversationId: 'c' });
      await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).sendMessage('c', msg(`r${i}`, 1))));
      await Promise.all([a.cancelRun('c', 'r0'), b.cancelRun('c', 'r1')]);
      expect(await a.getTranscript('c')).toHaveLength(12);
      expect((await b.getTurn('c', 1)).runId).toBeDefined();
      expect((await a.readEvents('c')).events.filter(e => e.type === 'turn.cancelled' || /cancel/.test(e.type)).length).toBeGreaterThanOrEqual(2);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('3. a terminal harness event cancels the pending approval; a late approval cannot revive the turn', async () => {
    const { h, make } = setup();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask('r', 1));
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1 });
    expect((await b.getApprovals('c'))[0]).toMatchObject({ state: 'cancelled', version: 2 });
    expect(await rejectCode(b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' }))).toBe('approval-not-pending');
    expect((await b.getTurn('c', 1)).state).toBe('completed');
  });

  it('4. harness events from a superseded epoch are dropped', async () => {
    const { h, make } = setup();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot', epoch: 2 }));
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1, epoch: 1 });
    expect((await b.getTurn('c', 1)).state).not.toBe('completed');
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1, epoch: 2 });
    expect((await b.getTurn('c', 1)).state).toBe('completed');
  });

  it('5. omitting the epoch on a fenced conversation is rejected for every write', async () => {
    const { make } = setup();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { epoch: 3 }));
    expect(await rejectCode(b.sendMessage('c', msg('r', 2)))).toBe('stale-epoch');
    expect(await rejectCode(b.cancelTurn('c', 1))).toBe('stale-epoch');
    expect(await rejectCode(b.cancelRun('c', 'r'))).toBe('stale-epoch');
    expect((await b.cancelRun('c', 'r', 'ok', 3)).state).toBe('cancelled');
  });

  it('7. a failed approval delivery is retryable and clears once the harness acknowledges', async () => {
    const fail = { n: 1 };
    const { h, make } = setup({ failApprovals: fail });
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask('r', 1));
    const first = await b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' }).catch(e => e);
    expect(first).toBeInstanceOf(BackendError);
    expect(first).toMatchObject({ code: 'unavailable', retryable: true });
    expect(h.approvals).toEqual([]);
    const turn = await b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' });
    expect(turn.state).toBe('running');
    expect(h.approvals).toEqual(['a1']);
    await b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' }).catch(() => undefined);
    expect(h.approvals).toEqual(['a1']);
  });

  it('8. run identity (runId, seq) survives reload and selects the right turn', async () => {
    const { h, make, state } = setup();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r1', 1, { harness: 'copilot' }));
    await b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }));
    h.emit(ask('r2', 1, 'a2'));
    const reloaded = new LocalSquadBackend({ state, harnesses: setup().harnesses });
    const turn = await reloaded.respondApproval('c', { approvalId: 'a2', hash: 'h', decision: 'deny' });
    expect(turn).toMatchObject({ runId: 'r2', seq: 1 });
    expect((await reloaded.cancelRun('c', 'r1')).runId).toBe('r1');
  });

  it('9. cancelling a pending approval bumps version and timestamp', async () => {
    const { h, make } = setup();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask('r', 1));
    const before = (await b.getApprovals('c'))[0]!;
    await b.cancelRun('c', 'r');
    const after = (await b.getApprovals('c'))[0]!;
    expect(before.version).toBe(1);
    expect(after).toMatchObject({ state: 'cancelled', version: 2 });
    expect(after.decidedAt).toBeDefined();
  });
});

describe('PR #2238 review regressions (durable-http)', () => {
  const mkClient = (handler: (url: string, init: RequestInit) => Promise<Response> | Response, extra: object = {}) =>
    new DurableHttpSquadBackend({ baseUrl: 'https://d.test', token: 't', retryDelayMs: 1, fetch: (async (u: string, i: RequestInit) => handler(String(u), i ?? {})) as never, ...extra });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('10. createConversation retries reuse one conversation id and idempotency key', async () => {
    const seen: Array<{ key: string | null; id: string }> = [];
    let n = 0;
    const b = mkClient((_u, init) => {
      const headers = new Headers(init.headers as HeadersInit);
      const body = JSON.parse(String(init.body));
      seen.push({ key: headers.get('Idempotency-Key'), id: body.conversationId });
      return ++n === 1 ? json(503, { error: { code: 'unavailable', message: 'x', retryable: true } }) : json(200, { conversationId: body.conversationId, epoch: 1, createdAt: 't' });
    });
    await b.createConversation();
    expect(seen).toHaveLength(2);
    expect(seen[0]!.key).toBeTruthy();
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[0]!.key).toContain(seen[0]!.id);
  });

  it('11. a learned epoch is scoped to its conversation', async () => {
    const epochs: Array<string | null> = [];
    const b = mkClient((u, init) => {
      epochs.push(new Headers(init.headers as HeadersInit).get('X-Lease-Epoch'));
      const id = /conversations\/([^/]+)/.exec(u)![1];
      return json(200, { runId: 'r', seq: 1, duplicate: false, state: 'queued', epoch: id === 'a' ? 7 : undefined });
    });
    await b.sendMessage('a', msg('r', 1));
    await b.sendMessage('a', msg('r', 2));
    await b.sendMessage('b', msg('r', 1));
    expect(epochs).toEqual([null, '7', null]);
  });
});
describe('PR #2238 race/fault matrix', () => {
  const mk = () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = new MemoryStateStore();
    return { h, harnesses, state, make: () => new LocalSquadBackend({ state, harnesses }) };
  };
  const ask = (runId: string) => ({ type: 'approval-requested' as const, runId, seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'x', hash: 'h' } });
  const done = (runId: string) => ({ type: 'state' as const, state: 'completed' as const, runId, seq: 1 });
  const approve = (b: LocalSquadBackend) => b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' });

  it('2. a missing leaf under a symlinked parent cannot escape, and a swapped parent is caught', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-swap-'));
    try {
      const root = path.join(base, 'squad'); const outside = path.join(base, 'outside');
      fs.mkdirSync(path.join(root, 'backend', 'conversations'), { recursive: true }); fs.mkdirSync(outside);
      const store = createFileStateStore(root);
      store.write('backend/conversations/ok.json', '{}');
      fs.rmSync(path.join(root, 'backend', 'conversations'), { recursive: true });
      fs.symlinkSync(outside, path.join(root, 'backend', 'conversations'), 'junction');
      expect(() => store.write('backend/conversations/new/leaf.json', '{}')).toThrow(/symbolic link|escapes/);
      expect(() => store.read('backend/conversations/ok.json')).toThrow(/symbolic link/);
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  it('1. interleaved writers from two instances serialize without lost updates', async () => {
    const { make, h } = mk();
    const a = make(); const b = make();
    await a.createConversation({ conversationId: 'c' });
    await Promise.all([a.sendMessage('c', msg('r1', 1, { harness: 'copilot' })), b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }))]);
    h.emit(ask('r1'));
    await Promise.all([a.cancelRun('c', 'r1'), b.cancelRun('c', 'r2')]);
    expect((await a.getTurn('c', 1)).runId).toBeDefined();
    expect((await a.getTranscript('c')).map(m => m.runId).sort()).toEqual(['r1', 'r2']);
    expect((await b.getApprovals('c'))[0]).toMatchObject({ state: 'cancelled', version: 2 });
  });

  it('3. stale or missing epoch fails closed for mutations and harness events', async () => {
    const { make, h } = mk();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot', epoch: 4 }));
    h.emit(ask('r'));
    expect(await rejectCode(b.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve', epoch: 3 }))).toBe('stale-epoch');
    h.emit({ ...done('r'), epoch: 3 });
    expect((await b.getTurn('c', 1)).state).not.toBe('completed');
    expect(await rejectCode(b.cancelTurn('c', 1, 2))).toBe('stale-epoch');
  });

  it('5. cancel / approval / terminal event in every order never revives a terminal turn', async () => {
    const orders: Array<Array<'cancel' | 'approve' | 'terminal'>> = [
      ['cancel', 'approve', 'terminal'], ['cancel', 'terminal', 'approve'], ['approve', 'cancel', 'terminal'],
      ['approve', 'terminal', 'cancel'], ['terminal', 'cancel', 'approve'], ['terminal', 'approve', 'cancel'],
    ];
    for (const order of orders) {
      const { make, h } = mk();
      const b = make();
      await b.createConversation({ conversationId: 'c' });
      await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
      h.emit(ask('r'));
      for (const step of order) {
        if (step === 'cancel') await b.cancelRun('c', 'r');
        else if (step === 'terminal') h.emit(done('r'));
        else await approve(b).catch(() => undefined);
      }
      const turn = await b.getTurn('c', 1);
      const [ap] = await b.getApprovals('c');
      expect(['running', 'queued', 'awaiting-approval'], order.join('>')).not.toContain(turn.state);
      expect(ap!.state, order.join('>')).not.toBe('pending');
      expect(ap!.version, order.join('>')).toBeGreaterThanOrEqual(2);
      expect(ap!.decidedAt, order.join('>')).toBeDefined();
    }
  });

  it('6. restart preserves (runId, seq), approval version and terminal state', async () => {
    const { make, h, state, harnesses } = mk();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r1', 1, { harness: 'copilot' }));
    await b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }));
    h.emit(ask('r2'));
    await b.cancelRun('c', 'r2');
    h.emit(done('r1'));
    const re = new LocalSquadBackend({ state, harnesses });
    expect((await re.getApprovals('c'))[0]).toMatchObject({ runId: 'r2', state: 'cancelled', version: 2 });
    expect(await re.cancelRun('c', 'r2')).toMatchObject({ runId: 'r2', seq: 1, state: 'cancelled' });
    expect(await re.cancelRun('c', 'r1')).toMatchObject({ runId: 'r1', seq: 1 });
    expect((await re.sendMessage('c', msg('r1', 1, { harness: 'copilot' }))).duplicate).toBe(true);
  });

  it('4. a failed delivery rolls forward as retryable and the decision is not final until acknowledged', async () => {
    const { make, h } = mk();
    const b = make();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask('r'));
    const orig = h.respondApproval.bind(h);
    let fail = true;
    h.respondApproval = async (c: string, r: { approvalId: string }) => { if (fail) throw new Error('down'); return orig(c, r); };
    expect(await rejectCode(approve(b))).toBe('unavailable');
    expect(h.approvals).toEqual([]);
    fail = false;
    expect((await approve(b)).state).toBe('running');
    expect(h.approvals).toEqual(['a1']);
  });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('7. createConversation keeps one Idempotency-Key when the response is lost', async () => {
    const keys: Array<string | null> = []; const ids: string[] = [];
    let n = 0;
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://d.test', token: 't', retryDelayMs: 1, fetch: (async (_u: string, init: RequestInit) => {
      keys.push(new Headers(init.headers as HeadersInit).get('Idempotency-Key'));
      const body = JSON.parse(String(init.body)); ids.push(body.conversationId);
      if (++n < 3) throw new TypeError('connection reset');
      return json(200, { conversationId: body.conversationId, epoch: 1, createdAt: 't' });
    }) as never });
    await b.createConversation();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(new Set(ids).size).toBe(1);
  });

  it('8. two conversations advance independent epochs without cross-talk', async () => {
    const sent: Record<string, Array<string | null>> = { a: [], b: [] };
    const next: Record<string, number> = { a: 5, b: 2 };
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://d.test', token: 't', retryDelayMs: 1, fetch: (async (u: string, init: RequestInit) => {
      const id = /conversations\/([^/]+)/.exec(u)![1]!;
      sent[id]!.push(new Headers(init.headers as HeadersInit).get('X-Lease-Epoch'));
      return json(200, { runId: 'r', seq: 1, duplicate: false, state: 'queued', epoch: next[id] });
    }) as never });
    await b.sendMessage('a', msg('r', 1)); await b.sendMessage('b', msg('r', 1));
    next['a'] = 6;
    await b.sendMessage('a', msg('r', 2)); await b.sendMessage('b', msg('r', 2));
    expect(sent).toEqual({ a: [null, '5'], b: [null, '2'] });
  });
});
describe('PR #2238 final hardening', () => {
  const mk = () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = new MemoryStateStore();
    return { h, harnesses, state };
  };
  const ask = (id = 'a1') => ({ type: 'approval-requested' as const, runId: 'r', seq: 1, request: { approvalId: id, turnSeq: 1, action: 'x', hash: 'h' } });

  it('lock: recovers an abandoned lock exactly once and never steals a live one', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-stale-'));
    try {
      const store = createFileStateStore(dir, { staleLockMs: 5_000, lockTimeoutMs: 300 });
      const lockPath = path.join(dir, 'backend', 'locks', 'k.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });

      // live lock inside the threshold: the waiter times out and the holder's file is untouched
      const release = store.lock!('backend/locks/k');
      expect(() => store.lock!('backend/locks/k')).toThrow(/Timed out/);
      expect(fs.existsSync(lockPath)).toBe(true);
      release();
      expect(fs.existsSync(lockPath)).toBe(false);

      // abandoned lock (crashed holder) older than the threshold is recovered
      fs.writeFileSync(lockPath, 'crashed:holder');
      const old = new Date(Date.now() - 60_000);
      fs.utimesSync(lockPath, old, old);
      const r2 = store.lock!('backend/locks/k');
      expect(fs.readFileSync(lockPath, 'utf8')).not.toBe('crashed:holder');
      // a second waiter cannot take the recovered (now live) lock
      expect(() => store.lock!('backend/locks/k')).toThrow(/Timed out/);
      r2();
      expect(fs.readdirSync(path.dirname(lockPath)).filter(n => n.includes('.stale.'))).toEqual([]);

      // a stale release by a superseded holder must not delete the new holder's lock
      const a = store.lock!('backend/locks/k');
      fs.writeFileSync(lockPath, 'someone-else');
      a();
      expect(fs.readFileSync(lockPath, 'utf8')).toBe('someone-else');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('approval version is monotonic (prev + 1), not hardcoded', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask());
    // simulate a record already advanced past v1 (e.g. an amended approval) before the decision
    const key = 'backend/conversations/c.json';
    const doc = JSON.parse(state.read(key)!);
    doc.approvals[0].version = 4;
    state.write(key, JSON.stringify(doc));
    const fresh = new LocalSquadBackend({ state, harnesses });
    await fresh.respondApproval('c', { approvalId: 'a1', hash: 'h', decision: 'approve' });
    expect((await fresh.getApprovals('c'))[0]!.version).toBe(5);

    h.emit({ ...ask('a2'), runId: 'r2', seq: 1 } as never);
    await b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }));
    h.emit({ ...ask('a2'), runId: 'r2' });
    const doc2 = JSON.parse(state.read(key)!);
    doc2.approvals.find((a: { approvalId: string }) => a.approvalId === 'a2').version = 7;
    state.write(key, JSON.stringify(doc2));
    await new LocalSquadBackend({ state, harnesses }).cancelRun('c', 'r2');
    expect((await b.getApprovals('c')).find(a => a.approvalId === 'a2')!.version).toBe(8);
  });

  it('a stale-epoch harness event leaves an auditable control event', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot', epoch: 3 }));
    h.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1, epoch: 2 });
    expect((await b.getTurn('c', 1)).state).not.toBe('completed');
    const audit = (await b.readEvents('c')).events.filter(e => e.type === 'harness.epoch-rejected');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ stream: 'control', payload: { runId: 'r', seq: 1, eventType: 'state', rejectedEpoch: 2, currentEpoch: 3 } });
  });

  it('approval outbox keeps one stable operationId across retries and restart', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask());
    const orig = h.respondApproval.bind(h);
    let fail = 2;
    h.respondApproval = async (c: string, r: { approvalId: string }, op?: string) => {
      h.ops.push(op);
      if (fail-- > 0) throw new Error('down');
      return orig(c, r, op);
    };
    const resp = { approvalId: 'a1', hash: 'h', decision: 'approve' as const };
    expect(await rejectCode(b.respondApproval('c', resp))).toBe('unavailable');
    const restarted = new LocalSquadBackend({ state, harnesses }); // outbox reloads from durable state
    expect(await rejectCode(restarted.respondApproval('c', resp))).toBe('unavailable');
    expect((await restarted.respondApproval('c', resp)).state).toBe('running');
    const used = h.ops.filter(o => o !== undefined);
    expect(used.length).toBeGreaterThanOrEqual(3);
    expect(new Set(used).size).toBe(1);
    expect(used[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
describe('PR review round 3 (Brady re-review of 6451747d)', () => {
  const mk = (h = new FakeHarness()) => {
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    return { h, harnesses, state: new MemoryStateStore() };
  };
  const ask = (runId = 'r', id = 'a1') => ({ type: 'approval-requested' as const, runId, seq: 1, request: { approvalId: id, turnSeq: 1, action: 'x', hash: 'h' } });

  it('P1 legacy outbox entries (id, no operationId): acknowledging one never drops another', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r1', 1, { harness: 'copilot' }));
    await b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }));
    const key = 'backend/conversations/c.json';
    const doc = JSON.parse(state.read(key)!);
    doc.turns.forEach((t: { state: string }) => { t.state = 'cancelled'; });
    doc.deliveries = [{ id: 'L1', kind: 'cancel', runId: 'r1', seq: 1 }, { kind: 'cancel', runId: 'r2', seq: 1 }, { kind: 'cancel', runId: 'r1', seq: 1 }];
    state.write(key, JSON.stringify(doc));
    h.cancel = async (_c: string, runId: string, seq: number) => { if (runId === 'r2') throw new Error('down'); h.cancelled.push(seq); };
    expect(await rejectCode(new LocalSquadBackend({ state, harnesses }).cancelTurn('c', 1))).toBe('unavailable');
    const left = JSON.parse(state.read(key)!).deliveries as Array<{ operationId: string; runId: string }>;
    expect(left.map(d => d.runId)).toEqual(['r2', 'r1']);
    expect(new Set(left.map(d => d.operationId)).size).toBe(2);
    expect(left.every(d => !!d.operationId && !('id' in d))).toBe(true);
  });

  it('P1 a missing harness keeps the durable delivery and reports a retryable error', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask());
    const bare = new LocalSquadBackend({ state, harnesses: new DefaultHarnessRegistry() });
    const err = await bare.cancelRun('c', 'r').catch(e => e);
    expect(err).toMatchObject({ code: 'unavailable', retryable: true });
    expect(JSON.parse(state.read('backend/conversations/c.json')!).deliveries).toHaveLength(1);
    await new LocalSquadBackend({ state, harnesses }).cancelRun('c', 'r');
    expect(h.cancelled).toEqual([1]);
    expect(JSON.parse(state.read('backend/conversations/c.json')!).deliveries ?? []).toHaveLength(0);
  });

  it('P1 an admission retry returns the ORIGINAL admission cursor so unseen events are replayed', async () => {
    const { h, harnesses, state } = mk();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    const first = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit(ask());
    h.emit({ type: 'task', runId: 'r', seq: 1, id: 't1', state: 'running' } as never);
    const retry = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(retry.duplicate).toBe(true);
    expect(retry.cursor).toBe(first.cursor);
    const replay = await b.readEvents('c', { after: retry.cursor });
    expect(replay.events.map(e => e.type)).toContain('approval.requested');
  });

  it('P2 the same (runId, seq) with a different payload is a conflict, an identical one a duplicate', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1));
    expect((await b.sendMessage('c', msg('r', 1, { correlationId: 'other' }))).duplicate).toBe(true);
    for (const changed of [{ content: 'different' }, { role: 'assistant' as const }, { parts: [{ type: 'text' as const, text: 'p' }], content: 'm1' }]) {
      expect(await b.sendMessage('c', msg('r', 1, changed)).catch(e => e)).toMatchObject({ code: 'conflict', status: 409 });
    }
    expect(await b.getTranscript('c')).toHaveLength(1);
  });

  it('P2 synchronous replay during restart recovery does not re-enter load() or deadlock the lock', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-replay-'));
    try {
      let subscribes = 0;
      const replay: HarnessEventEnvelope[] = [ask() as never];
      class ReplayHarness extends FakeHarness {
        override subscribe(c: string, l: (e: HarnessEventEnvelope) => void) {
          subscribes++;
          replay.forEach(e => l(e)); // synchronous replay before the subscription is returned
          return super.subscribe(c, l);
        }
      }
      const h = new ReplayHarness();
      const harnesses = new DefaultHarnessRegistry();
      harnesses.register(h);
      const store = () => createFileStateStore(dir, { lockTimeoutMs: 400 });
      const first = new LocalSquadBackend({ state: store(), harnesses: (() => { const r = new DefaultHarnessRegistry(); r.register(new FakeHarness()); return r; })() });
      await first.createConversation({ conversationId: 'c' });
      await first.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
      subscribes = 0;
      const restarted = new LocalSquadBackend({ state: store(), harnesses });
      const approvals = await restarted.getApprovals('c');
      expect(approvals.map(a => a.approvalId)).toEqual(['a1']);
      expect(subscribes).toBe(1);
      await new Promise(r => setTimeout(r, 20)); // the post-load persistence of the replayed event
      expect((await new LocalSquadBackend({ state: store(), harnesses }).getApprovals('c')).map(a => a.approvalId)).toEqual(['a1']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('P1 overlapping stale-lock recovery (A observes, B takes over, C waits) never yields two owners', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-abc-'));
    try {
      const lockPath = path.join(dir, 'backend', 'locks', 'k.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'crashed:T1');
      const old = new Date(Date.now() - 60_000);
      fs.utimesSync(lockPath, old, old);
      let armed = true;
      const storeA = createFileStateStore(dir, {
        staleLockMs: 5_000, lockTimeoutMs: 300,
        // B recovers the stale lock and acquires it right after A observed the stale T1 but before A recovers
        beforeStaleRecovery: (lp) => { if (armed) { armed = false; fs.rmSync(lp); fs.writeFileSync(lp, 'B:live'); } },
      });
      expect(() => storeA.lock!('backend/locks/k')).toThrow(/Timed out/); // A must not steal B's live lock
      expect(fs.readFileSync(lockPath, 'utf8')).toBe('B:live');
      const storeC = createFileStateStore(dir, { staleLockMs: 5_000, lockTimeoutMs: 300 });
      expect(() => storeC.lock!('backend/locks/k')).toThrow(/Timed out/); // nor can C acquire it
      expect(fs.readFileSync(lockPath, 'utf8')).toBe('B:live');
      expect(fs.readdirSync(path.dirname(lockPath)).filter(n => n.endsWith('.recover'))).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('P2 an HTTP body-read failure is retried like any other transient failure', async () => {
    let calls = 0;
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://d.test', retryDelayMs: 1, fetch: (async () => {
      calls++;
      if (calls === 1) return { ok: true, status: 200, headers: new Headers(), text: async () => { throw new TypeError('terminated'); } } as unknown as Response;
      return new Response(JSON.stringify({ runId: 'r', seq: 1, duplicate: false, state: 'queued' }), { status: 200 });
    }) as never });
    expect((await b.sendMessage('c', msg('r', 1))).runId).toBe('r');
    expect(calls).toBe(2);
  });
});
describe('PR review round 4: reclaimer death and outbox write-through', () => {
  const tmp = async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-r4-'));
    const lockPath = path.join(dir, 'backend', 'locks', 'k.lock');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const age = (p: string, ms: number) => { const t = new Date(Date.now() - ms); fs.utimesSync(p, t, t); };
    return { fs, path, dir, lockPath, age };
  };

  it('A/B/C with a REAL second reclaimer: B recovers and holds, A and C never become owners', async () => {
    const { fs, path, dir, lockPath, age } = await tmp();
    try {
      fs.writeFileSync(lockPath, 'crashed:T1');
      age(lockPath, 60_000);
      const opts = { staleLockMs: 5_000, lockTimeoutMs: 300, recoverStaleMs: 100 };
      const storeB = createFileStateStore(dir, opts);
      let releaseB: (() => void) | undefined;
      let armed = true;
      const storeA = createFileStateStore(dir, {
        ...opts,
        // A has observed the stale T1; B runs its entire recovery + acquisition before A starts recovering
        beforeStaleRecovery: () => { if (armed) { armed = false; releaseB = storeB.lock!('backend/locks/k'); } },
      });
      expect(() => storeA.lock!('backend/locks/k')).toThrow(/Timed out/);
      expect(releaseB).toBeDefined();
      const holder = fs.readFileSync(lockPath, 'utf8');
      expect(holder).not.toBe('crashed:T1');
      expect(() => createFileStateStore(dir, opts).lock!('backend/locks/k')).toThrow(/Timed out/);
      expect(fs.readFileSync(lockPath, 'utf8')).toBe(holder); // still B's
      releaseB!();
      const releaseC = createFileStateStore(dir, opts).lock!('backend/locks/k');
      releaseC();
      expect(fs.readdirSync(path.dirname(lockPath)).filter(n => n.includes('.recover'))).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a reclaimer that died while holding ${lockPath}.recover cannot wedge recovery forever', async () => {
    const { fs, path, dir, lockPath, age } = await tmp();
    try {
      fs.writeFileSync(lockPath, 'crashed:T1');
      age(lockPath, 60_000);
      fs.writeFileSync(`${lockPath}.recover`, 'dead-reclaimer:1');
      age(`${lockPath}.recover`, 60_000);
      const store = createFileStateStore(dir, { staleLockMs: 5_000, lockTimeoutMs: 2_000, recoverStaleMs: 100 });
      const release = store.lock!('backend/locks/k'); // abandoned mutex is reclaimed, then the stale lock
      expect(fs.readFileSync(lockPath, 'utf8')).not.toBe('crashed:T1');
      release();
      expect(fs.readdirSync(path.dirname(lockPath)).filter(n => n.includes('.recover') || n.includes('.dead.'))).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a LIVE ${lockPath}.recover mutex is never taken: single-winner exclusion holds', async () => {
    const { fs, dir, lockPath, age } = await tmp();
    try {
      fs.writeFileSync(lockPath, 'crashed:T1');
      age(lockPath, 60_000);
      fs.writeFileSync(`${lockPath}.recover`, 'live-reclaimer:1'); // fresh mtime
      const store = createFileStateStore(dir, { staleLockMs: 5_000, lockTimeoutMs: 300, recoverStaleMs: 5_000 });
      expect(() => store.lock!('backend/locks/k')).toThrow(/Timed out/);
      expect(fs.readFileSync(`${lockPath}.recover`, 'utf8')).toBe('live-reclaimer:1');
      expect(fs.readFileSync(lockPath, 'utf8')).toBe('crashed:T1');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('legacy outbox normalization is written through under the lock BEFORE harness delivery and stays stable across a crash', async () => {
    const { fs, path, dir } = await tmp();
    try {
      const h = new FakeHarness();
      const harnesses = new DefaultHarnessRegistry();
      harnesses.register(h);
      const make = () => new LocalSquadBackend({ state: createFileStateStore(dir, { lockTimeoutMs: 1_000 }), harnesses });
      const b = make();
      await b.createConversation({ conversationId: 'c' });
      await b.sendMessage('c', msg('r1', 1, { harness: 'copilot' }));
      await b.sendMessage('c', msg('r2', 1, { harness: 'copilot' }));
      const file = path.join(dir, 'backend', 'conversations', 'c.json');
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
      doc.turns.forEach((t: { state: string }) => { t.state = 'cancelled'; });
      doc.deliveries = [{ id: 'legacy-1', kind: 'cancel', runId: 'r1', seq: 1 }, { kind: 'cancel', runId: 'r2', seq: 1 }];
      fs.writeFileSync(file, JSON.stringify(doc));

      const seen: Array<{ op?: string; onDisk: string[]; legacyIdsLeft: boolean }> = [];
      h.cancel = (async (_c: string, _r: string, _s: number, op?: string) => {
        const disk = JSON.parse(fs.readFileSync(file, 'utf8')).deliveries as Array<{ operationId?: string; id?: string }>;
        seen.push({ op, onDisk: disk.map(d => d.operationId ?? ''), legacyIdsLeft: disk.some(d => 'id' in d) });
        throw new Error('crash mid-delivery');
      }) as never;

      expect(await rejectCode(make().cancelTurn('c', 1))).toBe('unavailable');
      expect(seen).toHaveLength(1);
      // at the moment of delivery, every entry on disk already carried its final operationId and no legacy id
      expect(seen[0]!.onDisk.every(Boolean)).toBe(true);
      expect(seen[0]!.legacyIdsLeft).toBe(false);
      expect(seen[0]!.op).toBe('legacy-1');
      expect(seen[0]!.onDisk[0]).toBe(seen[0]!.op);
      expect(new Set(seen[0]!.onDisk).size).toBe(2);

      // restart: the same operationId is passed again (nothing regenerated)
      expect(await rejectCode(make().cancelTurn('c', 1))).toBe('unavailable');
      expect(seen[1]!.op).toBe(seen[0]!.op);
      expect(seen[1]!.onDisk).toEqual(seen[0]!.onDisk);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Layer 3 review recommendations & bug fixes', () => {
  it('marks /backend as experimental and does not re-export backend symbols from root @bradygaster/squad-sdk', async () => {
    expect(BACKEND_CONTRACT_STAGE).toBe('experimental');
    const rootSdk = await import('../packages/squad-sdk/src/index.js');
    expect(rootSdk).not.toHaveProperty('createSquadBackend');
    expect(rootSdk).not.toHaveProperty('LocalSquadBackend');
    expect(rootSdk).not.toHaveProperty('DurableHttpSquadBackend');
    expect(rootSdk).not.toHaveProperty('BACKEND_CONTRACT_STAGE');
  });

  it('rejects a symlinked .squad root directory or symlinked backend store directory', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-root-sym-'));
    try {
      const outside = path.join(base, 'outside');
      fs.mkdirSync(outside, { recursive: true });
      const linkedSquad = path.join(base, '.squad');
      fs.symlinkSync(outside, linkedSquad, 'junction');

      // Direct symlinked squadDir
      const directStore = createFileStateStore(linkedSquad);
      expect(() => directStore.write('backend/conversations/c.json', '{}')).toThrow(/symbolic link/);
      expect(() => directStore.lock!('backend/locks/c')).toThrow(/symbolic link/);

      // Directory nested inside a symlinked .squad parent
      fs.mkdirSync(path.join(outside, 'nested'), { recursive: true });
      const nestedStore = createFileStateStore(path.join(linkedSquad, 'nested'));
      expect(() => nestedStore.write('backend/conversations/c.json', '{}')).toThrow(/symbolic link/);
      expect(fs.readdirSync(path.join(outside, 'nested'))).toEqual([]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it('times out cleanly after lockTimeoutMs when reading an existing lockPath persistently fails with EACCES/EPERM', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-lock-eacces-'));
    try {
      const lockPath = path.join(dir, 'backend', 'locks', 'k.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'existing:holder');

      let polls = 0;
      const store = createFileStateStore(dir, {
        lockTimeoutMs: 60,
        staleLockMs: 10,
        inspectLockFile: () => {
          polls++;
          throw Object.assign(new Error('EACCES: permission denied'), { code: polls % 2 === 0 ? 'EPERM' : 'EACCES' });
        },
      });
      const started = Date.now();
      let caught: unknown;
      try {
        store.lock!('backend/locks/k');
      } catch (e) {
        caught = e;
      }
      const elapsed = Date.now() - started;
      expect(caught).toBeInstanceOf(BackendError);
      expect(caught).toMatchObject({ code: 'unavailable', status: 503, message: 'Timed out waiting for the conversation lock' });
      expect(polls).toBeGreaterThanOrEqual(2);
      expect(polls).toBeLessThan(30); // sleeps between polls instead of busy-spinning
      expect(elapsed).toBeGreaterThanOrEqual(40);
      expect(elapsed).toBeLessThan(2_000);

      // Also verify the default fs.readFileSync path when lockPath is an unreadable directory (EISDIR/EACCES)
      const dirLockPath = path.join(dir, 'backend', 'locks', 'dir.lock');
      fs.mkdirSync(dirLockPath, { recursive: true });
      const defaultStore = createFileStateStore(dir, { lockTimeoutMs: 40, staleLockMs: 10 });
      expect(() => defaultStore.lock!('backend/locks/dir')).toThrow(/Timed out waiting for the conversation lock/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovers a lost/failed harness.submit on a sendMessage retry with the same (runId, seq) and returns the original admission cursor', async () => {
    const h = new FakeHarness();
    let failFirst = true;
    const origSubmit = h.submit.bind(h);
    h.submit = async (s: { runId: string; seq: number }) => {
      if (failFirst) {
        failFirst = false;
        throw new Error('transient harness dispatch failure');
      }
      await origSubmit(s);
      h.emit({ type: 'message', runId: s.runId, seq: s.seq, message: { runId: s.runId, seq: 2, role: 'assistant', content: 'recovered' } });
      h.emit({ type: 'state', runId: s.runId, seq: s.seq, state: 'completed' });
    };
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });

    // First attempt: admission succeeds and persists the turn in 'running', but harness.submit fails transiently
    const firstErr = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' })).catch(e => e);
    expect(firstErr).toBeInstanceOf(BackendError);
    expect(firstErr).toMatchObject({ code: 'unavailable', retryable: true, status: 503 });
    expect((await b.getTurn('c', 1)).state).toBe('running');
    expect(h.submitted).toEqual([]);

    const acceptedEvent = (await b.readEvents('c')).events.find(e => e.type === 'message.accepted')!;
    expect(acceptedEvent).toBeDefined();

    // Retry with the same (runId, seq) and identical payload re-drives harness.submit, completes, and returns the original admission cursor
    const recovered = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(recovered).toMatchObject({
      runId: 'r',
      seq: 1,
      duplicate: true,
      state: 'completed',
      cursor: acceptedEvent.cursor,
    });
    expect(h.submitted).toEqual([{ runId: 'r', seq: 1 }]);
    expect((await b.getTranscript('c')).map(m => m.content)).toEqual(['m1', 'recovered']);

    // Subsequent retry does not re-submit
    const afterCompletion = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(afterCompletion).toMatchObject({ duplicate: true, state: 'completed', cursor: acceptedEvent.cursor });
    expect(h.submitted).toEqual([{ runId: 'r', seq: 1 }]);
  });

  it('createStateBackendStore enforces lock mutual exclusion and times out when held', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-state-store-lock-'));
    try {
      const files = new Map<string, string>();
      const backing = {
        name: 'orphan',
        read: (p: string) => files.get(p),
        write: (p: string, c: string) => { files.set(p, c); },
        exists: (p: string) => files.has(p),
        list: (d: string) => [...files.keys()].filter(k => k.startsWith(`${d}/`)).map(k => k.slice(d.length + 1)),
      };
      const storeA = createStateBackendStore(backing, dir, { lockTimeoutMs: 120, staleLockMs: 5_000 });
      const storeB = createStateBackendStore(backing, dir, { lockTimeoutMs: 120, staleLockMs: 5_000 });
      expect(typeof storeA.lock).toBe('function');

      const releaseA = storeA.lock!('backend/locks/conv-1');
      expect(() => storeB.lock!('backend/locks/conv-1')).toThrow(/Timed out waiting for the conversation lock/);
      releaseA();

      // After release, storeB can acquire and release cleanly; the lock directory stays (pruning it would race
      // another process's mkdir -> open('wx'))
      const releaseB = storeB.lock!('backend/locks/conv-1');
      releaseB();
      expect(fs.existsSync(path.join(dir, 'backend', 'locks'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'backend', 'locks', 'conv-1.lock'))).toBe(false);

      // async acquisition contends on the same lock files without blocking the event loop
      const releaseAsync = await storeA.lockAsync!('backend/locks/conv-1');
      let ticks = 0;
      const ticker = setInterval(() => { ticks++; }, 5);
      try {
        await expect(storeB.lockAsync!('backend/locks/conv-1')).rejects.toThrow(/Timed out waiting for the conversation lock/);
      } finally {
        clearInterval(ticker);
      }
      expect(ticks).toBeGreaterThan(0);
      releaseAsync();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('createStateBackendStore refuses a backend without a deterministic lock root', () => {
    const backing = {
      name: 'opaque',
      read: () => undefined,
      write: () => undefined,
      exists: () => false,
      list: () => [],
    };
    expect(() => createStateBackendStore(backing)).toThrow(/deterministic lock directory/);
    expect(() => createStateBackendStore({ ...backing, root: '/some/root' } as never)).not.toThrow();
    expect(() => createStateBackendStore(backing, { lockAnchor: '/team/.squad' })).not.toThrow();
  });

  it('createStateBackendStore keeps locks for cwd/anchor-backed backends out of the team .squad directory', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const teamSquadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-state-store-anchor-'));
    try {
      const backing = {
        name: 'orphan',
        cwd: path.dirname(teamSquadDir),
        read: () => undefined,
        write: () => undefined,
        exists: () => false,
        list: () => [],
      };
      const mkCwd = () => createStateBackendStore(backing, { lockTimeoutMs: 50 });
      const mkAnchor = () => createStateBackendStore({ ...backing, cwd: undefined } as never, { lockAnchor: teamSquadDir, lockTimeoutMs: 50 });
      for (const mk of [mkCwd, mkAnchor]) {
        const release = mk().lock!('backend/locks/conv-1');
        // the same identity resolves to the same machine-local lock directory in every process
        expect(() => mk().lock!('backend/locks/conv-1')).toThrow(/Timed out/);
        release();
        expect(fs.existsSync(path.join(teamSquadDir, 'backend'))).toBe(false);
        expect(fs.existsSync(path.join(path.dirname(teamSquadDir), '.squad', 'backend'))).toBe(false);
      }
    } finally {
      fs.rmSync(teamSquadDir, { recursive: true, force: true });
    }
  });

  it('DurableHttpSquadBackend times out per attempt according to requestTimeoutMs and maxRetries', async () => {
    let attempts = 0;
    const hangingFetch = vi.fn((_url: string, init?: RequestInit) => {
      attempts++;
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) {
          reject(sig.reason ?? Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
          return;
        }
        sig?.addEventListener('abort', () => {
          reject(sig.reason ?? Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
        }, { once: true });
      });
    });

    const client = new DurableHttpSquadBackend({
      baseUrl: 'https://durable.test',
      fetch: hangingFetch as unknown as typeof fetch,
      requestTimeoutMs: 30,
      maxRetries: 2,
      retryDelayMs: 5,
    });

    const started = Date.now();
    const err = await client.getTranscript('c').catch(e => e);
    const elapsed = Date.now() - started;

    expect(attempts).toBe(3); // initial + 2 retries
    expect(err).toBeInstanceOf(BackendError);
    expect(err).toMatchObject({
      code: 'unavailable',
      retryable: true,
      status: 504,
      message: 'Backend request timed out',
    });
    expect(elapsed).toBeLessThan(2_000);
  });

  it('gates squad_backend_* tools in state-mcp behind explicit opt-in (SQUAD_BACKEND_URL alone is not opt-in)', async () => {
    const { isExperimentalBackendEnabled } = await import('../packages/squad-cli/src/cli/core/backend-mcp.js');
    expect(isExperimentalBackendEnabled([], {})).toBe(false);
    expect(isExperimentalBackendEnabled(['--experimental-backend'], {})).toBe(true);
    expect(isExperimentalBackendEnabled([], { SQUAD_EXPERIMENTAL_BACKEND: '1' })).toBe(true);
    expect(isExperimentalBackendEnabled([], { SQUAD_EXPERIMENTAL_BACKEND: '0' })).toBe(false);
    expect(isExperimentalBackendEnabled([], { SQUAD_BACKEND_URL: 'https://durable.test' })).toBe(false);
    expect(isExperimentalBackendEnabled([], { SQUAD_BACKEND_URL: 'https://durable.test', SQUAD_EXPERIMENTAL_BACKEND: '1' })).toBe(true);
  }, 20_000);

  it('DurableHttpSquadBackend only accepts https (or http to loopback) and never follows redirects', async () => {
    const { validateBaseUrl } = await import('../packages/squad-sdk/src/backend/index.js');
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'http://durable.test' })).toThrow(/https/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'ftp://durable.test' })).toThrow(/https/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'not a url' })).toThrow(/not a valid URL/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'https://user:pw@durable.test' })).toThrow(/credentials/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: '' as string })).toThrow(/required/);
    expect(validateBaseUrl('http://localhost:8080/')).toBe('http://localhost:8080');
    expect(validateBaseUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(validateBaseUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(validateBaseUrl('https://durable.test/')).toBe('https://durable.test');

    const inits: RequestInit[] = [];
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      inits.push(init ?? {});
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://durable.test', token: 't', fetch: f as never, retryDelayMs: 1, requestTimeoutMs: 1_000 });
    await b.getTurn('c', 1);
    await b.health();
    expect(inits.length).toBeGreaterThanOrEqual(3);
    for (const init of inits) {
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('DurableHttpSquadBackend health probes time out instead of hanging', async () => {
    const hanging = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    }));
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://durable.test', fetch: hanging as never, requestTimeoutMs: 50 });
    const started = Date.now();
    const health = await b.health();
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(health.ok).toBe(false);
    expect(health.detail).toMatch(/timeout/i);
  });

  it('file store: a non-ENOENT read failure is reported, never mistaken for a missing conversation', async () => {
    const fsMod = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fsMod.mkdtempSync(path.join(os.tmpdir(), 'sq-read-err-'));
    try {
      const store = createFileStateStore(dir);
      const b = new LocalSquadBackend({ state: store });
      const first = await b.createConversation({ conversationId: 'c', title: 'original' });
      const spy = vi.spyOn(fsMod.default, 'readFileSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
      });
      try {
        const err = await b.createConversation({ conversationId: 'c', title: 'replacement' }).catch(e => e);
        expect(err).toBeInstanceOf(BackendError);
        expect(err).toMatchObject({ code: 'unavailable', retryable: true });
      } finally {
        spy.mockRestore();
      }
      // the original was not overwritten by the "idempotent" create
      expect((await b.createConversation({ conversationId: 'c' })).title).toBe(first.title);
      expect(store.read('backend/conversations/missing.json')).toBeUndefined();
    } finally {
      fsMod.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a corrupt conversation file surfaces as BackendError with its path, not a raw SyntaxError', async () => {
    const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state });
    await b.createConversation({ conversationId: 'c' });
    state.write('backend/conversations/c.json', '{ not json');
    const err = await b.getTranscript('c').catch(e => e);
    expect(err).toBeInstanceOf(BackendError);
    expect(err).toMatchObject({ code: 'unavailable', details: { path: 'backend/conversations/c.json' } });
    expect(err.message).toMatch(/not valid JSON/);
    // a parseable file with the wrong shape is rejected the same way, and never treated as "absent"
    state.write('backend/conversations/c.json', '[]');
    expect(await rejectCode(b.createConversation({ conversationId: 'c' }))).toBe('unavailable');
  });

  it('rejects Windows reserved device names as conversation ids', async () => {
    const b = new LocalSquadBackend();
    for (const id of ['CON', 'con', 'NUL', 'COM1', 'lpt9', 'AUX.json', 'PRN.txt']) {
      expect(await rejectCode(b.createConversation({ conversationId: id }))).toBe('invalid-request');
    }
    expect((await b.createConversation({ conversationId: 'console' })).conversationId).toBe('console');
    expect((await b.createConversation({ conversationId: 'COM10' })).conversationId).toBe('COM10');
  });

  it('MCP bridge: send_message refuses when no harness is registered; health/negotiate expose executionAvailable', async () => {
    const { createBackendMcpTools, callBackendMcpTool, NO_HARNESS_MESSAGE } = await import('../packages/squad-cli/src/cli/core/backend-mcp.js');
    const bare = new LocalSquadBackend({ kind: 'mcp' });
    const tools = createBackendMcpTools(() => bare);
    const tool = (n: string) => tools.find(t => t.name === n)!;
    await tool('squad_backend_create_conversation').call({ conversationId: 'c' });

    const res = await callBackendMcpTool(tool('squad_backend_send_message'), { conversationId: 'c', runId: 'r', seq: 1, content: 'hi' });
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0]!.text) as { error: { code: string; message: string; details?: Record<string, unknown> } };
    expect(parsed.error).toMatchObject({ code: 'unavailable', message: NO_HARNESS_MESSAGE, details: { executionAvailable: false } });
    expect(await bare.getTranscript('c')).toEqual([]); // nothing was queued silently

    const health = await tool('squad_backend_health').call({}) as { executionAvailable: boolean; harnesses: string[] };
    expect(health).toMatchObject({ ok: true, harnesses: [], executionAvailable: false });
    const negotiated = await tool('squad_backend_negotiate').call({ protocols: [BACKEND_PROTOCOL_VERSION] }) as { executionAvailable: boolean; harnesses: string[] };
    expect(negotiated).toMatchObject({ harnesses: [], executionAvailable: false });
    expect(tool('squad_backend_send_message').description).toMatch(/transcripts only/);

    // with a harness registered the same call is admitted
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(new FakeHarness());
    const withHarness = new LocalSquadBackend({ kind: 'mcp', harnesses });
    const tools2 = createBackendMcpTools(() => withHarness);
    await tools2.find(t => t.name === 'squad_backend_create_conversation')!.call({ conversationId: 'c' });
    const adm = await tools2.find(t => t.name === 'squad_backend_send_message')!.call({ conversationId: 'c', runId: 'r', seq: 1, content: 'hi', harness: 'copilot' }) as { state: string };
    expect(adm.state).toBe('running');
    expect(await tools2.find(t => t.name === 'squad_backend_health')!.call({})).toMatchObject({ harnesses: ['copilot'], executionAvailable: true });
  });

  it('MCP bridge validates argument shapes and hides non-contract error details', async () => {
    const { createBackendMcpTools, callBackendMcpTool } = await import('../packages/squad-cli/src/cli/core/backend-mcp.js');
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(new FakeHarness());
    const b = new LocalSquadBackend({ kind: 'mcp', harnesses });
    const tools = createBackendMcpTools(() => b);
    const tool = (n: string) => tools.find(t => t.name === n)!;
    await tool('squad_backend_create_conversation').call({ conversationId: 'c' });
    const code = async (n: string, args: Record<string, unknown>) =>
      (JSON.parse((await callBackendMcpTool(tool(n), args)).content[0]!.text) as { error?: { code: string } }).error?.code;

    expect(await code('squad_backend_send_message', { conversationId: 'c', runId: 'r', seq: 1, content: 'x', role: 'root' })).toBe('invalid-request');
    expect(await code('squad_backend_send_message', { conversationId: 'c', runId: 'r', seq: 1, parts: 'text' })).toBe('invalid-request');
    expect(await code('squad_backend_send_message', { conversationId: 'c', runId: 'r', seq: 1, parts: [{ type: 'bogus' }] })).toBe('invalid-request');
    expect(await code('squad_backend_send_message', { conversationId: 'c', runId: 'r', seq: 1, content: 'x', extensions: [] })).toBe('invalid-request');
    expect(await code('squad_backend_negotiate', { protocols: 'nope' })).toBe('invalid-request');
    expect(await code('squad_backend_negotiate', { protocols: [BACKEND_PROTOCOL_VERSION], contentParts: ['video'] })).toBe('invalid-request');
    expect(await code('squad_backend_read_events', { conversationId: 'c', limit: 0 })).toBe('invalid-request');
    expect(await code('squad_backend_read_events', { conversationId: 'c', stream: 'all' })).toBe('invalid-request');
    expect(await code('squad_backend_respond_approval', { conversationId: 'c', approvalId: 'a', hash: 'h', decision: 'maybe' })).toBe('invalid-request');

    // limit is capped
    for (let i = 1; i <= 3; i++) await tool('squad_backend_send_message').call({ conversationId: 'c', runId: `r${i}`, seq: 1, content: 'x', harness: 'copilot' });
    const page = await tool('squad_backend_read_events').call({ conversationId: 'c', limit: 100_000 }) as { events: unknown[] };
    expect(page.events.length).toBeLessThanOrEqual(500);

    const exploding = { ...tool('squad_backend_health'), call: async () => { throw new Error('ENOENT: C:\\secret\\path\\state.json'); } };
    const res = await callBackendMcpTool(exploding, {});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).not.toMatch(/secret/);
    expect(JSON.parse(res.content[0]!.text).error).toMatchObject({ code: 'unavailable', retryable: false });
  });
});

describe('PR #2253 Copilot review thread regressions', () => {
  it('1. backend-mcp send_message auto-selects a single registered harness or rejects an omitted harness when multiple are registered', async () => {
    const { createBackendMcpTools, callBackendMcpTool } = await import('../packages/squad-cli/src/cli/core/backend-mcp.js');
    const h1 = new FakeHarness();
    const singleReg = new DefaultHarnessRegistry();
    singleReg.register(h1);
    const singleBackend = new LocalSquadBackend({ kind: 'mcp', harnesses: singleReg });
    const singleTools = new Map(createBackendMcpTools(() => singleBackend).map(t => [t.name, t]));
    await singleTools.get('squad_backend_create_conversation')!.call({ conversationId: 'c' });

    const adm = await singleTools.get('squad_backend_send_message')!.call({
      conversationId: 'c', runId: 'r1', seq: 1, content: 'auto-routed',
    }) as { state: string };
    expect(adm.state).toBe('running');
    expect(h1.submitted).toEqual([{ runId: 'r1', seq: 1 }]);

    // When multiple harnesses are registered, omitting 'harness' is rejected instead of silently queueing
    const h2 = { ...new FakeHarness(), id: 'claude', capabilities: { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: ['x-claude'] }, describe: () => ({ id: 'claude', capabilities: { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: ['x-claude'] } }) } as unknown as HarnessAdapter;
    const multiReg = new DefaultHarnessRegistry();
    multiReg.register(new FakeHarness());
    multiReg.register(h2);
    const multiBackend = new LocalSquadBackend({ kind: 'mcp', harnesses: multiReg });
    const multiTools = new Map(createBackendMcpTools(() => multiBackend).map(t => [t.name, t]));
    await multiTools.get('squad_backend_create_conversation')!.call({ conversationId: 'c' });

    const res = await callBackendMcpTool(multiTools.get('squad_backend_send_message')!, {
      conversationId: 'c', runId: 'r1', seq: 1, content: 'ambiguous',
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]!.text).error).toMatchObject({ code: 'invalid-request' });
    expect(await multiBackend.getTranscript('c')).toEqual([]);
  });

  it('2. backend-mcp read_events defaults an omitted limit to MAX_READ_EVENTS_LIMIT (500)', async () => {
    const { createBackendMcpTools, MAX_READ_EVENTS_LIMIT } = await import('../packages/squad-cli/src/cli/core/backend-mcp.js');
    const seenOptions: Array<{ limit?: number }> = [];
    const spyBackend = {
      kind: 'mcp',
      readEvents: async (_c: string, opts?: { limit?: number }) => {
        seenOptions.push(opts ?? {});
        return { events: [], nextCursor: 'cur', lastAcceptedSeq: 0, resumable: true };
      },
    } as unknown as LocalSquadBackend;
    const tools = new Map(createBackendMcpTools(() => spyBackend).map(t => [t.name, t]));
    await tools.get('squad_backend_read_events')!.call({ conversationId: 'c' });
    expect(seenOptions).toEqual([{ after: undefined, limit: MAX_READ_EVENTS_LIMIT, stream: undefined }]);
  });

  it('3. DurableHttpSquadBackend health probe fails when response-body read rejects after HTTP 200 headers', async () => {
    const bodyReadFails = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => {
        throw Object.assign(new Error('Body stream timed out'), { name: 'TimeoutError' });
      },
    } as unknown as Response));
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://durable.test', fetch: bodyReadFails as never, requestTimeoutMs: 50 });
    const health = await b.health();
    expect(health).toMatchObject({ ok: false, live: false, ready: false });
    expect(health.detail).toMatch(/timed out/i);
  });

  it('4. sendMessage deduplicates concurrent in-flight adapter.submit calls and passes stable operationId across crash retries', async () => {
    const seenOps: Array<string | undefined> = [];
    let submitCalls = 0;
    let releaseSubmit!: () => void;
    const submitGate = new Promise<void>(r => { releaseSubmit = r; });

    const h = new FakeHarness();
    h.submit = async (s: { runId: string; seq: number; operationId?: string }) => {
      submitCalls++;
      seenOps.push(s.operationId);
      await submitGate;
      h.submitted.push({ runId: s.runId, seq: s.seq });
    };
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });

    const firstPromise = b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    await new Promise(r => setTimeout(r, 15)); // let first call enter adapter.submit
    const secondPromise = b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    await new Promise(r => setTimeout(r, 15));
    expect(submitCalls).toBe(1); // concurrent retry awaited the in-flight dispatch instead of calling submit twice

    releaseSubmit();
    const [firstAdm, secondAdm] = await Promise.all([firstPromise, secondPromise]);
    expect(firstAdm.duplicate).toBe(false);
    expect(secondAdm.duplicate).toBe(true);
    expect(submitCalls).toBe(1);
    expect(seenOps).toEqual(['c:r:1']);
  });

  it('5. cancelling a turn removes queued approval deliveries for that turn so flushDeliveries does not send or block on an obsolete approval', async () => {
    const h = new FakeHarness();
    let failApproval = true;
    const origApprove = h.respondApproval.bind(h);
    h.respondApproval = async (c: string, r: { approvalId: string }) => {
      if (failApproval) throw new Error('approval delivery down');
      return origApprove(c, r);
    };
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state, harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'deploy', hash: 'h1' } });

    expect(await rejectCode(b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' }))).toBe('unavailable');
    // Now cancel while approval delivery is still failing: cancellation drops the obsolete approval delivery and succeeds
    const cancelled = await b.cancelRun('c', 'r', 'abort');
    expect(cancelled.state).toBe('cancelled');
    expect(h.approvals).toEqual([]);
    expect(h.cancelled).toEqual([1]);
    failApproval = false;
  });

  it('6. harness event callbacks verify the publishing harnessId matches the turn routed harness', async () => {
    const copilot = new FakeHarness();
    class ClaudeHarness extends FakeHarness {
      override readonly id = 'claude' as never;
      override readonly capabilities = { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: ['x-claude'] };
    }
    const claude = new ClaudeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(copilot);
    harnesses.register(claude);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r-copilot', 1, { harness: 'copilot' }));
    await b.sendMessage('c', msg('r-claude', 2, { harness: 'claude' }));

    // copilot attempts to emit messages, approvals, and completion for claude's turn (r-claude, seq 2)
    copilot.emit({ type: 'message', runId: 'r-claude', seq: 2, message: { runId: 'r-claude', seq: 99, role: 'assistant', content: 'spoofed' } });
    copilot.emit({ type: 'approval-requested', runId: 'r-claude', seq: 2, request: { approvalId: 'spoof-a', turnSeq: 2, action: 'rm', hash: 'h' } });
    copilot.emit({ type: 'state', runId: 'r-claude', seq: 2, state: 'completed' });

    const claudeTurn = await b.getTurn('c', 2);
    expect(claudeTurn.state).toBe('running');
    expect(claudeTurn.messages).toHaveLength(1);
    expect(claudeTurn.pendingApproval).toBeUndefined();
    expect(await b.getApprovals('c')).toEqual([]);
  });

  it('7. a second distinct approval-requested event for a turn with a pending approval is rejected without overwriting', async () => {
    const h = new FakeHarness();
    const harnesses = new DefaultHarnessRegistry();
    harnesses.register(h);
    const b = new LocalSquadBackend({ harnesses });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));

    h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'first', hash: 'h1' } });
    h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a2', turnSeq: 1, action: 'second', hash: 'h2' } });

    expect((await b.getTurn('c', 1)).pendingApproval?.approvalId).toBe('a1');
    expect((await b.getApprovals('c')).map(a => a.approvalId)).toEqual(['a1']);
    const resolved = await b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' });
    expect(resolved.state).toBe('running');
  });

  it('8. createStateBackendStore derives shared lock identity across linked git worktrees, path aliases, and TwoLayerBackend', async () => {
    const { execFileSync } = await import('node:child_process');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { OrphanBranchBackend, TwoLayerBackend } = await import('../packages/squad-sdk/src/state-backend.js');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-wt-lock-'));
    try {
      const repoMain = path.join(base, 'main-repo');
      const repoWt = path.join(base, 'linked-wt');
      const repoAlias = path.join(base, 'alias-repo');
      fs.mkdirSync(repoMain, { recursive: true });
      execFileSync('git', ['init'], { cwd: repoMain, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoMain, 'README.md'), '# test\n');
      execFileSync('git', ['add', 'README.md'], { cwd: repoMain, stdio: 'ignore' });
      execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@e', 'commit', '-m', 'init'], { cwd: repoMain, stdio: 'ignore' });
      execFileSync('git', ['worktree', 'add', '-b', 'wt-branch', repoWt], { cwd: repoMain, stdio: 'ignore' });
      fs.symlinkSync(repoMain, repoAlias, 'junction');

      const opts = { lockTimeoutMs: 50 };
      const storeMain = createStateBackendStore(new OrphanBranchBackend(repoMain), opts);
      const storeWt = createStateBackendStore(new OrphanBranchBackend(repoWt), opts);
      const storeTwoLayerWt = createStateBackendStore(new TwoLayerBackend(repoWt), { ...opts, lockAnchor: path.join(repoWt, '.squad') });
      const storeAlias = createStateBackendStore(new OrphanBranchBackend(repoAlias), opts);

      const release = storeMain.lock!('backend/locks/shared-conv');
      try {
        // Linked worktree, TwoLayerBackend wrapper, and symlink/junction alias all contend on the same lock
        expect(() => storeWt.lock!('backend/locks/shared-conv')).toThrow(/Timed out/);
        expect(() => storeTwoLayerWt.lock!('backend/locks/shared-conv')).toThrow(/Timed out/);
        expect(() => storeAlias.lock!('backend/locks/shared-conv')).toThrow(/Timed out/);

        // A different orphan branch ref has its own independent lock
        const storeOtherBranch = createStateBackendStore(new OrphanBranchBackend(repoWt, 'other-state'), opts);
        const releaseOther = storeOtherBranch.lock!('backend/locks/shared-conv');
        releaseOther();
      } finally {
        release();
      }
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }, 30_000);
});

