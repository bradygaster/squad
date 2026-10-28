import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  DefaultHarnessRegistry,
  LocalSquadBackend,
  createFileStateStore,
  type HarnessAdapter,
  type HarnessEventEnvelope,
} from '../packages/squad-sdk/src/backend/index.js';
import { SQUAD_STATE_KEY, installClients, type ClientContext } from '../packages/squad-sdk/src/clients/index.js';

/**
 * Real-process tests: the projected client config files are parsed from disk and the
 * `state-mcp` server is spawned from exactly what they say, then driven over real
 * stdin/stdout pipes with MCP JSON-RPC 2.0. When the real `claude`, `opencode` and
 * `kiro` binaries are on PATH they are smoke-tested against the same workspaces.
 */

const ROOT = path.resolve(__dirname, '..');
const SDK_SRC = path.join(ROOT, 'packages', 'squad-sdk', 'src');
const STATE_MCP = path.join(ROOT, 'packages', 'squad-cli', 'src', 'cli', 'commands', 'state-mcp.ts');
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'capability-matrix.json'), 'utf8')) as {
  clients: Record<string, { clientCapabilities: string[]; effectiveCapabilities: string[] }>;
  policyCapabilities: string[];
};

const CLIENTS = ['claude', 'opencode', 'kiro'] as const;
type RealClient = (typeof CLIENTS)[number];

const BACKEND_TOOLS = [
  'squad_backend_negotiate', 'squad_backend_create_conversation', 'squad_backend_send_message',
  'squad_backend_get_turn', 'squad_backend_get_transcript', 'squad_backend_read_events',
  'squad_backend_cancel_turn', 'squad_backend_cancel_run', 'squad_backend_get_approvals',
  'squad_backend_respond_approval', 'squad_backend_health',
];
const STATE_TOOLS = ['squad_decide', 'squad_state_read', 'squad_state_write', 'squad_state_append', 'squad_state_delete', 'squad_state_list', 'squad_state_health'];

// ── tiny TypeScript-aware Node loader so the real CLI source runs as a child process ──

const HOOKS = `
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const SDK_SRC = ${JSON.stringify(SDK_SRC)};
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const hit = (f) => ({ url: pathToFileURL(f).href, shortCircuit: true });
export async function resolve(spec, ctx, next) {
  if (spec === '@bradygaster/squad-sdk') return hit(path.join(SDK_SRC, 'index.ts'));
  const m = /^@bradygaster\\/squad-sdk\\/(.+)$/.exec(spec);
  if (m) for (const c of [m[1] + '/index.ts', m[1] + '.ts']) if (isFile(path.join(SDK_SRC, c))) return hit(path.join(SDK_SRC, c));
  if ((spec.startsWith('./') || spec.startsWith('../')) && spec.endsWith('.js') && ctx.parentURL && ctx.parentURL.startsWith('file:')) {
    const f = fileURLToPath(new URL(spec.slice(0, -3) + '.ts', ctx.parentURL));
    if (isFile(f)) return hit(f);
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const file = fileURLToPath(url);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, sourceMap: false },
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  return next(url, ctx);
}
`;
const REGISTER = `import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n`;
const ENTRY = `const { runStateMcp } = await import(${JSON.stringify(pathToFileURL(STATE_MCP).href)});\nawait runStateMcp(process.cwd());\n`;

// ── MCP stdio client ────────────────────────────────────────────────

interface LaunchSpec { command: string; args: string[]; env?: Record<string, string> }

class McpStdioClient {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  stderr = '';
  exited: Promise<number | null>;

  constructor(spec: LaunchSpec, cwd: string) {
    const baseEnv = { ...process.env };
    delete baseEnv['SQUAD_BACKEND_URL'];
    delete baseEnv['SQUAD_BACKEND_TOKEN'];
    delete baseEnv['SQUAD_EXPERIMENTAL_BACKEND'];
    this.proc = spawn(spec.command, spec.args, { cwd, env: { ...baseEnv, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d: string) => this.onData(d));
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (d: string) => { this.stderr += d; });
    this.exited = new Promise(res => this.proc.on('exit', code => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`server exited (${code}): ${this.stderr.slice(-2000)}`)); }
      this.pending.clear();
      res(code);
    }));
  }

  get pid(): number | undefined { return this.proc.pid; }

  private onData(chunk: string): void {
    this.buf += chunk;
    for (;;) {
      // newline-delimited JSON (SDK stdio transport); tolerate Content-Length framing too
      const header = /^Content-Length:\s*(\d+)\r?\n\r?\n/i.exec(this.buf);
      let raw: string;
      if (header) {
        const len = Number(header[1]);
        const start = header[0].length;
        if (this.buf.length < start + len) return;
        raw = this.buf.slice(start, start + len);
        this.buf = this.buf.slice(start + len);
      } else {
        const nl = this.buf.indexOf('\n');
        if (nl === -1) return;
        raw = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!raw) continue;
      }
      let msg: any;
      try { msg = JSON.parse(raw); } catch { continue; }
      const p = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
      if (p) { clearTimeout(p.timer); this.pending.delete(msg.id); p.resolve(msg); }
    }
  }

  request(method: string, params?: unknown, timeoutMs = 60_000): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}; stderr: ${this.stderr.slice(-2000)}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  notify(method: string, params?: unknown): void {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async handshake(): Promise<any> {
    const res = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'squad-real-client-test', version: '0.0.0' },
    });
    this.notify('notifications/initialized');
    return res.result;
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; text: string; json: any }> {
    const res = await this.request('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`${name}: ${JSON.stringify(res.error)}`);
    const text: string = res.result?.content?.[0]?.text ?? '';
    let json: any;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { isError: res.result?.isError === true, text, json };
  }

  async close(): Promise<void> {
    this.proc.stdin.end();
    const timer = setTimeout(() => this.proc.kill(), 3000);
    await this.exited;
    clearTimeout(timer);
  }
}

// ── workspace scaffolding ───────────────────────────────────────────

let tmpRoot: string;
let loaderDir: string;
const workspaces = new Map<RealClient, string>();

/** Minimal harness used only to leave a pending approval in persisted state (as a prior session would). */
class SeedHarness implements HarnessAdapter {
  readonly id = 'copilot';
  readonly capabilities = { streaming: true, approvals: true, cancellation: true, tools: true, extensionNamespaces: ['x-copilot'] };
  private listeners = new Set<(e: HarnessEventEnvelope) => void>();
  async submit() { /* no-op */ }
  subscribe(_c: string, l: (e: HarnessEventEnvelope) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  async cancel() { /* no-op */ }
  async respondApproval() { /* no-op */ }
  describe() { return { id: this.id, capabilities: this.capabilities }; }
  emit(e: HarnessEventEnvelope) { this.listeners.forEach(l => l(e)); }
}

async function scaffold(client: RealClient): Promise<string> {
  const ws = path.join(tmpRoot, `ws-${client}`);
  fs.mkdirSync(path.join(ws, '.squad', 'agents', 'data'), { recursive: true });
  fs.writeFileSync(path.join(ws, '.squad', 'config.json'), JSON.stringify({ version: '2.0', stateBackend: 'local' }, null, 2) + '\n');
  fs.writeFileSync(path.join(ws, '.squad', 'team.md'), '# Team\n\n| Name | Role |\n|---|---|\n| Data | Framework Expert |\n');
  fs.writeFileSync(path.join(ws, '.squad', 'decisions.md'), '# Decisions\n');
  fs.writeFileSync(path.join(ws, '.squad', 'agents', 'data', 'charter.md'), '# Data\n');

  const ctx: ClientContext = {
    root: ws,
    mcp: { command: process.execPath, args: ['--import', pathToFileURL(path.join(loaderDir, 'register.mjs')).href, path.join(loaderDir, 'entry.mjs')] },
  };
  const results = installClients([client], ctx);
  expect(results.filter(r => r.action === 'error')).toEqual([]);

  // a previous session left an approval in flight
  const registry = new DefaultHarnessRegistry();
  const seed = new SeedHarness();
  registry.register(seed);
  const backend = new LocalSquadBackend({ state: createFileStateStore(path.join(ws, '.squad')), harnesses: registry });
  await backend.createConversation({ conversationId: 'seeded' });
  await backend.sendMessage('seeded', { runId: 'seed-run', seq: 1, role: 'user', content: 'deploy?', harness: 'copilot' });
  seed.emit({ type: 'approval-requested', runId: 'seed-run', seq: 1, request: { approvalId: 'appr-1', turnSeq: 1, action: 'deploy', hash: 'sha256:deploy-v1' } });
  return ws;
}

/** Parse the launch command out of the files the client host would actually read. */
function launchFromDisk(client: RealClient, ws: string): LaunchSpec {
  const file = { claude: '.mcp.json', opencode: 'opencode.json', kiro: path.join('.kiro', 'settings', 'mcp.json') }[client];
  const parsed = JSON.parse(fs.readFileSync(path.join(ws, file), 'utf8'));
  if (client === 'opencode') {
    const entry = parsed.mcp[SQUAD_STATE_KEY];
    expect(entry).toMatchObject({ type: 'local', enabled: true });
    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    const [command, ...args] = entry.command as string[];
    return { command: command!, args, env: entry.environment };
  }
  const entry = parsed.mcpServers[SQUAD_STATE_KEY];
  expect(typeof entry.command).toBe('string');
  return { command: entry.command, args: entry.args, env: entry.env };
}

beforeAll(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squad20-real-'));
  // repo-local so the bundled `typescript` resolves from node_modules
  loaderDir = path.join(ROOT, `.test-real-clients-${randomBytes(4).toString('hex')}`);
  fs.mkdirSync(loaderDir, { recursive: true });
  fs.writeFileSync(path.join(loaderDir, 'hooks.mjs'), HOOKS);
  fs.writeFileSync(path.join(loaderDir, 'register.mjs'), REGISTER);
  fs.writeFileSync(path.join(loaderDir, 'entry.mjs'), ENTRY);
  for (const c of CLIENTS) workspaces.set(c, await scaffold(c));
}, 120_000);

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(loaderDir, { recursive: true, force: true });
});

// ── projections on disk ─────────────────────────────────────────────

describe('real client projections on disk', () => {
  it('writes the host config and agent files each client reads', () => {
    const expected: Record<RealClient, string[]> = {
      claude: ['.mcp.json', '.claude/agents/squad.md', 'CLAUDE.md'],
      opencode: ['opencode.json', '.opencode/agent/squad.md'],
      kiro: ['.kiro/settings/mcp.json', '.kiro/agents/squad.json', '.kiro/steering/squad.md'],
    };
    for (const c of CLIENTS) {
      for (const rel of expected[c]) expect(fs.existsSync(path.join(workspaces.get(c)!, rel)), `${c}: ${rel}`).toBe(true);
    }
    // The Claude coordinator has no tools allowlist, so squad_state and user-added MCP servers are all inherited.
    expect(fs.readFileSync(path.join(workspaces.get('claude')!, '.claude/agents/squad.md'), 'utf8')).toMatch(/^---\nname: squad\ndescription: ".*"\n---\n/);
    expect(JSON.parse(fs.readFileSync(path.join(workspaces.get('kiro')!, '.kiro/agents/squad.json'), 'utf8'))).toBeTypeOf('object');
  });

  it.each(CLIENTS)('%s: config parses back to a launchable command', (c) => {
    const spec = launchFromDisk(c, workspaces.get(c)!);
    expect(spec.command).toBe(process.execPath);
    expect(spec.args[0]).toBe('--import');
  });
});

// ── real child-process stdio MCP ────────────────────────────────────

describe.each(CLIENTS)('real stdio MCP server launched from the %s config', (client) => {
  let ws: string;
  let server: McpStdioClient | undefined;
  beforeAll(() => { ws = workspaces.get(client)!; });
  afterAll(async () => { await server?.close(); });

  it('omits experimental squad_backend_* tools from tools/list unless opted in', async () => {
    const baseSpec = launchFromDisk(client, ws);
    const defaultServer = new McpStdioClient({
      ...baseSpec,
      env: { ...baseSpec.env, SQUAD_EXPERIMENTAL_BACKEND: '', SQUAD_BACKEND_URL: '' },
    }, ws);
    try {
      await defaultServer.handshake();
      const list = await defaultServer.request('tools/list', {});
      const names: string[] = list.result.tools.map((t: { name: string }) => t.name);
      for (const t of STATE_TOOLS) expect(names, t).toContain(t);
      expect(names.filter(n => n.startsWith('squad_backend_'))).toEqual([]);
    } finally {
      await defaultServer.close();
    }
  }, 120_000);

  it('completes the MCP handshake and lists squad_state_* and all squad_backend_* tools when opted in', async () => {
    const baseSpec = launchFromDisk(client, ws);
    server = new McpStdioClient({
      ...baseSpec,
      env: { ...baseSpec.env, SQUAD_EXPERIMENTAL_BACKEND: '1' },
    }, ws);
    const init = await server.handshake();
    expect(init.serverInfo.name).toBe('squad-state');
    expect(init.capabilities.tools).toBeDefined();
    expect(server.pid).toBeGreaterThan(0);

    const list = await server.request('tools/list', {});
    const names: string[] = list.result.tools.map((t: { name: string }) => t.name);
    for (const t of [...STATE_TOOLS, ...BACKEND_TOOLS]) expect(names, t).toContain(t);
    expect(names.filter(n => n.startsWith('squad_backend_')).sort()).toEqual([...BACKEND_TOOLS].sort());
    expect(names.filter(n => n.startsWith('squad_state_')).length).toBeGreaterThanOrEqual(6);
    for (const t of list.result.tools) expect(t.inputSchema.type).toBe('object');
  }, 120_000);

  it('executes squad_state tools against the workspace .squad directory', async () => {
    const health = await server!.call('squad_state_health');
    expect(health.isError).toBe(false);
    expect(health.text.length).toBeGreaterThan(0);

    const written = await server!.call('squad_state_write', { key: 'agents/data/history.md', content: `# History\n\n- ${client} was here\n` });
    expect(written.isError).toBe(false);
    const read = await server!.call('squad_state_read', { key: 'agents/data/history.md' });
    expect(read.text).toContain(`${client} was here`);
    expect(fs.readFileSync(path.join(ws, '.squad', 'agents', 'data', 'history.md'), 'utf8')).toContain(`${client} was here`);
    const listed = await server!.call('squad_state_list', { key: 'agents/data' });
    expect(listed.isError).toBe(false);
  });

  it('negotiates capabilities for the client per capability-matrix.json', async () => {
    const entry = matrix.clients[client]!;
    const neg = await server!.call('squad_backend_negotiate', {
      protocols: ['2.0'], clientName: client, capabilities: entry.clientCapabilities, policyCapabilities: matrix.policyCapabilities,
    });
    expect(neg.isError).toBe(false);
    expect(neg.json.effectiveCapabilities).toEqual(entry.effectiveCapabilities);
    expect(neg.json.protocol).toBe('2.0');
    const bad = await server!.call('squad_backend_negotiate', { protocols: ['0.1'] });
    expect(bad.isError).toBe(true);
    expect(bad.json.error).toMatchObject({ code: 'unsupported-protocol', retryable: false });
  });

  it('runs a backend conversation over real JSON-RPC: create, refuse execution without a harness, page events', async () => {
    const conv = await server!.call('squad_backend_create_conversation', { conversationId: `${client}-conv`, title: `real ${client}` });
    expect(conv.json).toMatchObject({ conversationId: `${client}-conv`, epoch: 1 });

    // no execution harness ships with the CLI: the bridge refuses to admit a turn instead of queueing it forever
    const sent = await server!.call('squad_backend_send_message', {
      conversationId: `${client}-conv`, runId: `${client}-run`, seq: 1, correlationId: 'corr-real',
      parts: [{ type: 'text', text: 'hello from a real client' }, { type: 'resource', uri: 'file:///README.md', title: 'README' }],
    });
    expect(sent.isError).toBe(true);
    expect(sent.json.error).toMatchObject({ code: 'unavailable', retryable: true, details: { executionAvailable: false } });
    expect(sent.json.error.message).toMatch(/No execution harness is registered/);

    const transcript = await server!.call('squad_backend_get_transcript', { conversationId: `${client}-conv` });
    expect(transcript.json).toEqual([]);
    expect((await server!.call('squad_backend_get_turn', { conversationId: `${client}-conv`, seq: 1 })).json.error.code).toBe('not-found');

    const page1 = await server!.call('squad_backend_read_events', { conversationId: `${client}-conv`, limit: 1 });
    expect(page1.json.events.map((e: { type: string; sequence: number }) => [e.type, e.sequence])).toEqual([['conversation.created', 1]]);
    const page2 = await server!.call('squad_backend_read_events', { conversationId: `${client}-conv`, after: page1.json.nextCursor });
    expect(page2.json).toMatchObject({ events: [], resumable: true, lastAcceptedSeq: 1, nextCursor: page1.json.nextCursor });
    expect((await server!.call('squad_backend_read_events', { conversationId: `${client}-conv`, limit: 0 })).json.error.code).toBe('invalid-request');

    expect((await server!.call('squad_backend_cancel_run', { conversationId: `${client}-conv`, runId: 'nope' })).json.error.code).toBe('not-found');

    // persisted by the child process into the real workspace
    expect(fs.existsSync(path.join(ws, '.squad', 'backend', 'conversations', `${client}-conv.json`))).toBe(true);
  });

  it('serves durable, versioned approvals left by a prior session and enforces hash binding', async () => {
    const approvals = await server!.call('squad_backend_get_approvals', { conversationId: 'seeded' });
    expect(approvals.json).toMatchObject([{ approvalId: 'appr-1', version: 1, state: 'pending', hash: 'sha256:deploy-v1' }]);

    const tampered = await server!.call('squad_backend_respond_approval', { conversationId: 'seeded', approvalId: 'appr-1', hash: 'sha256:evil', decision: 'approve' });
    expect(tampered.isError).toBe(true);
    expect(tampered.json.error.code).toBe('approval-hash-mismatch');

    const ok = await server!.call('squad_backend_respond_approval', { conversationId: 'seeded', approvalId: 'appr-1', hash: 'sha256:deploy-v1', decision: 'approve' });
    // the seeding harness ('copilot') is not registered in this server process: the decision is durable but its
    // delivery stays queued and is reported as retryable instead of being silently discarded
    expect(ok.isError).toBe(true);
    expect(ok.json.error).toMatchObject({ code: 'unavailable', retryable: true });
    expect((await server!.call('squad_backend_get_approvals', { conversationId: 'seeded' })).json[0]).toMatchObject({ version: 2, state: 'approved' });
    const again = await server!.call('squad_backend_respond_approval', { conversationId: 'seeded', approvalId: 'appr-1', hash: 'sha256:deploy-v1', decision: 'approve' });
    expect(again.json.error).toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('reports backend health with an explicit executionAvailable: false (no bundled harness)', async () => {
    const health = await server!.call('squad_backend_health');
    expect(health.json).toMatchObject({ ok: true, backend: 'mcp', harnesses: [], executionAvailable: false });
    const neg = await server!.call('squad_backend_negotiate', { protocols: ['2.0'] });
    expect(neg.json).toMatchObject({ harnesses: [], executionAvailable: false });
  });

  it('survives a real server process restart and resumes from the old cursor', async () => {
    const first = await server!.call('squad_backend_read_events', { conversationId: `${client}-conv`, limit: 1 });
    const cursor = first.json.nextCursor as string;
    const oldPid = server!.pid;
    await server!.close();

    const baseSpec = launchFromDisk(client, ws);
    server = new McpStdioClient({
      ...baseSpec,
      env: { ...baseSpec.env, SQUAD_EXPERIMENTAL_BACKEND: '1' },
    }, ws);
    await server.handshake();
    expect(server.pid).not.toBe(oldPid);
    const resumed = await server!.call('squad_backend_read_events', { conversationId: `${client}-conv`, after: cursor });
    expect(resumed.json.resumable).toBe(true);
    const all = await server!.call('squad_backend_read_events', { conversationId: `${client}-conv` });
    const seqs = all.json.events.map((e: { sequence: number }) => e.sequence);
    expect(seqs).toEqual(seqs.map((_: number, i: number) => i + 1));
    expect(resumed.json.events.map((e: { sequence: number }) => e.sequence)).toEqual(seqs.slice(1));
    expect((await server.call('squad_backend_get_approvals', { conversationId: 'seeded' })).json[0].version).toBe(2);
    // still no harness after the restart: execution is still refused, transcripts are still intact
    expect((await server.call('squad_backend_send_message', { conversationId: `${client}-conv`, runId: `${client}-run`, seq: 1, content: 'again' })).json.error.code).toBe('unavailable');
    expect((await server.call('squad_backend_get_transcript', { conversationId: `${client}-conv` })).json).toEqual([]);
  }, 120_000);
});

// ── live binaries (run for real whenever they are installed) ────────

function which(...names: string[]): string | undefined {
  const exts = process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : [''];
  // well-known per-user install dirs for installers that do not update the inherited PATH
  const extra = [process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Kiro-Cli'), path.join(os.homedir(), '.local', 'bin')].filter((d): d is string => !!d);
  for (const dir of [...(process.env['PATH'] ?? '').split(path.delimiter), ...extra]) {
    for (const name of names) {
      for (const ext of exts) {
        const full = path.join(dir, name + ext.toLowerCase());
        const alt = path.join(dir, name + ext);
        for (const f of [full, alt]) if (dir && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
      }
    }
  }
  return undefined;
}

function runBinary(bin: string, args: string[], cwd: string) {
  const viaShell = /\.(cmd|bat)$/i.test(bin);
  const r = spawnSync(viaShell ? `"${bin}"` : bin, args, { cwd, encoding: 'utf8', timeout: 90_000, shell: viaShell, env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, error: r.error };
}

/** xpect runs against the combined output of the real binary reading the projected workspace. */
const BINARIES: Array<{ client: RealClient; names: string[]; configChecks: Array<{ args: string[]; expect: RegExp; reject?: RegExp }> }> = [
  // claude lists project servers from .mcp.json (pending until the user approves them interactively)
  { client: 'claude', names: ['claude'], configChecks: [{ args: ['mcp', 'list'], expect: /squad_state/ }] },
  // opencode actually launches the server from opencode.json and health-checks it
  { client: 'opencode', names: ['opencode'], configChecks: [{ args: ['mcp', 'list'], expect: /squad_state/, reject: /failed|timed out/i }] },
  { client: 'kiro', names: ['kiro-cli', 'kiro'], configChecks: [{ args: ['agent', 'list'], expect: /squad/i }] },
];

// Opt-in only: these spawn whatever third-party binaries happen to be on PATH, which is slow and
// environment-dependent. Set SQUAD_REAL_CLI_TESTS=1 to run them.
//
// The skip decision is made once per binary and never nested: a `describe.skip` inside an
// already-skipped `describe` leaves its tests in vitest's `pending` state, which the console
// summary does not count (12142 + 35 + 56 + 47 = 12280 of 12286 at f22847a9; the 6 ghosts were
// these). `describe.skipIf` at one level reports every test as `skipped`.
const REAL_CLI = process.env['SQUAD_REAL_CLI_TESTS'] === '1';

describe('live client binaries (SQUAD_REAL_CLI_TESTS=1; executed when present on PATH)', () => {
  for (const b of BINARIES) {
    const bin = REAL_CLI ? which(...b.names) : null;
    const reason = !REAL_CLI ? 'SQUAD_REAL_CLI_TESTS unset' : bin ?? 'not installed';
    describe.skipIf(!bin)(`${b.client} (${reason})`, () => {
      it('reports a version', () => {
        const r = runBinary(bin!, ['--version'], workspaces.get(b.client)!);
        expect(r.error).toBeUndefined();
        expect(r.status).toBe(0);
        expect(r.out).toMatch(/\d+\.\d+/);
      }, 150_000);

      for (const check of b.configChecks) {
        it(`reads the projected workspace: ${check.args.join(' ')}`, () => {
          const r = runBinary(bin!, check.args, workspaces.get(b.client)!);
          expect(r.error, r.out).toBeUndefined();
          expect(r.status, r.out).toBe(0);
          expect(r.out).toMatch(check.expect);
          if (check.reject) expect(r.out).not.toMatch(check.reject);
        }, 150_000);
      }
    });
  }
});
