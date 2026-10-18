/**
 * Squad 2.0 security & contract validation suite.
 * Spec: docs/proposals/squad-2.0-security-and-isolation.md
 *
 * The reference guards below are the executable contract that every client
 * projection (Claude Code, Kiro, OpenCode, Cursor, Copilot) and the
 * DurableSquad backend must satisfy. Production implementations must pass
 * this same suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// ---------- reference guards ----------

const CLIENT_DIRS = ['.claude', '.kiro', '.opencode', '.cursor', '.github', '.agents', '.squad'];
const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

function isReparsePoint(p: string): boolean {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) return true;
  // Node reports junctions as symlinks; also honor the attribute bit when exposed.
  const attrs = (st as unknown as { fileAttributes?: number }).fileAttributes;
  return typeof attrs === 'number' && (attrs & FILE_ATTRIBUTE_REPARSE_POINT) !== 0;
}

/** Resolve `rel` under `root`; throws on traversal, absolute/UNC/ADS/NUL input, or any reparse point in the chain. */
function safeResolve(root: string, rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) throw new Error('invalid path');
  if (path.isAbsolute(rel) || /^[\\/]{2}/.test(rel) || /^[a-zA-Z]:/.test(rel)) throw new Error('absolute path rejected');
  if (rel.includes(':')) throw new Error('alternate data stream rejected');
  const segments = rel.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) throw new Error('traversal rejected');
  const base = fs.realpathSync(root);
  let cur = base;
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    cur = path.join(cur, seg);
    let exists = true;
    try { fs.lstatSync(cur); } catch { exists = false; }
    if (exists && isReparsePoint(cur)) throw new Error(`reparse point rejected: ${seg}`);
  }
  const rp = path.relative(base, cur);
  if (rp.startsWith('..') || path.isAbsolute(rp)) throw new Error('escapes root');
  return cur;
}

type McpServer = { command?: string; args?: string[]; env?: Record<string, string>; url?: string; [k: string]: unknown };

const MCP_TARGETS: Array<{ file: string; key: string }> = [
  { file: '.mcp.json', key: 'mcpServers' },
  { file: '.kiro/settings/mcp.json', key: 'mcpServers' },
  { file: 'opencode.json', key: 'mcp' },
  { file: '.cursor/mcp.json', key: 'mcpServers' },
];

const SHELL_META = /[;&|`$<>\n\r]/;
const SHELL_BINARIES = /^(?:.*[\\/])?(?:sh|bash|zsh|cmd|powershell|pwsh)(?:\.exe)?$/i;
const SECRET_KEY = /(token|secret|key|password|pat)$/i;

function validateServer(name: string, s: McpServer): void {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name) || name === '__proto__' || name === 'constructor') throw new Error('bad server name');
  if (s.url !== undefined) {
    if (!/^https:\/\//.test(s.url)) throw new Error('non-https url');
    return;
  }
  if (typeof s.command !== 'string' || !s.command) throw new Error('command required');
  if (SHELL_META.test(s.command) || /\s/.test(s.command)) throw new Error('unsafe command');
  if (SHELL_BINARIES.test(s.command)) throw new Error('shell interpreter command rejected');
  if (s.args !== undefined && (!Array.isArray(s.args) || s.args.some((a) => typeof a !== 'string' || a.includes('\0')))) {
    throw new Error('bad args');
  }
}

/** Merge a Squad-owned server into a client config without touching anything else. */
function mergeMcp(existingText: string | null, key: string, name: string, server: McpServer): string {
  validateServer(name, server);
  let doc: Record<string, unknown> = {};
  if (existingText !== null && existingText.trim() !== '') {
    let parsed: unknown;
    try { parsed = JSON.parse(existingText); } catch { throw new Error('existing config is malformed; refusing to overwrite'); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('existing config is not an object');
    doc = parsed as Record<string, unknown>;
  }
  const servers = Object.hasOwn(doc, key) ? (doc[key] as Record<string, McpServer>) : {};
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) throw new Error(`"${key}" is not an object`);
  const prev = Object.hasOwn(servers, name) ? servers[name] : undefined;
  const merged: McpServer = { ...server, ...(prev?.env || server.env ? { env: { ...(server.env ?? {}), ...(prev?.env ?? {}) } } : {}) };
  const next: Record<string, McpServer> = {};
  for (const [k, v] of Object.entries(servers)) Object.defineProperty(next, k, { value: v, enumerable: true, writable: true, configurable: true });
  next[name] = merged;
  return JSON.stringify({ ...doc, [key]: next }, null, 2) + '\n';
}

function redactEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, SECRET_KEY.test(k) ? '***' : v]));
}

interface Proposal { runId: string; action: string; args: unknown; epoch: number }
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(v);
const hashProposal = (p: Proposal) => createHash('sha256').update(canon(p)).digest('hex');

class Broker {
  epoch = 0;
  private holder: string | null = null;
  private seen = new Map<string, unknown>();
  private approvals = new Set<string>();
  state: string[] = [];

  acquire(holder: string): number { this.epoch += 1; this.holder = holder; return this.epoch; }
  approve(p: Proposal): string { const h = hashProposal(p); this.approvals.add(h); return h; }
  apply(p: Proposal, approvalHash: string, seq: number, holder: string): unknown {
    if (holder !== this.holder || p.epoch !== this.epoch) throw new Error('stale epoch: fenced');
    const key = `${p.runId}:${seq}`;
    if (this.seen.has(key) && approvalHash === hashProposal(p)) return this.seen.get(key); // idempotent replay
    if (approvalHash !== hashProposal(p) || !this.approvals.has(approvalHash)) throw new Error('approval hash mismatch');
    this.approvals.delete(approvalHash); // single use
    this.state.push(`${p.action}@${seq}`);
    this.seen.set(key, 'ok');
    return 'ok';
  }
}

// ---------- capability negotiation (clients[] is projection config, never authority) ----------

type Capability = string;
interface PolicyCapabilities { granted: readonly Capability[]; denied?: readonly Capability[] }
type StripReason = 'not-in-backend' | 'denied-by-policy' | 'not-granted-by-policy';
interface Negotiated { effective: Capability[]; stripped: Array<{ capability: Capability; reason: StripReason }> }

/** effectiveCapabilities = clientCapabilities ∩ backendCapabilities ∩ policyCapabilities (explicit deny always wins). */
function negotiate(client: readonly Capability[], backend: readonly Capability[], policy: PolicyCapabilities): Negotiated {
  if (client.some((c) => typeof c !== 'string' || c === '')) throw new Error('bad capability');
  const be = new Set(backend);
  const granted = new Set(policy.granted);
  const denied = new Set(policy.denied ?? []);
  const out: Negotiated = { effective: [], stripped: [] };
  for (const capability of new Set(client)) {
    if (denied.has(capability)) out.stripped.push({ capability, reason: 'denied-by-policy' });
    else if (!be.has(capability)) out.stripped.push({ capability, reason: 'not-in-backend' });
    else if (!granted.has(capability)) out.stripped.push({ capability, reason: 'not-granted-by-policy' });
    else out.effective.push(capability);
  }
  return out;
}

/** Only a live negotiation result can authorize execution; persisted config never can. */
const authorize = (n: Negotiated | undefined, cap: Capability): boolean => n !== undefined && n.effective.includes(cap);

const NON_PORTABLE_KEY = /(credential|password|passwd|secret|token|apikey|authorization|cookie|privatekey|leaseid|checkpoint|threadid|providerthread)/;
const ABS_PATH_VALUE = /^(?:[a-zA-Z]:[\\/]|\\\\|\/(?!\/)|~[\\/]|file:)|(?:^|[\s"'=])(?:[a-zA-Z]:[\\/]|\/(?:home|Users|root|etc|var|tmp|mnt|opt)\/)/;
const SECRET_VALUE = /(?:\bghp_|\bgho_|github_pat_|\bsk-[A-Za-z0-9]|\bxox[baprs]-|\bAKIA[0-9A-Z]{16}|\beyJ[A-Za-z0-9_-]{10,}\.|\bBearer\s)/;
const OPAQUE_INTERNAL_VALUE = /^(?:lease[-_]|cur_|(?:thread|conv)_[A-Za-z0-9]{6,}$)/i;

/** Portable config/projection artifacts: no credentials, provider thread ids, machine paths, lease tokens or checkpoint state. */
function assertPortable(v: unknown, at = '$'): void {
  if (typeof v === 'string') {
    if (ABS_PATH_VALUE.test(v)) throw new Error(`machine-specific path at ${at}`);
    if (SECRET_VALUE.test(v)) throw new Error(`credential-like value at ${at}`);
    if (OPAQUE_INTERNAL_VALUE.test(v)) throw new Error(`lease/provider-thread value at ${at}`);
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => assertPortable(x, `${at}[${i}]`)); return; }
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (NON_PORTABLE_KEY.test(k.toLowerCase().replace(/[^a-z]/g, ''))) throw new Error(`non-portable field ${at}.${k}`);
      assertPortable(x, `${at}.${k}`);
    }
  }
}

interface ClientEntry { id: string; adapter: string; capabilities?: Capability[]; displayName?: string; [k: string]: unknown }
const ADAPTER_DIRS: Record<string, string> = { copilot: '.github', claude: '.claude', kiro: '.kiro', opencode: '.opencode', cursor: '.cursor' };

function loadConfiguredClients(rootDir: string): ClientEntry[] {
  const doc = JSON.parse(fs.readFileSync(safeResolve(rootDir, '.squad/config.json'), 'utf8')) as { clients?: unknown };
  if (!Array.isArray(doc.clients)) throw new Error('clients[] missing');
  assertPortable(doc.clients, 'clients');
  return doc.clients as ClientEntry[];
}

/** Whitelist projection: unknown fields are dropped, never copied through. */
function projectClientArtifact(entry: ClientEntry): Record<string, unknown> {
  const dir = Object.hasOwn(ADAPTER_DIRS, entry.adapter) ? ADAPTER_DIRS[entry.adapter] : undefined;
  if (!dir) throw new Error('unknown adapter');
  const artifact = { id: entry.id, adapter: entry.adapter, dir, requestedCapabilities: [...(entry.capabilities ?? [])] };
  assertPortable(artifact);
  return artifact;
}

// ---------- versioned durable approvals & runId-addressed cancellation ----------

type ApprovalStatus = 'requested' | 'approved' | 'denied' | 'expired';
interface Approval { approvalId: string; version: number; scope: string; expiresAt: number; status: ApprovalStatus; runId: string; payloadHash: string }
const hashPayload = (runId: string, scope: string, payload: unknown) => createHash('sha256').update(canon({ runId, scope, payload })).digest('hex');

class ApprovalStore {
  private items = new Map<string, Approval>();
  constructor(private now: () => number) {}

  request(a: { approvalId: string; scope: string; runId: string; payload: unknown; ttlMs: number }): Approval {
    if (this.items.has(a.approvalId)) throw new Error('approval exists');
    const rec: Approval = { approvalId: a.approvalId, version: 1, scope: a.scope, expiresAt: this.now() + a.ttlMs, status: 'requested', runId: a.runId, payloadHash: hashPayload(a.runId, a.scope, a.payload) };
    this.items.set(a.approvalId, rec);
    return { ...rec };
  }

  /** v1 (requested) -> v2 (decided). Stale version or mismatched payloadHash is rejected with no state change. */
  decide(approvalId: string, expectedVersion: number, payloadHash: string, decision: 'approved' | 'denied'): Approval {
    const rec = this.items.get(approvalId);
    if (!rec) throw new Error('unknown approval');
    if (expectedVersion !== rec.version) throw new Error('stale version');
    if (rec.status !== 'requested') throw new Error('already decided');
    if (payloadHash !== rec.payloadHash) throw new Error('payloadHash mismatch');
    if (this.now() >= rec.expiresAt) { rec.status = 'expired'; rec.version += 1; throw new Error('approval expired'); }
    rec.status = decision;
    rec.version += 1;
    return { ...rec };
  }

  get(approvalId: string): Approval | undefined { const r = this.items.get(approvalId); return r && { ...r }; }
}

// ---------- canonical events, loss-tolerant ingest, client projections ----------

interface CanonicalEvent { id: number; kind: string; runId: string | null; seq: number | null; data: unknown }
const KNOWN_KINDS = new Set(['TurnAccepted', 'OutputDelta', 'ApprovalRequested', 'ApprovalDecided', 'CancellationRequested', 'TurnCompleted', 'TurnCancelled']);
interface ClientCursor { cursor: string; lastAcceptedSeq: number; resumable: boolean }

class DurableSession {
  readonly log: CanonicalEvent[] = [];
  readonly telemetry: Array<{ kind: string; data: unknown }> = [];
  readonly effects: string[] = [];
  readonly approvals: ApprovalStore;
  private runs = new Map<string, { seq: number; state: 'running' | 'completed' | 'cancelled' }>();
  private lastAcceptedSeq = 0;
  private cursorsByToken = new Map<string, { index: number; leaseToken: string; checkpoint: { raw: string } }>();
  private cursorsByIndex = new Map<number, string>();
  private readonly leaseToken = `lease-${randomBytes(8).toString('hex')}`;
  private readonly checkpointRaw = `ckpt-${randomBytes(8).toString('hex')}`;

  constructor(now: () => number, private telemetryCap = 8) { this.approvals = new ApprovalStore(now); }

  private append(kind: string, runId: string | null, seq: number | null, data: unknown = null): CanonicalEvent {
    const e: CanonicalEvent = { id: this.log.length + 1, kind, runId, seq, data };
    this.log.push(e);
    return e;
  }

  /** Unknown kinds are preserved verbatim; `telemetry.*` is disposable and never enters the durable log. */
  ingest(raw: unknown): void {
    const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
    const kind = o && typeof o.kind === 'string' && o.kind !== '' ? o.kind : undefined;
    if (kind?.startsWith('telemetry.')) { this.emitTelemetry(kind, o!.data ?? null); return; }
    if (!kind) { this.append('x-unknown', null, null, { raw }); return; }
    this.append(kind, typeof o!.runId === 'string' ? o!.runId : null, typeof o!.seq === 'number' ? o!.seq : null, o!.data ?? null);
  }

  emitTelemetry(kind: string, data: unknown): void {
    this.telemetry.push({ kind, data });
    while (this.telemetry.length > this.telemetryCap) this.telemetry.shift();
  }

  acceptTurn(runId: string, seq: number): void {
    const existing = this.runs.get(runId);
    if (existing && existing.seq === seq) return; // duplicate delivery is an idempotent replay
    if (existing || seq !== this.lastAcceptedSeq + 1) throw new Error('sequence gap or duplicate runId');
    this.lastAcceptedSeq = seq;
    this.runs.set(runId, { seq, state: 'running' });
    this.append('TurnAccepted', runId, seq);
  }

  private running(runId: string) {
    const r = this.runs.get(runId);
    if (!r) throw new Error('unknown run');
    return r;
  }

  output(runId: string, text: string): void {
    if (this.running(runId).state !== 'running') throw new Error('run is terminal');
    this.append('OutputDelta', runId, null, { text });
  }

  requestApproval(a: { approvalId: string; scope: string; runId: string; payload: unknown; ttlMs: number }): Approval {
    if (this.running(a.runId).state !== 'running') throw new Error('run is terminal');
    const rec = this.approvals.request(a);
    this.append('ApprovalRequested', a.runId, null, rec);
    return rec;
  }

  decide(approvalId: string, expectedVersion: number, payloadHash: string, decision: 'approved' | 'denied'): Approval {
    const rec = this.approvals.decide(approvalId, expectedVersion, payloadHash, decision);
    this.append('ApprovalDecided', rec.runId, null, rec);
    if (rec.status === 'approved') this.effects.push(`apply:${rec.approvalId}`);
    return rec;
  }

  /** Cancellation is addressed by stable runId and is independent of turn seq. First terminal transition wins. */
  cancel(runId: string): 'cancelled' | 'already-terminal' {
    const r = this.running(runId);
    if (r.state !== 'running') return 'already-terminal';
    this.append('CancellationRequested', runId, null);
    r.state = 'cancelled';
    this.append('TurnCancelled', runId, null);
    return 'cancelled';
  }

  complete(runId: string): 'completed' | 'already-terminal' {
    const r = this.running(runId);
    if (r.state !== 'running') return 'already-terminal';
    r.state = 'completed';
    this.append('TurnCompleted', runId, null);
    return 'completed';
  }

  state(runId: string) { return this.running(runId).state; }

  private issueCursor(index: number): ClientCursor {
    let token = this.cursorsByIndex.get(index);
    if (!token) {
      token = `cur_${randomBytes(9).toString('hex')}`;
      this.cursorsByIndex.set(index, token);
      this.cursorsByToken.set(token, { index, leaseToken: this.leaseToken, checkpoint: { raw: this.checkpointRaw } });
    }
    const resumable = [...this.runs.values()].some((r) => r.state === 'running');
    return { cursor: token, lastAcceptedSeq: this.lastAcceptedSeq, resumable };
  }

  /** Replays strictly after the cursor; the client only ever sees { cursor, lastAcceptedSeq, resumable }. */
  pull(token?: string): { events: CanonicalEvent[]; cursor: ClientCursor } {
    let index = 0;
    if (token !== undefined) {
      const c = this.cursorsByToken.get(token);
      if (!c) throw new Error('unknown cursor');
      index = c.index;
    }
    return { events: structuredClone(this.log.slice(index)), cursor: this.issueCursor(this.log.length) };
  }

  /** Test-only view of server-private values that must never reach a client. */
  internalSecrets(): string[] { return [this.leaseToken, this.checkpointRaw]; }
}

interface Projection { name: string; encode(e: CanonicalEvent): unknown; decode(w: any): CanonicalEvent }
const PROJECTIONS: Projection[] = [
  { name: 'copilot', encode: (e) => ({ type: e.kind, id: e.id, runId: e.runId, seq: e.seq, data: e.data }),
    decode: (w) => ({ id: w.id, kind: w.type, runId: w.runId, seq: w.seq, data: w.data }) },
  { name: 'claude', encode: (e) => ({ hook_event_name: e.kind, meta: { id: e.id, runId: e.runId, seq: e.seq }, payload: e.data }),
    decode: (w) => ({ id: w.meta.id, kind: w.hook_event_name, runId: w.meta.runId, seq: w.meta.seq, data: w.payload }) },
  { name: 'kiro', encode: (e) => ({ event: e.kind, ref: [e.id, e.runId, e.seq], body: JSON.stringify(e.data) }),
    decode: (w) => ({ id: w.ref[0], kind: w.event, runId: w.ref[1], seq: w.ref[2], data: JSON.parse(w.body) }) },
  { name: 'opencode', encode: (e) => ({ type: e.kind, properties: { id: e.id, runId: e.runId, seq: e.seq, data: e.data } }),
    decode: (w) => ({ id: w.properties.id, kind: w.type, runId: w.properties.runId, seq: w.properties.seq, data: w.properties.data }) },
  { name: 'cursor', encode: (e) => ({ k: e.kind, i: e.id, r: e.runId, s: e.seq, d: e.data }),
    decode: (w) => ({ id: w.i, kind: w.k, runId: w.r, seq: w.s, data: w.d }) },
];

/** UI label that degrades gracefully on kinds it does not understand. */
function renderEvent(e: CanonicalEvent): string {
  return KNOWN_KINDS.has(e.kind) ? e.kind : `unsupported:${e.kind}`;
}

class SimClient {
  history: CanonicalEvent[] = [];
  views: ClientCursor[] = [];
  wire: string[] = [];
  duplicatesDropped = 0;
  private cursor?: string;
  private connected = true;
  constructor(private proj: Projection, private s: DurableSession) {}

  sync(): void {
    if (!this.connected) throw new Error('disconnected');
    const { events, cursor } = this.s.pull(this.cursor);
    for (const e of events) {
      const frame = JSON.stringify(this.proj.encode(e));
      this.wire.push(frame);
      const d = this.proj.decode(JSON.parse(frame));
      if (this.history.some((h) => h.id === d.id)) this.duplicatesDropped += 1;
      else this.history.push(d);
    }
    this.cursor = cursor.cursor;
    this.views.push(cursor);
  }
  disconnect(): void { this.connected = false; }
  reconnect(): void { this.connected = true; this.sync(); }
}

// ---------- tests ----------

let root: string;
let outside: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sq20-root-')));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sq20-out-')));
  for (const d of CLIENT_DIRS) fs.mkdirSync(path.join(root, d, 'skills'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

function tryLink(target: string, p: string): boolean {
  try { fs.symlinkSync(target, p, 'junction'); return true; } catch { return false; }
}

describe('path / symlink / reparse-point guards across client directories', () => {
  it.each(CLIENT_DIRS)('accepts a plain skill file under %s', (d) => {
    fs.mkdirSync(path.join(root, d, 'skills', 'ok'), { recursive: true });
    fs.writeFileSync(path.join(root, d, 'skills', 'ok', 'SKILL.md'), '# ok');
    expect(safeResolve(root, `${d}/skills/ok/SKILL.md`)).toContain('SKILL.md');
  });

  it.each(CLIENT_DIRS)('rejects ../ traversal out of %s', (d) => {
    expect(() => safeResolve(root, `${d}/skills/../../../etc/passwd`)).toThrow(/traversal/);
    expect(() => safeResolve(root, `${d}\\skills\\..\\..\\x`)).toThrow(/traversal/);
  });

  it.each(CLIENT_DIRS)('rejects symlink/junction skill dir escaping root in %s', (d) => {
    const link = path.join(root, d, 'skills', 'evil');
    if (!tryLink(outside, link)) return;
    fs.writeFileSync(path.join(outside, 'SKILL.md'), 'stolen');
    expect(() => safeResolve(root, `${d}/skills/evil/SKILL.md`)).toThrow(/reparse/);
  });

  it('rejects a client directory itself replaced by a link', () => {
    fs.rmSync(path.join(root, '.cursor'), { recursive: true, force: true });
    if (!tryLink(outside, path.join(root, '.cursor'))) return;
    expect(() => safeResolve(root, '.cursor/mcp.json')).toThrow(/reparse/);
  });

  it('rejects dangling symlinks', () => {
    const link = path.join(root, '.kiro', 'skills', 'dangling');
    if (!tryLink(path.join(outside, 'nope'), link)) return;
    expect(() => safeResolve(root, '.kiro/skills/dangling')).toThrow(/reparse/);
  });

  it.each([
    ['absolute posix', '/etc/passwd'],
    ['absolute drive', 'C:\\Windows\\win.ini'],
    ['UNC', '\\\\server\\share\\x'],
    ['NUL byte', '.claude/skills/a\0b'],
    ['ADS', '.claude/skills/a.md:stream'],
    ['empty', ''],
  ])('rejects %s input', (_n, p) => {
    expect(() => safeResolve(root, p)).toThrow();
  });

  it('detects real NTFS junctions via mklink /J (Windows only)', () => {
    if (process.platform !== 'win32') return;
    const target = path.join(outside, 'jt');
    fs.mkdirSync(target);
    const j = path.join(root, '.agents', 'skills', 'junc');
    execFileSync('cmd.exe', ['/c', 'mklink', '/J', j, target], { stdio: 'ignore' });
    expect(isReparsePoint(j)).toBe(true);
    expect(() => safeResolve(root, '.agents/skills/junc/x')).toThrow(/reparse/);
  });
});

describe('MCP config merge safety', () => {
  const server: McpServer = { command: 'npx', args: ['-y', '@bradygaster/squad-mcp'], env: { SQUAD_MODE: 'client' } };

  it.each(MCP_TARGETS)('preserves unrelated servers and top-level keys in $file', ({ key }) => {
    const existing = JSON.stringify({ theme: 'dark', [key]: { github: { command: 'gh-mcp', env: { GH_TOKEN: 'keepme' } } } });
    const out = JSON.parse(mergeMcp(existing, key, 'squad', server));
    expect(out.theme).toBe('dark');
    expect(out[key].github).toEqual({ command: 'gh-mcp', env: { GH_TOKEN: 'keepme' } });
    expect(out[key].squad.command).toBe('npx');
  });

  it('preserves user env vars on an existing squad entry; user values win', () => {
    const existing = JSON.stringify({ mcpServers: { squad: { command: 'old', env: { SQUAD_MODE: 'custom', MY_VAR: '1' } } } });
    const out = JSON.parse(mergeMcp(existing, 'mcpServers', 'squad', server));
    expect(out.mcpServers.squad.env).toEqual({ SQUAD_MODE: 'custom', MY_VAR: '1' });
  });

  it('is idempotent', () => {
    const once = mergeMcp(null, 'mcpServers', 'squad', server);
    expect(mergeMcp(once, 'mcpServers', 'squad', server)).toBe(once);
  });

  it('creates a config when none exists, including an empty file', () => {
    expect(JSON.parse(mergeMcp(null, 'mcp', 'squad', server)).mcp.squad).toBeDefined();
    expect(JSON.parse(mergeMcp('  ', 'mcp', 'squad', server)).mcp.squad).toBeDefined();
  });

  it.each(['{ not json', '[]', 'null', '"str"'])('refuses to clobber malformed config %j', (bad) => {
    expect(() => mergeMcp(bad, 'mcpServers', 'squad', server)).toThrow();
  });

  it('refuses when the server container has the wrong type', () => {
    expect(() => mergeMcp('{"mcpServers":[]}', 'mcpServers', 'squad', server)).toThrow(/not an object/);
  });

  it.each([
    ['semicolon', 'node;rm'],
    ['pipe', 'node|curl'],
    ['subshell', '$(curl)'],
    ['backtick', '`id`'],
    ['newline', 'node\nrm'],
    ['space in command', 'node server.js'],
    ['bash', '/bin/bash'],
    ['cmd', 'C:\\Windows\\System32\\cmd.exe'],
    ['pwsh', 'pwsh'],
  ])('rejects command injection via %s', (_n, command) => {
    expect(() => mergeMcp(null, 'mcpServers', 'squad', { command })).toThrow();
  });

  it('rejects non-string args, plain http urls, and prototype-pollution names', () => {
    expect(() => mergeMcp(null, 'mcpServers', 'squad', { command: 'npx', args: [1 as unknown as string] })).toThrow();
    expect(() => mergeMcp(null, 'mcpServers', 'squad', { url: 'http://evil' })).toThrow();
    expect(() => mergeMcp(null, 'mcpServers', '__proto__', server)).toThrow();
  });

  it('a __proto__ key in existing JSON does not pollute Object.prototype', () => {
    mergeMcp('{"mcpServers":{"__proto__":{"polluted":true}}}', 'mcpServers', 'squad', server);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('redacts secret env values in diagnostics', () => {
    const r = redactEnv({ GH_TOKEN: 'ghp_x', API_KEY: 'k', MODE: 'a', DB_PASSWORD: 'p' });
    expect(JSON.stringify(r)).not.toMatch(/ghp_x|"k"|"p"/);
    expect(r.MODE).toBe('a');
  });

  it('leaves the on-disk config untouched when validation fails', () => {
    const f = path.join(root, '.mcp.json');
    fs.writeFileSync(f, '{"mcpServers":{"a":{"command":"x"}}}');
    const before = fs.readFileSync(f, 'utf8');
    expect(() => mergeMcp(before, 'mcpServers', 'squad', { command: 'a;b' })).toThrow();
    expect(fs.readFileSync(f, 'utf8')).toBe(before);
  });
});

describe('hash-bound approvals and epoch fencing', () => {
  const base = (epoch: number): Proposal => ({ runId: 'r1', action: 'write-decision', args: { a: 1, b: [2, 3] }, epoch });

  it('hash is stable across key order and sensitive to any change', () => {
    const a = hashProposal({ runId: 'r', action: 'x', args: { a: 1, b: 2 }, epoch: 1 });
    expect(hashProposal({ runId: 'r', action: 'x', args: { b: 2, a: 1 }, epoch: 1 })).toBe(a);
    expect(hashProposal({ runId: 'r', action: 'x', args: { a: 1, b: 3 }, epoch: 1 })).not.toBe(a);
    expect(hashProposal({ runId: 'r', action: 'x', args: { a: 1, b: 2 }, epoch: 2 })).not.toBe(a);
  });

  it('executes an approved proposal exactly once per (runId, seq)', () => {
    const b = new Broker(); const p = base(b.acquire('w1'));
    const h = b.approve(p);
    expect(b.apply(p, h, 1, 'w1')).toBe('ok');
    expect(b.apply(p, h, 1, 'w1')).toBe('ok');
    expect(b.state).toHaveLength(1);
  });

  it('rejects a tampered proposal under a valid approval hash', () => {
    const b = new Broker(); const p = base(b.acquire('w1'));
    const h = b.approve(p);
    expect(() => b.apply({ ...p, args: { a: 999 } }, h, 1, 'w1')).toThrow(/mismatch/);
    expect(b.state).toHaveLength(0);
  });

  it('rejects unapproved proposals and approval reuse for a new seq', () => {
    const b = new Broker(); const p = base(b.acquire('w1'));
    expect(() => b.apply(p, hashProposal(p), 1, 'w1')).toThrow(/mismatch/);
    const h = b.approve(p);
    b.apply(p, h, 1, 'w1');
    expect(() => b.apply(p, h, 2, 'w1')).toThrow(/mismatch/);
    expect(b.state).toHaveLength(1);
  });

  it('fences a stale holder after lease takeover (epoch bump)', () => {
    const b = new Broker();
    const p = base(b.acquire('worktree-A')); const h = b.approve(p);
    b.acquire('worktree-B');
    expect(() => b.apply(p, h, 1, 'worktree-A')).toThrow(/fenced/);
    expect(b.state).toHaveLength(0);
  });

  it('rejects a non-holder presenting the current epoch', () => {
    const b = new Broker(); const p = base(b.acquire('A')); const h = b.approve(p);
    expect(() => b.apply(p, h, 1, 'B')).toThrow(/fenced/);
  });

  it('epochs are strictly monotonic', () => {
    const b = new Broker();
    expect([b.acquire('a'), b.acquire('b'), b.acquire('a')]).toEqual([1, 2, 3]);
  });

  it('isolates state between worktrees: separate brokers never share writes', () => {
    const a = new Broker(); const c = new Broker();
    const pa = { ...base(a.acquire('A')), runId: 'rA' };
    a.apply(pa, a.approve(pa), 1, 'A');
    expect(c.state).toHaveLength(0);
    expect(() => c.apply(pa, hashProposal(pa), 1, 'A')).toThrow();
  });
});

describe('configured vs. negotiated capabilities (clients[] is not authority)', () => {
  const ALL = ['read', 'write', 'shell', 'net'];
  const subsets = (): string[][] => Array.from({ length: 1 << ALL.length }, (_, m) => ALL.filter((_c, i) => m & (1 << i)));

  it('effective = client ∩ backend ∩ policy for every combination (exhaustive)', () => {
    for (const c of subsets()) for (const b of subsets()) for (const p of subsets()) {
      const { effective } = negotiate(c, b, { granted: p });
      expect(effective).toEqual(c.filter((x) => b.includes(x) && p.includes(x)));
    }
  });

  it('strips capabilities absent from the backend and reports why', () => {
    const n = negotiate(['read', 'shell'], ['read'], { granted: ['read', 'shell'] });
    expect(n.effective).toEqual(['read']);
    expect(n.stripped).toEqual([{ capability: 'shell', reason: 'not-in-backend' }]);
  });

  it('strips capabilities denied by policy; explicit deny beats grant', () => {
    const n = negotiate(['read', 'write', 'net'], ALL, { granted: ['read', 'write', 'net'], denied: ['write'] });
    expect(n.effective).toEqual(['read', 'net']);
    expect(n.stripped).toEqual([{ capability: 'write', reason: 'denied-by-policy' }]);
  });

  it('strips capabilities the policy never granted', () => {
    const n = negotiate(['read', 'net'], ALL, { granted: ['read'] });
    expect(n.stripped).toEqual([{ capability: 'net', reason: 'not-granted-by-policy' }]);
  });

  it('rejects malformed capability requests and de-duplicates repeats', () => {
    expect(() => negotiate([1 as unknown as string], ALL, { granted: ALL })).toThrow(/bad capability/);
    expect(negotiate(['read', 'read'], ALL, { granted: ALL }).effective).toEqual(['read']);
  });

  it('persisted clients[] grants nothing: no negotiated session means no authority', () => {
    fs.writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({
      clients: [{ id: 'c1', adapter: 'claude', capabilities: ['read', 'write', 'shell', 'admin'] }],
    }));
    const [entry] = loadConfiguredClients(root);
    expect(entry.capabilities).toContain('shell');
    for (const cap of entry.capabilities!) expect(authorize(undefined, cap)).toBe(false);
  });

  it('widening clients[] on disk cannot widen effective capabilities', () => {
    const backend = ['read', 'write'];
    const policy = { granted: ['read', 'write', 'shell'], denied: ['write'] };
    const narrow = negotiate(['read'], backend, policy);
    const widened = negotiate(['read', 'write', 'shell', 'admin'], backend, policy);
    expect(widened.effective).toEqual(narrow.effective);
    expect(authorize(widened, 'shell')).toBe(false);
    expect(authorize(widened, 'write')).toBe(false);
    expect(authorize(widened, 'admin')).toBe(false);
    expect(authorize(widened, 'read')).toBe(true);
  });

  it.each(Object.keys(ADAPTER_DIRS))('projection artifact for %s is a whitelist and marks capabilities as requested only', (adapter) => {
    const a = projectClientArtifact({ id: 'c', adapter, capabilities: ['read'], leaseToken: 'lease-abc', extra: 'dropped' });
    expect(Object.keys(a).sort()).toEqual(['adapter', 'dir', 'id', 'requestedCapabilities']);
    expect(a.dir).toBe(ADAPTER_DIRS[adapter]);
    expect(JSON.stringify(a)).not.toMatch(/lease|dropped/);
  });

  it('rejects an unknown adapter and a prototype-named adapter', () => {
    expect(() => projectClientArtifact({ id: 'c', adapter: 'vim' })).toThrow(/unknown adapter/);
    expect(() => projectClientArtifact({ id: 'c', adapter: 'constructor' })).toThrow(/unknown adapter/);
  });

  it.each([
    ['credential key', { apiKey: 'x' }],
    ['password key', { password: 'x' }],
    ['token key', { auth_token: 'x' }],
    ['provider thread id key', { providerThreadId: 'abc' }],
    ['thread id key', { thread_id: 'abc' }],
    ['lease token key', { leaseToken: 'x' }],
    ['raw checkpoint state', { checkpoint: { raw: 'x' } }],
    ['nested checkpoint state', { meta: { rawCheckpointState: {} } }],
    ['github pat value', { note: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }],
    ['bearer value', { note: 'Bearer abc.def' }],
    ['provider thread value', { ref: 'thread_abc123XYZ' }],
    ['lease value', { ref: 'lease-9f2c' }],
    ['posix home path', { cwd: '/home/tamir/repo' }],
    ['windows path', { cwd: 'C:\\Users\\tamir\\repo' }],
    ['unc path', { cwd: '\\\\host\\share' }],
    ['tilde path', { cwd: '~/repo' }],
    ['embedded path', { cmd: 'run D:\\work\\x.ps1' }],
  ])('portable clients[] rejects %s', (_n, extra) => {
    expect(() => assertPortable([{ id: 'c', adapter: 'kiro', ...extra }])).toThrow(/non-portable|credential|machine-specific|lease/);
  });

  it('refuses to load a config whose clients[] is non-portable', () => {
    fs.writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({ clients: [{ id: 'c', adapter: 'cursor', workdir: 'C:\\Users\\x' }] }));
    expect(() => loadConfiguredClients(root)).toThrow(/machine-specific/);
  });

  it('accepts a clean, relative, portable clients[]', () => {
    expect(() => assertPortable([{ id: 'c', adapter: 'opencode', capabilities: ['read'], dir: '.opencode/skills', url: 'https://example.com/mcp' }])).not.toThrow();
  });
});

describe('versioned durable approvals', () => {
  let t = 1_000;
  const clock = () => t;
  const req = { approvalId: 'ap-1', scope: 'tool:write', runId: 'run-1', payload: { file: 'a.md', n: 1 }, ttlMs: 60_000 };
  const hashOf = (payload: unknown, scope = 'tool:write', runId = 'run-1') => hashPayload(runId, scope, payload);
  beforeEach(() => { t = 1_000; });

  it('carries the full resource shape and starts at v1 requested', () => {
    const a = new ApprovalStore(clock).request(req);
    expect(Object.keys(a).sort()).toEqual(['approvalId', 'expiresAt', 'payloadHash', 'runId', 'scope', 'status', 'version']);
    expect(a).toMatchObject({ version: 1, status: 'requested', runId: 'run-1', scope: 'tool:write', expiresAt: 61_000 });
    expect(a.payloadHash).toBe(hashOf(req.payload));
  });

  it('increments version on state transition: v1 requested -> v2 decided', () => {
    const s = new ApprovalStore(clock);
    const a = s.request(req);
    const d = s.decide('ap-1', a.version, a.payloadHash, 'approved');
    expect(d).toMatchObject({ version: 2, status: 'approved' });
    expect(s.get('ap-1')!.version).toBe(2);
  });

  it('rejects a stale version without mutating state', () => {
    const s = new ApprovalStore(clock);
    const a = s.request(req);
    expect(() => s.decide('ap-1', 7, a.payloadHash, 'approved')).toThrow(/stale version/);
    expect(s.get('ap-1')).toMatchObject({ version: 1, status: 'requested' });
  });

  it('rejects replay of the v1 decision after v2 and a second decision at v2', () => {
    const s = new ApprovalStore(clock);
    const a = s.request(req);
    s.decide('ap-1', 1, a.payloadHash, 'approved');
    expect(() => s.decide('ap-1', 1, a.payloadHash, 'approved')).toThrow(/stale version/);
    expect(() => s.decide('ap-1', 2, a.payloadHash, 'denied')).toThrow(/already decided/);
    expect(s.get('ap-1')!.status).toBe('approved');
  });

  it('rejects a mismatched payloadHash (tampered payload, scope or run)', () => {
    const s = new ApprovalStore(clock);
    s.request(req);
    for (const bad of [hashOf({ ...req.payload, n: 2 }), hashOf(req.payload, 'tool:shell'), hashOf(req.payload, 'tool:write', 'run-2'), 'deadbeef']) {
      expect(() => s.decide('ap-1', 1, bad, 'approved')).toThrow(/payloadHash mismatch/);
    }
    expect(s.get('ap-1')).toMatchObject({ version: 1, status: 'requested' });
  });

  it('payloadHash is key-order independent', () => {
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
  });

  it('expires durably: decision at/after expiresAt is refused and cannot be revived', () => {
    const s = new ApprovalStore(clock);
    const a = s.request(req);
    t = a.expiresAt;
    expect(() => s.decide('ap-1', 1, a.payloadHash, 'approved')).toThrow(/expired/);
    expect(s.get('ap-1')).toMatchObject({ status: 'expired', version: 2 });
    expect(() => s.decide('ap-1', 2, a.payloadHash, 'approved')).toThrow(/already decided/);
  });

  it('unknown and duplicate approval ids are rejected', () => {
    const s = new ApprovalStore(clock);
    expect(() => s.decide('nope', 1, 'x', 'approved')).toThrow(/unknown approval/);
    s.request(req);
    expect(() => s.request(req)).toThrow(/exists/);
  });

  it('returned records are copies: callers cannot mutate durable state', () => {
    const s = new ApprovalStore(clock);
    const a = s.request(req);
    a.status = 'approved'; a.version = 99;
    expect(s.get('ap-1')).toMatchObject({ status: 'requested', version: 1 });
  });
});

describe('runId-addressed cancellation', () => {
  const mk = () => new DurableSession(() => 1_000);

  it('cancels by stable runId after later turns advanced seq', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.acceptTurn('run-2', 2);
    s.acceptTurn('run-3', 3);
    expect(s.cancel('run-1')).toBe('cancelled');
    expect(s.state('run-1')).toBe('cancelled');
    expect(s.state('run-2')).toBe('running');
    expect(s.state('run-3')).toBe('running');
  });

  it('seq is not an identifier: cancelling by a seq value fails', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    expect(() => s.cancel('1')).toThrow(/unknown run/);
    expect(s.state('run-1')).toBe('running');
  });

  it('cancellation is idempotent and a no-op once terminal', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.cancel('run-1');
    const n = s.log.length;
    expect(s.cancel('run-1')).toBe('already-terminal');
    expect(s.complete('run-1')).toBe('already-terminal');
    expect(s.log).toHaveLength(n);
  });

  it('enforces turn sequencing: gaps and runId reuse are rejected, same (runId, seq) is an idempotent replay', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.acceptTurn('run-1', 1);
    expect(s.log.filter((e) => e.kind === 'TurnAccepted')).toHaveLength(1);
    expect(() => s.acceptTurn('run-2', 5)).toThrow(/sequence gap/);
    expect(() => s.acceptTurn('run-1', 2)).toThrow(/sequence gap/);
  });

  it('output and approval requests on a terminal run are refused', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.complete('run-1');
    expect(() => s.output('run-1', 'late')).toThrow(/terminal/);
    expect(() => s.requestApproval({ approvalId: 'a', scope: 's', runId: 'run-1', payload: {}, ttlMs: 1 })).toThrow(/terminal/);
  });
});

describe('loss-tolerant projection', () => {
  const mk = () => new DurableSession(() => 1_000);
  const future = { kind: 'x-future.event', runId: 'run-1', seq: 9, data: { nested: { a: [1, { b: null }] }, flag: true } };

  it.each(PROJECTIONS)('$name projection preserves unknown future kinds without crashing', (proj) => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.ingest(future);
    s.ingest({ kind: 'x-other.v2', data: 'str' });
    const c = new SimClient(proj, s);
    expect(() => c.sync()).not.toThrow();
    const got = c.history.find((e) => e.kind === 'x-future.event')!;
    expect(got).toMatchObject({ kind: 'x-future.event', runId: 'run-1', seq: 9, data: future.data });
    expect(c.history.map((e) => renderEvent(e))).toEqual(['TurnAccepted', 'unsupported:x-future.event', 'unsupported:x-other.v2']);
  });

  it.each([
    ['missing kind', { data: 1 }],
    ['numeric kind', { kind: 42, data: 1 }],
    ['object kind', { kind: { a: 1 } }],
    ['empty kind', { kind: '' }],
    ['null', null],
    ['string', 'garbage'],
    ['array', [1, 2]],
  ])('preserves malformed event (%s) as x-unknown with the raw payload', (_n, raw) => {
    const s = mk();
    s.ingest(raw);
    expect(s.log).toHaveLength(1);
    expect(s.log[0].kind).toBe('x-unknown');
    expect(s.log[0].data).toEqual({ raw });
    for (const proj of PROJECTIONS) {
      const c = new SimClient(proj, s);
      c.sync();
      expect(canon(c.history)).toBe(canon(s.log));
    }
  });

  it('separates disposable telemetry from durable events', () => {
    const s = mk();
    s.acceptTurn('run-1', 1);
    s.ingest({ kind: 'telemetry.latency', data: { ms: 12 } });
    s.emitTelemetry('telemetry.tokens', { n: 3 });
    s.output('run-1', 'hi');
    expect(s.log.map((e) => e.kind)).toEqual(['TurnAccepted', 'OutputDelta']);
    expect(s.telemetry.map((t) => t.kind)).toEqual(['telemetry.latency', 'telemetry.tokens']);
    const c = new SimClient(PROJECTIONS[0], s);
    c.sync();
    expect(c.wire.join('')).not.toMatch(/telemetry/);
  });

  it('telemetry is bounded and never changes durable history or its ids', () => {
    const a = mk(); const b = mk();
    for (const s of [a, b]) { s.acceptTurn('run-1', 1); }
    for (let i = 0; i < 100; i++) b.emitTelemetry('telemetry.tick', { i });
    for (const s of [a, b]) { s.output('run-1', 'x'); s.complete('run-1'); }
    expect(b.telemetry.length).toBeLessThanOrEqual(8);
    expect(canon(b.log)).toBe(canon(a.log));
  });

  it('unknown kinds survive a disconnect/reconnect cycle', () => {
    const s = mk();
    const c = new SimClient(PROJECTIONS[2], s);
    c.sync();
    c.disconnect();
    s.ingest(future);
    expect(() => c.sync()).toThrow(/disconnected/);
    c.reconnect();
    expect(c.history.map((e) => e.kind)).toEqual(['x-future.event']);
  });
});

describe('golden cross-adapter conformance trace', () => {
  /**
   * TurnAccepted(runId, seq) → stream partial output → ApprovalRequested(v1) → disconnect →
   * reconnect(cursor) → ApprovalDecided(v2) → race CancellationRequested(runId) vs completion → terminal.
   */
  function golden(proj: Projection, winner: 'cancel' | 'complete') {
    const s = new DurableSession(() => 1_000);
    const c = new SimClient(proj, s);
    const payload = { action: 'write-decision', file: 'decisions.md' };

    s.acceptTurn('run-1', 1);
    s.output('run-1', 'par');
    s.output('run-1', 'tial');
    const a1 = s.requestApproval({ approvalId: 'ap-1', scope: 'tool:write', runId: 'run-1', payload, ttlMs: 60_000 });
    c.sync();
    const beforeDrop = c.views[c.views.length - 1];

    c.disconnect();
    c.reconnect(); // resumes from the stored cursor
    c.reconnect(); // a second reconnect from the same cursor must be a no-op
    s.decide('ap-1', a1.version, a1.payloadHash, 'approved');
    c.sync();

    if (winner === 'cancel') { s.cancel('run-1'); s.complete('run-1'); } else { s.complete('run-1'); s.cancel('run-1'); }
    c.sync();
    return { s, c, a1, beforeDrop };
  }

  const EXPECT = {
    cancel: ['TurnAccepted', 'OutputDelta', 'OutputDelta', 'ApprovalRequested', 'ApprovalDecided', 'CancellationRequested', 'TurnCancelled'],
    complete: ['TurnAccepted', 'OutputDelta', 'OutputDelta', 'ApprovalRequested', 'ApprovalDecided', 'TurnCompleted'],
  } as const;

  it.each(['cancel', 'complete'] as const)('canonical history follows the trace when %s wins the race', (winner) => {
    const { s } = golden(PROJECTIONS[0], winner);
    expect(s.log.map((e) => e.kind)).toEqual(EXPECT[winner]);
    expect(s.log.map((e) => e.id)).toEqual(s.log.map((_e, i) => i + 1));
    expect(s.log[0]).toMatchObject({ kind: 'TurnAccepted', runId: 'run-1', seq: 1 });
    expect(s.log[3].data).toMatchObject({ version: 1, status: 'requested', runId: 'run-1' });
    expect(s.log[4].data).toMatchObject({ version: 2, status: 'approved', runId: 'run-1' });
  });

  it.each(['cancel', 'complete'] as const)('exactly one terminal state, no matter who wins (%s)', (winner) => {
    const { s } = golden(PROJECTIONS[0], winner);
    const terminals = s.log.filter((e) => e.kind === 'TurnCompleted' || e.kind === 'TurnCancelled');
    expect(terminals).toHaveLength(1);
    expect(s.state('run-1')).toBe(winner === 'cancel' ? 'cancelled' : 'completed');
  });

  it.each(['cancel', 'complete'] as const)('all 5 client projections observe identical canonical history (%s)', (winner) => {
    const runs = PROJECTIONS.map((p) => ({ name: p.name, ...golden(p, winner) }));
    expect(runs.map((r) => r.name)).toEqual(['copilot', 'claude', 'kiro', 'opencode', 'cursor']);
    const reference = canon(runs[0].s.log);
    for (const r of runs) {
      expect(canon(r.c.history), r.name).toBe(reference);
      expect(canon(r.c.history), r.name).toBe(canon(r.s.log));
    }
  });

  it('wire formats differ per adapter even though canonical history is identical', () => {
    const wires = new Set(PROJECTIONS.map((p) => golden(p, 'cancel').c.wire[0]));
    expect(wires.size).toBe(PROJECTIONS.length);
  });

  it.each(PROJECTIONS)('$name: reconnect causes no duplicate side effects or duplicate events', (proj) => {
    const { s, c, a1 } = golden(proj, 'cancel');
    expect(s.effects).toEqual(['apply:ap-1']);
    expect(c.duplicatesDropped).toBe(0);
    expect(new Set(c.history.map((e) => e.id)).size).toBe(c.history.length);
    expect(s.log.filter((e) => e.kind === 'ApprovalDecided')).toHaveLength(1);

    // Client retries the stale v1 decision after reconnecting: rejected, still exactly one effect.
    expect(() => s.decide('ap-1', a1.version, a1.payloadHash, 'approved')).toThrow(/stale version/);
    // Extra reconnects and fresh pulls from an old cursor never re-run effects.
    for (let i = 0; i < 3; i++) { c.disconnect(); c.reconnect(); }
    s.pull(); s.pull();
    expect(s.effects).toEqual(['apply:ap-1']);
    expect(s.log.filter((e) => e.kind === 'ApprovalDecided')).toHaveLength(1);
  });

  it('replaying from an older cursor returns only the missed suffix', () => {
    const s = new DurableSession(() => 1_000);
    s.acceptTurn('run-1', 1);
    const first = s.pull();
    s.output('run-1', 'a');
    s.output('run-1', 'b');
    const replay = s.pull(first.cursor.cursor);
    expect(replay.events.map((e) => e.id)).toEqual([2, 3]);
    expect(s.pull(first.cursor.cursor).events.map((e) => e.id)).toEqual([2, 3]); // idempotent
    expect(s.pull(replay.cursor.cursor).events).toEqual([]);
  });

  it.each(PROJECTIONS)('$name: client cursor payload only exposes cursor, lastAcceptedSeq, resumable', (proj) => {
    const { s, c, beforeDrop } = golden(proj, 'cancel');
    for (const v of c.views) expect(Object.keys(v).sort()).toEqual(['cursor', 'lastAcceptedSeq', 'resumable']);
    expect(beforeDrop).toMatchObject({ lastAcceptedSeq: 1, resumable: true });
    expect(c.views[c.views.length - 1]).toMatchObject({ lastAcceptedSeq: 1, resumable: false });
    expect(beforeDrop.cursor).toMatch(/^cur_[0-9a-f]+$/);

    // Lease token and raw checkpoint state never appear in anything the client received.
    const everything = JSON.stringify([c.views, c.wire, c.history]);
    for (const secret of s.internalSecrets()) expect(everything).not.toContain(secret);
    expect(everything).not.toMatch(/lease-|ckpt-/);
  });

  it('cursors are opaque: forged, tampered and cross-session cursors are rejected', () => {
    const a = new DurableSession(() => 1_000);
    const b = new DurableSession(() => 1_000);
    a.acceptTurn('run-1', 1);
    const cur = a.pull().cursor.cursor;
    expect(() => a.pull('cur_deadbeef')).toThrow(/unknown cursor/);
    expect(() => a.pull(`${cur}0`)).toThrow(/unknown cursor/);
    expect(() => a.pull('1')).toThrow(/unknown cursor/);
    expect(() => b.pull(cur)).toThrow(/unknown cursor/);
  });

  it('an unknown future event mid-trace does not disturb conformance across projections', () => {
    const histories = PROJECTIONS.map((proj) => {
      const s = new DurableSession(() => 1_000);
      const c = new SimClient(proj, s);
      s.acceptTurn('run-1', 1);
      s.ingest({ kind: 'x-future.event', runId: 'run-1', data: { v: 3 } });
      s.ingest({ kind: 'telemetry.span', data: { ms: 1 } });
      s.output('run-1', 'ok');
      c.sync();
      c.disconnect(); c.reconnect();
      s.complete('run-1');
      c.sync();
      return canon(c.history);
    });
    expect(new Set(histories).size).toBe(1);
    expect(histories[0]).toContain('x-future.event');
    expect(histories[0]).not.toContain('telemetry');
  });
});
