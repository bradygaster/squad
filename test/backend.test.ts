import { describe, it, expect, vi } from 'vitest';
import {
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  DefaultHarnessRegistry,
  DurableHttpSquadBackend,
  LocalSquadBackend,
  MemoryStateStore,
  createFileStateStore,
  createSquadBackend,
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
  async respondApproval(_c: string, r: { approvalId: string }) { this.approvals.push(r.approvalId); }
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
    const dup = await b.sendMessage('c', msg('r1', 1, { content: 'changed' }));
    expect(dup.duplicate).toBe(true);
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
    new DurableHttpSquadBackend({ baseUrl: 'http://x/', token: 'tok', fetch: fetchImpl, retryDelayMs: 1, ...extra });

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
      'POST http://x/v1/conversations',
      'POST http://x/v1/conversations/c/messages',
      'GET http://x/v1/conversations/c/transcript',
      'GET http://x/v1/conversations/c/turns/1',
      'POST http://x/v1/conversations/c/turns/1/cancel',
      'POST http://x/v1/conversations/c/approvals/a',
      'GET http://x/health/live',
      'GET http://x/health/ready',
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
    expect(urls.sort()).toEqual(['http://x/health/live', 'http://x/health/ready']); // 503 not retried

    const legacy = vi.fn(async (url: string) => (url.endsWith('/health') ? jsonRes(200, {}) : jsonRes(404, {})));
    expect(await mk(legacy as unknown as typeof fetch).health()).toMatchObject({ ok: true, live: true, ready: true });
    expect(legacy).toHaveBeenLastCalledWith('http://x/health', expect.anything());
  });

  it('cancels by runId and lists approvals over HTTP', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      return url.endsWith('/approvals') ? jsonRes(200, { approvals: [{ approvalId: 'a', version: 2 }] }) : jsonRes(200, { runId: 'r/1', state: 'cancelled' });
    });
    const b = mk(f as unknown as typeof fetch, { epoch: 5 });
    await b.cancelRun('c', 'r/1', 'why');
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'http://x/v1/conversations/c/runs/r%2F1/cancel' });
    expect(seen[0]!.headers['X-Lease-Epoch']).toBe('5');
    expect(JSON.parse(seen[0]!.body!)).toEqual({ reason: 'why' });
    expect(await b.getApprovals('c')).toEqual([{ approvalId: 'a', version: 2 }]);
    expect(seen[1]).toMatchObject({ method: 'GET', url: 'http://x/v1/conversations/c/approvals' });
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
    expect(seen[0]!.url).toBe('http://x/v1/conversations/c/events?after=x+y&limit=5&stream=control');
    expect(seen[0]!.headers['X-Squad-Protocol']).toBe(BACKEND_PROTOCOL_VERSION);
    expect((await b.negotiate({ protocols: ['2.0'] })).protocol).toBe('2.0');
    expect(seen[1]!.url).toBe('http://x/v1/capabilities');
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
    expect(createSquadBackend({ kind: 'durable-http', baseUrl: 'http://x' }).kind).toBe('durable-http');
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
    new DurableHttpSquadBackend({ baseUrl: 'http://d.test', token: 't', retryDelayMs: 1, fetch: (async (u: string, i: RequestInit) => handler(String(u), i ?? {})) as never, ...extra });
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
    const b = new DurableHttpSquadBackend({ baseUrl: 'http://d.test', token: 't', retryDelayMs: 1, fetch: (async (_u: string, init: RequestInit) => {
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
    const b = new DurableHttpSquadBackend({ baseUrl: 'http://d.test', token: 't', retryDelayMs: 1, fetch: (async (u: string, init: RequestInit) => {
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