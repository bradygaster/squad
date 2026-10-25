/**
 * Squad 2.0 preview-tarball matrix: exact release evidence × old releases × OS × project state shape.
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
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as tomlParse } from 'smol-toml';
import { parse as yamlParse } from 'yaml';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const MATRIX_PATH = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'preview-tarball-matrix.json');
const FOLD_SCRIPT = path.join(ROOT, 'scripts', 'fold-preview-tarball-matrix.mjs');
const ENABLED = process.env['SQUAD_PREVIEW_TARBALL_MATRIX'] === '1';
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
  /** Exact artifact that was executed for this row (pinned version + integrity, or release tag + asset id + sha256). */
  provenance?: string;
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
interface Inapplicable { producer: string; shape: string; reason: string }
interface TarballAttestation { filename: string; sha256: string; size: number }
interface Run {
  platform: string; arch: string; node: string; target: string;
  targetSha: string;
  targetRegistryState: 'published' | 'unpublished' | 'UNKNOWN';
  targetInsiderVersion: string | null;
  harnessHash: string;
  evidenceRunId: string; evidenceArtifact: string;
  tarballs: { cli: TarballAttestation; sdk: TarballAttestation };
  event: string; runUrl?: string; recordedAt: string; results: ScenarioResult[];
}
interface Matrix {
  protocol: string;
  producers: ProducerSpec[];
  shapes: Record<string, string>;
  checks: Record<string, string>;
  /** Regexes (as strings) of paths a plain `squad upgrade` may create or rewrite. */
  squadOwned: string[];
  inapplicable: Inapplicable[];
  expectedFailures: ExpectedFailure[];
  findings: Finding[];
  historicalRuns?: Run[];
  runs: Run[];
}

type ProducerSource = 'npm' | 'github-release' | 'pack';
interface RegistryArtifact { version: string; shasum: string; integrity: string }
interface ReleaseAsset { id: number; sha256: string }
interface ProducerSpec {
  version: string;
  source: ProducerSource;
  /** Why this producer is in the matrix. */
  why: string;
  /** Feature support of the OLD CLI (determines which shapes are attempted). */
  supports: { stateBackend: boolean; dryRun: boolean };
  /** Immutable provenance of the artifact that is executed. */
  artifacts:
    | { registry: Record<string, RegistryArtifact> }
    | { release: { repository: string; tag: string; assets: Record<string, ReleaseAsset> } }
    | { pack: string };
}

const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as Matrix;
const SHAPES = Object.keys(matrix.shapes);
const CHECK_IDS = Object.keys(matrix.checks);
const CLIENT_IDS = ['copilot', 'claude', 'kiro', 'opencode', 'cursor', 'codex', 'antigravity'];
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'squad-upgrade-matrix.yml');
const FS_HOOK = path.join(ROOT, 'test', 'fixtures', 'upgrade-matrix', 'fs-access-log.cjs');

describe.skipIf(ENABLED)('preview self-upgrade registry-state harness', () => {
  it('resolves a prerelease through insider and executes the insider command when the candidate is published there', async () => {
    const { selfUpgradeCli, selfUpgradeCommand } = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    for (const packageManager of ['npm', 'pnpm', 'yarn'] as const) {
      const resolved: string[] = [];
      const executed: string[] = [];
      const result = await selfUpgradeCli({
        packageManager,
        currentVersion: '2.0.0-preview.2',
        resolveTagVersion: async (tag) => {
          resolved.push(tag);
          return '2.0.0-preview.2';
        },
        exec: (command) => { executed.push(command); },
      });
      expect(resolved).toEqual(['insider']);
      expect(executed).toEqual([selfUpgradeCommand(packageManager, 'insider')]);
      expect(result).toMatchObject({ tag: 'insider', targetVersion: '2.0.0-preview.2', performed: true });
      expect(selfUpgradeCommand(packageManager, 'latest')).toContain('@latest');
      expect(selfUpgradeCommand(packageManager, 'insider')).toContain('@insider');
    }
  });

  it('resolves a prerelease through insider and refuses a downgrade before exec when the candidate is not published there', async () => {
    const { selfUpgradeCli } = await import('../packages/squad-cli/src/cli/core/upgrade.js');
    for (const packageManager of ['npm', 'pnpm', 'yarn'] as const) {
      const resolved: string[] = [];
      const executed: string[] = [];
      await expect(selfUpgradeCli({
        packageManager,
        currentVersion: '2.0.0-preview.2',
        resolveTagVersion: async (tag) => {
          resolved.push(tag);
          return '2.0.0-preview.1';
        },
        exec: (command) => { executed.push(command); },
      })).rejects.toMatchObject({ code: 'EDOWNGRADE' });
      expect(resolved).toEqual(['insider']);
      expect(executed).toEqual([]);
    }
  });
});

/**
 * Why a producer × shape cell cannot be exercised, derived from the producers' capabilities.
 * The fixture's `inapplicable` list must match this exactly (asserted below), so every skip the
 * suite emits is explained on the rendered page and none reads as "not run".
 */
function structuralSkip(spec: ProducerSpec, shape: string): string | null {
  if ((shape === 'orphan' || shape === 'two-layer') && !spec.supports.stateBackend) return `producer ${spec.version} has no --state-backend flag`;
  if (shape === 'upstream' && spec.source !== 'pack' && spec.version !== '2.0.0-preview.1') return `upstream inheritance is a Squad 2.0 feature; producer ${spec.version} cannot declare upstream.json`;
  return null;
}

function inapplicableReason(producer: string, shape: string): string | undefined {
  return matrix.inapplicable.find((x) => x.producer === producer && x.shape === shape)?.reason;
}

/** Canonical JSON (sorted keys) so the hash is independent of key order and formatting. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Attestation hash of the harness: the suite, the renderer, the CI workflow and the fixture without
 * its `runs`. A recorded run is only accepted when its `harnessHash` equals this value, so the fold
 * commit that merges CI results may change nothing but the runs data.
 */
function harnessHash(): string {
  const text = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const workflow = text(WORKFLOW_PATH);
  const previewBlocks = [...workflow.matchAll(/# PREVIEW-TARBALL-ATTESTATION:START[\s\S]*?# PREVIEW-TARBALL-ATTESTATION:END/g)]
    .map((match) => match[0]).join('\n');
  if (!previewBlocks) throw new Error('preview workflow attestation blocks are missing');
  const fixture = JSON.parse(text(MATRIX_PATH)) as Matrix;
  const { runs: _runs, historicalRuns: _historicalRuns, ...rest } = fixture;
  void _runs;
  void _historicalRuns;
  return createHash('sha256')
    .update(text(__filename)).update('\0')
    .update(previewBlocks).update('\0')
    .update(text(FOLD_SCRIPT)).update('\0')
    .update(text(FS_HOOK)).update('\0')
    .update(canonical(rest))
    .digest('hex');
}

// ─── 1. integrity (always) ──────────────────────────────────────────────────

describe('upgrade-matrix.json integrity', () => {
  it('declares producers, shapes, checks, and a protocol', () => {
    expect(matrix.protocol).toBe('preview-tarball-matrix/v1');
    expect(matrix.producers.length).toBeGreaterThanOrEqual(5);
    expect(matrix.producers.some((p) => p.source === 'pack'), 'HEAD→HEAD (same-version) producer must be present').toBe(true);
    for (const p of matrix.producers) {
      expect(p.version, `${p.version}: version`).toMatch(/^(\d+\.\d+\.\d+(-[\w.]+)?|HEAD)$/);
      expect(['npm', 'github-release', 'pack']).toContain(p.source);
    }
    for (const id of ['default', 'profile', 'legacy-casting', 'orphan', 'two-layer', 'ai-team', 'upstream']) {
      expect(SHAPES, `shape ${id} must be declared`).toContain(id);
    }
    for (const id of ['target-tarballs-verified', 'target-version-smoke', 'target-exports-resolve', 'self-upgrade-resolution',
      'producer-init', 'upgrade-plain', 'coordinator-is-new-template', 'user-state-preserved', 'casting-pair-valid',
      'state-backend-preserved', 'ai-team-migrated', 'team-root-absent', 'profile-untouched', 'idempotent-second-upgrade',
      'clients-projected', 'user-config-preserved', 'health', 'doctor', 'projection-uninstall-byte-exact', 'downgrade-probe']) {
      expect(CHECK_IDS, `check ${id} must be declared`).toContain(id);
    }
    expect(CHECK_IDS, 'uninstallClients restores host projections; it is not a rollback — the check must not be called one').not.toContain('rollback-byte-exact');
    expect(matrix.squadOwned.length, 'squadOwned patterns').toBeGreaterThan(5);
    for (const p of matrix.squadOwned) expect(() => new RegExp(p), `squadOwned pattern ${p} must be a valid RegExp`).not.toThrow();
    expect(fs.existsSync(FS_HOOK), 'fs access hook must exist').toBe(true);
  });

  it('every producer carries immutable provenance (exact version + integrity, or release tag + asset id + sha256)', () => {
    for (const p of matrix.producers) {
      if (p.source === 'npm') {
        expect('registry' in p.artifacts, `${p.version}: npm producer needs artifacts.registry`).toBe(true);
        const reg = (p.artifacts as { registry: Record<string, RegistryArtifact> }).registry;
        for (const name of ['@bradygaster/squad-cli', '@bradygaster/squad-sdk']) {
          const a = reg[name];
          expect(a, `${p.version}: missing pinned ${name}`).toBeDefined();
          expect(a!.version, `${p.version}: ${name} must be pinned to the exact producer version`).toBe(p.version);
          expect(a!.shasum, `${p.version}: ${name} sha1 shasum`).toMatch(/^[0-9a-f]{40}$/);
          expect(a!.integrity, `${p.version}: ${name} sha512 integrity`).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
        }
      } else if (p.source === 'github-release') {
        expect('release' in p.artifacts, `${p.version}: release producer needs artifacts.release`).toBe(true);
        const rel = (p.artifacts as { release: { repository: string; tag: string; assets: Record<string, ReleaseAsset> } }).release;
        expect(rel.repository).toBe('bradygaster/squad');
        expect(rel.tag).toBe(`v${p.version}`);
        for (const name of ['squad-linux-x64.tar.gz', 'squad-linux-arm64.tar.gz', 'squad-darwin-x64.tar.gz', 'squad-darwin-arm64.tar.gz', 'squad-win32-x64.zip', 'squad-win32-arm64.zip']) {
          const a = rel.assets[name];
          expect(a, `${p.version}: missing asset ${name}`).toBeDefined();
          expect(Number.isInteger(a!.id) && a!.id > 0, `${p.version}: ${name} needs a GitHub asset id`).toBe(true);
          expect(a!.sha256, `${p.version}: ${name} sha256`).toMatch(/^[0-9a-f]{64}$/);
        }
      } else {
        expect('pack' in p.artifacts, `${p.version}: pack producer describes its provenance`).toBe(true);
      }
    }
  });

  it('every structurally inapplicable cell is explained individually, and nothing else is', () => {
    const derived = matrix.producers.flatMap((p) => SHAPES.filter((s) => structuralSkip(p, s) !== null).map((s) => `${p.version} × ${s}`)).sort();
    const declared = matrix.inapplicable.map((x) => `${x.producer} × ${x.shape}`).sort();
    expect(declared, 'fixture `inapplicable` must list exactly the cells the suite cannot exercise (derived from producer capabilities)').toEqual(derived);
    for (const x of matrix.inapplicable) expect(x.reason.length, `${x.producer} × ${x.shape}: reason`).toBeGreaterThan(40);
    expect(derived).toHaveLength(7);
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

  it('recorded runs are attributable to one target SHA, ran with this exact harness, and use honest statuses', () => {
    const hash = harnessHash();
    const targets = new Set(matrix.runs.map((r) => r.targetSha));
    expect(targets.size <= 1, `recorded runs must all come from one target SHA, found ${[...targets].join(', ')}`).toBe(true);
    const tarballPins = new Set(matrix.runs.map((r) => canonical(r.tarballs)));
    expect(tarballPins.size <= 1, 'recorded OS runs must use the same exact CLI/SDK tarballs').toBe(true);
    for (const run of matrix.runs) {
      expect(run.platform).toMatch(/^(win32|linux|darwin)$/);
      expect(run.targetSha, `${run.platform}: targetSha`).toMatch(/^[0-9a-f]{40}$/);
      expect(['published', 'unpublished', 'UNKNOWN']).toContain(run.targetRegistryState);
      expect(run.targetInsiderVersion === null || typeof run.targetInsiderVersion === 'string').toBe(true);
      expect(run.harnessHash, `${run.platform}: recorded run executed with a different preview harness than the one committed`).toBe(hash);
      expect(run.evidenceRunId).toMatch(/^\d+$/);
      expect(run.evidenceArtifact.length).toBeGreaterThan(0);
      for (const name of ['cli', 'sdk'] as const) {
        expect(run.tarballs[name].filename).toMatch(/\.tgz$/);
        expect(run.tarballs[name].sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(run.tarballs[name].size).toBeGreaterThan(0);
      }
      for (const r of run.results) {
        expect(matrix.producers.map((p) => p.version), `${run.platform}: unknown producer ${r.producer}`).toContain(r.producer);
        expect(SHAPES, `${run.platform}: unknown shape ${r.shape}`).toContain(r.shape);
        expect(['pass', 'fail', 'skipped']).toContain(r.status);
        if (r.status === 'skipped') {
          expect(r.reason, `${run.platform} ${r.producer}/${r.shape}: skipped without a reason`).toBeTruthy();
          expect(inapplicableReason(r.producer, r.shape), `${run.platform} ${r.producer}/${r.shape}: skipped for a reason that is not a declared structural inapplicability: ${r.reason}`).toBeDefined();
        }
        for (const c of r.checks) {
          expect(CHECK_IDS, `${run.platform} ${r.producer}/${r.shape}: unknown check ${c.id}`).toContain(c.id);
          expect(['pass', 'fail', 'xfail', 'xpass', 'skipped']).toContain(c.status);
        }
        const failed = r.checks.filter((c) => c.status === 'fail' || c.status === 'xpass');
        if (r.status === 'pass') expect(failed, `${run.platform} ${r.producer}/${r.shape} recorded as pass but has failing checks`).toEqual([]);
      }
      const skipped = run.results.filter((r) => r.status === 'skipped').map((r) => `${r.producer} × ${r.shape}`).sort();
      expect(skipped, `${run.platform}: the skipped rows must be exactly the declared inapplicable cells`).toEqual(matrix.inapplicable.map((x) => `${x.producer} × ${x.shape}`).sort());
    }
  });

});

// ─── harness guards (always on) ─────────────────────────────────────────────

describe('upgrade-matrix harness guards', () => {
  const fakeSpec = (over: Partial<ProducerSpec> = {}): ProducerSpec => ({
    version: '0.0.0-guard', source: 'github-release', why: 'guard test', supports: { stateBackend: true, dryRun: true },
    artifacts: { release: { repository: 'bradygaster/squad', tag: 'v0.0.0-guard', assets: {} } },
    ...over,
  });

  it('LD-1: a corrupted recorded hash is a verification FAILURE, not a skip (npm sha1/sha512 and release sha256)', () => {
    const bytes = Buffer.from('tarball bytes');
    const goodIntegrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    const goodShasum = createHash('sha1').update(bytes).digest('hex');
    expect(verifyArtifact('npm', 'x@1', bytes, { integrity: goodIntegrity, shasum: goodShasum })).toEqual({ ok: true });
    const badIntegrity = verifyArtifact('npm', 'x@1', bytes, { integrity: goodIntegrity.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), shasum: goodShasum });
    expect(badIntegrity.ok).toBe(false);
    expect((badIntegrity as { failReason: string }).failReason).toMatch(/sha512 integrity expected .* got sha512-/);
    const badShasum = verifyArtifact('npm', 'x@1', bytes, { integrity: goodIntegrity, shasum: '0'.repeat(40) });
    expect((badShasum as { failReason: string }).failReason).toMatch(/sha1 shasum expected 0{40}, got [0-9a-f]{40}/);
    const badSha256 = verifyArtifact('release', 'v1 asset', bytes, { sha256: 'f'.repeat(64) });
    expect((badSha256 as { failReason: string }).failReason).toMatch(/sha256 expected f{64}, got [0-9a-f]{64}/);
  });

  it('LD-1: the release resolver turns a checksum mismatch into failReason (rows FAIL) and a 404 into skipReason (rows skip)', async () => {
    const served = Buffer.from('not the real bundle');
    const server = http.createServer((req, res) => {
      if (req.url?.endsWith('/assets/1')) { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(served); }
      else { res.writeHead(404); res.end('missing'); }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const prev = process.env['SQUAD_PREVIEW_MATRIX_GITHUB_API'];
    process.env['SQUAD_PREVIEW_MATRIX_GITHUB_API'] = `http://127.0.0.1:${port}`;
    try {
      const assetName = releaseAssetName();
      if (!assetName) return;
      const mismatch = await resolveReleaseProducer(fakeSpec({ artifacts: { release: { repository: 'bradygaster/squad', tag: 'v0.0.0-guard', assets: { [assetName]: { id: 1, sha256: 'a'.repeat(64) } } } } }));
      expect(mismatch.exec).toBeNull();
      expect(mismatch.skipReason, 'a mismatch must never be reported as a skip').toBeUndefined();
      expect(mismatch.failReason).toMatch(/sha256 expected a{64}, got [0-9a-f]{64}/);
      const missing = await resolveReleaseProducer(fakeSpec({ artifacts: { release: { repository: 'bradygaster/squad', tag: 'v0.0.0-guard', assets: { [assetName]: { id: 2, sha256: sha256(served) } } } } }));
      expect(missing.exec).toBeNull();
      expect(missing.failReason).toBeUndefined();
      expect(missing.skipReason).toMatch(/unavailable: HTTP 404/);
    } finally {
      if (prev === undefined) delete process.env['SQUAD_PREVIEW_MATRIX_GITHUB_API']; else process.env['SQUAD_PREVIEW_MATRIX_GITHUB_API'] = prev;
      await new Promise<void>((r) => server.close(() => r()));
      rmrf(path.join(CACHE_ROOT, 'producers', 'release-0.0.0-guard'));
    }
  });

  it('LD-1/LD-2: a producer that failed verification yields a FAILING row that the outer assertion rejects', () => {
    const s = new Scenario({ spec: fakeSpec() }, 'default');
    s.check('producer-artifact-verified', false, 'release artifact v0 failed verification: sha256 expected a, got b');
    const row = s.result('fail', 'release artifact v0 failed verification: sha256 expected a, got b');
    expect(row.status).toBe('fail');
    expect(row.checks.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual(['producer-artifact-verified']);
    expect(rowVerdict(row)).toMatch(/producer-artifact-verified: release artifact v0 failed verification/);
  });

  it('LD-2: a row that fails during setup (no natural check) still carries a failing check and is rejected', () => {
    const s = new Scenario({ spec: fakeSpec({ source: 'pack', artifacts: { pack: 'x' } }) }, 'upstream');
    s.check('producer-init', true);
    const row = s.result('fail', 'could not configure upstream: init exit 1');
    expect(row.status).toBe('fail');
    expect(row.checks.some((c) => c.id === 'scenario-setup' && c.status === 'fail')).toBe(true);
    expect(rowVerdict(row)).toMatch(/scenario-setup: could not configure upstream/);
    expect(() => { const ok = new Scenario({ spec: fakeSpec() }, 'default'); ok.check('x', false, 'boom'); ok.result('pass'); }).toThrow(/cannot be pass with failing checks/);
  });

  it('LD-2: the verdict accepts pass rows (including pinned xfail) and rejects xpass, fail and non-pass statuses', () => {
    const base = { producer: '0.9.1', source: 'npm' as const, shape: 'default', notes: [] as string[] };
    expect(rowVerdict({ ...base, status: 'pass', checks: [{ id: 'a', status: 'pass' }, { id: 'downgrade-probe', status: 'xfail', detail: 'dry-run MODIFIED' }] })).toBeNull();
    expect(rowVerdict({ ...base, status: 'skipped', reason: 'n/a', checks: [] })).toBeNull();
    expect(rowVerdict({ ...base, status: 'pass', checks: [{ id: 'a', status: 'xpass', detail: 'F3' }] })).toMatch(/now PASS — remove the matching expectedFailures pin/);
    expect(rowVerdict({ ...base, status: 'fail', checks: [{ id: 'a', status: 'fail', detail: 'bad' }] })).toMatch(/a: bad/);
    expect(rowVerdict({ ...base, status: 'fail', reason: 'setup', checks: [] })).toMatch(/status fail without a failing check — setup/);
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

function addMarkdownTableRow(content: string, heading: string, row: string): string {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  const separatorIndex = lines.findIndex((line, index) => index > headingIndex && /^\|\s*:?-{3,}/.test(line.trim()));
  if (headingIndex < 0 || separatorIndex < 0) throw new Error(`${heading} table not found`);
  lines.splice(separatorIndex + 1, 0, row);
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
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
    SQUAD_NO_UPDATE_CHECK: '1',
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


function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(exportTargets);
}

function validateExportTargets(packageDir: string, exportsMap: Record<string, unknown> | undefined): string[] {
  const problems: string[] = [];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full); else files.push(path.relative(packageDir, full).replace(/\\/g, '/'));
    }
  };
  walk(packageDir);
  for (const [key, value] of Object.entries(exportsMap ?? {})) {
    for (const target of exportTargets(value)) {
      const rel = target.replace(/^\.\//, '');
      if (!target.includes('*')) {
        if (!fs.existsSync(path.join(packageDir, rel))) problems.push(`${key} -> ${target} missing`);
        continue;
      }
      const escaped = rel.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const pattern = new RegExp(`^${escaped.join('(.+)')}$`);
      if (!files.some((file) => pattern.test(file))) problems.push(`${key} -> ${target} matches no packed file`);
    }
  }
  return problems;
}

// ─── scenario bookkeeping ───────────────────────────────────────────────────

function expected(check: string, producer: string, shape: string): ExpectedFailure | undefined {
  return matrix.expectedFailures.find((xf) => xf.check === check
    && (xf.producers === '*' || xf.producers.includes(producer))
    && (xf.shapes === '*' || xf.shapes.includes(shape))
    && (xf.platforms === '*' || xf.platforms.includes(PLATFORM)));
}

interface ProducerRef { spec: ProducerSpec; provenance?: string }

export class Scenario {
  readonly checks: Check[] = [];
  readonly notes: string[] = [];
  constructor(readonly producer: ProducerRef, readonly shape: string) {}

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

  /**
   * Build the row. Invariant (LD-2): a row may only be `fail` when at least one check is `fail`/`xpass`;
   * a setup or verification failure that has no natural check is recorded under `scenario-setup`.
   */
  result(status?: ScenarioStatus, reason?: string): ScenarioResult {
    const hasFailing = () => this.checks.some((c) => c.status === 'fail' || c.status === 'xpass');
    if (status === 'fail' && !hasFailing()) this.checks.push({ id: 'scenario-setup', status: 'fail', detail: reason ?? 'scenario failed without a recorded check' });
    const final: ScenarioStatus = status ?? (hasFailing() ? 'fail' : 'pass');
    if (final === 'pass' && hasFailing()) throw new Error(`row ${this.producer.spec.version} × ${this.shape} cannot be pass with failing checks`);
    return {
      producer: this.producer.spec.version, source: this.producer.spec.source, shape: this.shape,
      status: final, reason,
      ...(this.producer.provenance ? { provenance: this.producer.provenance } : {}),
      checks: this.checks, notes: this.notes,
    };
  }
}

/**
 * The single place the outer test judges a row (LD-2): skipped rows are reported as skips by the
 * caller; everything else must be `pass` with no `fail`/`xpass` check. Returns the failure message
 * instead of throwing so it can be unit-tested.
 */
export function rowVerdict(result: ScenarioResult): string | null {
  if (result.status === 'skipped') return null;
  const xpass = result.checks.filter((c) => c.status === 'xpass');
  if (xpass.length) return `${result.producer} × ${result.shape}: ${xpass.map((c) => c.id).join(', ')} now PASS — remove the matching expectedFailures pin(s) from ${path.relative(ROOT, MATRIX_PATH)}`;
  const failed = result.checks.filter((c) => c.status === 'fail');
  if (failed.length) return `${result.producer} (${result.source}) × ${result.shape} on ${PLATFORM}: ${failed.map((c) => `${c.id}: ${c.detail ?? ''}`).join('; ')}${result.reason ? ` — ${result.reason}` : ''}`;
  if (result.status !== 'pass') return `${result.producer} × ${result.shape} on ${PLATFORM}: status ${result.status} without a failing check — ${result.reason ?? 'no reason'}`;
  return null;
}

/**
 * Artifact verification (LD-1). Pure so it can be unit-tested; a mismatch is a FAIL reason, never a skip.
 */
export function verifyArtifact(
  kind: 'npm' | 'release',
  label: string,
  bytes: Buffer,
  expectedHashes: { integrity?: string; shasum?: string; sha256?: string },
): { ok: true } | { ok: false; failReason: string } {
  const got: Record<string, string> = {};
  const problems: string[] = [];
  if (expectedHashes.integrity !== undefined) {
    got['integrity'] = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    if (got['integrity'] !== expectedHashes.integrity) problems.push(`sha512 integrity expected ${expectedHashes.integrity}, got ${got['integrity']}`);
  }
  if (expectedHashes.shasum !== undefined) {
    got['shasum'] = createHash('sha1').update(bytes).digest('hex');
    if (got['shasum'] !== expectedHashes.shasum) problems.push(`sha1 shasum expected ${expectedHashes.shasum}, got ${got['shasum']}`);
  }
  if (expectedHashes.sha256 !== undefined) {
    got['sha256'] = sha256(bytes);
    if (got['sha256'] !== expectedHashes.sha256) problems.push(`sha256 expected ${expectedHashes.sha256}, got ${got['sha256']}`);
  }
  if (!problems.length) return { ok: true };
  return { ok: false, failReason: `${kind} artifact ${label} failed verification: ${problems.join('; ')}` };
}

// ─── producers ──────────────────────────────────────────────────────────────

interface Producer {
  spec: ProducerSpec;
  /** How to invoke the OLD CLI: [file, ...leadingArgs] */
  exec: { file: string; args: string[]; env: NodeJS.ProcessEnv } | null;
  /** Artifact could not be obtained (network / not published for this platform): every row is skipped loudly. */
  skipReason?: string;
  /** Artifact was obtained but failed verification (integrity / checksum): every row FAILS. */
  failReason?: string;
  /** Human-readable provenance of what is executed, recorded per row. */
  provenance?: string;
}

const CACHE_ROOT = path.join(ROOT, 'node_modules', '.cache', 'squad-preview-tarball-matrix');
const githubApi = () => process.env['SQUAD_PREVIEW_MATRIX_GITHUB_API'] ?? 'https://api.github.com';

function releaseAssetName(): string | null {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;
  if (!arch) return null;
  if (PLATFORM === 'win32') return `squad-win32-${arch}.zip`;
  if (PLATFORM === 'linux') return `squad-linux-${arch}.tar.gz`;
  if (PLATFORM === 'darwin') return `squad-darwin-${arch}.tar.gz`;
  return null;
}

async function fetchBuffer(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'squad-upgrade-matrix', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function npmCmd(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Cmd> {
  const npm = PLATFORM === 'win32' ? 'npm.cmd' : 'npm';
  // Absolute tarball paths: a bare `dir/file.tgz` would be read by npm as a GitHub `owner/repo` shorthand.
  const quoted = args.map((a) => (/\s/.test(a) ? `"${a}"` : a));
  return PLATFORM === 'win32'
    ? run(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `${npm} ${quoted.join(' ')}`], { cwd, env, timeout: 600_000 })
    : run(npm, args, { cwd, env, timeout: 600_000 });
}

/**
 * npm producer: fetch the exact pinned tarballs of @bradygaster/squad-cli and @bradygaster/squad-sdk
 * (`npm pack`, through whatever registry npm is configured for), verify sha1 + sha512 against the
 * fixture (mismatch → FAIL, not skip), then install both tarballs into an isolated prefix so the old
 * CLI runs against the SDK version it shipped with — never a floating `>=` resolution.
 */
async function resolveNpmProducer(spec: ProducerSpec): Promise<Producer> {
  const reg = (spec.artifacts as { registry: Record<string, RegistryArtifact> }).registry;
  const dir = path.join(CACHE_ROOT, 'producers', `npm-${spec.version}`);
  const entry = path.join(dir, 'node_modules', '@bradygaster', 'squad-cli', 'dist', 'cli-entry.js');
  const registry = process.env['NPM_CONFIG_REGISTRY'] ?? process.env['npm_config_registry'];
  const provenance = Object.entries(reg).map(([n, a]) => `${n}@${a.version} ${a.integrity}`).join('; ');
  const verifiedMarker = path.join(dir, '.verified');
  if (!fs.existsSync(entry) || !fs.existsSync(verifiedMarker)) {
    rmrf(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'squad-upgrade-matrix-producer', private: true }, null, 2) + '\n');
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    if (registry) env['NPM_CONFIG_REGISTRY'] = registry;
    const tarballs = path.join(dir, 'tarballs');
    fs.mkdirSync(tarballs);
    const specs = Object.entries(reg).map(([n, a]) => `${n}@${a.version}`);
    const packed = await npmCmd(['pack', ...specs, '--pack-destination', tarballs, '--ignore-scripts', '--loglevel=error'], dir, env);
    const files = fs.existsSync(tarballs) ? fs.readdirSync(tarballs).filter((f) => f.endsWith('.tgz')) : [];
    if (packed.code !== 0 || files.length !== specs.length) {
      rmrf(dir);
      return { spec, exec: null, skipReason: `could not fetch ${specs.join(' + ')} via ${registry ?? 'the npm-configured registry'}: ${tail(packed.stderr || packed.stdout, 2) || `exit ${packed.code}`}` };
    }
    for (const [name, a] of Object.entries(reg)) {
      const file = files.find((f) => f.startsWith(`${name.replace('@', '').replace('/', '-')}-${a.version}.tgz`));
      if (!file) return { spec, exec: null, failReason: `npm pack produced no tarball for ${name}@${a.version} (got ${files.join(', ')})` };
      const verdict = verifyArtifact('npm', `${name}@${a.version}`, fs.readFileSync(path.join(tarballs, file)), { integrity: a.integrity, shasum: a.shasum });
      if (!verdict.ok) {
        rmrf(dir);
        return { spec, exec: null, failReason: verdict.failReason };
      }
    }
    const installed = await npmCmd(['install', '--prefix', dir, ...files.map((f) => path.join(tarballs, f)), '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'], dir, env);
    if (installed.code !== 0 || !fs.existsSync(entry)) {
      rmrf(dir);
      return { spec, exec: null, skipReason: `npm install of the verified ${spec.version} tarballs failed: ${tail(installed.stderr || installed.stdout, 2) || `exit ${installed.code}`}` };
    }
    const sdkVersion = readJson<{ version: string }>(path.join(dir, 'node_modules', '@bradygaster', 'squad-sdk', 'package.json'))?.version;
    if (sdkVersion !== reg['@bradygaster/squad-sdk']!.version) {
      rmrf(dir);
      return { spec, exec: null, failReason: `installed @bradygaster/squad-sdk@${sdkVersion ?? '?'} instead of the pinned ${reg['@bradygaster/squad-sdk']!.version}` };
    }
    fs.writeFileSync(verifiedMarker, provenance + '\n');
  }
  return { spec, exec: { file: process.execPath, args: [entry], env: {} }, provenance: `npm: ${provenance}` };
}

/**
 * GitHub Release producer: download the bundle by immutable asset id
 * (`/repos/<owner>/<repo>/releases/assets/<id>`), verify sha256 against the fixture (mismatch → FAIL,
 * not skip), extract, and run the real launcher.
 */
async function resolveReleaseProducer(spec: ProducerSpec): Promise<Producer> {
  const rel = (spec.artifacts as { release: { repository: string; tag: string; assets: Record<string, ReleaseAsset> } }).release;
  const assetName = releaseAssetName();
  const asset = assetName ? rel.assets[assetName] : undefined;
  if (!assetName || !asset) return { spec, exec: null, skipReason: `no standalone bundle is published for ${PLATFORM}/${process.arch} in ${rel.tag}` };
  const provenance = `github-release: ${rel.repository}@${rel.tag} asset ${assetName} id ${asset.id} sha256 ${asset.sha256}`;
  const dir = path.join(CACHE_ROOT, 'producers', `release-${spec.version}`);
  const bundleDir = path.join(dir, assetName.replace(/\.(zip|tar\.gz)$/, ''));
  const launcher = PLATFORM === 'win32' ? path.join(bundleDir, 'squad.exe') : path.join(bundleDir, 'squad');
  const verifiedMarker = path.join(dir, '.verified');
  if (!fs.existsSync(launcher) || !fs.existsSync(verifiedMarker)) {
    rmrf(dir);
    fs.mkdirSync(dir, { recursive: true });
    let bytes: Buffer;
    try {
      const token = process.env['SQUAD_PREVIEW_MATRIX_GITHUB_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
      const headers: Record<string, string> = { accept: 'application/octet-stream', 'x-github-api-version': '2022-11-28' };
      if (token) headers['authorization'] = `Bearer ${token}`;
      bytes = await fetchBuffer(`${githubApi()}/repos/${rel.repository}/releases/assets/${asset.id}`, headers);
    } catch (err) {
      rmrf(dir);
      return { spec, exec: null, skipReason: `GitHub Release ${rel.tag} asset ${assetName} (id ${asset.id}) unavailable: ${(err as Error).message}` };
    }
    const verdict = verifyArtifact('release', `${rel.tag} ${assetName} (asset id ${asset.id})`, bytes, { sha256: asset.sha256 });
    if (!verdict.ok) {
      rmrf(dir);
      return { spec, exec: null, failReason: verdict.failReason };
    }
    try {
      const archive = path.join(dir, assetName);
      fs.writeFileSync(archive, bytes);
      extract(archive, dir);
      fs.rmSync(archive, { force: true });
      if (!fs.existsSync(launcher)) throw new Error(`bundle did not contain ${path.basename(launcher)}`);
      if (PLATFORM !== 'win32') fs.chmodSync(launcher, 0o755);
    } catch (err) {
      rmrf(dir);
      return { spec, exec: null, failReason: `verified bundle ${assetName} could not be extracted: ${(err as Error).message}` };
    }
    fs.writeFileSync(verifiedMarker, provenance + '\n');
  }
  const info = readJson<{ nodeVersion?: string }>(path.join(bundleDir, 'BUNDLE-INFO.json'));
  return {
    spec,
    exec: { file: launcher, args: [], env: { SQUAD_STANDALONE_HOME: bundleDir + path.sep } },
    provenance: `${provenance} (bundled node ${info?.nodeVersion ?? '?'})`,
  };
}

// ─── the matrix ─────────────────────────────────────────────────────────────

describe.skipIf(!ENABLED)('exact preview tarballs × old-version × OS × state-shape matrix', () => {
  let staging: string;
  let newCli: { file: string; args: string[]; env: NodeJS.ProcessEnv };
  let newVersion: string;
  const producers = new Map<string, Producer>();
  const results: ScenarioResult[] = [];
  const workRoots: string[] = [];
  let tarballs: { cli: TarballAttestation; sdk: TarballAttestation };
  let targetChecks: Array<{ id: string; ok: boolean; detail?: string }> = [];

  beforeAll(async () => {
    const sdkTarball = process.env['SQUAD_PREVIEW_SDK_TARBALL'];
    const cliTarball = process.env['SQUAD_PREVIEW_CLI_TARBALL'];
    const sdkExpected = process.env['SQUAD_PREVIEW_SDK_SHA256'];
    const cliExpected = process.env['SQUAD_PREVIEW_CLI_SHA256'];
    const registryState = process.env['SQUAD_PREVIEW_TARGET_REGISTRY_STATE'];
    const insiderVersion = process.env['SQUAD_PREVIEW_INSIDER_VERSION'] || null;
    if (!registryState || !['published', 'unpublished', 'UNKNOWN'].includes(registryState)) {
      throw new Error(`SQUAD_PREVIEW_TARGET_REGISTRY_STATE must be published, unpublished, or UNKNOWN; got ${registryState ?? '<unset>'}`);
    }
    if (!sdkTarball || !cliTarball || !sdkExpected || !cliExpected) throw new Error('preview tarball paths and expected sha256 values are required');
    for (const [label, file, expected] of [['sdk', sdkTarball, sdkExpected], ['cli', cliTarball, cliExpected]] as const) {
      if (!fs.existsSync(file)) throw new Error(`${label} tarball not found: ${file}`);
      const got = sha256(fs.readFileSync(file));
      if (got !== expected) throw new Error(`${label} tarball sha256 expected ${expected}, got ${got}`);
    }

    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    staging = fs.mkdtempSync(path.join(CACHE_ROOT, 'staging-'));
    const unpack = (tarball: string, dest: string) => {
      const tmp = fs.mkdtempSync(path.join(staging, 'extract-'));
      extract(tarball, tmp);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(tmp, 'package'), dest);
      rmrf(tmp);
    };
    unpack(sdkTarball, path.join(staging, 'node_modules', '@bradygaster', 'squad-sdk'));
    unpack(cliTarball, path.join(staging, 'node_modules', '@bradygaster', 'squad-cli'));
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ name: 'squad-preview-matrix-consumer', private: true, type: 'module' }, null, 2) + '\n');

    const sdkDir = path.join(staging, 'node_modules', '@bradygaster', 'squad-sdk');
    const cliDir = path.join(staging, 'node_modules', '@bradygaster', 'squad-cli');
    const sdkManifest = readJson<{ version: string; exports?: Record<string, unknown> }>(path.join(sdkDir, 'package.json'))!;
    const cliManifest = readJson<{ version: string; exports?: Record<string, unknown> }>(path.join(cliDir, 'package.json'))!;
    newVersion = cliManifest.version;
    const expectedVersion = process.env['SQUAD_PREVIEW_EXPECTED_VERSION'];
    if (!expectedVersion) throw new Error('SQUAD_PREVIEW_EXPECTED_VERSION is required');
    const cliEntry = path.join(cliDir, 'dist', 'cli-entry.js');
    newCli = {
      file: process.execPath,
      args: [cliEntry],
      env: { NODE_PATH: [path.join(staging, 'node_modules'), path.join(ROOT, 'node_modules')].join(path.delimiter) },
    };
    tarballs = {
      cli: { filename: path.basename(cliTarball), sha256: cliExpected, size: fs.statSync(cliTarball).size },
      sdk: { filename: path.basename(sdkTarball), sha256: sdkExpected, size: fs.statSync(sdkTarball).size },
    };

    const exportProblems = [...validateExportTargets(cliDir, cliManifest.exports), ...validateExportTargets(sdkDir, sdkManifest.exports)];
    const version = await run(newCli.file, [...newCli.args, '--version'], { cwd: staging, env: { ...process.env, ...newCli.env }, timeout: 30_000 });
    const selfUpgradeScript = [
      'import { selfUpgradeCli, selfUpgradeCommand } from "@bradygaster/squad-cli/core/upgrade";',
      `const currentVersion = ${JSON.stringify(expectedVersion)};`,
      `const insiderVersion = ${JSON.stringify(insiderVersion)};`,
      'const got = [];',
      'for (const pm of ["npm","pnpm","yarn"]) {',
      '  const resolutions = []; const executed = []; let result = null; let error = null;',
      '  try { result = await selfUpgradeCli({ packageManager: pm, currentVersion, resolveTagVersion: async (tag) => { resolutions.push(tag); return insiderVersion; }, exec: (cmd) => { executed.push(cmd); } }); }',
      '  catch (err) { error = { code: err?.code ?? null, message: err?.message ?? String(err) }; }',
      '  got.push({ pm, explicit: { latest: selfUpgradeCommand(pm, "latest"), insider: selfUpgradeCommand(pm, "insider") }, resolutions, executed, result, error });',
      '}',
      'console.log(JSON.stringify(got));',
    ].join(' ');
    const selfUpgrade = await run(process.execPath, ['--input-type=module', '-e', selfUpgradeScript], { cwd: staging, env: { ...process.env, ...newCli.env }, timeout: 30_000 });
    const expectedCommands = new Map([
      ['npm', { latest: 'npm install -g @bradygaster/squad-cli@latest', insider: 'npm install -g @bradygaster/squad-cli@insider' }],
      ['pnpm', { latest: 'pnpm add -g @bradygaster/squad-cli@latest', insider: 'pnpm add -g @bradygaster/squad-cli@insider' }],
      ['yarn', { latest: 'yarn global add @bradygaster/squad-cli@latest', insider: 'yarn global add @bradygaster/squad-cli@insider' }],
    ]);
    type SelfUpgradeProbe = {
      pm: string;
      explicit: { latest: string; insider: string };
      resolutions: string[];
      executed: string[];
      result: { tag: string; targetVersion: string | null; performed: boolean } | null;
      error: { code: string | null; message: string } | null;
    };
    let selfUpgradeProbes: SelfUpgradeProbe[] = [];
    try {
      selfUpgradeProbes = JSON.parse(selfUpgrade.stdout.trim().split(/\r?\n/).pop() ?? '[]') as SelfUpgradeProbe[];
    } catch { /* recorded as a failed target check */ }
    const selfUpgradeOutput = `${selfUpgrade.stdout}\n${selfUpgrade.stderr}`;
    const commandsMatch = selfUpgradeProbes.length === expectedCommands.size
      && new Set(selfUpgradeProbes.map((probe) => probe.pm)).size === expectedCommands.size
      && selfUpgradeProbes.every((probe) => {
        const expected = expectedCommands.get(probe.pm);
        return expected?.latest === probe.explicit.latest && expected.insider === probe.explicit.insider;
      });
    const publishedResolution = registryState === 'published'
      && insiderVersion !== null
      && selfUpgradeProbes.every((probe) => probe.resolutions.join(',') === 'insider'
        && probe.executed.length === 1
        && probe.executed[0] === probe.explicit.insider
        && probe.result?.tag === 'insider'
        && probe.result.targetVersion === insiderVersion
        && probe.result.performed === true
        && probe.error === null);
    const unpublishedRefusal = registryState === 'unpublished'
      && insiderVersion !== null
      && insiderVersion !== expectedVersion
      && selfUpgradeProbes.every((probe) => probe.resolutions.join(',') === 'insider'
        && probe.executed.length === 0
        && probe.result === null
        && probe.error?.code === 'EDOWNGRADE'
        && /refus(?:e|ed|al)|downgrade/i.test(probe.error.message));
    const selfUpgradeOk = selfUpgrade.code === 0 && commandsMatch && (publishedResolution || unpublishedRefusal);
    targetChecks = [
      { id: 'target-tarballs-verified', ok: true },
      { id: 'target-version-smoke', ok: version.code === 0 && version.stdout.includes(expectedVersion) && cliManifest.version === expectedVersion && sdkManifest.version === expectedVersion,
        detail: `cli=${cliManifest.version}, sdk=${sdkManifest.version}, --version exit ${version.code}: ${tail(version.stdout || version.stderr, 1)}` },
      { id: 'target-exports-resolve', ok: exportProblems.length === 0, detail: exportProblems.join('; ') || undefined },
      { id: 'self-upgrade-resolution', ok: selfUpgradeOk,
        detail: `registry=${registryState}; insider=${insiderVersion ?? 'UNKNOWN'}; ${selfUpgrade.code !== 0 ? `exit ${selfUpgrade.code}: ${tail(selfUpgradeOutput)}` : `probes=${JSON.stringify(selfUpgradeProbes)}`}` },
    ];

    const only = process.env['SQUAD_PREVIEW_MATRIX_PRODUCERS']?.split(',').map((s) => s.trim()).filter(Boolean);
    await Promise.all(matrix.producers.map(async (spec) => {
      if (only && only.length && !only.includes(spec.version)) {
        producers.set(spec.version, { spec, exec: null, skipReason: `excluded by SQUAD_PREVIEW_MATRIX_PRODUCERS=${only.join(',')}` });
        return;
      }
      const p: Producer = spec.source === 'pack'
        ? { spec, exec: newCli, provenance: `release-evidence tarballs: cli ${tarballs.cli.sha256}, sdk ${tarballs.sdk.sha256} at ${targetSha()} (v${newVersion})` }
        : spec.source === 'npm' ? await resolveNpmProducer(spec) : await resolveReleaseProducer(spec);
      producers.set(spec.version, p);
      if (p.failReason) console.error(`❌ preview-matrix: producer ${spec.version} FAILED verification — ${p.failReason}`);
      else if (p.skipReason) console.warn(`⏭️  preview-matrix: producer ${spec.version} skipped — ${p.skipReason}`);
      else process.stdout.write(`✅ preview-matrix: producer ${spec.version} ready — ${p.provenance}\n`);
    }));
  }, 20 * 60_000);

  /** Branch head under test: CI passes it explicitly (PR checkouts are merge refs); locally it is HEAD. */
  function targetSha(): string {
    const fromEnv = process.env['SQUAD_PREVIEW_TARGET_SHA'];
    if (fromEnv && /^[0-9a-f]{40}$/.test(fromEnv)) return fromEnv;
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
  }

  afterAll(() => {
    const out = process.env['SQUAD_PREVIEW_MATRIX_OUT'] ?? path.join(CACHE_ROOT, `results-${PLATFORM}.json`);
    const runUrl = process.env['GITHUB_RUN_ID'] && process.env['GITHUB_REPOSITORY']
      ? `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
      : undefined;
    const run: Run = {
      platform: PLATFORM, arch: process.arch, node: process.version, target: newVersion ?? 'unbuilt',
      targetSha: targetSha(), harnessHash: harnessHash(),
      targetRegistryState: (process.env['SQUAD_PREVIEW_TARGET_REGISTRY_STATE'] ?? 'UNKNOWN') as Run['targetRegistryState'],
      targetInsiderVersion: process.env['SQUAD_PREVIEW_INSIDER_VERSION'] || null,
      evidenceRunId: process.env['SQUAD_PREVIEW_EVIDENCE_RUN_ID'] ?? 'local',
      evidenceArtifact: process.env['SQUAD_PREVIEW_EVIDENCE_ARTIFACT'] ?? 'local-files', tarballs,
      event: process.env['GITHUB_EVENT_NAME'] ?? 'local', ...(runUrl ? { runUrl } : {}),
      recordedAt: new Date().toISOString(), results,
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
    const passed = results.filter((r) => r.status === 'pass');
    const withKnown = passed.filter((r) => r.checks.some((c) => c.status === 'xfail'));
    const knownIds = [...new Set(withKnown.flatMap((r) => r.notes.map((n) => /^[\w-]+: (F\d+)$/.exec(n)?.[1]).filter((x): x is string => !!x)))].sort();
    const failed = results.filter((r) => r.status === 'fail');
    const skipped = results.filter((r) => r.status === 'skipped');
    const inapplicable = skipped.filter((r) => inapplicableReason(r.producer, r.shape) !== undefined);
    const unavailable = skipped.length - inapplicable.length;
    const lines = [
      `\npreview-tarball-matrix (${PLATFORM}/${process.arch}, target v${run.target} @ ${run.targetSha.slice(0, 8)}, harness ${run.harnessHash.slice(0, 12)}):`,
      `  ${passed.length} rows passed all non-xfail assertions; ${withKnown.length} of them carry known expected failures${knownIds.length ? ` (${knownIds.join(', ')})` : ''}; ${failed.length} rows failed; ${inapplicable.length} rows are structurally inapplicable${unavailable ? `; ${unavailable} rows SKIPPED because the producer was unavailable/excluded (never counts as a pass)` : ''} → ${path.relative(ROOT, out)}`,
    ];
    for (const r of results) {
      const bad = r.checks.filter((c) => c.status !== 'pass' && c.status !== 'skipped').map((c) => `${c.id}=${c.status}${c.detail ? ` (${c.detail})` : ''}`);
      lines.push(`  ${r.status.padEnd(7)} ${r.producer.padEnd(8)} ${r.shape.padEnd(15)}${r.reason ? ` ${r.reason}` : ''}${bad.length ? ` ${bad.join('; ')}` : ''}`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    if (process.env['SQUAD_PREVIEW_MATRIX_KEEP'] !== '1') {
      for (const w of workRoots) rmrf(w);
      rmrf(staging);
    }
  }, 10 * 60_000);

  const USER_MCP_SERVER = { command: 'node', args: ['my-server.js'], env: { TOKEN_FILE: 'secrets/token' } };
  const USER_AGENTS_MD = '# My project\n\nHand-written AGENTS.md paragraph that Squad must keep.\n';
  const USER_CLAUDE_MD = '# Claude notes\n\nKeep this paragraph verbatim.\n';
  const USER_GITIGNORE_LINE = 'my-private-notes/';
  const PROBE_CHARTER = '# Probe\n\n## Identity\n- **Name:** Probe\n- **Role:** Upgrade Probe\n\n## Notes\nWritten by the matrix before upgrade.\n';
  const PROBE_HISTORY = '# History\n\n- pre-upgrade learning (must survive byte-exact)\n';

  /**
   * The 1.x user-profile roster directory name, as the old producers spell it. It is seed data: old CLIs
   * only write `teamRoot` when they find this exact directory, which is what exercises the retired
   * profile-link path. Assembled from parts so the retired-symbol gate (test/retired-symbols.test.ts)
   * keeps proving the product itself never names it.
   */
  const LEGACY_ROSTER_DIR = ['personal', 'squad'].join('-');

  function seedProfile(configHome: string): string {
    const root = path.join(configHome, 'squad');
    const personal = path.join(root, LEGACY_ROSTER_DIR);
    const global = path.join(root, '.squad');
    fs.mkdirSync(path.join(personal, 'agents', 'ghostwriter'), { recursive: true });
    fs.writeFileSync(path.join(personal, 'config.json'), JSON.stringify({ defaultModel: 'auto' }, null, 2) + '\n');
    fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'charter.md'), '# Ghostwriter\n\n## Identity\n- **Name:** Ghostwriter\n- **Role:** Advisor\n');
    fs.writeFileSync(path.join(personal, 'agents', 'ghostwriter', 'history.md'), '# History\n\n- learned something\n');
    fs.mkdirSync(path.join(global, 'agents', 'globetrotter'), { recursive: true });
    fs.writeFileSync(path.join(global, 'config.json'), JSON.stringify({ version: 1 }, null, 2) + '\n');
    fs.writeFileSync(path.join(global, 'team.md'), '# Profile Squad\n\n## Members\n\n| Name | Role |\n|---|---|\n| Globetrotter | Advisor |\n');
    fs.writeFileSync(path.join(global, 'agents', 'globetrotter', 'charter.md'), '# Globetrotter\n');
    return root;
  }

  async function git(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): Promise<Cmd> {
    return run('git', args, { cwd, env, timeout: 30_000 });
  }

  /** Every ref OID, the porcelain status and the `squad-state` commit count: idempotency must hold here too. */
  async function gitState(cwd: string, env: NodeJS.ProcessEnv): Promise<{ refs: string; status: string; stateCommits: string }> {
    const refs = await git(cwd, env, 'for-each-ref', '--format=%(refname) %(objectname)');
    const status = await git(cwd, env, 'status', '--porcelain=v1', '--untracked-files=all');
    const branch = await git(cwd, env, 'show-ref', '--verify', '--quiet', 'refs/heads/squad-state');
    const count = branch.code === 0 ? await git(cwd, env, 'rev-list', '--count', 'squad-state') : null;
    return { refs: refs.stdout.trim(), status: status.stdout.trim(), stateCommits: count ? count.stdout.trim() : 'no squad-state branch' };
  }

  function gitDiff(a: { refs: string; status: string; stateCommits: string }, b: { refs: string; status: string; stateCommits: string }): string[] {
    const out: string[] = [];
    if (a.refs !== b.refs) {
      const before = new Map(a.refs.split('\n').filter(Boolean).map((l) => l.split(' ') as [string, string]));
      const after = new Map(b.refs.split('\n').filter(Boolean).map((l) => l.split(' ') as [string, string]));
      for (const [ref, oid] of after) if (before.get(ref) !== oid) out.push(`ref ${ref} ${before.get(ref)?.slice(0, 8) ?? '(new)'} → ${oid.slice(0, 8)}`);
      for (const ref of before.keys()) if (!after.has(ref)) out.push(`ref ${ref} deleted`);
    }
    if (a.status !== b.status) out.push(`worktree status changed: ${JSON.stringify(b.status.slice(0, 200))}`);
    if (a.stateCommits !== b.stateCommits) out.push(`squad-state commits ${a.stateCommits} → ${b.stateCommits}`);
    return out;
  }

  /** path → blob OID for every file on a ref (no checkout). */
  async function branchManifest(cwd: string, env: NodeJS.ProcessEnv, ref: string): Promise<Map<string, string>> {
    const out = await git(cwd, env, 'ls-tree', '-r', '-z', ref);
    const m = new Map<string, string>();
    for (const entry of out.stdout.split('\0').filter(Boolean)) {
      const [meta, file] = entry.split('\t') as [string, string];
      m.set(file, meta.split(' ')[2]!);
    }
    return m;
  }

  /**
   * Write files onto a ref as git blobs (plumbing only, working tree untouched): the way two-layer /
   * orphan projects hold decisions.md and agent histories.
   */
  async function seedBranchBlobs(cwd: string, env: NodeJS.ProcessEnv, ref: string, files: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }> {
    const indexFile = path.join(cwd, '.git', `matrix-seed-${process.pid}.idx`);
    const ienv = { ...env, GIT_INDEX_FILE: indexFile };
    try {
      const rt = await git(cwd, ienv, 'read-tree', ref);
      if (rt.code !== 0) return { ok: false, error: `read-tree: ${tail(rt.stderr, 1)}` };
      for (const [rel, content] of Object.entries(files)) {
        const tmp = path.join(cwd, '.git', `matrix-blob-${process.pid}`);
        fs.writeFileSync(tmp, content);
        const ho = await git(cwd, ienv, 'hash-object', '-w', tmp);
        fs.rmSync(tmp, { force: true });
        if (ho.code !== 0) return { ok: false, error: `hash-object ${rel}: ${tail(ho.stderr, 1)}` };
        const ui = await git(cwd, ienv, 'update-index', '--add', '--cacheinfo', `100644,${ho.stdout.trim()},${rel}`);
        if (ui.code !== 0) return { ok: false, error: `update-index ${rel}: ${tail(ui.stderr, 1)}` };
      }
      const wt = await git(cwd, ienv, 'write-tree');
      if (wt.code !== 0) return { ok: false, error: `write-tree: ${tail(wt.stderr, 1)}` };
      const ct = await git(cwd, env, 'commit-tree', wt.stdout.trim(), '-p', ref, '-m', 'matrix: seed user state');
      if (ct.code !== 0) return { ok: false, error: `commit-tree: ${tail(ct.stderr, 1)}` };
      const ur = await git(cwd, env, 'update-ref', ref, ct.stdout.trim());
      if (ur.code !== 0) return { ok: false, error: `update-ref: ${tail(ur.stderr, 1)}` };
      return { ok: true };
    } finally {
      fs.rmSync(indexFile, { force: true });
    }
  }

  /** Squad-owned paths that a plain `squad upgrade` may legitimately create or rewrite (documented in the fixture). */
  const SQUAD_OWNED: RegExp[] = matrix.squadOwned.map((p) => new RegExp(p));
  const isSquadOwned = (rel: string) => SQUAD_OWNED.some((re) => re.test(rel));

  function parseFrontmatter(text: string): Record<string, unknown> | null {
    const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
    if (!m) return null;
    try { return (yamlParse(m[1]!) ?? {}) as Record<string, unknown>; } catch { return null; }
  }

  /**
   * Host projections must *parse* with the format each host uses, not merely exist
   * (mirrors the per-host assertions in test/clients.test.ts).
   */
  function validateProjections(project: string): string[] {
    const problems: string[] = [];
    const json = (rel: string, check: (v: Record<string, unknown>) => string | null) => {
      const raw = read(path.join(project, rel));
      if (raw === null) return problems.push(`${rel} missing`);
      try { const v = JSON.parse(raw) as Record<string, unknown>; const why = check(v); if (why) problems.push(`${rel}: ${why}`); } catch (e) { problems.push(`${rel}: invalid JSON (${(e as Error).message})`); }
    };
    const toml = (rel: string, check: (v: Record<string, unknown>) => string | null) => {
      const raw = read(path.join(project, rel));
      if (raw === null) return problems.push(`${rel} missing`);
      try { const v = tomlParse(raw) as Record<string, unknown>; const why = check(v); if (why) problems.push(`${rel}: ${why}`); } catch (e) { problems.push(`${rel}: invalid TOML (${(e as Error).message})`); }
    };
    const agentMd = (rel: string, requiredKeys: string[] = ['name', 'description']) => {
      const raw = read(path.join(project, rel));
      if (raw === null) return problems.push(`${rel} missing`);
      const fm = parseFrontmatter(raw);
      if (!fm) return problems.push(`${rel}: no parseable YAML frontmatter`);
      if (!requiredKeys.some((k) => fm[k] !== undefined && fm[k] !== null)) problems.push(`${rel}: frontmatter lacks ${requiredKeys.join('/')}`);
      if (!/Squad/i.test(raw)) problems.push(`${rel}: body does not mention Squad`);
    };
    const hasSquadState = (v: Record<string, unknown>, key = 'mcpServers') => {
      const servers = v[key] as Record<string, unknown> | undefined;
      return servers && typeof servers === 'object' && 'squad_state' in servers ? null : `no ${key}.squad_state entry`;
    };
    // copilot
    agentMd('.github/agents/squad.agent.md');
    json('.mcp.json', (v) => hasSquadState(v));
    // claude
    agentMd('.claude/agents/squad.md');
    // kiro
    agentMd('.kiro/steering/squad.md', ['inclusion']);
    json('.kiro/agents/squad.json', (v) => (typeof v['name'] === 'string' ? null : 'agent definition lacks name'));
    json('.kiro/settings/mcp.json', (v) => hasSquadState(v));
    // opencode
    agentMd('.opencode/agent/squad.md');
    json('opencode.json', (v) => hasSquadState(v, 'mcp'));
    // cursor
    agentMd('.cursor/agents/squad.md');
    agentMd('.cursor/rules/squad.mdc', ['description', 'alwaysApply', 'globs']);
    json('.cursor/mcp.json', (v) => hasSquadState(v));
    // codex
    toml('.codex/agents/squad.toml', (v) => (typeof v['name'] === 'string' || typeof v['description'] === 'string' ? null : 'agent definition lacks name/description'));
    toml('.codex/config.toml', (v) => {
      const servers = v['mcp_servers'] as Record<string, unknown> | undefined;
      return servers && 'squad_state' in servers ? null : 'no mcp_servers.squad_state table';
    });
    if (read(path.join(project, 'AGENTS.md')) === null) problems.push('AGENTS.md missing');
    // antigravity
    agentMd('.agents/agents/squad.md');
    if (read(path.join(project, 'GEMINI.md')) === null) problems.push('GEMINI.md missing');
    return problems;
  }

  async function runScenario(producer: Producer, shape: string): Promise<ScenarioResult> {
    const s = new Scenario(producer, shape);
    const { spec } = producer;
    const structural = structuralSkip(spec, shape);
    if (structural) return s.result('skipped', inapplicableReason(spec.version, shape) ?? structural);
    for (const check of targetChecks) s.check(check.id, check.ok, check.detail);
    if (producer.failReason) {
      s.check('producer-artifact-verified', false, producer.failReason);
      return s.result('fail', producer.failReason);
    }
    s.check('producer-artifact-verified', true);
    if (!producer.exec) return s.result('skipped', producer.skipReason);

    const workBase = path.join(CACHE_ROOT, 'work');
    fs.mkdirSync(workBase, { recursive: true });
    const work = fs.mkdtempSync(path.join(workBase, `squad-pm-${spec.version.replace(/[^\w.]/g, '_')}-${shape}-`));
    workRoots.push(work);
    const project = path.join(work, 'project');
    const configHome = path.join(work, 'config-home');
    fs.mkdirSync(project);
    fs.mkdirSync(configHome);
    const profileRoot = path.join(configHome, 'squad');
    const fsLog = path.join(work, 'profile-fs-access.log');
    const oldEnv = isolatedEnv(configHome, producer.exec.env);
    // Every Squad 2.0 process (upgrade, doctor, projection, uninstall) runs with the fs access logger
    // pointed at the retired profile tree: zero reads, probes or writes may land there.
    const newEnv = isolatedEnv(configHome, {
      ...newCli.env,
      NODE_OPTIONS: `--require ${JSON.stringify(FS_HOOK)}`,
      SQUAD_MATRIX_FS_WATCH_ROOT: profileRoot,
      SQUAD_MATRIX_FS_WATCH_LOG: fsLog,
    });
    const oldCli = (...args: string[]) => run(producer.exec!.file, [...producer.exec!.args, ...args], { cwd: project, env: oldEnv, timeout: 180_000 });
    const squad = (cwd: string, ...args: string[]) => run(newCli.file, [...newCli.args, ...args], { cwd, env: newEnv, timeout: 180_000 });

    await git(project, newEnv, 'init', '-q', '-b', 'main');
    await git(project, newEnv, 'commit', '-q', '--allow-empty', '-m', 'init');

    const seededProfile = shape === 'profile' ? seedProfile(configHome) : null;
    const profileBefore = seededProfile ? fingerprint(seededProfile) : null;

    // 1. OLD CLI scaffolds the project ─────────────────────────────────────
    const initArgs = ['init', ...(shape === 'orphan' || shape === 'two-layer' ? ['--state-backend', shape] : [])];
    const init = await oldCli(...initArgs);
    const teamMd = path.join(project, '.squad', 'team.md');
    if (!s.check('producer-init', init.code === 0 && fs.existsSync(teamMd), `exit ${init.code}: ${tail(init.stderr || init.stdout)}`)) {
      return s.result('fail', `old CLI ${spec.version} ${initArgs.join(' ')} failed: exit ${init.code} — ${tail(init.stderr || init.stdout)}`);
    }
    if (spec.version === '2.0.0-preview.1') {
      const cast = await oldCli('cast', '--name', 'Probe', '--role', 'Upgrade Probe');
      if (cast.code !== 0) return s.result('fail', `published preview.1 producer could not cast Probe: exit ${cast.code} — ${tail(cast.stderr || cast.stdout)}`);
    }
    const cfgAfterInit = readJson(path.join(project, '.squad', 'config.json')) ?? {};
    if (typeof cfgAfterInit['teamRoot'] === 'string') s.notes.push(`producer wrote teamRoot=${String(cfgAfterInit['teamRoot']).replace(configHome, '<config-home>')} at init`);

    // 2. Seed user state (active + retired agents, nested unknown files, spaces/Unicode, custom config keys) ─
    const squadDir = path.join(project, '.squad');
    const onBackend = shape === 'orphan' || shape === 'two-layer';
    // In backend shapes the mutable state (decisions.md, agents/*/history.md) lives ONLY on the
    // `squad-state` branch; seed those as git blobs there and keep everything else in the working tree.
    const mutableState: Record<string, string> = {
      'agents/probe/history.md': PROBE_HISTORY,
      'agents/emeritus/history.md': '# History\n\n- retired before the upgrade; must survive untouched\n',
    };
    const userFiles: Record<string, string> = {
      'agents/probe/charter.md': PROBE_CHARTER,
      'agents/probe/notes/日本語 メモ.md': '# メモ\n\nUnicode filename under an agent folder.\n',
      'agents/emeritus/charter.md': '# Emeritus\n\n## Identity\n- **Name:** Emeritus\n- **Role:** Retired Advisor\n- **Status:** retired\n',
      'skills/custom-review/SKILL.md': '---\nname: custom-review\ndescription: user-authored skill\n---\n\nUser skill body.\n',
      'notes/file with spaces.md': 'Spaces in the filename.\n',
      'decisions/2026-10 ünïcödé décision.md': '# Décision\n\nAccents in the filename.\n',
      'orchestration/unknown-tool.json': '{"vendor":"user","keep":true}\n',
      ...(onBackend ? {} : mutableState),
    };
    for (const [rel, content] of Object.entries(userFiles)) {
      fs.mkdirSync(path.dirname(path.join(squadDir, rel)), { recursive: true });
      fs.writeFileSync(path.join(squadDir, rel), content);
    }
    const DECISION = '\n## Matrix decision\n\n- recorded before upgrade; must survive byte-exact\n';
    let branchSeeded: Record<string, string> = {};
    if (onBackend) {
      const existingDecisions = (await git(project, newEnv, 'show', 'refs/heads/squad-state:decisions.md')).stdout;
      branchSeeded = { ...mutableState, 'decisions.md': existingDecisions + DECISION };
      const seeded = await seedBranchBlobs(project, newEnv, 'refs/heads/squad-state', branchSeeded);
      if (!seeded.ok) return s.result('fail', `could not seed user state onto squad-state: ${seeded.error}`);
    } else {
      fs.appendFileSync(path.join(squadDir, 'decisions.md'), DECISION);
    }
    if (spec.version !== '2.0.0-preview.1') {
      fs.writeFileSync(teamMd, addMarkdownTableRow(
        read(teamMd) ?? '',
        '## Members',
        '| Probe | Upgrade Probe | `.squad/agents/probe/charter.md` | ✅ Active |',
      ));
    }
    const routingPath = path.join(squadDir, 'routing.md');
    fs.writeFileSync(routingPath, addMarkdownTableRow(
      read(routingPath) ?? '',
      '## Routing Table',
      '| Upgrade probes | Probe | Upgrade harness validation |',
    ));
    const cfgPath = path.join(squadDir, 'config.json');
    const cfgSeed = readJson(cfgPath) ?? {};
    const CUSTOM_KEY = { owner: 'matrix', nested: { keep: true, list: [1, 2, 3] } };
    cfgSeed['userCustom'] = CUSTOM_KEY;
    fs.writeFileSync(cfgPath, JSON.stringify(cfgSeed, null, 2) + '\n');
    for (const rel of ['decisions.md', 'team.md', 'routing.md']) userFiles[rel] = read(path.join(squadDir, rel))!;
    const mcpPath = path.join(project, '.mcp.json');
    const mcp = readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath) ?? { mcpServers: {} };
    mcp.mcpServers = { ...(mcp.mcpServers ?? {}), 'user-custom': USER_MCP_SERVER };
    fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
    fs.writeFileSync(path.join(project, 'AGENTS.md'), USER_AGENTS_MD);
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), USER_CLAUDE_MD);
    fs.appendFileSync(path.join(project, '.gitignore'), `\n# user rule\n${USER_GITIGNORE_LINE}\n`);

    if (shape === 'legacy-casting') {
      const casting = path.join(squadDir, 'casting');
      for (const f of fs.readdirSync(casting)) fs.rmSync(path.join(casting, f), { recursive: true, force: true });
      fs.writeFileSync(path.join(casting, 'registry.json'), JSON.stringify({ universe: 'Star Trek', agents: [{ name: 'Probe', role: 'Upgrade Probe', status: 'active' }, { name: 'Emeritus', role: 'Retired Advisor', status: 'active' }] }, null, 2) + '\n');
    }
    if (shape === 'ai-team') {
      fs.renameSync(squadDir, path.join(project, '.ai-team'));
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
    // Manifest before the upgrade, with the legacy state dir already mapped onto `.squad/` so the
    // migration itself is not counted as a change.
    const beforeRaw = snapshot(project);
    const before = new Map([...beforeRaw].map(([k, v]) => [k.startsWith(`${stateDirBefore}/`) ? `.squad/${k.slice(stateDirBefore.length + 1)}` : k, v]));
    const branchBefore = onBackend ? await branchManifest(project, newEnv, 'refs/heads/squad-state') : null;
    const backendBefore = (readJson(path.join(project, stateDirBefore, 'config.json')) ?? {})['stateBackend'];
    const profilePhases: string[] = [];
    const profileCheckpoint = (phase: string) => { if (seededProfile && fingerprint(seededProfile) !== profileBefore) profilePhases.push(phase); };
    profileCheckpoint('producer init + seeding');

    // 3. NEW CLI: plain upgrade ────────────────────────────────────────────
    const up = await squad(project, 'upgrade', ...(shape === 'ai-team' ? ['--migrate-directory'] : []));
    if (!s.check('upgrade-plain', up.code === 0, `exit ${up.code}: ${tail(up.stderr || up.stdout)}`)) {
      return s.result('fail', `squad upgrade failed: exit ${up.code} — ${tail(up.stderr || up.stdout)}`);
    }
    profileCheckpoint('squad upgrade');
    const afterPlain = snapshot(project);
    const afterPlainMcp = read(mcpPath);
    const gitAfterPlain = await gitState(project, newEnv);
    const branchAfterPlain = onBackend ? await branchManifest(project, newEnv, 'refs/heads/squad-state') : null;
    const coordinator = read(path.join(project, '.github', 'agents', 'squad.agent.md')) ?? '';
    const stampRe = /<!-- version: ([^\s>]+) -->/.exec(coordinator);
    s.check('coordinator-is-new-template', stampRe?.[1] === newVersion && coordinator.includes(`- **Version:** ${newVersion}`), `coordinator stamp is ${stampRe?.[1] ?? 'missing'}, expected ${newVersion}`);

    // Full manifest delta: every seeded user file byte-identical (working tree AND squad-state blobs),
    // every changed path Squad-owned, custom config keys kept.
    const delta = diffSnapshots(before, afterPlain);
    const userTouched = Object.keys(userFiles).map((rel) => `.squad/${rel}`).filter((rel) => afterPlain.get(rel) !== before.get(rel));
    const unexplained = delta.filter((rel) => !isSquadOwned(rel));
    const cfgAfter = readJson(path.join(project, '.squad', 'config.json')) ?? {};
    const customKept = JSON.stringify(cfgAfter['userCustom']) === JSON.stringify(CUSTOM_KEY);
    const branchProblems = branchBefore && branchAfterPlain
      ? [
        ...Object.keys(branchSeeded).filter((rel) => branchAfterPlain.get(rel) !== branchBefore.get(rel)).map((rel) => `squad-state blob changed or lost: ${rel} (${branchBefore.get(rel)?.slice(0, 8) ?? 'absent'} → ${branchAfterPlain.get(rel)?.slice(0, 8) ?? 'absent'})`),
        ...[...branchBefore.keys()].filter((rel) => !branchAfterPlain.has(rel)).map((rel) => `squad-state path deleted: ${rel}`),
      ]
      : [];
    const stateProblems = [
      ...userTouched.map((rel) => `user file rewritten: ${rel}`),
      ...unexplained.map((rel) => `changed path is not Squad-owned: ${rel}`),
      ...branchProblems,
      ...(customKept ? [] : ['config.json custom key `userCustom` lost or altered']),
    ];
    s.check('user-state-preserved', stateProblems.length === 0, stateProblems.join('; ') || undefined);
    s.notes.push(`plain upgrade changed ${delta.length} working-tree path(s), all Squad-owned: ${delta.length <= 6 ? delta.join(', ') : `${delta.slice(0, 4).join(', ')} … (+${delta.length - 4})`}${branchBefore ? `; squad-state blobs for ${Object.keys(branchSeeded).length} seeded path(s) identical` : ''}`);

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
    const legacyOk = shape !== 'legacy-casting' || (!!archive && !!castingInfo?.agents.includes('probe') && !!castingInfo?.agents.includes('emeritus'));
    s.check('casting-pair-valid', casting.code === 0 && legacyOk, casting.code !== 0 ? tail(casting.stderr, 1) : !legacyOk ? (!archive ? 'handwritten registry was not archived' : `repaired registry lacks probe/emeritus (${castingInfo?.agents.join(',')})`) : undefined);

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

    if (shape === 'upstream') {
      const upstreamAfter = read(path.join(project, '.squad', 'upstream.json'));
      s.check('user-config-preserved', upstreamAfter === upstreamJsonBefore, 'upstream.json rewritten by upgrade');
    }

    // 4. Idempotency: a second plain upgrade changes neither the working tree nor git state ──
    const again = await squad(project, 'upgrade');
    profileCheckpoint('second squad upgrade');
    const changedAgain = diffSnapshots(afterPlain, snapshot(project));
    const gitChangedAgain = gitDiff(gitAfterPlain, await gitState(project, newEnv));
    const idemProblems = [...(again.code !== 0 ? [`exit ${again.code}`] : []), ...changedAgain, ...gitChangedAgain];
    s.check('idempotent-second-upgrade', idemProblems.length === 0, idemProblems.join(', ') || undefined);

    // 5. Downgrade probe: OLD CLI against the upgraded project (dry-run, on a copy) — unsupported path, recorded ─
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
      profileCheckpoint('old CLI --dry-run (downgrade probe)');
    }

    // 6. Project all 7 hosts — and prove every projection parses ──────────
    const clients = await squad(project, 'upgrade', '--client', 'all', '--force');
    profileCheckpoint('squad upgrade --client all');
    const cfgClients = (readJson(path.join(project, '.squad', 'config.json')) ?? {})['clients'];
    const projectionProblems = clients.code === 0 ? validateProjections(project) : [];
    s.check('clients-projected', clients.code === 0 && JSON.stringify(cfgClients) === JSON.stringify(CLIENT_IDS) && projectionProblems.length === 0,
      clients.code !== 0 ? `exit ${clients.code}: ${tail(clients.stderr || clients.stdout)}` : projectionProblems.length ? projectionProblems.join('; ') : `clients=${JSON.stringify(cfgClients)}`);

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

    // 7. health + doctor ────────────────────────────────────────────────────
    if (spec.version === '2.0.0-preview.1') {
      const health = await squad(project, 'health', '--json');
      let healthReport: { status?: string; checks?: Array<{ id?: string; status?: string; diagnostics?: string[] }> } | null = null;
      try { healthReport = JSON.parse(health.stdout) as typeof healthReport; } catch { /* recorded below */ }
      const teamHealth = healthReport?.checks?.find((check) => check.id === 'team');
      const builtinDiagnostics = teamHealth?.diagnostics ?? [];
      const healthOk = health.code === 0
        && healthReport?.status === 'pass'
        && teamHealth?.status === 'info'
        && builtinDiagnostics.some((line) => line.includes('Rai is available but not configured'))
        && builtinDiagnostics.some((line) => line.includes('Fact Checker is available but not configured'));
      const healthFailures = healthReport?.checks?.filter((check) => check.status === 'fail') ?? [];
      s.check('health', healthOk, healthOk ? undefined : `exit ${health.code}; failures=${JSON.stringify(healthFailures)}; ${tail(health.stdout || health.stderr, 8)}`);
      profileCheckpoint('squad health');
    } else {
      s.skip('health', 'strict health/optional-built-in attestation is required for the exact published preview.1 producer');
    }

    const doctor = await squad(project, 'doctor');
    profileCheckpoint('squad doctor');
    const failedLines = doctor.stdout.split(/\r?\n/).filter((l) => /^❌/.test(l.trim())).map((l) => l.trim());
    const bridgeLine = doctor.stdout.split(/\r?\n/).find((line) => line.includes('squad_state bridge'));
    const doctorOk = doctor.code === 0
      && failedLines.length === 0
      && /Mode:\s+local/.test(doctor.stdout)
      && bridgeLine?.includes(newVersion) === true;
    s.check('doctor', doctorOk, doctorOk ? undefined : failedLines.length ? failedLines.join(' | ') : `bridge=${bridgeLine ?? '<missing>'}; ${tail(doctor.stderr || doctor.stdout)}`);

    // 8. Projection uninstall (uninstallClients) — this is NOT a downgrade ────────────────────
    // Baseline = the tree right after the plain upgrade, i.e. before any projection. uninstall must
    // (a) restore every shared file to those bytes, except that squad_state entries Squad itself
    // installed into shared MCP configs are removed, (b) remove every host projection and every
    // Squad-owned entry from host configs, and (c) leave .squad/ user state untouched.
    const uninstallScript = [
      'import { uninstallClients, CLIENT_IDS } from "@bradygaster/squad-sdk/client";',
      `const res = uninstallClients(CLIENT_IDS, { root: ${JSON.stringify(project)}, mcp: { command: "squad", args: ["state-mcp"] } });`,
      'const errors = res.filter(r => r.action === "error"); if (errors.length) throw new Error(JSON.stringify(errors));',
    ].join(' ');
    const un = await run(process.execPath, ['--input-type=module', '-e', uninstallScript], { cwd: staging, env: newEnv, timeout: 30_000 });
    profileCheckpoint('uninstallClients');
    const afterUninstall = snapshot(project);
    const branchAfterUninstall = onBackend ? await branchManifest(project, newEnv, 'refs/heads/squad-state') : null;
    const sharedFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.gitignore'];
    const projectionFiles = [
      '.claude/agents/squad.md', '.kiro/steering/squad.md', '.kiro/agents/squad.json', '.opencode/agent/squad.md',
      '.cursor/agents/squad.md', '.cursor/rules/squad.mdc', '.codex/agents/squad.toml', '.agents/agents/squad.md',
    ];
    const hostMcpJson = ['.kiro/settings/mcp.json', '.cursor/mcp.json'];
    const withoutSquadState = (raw: string | null): unknown => {
      if (raw === null) return null;
      try {
        const v = JSON.parse(raw) as Record<string, unknown>;
        for (const key of ['mcpServers', 'mcp']) {
          const servers = v[key] as Record<string, unknown> | undefined;
          if (servers && typeof servers === 'object') delete servers['squad_state'];
        }
        return v;
      } catch { return raw; }
    };
    const mcpNow = readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath);
    const unProblems = [
      un.code !== 0 ? `uninstallClients failed: ${tail(un.stderr, 1)}` : null,
      ...sharedFiles.filter((rel) => afterUninstall.get(rel) !== afterPlain.get(rel)).map((rel) => `${rel} not restored to its pre-projection bytes (${afterPlain.has(rel) ? 'differs' : 'did not exist before, exists now'})`),
      ...projectionFiles.filter((rel) => afterUninstall.has(rel)).map((rel) => `${rel} still present`),
      // .mcp.json: identical to pre-projection content minus the squad_state entry Squad installed; the user's server intact.
      JSON.stringify(withoutSquadState(read(mcpPath))) !== JSON.stringify(withoutSquadState(afterPlainMcp)) ? '.mcp.json differs from its pre-projection content (ignoring squad_state)' : null,
      JSON.stringify(mcpNow?.mcpServers?.['user-custom']) !== JSON.stringify(USER_MCP_SERVER) ? '.mcp.json user-custom server lost on uninstall' : null,
      (mcpNow?.mcpServers ?? {})['squad_state'] !== undefined ? '.mcp.json still carries squad_state after uninstalling every client' : null,
      // Host MCP configs created by the projection must be gone or free of Squad entries.
      ...hostMcpJson.filter((rel) => afterUninstall.has(rel) && !afterPlain.has(rel) && (readJson<{ mcpServers?: Record<string, unknown> }>(path.join(project, rel))?.mcpServers ?? {})['squad_state'] !== undefined).map((rel) => `${rel} still carries squad_state`),
      afterUninstall.has('opencode.json') && !afterPlain.has('opencode.json') && (readJson<{ mcp?: Record<string, unknown> }>(path.join(project, 'opencode.json'))?.mcp ?? {})['squad_state'] !== undefined ? 'opencode.json still carries mcp.squad_state' : null,
      afterUninstall.has('.codex/config.toml') && !afterPlain.has('.codex/config.toml') && /squad_state/.test(read(path.join(project, '.codex', 'config.toml')) ?? '') ? '.codex/config.toml still carries mcp_servers.squad_state' : null,
      ...Object.keys(userFiles).map((rel) => `.squad/${rel}`).filter((rel) => afterUninstall.get(rel) !== before.get(rel)).map((rel) => `${rel} changed by projection/uninstall`),
      ...(branchBefore ? Object.keys(branchSeeded).filter((rel) => branchAfterUninstall?.get(rel) !== branchBefore.get(rel)).map((rel) => `squad-state blob changed by projection/uninstall: ${rel}`) : []),
    ].filter((x): x is string => x !== null);
    s.check('projection-uninstall-byte-exact', unProblems.length === 0, unProblems.join('; ') || undefined);

    // 9. Profile integrity: no writes (fingerprint, checked after every phase) AND no reads/probes
    //    (fs access log) by any 2.0 process ─────────────────────────────────────────────────────
    if (seededProfile) {
      const hits = (read(fsLog) ?? '').split(/\r?\n/).filter(Boolean);
      const problems = [
        profilePhases.length ? `profile tree changed (sha256 fingerprint differs) after: ${profilePhases.join(', ')}` : null,
        hits.length ? `${hits.length} fs access(es) under the profile root by Squad 2.0 processes, e.g. ${hits.slice(0, 3).map((h) => h.replace(configHome, '<config-home>')).join('; ')}` : null,
      ].filter((x): x is string => x !== null);
      s.check('profile-untouched', problems.length === 0, problems.join('; ') || undefined);
    } else {
      s.skip('profile-untouched', 'no profile squad seeded in this shape');
    }

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
    const verdict = rowVerdict(result);
    expect(verdict, verdict ?? '').toBeNull();
  }, 15 * 60_000);
});
