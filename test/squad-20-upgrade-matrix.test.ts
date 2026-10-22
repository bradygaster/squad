/**
 * Squad 2.0 upgrade matrix: real old releases × OS × project state shape.
 *
 * Two layers:
 *
 * 1. **Integrity (always runs)** — `test-fixtures/spec/suite-v0.2/upgrade-matrix.json` is the
 *    committed record of the last matrix runs. It must parse, every expected failure must point at a
 *    recorded finding, and the "Tested upgrade paths" section of
 *    `docs/src/content/docs/scenarios/upgrading.md` must be the rendered output of that JSON
 *    (`node scripts/render-upgrade-matrix.mjs --check`).
 *
 * 2. **Matrix (opt-in: `SQUAD_UPGRADE_MATRIX=1`)** — for every producer version that is still
 *    obtainable as a *published artifact* (npm tarball through the registry npm is configured for —
 *    `NPM_CONFIG_REGISTRY` wins — or a standalone bundle from the GitHub Release when npm never got
 *    that version), scaffold a project with the OLD CLI under several state shapes, then upgrade it
 *    with the NEW CLI packed from this tree (`npm pack` of squad-sdk + squad-cli) and assert:
 *    user state byte-exact, casting pair valid, state backend preserved, `.ai-team/` migrated,
 *    `teamRoot` absent, profile squad sha256-identical, user config merged not clobbered, all 7 host
 *    projections, `squad doctor` green, `uninstallClients` rollback byte-exact, second `upgrade` a
 *    no-op, and the OLD CLI's behavior against the upgraded project recorded.
 *
 *    Producers that cannot be obtained (registry unreachable, release asset missing, checksum
 *    mismatch) are **skipped loudly** with the reason recorded in the results JSON — never silently
 *    passed. Known product bugs are pinned in the fixture's `expectedFailures`: the matching check is
 *    reported as `xfail`; if it starts passing the suite fails (`xpass`) so the pin must be removed.
 *
 * Results are written to `SQUAD_UPGRADE_MATRIX_OUT` (default
 * `node_modules/.cache/squad-upgrade-matrix/results-<platform>.json`) and folded into the fixture with
 * `node scripts/render-upgrade-matrix.mjs --merge <results.json>`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const MATRIX_PATH = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'upgrade-matrix.json');
const PAGE_PATH = path.join(ROOT, 'docs', 'src', 'content', 'docs', 'scenarios', 'upgrading.md');
const RENDERER = pathToFileURL(path.join(ROOT, 'scripts', 'render-upgrade-matrix.mjs')).href;
const ENABLED = process.env['SQUAD_UPGRADE_MATRIX'] === '1';
const PLATFORM = process.platform;

// ─── fixture types ───────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'xfail' | 'xpass' | 'skipped';
type ScenarioStatus = 'pass' | 'fail' | 'skipped';
interface Check { id: string; status: CheckStatus; detail?: string }
interface ScenarioResult {
  producer: string;
  source: ProducerSource;
  shape: string;
  status: ScenarioStatus;
  reason?: string;
  checks: Check[];
  notes: string[];
}
interface ExpectedFailure {
  finding: string;
  check: string;
  producers: string[] | '*';
  shapes: string[] | '*';
  platforms: string[] | '*';
  /** For set-valued checks: the exact detail that is known/expected. Any other failure is a real `fail`. */
  knownDetail?: string;
}
interface Finding { id: string; title: string; severity: string; layer: string; repro: string[]; observed: string; resolved?: string }
interface Run { platform: string; arch: string; node: string; target: string; commit: string; recordedAt: string; results: ScenarioResult[] }
interface Matrix {
  protocol: string;
  producers: ProducerSpec[];
  shapes: Record<string, string>;
  checks: Record<string, string>;
  expectedFailures: ExpectedFailure[];
  findings: Finding[];
  runs: Run[];
}

type ProducerSource = 'npm' | 'github-release' | 'pack';
interface ProducerSpec {
  version: string;
  source: ProducerSource;
  /** Why this producer is in the matrix. */
  why: string;
  /** Feature support of the OLD CLI (determines which shapes are attempted). */
  supports: { stateBackend: boolean; dryRun: boolean };
}

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as Matrix;
const SHAPES = Object.keys(matrix.shapes);
const CHECK_IDS = Object.keys(matrix.checks);
const CLIENT_IDS = ['copilot', 'claude', 'kiro', 'opencode', 'cursor', 'codex', 'antigravity'];

// ─── 1. integrity (always) ──────────────────────────────────────────────────

describe('upgrade-matrix.json integrity', () => {
  it('declares producers, shapes, checks, and a protocol', () => {
    expect(matrix.protocol).toBe('upgrade-matrix/v1');
    expect(matrix.producers.length).toBeGreaterThanOrEqual(5);
    expect(matrix.producers.some((p) => p.source === 'pack'), 'HEAD→HEAD (same-version) producer must be present').toBe(true);
    for (const p of matrix.producers) {
      expect(p.version, `${p.version}: version`).toMatch(/^(\d+\.\d+\.\d+(-[\w.]+)?|HEAD)$/);
      expect(['npm', 'github-release', 'pack']).toContain(p.source);
    }
    for (const id of ['default', 'profile', 'legacy-casting', 'orphan', 'two-layer', 'ai-team', 'upstream']) {
      expect(SHAPES, `shape ${id} must be declared`).toContain(id);
    }
    for (const id of ['producer-init', 'upgrade-plain', 'coordinator-is-new-template', 'user-state-preserved', 'casting-pair-valid',
      'state-backend-preserved', 'ai-team-migrated', 'team-root-absent', 'profile-untouched', 'idempotent-second-upgrade',
      'clients-projected', 'user-config-preserved', 'doctor', 'rollback-byte-exact', 'downgrade-probe']) {
      expect(CHECK_IDS, `check ${id} must be declared`).toContain(id);
    }
  });

  it('every expected failure names a declared check and a recorded finding', () => {
    const findingIds = new Set(matrix.findings.map((f) => f.id));
    for (const xf of matrix.expectedFailures) {
      expect(CHECK_IDS, `expectedFailure ${xf.finding}: unknown check ${xf.check}`).toContain(xf.check);
      expect(findingIds.has(xf.finding), `expectedFailure for ${xf.check} references unrecorded finding ${xf.finding}`).toBe(true);
      if (xf.producers !== '*') for (const p of xf.producers) expect(matrix.producers.map((x) => x.version), `${xf.finding}: unknown producer ${p}`).toContain(p);
      if (xf.shapes !== '*') for (const s of xf.shapes) expect(SHAPES, `${xf.finding}: unknown shape ${s}`).toContain(s);
    }
    for (const f of matrix.findings) {
      expect(f.repro.length, `finding ${f.id} needs a repro`).toBeGreaterThan(0);
      expect(f.observed.length, `finding ${f.id} needs an observed outcome`).toBeGreaterThan(0);
      const pinned = matrix.expectedFailures.some((xf) => xf.finding === f.id);
      expect(pinned || !!f.resolved, `finding ${f.id} is neither pinned as an expected failure nor marked resolved`).toBe(true);
      expect(!(pinned && f.resolved), `finding ${f.id} is marked resolved but still pinned — remove its expectedFailures entries`).toBe(true);
    }
  });

  it('recorded runs only use declared producers/shapes/checks and honest statuses', () => {
    for (const run of matrix.runs) {
      expect(run.platform).toMatch(/^(win32|linux|darwin)$/);
      for (const r of run.results) {
        expect(matrix.producers.map((p) => p.version), `${run.platform}: unknown producer ${r.producer}`).toContain(r.producer);
        expect(SHAPES, `${run.platform}: unknown shape ${r.shape}`).toContain(r.shape);
        expect(['pass', 'fail', 'skipped']).toContain(r.status);
        if (r.status === 'skipped') expect(r.reason, `${run.platform} ${r.producer}/${r.shape}: skipped without a reason`).toBeTruthy();
        for (const c of r.checks) {
          expect(CHECK_IDS, `${run.platform} ${r.producer}/${r.shape}: unknown check ${c.id}`).toContain(c.id);
          expect(['pass', 'fail', 'xfail', 'xpass', 'skipped']).toContain(c.status);
        }
        const failed = r.checks.filter((c) => c.status === 'fail' || c.status === 'xpass');
        if (r.status === 'pass') expect(failed, `${run.platform} ${r.producer}/${r.shape} recorded as pass but has failing checks`).toEqual([]);
      }
    }
  });

  it('the "Tested upgrade paths" section of upgrading.md is up to date with the JSON', async () => {
    const { renderSection, extractSection } = (await import(RENDERER)) as {
      renderSection: (m: unknown) => string;
      extractSection: (page: string) => string | null;
    };
    const expected = renderSection(matrix).replace(/\r\n/g, '\n');
    const actual = extractSection(fs.readFileSync(PAGE_PATH, 'utf8').replace(/\r\n/g, '\n'));
    expect(actual, 'docs/src/content/docs/scenarios/upgrading.md upgrade-matrix section is stale; run node scripts/render-upgrade-matrix.mjs').toBe(expected);
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────

interface Cmd { code: number; stdout: string; stderr: string }

async function run(file: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeout?: number }): Promise<Cmd> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: opts.cwd, env: opts.env, encoding: 'utf8', timeout: opts.timeout ?? 120_000, maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
    const code = typeof e.code === 'number' ? e.code : e.killed ? 124 : 1;
    return { code, stdout: e.stdout ?? '', stderr: (e.stderr ?? '') + (typeof e.code === 'string' ? `\n${e.code}: ${e.message}` : '') };
  }
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** rel path → sha256 for every file under `dir` (skips `.git/`). */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === '.git') continue;
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).replace(/\\/g, '/');
      if (e.isSymbolicLink()) out.set(rel, `link:${fs.readlinkSync(p)}`);
      else if (e.isDirectory()) walk(p);
      else out.set(rel, sha256(fs.readFileSync(p)));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function fingerprint(dir: string): string {
  return [...snapshot(dir)].map(([k, v]) => `${k}:${v}`).join('\n');
}

function diffSnapshots(a: Map<string, string>, b: Map<string, string>): string[] {
  const changed = new Set<string>();
  for (const [k, v] of a) if (b.get(k) !== v) changed.add(k);
  for (const k of b.keys()) if (!a.has(k)) changed.add(k);
  return [...changed].sort();
}

function read(p: string): string | null {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function readJson<T = Record<string, unknown>>(p: string): T | null {
  const raw = read(p);
  if (raw === null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function tail(s: string, n = 3): string {
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-n).join(' | ');
}

function rmrf(p: string): void {
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* best effort on Windows */ }
}

/**
 * Extract an archive. On Windows prefer the system bsdtar: under GitHub's bash shell `tar` on PATH is
 * Git's GNU tar, which reads `D:\...` as a `host:path` remote spec. Paths are passed relative to `cwd`
 * so either implementation accepts them.
 */
function extract(archive: string, dest: string): void {
  const sysTar = PLATFORM === 'win32' ? path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe') : null;
  const bin = sysTar && fs.existsSync(sysTar) ? sysTar : 'tar';
  const cwd = path.dirname(archive);
  execFileSync(bin, ['-xf', path.basename(archive), '-C', path.relative(cwd, dest) || '.'], { cwd, stdio: 'pipe' });
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Squad Matrix', GIT_AUTHOR_EMAIL: 'matrix@example.invalid',
  GIT_COMMITTER_NAME: 'Squad Matrix', GIT_COMMITTER_EMAIL: 'matrix@example.invalid',
  GIT_CONFIG_GLOBAL: PLATFORM === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
};

/** Child-process environment that cannot see the developer's real profile squad or home. */
function isolatedEnv(configHome: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env, ...GIT_ENV,
    CI: '1', SQUAD_NONINTERACTIVE: '1', NO_COLOR: '1', FORCE_COLOR: '0', SQUAD_INIT_NO_COLOR: '1', TERM: 'dumb',
    APPDATA: configHome, LOCALAPPDATA: configHome, XDG_CONFIG_HOME: configHome,
    SQUAD_HOME_DIR_OVERRIDE: path.join(configHome, 'squad-home'),
    ...extra,
  };
  if (PLATFORM === 'darwin') env['HOME'] = configHome;
  delete env['NODE_PATH'];
  delete env['NODE_OPTIONS'];
  delete env['SQUAD_TEAM_ROOT'];
  for (const k of Object.keys(env)) if (k.startsWith('npm_')) delete env[k];
  return env;
}

// ─── producers ──────────────────────────────────────────────────────────────

interface Producer {
  spec: ProducerSpec;
  /** How to invoke the OLD CLI: [file, ...leadingArgs] */
  exec: { file: string; args: string[]; env: NodeJS.ProcessEnv } | null;
  skipReason?: string;
  detail?: string;
}

const CACHE_ROOT = path.join(ROOT, 'node_modules', '.cache', 'squad-upgrade-matrix');
const RELEASE_BASE = process.env['SQUAD_UPGRADE_MATRIX_RELEASE_BASE'] ?? 'https://github.com/bradygaster/squad/releases/download';

function releaseAsset(): { name: string; ext: 'zip' | 'tar.gz' } | null {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  if (!arch) return null;
  if (PLATFORM === 'win32') return { name: `squad-win32-${arch}.zip`, ext: 'zip' };
  if (PLATFORM === 'linux') return { name: `squad-linux-${arch}.tar.gz`, ext: 'tar.gz' };
  if (PLATFORM === 'darwin') return { name: `squad-darwin-${arch}.tar.gz`, ext: 'tar.gz' };
  return null;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'squad-upgrade-matrix' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function resolveNpmProducer(spec: ProducerSpec): Promise<Producer> {
  const dir = path.join(CACHE_ROOT, 'producers', `npm-${spec.version}`);
  const entry = path.join(dir, 'node_modules', '@bradygaster', 'squad-cli', 'dist', 'cli-entry.js');
  const registry = process.env['NPM_CONFIG_REGISTRY'] ?? process.env['npm_config_registry'];
  if (!fs.existsSync(entry)) {
    rmrf(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'squad-upgrade-matrix-producer', private: true }, null, 2) + '\n');
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    if (registry) env['NPM_CONFIG_REGISTRY'] = registry;
    const npm = PLATFORM === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['install', '--prefix', dir, `@bradygaster/squad-cli@${spec.version}`, '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'];
    const r = PLATFORM === 'win32'
      ? await run(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `${npm} ${args.join(' ')}`], { cwd: dir, env, timeout: 600_000 })
      : await run(npm, args, { cwd: dir, env, timeout: 600_000 });
    if (r.code !== 0 || !fs.existsSync(entry)) {
      rmrf(dir);
      return { spec, exec: null, skipReason: `npm install @bradygaster/squad-cli@${spec.version} failed via ${registry ?? 'the npm-configured registry'}: ${tail(r.stderr || r.stdout, 2) || `exit ${r.code}`}` };
    }
  }
  return { spec, exec: { file: process.execPath, args: [entry], env: {} }, detail: `npm tarball via ${registry ?? 'npm-configured registry'}` };
}

async function resolveReleaseProducer(spec: ProducerSpec): Promise<Producer> {
  const asset = releaseAsset();
  if (!asset) return { spec, exec: null, skipReason: `no standalone bundle is published for ${PLATFORM}/${process.arch}` };
  const dir = path.join(CACHE_ROOT, 'producers', `release-${spec.version}`);
  const bundleDir = path.join(dir, asset.name.replace(/\.(zip|tar\.gz)$/, ''));
  const launcher = PLATFORM === 'win32' ? path.join(bundleDir, 'squad.exe') : path.join(bundleDir, 'squad');
  if (!fs.existsSync(launcher)) {
    rmrf(dir);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const base = `${RELEASE_BASE}/v${spec.version}`;
      const [sums, bytes] = await Promise.all([fetchBuffer(`${base}/SHA256SUMS.txt`), fetchBuffer(`${base}/${asset.name}`)]);
      const want = sums.toString('utf8').split(/\r?\n/).find((l) => l.trim().endsWith(asset.name))?.trim().split(/\s+/)[0];
      const got = sha256(bytes);
      if (!want) throw new Error(`${asset.name} is not listed in SHA256SUMS.txt`);
      if (want !== got) throw new Error(`checksum mismatch for ${asset.name}: expected ${want}, got ${got}`);
      const archive = path.join(dir, asset.name);
      fs.writeFileSync(archive, bytes);
      extract(archive, dir);
      fs.rmSync(archive, { force: true });
      if (!fs.existsSync(launcher)) throw new Error(`bundle did not contain ${path.basename(launcher)}`);
      if (PLATFORM !== 'win32') fs.chmodSync(launcher, 0o755);
    } catch (err) {
      rmrf(dir);
      return { spec, exec: null, skipReason: `GitHub Release v${spec.version} ${asset.name} unavailable: ${(err as Error).message}` };
    }
  }
  const info = readJson<{ nodeVersion?: string }>(path.join(bundleDir, 'BUNDLE-INFO.json'));
  return {
    spec,
    exec: { file: launcher, args: [], env: { SQUAD_STANDALONE_HOME: bundleDir + path.sep } },
    detail: `standalone bundle ${asset.name} (bundled node ${info?.nodeVersion ?? '?'})`,
  };
}

// ─── the matrix ─────────────────────────────────────────────────────────────

describe.skipIf(!ENABLED)('old-version × OS × state-shape upgrade matrix (SQUAD_UPGRADE_MATRIX=1)', () => {
  let staging: string;
  let newCli: { file: string; args: string[]; env: NodeJS.ProcessEnv };
  let newVersion: string;
  const producers = new Map<string, Producer>();
  const results: ScenarioResult[] = [];
  const workRoots: string[] = [];

  beforeAll(async () => {
    const sdkDir = path.join(ROOT, 'packages', 'squad-sdk');
    const cliDir = path.join(ROOT, 'packages', 'squad-cli');
    const buildEnv = { ...process.env, SKIP_BUILD_BUMP: '1', NO_COLOR: '1', FORCE_COLOR: '0' };
    const npmShell = PLATFORM === 'win32';
    if (!fs.existsSync(path.join(sdkDir, 'dist', 'index.js'))) execFileSync('npm', ['run', 'build'], { cwd: sdkDir, stdio: 'inherit', env: buildEnv, shell: npmShell });
    if (!fs.existsSync(path.join(cliDir, 'dist', 'cli-entry.js'))) execFileSync('npm', ['run', 'build'], { cwd: cliDir, stdio: 'inherit', env: buildEnv, shell: npmShell });

    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    staging = fs.mkdtempSync(path.join(CACHE_ROOT, 'staging-'));
    const tarballs = path.join(staging, 'tarballs');
    fs.mkdirSync(tarballs);
    const pack = (pkgDir: string): string => {
      const out = execFileSync('npm', ['pack', '--quiet', '--ignore-scripts', '--pack-destination', tarballs], { cwd: pkgDir, encoding: 'utf8', shell: npmShell, env: buildEnv }).trim();
      return path.join(tarballs, out.split(/\r?\n/).filter(Boolean).pop()!.trim());
    };
    const unpack = (tarball: string, dest: string) => {
      const tmp = fs.mkdtempSync(path.join(tarballs, 'x-'));
      extract(tarball, tmp);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(tmp, 'package'), dest);
      rmrf(tmp);
    };
    unpack(pack(sdkDir), path.join(staging, 'node_modules', '@bradygaster', 'squad-sdk'));
    unpack(pack(cliDir), path.join(staging, 'node_modules', '@bradygaster', 'squad-cli'));
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ name: 'squad-upgrade-matrix-consumer', private: true, type: 'module' }, null, 2) + '\n');
    newVersion = (readJson<{ version: string }>(path.join(staging, 'node_modules', '@bradygaster', 'squad-cli', 'package.json')))!.version;
    newCli = {
      file: process.execPath,
      args: [path.join(staging, 'node_modules', '@bradygaster', 'squad-cli', 'dist', 'cli-entry.js')],
      env: { NODE_PATH: [path.join(staging, 'node_modules'), path.join(ROOT, 'node_modules')].join(path.delimiter) },
    };

    const only = process.env['SQUAD_UPGRADE_MATRIX_PRODUCERS']?.split(',').map((s) => s.trim()).filter(Boolean);
    await Promise.all(matrix.producers.map(async (spec) => {
      if (only && only.length && !only.includes(spec.version)) {
        producers.set(spec.version, { spec, exec: null, skipReason: `excluded by SQUAD_UPGRADE_MATRIX_PRODUCERS=${only.join(',')}` });
        return;
      }
      const p = spec.source === 'pack'
        ? { spec, exec: newCli, detail: `packed from this tree (v${newVersion})` }
        : spec.source === 'npm' ? await resolveNpmProducer(spec) : await resolveReleaseProducer(spec);
      producers.set(spec.version, p);
      if (p.skipReason) console.warn(`⏭️  upgrade-matrix: producer ${spec.version} skipped — ${p.skipReason}`);
      else process.stdout.write(`✅ upgrade-matrix: producer ${spec.version} ready — ${p.detail}\n`);
    }));
  }, 20 * 60_000);

  afterAll(() => {
    const out = process.env['SQUAD_UPGRADE_MATRIX_OUT'] ?? path.join(CACHE_ROOT, `results-${PLATFORM}.json`);
    let commit = 'unknown';
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* no git */ }
    const run: Run = { platform: PLATFORM, arch: process.arch, node: process.version, target: newVersion ?? 'unbuilt', commit, recordedAt: new Date().toISOString(), results };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
    const counts = { pass: 0, fail: 0, skipped: 0 };
    for (const r of results) counts[r.status]++;
    const lines = [`\nupgrade-matrix (${PLATFORM}/${process.arch}, target v${run.target}): ${counts.pass} pass, ${counts.fail} fail, ${counts.skipped} skipped → ${path.relative(ROOT, out)}`];
    for (const r of results) {
      const bad = r.checks.filter((c) => c.status !== 'pass' && c.status !== 'skipped').map((c) => `${c.id}=${c.status}${c.detail ? ` (${c.detail})` : ''}`);
      lines.push(`  ${r.status.padEnd(7)} ${r.producer.padEnd(8)} ${r.shape.padEnd(15)}${r.reason ? ` ${r.reason}` : ''}${bad.length ? ` ${bad.join('; ')}` : ''}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    if (process.env['SQUAD_UPGRADE_MATRIX_KEEP'] !== '1') {
      for (const w of workRoots) rmrf(w);
      rmrf(staging);
    }
  }, 10 * 60_000);

  function expected(check: string, producer: string, shape: string): ExpectedFailure | undefined {
    return matrix.expectedFailures.find((xf) => xf.check === check
      && (xf.producers === '*' || xf.producers.includes(producer))
      && (xf.shapes === '*' || xf.shapes.includes(shape))
      && (xf.platforms === '*' || xf.platforms.includes(PLATFORM)));
  }

  class Scenario {
    readonly checks: Check[] = [];
    readonly notes: string[] = [];
    constructor(readonly producer: Producer, readonly shape: string) {}

    /** Record a boolean check, applying the expected-failure pin. */
    check(id: string, ok: boolean, detail?: string): boolean {
      const xf = expected(id, this.producer.spec.version, this.shape);
      let status: CheckStatus;
      if (ok) status = xf ? 'xpass' : 'pass';
      else if (xf && (!xf.knownDetail || xf.knownDetail === detail)) status = 'xfail';
      else status = 'fail';
      this.checks.push({ id, status, detail: status === 'pass' ? undefined : detail ?? (xf ? xf.finding : undefined) });
      if (status === 'xfail') this.notes.push(`${id}: ${xf!.finding}`);
      return ok;
    }

    skip(id: string, why: string): void {
      this.checks.push({ id, status: 'skipped', detail: why });
    }

    result(status?: ScenarioStatus, reason?: string): ScenarioResult {
      const failed = this.checks.some((c) => c.status === 'fail' || c.status === 'xpass');
      return { producer: this.producer.spec.version, source: this.producer.spec.source, shape: this.shape, status: status ?? (failed ? 'fail' : 'pass'), reason, checks: this.checks, notes: this.notes };
    }
  }

  const USER_MCP_SERVER = { command: 'node', args: ['my-server.js'], env: { TOKEN_FILE: 'secrets/token' } };
  const USER_AGENTS_MD = '# My project\n\nHand-written AGENTS.md paragraph that Squad must keep.\n';
  const USER_CLAUDE_MD = '# Claude notes\n\nKeep this paragraph verbatim.\n';
  const USER_GITIGNORE_LINE = 'my-private-notes/';
  const PROBE_CHARTER = '# Probe\n\n## Identity\n- **Name:** Probe\n- **Role:** Upgrade Probe\n\n## Notes\nWritten by the matrix before upgrade.\n';
  const PROBE_HISTORY = '# History\n\n- pre-upgrade learning (must survive byte-exact)\n';

  function seedProfile(configHome: string): string {
    const root = path.join(configHome, 'squad');
    const personal = path.join(root, 'personal-squad');
    const global = path.join(root, '.squad');
    fs.mkdirSync(path.join(personal, 'agents', 'ghostwriter'), { recursive: true });
    fs.writeFileSync(path.join(personal, 'config.json'), JSON.stringify({ defaultModel: 'auto' }, null, 2) + '\n');
    fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'charter.md'), '# Ghostwriter\n\n## Identity\n- **Name:** Ghostwriter\n- **Role:** Advisor\n');
    fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'history.md'), '# History\n\n- learned something\n');
    fs.mkdirSync(path.join(global, 'agents', 'globetrotter'), { recursive: true });
    fs.writeFileSync(path.join(global, 'config.json'), JSON.stringify({ version: 1 }, null, 2) + '\n');
    fs.writeFileSync(path.join(global, 'team.md'), '# Global Squad\n\n## Members\n\n| Name | Role |\n|---|---|\n| Globetrotter | Advisor |\n');
    fs.writeFileSync(path.join(global, 'agents', 'globetrotter', 'charter.md'), '# Globetrotter\n');
    return root;
  }

  async function git(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): Promise<Cmd> {
    return run('git', args, { cwd, env, timeout: 30_000 });
  }

  async function runScenario(producer: Producer, shape: string): Promise<ScenarioResult> {
    const s = new Scenario(producer, shape);
    const { spec } = producer;
    if (!producer.exec) return s.result('skipped', producer.skipReason);
    if ((shape === 'orphan' || shape === 'two-layer') && !spec.supports.stateBackend) return s.result('skipped', `producer ${spec.version} has no --state-backend flag`);
    if (shape === 'upstream' && spec.source !== 'pack') return s.result('skipped', `upstream inheritance is a Squad 2.0 feature; producer ${spec.version} cannot declare upstream.json`);

    const work = fs.mkdtempSync(path.join(os.tmpdir(), `squad-um-${spec.version.replace(/[^\w.]/g, '_')}-${shape}-`));
    workRoots.push(work);
    const project = path.join(work, 'project');
    const configHome = path.join(work, 'config-home');
    fs.mkdirSync(project);
    fs.mkdirSync(configHome);
    const oldEnv = isolatedEnv(configHome, producer.exec.env);
    const newEnv = isolatedEnv(configHome, newCli.env);
    const oldCli = (...args: string[]) => run(producer.exec!.file, [...producer.exec!.args, ...args], { cwd: project, env: oldEnv, timeout: 180_000 });
    const squad = (cwd: string, ...args: string[]) => run(newCli.file, [...newCli.args, ...args], { cwd, env: newEnv, timeout: 180_000 });

    await git(project, newEnv, 'init', '-q', '-b', 'main');
    await git(project, newEnv, 'commit', '-q', '--allow-empty', '-m', 'init');

    const profileRoot = shape === 'profile' ? seedProfile(configHome) : null;
    const profileBefore = profileRoot ? fingerprint(profileRoot) : null;

    // 1. OLD CLI scaffolds the project ─────────────────────────────────────
    const initArgs = ['init', ...(shape === 'orphan' || shape === 'two-layer' ? ['--state-backend', shape] : [])];
    const init = await oldCli(...initArgs);
    const teamMd = path.join(project, '.squad', 'team.md');
    if (!s.check('producer-init', init.code === 0 && fs.existsSync(teamMd), `exit ${init.code}: ${tail(init.stderr || init.stdout)}`)) {
      return s.result('fail', `old CLI ${spec.version} ${initArgs.join(' ')} failed: exit ${init.code} — ${tail(init.stderr || init.stdout)}`);
    }
    const cfgAfterInit = readJson(path.join(project, '.squad', 'config.json')) ?? {};
    if (typeof cfgAfterInit['teamRoot'] === 'string') s.notes.push(`producer wrote teamRoot=${String(cfgAfterInit['teamRoot']).replace(configHome, '<config-home>')} at init`);

    // 2. Seed user state + user-owned config ───────────────────────────────
    const agentDir = path.join(project, '.squad', 'agents', 'probe');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'charter.md'), PROBE_CHARTER);
    fs.writeFileSync(path.join(agentDir, 'history.md'), PROBE_HISTORY);
    fs.appendFileSync(path.join(project, '.squad', 'decisions.md'), '\n## Matrix decision\n\n- recorded before upgrade; must survive byte-exact\n');
    fs.appendFileSync(teamMd, '| Probe | Upgrade Probe | .squad/agents/probe/charter.md | ✅ Active |\n');
    const mcpPath = path.join(project, '.mcp.json');
    const mcp = readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath) ?? { mcpServers: {} };
    mcp.mcpServers = { ...(mcp.mcpServers ?? {}), 'user-custom': USER_MCP_SERVER };
    fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), USER_AGENTS_MD);
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), USER_CLAUDE_MD);
    fs.appendFileSync(path.join(project, '.gitignore'), `\n# user rule\n${USER_GITIGNORE_LINE}\n`);

    if (shape === 'legacy-casting') {
      const casting = path.join(project, '.squad', 'casting');
      for (const f of fs.readdirSync(casting)) fs.rmSync(path.join(casting, f), { recursive: true, force: true });
      fs.writeFileSync(path.join(casting, 'registry.json'), JSON.stringify({ universe: 'Star Trek', agents: [{ name: 'Probe', role: 'Upgrade Probe', status: 'active' }] }, null, 2) + '\n');
    }
    if (shape === 'ai-team') {
      fs.renameSync(path.join(project, '.squad'), path.join(project, '.ai-team'));
    }
    let upstreamJsonBefore: string | null = null;
    if (shape === 'upstream') {
      const upstream = path.join(work, 'upstream-squad');
      fs.mkdirSync(upstream);
      await git(upstream, newEnv, 'init', '-q', '-b', 'main');
      const ui = await squad(upstream, 'init');
      const add = await squad(project, 'upstream', 'add', upstream, '--name', 'org');
      upstreamJsonBefore = read(path.join(project, '.squad', 'upstream.json'));
      if (ui.code !== 0 || add.code !== 0 || !upstreamJsonBefore) return s.result('fail', `could not configure upstream: init exit ${ui.code}, add exit ${add.code} — ${tail(add.stderr || add.stdout)}`);
    }

    const stateDirBefore = shape === 'ai-team' ? '.ai-team' : '.squad';
    const preserved = ['decisions.md', 'agents/probe/charter.md', 'agents/probe/history.md', 'team.md'];
    const before = snapshot(project);
    const preservedBefore = Object.fromEntries(preserved.map((rel) => [rel, before.get(`${stateDirBefore}/${rel}`)]));
    const backendBefore = (readJson(path.join(project, stateDirBefore, 'config.json')) ?? {})['stateBackend'];

    // 3. NEW CLI: plain upgrade ────────────────────────────────────────────
    const up = await squad(project, 'upgrade', ...(shape === 'ai-team' ? ['--migrate-directory'] : []));
    if (!s.check('upgrade-plain', up.code === 0, `exit ${up.code}: ${tail(up.stderr || up.stdout)}`)) {
      return s.result('fail', `squad upgrade failed: exit ${up.code} — ${tail(up.stderr || up.stdout)}`);
    }
    const afterPlain = snapshot(project);
    const coordinator = read(path.join(project, '.github', 'agents', 'squad.agent.md')) ?? '';
    const stampRe = /<!-- version: ([^\s>]+) -->/.exec(coordinator);
    s.check('coordinator-is-new-template', stampRe?.[1] === newVersion && coordinator.includes(`- **Version:** ${newVersion}`), `coordinator stamp is ${stampRe?.[1] ?? 'missing'}, expected ${newVersion}`);

    const changedPreserved = preserved.filter((rel) => afterPlain.get(`.squad/${rel}`) !== preservedBefore[rel]);
    s.check('user-state-preserved', changedPreserved.length === 0, changedPreserved.length ? `rewritten: ${changedPreserved.join(', ')}` : undefined);

    const castingScript = [
      'import { readCastingRegistryPair } from "@bradygaster/squad-sdk/casting";',
      `const pair = readCastingRegistryPair(${JSON.stringify(path.join(project, '.squad', 'casting'))});`,
      'const reg = pair.registry; const agents = reg && reg.agents ? Object.keys(reg.agents) : [];',
      'if (!reg || typeof reg.revision !== "number" || !pair.history) throw new Error("registry/history pair invalid: " + JSON.stringify({ hasRegistry: !!reg, revision: reg && reg.revision, hasHistory: !!pair.history }));',
      'console.log(JSON.stringify({ revision: reg.revision, agents }));',
    ].join(' ');
    const casting = await run(process.execPath, ['--input-type=module', '-e', castingScript], { cwd: staging, env: newEnv, timeout: 30_000 });
    const castingInfo = casting.code === 0 ? (JSON.parse(casting.stdout.trim()) as { revision: number; agents: string[] }) : null;
    const castingDir = path.join(project, '.squad', 'casting');
    const archive = fs.existsSync(castingDir) ? fs.readdirSync(castingDir).find((n) => /^(handwritten|legacy)-archive-/.test(n)) : undefined;
    const castingOk = casting.code === 0 && (shape !== 'legacy-casting' || (!!archive && !!castingInfo?.agents.includes('probe')));
    s.check('casting-pair-valid', castingOk, casting.code !== 0 ? tail(casting.stderr, 1) : shape === 'legacy-casting' && !archive ? 'handwritten registry was not archived' : !castingInfo?.agents.includes('probe') && shape === 'legacy-casting' ? `probe missing from repaired registry (${castingInfo?.agents.join(',')})` : undefined);

    const cfgAfter = readJson(path.join(project, '.squad', 'config.json')) ?? {};
    if (shape === 'orphan' || shape === 'two-layer') {
      const branch = await git(project, newEnv, 'show-ref', '--verify', '--quiet', 'refs/heads/squad-state');
      s.check('state-backend-preserved', cfgAfter['stateBackend'] === shape && branch.code === 0, `stateBackend=${String(cfgAfter['stateBackend'])} (was ${String(backendBefore)}), squad-state branch ${branch.code === 0 ? 'present' : 'missing'}`);
    } else {
      s.check('state-backend-preserved', (cfgAfter['stateBackend'] ?? 'local') === (backendBefore ?? 'local'), `stateBackend ${String(backendBefore)} → ${String(cfgAfter['stateBackend'])}`);
    }

    if (shape === 'ai-team') {
      s.check('ai-team-migrated', fs.existsSync(path.join(project, '.squad', 'team.md')) && !fs.existsSync(path.join(project, '.ai-team')), fs.existsSync(path.join(project, '.ai-team')) ? '.ai-team/ still present' : '.squad/team.md missing after migration');
    } else {
      s.skip('ai-team-migrated', 'not an .ai-team shape');
    }

    s.check('team-root-absent', !('teamRoot' in cfgAfter), 'teamRoot' in cfgAfter ? `teamRoot=${String(cfgAfter['teamRoot']).replace(configHome, '<config-home>')}` : undefined);

    if (profileRoot) {
      s.check('profile-untouched', fingerprint(profileRoot) === profileBefore, 'profile tree changed after upgrade');
    } else {
      s.skip('profile-untouched', 'no profile squad seeded in this shape');
    }

    if (shape === 'upstream') {
      const upstreamAfter = read(path.join(project, '.squad', 'upstream.json'));
      s.check('user-config-preserved', upstreamAfter === upstreamJsonBefore, 'upstream.json rewritten by upgrade');
    }

    // 4. Idempotency: a second plain upgrade must not change anything ──────
    const again = await squad(project, 'upgrade');
    const changedAgain = diffSnapshots(afterPlain, snapshot(project));
    s.check('idempotent-second-upgrade', again.code === 0 && changedAgain.length === 0, again.code !== 0 ? `exit ${again.code}` : changedAgain.join(', ') || undefined);

    // 5. Downgrade probe: OLD CLI against the upgraded project (dry-run, on a copy) ─
    if (spec.source === 'pack') {
      s.skip('downgrade-probe', 'producer is the target version');
    } else if (!spec.supports.dryRun) {
      s.skip('downgrade-probe', `producer ${spec.version} has no --dry-run`);
    } else {
      const copy = path.join(work, 'downgrade-copy');
      fs.cpSync(project, copy, { recursive: true });
      const copyBefore = snapshot(copy);
      const dg = await run(producer.exec.file, [...producer.exec.args, 'upgrade', '--dry-run'], { cwd: copy, env: oldEnv, timeout: 180_000 });
      const dgChanged = diffSnapshots(copyBefore, snapshot(copy));
      const mentions = /downgrad|newer|older|already up to date|would (upgrade|downgrade|refresh)[^\n]*/i.exec(dg.stdout + dg.stderr)?.[0]?.trim();
      const modified = dgChanged.length === 0 ? 'modified nothing'
        : dgChanged.length <= 4 ? `MODIFIED ${dgChanged.join(', ')}`
          : `MODIFIED ${dgChanged.length} files (${dgChanged.filter((f) => /squad\.agent\.md$|^\.squad\/templates\/|^\.github\/workflows\//.test(f)).length} coordinator/templates/workflows, e.g. ${dgChanged.slice(0, 3).join(', ')} …)`;
      s.notes.push(`old ${spec.version} upgrade --dry-run on upgraded project: exit ${dg.code}${mentions ? `, says "${mentions.slice(0, 120)}"` : `, last lines "${tail(dg.stdout || dg.stderr, 3).slice(0, 200)}"`}; ${modified}`);
      s.check('downgrade-probe', dgChanged.length === 0, dgChanged.length ? `dry-run ${modified}` : undefined);
    }

    // 6. Project all 7 hosts ───────────────────────────────────────────────
    const clients = await squad(project, 'upgrade', '--client', 'all', '--force');
    const cfgClients = (readJson(path.join(project, '.squad', 'config.json')) ?? {})['clients'];
    const projected = ['.claude/agents/squad.md', '.kiro/agents/squad.json', '.opencode/agent/squad.md', '.cursor/agents/squad.md', '.codex/agents/squad.toml', '.agents/agents/squad.md', '.github/agents/squad.agent.md', 'GEMINI.md'];
    const missing = projected.filter((rel) => !fs.existsSync(path.join(project, rel)));
    s.check('clients-projected', clients.code === 0 && JSON.stringify(cfgClients) === JSON.stringify(CLIENT_IDS) && missing.length === 0, clients.code !== 0 ? `exit ${clients.code}: ${tail(clients.stderr || clients.stdout)}` : missing.length ? `missing ${missing.join(', ')}` : `clients=${JSON.stringify(cfgClients)}`);

    const mergedMcp = readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath);
    const agentsNow = read(path.join(project, 'AGENTS.md')) ?? '';
    const claudeNow = read(path.join(project, 'CLAUDE.md')) ?? '';
    const gitignoreNow = read(path.join(project, '.gitignore')) ?? '';
    const cfgProblems = [
      JSON.stringify(mergedMcp?.mcpServers?.['user-custom']) !== JSON.stringify(USER_MCP_SERVER) ? '.mcp.json user-custom server lost' : null,
      !mergedMcp?.mcpServers?.['squad_state'] ? '.mcp.json squad_state missing' : null,
      !agentsNow.startsWith(USER_AGENTS_MD) ? 'AGENTS.md user paragraph lost' : null,
      !claudeNow.startsWith(USER_CLAUDE_MD) ? 'CLAUDE.md user paragraph lost' : null,
      !gitignoreNow.includes(USER_GITIGNORE_LINE) ? '.gitignore user rule lost' : null,
    ].filter((x): x is string => x !== null);
    if (shape !== 'upstream') s.check('user-config-preserved', cfgProblems.length === 0, cfgProblems.join('; ') || undefined);

    // 7. doctor ─────────────────────────────────────────────────────────────
    const doctor = await squad(project, 'doctor');
    const failedLines = doctor.stdout.split(/\r?\n/).filter((l) => /^❌/.test(l.trim())).map((l) => l.trim());
    s.check('doctor', doctor.code === 0 && failedLines.length === 0, failedLines.length ? failedLines.join(' | ') : doctor.code !== 0 ? `exit ${doctor.code}: ${tail(doctor.stderr || doctor.stdout)}` : undefined);

    // 8. Rollback all projections byte-exact ───────────────────────────────
    const rollbackScript = [
      'import { uninstallClients, CLIENT_IDS } from "@bradygaster/squad-sdk/client";',
      `const res = uninstallClients(CLIENT_IDS, { root: ${JSON.stringify(project)}, mcp: { command: "squad", args: ["state-mcp"] } });`,
      'const errors = res.filter(r => r.action === "error"); if (errors.length) throw new Error(JSON.stringify(errors));',
    ].join(' ');
    const rb = await run(process.execPath, ['--input-type=module', '-e', rollbackScript], { cwd: staging, env: newEnv, timeout: 30_000 });
    const rbProblems = [
      rb.code !== 0 ? `uninstallClients failed: ${tail(rb.stderr, 1)}` : null,
      read(path.join(project, 'AGENTS.md')) !== USER_AGENTS_MD ? 'AGENTS.md not restored byte-exact' : null,
      read(path.join(project, 'CLAUDE.md')) !== USER_CLAUDE_MD ? 'CLAUDE.md not restored byte-exact' : null,
      sha256(read(path.join(project, '.gitignore')) ?? '') !== afterPlain.get('.gitignore') ? '.gitignore not restored to its pre-projection bytes' : null,
      JSON.stringify(readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)?.mcpServers?.['user-custom']) !== JSON.stringify(USER_MCP_SERVER) ? '.mcp.json user-custom server lost on rollback' : null,
      ...['.claude/agents/squad.md', '.codex/agents/squad.toml', '.agents/agents/squad.md', '.cursor/agents/squad.md', '.kiro/agents/squad.json', '.opencode/agent/squad.md']
        .filter((rel) => fs.existsSync(path.join(project, rel))).map((rel) => `${rel} still present`),
      ...preserved.filter((rel) => sha256(read(path.join(project, '.squad', rel)) ?? '') !== preservedBefore[rel] && !changedPreserved.includes(rel)).map((rel) => `.squad/${rel} changed by projection/rollback`),
    ].filter((x): x is string => x !== null);
    s.check('rollback-byte-exact', rbProblems.length === 0, rbProblems.join('; ') || undefined);

    return s.result();
  }

  const cells = matrix.producers.flatMap((p) => SHAPES.map((shape) => ({ version: p.version, shape })));

  it.concurrent.for(cells)('$version × $shape', async ({ version, shape }, ctx) => {
    const producer = producers.get(version)!;
    const result = await runScenario(producer, shape);
    results.push(result);
    if (result.status === 'skipped') {
      ctx.skip(`${version} × ${shape}: ${result.reason}`);
      return;
    }
    const xpass = result.checks.filter((c) => c.status === 'xpass');
    expect(xpass, `${version} × ${shape}: ${xpass.map((c) => c.id).join(', ')} now PASS — remove the matching expectedFailures pin(s) from ${path.relative(ROOT, MATRIX_PATH)}`).toEqual([]);
    const failed = result.checks.filter((c) => c.status === 'fail');
    expect(failed.map((c) => `${c.id}: ${c.detail ?? ''}`), `${version} (${producer.spec.source}) × ${shape} on ${PLATFORM}${result.reason ? ` — ${result.reason}` : ''}`).toEqual([]);
  }, 15 * 60_000);
});
