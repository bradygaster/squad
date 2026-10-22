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

type Capability = 'supported' | 'degraded' | 'unsupported' | 'n/a';
type Validation = 'validated-live' | 'validated-test' | 'static-only' | 'untested' | 'blocked';
interface Cell { capability: Capability; validation: Validation; blockedReason?: string; expectedFailure?: boolean; mechanism: string; evidence: string[]; notes?: string }
interface Feature { id: string; name: string; area: string; dependsOn: string[]; hostIndependent?: boolean; cells: Record<string, Cell> }
interface LiveRun { host: string; scenario: string; date: string; outcome: 'pass' | 'partial' | 'fail' | 'blocked'; observedTools?: string[]; notes?: string }
interface ExpectedFailure { featureId: string; test: string; kind: string; perHost?: boolean; hosts?: string[]; meaning: string }
interface Matrix {
  protocol: string;
  hosts: Record<string, { cli: string; installedOnReferenceMachine: boolean; referenceMachineNote?: string; runtime: { subagents: boolean; backgroundRuns: boolean } }>;
  features: Feature[];
  liveRuns: LiveRun[];
  expectedFailures: ExpectedFailure[];
  limitations?: string[];
  capabilities: Record<string, string>;
  validationLevels: Record<string, string>;
  evidenceKinds: Record<string, string>;
}

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as Matrix;
const HOSTS = Object.keys(matrix.hosts);
const CAPABILITIES: Capability[] = ['supported', 'degraded', 'unsupported', 'n/a'];
const VALIDATION_LEVELS: Validation[] = ['validated-live', 'validated-test', 'static-only', 'untested', 'blocked'];
const EVIDENCE_RE = /^(validated-test:[^:]+::.+|validated-manual:lab:[a-z0-9-]+@\d{4}-\d{2}-\d{2}|static-only)$/;
/** Hosts with a passing live run on the reference machine; only these may carry `validated-live`. */
const LIVE_HOSTS = new Set(['claude', 'opencode']);

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
        expect(CAPABILITIES, `${f.id}/${h}: capability ${c!.capability}`).toContain(c!.capability);
        expect(VALIDATION_LEVELS, `${f.id}/${h}: validation ${c!.validation}`).toContain(c!.validation);
        expect(c!.mechanism.length, `${f.id}/${h}: mechanism`).toBeGreaterThan(10);
        expect(Array.isArray(c!.evidence), `${f.id}/${h}: evidence array`).toBe(true);
        for (const v of c!.evidence) expect(v, `${f.id}/${h}: evidence entry ${v}`).toMatch(EVIDENCE_RE);
        // The validation level must be backed by evidence of that kind — the two axes stay honest.
        const kinds = new Set(c!.evidence.map((v) => v.split(':')[0]));
        if (c!.validation === 'validated-live') {
          expect(LIVE_HOSTS.has(h), `${f.id}/${h}: validated-live is only possible for hosts with a passing live run (Claude Code, OpenCode)`).toBe(true);
          expect(kinds.has('validated-manual'), `${f.id}/${h}: validated-live needs a validated-manual:lab entry`).toBe(true);
        }
        if (c!.validation === 'validated-test') expect(kinds.has('validated-test'), `${f.id}/${h}: validated-test needs a validated-test entry`).toBe(true);
        if (c!.validation === 'static-only' || c!.validation === 'untested' || c!.validation === 'blocked') {
          expect(kinds.has('validated-test') || kinds.has('validated-manual'), `${f.id}/${h}: ${c!.validation} cell must not list test/live evidence`).toBe(false);
        }
        if (c!.validation === 'blocked') expect(c!.blockedReason, `${f.id}/${h}: blocked needs blockedReason`).toBeTruthy();
        else expect(c!.blockedReason, `${f.id}/${h}: blockedReason only with blocked`).toBeUndefined();
        if (c!.capability === 'n/a') expect(c!.validation, `${f.id}/${h}: n/a cells are static-only`).toBe('static-only');
      }
    }
    for (const k of CAPABILITIES) expect(matrix.capabilities[k], `capability "${k}" is not defined on the page`).toBeTruthy();
    for (const k of VALIDATION_LEVELS) expect(matrix.validationLevels[k], `validation level "${k}" is not defined on the page`).toBeTruthy();
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
    for (const f of matrix.features) for (const h of HOSTS) for (const v of f.cells[h]!.evidence) {
      if (!v.startsWith('validated-test:')) continue;
      const [, file, name] = /^validated-test:([^:]+)::(.+)$/.exec(v)!;
      const src = read(file!);
      if (name !== '*') expect(src.includes(name!), `${f.id}/${h}: "${name}" not found in ${file}`).toBe(true);
    }
  });

  it('every validated-manual:lab reference has a recorded live run for that host', () => {
    expect(Array.isArray(matrix.liveRuns)).toBe(true);
    for (const f of matrix.features) for (const h of HOSTS) for (const v of f.cells[h]!.evidence) {
      const m = /^validated-manual:lab:([a-z0-9-]+)(?:@.*)?$/.exec(v);
      if (!m) continue;
      const run = matrix.liveRuns.find((r) => r.host === h && r.scenario === m[1]);
      expect(run, `${f.id}/${h}: no live run recorded for scenario ${m[1]}`).toBeDefined();
      expect(['pass', 'partial'], `${f.id}/${h}: live run ${m[1]} outcome ${run!.outcome} cannot back a validated cell`).toContain(run!.outcome);
    }
  });

  it('expected-failure cells are unsupported with a note, and no failed or blocked live run raises a cell to validated-live', () => {
    for (const f of matrix.features) for (const h of HOSTS) {
      const c = f.cells[h]!;
      if (c.expectedFailure) {
        expect(c.notes, `${f.id}/${h}: expected-failure cell needs a note`).toBeTruthy();
        expect(c.capability, `${f.id}/${h}: a digest gap is unsupported for that host, not degraded or supported`).toBe('unsupported');
      }
    }
    for (const r of matrix.liveRuns.filter((r) => r.outcome === 'fail' || r.outcome === 'blocked')) {
      for (const f of matrix.features) {
        const c = f.cells[r.host]!;
        if (c.evidence.some((v) => v.includes(`lab:${r.scenario}`))) expect(c.validation, `${f.id}/${r.host}: ${r.outcome} run ${r.scenario} cannot make the cell validated-live`).not.toBe('validated-live');
      }
    }
  });

  it('every expected failure resolves to one it.fails title per listed host, and every failing cell is an expected failure', () => {
    expect(Array.isArray(matrix.expectedFailures)).toBe(true);
    expect(matrix.expectedFailures.length).toBeGreaterThan(0);
    const cache = new Map<string, string>();
    const read = (rel: string) => {
      if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
      return cache.get(rel)!;
    };
    const covered = new Set<string>();
    for (const e of matrix.expectedFailures) {
      const feat = matrix.features.find((f) => f.id === e.featureId);
      expect(feat, `expected failure for unknown feature ${e.featureId}`).toBeDefined();
      expect(e.kind).toBe('it.fails');
      const [, file, title] = /^([^:]+)::(.+)$/.exec(e.test)!;
      const src = read(file!);
      const hosts = e.perHost ? e.hosts ?? [] : [''];
      expect(hosts.length, `${e.featureId}: perHost expected failure lists no hosts`).toBeGreaterThan(0);
      // Per-host titles are generated as `${PREFIX}${name} [${id}]` for every id in CLIENT_IDS; the matrix stores
      // the title without the host suffix. Resolve it against the gap name literal and the generating template.
      const PREFIX = 'digest gap (expected until the stack adds it): ';
      if (e.perHost) {
        expect(title!.startsWith(PREFIX), `${e.featureId}: per-host expected failure title must start with "${PREFIX}"`).toBe(true);
        const gapName = title!.slice(PREFIX.length);
        expect(src.includes(`['${gapName}', `), `${e.featureId}: gap "${gapName}" is not registered in ${file}`).toBe(true);
        expect(src.includes(`it.fails(\`${PREFIX}\${name} [\${id}]\``), `${file}: per-host it.fails template changed; update the matrix`).toBe(true);
        expect(src.includes('for (const id of CLIENT_IDS) {\n      it.fails('), `${file}: per-host it.fails must iterate CLIENT_IDS`).toBe(true);
        for (const h of hosts) expect(CLIENT_IDS, `${e.featureId}: host ${h} is not a client id`).toContain(h);
      } else {
        expect(src.includes(title!), `${e.featureId}: it.fails title "${title}" not found in ${file}`).toBe(true);
      }
      for (const h of hosts) {
        if (e.perHost) {
          const c = feat!.cells[h];
          expect(c, `${e.featureId}/${h}: no cell for a listed host`).toBeDefined();
          expect(c!.expectedFailure, `${e.featureId}/${h}: expected-failure cell must be flagged expectedFailure`).toBe(true);
          expect(c!.capability, `${e.featureId}/${h}: expected-failure cell is unsupported`).toBe('unsupported');
          expect(c!.evidence.some((v) => v.startsWith(`validated-test:${file}::`)), `${e.featureId}/${h}: evidence must cite the gap test in ${file}`).toBe(true);
          covered.add(`${e.featureId}/${h}`);
        }
      }
    }
    for (const f of matrix.features) for (const h of HOSTS) {
      if (f.cells[h]!.expectedFailure) expect(covered.has(`${f.id}/${h}`), `${f.id}/${h} is flagged expectedFailure but has no expectedFailures entry`).toBe(true);
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
    for (const h of CLIENT_IDS) if (!CAPABILITY_TOKENS_BY_HOST[h].includes('background-runs')) expect(f.cells[h]!.capability, h).not.toBe('supported');
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
    fs.writeFileSync(path.join(sat, '.squad', 'config.json'), JSON.stringify({ version: 1, teamRoot: '../base', projectKey: null }, null, 2) + '\n');
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

  // Finding F1 (fixed in Squad 2.0): a host sees inherited skills/decisions through the bridge, with provenance,
  // without any fetch — the same path every one of the 7 hosts uses (`squad state-mcp`).
  it('squad_state_upstreams over the bridge serves inherited skills and decisions with provenance and never fetches', async () => {
    const org = path.join(tmp, 'upstream-org');
    squadDir(org);
    fs.mkdirSync(path.join(org, '.copilot', 'skills', 'org-logging'), { recursive: true });
    fs.writeFileSync(path.join(org, '.copilot', 'skills', 'org-logging', 'SKILL.md'), '---\nname: org-logging\n---\nEmit JSON logs.\n');
    fs.writeFileSync(path.join(org, '.squad', 'decisions.md'), '# Decisions\n\n### All services expose /healthz\n');
    const repo = path.join(tmp, 'upstream-repo');
    gitInit(repo);
    squadDir(repo);
    fs.writeFileSync(path.join(repo, '.squad', 'upstream.json'), JSON.stringify({ upstreams: [
      { name: 'org', type: 'local', source: org, added_at: '2026-10-22T00:00:00.000Z', last_synced: null },
      { name: 'platform', type: 'git', source: 'https://example.invalid/platform.git', ref: 'main', added_at: '2026-10-22T00:00:00.000Z', last_synced: null },
    ] }, null, 2));
    clearResolveSquadCache();
    const b = await bridge(repo);
    const r = await b.call('squad_state_upstreams', { detail: true });
    expect(r.isError, r.text).toBe(false);
    expect(r.text, 'inherited skill (even one living in .copilot/skills beside the upstream .squad) is visible').toContain('- org-logging — upstream:org@local — active');
    expect(r.text, 'inherited decision body is served').toContain('All services expose /healthz');
    expect(r.text, 'unsynced git upstream fails soft').toMatch(/platform .*unavailable \(not synced\)/);
    expect(r.text).toContain('run "squad upstream sync platform"');
    expect(fs.existsSync(path.join(repo, '.squad', '_upstream_repos')), 'session start must not clone').toBe(false);
  }, 60_000);
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

/**
 * Tee for the real `squad state-mcp` bridge: forwards stdio untouched and appends every JSON-RPC line in both
 * directions to the transcript file given as its first argument. The live-model tests assert on the transcript
 * (a successful `tools/call` of the roster tool with `key: "team.md"`), not on what the model printed.
 */
const MCP_TEE = `
  const { spawn } = require('node:child_process');
  const fs = require('node:fs');
  const log = process.argv[2];
  const child = spawn(process.execPath, process.argv.slice(3), { stdio: ['pipe', 'pipe', 'inherit'] });
  const tee = (dir) => (chunk) => { if (log) fs.appendFileSync(log, String(chunk).split(/\\r?\\n/).filter(Boolean).map((l) => dir + ' ' + l).join('\\n') + '\\n'); };
  process.stdin.on('data', (c) => { tee('>')(c); child.stdin.write(c); });
  process.stdin.on('end', () => child.stdin.end());
  child.stdout.on('data', (c) => { tee('<')(c); process.stdout.write(c); });
  child.on('exit', (code) => process.exit(code ?? 0));
`;

/** Parse a tee transcript and return the ids of successful roster reads (`squad_state_read` with key team.md). */
function successfulRosterReads(transcript: string): number[] {
  const requests = new Map<string | number, { name: string; key?: string }>();
  const ok: number[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    const m = /^([<>]) (\{.*\})$/.exec(line);
    if (!m) continue;
    let msg: { id?: string | number; method?: string; params?: { name?: string; arguments?: { key?: string } }; result?: { isError?: boolean }; error?: unknown };
    try { msg = JSON.parse(m[2]!); } catch { continue; }
    if (m[1] === '>' && msg.method === 'tools/call' && msg.id !== undefined && msg.params?.name) {
      requests.set(msg.id, { name: msg.params.name, key: msg.params.arguments?.key });
    } else if (m[1] === '<' && msg.id !== undefined && requests.has(msg.id) && !msg.error && !msg.result?.isError) {
      const req = requests.get(msg.id)!;
      if (/squad_state_read$/.test(req.name) && req.key === 'team.md') ok.push(Number(msg.id));
    }
  }
  return ok;
}

describe('tee transcript parser (host-independent)', () => {
  it('counts only successful squad_state_read calls for team.md', () => {
    const t = [
      '> {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp__squad_state__squad_state_read","arguments":{"key":"team.md"}}}',
      '< {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"roster"}]}}',
      '> {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"squad_state_read","arguments":{"key":"routing.md"}}}',
      '< {"jsonrpc":"2.0","id":2,"result":{"content":[]}}',
      '> {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"squad_state_read","arguments":{"key":"team.md"}}}',
      '< {"jsonrpc":"2.0","id":3,"result":{"isError":true,"content":[]}}',
      '> {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"squad_state_read","arguments":{"key":"team.md"}}}',
      '< {"jsonrpc":"2.0","id":4,"error":{"code":-1,"message":"nope"}}',
    ].join('\n');
    expect(successfulRosterReads(t)).toEqual([1]);
    expect(successfulRosterReads('Noether mcp__squad_state__squad_state_read team.md')).toEqual([]);
  });
});

describe.skipIf(!REAL_MODEL)('headless coordinator turn against a real model (SQUAD_REAL_MODEL_TESTS=1)', () => {
  let repo: string;
  let teeLog: string;
  const PROMPT = 'Who is on the team? Answer in one line (Direct mode) and name the exact squad_state tool you used to read the roster.';
  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-hfm-model-'));
    gitInit(repo);
    squadDir(repo);
    // real bridge: the CLI source through the repo's tsx-free loader is overkill here; use the built CLI when present
    const cli = path.join(ROOT, 'packages', 'squad-cli', 'dist', 'cli-entry.js');
    expect(fs.existsSync(cli), 'SQUAD_REAL_MODEL_TESTS needs a built CLI (npm run build) for the squad_state bridge').toBe(true);
    teeLog = path.join(repo, 'mcp-transcript.log');
    const teeScript = path.join(repo, 'mcp-tee.cjs');
    fs.writeFileSync(teeScript, MCP_TEE);
    const results = installClients(['claude', 'opencode'], { root: repo, mcp: { command: process.execPath, args: [teeScript, teeLog, cli, 'state-mcp'] } });
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
    const transcript = fs.existsSync(teeLog) ? fs.readFileSync(teeLog, 'utf8') : '';
    expect(successfulRosterReads(transcript).length, `claude: no successful squad_state_read(team.md) over the bridge; transcript:\n${transcript.slice(-2000)}`).toBeGreaterThan(0);
  }, 320_000);

  it.skipIf(!OPENCODE)('opencode --agent squad reads the roster through squad_state_squad_state_read', () => {
    const r = run(OPENCODE!, ['run', '--agent', 'squad', '--format', 'json', '--auto', PROMPT], repo, 300_000);
    expect(r.stdout, `opencode run failed: ${r.stderr.slice(-500)}`).toMatch(/Noether/);
    const transcript = fs.existsSync(teeLog) ? fs.readFileSync(teeLog, 'utf8') : '';
    expect(successfulRosterReads(transcript).length, `opencode: no successful squad_state_read(team.md) over the bridge; transcript:\n${transcript.slice(-2000)}`).toBeGreaterThan(0);
  }, 320_000);
});

// Referenced by the matrix for host-independent bridge evidence; keep the file name stable.
export const HOST_FEATURE_MATRIX_TEST = THIS_FILE;
