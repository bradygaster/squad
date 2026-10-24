/**
 * Squad 2.0 security & isolation contract suite.
 * Spec: docs/proposals/squad-2.0-security-and-isolation.md
 *
 * Every test here exercises SHIPPED product code (`@bradygaster/squad-sdk/backend`,
 * `@bradygaster/squad-sdk/client`, `squad-cli/core/backend-mcp`). Properties the proposal lists
 * under "Future work / not implemented" have no test here on purpose: a test that only proves
 * its own fixture is not evidence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  BACKEND_CAPABILITIES,
  BACKEND_PROTOCOL_VERSION,
  BackendError,
  DefaultHarnessRegistry,
  DurableHttpSquadBackend,
  LocalSquadBackend,
  MemoryStateStore,
  createFileStateStore,
  intersectCapabilities,
  type HarnessAdapter,
  type HarnessEventEnvelope,
} from '../packages/squad-sdk/src/backend/index.js';
import {
  CLIENT_IDS,
  assertPortableClients,
  installClients,
  mergeMcpServer,
  normalizeClientIds,
  resolveEffectiveCapabilityTokens,
  resolveInsideRoot,
  type ClientContext,
} from '../packages/squad-sdk/src/client/index.js';
import {
  callBackendMcpTool,
  createBackendMcpTools,
  isExperimentalBackendEnabled,
} from '../packages/squad-cli/src/cli/core/backend-mcp.js';

// ---------- fixtures ----------

class Harness implements HarnessAdapter {
  readonly capabilities = { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: [`x-${this.id}`] };
  submits: Array<{ runId: string; seq: number }> = [];
  cancels: Array<{ runId: string; seq: number; operationId?: string }> = [];
  approvals: Array<{ approvalId: string; operationId?: string }> = [];
  private listeners = new Set<(e: HarnessEventEnvelope) => void>();
  constructor(readonly id = 'copilot') {}
  async submit(s: { runId: string; seq: number }) { this.submits.push({ runId: s.runId, seq: s.seq }); }
  subscribe(_c: string, l: (e: HarnessEventEnvelope) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async cancel(_c: string, runId: string, seq: number, operationId?: string) { this.cancels.push({ runId, seq, operationId }); }
  async respondApproval(_c: string, r: { approvalId: string }, operationId?: string) { this.approvals.push({ approvalId: r.approvalId, operationId }); }
  describe() { return { id: this.id, capabilities: this.capabilities }; }
  emit(e: HarnessEventEnvelope) { this.listeners.forEach(l => l(e)); }
}

function backendWithHarness(state = new MemoryStateStore()) {
  const harness = new Harness();
  const harnesses = new DefaultHarnessRegistry();
  harnesses.register(harness);
  return { harness, harnesses, state, backend: new LocalSquadBackend({ state, harnesses }) };
}

const msg = (runId: string, seq: number, extra: object = {}) => ({ runId, seq, role: 'user' as const, content: `m${seq}`, ...extra });
const ask = (runId: string, seq: number, approvalId: string, hash: string): HarnessEventEnvelope =>
  ({ type: 'approval-requested', runId, seq, request: { approvalId, turnSeq: seq, action: 'write', hash } });

async function errorOf(p: Promise<unknown>): Promise<BackendError | undefined> {
  try { await p; } catch (e) { return e instanceof BackendError ? e : undefined; }
  return undefined;
}

function tryLink(target: string, p: string): boolean {
  try { fs.symlinkSync(target, p, 'junction'); return true; } catch { return false; }
}

let root: string;
let outside: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-sec-root-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-sec-outside-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

// ---------- G1: path containment ----------

describe('G1 path containment: backend state store (createFileStateStore)', () => {
  it('rejects a key that lexically escapes the state root', () => {
    const store = createFileStateStore(root);
    expect(() => store.read('../outside.json')).toThrow(/escapes state directory/);
    expect(() => store.write('backend/../../x.json', '{}')).toThrow(/escapes state directory/);
    expect(() => store.lock!('../../k')).toThrow(/escapes state directory/);
  });

  it('refuses to follow a symlink/junction between the root and the target', () => {
    const store = createFileStateStore(root);
    store.write('backend/conversations/ok.json', '{}');
    const link = path.join(root, 'backend', 'evil');
    if (!tryLink(outside, link)) return;
    fs.writeFileSync(path.join(outside, 'c.json'), '{"stolen":true}');
    expect(() => store.read('backend/evil/c.json')).toThrow(/symbolic link or junction/);
    expect(() => store.write('backend/evil/c.json', '{}')).toThrow(/symbolic link or junction/);
    expect(fs.readFileSync(path.join(outside, 'c.json'), 'utf8')).toBe('{"stolen":true}');
  });

  it('refuses when the state root itself is a link', () => {
    const linkedRoot = path.join(root, 'linked');
    if (!tryLink(outside, linkedRoot)) return;
    const store = createFileStateStore(linkedRoot);
    expect(() => store.read('backend/conversations/c.json')).toThrow(/symbolic link or junction/);
  });

  it('detects a real NTFS junction created with mklink /J (Windows only)', () => {
    if (process.platform !== 'win32') return;
    const target = path.join(outside, 'jt');
    fs.mkdirSync(target);
    const junction = path.join(root, 'backend');
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', junction, target], { stdio: 'ignore' });
    const store = createFileStateStore(root);
    expect(() => store.read('backend/conversations/c.json')).toThrow(/symbolic link or junction/);
  });

  it('only accepts well-formed conversation ids (no separators, traversal or Windows device names)', async () => {
    const b = new LocalSquadBackend({ state: createFileStateStore(root) });
    for (const id of ['../x', 'a/b', 'a\\b', '', 'x'.repeat(129), 'NUL', 'com1', 'a:b']) {
      expect((await errorOf(b.createConversation({ conversationId: id })))?.code, id).toBe('invalid-request');
    }
    expect(fs.existsSync(path.join(root, 'backend'))).toBe(false);
  });
});

describe('G1 path containment: client projections (resolveInsideRoot)', () => {
  const CLIENT_DIRS = ['.claude', '.kiro', '.opencode', '.cursor', '.github', '.agents', '.squad'];

  it.each(CLIENT_DIRS)('rejects ../ traversal and absolute paths out of %s', (d) => {
    expect(() => resolveInsideRoot(root, `${d}/skills/../../../etc/passwd`)).toThrow(/outside the workspace/);
    expect(() => resolveInsideRoot(root, `${d}\\skills\\..\\..\\x`)).toThrow(/outside the workspace/);
    expect(() => resolveInsideRoot(root, path.join(outside, d, 'x'))).toThrow(/outside the workspace/);
  });

  it.each(CLIENT_DIRS)('rejects a symlinked component under %s', (d) => {
    fs.mkdirSync(path.join(root, d), { recursive: true });
    const link = path.join(root, d, 'evil');
    if (!tryLink(outside, link)) return;
    expect(() => resolveInsideRoot(root, `${d}/evil/SKILL.md`)).toThrow(/symlinked path component/);
  });

  it('rejects a client directory that was itself replaced by a link', () => {
    if (!tryLink(outside, path.join(root, '.cursor'))) return;
    expect(() => resolveInsideRoot(root, '.cursor/mcp.json')).toThrow(/symlinked path component/);
  });
});

// ---------- G2: MCP config merge ----------

describe('G2 MCP config merge (mergeMcpServer / installClients)', () => {
  const launch = { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] };
  const ctx = (): ClientContext => ({ root, mcp: launch });

  it('preserves unrelated servers and top-level keys', () => {
    const existing = { theme: 'dark', mcpServers: { github: { command: 'gh-mcp', env: { GH_TOKEN: 'keepme' } } } };
    const out = mergeMcpServer(existing, 'mcpServers', launch, { env: {} }) as { theme: string; mcpServers: Record<string, unknown> };
    expect(out.theme).toBe('dark');
    expect(out.mcpServers['github']).toEqual({ command: 'gh-mcp', env: { GH_TOKEN: 'keepme' } });
    expect(out.mcpServers['squad_state']).toMatchObject(launch);
  });

  it('keeps user env and custom fields on an existing squad_state entry; only launch fields are owned', () => {
    const existing = { mcpServers: { squad_state: { command: 'old', env: { SQUAD_MODE: 'custom', MY_VAR: '1' }, tools: ['x'] } } };
    const out = mergeMcpServer(existing, 'mcpServers', launch, { env: {}, tools: ['*'] }) as { mcpServers: { squad_state: Record<string, unknown> } };
    expect(out.mcpServers.squad_state).toEqual({ ...launch, env: { SQUAD_MODE: 'custom', MY_VAR: '1' }, tools: ['x'] });
  });

  it('refuses to overwrite a container or entry of the wrong type', () => {
    expect(() => mergeMcpServer({ mcpServers: [] }, 'mcpServers', launch)).toThrow(/expected a JSON object/);
    expect(() => mergeMcpServer({ mcpServers: { squad_state: 'str' } }, 'mcpServers', launch)).toThrow(/expected a JSON object/);
  });

  it('a __proto__ key in the existing config does not pollute Object.prototype', () => {
    const existing = JSON.parse('{"mcpServers":{"__proto__":{"polluted":true}}}') as Record<string, unknown>;
    mergeMcpServer(existing, 'mcpServers', launch);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('leaves a malformed .mcp.json untouched and reports the error instead of clobbering it', () => {
    const file = path.join(root, '.mcp.json');
    fs.writeFileSync(file, '{ not json');
    const results = installClients(['claude'], ctx());
    const mcp = results.find(r => r.path === '.mcp.json')!;
    expect(mcp.action).toBe('error');
    expect(mcp.error).toMatch(/malformed/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ not json');
  });

  it.each(['[]', 'null', '"str"'])('refuses a non-object JSON root %s', (bad) => {
    const file = path.join(root, '.mcp.json');
    fs.writeFileSync(file, bad);
    const mcp = installClients(['claude'], ctx()).find(r => r.path === '.mcp.json')!;
    expect(mcp.action).toBe('error');
    expect(fs.readFileSync(file, 'utf8')).toBe(bad);
  });

  it('is idempotent on disk', () => {
    installClients(['claude'], ctx());
    const once = fs.readFileSync(path.join(root, '.mcp.json'), 'utf8');
    const again = installClients(['claude'], ctx()).find(r => r.path === '.mcp.json')!;
    expect(again.action).toBe('unchanged');
    expect(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe(once);
  });
});

// ---------- G3: idempotent admission ----------

describe('G3 (runId, seq) idempotent admission', () => {
  it('a verbatim retry is a duplicate with the original cursor; a changed payload is a conflict', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    const first = await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    const retry = await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    expect(retry).toMatchObject({ duplicate: true, cursor: first.cursor });
    expect((await errorOf(backend.sendMessage('c', msg('r', 1, { harness: 'copilot', content: 'tampered' }))))?.code).toBe('conflict');
    expect(harness.submits).toEqual([{ runId: 'r', seq: 1 }]);
    expect(await backend.getTranscript('c')).toHaveLength(1);
  });

  it('a duplicate admission survives a backend restart over the same durable state', async () => {
    const state = new MemoryStateStore();
    const a = backendWithHarness(state);
    await a.backend.createConversation({ conversationId: 'c' });
    await a.backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    const b = new LocalSquadBackend({ state, harnesses: a.harnesses });
    expect((await b.sendMessage('c', msg('r', 1, { harness: 'copilot' }))).duplicate).toBe(true);
    expect(a.harness.submits).toHaveLength(1);
  });

  it('createConversation is idempotent and never overwrites an existing conversation', async () => {
    const b = new LocalSquadBackend();
    const created = await b.createConversation({ conversationId: 'c', title: 'first' });
    const again = await b.createConversation({ conversationId: 'c', title: 'second' });
    expect(again).toEqual(created);
  });
});

// ---------- G4: capability negotiation ----------

describe('G4 effective capabilities = client ∩ backend ∩ policy', () => {
  it('intersectCapabilities is exhaustive over every subset of the backend set', () => {
    const caps = [...BACKEND_CAPABILITIES];
    const n = caps.length;
    for (let c = 0; c < 1 << n; c += 7) {
      for (let p = 0; p < 1 << n; p += 11) {
        const client = caps.filter((_, i) => c & (1 << i));
        const policy = caps.filter((_, i) => p & (1 << i));
        expect(intersectCapabilities(caps, client, policy)).toEqual(caps.filter(x => client.includes(x) && policy.includes(x)));
      }
    }
    expect(intersectCapabilities(caps, undefined, undefined)).toEqual(caps);
    expect(intersectCapabilities(caps, ['approvals', 'not-a-capability'], undefined)).toEqual(['approvals']);
  });

  it('negotiate() never widens beyond the backend set and derives approvals/resume from the effective set', async () => {
    const b = new LocalSquadBackend();
    const neg = await b.negotiate({ protocols: [BACKEND_PROTOCOL_VERSION], capabilities: ['approvals', 'cursor-reconnect', 'x-made-up'], policyCapabilities: ['cursor-reconnect'] });
    expect(neg.effectiveCapabilities).toEqual(['cursor-reconnect']);
    expect(neg.approvals).toBe(false);
    expect(neg.resume).toBe(true);
    expect(neg.harnesses).toEqual([]);
    expect((await errorOf(b.negotiate({ protocols: ['1.0'] })))?.code).toBe('unsupported-protocol');
  });

  it('client-side token resolution is a strict intersection too', () => {
    expect(resolveEffectiveCapabilityTokens(['approvals', 'subagents'], ['approvals'], undefined)).toEqual(['approvals']);
    expect(resolveEffectiveCapabilityTokens(['approvals', 'subagents'], undefined, ['subagents'])).toEqual(['subagents']);
    expect(resolveEffectiveCapabilityTokens(['approvals'], ['subagents'], ['approvals'])).toEqual([]);
  });

  it('persisted clients[] is projection config: non-portable values are rejected without being echoed', () => {
    const { clients, rejected } = normalizeClientIds(['claude', 'ghp_secret', '/home/me/.squad', 'thread_abc123', 'claude', 'unknown-host']);
    expect(clients).toEqual(['claude']);
    expect(rejected.filter(r => r.reason === 'sensitive').every(r => r.value === '[redacted]')).toBe(true);
    expect(rejected.some(r => r.reason === 'unknown' && r.value === 'unknown-host')).toBe(true);
    expect(() => assertPortableClients(['claude', 'token=abc'])).toThrow(/non-portable/);
    expect(() => assertPortableClients(['claude', 'token=abc'])).not.toThrow(/abc/);
    expect(assertPortableClients([...CLIENT_IDS])).toEqual([...CLIENT_IDS]);
  });
});

// ---------- G5: cooperative epoch fencing ----------

describe('G5 cooperative lease epochs (fencing of stale writers, NOT an identity boundary)', () => {
  it('rejects a stale epoch and, once fenced, an omitted epoch', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    expect((await b.sendMessage('c', msg('r', 1, { epoch: 3 }))).epoch).toBe(3);
    expect((await errorOf(b.sendMessage('c', msg('r', 2, { epoch: 2 }))))?.code).toBe('stale-epoch');
    expect((await errorOf(b.sendMessage('c', msg('r', 3))))?.code).toBe('stale-epoch');
    expect((await errorOf(b.cancelTurn('c', 1)))?.code).toBe('stale-epoch');
    expect((await errorOf(b.sendMessage('c', msg('r', 4, { epoch: 0 }))))?.code).toBe('invalid-request');
  });

  it('any caller presenting a higher epoch takes over: the epoch is client-asserted, not broker-issued', async () => {
    // documented limitation (proposal §4 and "Future work"): there is no holder identity behind an epoch
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('holder', 1, { epoch: 1 }));
    const takeover = await b.sendMessage('c', msg('intruder', 1, { epoch: 2 }));
    expect(takeover.epoch).toBe(2);
    expect((await errorOf(b.sendMessage('c', msg('holder', 2, { epoch: 1 }))))?.code).toBe('stale-epoch');
  });

  it('harness output issued under an older epoch is fenced off with an auditable control event', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    await backend.sendMessage('c', msg('r', 1, { harness: 'copilot', epoch: 3 }));
    harness.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1, epoch: 2 });
    expect((await backend.getTurn('c', 1)).state).toBe('running');
    const audit = (await backend.readEvents('c')).events.filter(e => e.type === 'harness.epoch-rejected');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.payload).toMatchObject({ rejectedEpoch: 2, currentEpoch: 3 });
  });
});

// ---------- G6: approvals and runId cancellation ----------

describe('G6 approvals echo an opaque harness hash; decisions are single-use; cancellation targets runId', () => {
  it('rejects a mismatched hash with no state change and accepts the verbatim echo exactly once', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    harness.emit(ask('r', 1, 'a1', 'opaque-from-harness'));
    expect((await backend.getApprovals('c'))[0]).toMatchObject({ approvalId: 'a1', version: 1, state: 'pending', hash: 'opaque-from-harness' });

    expect((await errorOf(backend.respondApproval('c', { approvalId: 'a1', hash: 'tampered', decision: 'approve' })))?.code).toBe('approval-hash-mismatch');
    expect((await backend.getTurn('c', 1)).state).toBe('awaiting-approval');
    expect(harness.approvals).toEqual([]);

    const turn = await backend.respondApproval('c', { approvalId: 'a1', hash: 'opaque-from-harness', decision: 'approve' });
    expect(turn.state).toBe('running');
    expect((await backend.getApprovals('c'))[0]).toMatchObject({ version: 2, state: 'approved', decision: 'approve' });
    expect((await errorOf(backend.respondApproval('c', { approvalId: 'a1', hash: 'opaque-from-harness', decision: 'approve' })))?.code).toBe('approval-not-pending');
    expect((await errorOf(backend.respondApproval('c', { approvalId: 'a1', hash: 'opaque-from-harness', decision: 'deny' })))?.code).toBe('approval-not-pending');
    expect(harness.approvals.map(a => a.approvalId)).toEqual(['a1']);
  });

  it('a redelivered approval-requested event does not create a second approval', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    harness.emit(ask('r', 1, 'a1', 'h'));
    harness.emit(ask('r', 1, 'a1', 'h'));
    expect(await backend.getApprovals('c')).toHaveLength(1);
  });

  it('cancelRun targets the stable runId across turns, is idempotent, and closes a pending approval', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    await backend.sendMessage('c', msg('r', 2, { harness: 'copilot' }));
    await backend.sendMessage('c', msg('other', 3, { harness: 'copilot' }));
    harness.emit(ask('r', 2, 'a2', 'h'));

    const tail = await backend.cancelRun('c', 'r', 'user-requested');
    expect(tail).toMatchObject({ runId: 'r', seq: 2, state: 'cancelled' });
    expect((await backend.getTurn('c', 1)).state).toBe('cancelled');
    expect((await backend.getTurn('c', 3)).state).toBe('running');
    expect((await backend.getApprovals('c'))[0]).toMatchObject({ approvalId: 'a2', state: 'cancelled', version: 2 });
    expect((await errorOf(backend.respondApproval('c', { approvalId: 'a2', hash: 'h', decision: 'approve' })))?.code).toBe('approval-not-pending');

    await backend.cancelRun('c', 'r');
    expect(harness.cancels.map(c => c.seq)).toEqual([1, 2]);
    expect((await errorOf(backend.cancelRun('c', 'nope')))?.code).toBe('not-found');
    const terminalEvents = (await backend.readEvents('c')).events.filter(e => e.type === 'turn.state' && (e.payload as { runId: string }).runId === 'r');
    expect(terminalEvents).toHaveLength(2); // exactly one terminal event per cancelled turn
  });

  it('a late harness state event cannot revive a terminal run', async () => {
    const { backend, harness } = backendWithHarness();
    await backend.createConversation({ conversationId: 'c' });
    await backend.sendMessage('c', msg('r', 1, { harness: 'copilot' }));
    await backend.cancelRun('c', 'r');
    harness.emit({ type: 'state', state: 'completed', runId: 'r', seq: 1 });
    harness.emit({ type: 'message', runId: 'r', seq: 1, message: { runId: 'r', seq: 1, role: 'assistant', content: 'late' } });
    expect((await backend.getTurn('c', 1)).state).toBe('cancelled');
    expect(await backend.getTranscript('c')).toHaveLength(1);
  });
});

// ---------- G7: cursors ----------

describe('G7 opaque cursors: validated for the conversation only (unsigned by design)', () => {
  it('rejects malformed and cross-conversation cursors and reports an unresumable position', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c1' });
    await b.createConversation({ conversationId: 'c2' });
    await b.sendMessage('c1', msg('r', 1));
    const page = await b.readEvents('c1');
    expect((await errorOf(b.readEvents('c2', { after: page.nextCursor })))?.code).toBe('invalid-request');
    expect((await errorOf(b.readEvents('c1', { after: 'not-a-cursor' })))?.code).toBe('invalid-request');
    expect((await errorOf(b.readEvents('c1', { after: Buffer.from('c1:c1:abc').toString('base64url') })))?.code).toBe('invalid-request');
    // a cursor ahead of the log is not an error but is reported as unresumable (client must re-sync)
    const ahead = await b.readEvents('c1', { after: Buffer.from('c1:c1:999').toString('base64url') });
    expect(ahead).toMatchObject({ events: [], resumable: false, lastAcceptedSeq: page.lastAcceptedSeq });
  });

  it('pages expose only cursor, lastAcceptedSeq and resumable; no lease or checkpoint material', async () => {
    const b = new LocalSquadBackend();
    await b.createConversation({ conversationId: 'c' });
    await b.sendMessage('c', msg('r', 1, { epoch: 5 }));
    const page = await b.readEvents('c');
    expect(Object.keys(page).sort()).toEqual(['events', 'lastAcceptedSeq', 'nextCursor', 'resumable']);
    for (const e of page.events) {
      expect(Buffer.from(e.cursor!, 'base64url').toString('utf8')).not.toMatch(/lease|checkpoint|epoch/i);
    }
  });
});

// ---------- G8: MCP bridge opt-in and error surface ----------

describe('G8 MCP bridge: explicit opt-in, canonical errors, no silent queueing without a harness', () => {
  it('SQUAD_BACKEND_URL alone never enables the squad_backend_* tools', () => {
    expect(isExperimentalBackendEnabled([], { SQUAD_BACKEND_URL: 'https://durable.test', SQUAD_BACKEND_TOKEN: 't' })).toBe(false);
    expect(isExperimentalBackendEnabled(['--experimental-backend'], {})).toBe(true);
    expect(isExperimentalBackendEnabled([], { SQUAD_EXPERIMENTAL_BACKEND: '1' })).toBe(true);
  });

  it('returns BackendErrorInfo for contract errors and a generic message for anything else', async () => {
    const b = new LocalSquadBackend({ kind: 'mcp' });
    const tools = createBackendMcpTools(() => b);
    const tool = (n: string) => tools.find(t => t.name === n)!;
    const res = await callBackendMcpTool(tool('squad_backend_get_turn'), { conversationId: 'missing', seq: 1 });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]!.text).error).toMatchObject({ code: 'not-found', retryable: false, status: 404 });

    const leaky = { ...tool('squad_backend_health'), call: async () => { throw new Error(`EACCES ${path.join(root, 'secret.json')}`); } };
    const generic = await callBackendMcpTool(leaky, {});
    expect(generic.isError).toBe(true);
    expect(generic.content[0]!.text).not.toContain(root);
  });

  it('send_message is refused (not queued) when no harness is registered', async () => {
    const b = new LocalSquadBackend({ kind: 'mcp' });
    const tools = createBackendMcpTools(() => b);
    const tool = (n: string) => tools.find(t => t.name === n)!;
    await tool('squad_backend_create_conversation').call({ conversationId: 'c' });
    const res = await callBackendMcpTool(tool('squad_backend_send_message'), { conversationId: 'c', runId: 'r', seq: 1, content: 'x' });
    expect(JSON.parse(res.content[0]!.text).error).toMatchObject({ code: 'unavailable', details: { executionAvailable: false } });
    expect(await tool('squad_backend_health').call({})).toMatchObject({ executionAvailable: false, harnesses: [] });
    expect(await b.getTranscript('c')).toEqual([]);
  });
});

// ---------- G9: remote transport ----------

describe('G9 durable-http transport: https only, bearer never replayed through redirects', () => {
  it('refuses plain http to a non-loopback host and any non-URL', () => {
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'http://durable.test', token: 't' })).toThrow(/https/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'durable.test' })).toThrow(/not a valid URL/);
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'http://localhost:7777' })).not.toThrow();
    expect(() => new DurableHttpSquadBackend({ baseUrl: 'https://durable.test' })).not.toThrow();
  });

  it('every request carries redirect: "error" and a timeout signal, and the token goes only to the configured origin', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const b = new DurableHttpSquadBackend({ baseUrl: 'https://durable.test/', token: 'secret', fetch: f as never, retryDelayMs: 1 });
    await b.createConversation({ conversationId: 'c' });
    await b.health();
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const { url, init } of calls) {
      expect(url.startsWith('https://durable.test/')).toBe(true);
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret');
    }
  });
});
