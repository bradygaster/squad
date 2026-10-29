import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// keep the real SDK (squad upgrade code imports much of it); only resolveSquadState is stubbed
vi.mock('@bradygaster/squad-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveSquadState: vi.fn(),
}));

import { resolveSquadState } from '@bradygaster/squad-sdk';
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
  type BackendEnvelope,
  type HarnessAdapter,
  type HarnessEventEnvelope,
  type SquadBackend,
} from '@bradygaster/squad-sdk/backend';
import {
  BLOCK_BEGIN,
  CLIENT_IDS,
  SQUAD_STATE_KEY,
  assertPortableClients,
  getClientAdapter,
  buildCoordinatorInstructions,
  createClientAdapter,
  installClients,
  uninstallClients,
  normalizeClientIds,
  parseClients,
  projectClients,
  resolveEffectiveCapabilities,
  type ClientContext,
  type ClientId,
  type RuntimeBinding,
} from '@bradygaster/squad-sdk/clients';
import {
  backfillCastingRegistryFromTeam,
  ensureCastingRegistryPair,
  normalizeHandwrittenCastingRegistry,
  parseTeamRoster,
  parseAgentProvenanceRegistry,
  readCastingRegistryPair,
  repairHandwrittenCastingRegistry,
} from '@bradygaster/squad-sdk/casting';
import { ensureCastingDefaults, ensureGitattributes, ensureGitignore, runUpgrade } from '../packages/squad-cli/src/cli/core/upgrade.js';
import { isInteractiveSession, runInit } from '../packages/squad-cli/src/cli/core/init.js';
import { persistClients } from '../packages/squad-cli/src/cli/core/clients.js';
import { callBackendMcpTool, createBackendMcpTools, createMcpBackend } from '../packages/squad-cli/src/cli/core/backend-mcp.js';
// Clean-room (exit criterion 3) code is typed strictly against the public subpath barrel.
import type {
  BackendEnvelope as CREnvelope,
  HarnessAdapter as CRHarness,
  HarnessEventEnvelope as CRHarnessEvent,
  SquadBackend as CRBackend,
} from '@bradygaster/squad-sdk/backend';

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
    const leaseEpoch = headers['X-Lease-Epoch'] === undefined ? undefined : Number(headers['X-Lease-Epoch']);
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
        if ((r = /^turns\/(\d+)\/cancel$/.exec(rest)) && method === 'POST') return json(200, await local.cancelTurn(id, Number(r[1]), leaseEpoch));
        if ((r = /^runs\/([^/]+)\/cancel$/.exec(rest)) && method === 'POST') return json(200, await local.cancelRun(id, decodeURIComponent(r[1]!), body?.reason, leaseEpoch));
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
  return new DurableHttpSquadBackend({ baseUrl: 'https://durable.test', token: 't', fetch: server.fetch, retryDelayMs: 1, ...extra });
}

const canonical = (events: BackendEnvelope[]) =>
  events.map(e => ({ type: e.type, stream: e.stream, sequence: e.sequence, payload: e.payload }));

// ── Scenario 1: client projections ──────────────────────────────────

describe('Scenario 1: client projections and --client', () => {
  let root: string;
  const ctx = (over: Partial<ClientContext> = {}): ClientContext => ({
    root,
    mcp: { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] },
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
    // every client wires the squad_state MCP server somewhere (JSON config, TOML table or agent frontmatter)
    const wired = files.filter(f => fs.readFileSync(path.join(root, f.path), 'utf8').includes(SQUAD_STATE_KEY));
    expect(wired.length).toBeGreaterThan(0);
    for (const f of files.filter(f => f.kind === 'json')) {
      expect(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, f.path), 'utf8')))).toContain(SQUAD_STATE_KEY);
    }

    const second = installClients(clients, ctx());
    expect(second.map(r => r.action)).toEqual(second.map(() => 'unchanged'));
  });

  it('projects the host-specific files', () => {
    installClients([...CLIENT_IDS], ctx());
    for (const rel of [
      '.claude/agents/squad.md', 'CLAUDE.md',
      '.kiro/steering/squad.md', '.kiro/agents/squad.json', '.kiro/settings/mcp.json',
      '.opencode/agent/squad.md', 'opencode.json',
      '.cursor/rules/squad.mdc', '.cursor/agents/squad.md', '.cursor/mcp.json',
      '.codex/agents/squad.toml', 'AGENTS.md', '.codex/config.toml',
      '.agents/agents/squad.md', 'GEMINI.md',
    ]) expect(fs.existsSync(path.join(root, rel)), rel).toBe(true);
    expect(fs.readFileSync(path.join(root, '.kiro/steering/squad.md'), 'utf8')).toContain('inclusion: manual');
    expect(fs.readFileSync(path.join(root, '.cursor/rules/squad.mdc'), 'utf8')).toContain('alwaysApply: false');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('.codex/agents/squad.toml');
    // members live in the shared .squad/agents/<name>/charter.md path (like Copilot): no per-member client files by default
    expect(fs.readdirSync(path.join(root, '.claude/agents'))).toEqual(['squad.md']);
    expect(fs.existsSync(path.join(root, '.opencode/agent/data.md'))).toBe(false);
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
    installClients(['claude'], ctx());
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
    const dup = await b.sendMessage('c', msg('r', 1, { harness: 'kiro', epoch: 2 }));
    expect(dup.duplicate).toBe(true);
    expect(await errorOf(b.sendMessage('c', msg('r', 1, { harness: 'kiro', epoch: 2, content: 'changed' })))).toMatchObject({ code: 'conflict', status: 409 });
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
    const old = new DurableHttpSquadBackend({ baseUrl: 'https://old.test', fetch: legacy as unknown as typeof fetch });
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
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r', seq: 1, content: '', harness: 'claude',
      parts: [{ type: 'text', text: 'hi' }], extensions: { 'x-claude.mode': 'plan' } })).body.duplicate).toBe(true);
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r', seq: 1, content: 'again', harness: 'claude' })).body.error).toMatchObject({ code: 'conflict' });
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', runId: 'r', seq: 9, content: 'x', harness: 'claude', extensions: { bad: 1 } })).body.error.code).toBe('invalid-request');
    expect((await call('squad_backend_send_message', { conversationId: 'mcp-c', seq: 1, content: 'x', harness: 'claude' })).isError).toBe(true);

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

  it('R3-9: createMcpBackend honors a configured (non-local) state backend instead of writing .squad/backend', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-mcp-orphan-'));
    try {
      const files = new Map<string, string>();
      const orphan = {
        name: 'orphan',
        read: (p: string) => files.get(p),
        write: (p: string, c: string) => { files.set(p, c); },
        exists: (p: string) => files.has(p),
        list: (d: string) => [...files.keys()].filter(k => k.startsWith(`${d}/`)).map(k => k.slice(d.length + 1)),
      };
      const backend = createMcpBackend('.', {}, () => ({ paths: { teamSquadDir: dir }, backend: orphan }) as never);
      await backend.createConversation({ conversationId: 'c' });
      await backend.sendMessage('c', msg('r', 1));
      expect([...files.keys()]).toContain('backend/conversations/c.json');
      expect(fs.existsSync(path.join(dir, 'backend'))).toBe(false);
      expect((await createMcpBackend('.', {}, () => ({ paths: { teamSquadDir: dir }, backend: orphan }) as never).getTranscript('c'))).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('createMcpBackend selects durable-http via SQUAD_BACKEND_URL, else local over .squad', async () => {
    const server = createMockDurableSquad(new LocalSquadBackend());
    vi.stubGlobal('fetch', server.fetch);
    try {
      const remote = createMcpBackend('.', { SQUAD_BACKEND_URL: 'https://durable.test', SQUAD_BACKEND_TOKEN: 'tok' });
      expect(remote.kind).toBe('durable-http');
      await remote.createConversation({ conversationId: 'c' });
      expect(server.calls[0]!.headers['Authorization']).toBe('Bearer tok');
    } finally {
      vi.unstubAllGlobals();
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-mcp-'));
    try {
      vi.mocked(resolveSquadState).mockReturnValue({ paths: { teamSquadDir: dir }, backend: { name: 'local' } } as never);
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
      expect(createSquadBackend({ kind: 'durable-http', baseUrl: 'https://x' }).kind).toBe('durable-http');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Scenario 6: golden conformance trace ────────────────────────────

describe('Scenario 6: golden-trace.json conformance (local and durable-http)', () => {
  // fixture event names are the real BackendEnvelope.type values; `client.*` entries are client-side steps
  const backendEvents = () => golden.events.filter(e => !e.event.startsWith('client.'));
  const ev = (name: string) => golden.events.find(e => e.event === name)!;

  async function execute(mode: 'local' | 'durable-http') {
    const { registry, harnesses } = makeRegistry();
    const harness = harnesses.copilot;
    const state = new MemoryStateStore();
    const local = new LocalSquadBackend({ state, harnesses: registry });
    const server = createMockDurableSquad(local);
    const connect = (): SquadBackend => (mode === 'local' ? new LocalSquadBackend({ state, harnesses: registry }) : mkHttp(server, { epoch: 1 }));
    let client = connect();
    const { conversationId, runId } = golden;
    await client.createConversation({ conversationId });

    const accepted = ev('message.accepted');
    const adm = await client.sendMessage(conversationId, msg(runId, accepted['turnSeq'] as number, { harness: 'copilot' }));
    expect(adm).toMatchObject({ runId, seq: accepted['turnSeq'], duplicate: false, state: accepted['state'] });

    const requested = ev('approval.requested');
    harness.emit({ type: 'approval-requested', runId, seq: accepted['turnSeq'] as number, request: {
      approvalId: requested['approvalId'] as string, turnSeq: accepted['turnSeq'] as number,
      action: 'golden', hash: requested['hash'] as string,
    } });
    const [v1] = await client.getApprovals(conversationId);
    expect(v1).toMatchObject({ version: requested['version'], state: requested['state'], scope: { kind: requested['scope'] }, hash: requested['hash'] });

    // disconnect: remember the cursor, drop the client
    const beforeDrop = await client.readEvents(conversationId);
    const cursor = beforeDrop.nextCursor;
    const seen = new Map(beforeDrop.events.map(e => [e.id, e]));
    client = connect();

    // reconnect(cursor): nothing missed, nothing new, resumable; redelivery is deduped by id
    const reconnected = ev('client.reconnected');
    const resume = await client.readEvents(conversationId, { after: cursor });
    expect(resume.resumable).toBe(reconnected['resumable']);
    expect(resume.events).toEqual([]);
    expect(resume.lastAcceptedSeq).toBe(beforeDrop.events.at(-1)!.sequence);
    const replay = await client.readEvents(conversationId);
    replay.events.forEach(e => seen.set(e.id, e));
    expect(seen.size).toBe(beforeDrop.events.length);

    const decided = ev('approval.resolved');
    const turn = await client.respondApproval(conversationId, {
      approvalId: decided['approvalId'] as string, hash: decided['hash'] as string, decision: decided['decision'] as 'approve',
    });
    expect(turn.state).toBe('running');
    // at-most-once visible effect: a retried decision does not apply again
    expect((await errorOf(client.respondApproval(conversationId, {
      approvalId: decided['approvalId'] as string, hash: decided['hash'] as string, decision: 'approve',
    })))?.code).toBe('approval-not-pending');

    const cancelled = await client.cancelRun(conversationId, runId, ev('cancellation.requested')['reason'] as string);
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
    expect(types).toEqual(['conversation.created', ...backendEvents().map(e => e.event)]);

    const byType = (t: string) => r.finalPage.events.find(e => e.type === t)!;
    expect((byType('approval.requested').payload as any).request).toMatchObject({ version: 1, hash: ev('approval.requested')['hash'], scope: { kind: 'turn' } });
    expect(byType('approval.resolved').payload).toMatchObject({ version: 2, approvalId: r.decided['approvalId'], decision: 'approve' });
    expect(r.approvals).toHaveLength(1);
    expect(r.approvals[0]).toMatchObject({ version: 2, state: r.decided['state'], hash: ev('approval.resolved')['hash'] });
    expect(byType('cancellation.requested').payload).toMatchObject({ runId: golden.runId, reason: 'user-requested' });
    const terminal = r.finalPage.events.at(-1)!;
    expect(terminal.type).toBe('turn.state');
    expect(terminal.payload).toMatchObject({ runId: golden.runId, state: golden.expectedTerminalState });
    expect(terminal.causationId).toBe(byType('cancellation.requested').id);

    // reconnect semantics from the fixture
    expect(r.reconnected['resumable']).toBe(true);
    expect(r.resume.resumable).toBe(true);
    expect(r.finalPage.resumable).toBe(true);
    expect(r.finalPage.lastAcceptedSeq).toBe(terminal.sequence);
    expect(r.finalPage.events.map(e => e.sequence)).toEqual(r.finalPage.events.map((_, i) => i + 1));

    // exactly-once harness effects despite retries/redelivery
    expect(r.harness.submitted).toEqual([{ runId: golden.runId, seq: ev('message.accepted')['turnSeq'] }]);
    expect(r.harness.approvals).toEqual([ev('approval.resolved')['approvalId']]);
    expect(r.harness.cancelled).toEqual([{ runId: golden.runId, seq: ev('message.accepted')['turnSeq'] }]);

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

// ── RC1 → stable exit criterion 1: upgrade / rollback from v0.1 ─────

describe('RC1→stable exit 1: upgrade and rollback from a v0.1 workspace', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const walk = (dir: string, base = ''): string[] =>
    fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap(d =>
      d.isDirectory() ? walk(dir, path.posix.join(base, d.name)) : [path.posix.join(base, d.name)]);
  /** Byte snapshot of the workspace; JSON compared semantically. */
  const snapshot = () => new Map(walk(root).sort().map(rel => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return [rel, rel.endsWith('.json') ? JSON.stringify(JSON.parse(text)) : text] as const;
  }));
  const ctx = (): ClientContext => ({
    root,
    mcp: { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] },
  });
  const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

  const customServers = {
    custom: { command: 'node', args: ['server.js'], env: { TOKEN_REF: 'from-env' } },
    remote: { url: 'https://example.test/mcp' },
  };

  function seedV01() {
    write('.squad/config.json', JSON.stringify({ version: '0.1', stateBackend: 'local' }, null, 2) + '\n');
    write('.squad/team.md', '# Team\n\n| Name | Role |\n|---|---|\n| Data | Framework Expert |\n');
    write('.squad/decisions.md', '# Decisions\n\n- keep this\n');
    write('.squad/agents/data/charter.md', '# Data\n');
    write('.squad/agents/data/history.md', '# History\n\n- learned things\n');
    write('.mcp.json', JSON.stringify({ mcpServers: customServers }, null, 2) + '\n');
    write('.cursor/mcp.json', JSON.stringify({ mcpServers: { custom: customServers.custom } }, null, 2) + '\n');
    write('.kiro/settings/mcp.json', JSON.stringify({ mcpServers: { remote: customServers.remote } }, null, 2) + '\n');
    write('opencode.json', JSON.stringify({ model: 'my-model', mcp: { custom: { type: 'local', command: ['node', 'x.js'] } } }, null, 2) + '\n');
    write('CLAUDE.md', '# My project\n\nHand-written notes.\n');
  }

  const upgrade = () => {
    const results = installClients([...CLIENT_IDS], ctx());
    const cfgPath = path.join(root, '.squad/config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.clients = normalizeClientIds([...CLIENT_IDS]).clients;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    return results;
  };
  const rollback = (clients: readonly ClientId[] = CLIENT_IDS) => uninstallClients(clients, ctx());

  it('upgrades v0.1 to all five client projections without touching .squad state or custom servers', () => {
    seedV01();
    const before = snapshot();
    expect(readJson('.squad/config.json').clients).toBeUndefined();
    expect(normalizeClientIds(readJson('.squad/config.json').clients).clients).toEqual([]);

    expect(upgrade().every(r => r.action !== 'error')).toBe(true);
    const after = snapshot();
    for (const [rel, body] of before) {
      if (rel.startsWith('.squad/') && rel !== '.squad/config.json') expect(after.get(rel), rel).toBe(body);
    }
    expect(readJson('.squad/config.json')).toMatchObject({ version: '0.1', stateBackend: 'local', clients: [...CLIENT_IDS] });
    for (const f of projectClients([...CLIENT_IDS], ctx())) expect(fs.existsSync(path.join(root, f.path)), f.path).toBe(true);

    expect(readJson('.mcp.json').mcpServers).toMatchObject({ ...customServers, [SQUAD_STATE_KEY]: expect.anything() });
    expect(readJson('.cursor/mcp.json').mcpServers.custom).toEqual(customServers.custom);
    expect(readJson('.kiro/settings/mcp.json').mcpServers.remote).toEqual(customServers.remote);
    expect(readJson('opencode.json').model).toBe('my-model');
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').startsWith('# My project\n\nHand-written notes.\n')).toBe(true);

    expect(upgrade().map(r => r.action)).toEqual(installClients([...CLIENT_IDS], ctx()).map(() => 'unchanged'));
  });

  it('rolls back to the exact pre-upgrade workspace', () => {
    seedV01();
    const before = snapshot();
    upgrade();
    const results = rollback();
    expect(results.some(r => r.action === 'error')).toBe(false);

    const cfgPath = path.join(root, '.squad/config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    delete cfg.clients;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

    expect(snapshot()).toEqual(before);
    expect(readJson('.mcp.json').mcpServers).toEqual(customServers);
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.kiro/steering'))).toBe(false);
    expect(rollback().every(r => r.action === 'unchanged')).toBe(true); // idempotent
  });

  it('rolls back a single client and leaves the others intact', () => {
    seedV01();
    upgrade();
    rollback(['claude']);
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe('# My project\n\nHand-written notes.\n');
    expect(readJson('.mcp.json').mcpServers).toEqual(customServers);
    expect(fs.existsSync(path.join(root, '.kiro/agents/squad.json'))).toBe(true);
    expect(readJson('.cursor/mcp.json').mcpServers[SQUAD_STATE_KEY]).toBeDefined();
    expect(fs.existsSync(path.join(root, '.squad/agents/data/history.md'))).toBe(true);
  });

  it('removes files the upgrade created from scratch and never deletes user files', () => {
    write('.squad/config.json', '{}\n');
    write('notes.txt', 'mine\n');
    const before = snapshot();
    installClients([...CLIENT_IDS], ctx());
    expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
    rollback();
    expect(snapshot()).toEqual(before);
  });

  it('refuses to rewrite malformed user JSON during rollback', () => {
    seedV01();
    upgrade();
    fs.writeFileSync(path.join(root, '.mcp.json'), '{ broken');
    const results = rollback(['claude']);
    expect(results.find(r => r.path === '.mcp.json')!.action).toBe('error');
    expect(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe('{ broken');
  });
});

// ── RC1 → stable exit criterion 2: restart and partial-delivery faults ──

describe('RC1→stable exit 2: restart and partial-delivery fault injection', () => {
  /** Client-side reassembly: dedupe by id, order by sequence, require contiguity from 1. */
  const reassemble = (events: BackendEnvelope[]) => {
    const byId = new Map(events.map(e => [e.id, e]));
    const list = [...byId.values()].sort((a, b) => a.sequence! - b.sequence!);
    list.forEach((e, i) => expect(e.sequence, `gap or duplicate at index ${i}`).toBe(i + 1));
    return list;
  };

  /** Drain with partial pages, returning every page for later replay/shuffling. */
  async function drain(client: SquadBackend, id: string, limit: number, after?: string) {
    const pages: BackendEnvelope[][] = [];
    let cursor = after;
    for (;;) {
      const page = await client.readEvents(id, { after: cursor, limit });
      expect(page.events.length).toBeLessThanOrEqual(limit);
      if (page.events.length === 0) return { pages, cursor, last: page };
      pages.push(page.events);
      cursor = page.nextCursor;
    }
  }

  const snapshotStore = (state: MemoryStateStore): MemoryStateStore => {
    const copy = new MemoryStateStore();
    for (const name of state.list('backend/conversations')) {
      const rel = `backend/conversations/${name}`;
      copy.write(rel, JSON.stringify(JSON.parse(state.read(rel)!)));
    }
    return copy;
  };

  it('keeps sequence continuity under partial pages, duplicate and out-of-order redelivery', async () => {
    const { registry, harnesses } = makeRegistry();
    const h = harnesses.copilot;
    const b = new LocalSquadBackend({ harnesses: registry });
    await b.createConversation({ conversationId: 'c' });
    for (const [run, seq] of [['r1', 1], ['r2', 2], ['r3', 3]] as const) await b.sendMessage('c', msg(run, seq, { harness: 'copilot' }));

    // duplicate command delivery, concurrently
    const dups = await Promise.all([1, 2, 3].map(() => b.sendMessage('c', msg('r1', 1, { harness: 'copilot' }))));
    expect(dups.every(d => d.duplicate)).toBe(true);
    expect(h.submitted).toEqual([{ runId: 'r1', seq: 1 }, { runId: 'r2', seq: 2 }, { runId: 'r3', seq: 3 }]);

    // at-least-once harness delivery: every event twice, approval three times
    const approval = { type: 'approval-requested' as const, runId: 'r1', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'x', hash: 'h1' } };
    h.emit(approval); h.emit(approval); h.emit(approval);
    const reply = { type: 'message' as const, runId: 'r2', seq: 2, message: { runId: 'r2', seq: 20, role: 'assistant' as const, content: 'partial' } };
    h.emit(reply); h.emit(reply);
    const task = { type: 'task' as const, runId: 'r3', seq: 3, id: 't1', state: 'running' as const, title: 'T' };
    h.emit(task); h.emit(task);
    h.emit({ type: 'state', runId: 'r2', seq: 2, state: 'completed' });
    h.emit({ type: 'state', runId: 'r2', seq: 2, state: 'completed' });
    // out of order: late events for a terminal turn, and a stale 'running' for an awaiting turn
    h.emit({ type: 'message', runId: 'r2', seq: 2, message: { runId: 'r2', seq: 21, role: 'assistant', content: 'too late' } });
    h.emit({ type: 'state', runId: 'r1', seq: 1, state: 'running' });

    expect(await b.getApprovals('c')).toHaveLength(1);
    expect((await b.getTurn('c', 1)).state).toBe('awaiting-approval');
    expect((await b.getTranscript('c')).filter(m => m.content === 'partial')).toHaveLength(1);
    expect((await b.getTranscript('c')).some(m => m.content === 'too late')).toBe(false);

    const full = (await b.readEvents('c')).events;
    const types = full.map(e => e.type);
    expect(types.filter(t => t === 'approval.requested')).toHaveLength(1);
    expect(types.filter(t => t === 'turn.state')).toHaveLength(1);

    // partial pages (limit 2) reassemble to the same canonical history
    const { pages } = await drain(b, 'c', 2);
    expect(pages.every(p => p.length <= 2)).toBe(true);
    expect(pages.length).toBeGreaterThan(2);
    expect(canonical(reassemble(pages.flat()))).toEqual(canonical(full));

    // duplicate + reversed + shuffled delivery of those pages still reassembles identically
    const delivered = [...pages.slice().reverse().map(p => p.slice().reverse()), ...pages, pages[0]!];
    expect(canonical(reassemble(delivered.flat()))).toEqual(canonical(full));

    // decisions retried after the approval resolves are not applied twice
    await b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' });
    expect((await errorOf(b.respondApproval('c', { approvalId: 'a1', hash: 'h1', decision: 'approve' })))?.code).toBe('approval-not-pending');
    expect(h.approvals).toEqual(['a1']);
  });

  it('survives a broker restart with an approval in flight', async () => {
    const stateA = new MemoryStateStore();
    const a = makeRegistry();
    const brokerA = new LocalSquadBackend({ state: stateA, harnesses: a.registry });
    await brokerA.createConversation({ conversationId: 'c' });
    await brokerA.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    a.harnesses.copilot.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'deploy', hash: 'hh' } });

    // client has consumed only part of the stream before the crash
    const firstPage = await brokerA.readEvents('c', { limit: 2 });
    expect(firstPage.events.map(e => e.sequence)).toEqual([1, 2]);
    const heldCursor = firstPage.nextCursor;

    // restart: fresh broker rehydrated from the persisted snapshot; harness reconnects as a new process
    const b = makeRegistry();
    const brokerB = new LocalSquadBackend({ state: snapshotStore(stateA), harnesses: b.registry });
    const resumed = await brokerB.readEvents('c', { after: heldCursor, limit: 10 });
    expect(resumed.resumable).toBe(true);
    expect(resumed.events.map(e => e.sequence)).toEqual([3]);
    expect(resumed.events[0]!.type).toBe('approval.requested');
    expect(resumed.lastAcceptedSeq).toBe(3);
    expect(canonical(reassemble([...firstPage.events, ...resumed.events]))).toEqual(canonical((await brokerA.readEvents('c')).events));

    // approval survived the restart as a durable resource; nothing was resubmitted
    expect(await brokerB.getApprovals('c')).toMatchObject([{ approvalId: 'a1', version: 1, state: 'pending', hash: 'hh' }]);
    expect((await brokerB.getTurn('c', 1)).state).toBe('awaiting-approval');
    expect((await brokerB.sendMessage('c', msg('r', 1, { harness: 'copilot' }))).duplicate).toBe(true);
    expect(b.harnesses.copilot.submitted).toEqual([]);

    // decision after restart reaches the NEW harness exactly once; tampering is still rejected
    expect((await errorOf(brokerB.respondApproval('c', { approvalId: 'a1', hash: 'bad', decision: 'approve' })))?.code).toBe('approval-hash-mismatch');
    await brokerB.respondApproval('c', { approvalId: 'a1', hash: 'hh', decision: 'approve' });
    expect((await errorOf(brokerB.respondApproval('c', { approvalId: 'a1', hash: 'hh', decision: 'approve' })))?.code).toBe('approval-not-pending');
    expect(b.harnesses.copilot.approvals).toEqual(['a1']);
    expect(a.harnesses.copilot.approvals).toEqual([]);

    // the reconnected harness keeps streaming into the rehydrated broker, duplicates included
    const done = { type: 'message' as const, runId: 'r', seq: 1, message: { runId: 'r', seq: 2, role: 'assistant' as const, content: 'shipped' } };
    b.harnesses.copilot.emit(done); b.harnesses.copilot.emit(done);
    b.harnesses.copilot.emit({ type: 'state', runId: 'r', seq: 1, state: 'completed' });
    // the dead broker's harness cannot corrupt the new store
    a.harnesses.copilot.emit({ type: 'state', runId: 'r', seq: 1, state: 'failed' });

    const finalEvents = reassemble((await brokerB.readEvents('c')).events);
    expect(finalEvents.map(e => e.type)).toEqual([
      'conversation.created', 'message.accepted', 'approval.requested', 'approval.resolved', 'harness.message', 'turn.state',
    ]);
    expect(finalEvents.slice(0, 3).map(e => e.id)).toEqual((await brokerA.readEvents('c')).events.slice(0, 3).map(e => e.id));
    expect((await brokerB.getTurn('c', 1)).state).toBe('completed');
    expect((await brokerB.getApprovals('c'))[0]).toMatchObject({ version: 2, state: 'approved' });
    expect((await brokerB.getTranscript('c')).filter(m => m.content === 'shipped')).toHaveLength(1);
  });

  it('recovers a lost response and transient 503s mid-stream over durable-http without duplicate effects', async () => {
    const { registry, harnesses } = makeRegistry();
    const local = new LocalSquadBackend({ harnesses: registry });
    const server = createMockDurableSquad(local);
    let dropNext = true;
    const lossy = (async (url: string, init?: RequestInit) => {
      const res = await server.fetch(url, init as RequestInit);
      if (dropNext && init?.method === 'POST' && url.endsWith('/messages')) {
        dropNext = false;
        throw new TypeError('connection reset after server processed the request');
      }
      return res;
    }) as unknown as typeof fetch;
    const client = mkHttp(server, { fetch: lossy });

    await client.createConversation({ conversationId: 'c' });
    const adm = await client.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(adm.duplicate).toBe(true); // the retry hit the server's idempotency record
    expect(harnesses.copilot.submitted).toEqual([{ runId: 'r', seq: 1 }]);
    expect(await client.getTranscript('c')).toHaveLength(1);
    expect(server.calls.filter(c => c.path.endsWith('/messages')).map(c => c.headers['Idempotency-Key'])).toEqual(['r:1', 'r:1']);

    harnesses.copilot.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a1', turnSeq: 1, action: 'x', hash: 'h' } });
    server.failures.set('GET /v1/conversations/c/events', { status: 503, remaining: 2 });
    const { pages } = await drain(client, 'c', 2);
    expect(pages.every(p => p.length <= 2)).toBe(true);
    const events = reassemble(pages.flat());
    expect(events.map(e => e.type)).toEqual(['conversation.created', 'message.accepted', 'approval.requested']);

    // a fresh client (new connection) resumes from a mid-stream cursor with identical results
    const reconnect = mkHttp(server);
    const tail = await reconnect.readEvents('c', { after: pages[0]!.at(-1)!.cursor });
    expect(tail.events.map(e => e.sequence)).toEqual([3]);
    expect(tail).toMatchObject({ resumable: true, lastAcceptedSeq: 3 });
  });
});

// ── RC1 → stable exit criterion 3: clean-room client + harness ──────

describe('RC1→stable exit 3: clean-room client and harness against the public contract', () => {
  /** Harness written only against the public HarnessAdapter type. */
  class CleanRoomHarness implements CRHarness {
    readonly id = 'cleanroom';
    readonly capabilities = { streaming: true, approvals: true, cancellation: true, tools: false, extensionNamespaces: ['x-cleanroom'] };
    effects = { submits: 0, approvals: [] as string[], cancels: 0 };
    private listeners = new Set<(e: CRHarnessEvent) => void>();
    constructor(private readonly approval: { approvalId: string; hash: string }) {}
    async submit(s: { runId: string; seq: number }) {
      this.effects.submits++;
      for (const l of this.listeners) {
        l({ type: 'approval-requested', runId: s.runId, seq: s.seq, request: { approvalId: this.approval.approvalId, turnSeq: s.seq, action: 'clean-room', hash: this.approval.hash } });
      }
    }
    subscribe(_conversationId: string, listener: (e: CRHarnessEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    async cancel() { this.effects.cancels++; }
    async respondApproval(_c: string, r: { approvalId: string }) { this.effects.approvals.push(r.approvalId); }
    describe() { return { id: this.id, capabilities: this.capabilities }; }
  }

  /** Client that drives a recorded conformance trace using nothing but SquadBackend. */
  async function runFixture(connect: () => CRBackend, trace: typeof golden) {
    const seen = new Map<string, CREnvelope>();
    let cursor: string | undefined;
    const pull = async (c: CRBackend) => {
      let last = { resumable: false, lastAcceptedSeq: 0 };
      for (;;) {
        const page = await c.readEvents(trace.conversationId, { after: cursor, limit: 2 });
        last = { resumable: page.resumable, lastAcceptedSeq: page.lastAcceptedSeq };
        if (page.events.length === 0) return last;
        page.events.forEach(e => seen.set(e.id, e));
        cursor = page.nextCursor;
      }
    };
    const maxSeq = () => Math.max(0, ...[...seen.values()].map(e => e.sequence ?? 0));
    let client: CRBackend | null = connect();
    const reconnects: Array<{ resumable: boolean; lastAcceptedSeq: number; seenBefore: number }> = [];
    let beforeDrop = 0;
    let terminal = '';
    for (const e of trace.events) {
      switch (e.event) {
        case 'message.accepted': {
          await client!.createConversation({ conversationId: trace.conversationId });
          const adm = await client!.sendMessage(trace.conversationId, {
            runId: e['runId'] as string, seq: e['turnSeq'] as number, role: 'user', content: 'go', harness: 'cleanroom',
            extensions: { 'x-cleanroom.trace': trace.runId },
          });
          expect(adm.duplicate).toBe(false);
          await pull(client!);
          break;
        }
        case 'approval.requested':
          await pull(client!);
          break;
        case 'client.disconnected':
          beforeDrop = maxSeq();
          client = null;
          break;
        case 'client.reconnected': {
          client = connect();
          const meta = await pull(client);
          reconnects.push({ ...meta, seenBefore: beforeDrop });
          break;
        }
        case 'approval.resolved':
          await client!.respondApproval(trace.conversationId, { approvalId: e['approvalId'] as string, hash: e['hash'] as string, decision: e['decision'] as 'approve' });
          await pull(client!);
          break;
        case 'cancellation.requested':
          await client!.cancelRun(trace.conversationId, e['runId'] as string, e['reason'] as string);
          await pull(client!);
          break;
        case 'turn.state': {
          const turn = await client!.getTurn(trace.conversationId, (trace.events[0]!['turnSeq'] as number));
          terminal = turn.state;
          await pull(client!);
          break;
        }
        default:
          throw new Error(`golden-trace.json contains an event the runner does not understand: ${e.event}`);
      }
    }
    const events = [...seen.values()].sort((a, b) => a.sequence! - b.sequence!);
    events.forEach((e, i) => expect(e.sequence).toBe(i + 1));
    const approvals = await client!.getApprovals(trace.conversationId);
    return { events, reconnects, terminal, approvals };
  }

  const ev = (name: string) => golden.events.find(e => e.event === name)!;

  it('exposes the required runtime surface through the public package exports', async () => {
    const rootIndexSrc = fs.readFileSync(path.resolve(__dirname, '..', 'packages/squad-sdk/src/index.ts'), 'utf8');
    const backendPkg = await import('@bradygaster/squad-sdk/backend');
    const clientsPkg = await import('@bradygaster/squad-sdk/clients');
    expect(BACKEND_CONTRACT_STAGE).toBe('experimental');
    expect(backendPkg.BACKEND_CONTRACT_STAGE).toBe('experimental');
    expect(rootIndexSrc).not.toMatch(/\.\/backend\//);
    for (const name of ['createSquadBackend', 'LocalSquadBackend', 'DurableHttpSquadBackend', 'DefaultHarnessRegistry', 'BackendError',
      'BACKEND_PROTOCOL_VERSION', 'BACKEND_CAPABILITIES', 'intersectCapabilities', 'validateExtensions']) {
      expect(backendPkg, name).toHaveProperty(name);
    }
    for (const name of ['CLIENT_IDS', 'getClientAdapter', 'installClients', 'uninstallClients', 'resolveEffectiveCapabilities', 'normalizeClientIds', 'parseClients']) {
      expect(clientsPkg, name).toHaveProperty(name);
    }
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'packages/squad-sdk/package.json'), 'utf8'));
    expect(pkg.exports['./backend'].import).toBe('./dist/backend/index.js');
    expect(pkg.exports['./clients'].import).toBe('./dist/clients/index.js');
  });

  it('declares capabilities per matrix and negotiates the expected intersection for all five clients', async () => {
    const { createSquadBackend: create } = await import('@bradygaster/squad-sdk/backend');
    const { getClientAdapter: adapterOf, CLIENT_IDS: ids } = await import('@bradygaster/squad-sdk/clients');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-cleanroom-caps-'));
    try {
      const backend = create({ kind: 'local', squadDir: dir });
      for (const id of ids) {
        const declared = matrix.clients[id]!.clientCapabilities;
        const neg = await backend.negotiate({ protocols: ['2.0'], clientName: adapterOf(id).label, capabilities: declared, policyCapabilities: matrix.policyCapabilities });
        expect(neg.effectiveCapabilities).toEqual(matrix.clients[id]!.effectiveCapabilities);
        expect(neg.backendCapabilities).toEqual(matrix.backendCapabilities);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['file-backed local', 'durable-http'] as const)('executes golden-trace.json end to end (%s)', async (mode) => {
    const { createSquadBackend: create, DefaultHarnessRegistry: Registry } = await import('@bradygaster/squad-sdk/backend');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-cleanroom-'));
    try {
      const approval = ev('approval.requested');
      const harness = new CleanRoomHarness({ approvalId: approval['approvalId'] as string, hash: approval['hash'] as string });
      const harnesses = new Registry();
      harnesses.register(harness);
      let connect: () => CRBackend;
      if (mode === 'file-backed local') {
        connect = () => create({ kind: 'local', squadDir: dir, harnesses });
      } else {
        const server = createMockDurableSquad(create({ kind: 'local', squadDir: dir, harnesses }) as LocalSquadBackend);
        connect = () => mkHttp(server, { epoch: 1 });
      }
      const r = await runFixture(connect, golden);

      // the canonical history is exactly the fixture's, in order (client-side steps aside); no name translation needed
      const expectedTypes = golden.events.map(e => e.event).filter(n => !n.startsWith('client.'));
      expect(r.events.map(e => e.type).filter(t => t !== 'conversation.created')).toEqual(expectedTypes);
      const by = (type: string) => r.events.find(e => e.type === type)!;
      const requested = ev('approval.requested');
      const decided = ev('approval.resolved');
      expect((by('approval.requested').payload as any).request).toMatchObject({
        approvalId: requested['approvalId'], version: requested['version'], hash: requested['hash'], scope: { kind: requested['scope'] },
      });
      expect(by('approval.resolved').payload).toMatchObject({ approvalId: decided['approvalId'], version: decided['version'], decision: decided['decision'] });
      expect(r.approvals).toHaveLength(1);
      expect(r.approvals[0]).toMatchObject({ version: decided['version'], state: decided['state'] });
      expect(by('cancellation.requested').payload).toMatchObject({ runId: golden.runId, reason: ev('cancellation.requested')['reason'] });
      expect(r.terminal).toBe(golden.expectedTerminalState);
      expect(by('turn.state').payload).toMatchObject({ runId: golden.runId, state: golden.expectedTerminalState });

      // reconnect semantics from the fixture
      const reconnected = ev('client.reconnected');
      expect(r.reconnects).toHaveLength(1);
      expect(r.reconnects[0]!.resumable).toBe(reconnected['resumable']);
      expect(r.reconnects[0]!.seenBefore).toBe(by('approval.requested').sequence);

      // each side effect happened exactly once, and nothing internal leaked
      expect(harness.effects).toEqual({ submits: 1, approvals: [decided['approvalId']], cancels: 1 });
      expect(JSON.stringify(r.events)).not.toMatch(/lease|checkpoint|epoch/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Real-model findings: coordinator prompt regressions ─────────────

describe('coordinator prompt (found with real models)', () => {
  it.each(CLIENT_IDS)('%s: Init Mode is guarded, state-tool based and never re-casts an existing team', (id) => {
    const text = buildCoordinatorInstructions(id);
    // real run: opencode's Glob skips dot-dirs, concluded "no team" and overwrote team.md
    expect(text).toMatch(/Init Mode \(only when there is truly no team\)/);
    expect(text).toMatch(/squad_state_read.{0,12} of .{0,3}team\.md/);
    expect(text).toMatch(/(NOT|NEVER) with glob\/(grep\/)?search tools/);
    expect(text).toMatch(/dot-directories/);
    expect(text).toMatch(/NEVER overwrite or re-cast/);
  });

  it.each(CLIENT_IDS)('%s: distinguishes mutable state from static team config', (id) => {
    const text = buildCoordinatorInstructions(id);
    // real run: models tried squad_state_write for team.md/routing.md/charters and were rejected
    expect(text).toMatch(/Static team config is the exception/);
    for (const f of ['team.md', 'routing.md', 'config.json', 'charter.md']) expect(text).toContain(f);
    expect(text).toMatch(/state tools? reject|reject writes/i);
  });
});
describe('field findings from the live demo: Init Mode, scratch files, casting registry', () => {
  it.each(CLIENT_IDS)('%s: non-interactive Init Mode casts immediately and registers the roster with squad cast --name', (id) => {
    const text = buildCoordinatorInstructions(id);
    // live finding: `claude -p "... proceed ..."` still paused to ask for confirmation
    expect(text).toMatch(/Auto-confirm \(default\)/);
    expect(text).toMatch(/Do NOT stop to ask questions in Init Mode/);
    expect(text).toMatch(/SAME turn/);
    expect(text).toMatch(/headless/);
    // members are cast into the shared .squad/agents path and registered with the CLI, not projected per client
    expect(text).toMatch(/tell the user to upgrade the squad CLI instead of hand-writing the team/);
    expect(text).toMatch(/`npx squad cast --name <Name> --role/);
  });

  it.each(CLIENT_IDS)('%s: keeps scratch files inside the workspace', (id) => {
    const text = buildCoordinatorInstructions(id);
    // live finding: OpenCode rejected a subagent call that touched OS %TEMP%
    expect(text).toMatch(/Scratch space/);
    expect(text).toMatch(/never write outside the workspace directory/);
    expect(text).toMatch(/external-directory access/);
  });

  it.each(CLIENT_IDS)('%s: casts through the CLI and forbids hand-written casting files', (id) => {
    const text = buildCoordinatorInstructions(id);
    // live finding: LLM-handwritten casting/registry.json broke `squad upgrade`
    expect(text).toMatch(/npx squad cast --name <Name> --role/);
    expect(text).toMatch(/NEVER hand-write or edit anything under .{0,20}casting\//);
    expect(text).toContain('registry-history.commit.json');
  });
  describe('handwritten casting/registry.json is repaired instead of crashing squad upgrade', () => {
    const shapes: Record<string, unknown> = {
      'role-keyed entries without a wrapper': {
        lead: { name: 'Avery', status: 'active' },
        backend: { name: 'Nova', role: 'Backend Developer' },
        tester: { name: 'Quinn' },
      },
      'agents as an array': { universe: 'Star Trek', agents: [{ name: 'Data', role: 'Expert' }, { name: "B'Elanna", role: 'Engineer', status: 'ACTIVE' }] },
      'simplified object with version and name/role/status': {
        version: 1, universe: 'Squad', agents: { avery: { name: 'Avery', role: 'Lead', status: 'active' }, nova: { name: 'Nova', role: 'Dev', status: 'weird' } },
      },
      'bare array': [{ name: 'Ada', role: 'Core' }, { name: 'Linus', role: 'CLI' }],
    };
    let castingDir: string;
    beforeEach(() => { castingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-casting-')); });
    afterEach(() => { fs.rmSync(castingDir, { recursive: true, force: true }); });
    const write = (name: string, body: unknown) =>
      fs.writeFileSync(path.join(castingDir, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2));

    it.each(Object.keys(shapes))('normalizes: %s', (name) => {
      const result = normalizeHandwrittenCastingRegistry(shapes[name], '2026-10-18T00:00:00.000Z');
      expect(result.dropped).toEqual([]);
      expect(result.reason).toBeUndefined();
      const reg = result.registry!;
      expect(reg).toBeDefined();
      const parsed = parseAgentProvenanceRegistry(reg);
      expect(parsed.completeness).toBe('complete');
      for (const [id, rec] of Object.entries(reg.agents)) {
        expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(rec.persistent_name).toBe(rec.display_name);
        expect(['active', 'inactive', 'retired']).toContain(rec.status);
      }
    });

    it('maps role keys and names to canonical ids, roles and statuses', () => {
      const reg = normalizeHandwrittenCastingRegistry(shapes['role-keyed entries without a wrapper']).registry!;
      expect(Object.keys(reg.agents).sort()).toEqual(['avery', 'nova', 'quinn']);
      expect(reg.agents['avery']).toMatchObject({ display_name: 'Avery', role: 'lead', status: 'active' });
      expect(reg.agents['nova']).toMatchObject({ role: 'Backend Developer' });
      expect(reg.agents['quinn']).toMatchObject({ display_name: 'Quinn', role: 'tester' });
      const belanna = normalizeHandwrittenCastingRegistry(shapes['agents as an array']).registry!;
      expect(Object.keys(belanna.agents)).toEqual(['data', 'b-elanna']);
      expect(belanna.agents['b-elanna']!.status).toBe('active');
      expect(normalizeHandwrittenCastingRegistry(shapes['simplified object with version and name/role/status']).registry!.agents['nova']!.status).toBe('active');
    });

    it('rejects bare-string entries with a reason instead of guessing which side is the name', () => {
      const result = normalizeHandwrittenCastingRegistry({ lead: { name: 'Avery' }, tester: 'Quinn' });
      expect(result.registry).toBeUndefined();
      expect(result.reason).toMatch(/could not be normalized/);
      expect(result.dropped).toEqual([{ name: 'tester', reason: expect.stringMatching(/bare string value is ambiguous/) }]);
    });

    it.each(Object.keys(shapes))('repairs on disk, archives the originals by default, creates history and is then readable: %s', (name) => {
      write('registry.json', shapes[name]);
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({ repaired: true, files: ['registry.json', 'history.json', 'registry-history.commit.json'], backupPath: expect.stringMatching(/^handwritten-archive-[0-9a-f]{64}$/) });
      expect(fs.existsSync(path.join(castingDir, 'registry.json.handwritten.bak'))).toBe(false);
      expect(fs.statSync(path.join(castingDir, result.backupPath!)).isDirectory()).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(castingDir, result.backupPath!, 'registry.json'), 'utf8'))).toEqual(shapes[name]);
      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry.agents).length).toBeGreaterThan(0);
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
    });

    it('R3-13: preserves retired agents, keeps a valid history and commits a canonical manifest', () => {
      const MANIFEST = 'registry-history.commit.json';
      write('registry.json', { universe: 'Star Trek', agents: [
        { name: 'Data', role: 'Expert', status: 'active' },
        { name: 'Tuvok', role: 'Security', status: 'retired' },
        { name: 'Neelix', role: 'Morale', status: 'inactive' },
      ] });
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({ repaired: true, files: ['registry.json', 'history.json', MANIFEST] });
      const pair = readCastingRegistryPair(castingDir);
      expect(pair.registry.agents['tuvok']!.status).toBe('retired');
      expect(pair.registry.agents['neelix']!.status).toBe('inactive');
      expect(pair.registry.agents['data']!.status).toBe('active');
      const manifest = JSON.parse(fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8'));
      expect(manifest).toMatchObject({ registry_revision: 1, transaction_id: expect.any(String) });
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
    });

    it('R3-13: a manifest-only mismatch keeps the existing history and bumps the revision by one', () => {
      const MANIFEST = 'registry-history.commit.json';
      write('registry.json', shapes['agents as an array']);
      repairHandwrittenCastingRegistry(castingDir);
      const before = readCastingRegistryPair(castingDir);
      const historyBefore = JSON.parse(fs.readFileSync(path.join(castingDir, 'history.json'), 'utf8'));
      // semantically identical registry, different bytes: only the commit manifest disagrees now
      fs.writeFileSync(path.join(castingDir, 'registry.json'), JSON.stringify(before.registry));
      expect(() => readCastingRegistryPair(castingDir)).toThrow(/commit manifest/);
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({ repaired: true });
      const after = readCastingRegistryPair(castingDir);
      // the recommit is a new generation of the same registry, never a fresh cast
      expect(after.registry.revision).toBe(before.registry.revision + 1);
      expect(Object.keys(after.registry.agents)).toEqual(Object.keys(before.registry.agents));
      expect(after.registry.agents).toEqual(before.registry.agents);
      const historyAfter = JSON.parse(fs.readFileSync(path.join(castingDir, 'history.json'), 'utf8'));
      expect(historyAfter.assignment_cast_snapshots).toEqual(historyBefore.assignment_cast_snapshots);
      expect(historyAfter.universe_usage_history).toEqual(historyBefore.universe_usage_history);
      expect(fs.existsSync(path.join(castingDir, MANIFEST))).toBe(true);
    });
    it('does not touch canonical registries, absent registries or unrecoverable content', () => {
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
      const canonical = normalizeHandwrittenCastingRegistry(shapes['bare array']).registry!;
      write('registry.json', canonical);
      write('history.json', { universe_usage_history: [], assignment_cast_snapshots: {} });
      const before = fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8');
      expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(false);
      expect(fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8')).toBe(before);

      write('registry.json', '{ not json');
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({ repaired: false, reason: expect.stringMatching(/not valid JSON/) });
      write('registry.json', { agents: {}, note: 'empty' });
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({ repaired: false, reason: expect.stringMatching(/no recoverable agents/) });
      expect(fs.existsSync(path.join(castingDir, 'registry.json.handwritten.bak'))).toBe(false);
    });

    describe('after `squad init` wrote a registry-history.commit.json', () => {
      const MANIFEST = 'registry-history.commit.json';
      const initPair = () => {
        const reg = JSON.stringify({ schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1, generated_at: '1970-01-01T00:00:00.000Z', agents: {} });
        const hist = JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} });
        ensureCastingRegistryPair(castingDir, reg, hist, 'test init');
        expect(fs.existsSync(path.join(castingDir, MANIFEST))).toBe(true);
        expect(() => readCastingRegistryPair(castingDir)).not.toThrow();
      };

      it('reproduces the original failure: a hand-edited registry makes the pair unreadable', () => {
        initPair();
        write('registry.json', shapes['role-keyed entries without a wrapper']);
        expect(() => readCastingRegistryPair(castingDir)).toThrow(/consistent casting registry\/history pair/);
      });

      it('repair commits a valid manifest so the pair reads again, archiving the originals instead of leaving .handwritten.bak', () => {
        initPair();
        write('registry.json', shapes['role-keyed entries without a wrapper']);
        const manifestBytes = fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8');
        const result = repairHandwrittenCastingRegistry(castingDir);
        expect(result).toMatchObject({ repaired: true, files: ['registry.json', 'history.json', MANIFEST], backupPath: expect.stringMatching(/^handwritten-archive-/) });
        expect(fs.existsSync(path.join(castingDir, MANIFEST))).toBe(true);
        expect(fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8')).not.toBe(manifestBytes);
        expect(fs.existsSync(path.join(castingDir, `${MANIFEST}.handwritten.bak`))).toBe(false);
        expect(fs.readFileSync(path.join(castingDir, result.backupPath!, MANIFEST), 'utf8')).toBe(manifestBytes);
        expect(Object.keys(readCastingRegistryPair(castingDir).registry.agents).sort()).toEqual(['avery', 'nova', 'quinn']);
        expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
      });

      it('also repairs a well-formed canonical edit that no longer matches the manifest, keeping its agents', () => {
        initPair();
        const edited = normalizeHandwrittenCastingRegistry({ agents: [{ name: 'Ada', role: 'Core' }, { name: 'Linus', role: 'CLI' }] }).registry!;
        write('registry.json', edited);
        expect(() => readCastingRegistryPair(castingDir)).toThrow(/commit manifest/);
        expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({ repaired: true });
        expect(Object.keys(readCastingRegistryPair(castingDir).registry.agents).sort()).toEqual(['ada', 'linus']);
        expect(fs.existsSync(path.join(castingDir, MANIFEST))).toBe(true);
      });

      it('leaves an untouched init pair and its manifest alone', () => {
        initPair();
        const before = fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8');
        expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
        expect(fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8')).toBe(before);
      });

      it('squad upgrade (ensureCastingDefaults) survives a stale manifest', () => {
        const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-manifest-'));
        try {
          const dir = path.join(dest, '.squad', 'casting');
          fs.mkdirSync(dir, { recursive: true });
          const reg = JSON.stringify({ schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1, generated_at: '1970-01-01T00:00:00.000Z', agents: {} });
          ensureCastingRegistryPair(dir, reg, JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} }), 'test init');
          fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(shapes['agents as an array']));
          const created = ensureCastingDefaults(dest);
          expect(created).toEqual(expect.arrayContaining(['.squad/casting/registry.json']));
          expect(Object.keys(readCastingRegistryPair(dir).registry.agents).sort()).toEqual(['b-elanna', 'data']);
        } finally {
          fs.rmSync(dest, { recursive: true, force: true });
        }
      });
    });

    it('squad upgrade (ensureCastingDefaults) no longer crashes on a handwritten registry', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-casting-'));
      try {
        const dir = path.join(dest, '.squad', 'casting');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(shapes['role-keyed entries without a wrapper']));
        const created = ensureCastingDefaults(dest);
        expect(created).toEqual(expect.arrayContaining(['.squad/casting/registry.json', '.squad/casting/history.json']));
        expect(Object.keys(readCastingRegistryPair(dir).registry.agents).sort()).toEqual(['avery', 'nova', 'quinn']);
        expect(fs.existsSync(path.join(dir, 'policy.json'))).toBe(true);
        expect(ensureCastingDefaults(dest)).toEqual([]);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });

    it('squad upgrade (ensureCastingDefaults) fails closed on a bare-string entry with the reason and the fix, not an opaque crash', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-casting-bare-'));
      try {
        const dir = path.join(dest, '.squad', 'casting');
        fs.mkdirSync(dir, { recursive: true });
        const handwritten = { lead: { name: 'Avery', role: 'Lead' }, tester: 'Quinn' };
        fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(handwritten));
        let message = '';
        try {
          ensureCastingDefaults(dest);
        } catch (err) {
          message = err instanceof Error ? err.message : String(err);
        }
        expect(message).toMatch(/registry\.json cannot be read or repaired: 1 registry entry could not be normalized/);
        expect(message).toMatch(/tester: bare string value is ambiguous/);
        expect(message).toMatch(/object with `name` and `role`/);
        expect(message).toMatch(/npx squad cast --name/);
        // the generic pair-initialization error never surfaces
        expect(message).not.toMatch(/exactly one authoritative file exists/);
        // the registry is left for the user to fix (fail closed), nothing is invented
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'registry.json'), 'utf8'))).toEqual(handwritten);
        expect(fs.existsSync(path.join(dir, 'history.json'))).toBe(false);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });
  });
});
describe('field findings from the multi-client demos: process hygiene, .gitignore, non-TTY init, registry backfill', () => {
  it.each(CLIENT_IDS)('%s: forbids killing processes by image name', (id) => {
    const text = buildCoordinatorInstructions(id);
    // live finding: a subagent ran `taskkill /IM node.exe` and killed its own proxy mid-run
    expect(text).toMatch(/Process hygiene/);
    for (const cmd of ['taskkill /IM', 'Stop-Process -Name', 'pkill', 'killall']) expect(text, cmd).toContain(cmd);
    expect(text).toMatch(/NEVER kill processes by image or name/);
    expect(text).toMatch(/exact PID you started yourself/);
  });

  describe('.gitignore scaffolding', () => {
    let dest: string;
    beforeEach(() => { dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-gitignore-')); });
    afterEach(() => { fs.rmSync(dest, { recursive: true, force: true }); });
    const lines = () => fs.readFileSync(path.join(dest, '.gitignore'), 'utf8').split(/\r?\n/);

    it('adds only .squad runtime entries on plain upgrade, idempotently (no .claude/worktrees/ or NUL without --client claude)', () => {
      const added = ensureGitignore(dest);
      expect(added).toEqual(expect.arrayContaining(['.squad/orchestration-log/', '.squad/log/', '.squad/sessions/', '.squad/backend/']));
      expect(added).not.toContain('.claude/worktrees/');
      expect(added).not.toContain('NUL');
      expect(lines()).not.toContain('.claude/worktrees/');
      expect(lines()).not.toContain('NUL');
      expect(ensureGitignore(dest)).toEqual([]);
    });

    it('ignores experimental backend transcripts/locks and never gives them a merge=union rule', () => {
      ensureGitignore(dest);
      expect(lines()).toContain('.squad/backend/');
      ensureGitattributes(dest);
      const attributes = fs.readFileSync(path.join(dest, '.gitattributes'), 'utf8');
      expect(attributes).toMatch(/\.squad\/log\/\*\* merge=union/);
      expect(attributes).not.toMatch(/\.squad\/backend/);
    });

    it('respects existing entries and parent coverage in .gitignore', () => {
      fs.writeFileSync(path.join(dest, '.gitignore'), 'NULLABLE.md\nnode_modules/\n');
      expect(ensureGitignore(dest)).not.toContain('NUL');
      expect(lines()).toEqual(expect.arrayContaining(['NULLABLE.md', '.squad/orchestration-log/']));

      const dest2 = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-gitignore2-'));
      try {
        fs.writeFileSync(path.join(dest2, '.gitignore'), '.squad/\n');
        const added = ensureGitignore(dest2);
        expect(added).not.toContain('.squad/log/'); // covered by the .squad/ parent
      } finally {
        fs.rmSync(dest2, { recursive: true, force: true });
      }
    });
  });

  describe('squad init never blocks on stdin when non-interactive', () => {
    const tty = { isTTY: true };
    const pipe = { isTTY: undefined };
    it('isInteractiveSession needs a TTY on stdin and stdout and no CI / opt-out', () => {
      expect(isInteractiveSession({}, tty, tty)).toBe(true);
      expect(isInteractiveSession({}, pipe, tty)).toBe(false);
      expect(isInteractiveSession({}, tty, pipe)).toBe(false);
      expect(isInteractiveSession({}, pipe, pipe)).toBe(false);
      expect(isInteractiveSession({ CI: 'true' }, tty, tty)).toBe(false);
      expect(isInteractiveSession({ CI: '1' }, tty, tty)).toBe(false);
      expect(isInteractiveSession({ CI: '0' }, tty, tty)).toBe(true);
      expect(isInteractiveSession({ CI: 'false' }, tty, tty)).toBe(true);
      expect(isInteractiveSession({ SQUAD_NONINTERACTIVE: '1' }, tty, tty)).toBe(false);
    });

    it('runInit completes without stdin (non-TTY) and scaffolds .squad .gitignore entries without client-specific ignores', async () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-init-'));
      const savedStdin = process.stdin.isTTY;
      try {
        (process.stdin as { isTTY?: boolean }).isTTY = undefined;
        const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
          await Promise.race([
            runInit(dest, { includeWorkflows: false } as never),
            new Promise((_, reject) => setTimeout(() => reject(new Error('runInit blocked waiting for stdin')), 60_000)),
          ]);
        } finally {
          quiet.mockRestore();
          write.mockRestore();
        }
        expect(fs.existsSync(path.join(dest, '.squad'))).toBe(true);
        const ignore = fs.readFileSync(path.join(dest, '.gitignore'), 'utf8').split(/\r?\n/);
        expect(ignore).toEqual(expect.arrayContaining(['.squad/orchestration-log/', '.squad/log/', '.squad/sessions/']));
        expect(ignore).not.toContain('.claude/worktrees/');
        expect(ignore).not.toContain('NUL');
      } finally {
        (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
        fs.rmSync(dest, { recursive: true, force: true });
      }
    }, 90_000);
  });

  describe('casting registry backfill from team.md (older CLI without `squad cast --name`)', () => {
    const TEAM = [
      '# Squad Team', '', '**Universe:** Star Trek', '',
      '## Coordinator', '| Name | Role |', '|---|---|', '| Squad | Coordinator |', '',
      '## Members', '',
      '| Name | Role | Charter | Status |', '|------|------|---------|--------|',
      "| Data | Framework Expert | .squad/agents/data/charter.md | ✅ Active |",
      "| B'Elanna | Durable Systems | .squad/agents/belanna/charter.md | ✅ Active |",
      '| Pat | Human reviewer | - | human |', '',
      '## Built-in Support Agents', '| Name | Role |', '|---|---|', '| Scribe | Session Logger |', '| Ralph | Work Monitor |', '',
    ].join('\n');
    let dest: string;
    beforeEach(() => {
      dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-backfill-'));
      fs.mkdirSync(path.join(dest, '.squad'), { recursive: true });
      // the registry id IS the agent folder: "B'Elanna" lives in .squad/agents/belanna/, never a slug of the name
      for (const id of ['data', 'belanna']) {
        fs.mkdirSync(path.join(dest, '.squad', 'agents', id), { recursive: true });
        fs.writeFileSync(path.join(dest, '.squad', 'agents', id, 'charter.md'), `# ${id}\n`);
      }
    });
    afterEach(() => { fs.rmSync(dest, { recursive: true, force: true }); });

    it('parses only routable specialists (no coordinator, built-ins, humans) and the universe', () => {
      const { members, universe } = parseTeamRoster(TEAM);
      expect(members).toEqual([
        { name: 'Data', role: 'Framework Expert', charterId: 'data' },
        { name: "B'Elanna", role: 'Durable Systems', charterId: 'belanna' },
      ]);
      expect(universe).toBe('Star Trek');
      expect(parseTeamRoster('| Name | Role |\n|---|---|\n| Ada | Core |\n').members).toEqual([{ name: 'Ada', role: 'Core' }]);
      expect(parseTeamRoster('no table here').members).toEqual([]);
    });

    it('squad upgrade backfills an empty registry from team.md and the pair is readable', () => {
      fs.writeFileSync(path.join(dest, '.squad', 'team.md'), TEAM);
      const created = ensureCastingDefaults(dest);
      expect(created).toEqual(expect.arrayContaining(['.squad/casting/registry.json', '.squad/casting/history.json']));
      const dir = path.join(dest, '.squad', 'casting');
      const pair = readCastingRegistryPair(dir);
      expect(Object.keys(pair.registry.agents).sort()).toEqual(['belanna', 'data']);
      expect(pair.registry.agents['data']).toMatchObject({ display_name: 'Data', role: 'Framework Expert', universe: 'Star Trek', status: 'active' });
      expect(pair.registry.agents['belanna']).toMatchObject({ display_name: "B'Elanna", role: 'Durable Systems' });
      expect(fs.existsSync(path.join(dir, 'registry-history.commit.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'registry.json.handwritten.bak'))).toBe(false);
      // a second upgrade creates nothing, keeps the same roster, and never backfills again
      expect(ensureCastingDefaults(dest)).toEqual([]);
      const again = readCastingRegistryPair(dir);
      expect(Object.keys(again.registry.agents).sort()).toEqual(['belanna', 'data']);
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toEqual({ repaired: false, files: [] });
    });

    it('leaves populated registries, missing team.md and empty rosters alone', () => {
      const dir = path.join(dest, '.squad', 'casting');
      fs.mkdirSync(dir, { recursive: true });
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toEqual({ repaired: false, files: [] });
      ensureCastingDefaults(dest); // empty registry, no team.md
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toEqual({ repaired: false, files: [] });
      // a roster with no routable specialists is not a backfill candidate at all
      fs.writeFileSync(path.join(dest, '.squad', 'team.md'), '# Team\n\n## Members\n\n| Name | Role |\n|---|---|\n| Scribe | Logger |\n');
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toEqual({ repaired: false, files: [] });
      // a roster row whose agent folder cannot be proven fails closed with the row named
      fs.writeFileSync(path.join(dest, '.squad', 'team.md'), '**Universe:** Star Trek\n\n## Members\n\n| Name | Role |\n|---|---|\n| Seven | Analyst |\n');
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/could not be mapped to an agent folder/),
        dropped: [{ name: 'Seven', reason: expect.stringMatching(/cannot be proven/) }],
      });
      expect(Object.keys(readCastingRegistryPair(dir).registry.agents)).toEqual([]);

      // a registry that already has agents is never overwritten
      fs.writeFileSync(path.join(dest, '.squad', 'team.md'), TEAM);
      const populated = normalizeHandwrittenCastingRegistry({ agents: [{ name: 'Ada', role: 'Core' }] }).registry!;
      fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(populated));
      fs.rmSync(path.join(dir, 'registry-history.commit.json'), { force: true });
      expect(backfillCastingRegistryFromTeam(dir, path.join(dest, '.squad', 'team.md'))).toEqual({ repaired: false, files: [] });
      expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'registry.json'), 'utf8')).agents)).toEqual(['ada']);
    });
  });
});
describe('claude .gitignore marker block is projected and rolled back', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-claude-ignore-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const ctx = (): ClientContext => ({ root, mcp: { command: 'node', args: ['-e', '0'] }, members: [{ name: 'Data', role: 'Expert' }] });

  it('adds .claude/worktrees/ inside an id-scoped block, keeps user lines, and removal restores the file exactly', () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\ndist/\n');
    installClients(['claude'], ctx());
    const withBlock = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(withBlock.startsWith('node_modules/\ndist/\n')).toBe(true);
    expect(withBlock).toContain('.claude/worktrees/');
    // projected as plain .gitignore lines tagged with a `# squad:<id>` comment, never HTML markers
    expect(withBlock).toMatch(/^# squad:claude$/m);
    expect(withBlock).not.toMatch(/squad:begin:claude/);
    expect(installClients(['claude'], ctx()).every(r => r.action === 'unchanged')).toBe(true);

    uninstallClients(['claude'], ctx());
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('node_modules/\ndist/\n');
  });

  it('deletes a .gitignore that Squad created itself', () => {
    installClients(['claude'], ctx());
    expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(true);
    uninstallClients(['claude'], ctx());
    expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false);
  });
});
describe('client adapter contract is exposed canonically and through the deprecated /clients alias', () => {
  it('@bradygaster/squad-sdk/client and /clients export the same adapter symbols', async () => {
    const canonical = await import('@bradygaster/squad-sdk/client');
    const alias = await import('@bradygaster/squad-sdk/clients');
    for (const name of ['createClientAdapter', 'AdapterUnboundError', 'CAPABILITY_TOKENS_BY_HOST', 'capabilityFlagsFromTokens', 'resolveEffectiveCapabilityTokens',
      'getClientAdapter', 'installClients', 'CLIENT_IDS']) {
      expect(canonical, name).toHaveProperty(name);
      expect((alias as Record<string, unknown>)[name], name).toBe((canonical as Record<string, unknown>)[name]);
    }
  });

  it('R3-12: CAPABILITY_TOKENS_BY_HOST carries the full capability-matrix baseline for all 7 hosts', async () => {
    const { CAPABILITY_TOKENS_BY_HOST, resolveEffectiveCapabilityTokens } = await import('@bradygaster/squad-sdk/client');
    const projection = new Set(['native-hooks', 'steering-files']);
    for (const id of CLIENT_IDS) {
      const declared = CAPABILITY_TOKENS_BY_HOST[id];
      const runtime = declared.filter(t => !projection.has(t)).sort();
      expect(runtime, id).toEqual([...matrix.clients[id]!.clientCapabilities].sort());
      for (const t of ['cancel-run', 'cursor-reconnect', 'typed-content-parts']) expect(declared, `${id}:${t}`).toContain(t);
      expect(resolveEffectiveCapabilityTokens(declared, matrix.backendCapabilities, matrix.policyCapabilities).sort(), id)
        .toEqual([...matrix.clients[id]!.effectiveCapabilities].sort());
    }
    expect(CAPABILITY_TOKENS_BY_HOST.copilot).toContain('background-runs');
    expect(CAPABILITY_TOKENS_BY_HOST.opencode).toContain('background-runs');
    // F7: Claude Code runs Agent spawns in the background (live run 2026-10-22, subagent_stats.started_in_background).
    expect(CAPABILITY_TOKENS_BY_HOST.claude).toContain('background-runs');
    expect(CAPABILITY_TOKENS_BY_HOST.kiro).not.toContain('background-runs');
  });

  it('every host declares tokens that map onto the capability flags consistently', async () => {
    const { CAPABILITY_TOKENS_BY_HOST, capabilityFlagsFromTokens } = await import('@bradygaster/squad-sdk/client');
    expect(Object.keys(CAPABILITY_TOKENS_BY_HOST).sort()).toEqual([...CLIENT_IDS].sort());
    for (const id of CLIENT_IDS) {
      const flags = capabilityFlagsFromTokens(CAPABILITY_TOKENS_BY_HOST[id], getClientAdapter(id).capabilities.transportModes);
      expect(flags.supportsSubagents, id).toBe(getClientAdapter(id).capabilities.supportsSubagents);
    }
  });
});

// ── Journey and Brady re-review repros ──────────────────────────────

describe('Full non-bypass journey: host adapter → broker → harness → approval → restart/reconnect', () => {
  type Broker = { client: () => SquadBackend; restart: () => void; harness: () => TestHarness };

  /** An MCP client facade: every call goes through the backend-mcp.ts tool surface as JSON, like a real MCP host. */
  function mcpFacade(getBackend: () => SquadBackend): SquadBackend {
    const tools = new Map(createBackendMcpTools(getBackend).map(t => [t.name, t]));
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await callBackendMcpTool(tools.get(name)!, args);
      const body = JSON.parse(res.content[0]!.text);
      if (res.isError) throw new BackendError(body.error.code, body.error.message, body.error.status ?? 500);
      return body;
    };
    return {
      kind: 'mcp-client',
      createConversation: o => call('squad_backend_create_conversation', { ...o }),
      sendMessage: (c, m) => call('squad_backend_send_message', { conversationId: c, ...m }),
      readEvents: (c, o) => call('squad_backend_read_events', { conversationId: c, ...o }),
      respondApproval: (c, r) => call('squad_backend_respond_approval', { conversationId: c, ...r }),
      cancelRun: (c, runId, reason) => call('squad_backend_cancel_run', { conversationId: c, runId, reason }),
      getApprovals: c => call('squad_backend_get_approvals', { conversationId: c }),
      negotiate: h => call('squad_backend_negotiate', { ...h }),
    } as unknown as SquadBackend;
  }

  const brokers: Record<string, (dir: string) => Broker> = {
    'MCP broker (state-mcp tools over a file store)': (dir) => {
      let harness!: TestHarness; let local!: LocalSquadBackend;
      const start = () => {
        harness = new TestHarness('copilot');
        const registry = new DefaultHarnessRegistry(); registry.register(harness);
        local = new LocalSquadBackend({ state: createFileStateStore(dir), harnesses: registry });
      };
      start();
      return { client: () => mcpFacade(() => local), restart: start, harness: () => harness };
    },
    'HTTP broker (DurableSquad /v1 surface over a file store)': (dir) => {
      let harness!: TestHarness; let server!: ReturnType<typeof createMockDurableSquad>;
      const start = () => {
        harness = new TestHarness('copilot');
        const registry = new DefaultHarnessRegistry(); registry.register(harness);
        server = createMockDurableSquad(new LocalSquadBackend({ state: createFileStateStore(dir), harnesses: registry }));
      };
      start();
      // a reconnecting host persists its lease epoch (a fresh client without one is fenced out)
      return { client: () => mkHttp(server, { epoch: 1 }), restart: start, harness: () => harness };
    },
  };

  it.each(Object.keys(brokers))('%s', async (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-journey-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-journey-ws-'));
    try {
      const broker = brokers[name]!(dir);
      const ctx: ClientContext = { root, mcp: { command: 'squad', args: ['state-mcp'] }, members: [{ name: 'Data', role: 'Expert' }] };
      installClients(['claude'], ctx);
      expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);

      // the host adapter speaks only the adapter contract; its runtime is the broker client (no direct backend access)
      let client = broker.client();
      let runCounter = 0;
      const runtimeFor = (c: () => SquadBackend): RuntimeBinding => ({
        submit: async ({ conversationId, prompt }) => {
          const runId = `run-${++runCounter}`;
          const adm = await c().sendMessage(conversationId, { runId, seq: 1, role: 'user', content: prompt, harness: 'copilot' });
          return { admissionId: adm.cursor ?? runId, runId };
        },
        subscribe: async ({ conversationId, cursor }, onEvent) => {
          const page = await c().readEvents(conversationId, cursor ? { after: cursor } : {});
          for (const e of page.events) await onEvent({ ...e, resumable: page.resumable, nextCursor: page.nextCursor });
          return async () => undefined;
        },
        cancel: async (conversationId, runId, reason) => { await c().cancelRun(conversationId, runId, reason); },
        respondApproval: async (conversationId, r) => {
          await c().respondApproval(conversationId, { approvalId: r.approvalId, hash: r.requestHash, decision: r.decision === 'approved' ? 'approve' : 'deny' });
        },
        backendCapabilities: async () => matrix.backendCapabilities,
        policyCapabilities: async () => matrix.policyCapabilities,
      });
      const adapter = createClientAdapter({ host: 'claude', ctx, runtime: runtimeFor(() => client) });
      expect((await adapter.describe()).projectedFiles.length).toBeGreaterThan(0);
      expect((await adapter.getCapabilities('j')).effectiveCapabilities).toEqual(matrix.clients['claude']!.effectiveCapabilities);

      await client.createConversation({ conversationId: 'j' });
      const { runId } = await adapter.submit({ conversationId: 'j', prompt: 'deploy to prod?' });
      expect(broker.harness().submitted).toEqual([{ runId, seq: 1 }]);

      // harness execution asks for approval
      broker.harness().emit({ type: 'approval-requested', runId, seq: 1, request: { approvalId: 'appr-j', turnSeq: 1, action: 'deploy', hash: 'sha256:j' } });
      const seen: Array<Record<string, unknown>> = [];
      await adapter.subscribe({ conversationId: 'j' }, e => { seen.push(e); });
      const requested = seen.find(e => e['type'] === 'approval.requested');
      expect(requested).toBeDefined();
      const cursor = seen.at(-1)!['nextCursor'] as string;

      // hash binding is enforced through the whole stack, then the real decision reaches the harness
      expect((await errorOf(adapter.respondApproval('j', { approvalId: 'appr-j', requestHash: 'sha256:evil', decision: 'approved' })))?.code).toBe('approval-hash-mismatch');
      await adapter.respondApproval('j', { approvalId: 'appr-j', requestHash: 'sha256:j', decision: 'approved' });
      expect(broker.harness().approvals).toEqual(['appr-j']);

      // broker restart: new process state, same durable store; the host reconnects with its saved cursor
      broker.restart();
      client = broker.client();
      const afterRestart: Array<Record<string, unknown>> = [];
      await adapter.subscribe({ conversationId: 'j', cursor }, e => { afterRestart.push(e); });
      expect(afterRestart.every(e => (e['sequence'] as number) > (seen.at(-1)!['sequence'] as number))).toBe(true);
      expect(afterRestart.some(e => e['type'] === 'approval.resolved')).toBe(true);
      expect((await client.getApprovals('j'))[0]).toMatchObject({ approvalId: 'appr-j', state: 'approved', version: 2 });

      // the re-attached harness finishes the run; the host sees it from its cursor, exactly once, in order
      broker.harness().emit({ type: 'state', state: 'completed', runId, seq: 1 });
      const tail: Array<Record<string, unknown>> = [];
      await adapter.subscribe({ conversationId: 'j', cursor: afterRestart.at(-1)?.['nextCursor'] as string ?? cursor }, e => { tail.push(e); });
      const all = (await client.readEvents('j')).events;
      expect(all.map(e => e.sequence)).toEqual(all.map((_, i) => i + 1));
      expect(all.some(e => e.type === 'turn.state' && (e.payload as { state?: string }).state === 'completed')).toBe(true);
      expect((await client.sendMessage('j', msg(runId, 1, { harness: 'copilot', content: 'deploy to prod?' }))).duplicate).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Brady re-review 13 defect repros', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-brady-'));
  const reg = (h: TestHarness) => { const r = new DefaultHarnessRegistry(); r.register(h); return r; };

  it('1. vitest.config.ts has no SDK source alias (no dual module instances)', () => {
    const cfg = fs.readFileSync(path.resolve(__dirname, '..', 'vitest.config.ts'), 'utf8');
    expect(cfg).not.toMatch(/find:\s*\/\^@bradygaster/);
    expect(cfg).not.toMatch(/squad-sdk\/src/);
  });

  it('2. every --client help line fits 80 columns', () => {
    for (const f of ['packages/squad-cli/src/cli-entry.ts', 'packages/squad-cli/src/cli/core/command-help.ts']) {
      const lines = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8').split(/\r?\n/).filter(l => l.includes('console.log(`') && l.includes('--client'));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        const visible = l.replace(/^\s*console\.log\(`/, '').replace(/`\);?\s*$/, '').replace(/\$\{[A-Z_]+\}/g, '');
        expect(visible.length, visible).toBeLessThanOrEqual(80);
      }
    }
  });

  it('3. legacy outbox entries without operationId never drop each other', async () => {
    const h = new TestHarness('copilot'); const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state, harnesses: reg(h) });
    await b.createConversation({ conversationId: 'c' });
    for (const r of ['r1', 'r2']) await b.sendMessage('c', msg(r, 1, { harness: 'copilot' }));
    const key = 'backend/conversations/c.json';
    const doc = JSON.parse(state.read(key)!);
    doc.turns.forEach((t: { state: string }) => { t.state = 'cancelled'; });
    doc.deliveries = [{ kind: 'cancel', runId: 'r1', seq: 1 }, { kind: 'cancel', runId: 'r2', seq: 1 }];
    state.write(key, JSON.stringify(doc));
    h.cancel = async (_c: string, runId: string) => { if (runId === 'r2') throw new Error('down'); };
    expect((await errorOf(new LocalSquadBackend({ state, harnesses: reg(h) }).cancelTurn('c', 1)))?.code).toBe('unavailable');
    const left = JSON.parse(state.read(key)!).deliveries as Array<{ runId: string; operationId: string }>;
    expect(left.map(d => d.runId)).toEqual(['r2']);
    expect(left[0]!.operationId).toBeTruthy();
  });

  it('4. overlapping stale-lock reclaimers never produce two owners', () => {
    const dir = tmp();
    try {
      const lockPath = path.join(dir, 'backend', 'locks', 'k.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'crashed:T1');
      const old = new Date(Date.now() - 60_000); fs.utimesSync(lockPath, old, old);
      const o = { staleLockMs: 5_000, lockTimeoutMs: 250, recoverStaleMs: 100 };
      let releaseB: (() => void) | undefined; let armed = true;
      const a = createFileStateStore(dir, { ...o, beforeStaleRecovery: () => { if (armed) { armed = false; releaseB = createFileStateStore(dir, o).lock!('backend/locks/k'); } } });
      expect(() => a.lock!('backend/locks/k')).toThrow(/Timed out/);
      expect(() => createFileStateStore(dir, o).lock!('backend/locks/k')).toThrow(/Timed out/);
      releaseB!();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('5. an admission retry replays from the ORIGINAL cursor; 8. a different payload conflicts', async () => {
    const h = new TestHarness('copilot');
    const b = new LocalSquadBackend({ harnesses: reg(h) });
    await b.createConversation({ conversationId: 'c' });
    const first = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    h.emit({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a', turnSeq: 1, action: 'x', hash: 'h' } });
    const retry = await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(retry).toMatchObject({ duplicate: true, cursor: first.cursor });
    expect((await b.readEvents('c', { after: retry.cursor })).events.map(e => e.type)).toContain('approval.requested');
    expect((await errorOf(b.sendMessage('c', msg('r', 1, { harness: 'copilot', content: 'other' }))))?.code).toBe('conflict');
  });

  it('6. a missing harness keeps the durable delivery and fails retryably', async () => {
    const h = new TestHarness('copilot'); const state = new MemoryStateStore();
    const b = new LocalSquadBackend({ state, harnesses: reg(h) });
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    const err = await errorOf(new LocalSquadBackend({ state }).cancelRun('c', 'r'));
    expect(err).toMatchObject({ code: 'unavailable', retryable: true });
    await new LocalSquadBackend({ state, harnesses: reg(h) }).cancelRun('c', 'r');
    expect(h.cancelled).toEqual([{ runId: 'r', seq: 1 }]);
  });

  it('7. synchronous replay during rehydration neither recurses nor deadlocks', async () => {
    const dir = tmp();
    try {
      const store = () => createFileStateStore(dir, { lockTimeoutMs: 400 });
      const seed = new TestHarness('copilot');
      const first = new LocalSquadBackend({ state: store(), harnesses: reg(seed) });
      await first.createConversation({ conversationId: 'c' });
      await first.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
      let subscribes = 0;
      class Replay extends TestHarness {
        override subscribe(c: string, l: (e: HarnessEventEnvelope) => void) {
          subscribes++;
          l({ type: 'approval-requested', runId: 'r', seq: 1, request: { approvalId: 'a', turnSeq: 1, action: 'x', hash: 'h' } });
          return super.subscribe(c, l);
        }
      }
      const restarted = new LocalSquadBackend({ state: store(), harnesses: reg(new Replay('copilot')) });
      expect((await restarted.getApprovals('c')).map(a => a.approvalId)).toEqual(['a']);
      expect(subscribes).toBe(1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('9. the MCP broker honors a configured state backend', async () => {
    const files = new Map<string, string>();
    const orphan = { name: 'orphan', read: (p: string) => files.get(p), write: (p: string, c: string) => { files.set(p, c); }, exists: (p: string) => files.has(p), list: () => [] as string[] };
    const dir = tmp();
    try {
      const b = createMcpBackend('.', {}, () => ({ paths: { teamSquadDir: dir }, backend: orphan }) as never);
      await b.createConversation({ conversationId: 'c' });
      expect([...files.keys()]).toContain('backend/conversations/c.json');
      expect(fs.existsSync(path.join(dir, 'backend'))).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('10. an HTTP body-read failure is retried', async () => {
    let calls = 0;
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://d.test', retryDelayMs: 1, fetch: (async () => {
      if (++calls === 1) return { ok: true, status: 200, headers: new Headers(), text: async () => { throw new TypeError('terminated'); } } as unknown as Response;
      return json(200, { runId: 'r', seq: 1, duplicate: false, state: 'queued' });
    }) as never });
    expect((await b.sendMessage('c', msg('r', 1))).runId).toBe('r');
    expect(calls).toBe(2);
  });

  it('11. TOML [[array_table]] boundaries and quoted keys survive upsert/remove', async () => {
    const { upsertTomlTable, removeTomlTable } = await import('@bradygaster/squad-sdk/client');
    const doc = '[mcp_servers.squad_state]\n"command" = "old"\n\n[[skills.config]]\npath = "/a"\n';
    const out = upsertTomlTable(doc, 'mcp_servers.squad_state', { command: '"squad"' });
    expect(out.match(/command\s*=/g)).toHaveLength(1);
    expect(out).toContain('[[skills.config]]\npath = "/a"');
    expect(removeTomlTable(doc, 'mcp_servers.squad_state')).toContain('[[skills.config]]');
  });

  it('12. capability tokens match capability-matrix.json for all 7 hosts', async () => {
    const { CAPABILITY_TOKENS_BY_HOST } = await import('@bradygaster/squad-sdk/client');
    for (const id of CLIENT_IDS) {
      expect(CAPABILITY_TOKENS_BY_HOST[id].filter(t => !['native-hooks', 'steering-files'].includes(t)).sort()).toEqual([...matrix.clients[id]!.clientCapabilities].sort());
    }
  });

  it('13. casting repair keeps retired agents and commits a valid manifest', () => {
    const dir = tmp();
    try {
      fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify({ universe: 'Star Trek', agents: [{ name: 'Data', role: 'Expert' }, { name: 'Tuvok', role: 'Security', status: 'retired' }] }));
      expect(repairHandwrittenCastingRegistry(dir)).toMatchObject({ repaired: true, files: ['registry.json', 'history.json', 'registry-history.commit.json'] });
      expect(readCastingRegistryPair(dir).registry.agents['tuvok']!.status).toBe('retired');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Open review threads on #2239', () => {
  it('upgrades the reported 0.9.x entries/assignments shape, rewrites a quoted npx bridge, and preserves originals', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-legacy-casting-'));
    const output: string[] = [];
    const quiet = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const savedStdin = process.stdin.isTTY;
    try {
      (process.stdin as { isTTY?: boolean }).isTTY = undefined;
      await runInit(dest, { includeWorkflows: false } as never);
      const squadDir = path.join(dest, '.squad');
      const castingDir = path.join(squadDir, 'casting');
      const entries = Array.from({ length: 11 }, (_, index) => ({
        persistent_name: `Example Member ${String(index + 1).padStart(2, '0')}`,
        universe: 'descriptive',
        created_at: '2024-02-03T12:00:00.000Z',
        legacy_named: true,
        status: 'active',
      }));
      for (const [index, entry] of entries.entries()) {
        const id = `example-member-${String(index + 1).padStart(2, '0')}`;
        const folder = path.join(squadDir, 'agents', id);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(
          path.join(folder, 'charter.md'),
          `# ${entry.persistent_name}\n\n## Identity\n- **Name:** ${entry.persistent_name}\n- **Role:** Example Role ${String(index + 1).padStart(2, '0')}\n`,
        );
      }
      const registryRaw = JSON.stringify({ entries }, null, 2) + '\r\n';
      const historyRaw = JSON.stringify({
        assignments: [{
          assignment_id: 'example-onboarding-001',
          universe: 'descriptive',
          timestamp: '2024-02-03T12:30:00.000Z',
          members: entries.slice(0, 10).map((entry, index) => ({
            name: entry.persistent_name,
            role: `Example Role ${String(index + 1).padStart(2, '0')}`,
          })),
        }],
      }, null, 2) + '\r\n';
      fs.writeFileSync(path.join(castingDir, 'registry.json'), registryRaw);
      fs.writeFileSync(path.join(castingDir, 'history.json'), historyRaw);
      fs.rmSync(path.join(castingDir, 'registry-history.commit.json'), { force: true });
      fs.writeFileSync(path.join(dest, '.mcp.json'), JSON.stringify({
        mcpServers: {
          squad_state: {
            command: '"npx"',
            args: ['-y', '@bradygaster/squad-cli@0.9.1', 'state-mcp'],
          },
        },
      }, null, 2));

      await runUpgrade(dest, { force: true } as never);

      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry.agents)).toHaveLength(11);
      expect(pair.history.assignment_cast_snapshots['example-onboarding-001']).toMatchObject({
        agents: Object.keys(pair.registry.agents).slice(0, 10),
        universe: 'descriptive',
        created_at: '2024-02-03T12:30:00.000Z',
      });
      const archive = fs.readdirSync(castingDir).find(name => name.startsWith('legacy-archive-'))!;
      expect(fs.readFileSync(path.join(castingDir, archive, 'registry.json'), 'utf8')).toBe(registryRaw);
      expect(fs.readFileSync(path.join(castingDir, archive, 'history.json'), 'utf8')).toBe(historyRaw);
      const mcp = JSON.parse(fs.readFileSync(path.join(dest, '.mcp.json'), 'utf8'));
      expect(mcp.mcpServers.squad_state.command).not.toContain('"');
      expect(mcp.mcpServers.squad_state.args.at(-1)).toBe('state-mcp');
      expect(output.join('\n')).toMatch(/⚠️.*Migrated legacy casting state.*byte-exact originals/);
      expect(output.join('\n')).not.toMatch(/entries: value is not an agent record/);
    } finally {
      (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
      quiet.mockRestore();
      write.mockRestore();
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }, 120_000);

  it('runUpgrade repairs a handwritten casting registry instead of failing the strict preflight', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-upgrade-hw-'));
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const savedStdin = process.stdin.isTTY;
    try {
      (process.stdin as { isTTY?: boolean }).isTTY = undefined;
      await runInit(dest, { includeWorkflows: false } as never);
      const dir = path.join(dest, '.squad', 'casting');
      fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify({ universe: 'Star Trek', agents: [{ name: 'Data', role: 'Expert' }, { name: 'Tuvok', role: 'Security', status: 'retired' }] }));
      await runUpgrade(dest, { force: true } as never);
      const pair = readCastingRegistryPair(dir);
      expect(Object.keys(pair.registry.agents).sort()).toEqual(['data', 'tuvok']);
      expect(pair.registry.agents['tuvok']!.status).toBe('retired');
    } finally {
      (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
      quiet.mockRestore();
      write.mockRestore();
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }, 120_000);

  it('persistClients refuses to write through a symlinked config.json', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-cfg-'));
    try {
      const squadDir = path.join(base, '.squad'); const outside = path.join(base, 'outside.json');
      fs.mkdirSync(squadDir);
      fs.writeFileSync(outside, '{"keep":true}');
      try { fs.symlinkSync(outside, path.join(squadDir, 'config.json'), 'file'); } catch { return; } // symlinks need privileges on Windows
      expect(() => persistClients(squadDir, ['claude'])).toThrow(/symlink|symbolic link|outside/i);
      expect(fs.readFileSync(outside, 'utf8')).toBe('{"keep":true}');
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
});