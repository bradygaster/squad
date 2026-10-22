/**
 * Host feature matrix: `test-fixtures/spec/suite-v0.2/host-feature-matrix.json` is the source of truth for
 * which Squad feature works on which host and how each cell was validated.
 *
 * Always-on layers
 *  1. Schema + evidence integrity: every `validated-test:<file>::<name>` reference must point at an existing
 *     test (file present, name present), every `validated-manual:lab:<scenario>` must have a recorded live run
 *     for that host, the rendered docs page must match the JSON, and host runtime flags must agree with
 *     `CAPABILITY_TOKENS_BY_HOST`.
 *  2. Bridge scenarios (no CLI, no model): the `state-mcp` session resolves the right `.squad/` from a monorepo
 *     subfolder and a remote-mode satellite, and routes `squad_decide` into the orphan / two-layer backends.
 *
 * Opt-in layers
 *  3. SQUAD_REAL_CLI_TESTS=1: real host binaries read the projections from a monorepo subfolder (no model).
 *  4. SQUAD_REAL_MODEL_TESTS=1 (implies 3): one headless coordinator turn per installed host against a real
 *     model, asserting the roster is read through the host-prefixed `squad_state` tool.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CAPABILITY_TOKENS_BY_HOST, CLIENT_IDS, extractCanonicalCoordinatorHeadings } from '../packages/squad-sdk/src/client/adapters/index.js';
import { installClients } from '../packages/squad-sdk/src/client/index.js';
import { createStateMcpSession } from '../packages/squad-cli/src/cli/commands/state-mcp.js';
import { migrateStateBackend } from '../packages/squad-cli/src/cli/commands/migrate-backend.js';
import { clearResolveSquadCache } from '../packages/squad-sdk/src/resolution.js';

const ROOT = path.resolve(__dirname, '..');
const MATRIX_PATH = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'host-feature-matrix.json');
const PAGE_PATH = path.join(ROOT, 'docs', 'src', 'content', 'docs', 'reference', 'host-feature-matrix.md');
const RENDERER = pathToFileURL(path.join(ROOT, 'scripts', 'render-host-feature-matrix.mjs')).href;

type Status = 'supported' | 'degraded' | 'unsupported' | 'n/a';
interface Cell { status: Status; mechanism: string; validation: string[]; notes?: string }
interface Feature { id: string; name: string; area: string; dependsOn: string[]; hostIndependent?: boolean; cells: Record<string, Cell> }
interface LiveRun { host: string; scenario: string; date: string; outcome: 'pass' | 'partial' | 'fail' | 'blocked'; observedTools?: string[]; notes?: string }
interface Matrix {
  protocol: string;
  hosts: Record<string, { cli: string; installedOnReferenceMachine: boolean; runtime: { subagents: boolean; backgroundRuns: boolean } }>;
  features: Feature[];
  liveRuns: LiveRun[];
}

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as Matrix;
const HOSTS = Object.keys(matrix.hosts);
const STATUSES: Status[] = ['supported', 'degraded', 'unsupported', 'n/a'];
const VALIDATION_RE = /^(validated-test:[^:]+::.+|validated-manual:.+|static-only|untested|failing)$/;

const ROSTER = '| Name | Role | Charter | Status |\n|---|---|---|---|\n| Noether | Lead Architect | `.squad/agents/noether/charter.md` | ✅ Active |\n| Galois | Backend Engineer | `.squad/agents/galois/charter.md` | ✅ Active |\n';
const THIS_FILE = 'test/squad-20-host-feature-matrix.test.ts';

// ─── 1. schema + evidence integrity ─────────────────────────────────────────

describe('host-feature-matrix.json integrity', () => {
  it('covers every SDK client id with a complete cell per feature', () => {
    expect([...HOSTS].sort()).toEqual([...CLIENT_IDS].sort());
    expect(matrix.features.length).toBeGreaterThanOrEqual(40);
    const ids = new Set<string>();
    for (const f of matrix.features) {
      expect(ids.has(f.id), `duplicate feature id ${f.id}`).toBe(false);
      ids.add(f.id);
      expect(f.dependsOn.length, `${f.id}: dependsOn`).toBeGreaterThan(0);
      for (const d of f.dependsOn) expect(['a', 'b', 'c', 'd', 'e'], `${f.id}: class ${d}`).toContain(d);
      for (const h of HOSTS) {
        const c = f.cells[h];
        expect(c, `${f.id}: missing cell for ${h}`).toBeDefined();
        expect(STATUSES, `${f.id}/${h}: status ${c!.status}`).toContain(c!.status);
        expect(c!.mechanism.length, `${f.id}/${h}: mechanism`).toBeGreaterThan(10);
        expect(c!.validation.length, `${f.id}/${h}: validation`).toBeGreaterThan(0);
        for (const v of c!.validation) expect(v, `${f.id}/${h}: validation entry ${v}`).toMatch(VALIDATION_RE);
      }
    }
  });

  it('every validated-test reference names a test that exists', () => {
    const cache = new Map<string, string>();
    const read = (rel: string) => {
      if (!cache.has(rel)) {
        const abs = path.join(ROOT, rel);
        expect(fs.existsSync(abs), `referenced test file missing: ${rel}`).toBe(true);
        cache.set(rel, fs.readFileSync(abs, 'utf8'));
      }
      return cache.get(rel)!;
    };
    for (const f of matrix.features) for (const h of HOSTS) for (const v of f.cells[h]!.validation) {
      if (!v.startsWith('validated-test:')) continue;
      const [, file, name] = /^validated-test:([^:]+)::(.+)$/.exec(v)!;
      const src = read(file!);
      if (name !== '*') expect(src.includes(name!), `${f.id}/${h}: "${name}" not found in ${file}`).toBe(true);
    }
  });

  it('every validated-manual:lab reference has a recorded live run for that host', () => {
    expect(Array.isArray(matrix.liveRuns)).toBe(true);
    for (const f of matrix.features) for (const h of HOSTS) for (const v of f.cells[h]!.validation) {
      const m = /^validated-manual:lab:([a-z0-9-]+)(?:@.*)?$/.exec(v);
      if (!m) continue;
      const run = matrix.liveRuns.find((r) => r.host === h && r.scenario === m[1]);
      expect(run, `${f.id}/${h}: no live run recorded for scenario ${m[1]}`).toBeDefined();
      expect(['pass', 'partial'], `${f.id}/${h}: live run ${m[1]} outcome ${run!.outcome} cannot back a validated cell`).toContain(run!.outcome);
    }
  });

  it('cells marked failing carry a note, and no live run that failed backs a supported cell', () => {
    for (const f of matrix.features) for (const h of HOSTS) {
      const c = f.cells[h]!;
      if (c.validation.includes('failing')) expect(c.notes, `${f.id}/${h}: failing cell needs a note`).toBeTruthy();
    }
    for (const r of matrix.liveRuns.filter((r) => r.outcome === 'fail')) {
      for (const f of matrix.features) {
        const c = f.cells[r.host]!;
        if (c.validation.some((v) => v.includes(`lab:${r.scenario}`))) expect(c.status, `${f.id}/${r.host}: backed by failed run ${r.scenario}`).not.toBe('supported');
      }
    }
  });

  it('every canonicalSections entry is a real heading in .github/agents/squad.agent.md', () => {
    const canonical = fs.readFileSync(path.join(ROOT, '.github', 'agents', 'squad.agent.md'), 'utf8');
    const headings = new Set(extractCanonicalCoordinatorHeadings(canonical));
    for (const f of matrix.features as Array<Feature & { canonicalSections?: string[] }>) {
      for (const s of f.canonicalSections ?? []) expect(headings.has(s), `${f.id}: canonical section "${s}" is not a ##/### heading`).toBe(true);
    }
  });

  it('host runtime flags agree with CAPABILITY_TOKENS_BY_HOST', () => {
    for (const h of CLIENT_IDS) {
      const tokens = CAPABILITY_TOKENS_BY_HOST[h];
      expect(matrix.hosts[h]!.runtime.subagents, `${h}: subagents`).toBe(tokens.includes('subagents'));
      expect(matrix.hosts[h]!.runtime.backgroundRuns, `${h}: background-runs`).toBe(tokens.includes('background-runs'));
    }
  });

  it('hosts without the background-runs token are never "supported" for background-agents', () => {
    const f = matrix.features.find((x) => x.id === 'background-agents')!;
    for (const h of CLIENT_IDS) if (!CAPABILITY_TOKENS_BY_HOST[h].includes('background-runs')) expect(f.cells[h]!.status, h).not.toBe('supported');
  });

  it('the rendered reference page is up to date with the JSON', async () => {
    const { render } = (await import(RENDERER)) as { render: (m: unknown) => string };
    const expected = render(matrix).replace(/\r\n/g, '\n');
    const actual = fs.readFileSync(PAGE_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(actual, 'docs/src/content/docs/reference/host-feature-matrix.md is stale; run node scripts/render-host-feature-matrix.mjs').toBe(expected);
  });
});

// ─── 2. bridge scenarios (deterministic; no CLI, no model) ──────────────────

type Rpc = { jsonrpc: '2.0'; id: string | number | null; result?: any; error?: { code: number; message: string } };

async function bridge(startDir: string) {
  const out: Rpc[] = [];
  const session = createStateMcpSession(startDir, (m) => out.push(m as Rpc));
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const myId = ++id;
    await session.handleRequest({ jsonrpc: '2.0', id: myId, method: 'tools/call', params: { name, arguments: args } });
    const msg = out.find((m) => m.id === myId)!;
    expect(msg.error, `${name}: ${JSON.stringify(msg.error)}`).toBeUndefined();
    const text: string = msg.result?.content?.[0]?.text ?? '';
    return { text, isError: msg.result?.isError === true };
  };
  return { call };
}

function gitInit(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'lab@example.com']);
  git(['config', 'user.name', 'Lab']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# lab\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'init']);
  return git;
}

function squadDir(dir: string, config: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(dir, '.squad', 'decisions', 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.squad', 'config.json'), JSON.stringify({ version: 1, ...config }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, '.squad', 'team.md'), `# Squad Team\n\n> ${path.basename(dir)}\n\n## Members\n\n${ROSTER}`);
  fs.writeFileSync(path.join(dir, '.squad', 'decisions.md'), '# Decisions\n');
}

describe('bridge scenarios: state-mcp resolution the host coordinator relies on', () => {
  let tmp: string;
  beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-hfm-')); });
  afterAll(() => {
    clearResolveSquadCache();
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('state-mcp resolves the root .squad when launched from a monorepo subfolder', async () => {
    const repo = path.join(tmp, 'mono');
    gitInit(repo);
    squadDir(repo);
    const sub = path.join(repo, 'packages', 'api');
    fs.mkdirSync(sub, { recursive: true });
    clearResolveSquadCache();
    const b = await bridge(sub);
    const team = await b.call('squad_state_read', { key: 'team.md' });
    expect(team.text, 'roster from the repo-root .squad must be visible from packages/api').toContain('Noether');
    const decided = await b.call('squad_decide', { author: 'Noether', summary: 'Mono decision', body: 'from a subfolder' });
    expect(decided.isError).toBe(false);
    const inbox = fs.readdirSync(path.join(repo, '.squad', 'decisions', 'inbox'));
    expect(inbox.some((f) => /mono-decision/.test(f)), `inbox at the repo root got the decision: ${inbox.join(',')}`).toBe(true);
    expect(fs.existsSync(path.join(sub, '.squad')), 'no stray .squad created under the subfolder').toBe(false);
  }, 60_000);

  it('state-mcp follows config.json teamRoot from a satellite repo (remote mode)', async () => {
    const base = path.join(tmp, 'base');
    gitInit(base);
    squadDir(base);
    const sat = path.join(tmp, 'satellite');
    gitInit(sat);
    fs.mkdirSync(path.join(sat, '.squad'), { recursive: true });
    fs.writeFileSync(path.join(sat, '.squad', 'config.json'), JSON.stringify({ version: 1, teamRoot: '..\\base', projectKey: null }, null, 2) + '\n');
    clearResolveSquadCache();
    const b = await bridge(sat);
    const team = await b.call('squad_state_read', { key: 'team.md' });
    expect(team.text, 'satellite reads the team root roster, so the host coordinator must not see Init Mode').toContain('Noether');
    const decided = await b.call('squad_decide', { author: 'Galois', summary: 'Satellite decision', body: 'recorded from the satellite' });
    expect(decided.isError).toBe(false);
    const inbox = fs.readdirSync(path.join(base, '.squad', 'decisions', 'inbox'));
    expect(inbox.some((f) => /satellite-decision/.test(f)), `decision must land in the team root inbox: ${inbox.join(',')}`).toBe(true);
    expect(fs.existsSync(path.join(sat, '.squad', 'decisions')), 'satellite keeps no local decisions').toBe(false);
  }, 60_000);

  it.each(['orphan', 'two-layer'] as const)('squad_decide over the bridge lands in the squad-state branch for the %s backend, not the working tree', async (backend) => {
    const repo = path.join(tmp, backend);
    const git = gitInit(repo);
    squadDir(repo);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'squad']);
    await migrateStateBackend(repo, backend);
    clearResolveSquadCache();
    const b = await bridge(repo);
    const health = await b.call('squad_state_health');
    expect(health.isError).toBe(false);
    const decided = await b.call('squad_decide', { author: 'Noether', summary: `${backend} decision`, body: 'port 7777' });
    expect(decided.isError, decided.text).toBe(false);
    const listed = await b.call('squad_state_list', { dir: 'decisions/inbox' });
    expect(listed.text, `${backend}: inbox listing`).toMatch(new RegExp(`${backend}-decision`));
    const branchFiles = git(['ls-tree', '-r', '--name-only', 'squad-state']);
    expect(branchFiles, `${backend}: decision committed to squad-state`).toMatch(new RegExp(`decisions/inbox/.*${backend}-decision`));
    const wtInbox = fs.existsSync(path.join(repo, '.squad', 'decisions', 'inbox')) ? fs.readdirSync(path.join(repo, '.squad', 'decisions', 'inbox')) : [];
    expect(wtInbox.filter((f) => f.includes(`${backend}-decision`)), `${backend}: working tree must not receive the decision`).toEqual([]);
  }, 180_000);

  // Finding F6: the digest promises `squad_state_health` "reports the backend: local, orphan, two-layer", but the tool
  // returns the storage class name. This stays `it.fails` until the SDK tool reports `backend.name`; flipping it green
  // then is the signal to drop `.fails` and update the matrix cell.
  it.fails('squad_state_health names the configured backend (orphan) as the coordinator digest promises', async () => {
    const repo = path.join(tmp, 'health-orphan');
    const git = gitInit(repo);
    squadDir(repo);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'squad']);
    await migrateStateBackend(repo, 'orphan');
    clearResolveSquadCache();
    const b = await bridge(repo);
    const health = await b.call('squad_state_health');
    expect(health.text, 'health text should name the backend, got the storage class instead').toMatch(/\borphan\b/);
  }, 180_000);
});

// ─── 3./4. real host binaries (opt-in) ──────────────────────────────────────

const REAL_CLI = process.env['SQUAD_REAL_CLI_TESTS'] === '1' || process.env['SQUAD_REAL_MODEL_TESTS'] === '1';
const REAL_MODEL = process.env['SQUAD_REAL_MODEL_TESTS'] === '1';

function which(cmd: string): string | undefined {
  const exts = process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext.toLowerCase());
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* not here */ }
    }
  }
  return undefined;
}
function run(bin: string, args: string[], cwd: string, timeout = 180_000) {
  const viaCmd = process.platform === 'win32' && /\.(cmd|bat|ps1)$/i.test(bin);
  const file = viaCmd ? (process.env['ComSpec'] ?? 'cmd.exe') : bin;
  const argv = viaCmd ? ['/d', '/s', '/c', `""${bin}" ${args.map((a) => `"${a.replace(/"/g, "'")}"`).join(' ')}"`] : args;
  return spawnSync(file, argv, { cwd, encoding: 'utf8', timeout, windowsVerbatimArguments: viaCmd, env: { ...process.env, SQUAD_NO_PERSONAL: '1' } });
}
const CLAUDE = REAL_CLI ? which('claude') : undefined;
const OPENCODE = REAL_CLI ? which('opencode') : undefined;
const MCP_STDIO_STUB =
  'process.stdin.on("data",d=>{for(const l of String(d).split(/\\r?\\n/).filter(Boolean)){try{const j=JSON.parse(l);if(j.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:j.id,result:{protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"squad_state",version:"1.0.0"},tools:[]}})+"\\n")}catch{}}})';

describe.skipIf(!REAL_CLI)('real host binaries read root projections from a monorepo subfolder (SQUAD_REAL_CLI_TESTS=1)', () => {
  let repo: string;
  let sub: string;
  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-hfm-cli-'));
    gitInit(repo);
    squadDir(repo);
    sub = path.join(repo, 'packages', 'api');
    fs.mkdirSync(sub, { recursive: true });
    const results = installClients(['claude', 'opencode'], { root: repo, mcp: { command: 'node', args: ['-e', MCP_STDIO_STUB] } });
    expect(results.filter((r) => r.action === 'error')).toEqual([]);
  });
  afterAll(() => {
    for (const f of [path.join(sub, 'NUL'), path.join(repo, 'NUL')]) if (fs.existsSync(f)) spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/c', `del "\\\\?\\${f}"`]);
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });

  it.skipIf(!CLAUDE)('claude lists the root .mcp.json squad_state server from packages/api (approval is a separate, per-project step)', () => {
    const r = run(CLAUDE!, ['mcp', 'list'], sub);
    expect(`${r.stdout}${r.stderr}`, 'claude mcp list from a subfolder should still see the repo-root squad_state server').toMatch(/squad_state/);
  }, 120_000);

  it.skipIf(!OPENCODE)('opencode resolves the squad primary agent and the squad_state MCP entry from packages/api', () => {
    const r = run(OPENCODE!, ['debug', 'config'], sub);
    const cfg = JSON.parse(r.stdout);
    expect(cfg.agent?.squad?.mode, 'opencode agent.squad.mode from a subfolder').toBe('primary');
    expect(cfg.mcp?.squad_state?.type, 'opencode mcp.squad_state from a subfolder').toBe('local');
  }, 120_000);
});

describe.skipIf(!REAL_MODEL)('headless coordinator turn against a real model (SQUAD_REAL_MODEL_TESTS=1)', () => {
  let repo: string;
  const PROMPT = 'Who is on the team? Answer in one line (Direct mode) and name the exact squad_state tool you used to read the roster.';
  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-hfm-model-'));
    gitInit(repo);
    squadDir(repo);
    // real bridge: the CLI source through the repo's tsx-free loader is overkill here; use the built CLI when present
    const cli = path.join(ROOT, 'packages', 'squad-cli', 'dist', 'cli-entry.js');
    expect(fs.existsSync(cli), 'SQUAD_REAL_MODEL_TESTS needs a built CLI (npm run build) for the squad_state bridge').toBe(true);
    const results = installClients(['claude', 'opencode'], { root: repo, mcp: { command: process.execPath, args: [cli, 'state-mcp'] } });
    expect(results.filter((r) => r.action === 'error')).toEqual([]);
  });
  afterAll(() => {
    if (fs.existsSync(path.join(repo, 'NUL'))) spawnSync(process.env['ComSpec'] ?? 'cmd.exe', ['/c', `del "\\\\?\\${path.join(repo, 'NUL')}"`]);
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });

  it.skipIf(!CLAUDE)('claude --agent squad reads the roster through mcp__squad_state__squad_state_read (needs --mcp-config headlessly)', () => {
    const r = run(CLAUDE!, ['-p', PROMPT, '--agent', 'squad', '--mcp-config', path.join(repo, '.mcp.json'), '--output-format', 'json', '--permission-mode', 'bypassPermissions', '--max-turns', '8'], repo, 300_000);
    const text = r.stdout;
    expect(text, `claude run failed: ${r.stderr.slice(-500)}`).toMatch(/Noether/);
    expect(text).toMatch(/mcp__squad_state__squad_state_read/);
  }, 320_000);

  it.skipIf(!OPENCODE)('opencode --agent squad reads the roster through squad_state_squad_state_read', () => {
    const r = run(OPENCODE!, ['run', '--agent', 'squad', '--format', 'json', '--auto', PROMPT], repo, 300_000);
    expect(r.stdout, `opencode run failed: ${r.stderr.slice(-500)}`).toMatch(/Noether/);
    expect(r.stdout).toMatch(/squad_state_squad_state_read/);
  }, 320_000);
});

// Referenced by the matrix for host-independent bridge evidence; keep the file name stable.
export const HOST_FEATURE_MATRIX_TEST = THIS_FILE;
