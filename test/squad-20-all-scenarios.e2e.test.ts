import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('@bradygaster/squad-sdk', async () => ({
  ...(await import('../packages/squad-sdk/src/backend/index.js')),
  resolveSquadState: vi.fn(),
}));

import { resolveSquadState } from '@bradygaster/squad-sdk';
import {
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  DefaultHarnessRegistry,
  DurableHttpSquadBackend,
  LocalSquadBackend,
  MemoryStateStore,
  createSquadBackend,
  type BackendEnvelope,
  type HarnessAdapter,
  type HarnessEventEnvelope,
  type SquadBackend,
} from '../packages/squad-sdk/src/backend/index.js';
import {
  BLOCK_BEGIN,
  CLIENT_IDS,
  SQUAD_STATE_KEY,
  assertPortableClients,
  getClientAdapter,
  slugifyMember,
  installClients,
  normalizeClientIds,
  parseClients,
  projectClients,
  resolveEffectiveCapabilities,
  type ClientContext,
  type ClientId,
} from '../packages/squad-sdk/src/clients/index.js';
import { callBackendMcpTool, createBackendMcpTools, createMcpBackend } from '../packages/squad-cli/src/cli/commands/backend-mcp.js';

const SUITE = path.resolve(__dirname, '..', 'test-fixtures', 'spec', 'suite-v0.2');
const matrix = JSON.parse(fs.readFileSync(path.join(SUITE, 'capability-matrix.json'), 'utf8')) as {
  backendCapabilities: string[];
  policyCapabilities: string[];
  clients: Record<string, { clientCapabilities: string[]; effectiveCapabilities: string[] }>;
};
const golden = JSON.parse(fs.readFileSync(path.join(SUITE, 'golden-trace.json'), 'utf8')) as {
  conversationId: string;
  runId: string;
  expectedTerminalState: string;
  events: Array<Record<string, unknown> & { event: string }>;
};

// ── helpers ─────────────────────────────────────────────────────────

class TestHarness implements HarnessAdapter {
  readonly capabilities;
  submitted: Array<{ runId: string; seq: number }> = [];
  cancelled: Array<{ runId: string; seq: number }> = [];
  approvals: string[] = [];
  private listeners = new Set<(e: HarnessEventEnvelope) => void>();
  constructor(readonly id: string) {
    this.capabilities = { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: [`x-${id}`] };
  }
  async submit(s: { runId: string; seq: number }) { this.submitted.push({ runId: s.runId, seq: s.seq }); }
  subscribe(_c: string, l: (e: HarnessEventEnvelope) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async cancel(_c: string, runId: string, seq: number) { this.cancelled.push({ runId, seq }); }
  async respondApproval(_c: string, r: { approvalId: string }) { this.approvals.push(r.approvalId); }
  describe() { return { id: this.id, capabilities: this.capabilities }; }
  emit(e: HarnessEventEnvelope) { this.listeners.forEach(l => l(e)); }
}

const HARNESS_IDS = ['copilot', 'claude', 'kiro', 'opencode', 'cursor'] as const;

function makeRegistry() {
  const registry = new DefaultHarnessRegistry();
  const harnesses = Object.fromEntries(HARNESS_IDS.map(id => [id, new TestHarness(id)])) as Record<(typeof HARNESS_IDS)[number], TestHarness>;
  for (const h of Object.values(harnesses)) registry.register(h);
  return { registry, harnesses };
}

const msg = (runId: string, seq: number, extra: object = {}) => ({ runId, seq, role: 'user' as const, content: `m${seq}`, ...extra });

async function errorOf(p: Promise<unknown>): Promise<BackendError | undefined> {
  try { await p; } catch (e) { return e as BackendError; }
  return undefined;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** In-memory stand-in for a DurableSquad server: real backend semantics behind the /v1 HTTP surface. */
function createMockDurableSquad(local: LocalSquadBackend) {
  const calls: Array<{ method: string; path: string; headers: Record<string, string>; body?: any }> = [];
  const failures = new Map<string, { status: number; remaining: number }>();
  const health = { live: true, ready: true };
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path: url.pathname + url.search, headers, body });

    const fail = failures.get(`${method} ${url.pathname}`);
    if (fail && fail.remaining > 0) {
      fail.remaining--;
      return json(fail.status, { error: { code: 'unavailable', message: 'injected', retryable: true } });
    }
    if (method === 'GET' && url.pathname === '/health/live') return health.live ? json(200, { status: 'ok', version: 'mock-1' }) : json(503, { detail: 'not live' });
    if (method === 'GET' && url.pathname === '/health/ready') return health.ready ? json(200, { status: 'ok' }) : json(503, { detail: 'degraded: warming up' });
    try {
      let m: RegExpExecArray | null;
      if (method === 'POST' && url.pathname === '/v1/capabilities') return json(200, await local.negotiate(body));
      if (method === 'POST' && url.pathname === '/v1/conversations') return json(200, await local.createConversation(body));
      if ((m = /^\/v1\/conversations\/([^/]+)\/(.+)$/.exec(url.pathname))) {
        const id = decodeURIComponent(m[1]!);
        const rest = m[2]!;
        let r: RegExpExecArray | null;
        if (method === 'POST' && rest === 'messages') return json(200, await local.sendMessage(id, body));
        if (method === 'GET' && rest === 'transcript') return json(200, { messages: await local.getTranscript(id) });
        if (method === 'GET' && rest === 'events') {
          return json(200, await local.readEvents(id, {
            after: url.searchParams.get('after') ?? undefined,
            limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
            stream: (url.searchParams.get('stream') as 'control' | 'execution' | null) ?? undefined,
          }));
        }
        if (method === 'GET' && rest === 'approvals') return json(200, { approvals: await local.getApprovals(id) });
        if ((r = /^turns\/(\d+)$/.exec(rest)) && method === 'GET') return json(200, await local.getTurn(id, Number(r[1])));
        if ((r = /^turns\/(\d+)\/cancel$/.exec(rest)) && method === 'POST') return json(200, await local.cancelTurn(id, Number(r[1])));
        if ((r = /^runs\/([^/]+)\/cancel$/.exec(rest)) && method === 'POST') return json(200, await local.cancelRun(id, decodeURIComponent(r[1]!), body?.reason));
        if ((r = /^approvals\/([^/]+)$/.exec(rest)) && method === 'POST') return json(200, await local.respondApproval(id, body));
      }
      return json(404, { error: { code: 'not-found', message: `no route ${method} ${url.pathname}`, retryable: false } });
    } catch (err) {
      if (err instanceof BackendError) return json(err.status ?? 400, { error: err.toInfo() });
      throw err;
    }
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, calls, failures, health };
}

function mkHttp(server: ReturnType<typeof createMockDurableSquad>, extra: object = {}) {
  return new DurableHttpSquadBackend({ baseUrl: 'http://durable.test', token: 't', fetch: server.fetch, retryDelayMs: 1, ...extra });
}

const canonical = (events: BackendEnvelope[]) =>
  events.map(e => ({ type: e.type, stream: e.stream, sequence: e.sequence, payload: e.payload }));

// ── Scenario 1: client projections ──────────────────────────────────

describe('Scenario 1: client projections and --client', () => {
  let root: string;
  const ctx = (over: Partial<ClientContext> = {}): ClientContext => ({
    root,
    mcp: { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] },
    members: [{ name: 'Data', role: 'Framework Expert' }, { name: "B'Elanna", role: 'Durable Systems' }],
    ...over,
  });
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-clients-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it.each([...CLIENT_IDS, 'all'])('projects %s to disk and is idempotent', (name) => {
    const clients = parseClients(name);
    expect(clients).toEqual(name === 'all' ? [...CLIENT_IDS] : [name]);
    const files = projectClients(clients, ctx());
    expect(files.length).toBeGreaterThan(0);

    const first = installClients(clients, ctx());
    expect(first.every(r => r.action === 'created' || r.action === 'updated')).toBe(true);
    for (const f of files) expect(fs.existsSync(path.join(root, f.path)), f.path).toBe(true);
    const mcpFiles = files.filter(f => f.kind === 'json');
    expect(mcpFiles.length).toBeGreaterThan(0);
    for (const f of mcpFiles) {
      expect(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, f.path), 'utf8')))).toContain(SQUAD_STATE_KEY);
    }

    const second = installClients(clients, ctx());
    expect(second.map(r => r.action)).toEqual(second.map(() => 'unchanged'));
  });

  it('projects the host-specific files', () => {
    installClients([...CLIENT_IDS], ctx());
    for (const rel of [
      '.claude/agents/squad.md', '.claude/agents/squad-data.md', 'CLAUDE.md',
      '.kiro/steering/squad.md', '.kiro/agents/squad.json', '.kiro/settings/mcp.json',
      '.opencode/agent/squad.md', 'opencode.json',
      '.cursor/rules/squad.mdc', '.cursor/agents/squad.md', '.cursor/mcp.json',
    ]) expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
    expect(fs.readFileSync(path.join(root, `.claude/agents/squad-${slugifyMember("B'Elanna")}.md`), 'utf8')).toContain("B'Elanna");
  });

  it('merges shared JSON configs without clobbering user entries', () => {
    const userCfg: Record<string, string> = {
      '.mcp.json': JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }),
      '.kiro/settings/mcp.json': JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }),
      '.cursor/mcp.json': JSON.stringify({ mcpServers: { mine: { command: 'mine' } } }),
      'opencode.json': JSON.stringify({ model: 'my-model', mcp: { mine: { type: 'remote', url: 'u' } } }),
    };
    for (const [rel, body] of Object.entries(userCfg)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    installClients([...CLIENT_IDS], ctx());
    for (const rel of Object.keys(userCfg)) {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const text = JSON.stringify(parsed);
      expect(text, rel).toContain('"mine"');
      expect(text, rel).toContain(SQUAD_STATE_KEY);
    }
    expect(JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8')).model).toBe('my-model');
  });

  it('refuses to overwrite malformed user JSON', () => {
    fs.writeFileSync(path.join(root, '.mcp.json'), '{ not json');
    const results = installClients(['claude'], ctx());
    expect(results.some(r => r.action === 'error')).toBe(true);
    expect(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe('{ not json');
  });

  it('keeps CLAUDE.md user text and a single idempotent marker block', () => {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# My project\n\nkeep me\n');
    installClients(['claude'], ctx());
    installClients(['claude'], ctx());
    installClients(['claude'], ctx({ members: [{ name: 'Worf', role: 'Security' }] }));
    const text = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(text.startsWith('# My project\n\nkeep me\n')).toBe(true);
    expect(text.split(BLOCK_BEGIN)).toHaveLength(2);
  });

  it('enforces portable client id hygiene', () => {
    const { clients, rejected } = normalizeClientIds(['Claude ', ' claude', 'kiro', 'sk-token=abc', 'C:\\Users\\x', 'thread-123', 'nope', 5, {}]);
    expect(clients).toEqual(['claude', 'kiro']);
    expect(rejected.filter(r => r.reason === 'sensitive').length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(rejected)).not.toMatch(/sk-token|Users|thread-123/);
    expect(normalizeClientIds('copilot').clients).toEqual([]);
    expect(assertPortableClients(['copilot', 'cursor'])).toEqual(['copilot', 'cursor']);
    expect(() => assertPortableClients(['claude', 'claude'])).toThrow(/canonical ids/);
    expect(() => assertPortableClients(['sk-secret-token'])).toThrow(/rejected 1/);
    expect(() => assertPortableClients('claude')).toThrow(/array/);
    expect(() => parseClients('bogus')).toThrow();
  });
});

// ── Scenario 2: capability intersection ─────────────────────────────

describe('Scenario 2: cross-plane capability intersection', () => {
  const intersect = (...sets: string[][]) => sets.reduce((a, b) => a.filter(x => b.includes(x)));

  it.each(CLIENT_IDS)('%s: adapter capabilities, backend negotiate() and capability-matrix.json agree', async (id: ClientId) => {
    const adapter = getClientAdapter(id);
    const entry = matrix.clients[id]!;

    // plane 1: adapter declaration narrowed by backend + policy
    const eff = resolveEffectiveCapabilities(
      adapter.capabilities,
      { supportsNativeHooks: false },
      { transportModes: ['mcp-bridge', 'http-backend'], supportsSteeringFiles: false },
    );
    expect(eff.supportsNativeHooks).toBe(false);
    expect(eff.supportsSteeringFiles).toBe(false);
    expect(eff.supportsSubagents).toBe(adapter.capabilities.supportsSubagents);
    expect(eff.transportModes).toEqual(adapter.capabilities.transportModes.filter(m => m !== 'in-process'));
    expect(resolveEffectiveCapabilities(adapter.capabilities, {}, { supportsMcpTransport: false }).transportModes).not.toContain('mcp-bridge');
    expect(resolveEffectiveCapabilities(adapter.capabilities)).toEqual(adapter.capabilities);

    // plane 2: backend negotiation == client ∩ backend ∩ policy
    const backend = new LocalSquadBackend();
    const neg = await backend.negotiate({
      protocols: [BACKEND_PROTOCOL_VERSION], clientName: id,
      capabilities: entry.clientCapabilities, policyCapabilities: matrix.policyCapabilities,
    });
    expect(neg.backendCapabilities).toEqual(matrix.backendCapabilities);
    expect(neg.effectiveCapabilities).toEqual(intersect(entry.clientCapabilities, matrix.backendCapabilities, matrix.policyCapabilities));
    expect(neg.effectiveCapabilities).toEqual(entry.effectiveCapabilities);
    expect(neg.resume).toBe(entry.effectiveCapabilities.includes('cursor-reconnect'));
    expect(neg.approvals).toBe(entry.effectiveCapabilities.includes('approvals'));

    // plane 3: adapter declaration is consistent with the matrix
    expect(entry.clientCapabilities.includes('subagents')).toBe(adapter.capabilities.supportsSubagents);
    expect(entry.clientCapabilities.includes('mcp-bridge'))
      .toBe(adapter.capabilities.supportsMcpTransport && adapter.capabilities.transportModes.includes('mcp-bridge'));
  });

  it('policy narrows, clients never widen', async () => {
    const backend = new LocalSquadBackend();
    const policy = matrix.policyCapabilities.filter(c => c !== 'cancel-run' && c !== 'background-runs');
    const neg = await backend.negotiate({ protocols: [BACKEND_PROTOCOL_VERSION], capabilities: [...matrix.clients['copilot']!.clientCapabilities, 'telepathy'], policyCapabilities: policy });
    expect(neg.effectiveCapabilities).not.toContain('cancel-run');
    expect(neg.effectiveCapabilities).not.toContain('background-runs');
    expect(neg.effectiveCapabilities).not.toContain('telepathy');
    expect(neg.effectiveCapabilities).toEqual(intersect(neg.clientCapabilities, neg.backendCapabilities, policy));
    expect((await errorOf(backend.negotiate({ protocols: ['1.0'] })))?.code).toBe('unsupported-protocol');
  });
});

// ── Scenario 3: LocalSquadBackend across 5 harnesses ────────────────

describe('Scenario 3: LocalSquadBackend + HarnessRegistry (5 harnesses)', () => {
  it('registers all five harnesses', () => {
    const { registry } = makeRegistry();
    expect(registry.list().map(h => h.id)).toEqual([...HARNESS_IDS]);
    expect(registry.list().every(h => h.capabilities.extensionNamespaces.length === 1)).toBe(true);
  });

  it.each(HARNESS_IDS)('%s: typed multi-part messages, own x-%s.* accepted, foreign prefix rejected', async (id) => {
    const { registry, harnesses } = makeRegistry();
    const b = new LocalSquadBackend({ harnesses: registry });
    await b.createConversation({ conversationId: 'c' });
    const parts = [
      { type: 'text' as const, text: 'hello' },
      { type: 'data' as const, mimeType: 'application/json', data: { a: 1 } },
      { type: 'resource' as const, uri: 'file:///x.ts', title: 'x.ts' },
      { type: 'tool-call' as const, callId: 't1', name: 'grep', arguments: { q: 'z' } },
      { type: 'tool-result' as const, callId: 't1', result: 'ok' },
    ];
    const adm = await b.sendMessage('c', { runId: 'r', seq: 1, role: 'user', content: '', parts, harness: id, extensions: { [`x-${id}.setting`]: 1 } });
    expect(adm).toMatchObject({ state: 'running', duplicate: false, protocol: BACKEND_PROTOCOL_VERSION });
    expect(harnesses[id].submitted).toEqual([{ runId: 'r', seq: 1 }]);
    const [stored] = await b.getTranscript('c');
    expect(stored!.parts!.map(p => p.type)).toEqual(['text', 'data', 'resource', 'tool-call', 'tool-result']);
    expect(stored!.content).toContain('hello');
    expect(stored!.content).toContain('x.ts');

    const foreign = HARNESS_IDS.find(h => h !== id)!;
    expect((await errorOf(b.sendMessage('c', msg('r', 2, { harness: id, extensions: { [`x-${foreign}.setting`]: 1 } }))))?.code).toBe('invalid-request');
    expect((await errorOf(b.sendMessage('c', msg('r', 3, { harness: id, extensions: { unprefixed: 1 } }))))?.code).toBe('invalid-request');
    expect((await errorOf(b.sendMessage('c', msg('r', 4, { harness: 'unknown' }))))?.code).toBe('invalid-request');
    expect((await b.getTranscript('c'))).toHaveLength(1);
  });

  it('dedups (runId, seq) and fences stale epochs', async () => {
    const { registry, harnesses } = makeRegistry();
    const b = new LocalSquadBackend({ harnesses: registry });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'kiro', epoch: 2 }));
    const dup = await b.sendMessage('c', msg('r', 1, { harness: 'kiro', epoch: 2, content: 'retry' }));
    expect(dup.duplicate).toBe(true);
    expect(harnesses.kiro.submitted).toHaveLength(1);
    expect((await b.sendMessage('c', msg('r2', 1, { harness: 'kiro', epoch: 2 }))).duplicate).toBe(false);
    const stale = await errorOf(b.sendMessage('c', msg('r', 2, { epoch: 1 })));
    expect(stale).toMatchObject({ code: 'stale-epoch', status: 409, retryable: false });
    expect((await b.sendMessage('c', msg('r', 2, { epoch: 5 }))).epoch).toBe(5);
    expect((await errorOf(b.respondApproval('c', { approvalId: 'x', hash: 'h', decision: 'approve', epoch: 4 })))?.code).toBe('stale-epoch');
  });

  it.each(HARNESS_IDS)('%s: versioned approvals v1→v2 with hash tamper rejection', async (id) => {
    const { registry, harnesses } = makeRegistry();
    const b = new LocalSquadBackend({ harnesses: registry });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: id }));
    harnesses[id].emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'deploy', hash: 'sha256:good' } });
    let [rec] = await b.getApprovals('c');
    expect(rec).toMatchObject({ version: 1, state: 'pending', scope: { kind: 'turn', runId: 'r', seq: 1 }, hash: 'sha256:good' });
    expect((await b.getTurn('c', 1)).state).toBe('awaiting-approval');

    expect((await errorOf(b.respondApproval('c', { approvalId: 'a1', hash: 'sha256:evil', decision: 'approve' })))?.code).toBe('approval-hash-mismatch');
    expect(harnesses[id].approvals).toEqual([]);
    [rec] = await b.getApprovals('c');
    expect(rec!.version).toBe(1);

    const turn = await b.respondApproval('c', { approvalId: 'a1', hash: 'sha256:good', decision: 'approve' });
    expect(turn.state).toBe('running');
    [rec] = await b.getApprovals('c');
    expect(rec).toMatchObject({ version: 2, state: 'approved', decision: 'approve' });
    expect((await errorOf(b.respondApproval('c', { approvalId: 'a1', hash: 'sha256:good', decision: 'approve' })))?.code).toBe('approval-not-pending');
    expect(harnesses[id].approvals).toEqual(['a1']);
  });

  it('persists conversations across backend instances sharing state', async () => {
    const state = new MemoryStateStore();
    const a = new LocalSquadBackend({ state });
    await a.createConversation({ conversationId: 'c' });
    await a.sendMessage('c', msg('r', 1));
    const b = new LocalSquadBackend({ state });
    expect((await b.sendMessage('c', msg('r', 1))).duplicate).toBe(true);
    expect(await b.getTranscript('c')).toHaveLength(1);
  });
});

// ── Scenario 4: DurableHttpSquadBackend lifecycle ───────────────────

describe('Scenario 4: DurableHttpSquadBackend full HTTP lifecycle', () => {
  it('speaks every route of the DurableSquad surface', async () => {
    const { registry, harnesses } = makeRegistry();
    const server = createMockDurableSquad(new LocalSquadBackend({ harnesses: registry }));
    const b = mkHttp(server);

    const neg = await b.negotiate({ protocols: [BACKEND_PROTOCOL_VERSION], capabilities: ['approvals', 'cancel-run'] });
    expect(neg.effectiveCapabilities).toEqual(['approvals', 'cancel-run']);
    const conv = await b.createConversation({ conversationId: 'c', title: 'T' });
    expect(conv.conversationId).toBe('c');
    const adm = await b.sendMessage('c', msg('run-1', 1, { harness: 'opencode', correlationId: 'corr-1' }));
    expect(adm).toMatchObject({ runId: 'run-1', seq: 1, duplicate: false, correlationId: 'corr-1' });
    expect(await b.getTranscript('c')).toHaveLength(1);
    expect(await b.getTurn('c', 1)).toMatchObject({ runId: 'run-1', seq: 1, state: 'running' });

    harnesses.opencode.emit({ type: 'approval-requested', runId: 'run-1', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'x', hash: 'h1' } });
    const [pending] = await b.getApprovals('c');
    expect(pending).toMatchObject({ approvalId: 'a1', version: 1 });
    expect((await errorOf(b.respondApproval('c', { approvalId: 'a1', hash: 'tampered', decision: 'approve' })))?.code).toBe('approval-hash-mismatch');
    expect((await b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' })).state).toBe('running');
    expect((await b.getApprovals('c'))[0]).toMatchObject({ version: 2, state: 'approved' });

    const page = await b.readEvents('c', { limit: 2 });
    expect(page.events).toHaveLength(2);
    const rest = await b.readEvents('c', { after: page.nextCursor });
    expect(rest.events.map(e => e.sequence)).toEqual([3, 4]);
    expect(rest).toMatchObject({ resumable: true, lastAcceptedSeq: 4 });
    expect((await b.readEvents('c', { stream: 'execution' })).events).toEqual([]);

    expect((await b.cancelRun('c', 'run-1', 'user')).state).toBe('cancelled');
    expect((await b.cancelRun('c', 'run-1')).state).toBe('cancelled');
    expect((await b.cancelTurn('c', 1)).state).toBe('cancelled');
    expect(harnesses.opencode.cancelled).toEqual([{ runId: 'run-1', seq: 1 }]);
    expect((await errorOf(b.cancelRun('c', 'missing')))).toMatchObject({ code: 'not-found', status: 404 });
    expect(await b.health()).toMatchObject({ ok: true, live: true, ready: true });

    const routes = new Set(server.calls.map(c => `${c.method} ${c.path.split('?')[0]!.replace(/\/c\//, '/:id/')}`));
    for (const r of [
      'POST /v1/capabilities', 'POST /v1/conversations', 'POST /v1/conversations/:id/messages',
      'GET /v1/conversations/:id/transcript', 'GET /v1/conversations/:id/turns/1', 'POST /v1/conversations/:id/runs/run-1/cancel',
      'POST /v1/conversations/:id/turns/1/cancel', 'GET /v1/conversations/:id/approvals', 'POST /v1/conversations/:id/approvals/a1',
      'GET /v1/conversations/:id/events', 'GET /health/live', 'GET /health/ready',
    ]) expect(routes, r).toContain(r);
    expect(server.calls.some(c => c.path.includes('events?after='))).toBe(true);
    for (const c of server.calls.filter(c => c.path.startsWith('/v1/'))) {
      expect(c.headers['X-Squad-Protocol']).toBe(BACKEND_PROTOCOL_VERSION);
      expect(c.headers['Authorization']).toBe('Bearer t');
    }
    const send = server.calls.find(c => c.path.endsWith('/messages'))!;
    expect(send.headers['Idempotency-Key']).toBe('run-1:1');
    expect(send.headers['X-Correlation-Id']).toBe('corr-1');
  });

  it('retries transient 503s with a stable idempotency key; server effect happens once', async () => {
    const local = new LocalSquadBackend();
    const server = createMockDurableSquad(local);
    const b = mkHttp(server);
    await b.createConversation({ conversationId: 'c' });
    server.failures.set('POST /v1/conversations/c/messages', { status: 503, remaining: 2 });
    const adm = await b.sendMessage('c', msg('r', 1));
    expect(adm.duplicate).toBe(false);
    const sends = server.calls.filter(c => c.path.endsWith('/messages'));
    expect(sends).toHaveLength(3);
    expect(new Set(sends.map(s => s.headers['Idempotency-Key']))).toEqual(new Set(['r:1']));
    expect(await local.getTranscript('c')).toHaveLength(1);

    server.failures.set('GET /v1/conversations/c/transcript', { status: 500, remaining: 99 });
    const gaveUp = await errorOf(mkHttp(server, { maxRetries: 2 }).getTranscript('c'));
    expect(gaveUp).toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('rejects stale epochs without retrying', async () => {
    const server = createMockDurableSquad(new LocalSquadBackend());
    const b = mkHttp(server);
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { epoch: 3 }));
    const before = server.calls.length;
    const err = await errorOf(b.sendMessage('c', msg('r', 2, { epoch: 2 })));
    expect(err).toMatchObject({ code: 'stale-epoch', status: 409, retryable: false });
    expect(server.calls.length - before).toBe(1);
    expect(server.calls.at(-1)!.headers['X-Lease-Epoch']).toBe('2');
  });

  it('reports liveness/readiness, degraded readiness, and falls back to /health', async () => {
    const server = createMockDurableSquad(new LocalSquadBackend());
    const b = mkHttp(server);
    expect(await b.health()).toMatchObject({ ok: true, live: true, ready: true, version: 'mock-1' });

    server.health.ready = false;
    server.calls.length = 0;
    expect(await b.health()).toMatchObject({ ok: false, live: true, ready: false, detail: 'degraded: warming up' });
    expect(server.calls.filter(c => c.path === '/health/ready')).toHaveLength(1); // 503 probe is not retried

    server.health.live = false;
    expect(await b.health()).toMatchObject({ ok: false, live: false, ready: false });

    const legacy = vi.fn(async (u: string) => (u.endsWith('/health') ? json(200, {}) : json(404, {})));
    const old = new DurableHttpSquadBackend({ baseUrl: 'http://old.test', fetch: legacy as unknown as typeof fetch });
    expect(await old.health()).toMatchObject({ ok: true, live: true, ready: true });
  });
});

// ── Scenario 5: MCP bridge ──────────────────────────────────────────

describe('Scenario 5: backend-mcp.ts full tool coverage', () => {
  const EXPECTED_TOOLS = [
    'squad_backend_negotiate', 'squad_backend_create_conversation', 'squad_backend_send_message',
    'squad_backend_get_turn', 'squad_backend_get_transcript', 'squad_backend_read_events',
    'squad_backend_cancel_turn', 'squad_backend_cancel_run', 'squad_backend_get_approvals',
    'squad_backend_respond_approval', 'squad_backend_health',
  ];

  async function drive(backend: SquadBackend, harness: TestHarness) {
    const tools = new Map(createBackendMcpTools(() => backend).map(t => [t.name, t]));
    expect([...tools.keys()].sort()).toEqual([...EXPECTED_TOOLS].sort());
    for (const t of tools.values()) expect(t.inputSchema.type).toBe('object');
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await callBackendMcpTool(tools.get(name)!, args);
      return { isError: res.isError ?? false, body: JSON.parse(res.content[0]!.text) as any };
    };

    const neg = await call('squad_backend_negotiate', { protocols: [BACKEND_PROTOCOL_VERSION], capabilities: ['approvals', 'cursor-reconnect'], policyCapabilities: ['approvals'] });
    expect(neg.body.effectiveCapabilities).toEqual(['approvals']);
    expect((await call('squad_backend_negotiate', { protocols: ['0.1'] })).body.error).toMatchObject({ code: 'unsupported-protocol', retryable: false });

    expect((await call('squad_backend_create_conversation', { conversationId: 'mcp-c', title: 'T' })).body.conversationId).toBe('mcp-c');
    const sent = await call('squad_backend_send_message', {
      conversationId: 'mcp-c', runId: 'r', seq: 1, content: '', harness: 'claude', correlationId: 'k1',
      parts: [{ type: 'text', text: 'hi' }], extensions: { 'x-claude.mode': 'plan' },
    });
    expect(sent.body).toMatchObject({ runId: 'r', seq: 1, duplicate: false, correlationId: 'k1' });
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r', seq: 1, content: 'again' })).body.duplicate).toBe(true);
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r', seq: 9, content: 'x', extensions: { bad: 1 } })).body.error.code).toBe('invalid-request');
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', seq: 1, content: 'x' })).isError).toBe(true);

    expect((await call('squad_backend_get_turn', { conversationId: 'mcp-c', seq: 1 })).body).toMatchObject({ runId: 'r', state: 'running' });
    expect((await call('squad_backend_get_transcript', { conversationId: 'mcp-c' })).body).toHaveLength(1);

    harness.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'x', hash: 'hh' } });
    expect((await call('squad_backend_get_approvals', { conversationId: 'mcp-c' })).body[0]).toMatchObject({ version: 1, state: 'pending' });
    expect((await call('squad_backend_respond_approval', { conversationId: 'mcp-c', approvalId: 'a1', hash: 'bad', decision: 'approve' })).body.error.code).toBe('approval-hash-mismatch');
    expect((await call('squad_backend_respond_approval', { conversationId: 'mcp-c', approvalId: 'a1', hash: 'hh', decision: 'approve' })).body.state).toBe('running');
    expect((await call('squad_backend_get_approvals', { conversationId: 'mcp-c' })).body[0].version).toBe(2);

    const page = await call('squad_backend_read_events', { conversationId: 'mcp-c', limit: 2 });
    expect(page.body.events).toHaveLength(2);
    const rest = await call('squad_backend_read_events', { conversationId: 'mcp-c', after: page.body.nextCursor, stream: 'control' });
    expect(rest.body.resumable).toBe(true);
    expect(rest.body.events.every((e: BackendEnvelope) => e.stream === 'control')).toBe(true);

    await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r2', seq: 2, content: 'second', harness: 'claude' });
    expect((await call('squad_backend_cancel_turn', { conversationId: 'mcp-c', seq: 2 })).body.state).toBe('cancelled');
    expect((await call('squad_backend_cancel_run', { conversationId: 'mcp-c', runId: 'r', reason: 'stop' })).body).toMatchObject({ runId: 'r', state: 'cancelled' });
    expect((await call('squad_backend_cancel_run', { conversationId: 'mcp-c', runId: 'nope' })).body.error.code).toBe('not-found');
    expect((await call('squad_backend_health')).body).toMatchObject({ ok: true });
  }

  it('over the local backend', async () => {
    const { registry, harnesses } = makeRegistry();
    await drive(new LocalSquadBackend({ harnesses: registry, kind: 'mcp' }), harnesses.claude);
  });

  it('over durable-http', async () => {
    const { registry, harnesses } = makeRegistry();
    const server = createMockDurableSquad(new LocalSquadBackend({ harnesses: registry }));
    await drive(mkHttp(server), harnesses.claude);
  });

  it('createMcpBackend selects durable-http via SQUAD_BACKEND_URL, else local over .squad', async () => {
    const server = createMockDurableSquad(new LocalSquadBackend());
    vi.stubGlobal('fetch', server.fetch);
    try {
      const remote = createMcpBackend('.', { SQUAD_BACKEND_URL: 'http://durable.test', SQUAD_BACKEND_TOKEN: 'tok' });
      expect(remote.kind).toBe('durable-http');
      await remote.createConversation({ conversationId: 'c' });
      expect(server.calls[0]!.headers['Authorization']).toBe('Bearer tok');
    } finally {
      vi.unstubAllGlobals();
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-mcp-'));
    try {
      vi.mocked(resolveSquadState).mockReturnValue({ paths: { teamSquadDir: dir } } as never);
      const local = createMcpBackend('.', {});
      expect(local.kind).toBe('mcp');
      await local.createConversation({ conversationId: 'c' });
      expect(fs.existsSync(path.join(dir, 'backend', 'conversations', 'c.json'))).toBe(true);
      vi.mocked(resolveSquadState).mockReturnValue(null as never);
      expect(() => createMcpBackend('.', {})).toThrow(/No .squad directory/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('createSquadBackend builds each kind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-factory-'));
    try {
      expect(createSquadBackend({ kind: 'local', squadDir: dir }).kind).toBe('local');
      expect(createSquadBackend({ kind: 'mcp', squadDir: dir }).kind).toBe('mcp');
      expect(createSquadBackend({ kind: 'durable-http', baseUrl: 'http://x' }).kind).toBe('durable-http');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Scenario 6: golden conformance trace ────────────────────────────

describe('Scenario 6: golden-trace.json conformance (local and durable-http)', () => {
  const MAPPED: Record<string, string> = {
    TurnAccepted: 'message.accepted',
    ApprovalRequested: 'approval.requested',
    ApprovalDecided: 'approval.resolved',
    CancellationRequested: 'cancellation.requested',
    RunTerminal: 'turn.state',
  };
  const ev = (name: string) => golden.events.find(e => e.event === name)!;

  async function execute(mode: 'local' | 'durable-http') {
    const { registry, harnesses } = makeRegistry();
    const harness = harnesses.copilot;
    const state = new MemoryStateStore();
    const local = new LocalSquadBackend({ state, harnesses: registry });
    const server = createMockDurableSquad(local);
    const connect = (): SquadBackend => (mode === 'local' ? new LocalSquadBackend({ state, harnesses: registry }) : mkHttp(server));
    let client = connect();
    const { conversationId, runId } = golden;
    await client.createConversation({ conversationId });

    const accepted = ev('TurnAccepted');
    const adm = await client.sendMessage(conversationId, msg(runId, accepted['turnSeq'] as number, { harness: 'copilot' }));
    expect(adm).toMatchObject({ runId, seq: accepted['turnSeq'], duplicate: false, state: accepted['state'] });

    const requested = ev('ApprovalRequested');
    harness.emit({ type: 'approval-requested', runId, seq: accepted['turnSeq'] as number, request: {
      approvalId: requested['approvalId'] as string, turnSeq: accepted['turnSeq'] as number,
      action: 'golden', hash: requested['payloadHash'] as string,
    } });
    const [v1] = await client.getApprovals(conversationId);
    expect(v1).toMatchObject({ version: requested['version'], state: requested['status'], scope: { kind: requested['scope'] }, hash: requested['payloadHash'] });

    // disconnect: remember the cursor, drop the client
    const beforeDrop = await client.readEvents(conversationId);
    const cursor = beforeDrop.nextCursor;
    const seen = new Map(beforeDrop.events.map(e => [e.id, e]));
    client = connect();

    // reconnect(cursor): nothing missed, nothing new, resumable; redelivery is deduped by id
    const reconnected = ev('Reconnected');
    const resume = await client.readEvents(conversationId, { after: cursor });
    expect(resume.resumable).toBe(reconnected['resumable']);
    expect(resume.events).toEqual([]);
    expect(resume.lastAcceptedSeq).toBe(beforeDrop.events.at(-1)!.sequence);
    const replay = await client.readEvents(conversationId);
    replay.events.forEach(e => seen.set(e.id, e));
    expect(seen.size).toBe(beforeDrop.events.length);

    const decided = ev('ApprovalDecided');
    const turn = await client.respondApproval(conversationId, {
      approvalId: decided['approvalId'] as string, hash: decided['payloadHash'] as string, decision: 'approve',
    });
    expect(turn.state).toBe('running');
    // at-most-once visible effect: a retried decision does not apply again
    expect((await errorOf(client.respondApproval(conversationId, {
      approvalId: decided['approvalId'] as string, hash: decided['payloadHash'] as string, decision: 'approve',
    })))?.code).toBe('approval-not-pending');

    const cancelled = await client.cancelRun(conversationId, runId, ev('CancellationRequested')['reason'] as string);
    expect(cancelled.state).toBe(golden.expectedTerminalState);
    await client.cancelRun(conversationId, runId);
    expect((await client.sendMessage(conversationId, msg(runId, accepted['turnSeq'] as number, { harness: 'copilot' }))).duplicate).toBe(true);

    const finalPage = await client.readEvents(conversationId);
    const approvals = await client.getApprovals(conversationId);
    return { harness, finalPage, approvals, resume, reconnected, decided };
  }

  it.each(['local', 'durable-http'] as const)('%s: executes the normative trace', async (mode) => {
    const r = await execute(mode);
    const types = r.finalPage.events.map(e => e.type);
    expect(types).toEqual([
      'conversation.created',
      ...golden.events.map(e => MAPPED[e.event]).filter((t): t is string => Boolean(t)),
    ]);

    const byType = (t: string) => r.finalPage.events.find(e => e.type === t)!;
    expect((byType('approval.requested').payload as any).request).toMatchObject({ version: 1, hash: ev('ApprovalRequested')['payloadHash'], scope: { kind: 'turn' } });
    expect(byType('approval.resolved').payload).toMatchObject({ version: 2, approvalId: r.decided['approvalId'], decision: 'approve' });
    expect(r.approvals).toHaveLength(1);
    expect(r.approvals[0]).toMatchObject({ version: 2, state: 'approved', hash: ev('ApprovalDecided')['payloadHash'] });
    expect(byType('cancellation.requested').payload).toMatchObject({ runId: golden.runId, reason: 'user-requested' });
    const terminal = r.finalPage.events.at(-1)!;
    expect(terminal.payload).toMatchObject({ runId: golden.runId, state: golden.expectedTerminalState });
    expect(terminal.causationId).toBe(byType('cancellation.requested').id);

    // reconnect semantics from the fixture
    expect(r.reconnected['resumable']).toBe(true);
    expect(r.resume.resumable).toBe(true);
    expect(r.finalPage.resumable).toBe(true);
    expect(r.finalPage.lastAcceptedSeq).toBe(terminal.sequence);
    expect(r.finalPage.events.map(e => e.sequence)).toEqual(r.finalPage.events.map((_, i) => i + 1));

    // exactly-once harness effects despite retries/redelivery
    expect(r.harness.submitted).toEqual([{ runId: golden.runId, seq: ev('TurnAccepted')['turnSeq'] }]);
    expect(r.harness.approvals).toEqual([ev('ApprovalDecided')['approvalId']]);
    expect(r.harness.cancelled).toEqual([{ runId: golden.runId, seq: ev('TurnAccepted')['turnSeq'] }]);

    // no lease/checkpoint internals leak into client-facing pages or cursors
    const wire = JSON.stringify(r.finalPage);
    expect(wire).not.toMatch(/lease|checkpoint|epoch/i);
    for (const e of r.finalPage.events) {
      expect(Buffer.from(e.cursor!, 'base64url').toString('utf8')).not.toMatch(/lease|checkpoint|epoch/i);
    }
  });

  it('produces identical canonical history on both backends', async () => {
    const local = await execute('local');
    const remote = await execute('durable-http');
    expect(canonical(remote.finalPage.events)).toEqual(canonical(local.finalPage.events));
    expect(remote.finalPage.lastAcceptedSeq).toBe(local.finalPage.lastAcceptedSeq);
    expect(remote.approvals.map(a => a.version)).toEqual(local.approvals.map(a => a.version));
  });
});
