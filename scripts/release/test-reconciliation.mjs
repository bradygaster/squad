#!/usr/bin/env node
/**
 * Test-result reconciliation for the release evidence bundle.
 *
 * Reads a vitest JSON report (`vitest run --reporter=json --outputFile=<file>`) and produces
 * `test-reconciliation.json`: every non-passing test is listed with its file, full title, vitest
 * status and a category from the reviewed table below; the counts are re-summed against
 * `numTotalTests`, so a test that was collected but never finished (vitest leaves it in
 * `queued`/`pending` mode and the console summary silently drops it) is reported as
 * `unexplained` instead of disappearing into "total minus the buckets".
 *
 * Categories (release policy: keep the 7 structural upgrade-matrix skips and the F3 xfails;
 * no supported downgrade; everything else must be env-gated with the gate named, or fixed):
 *   structural   the upgrade matrix declares the cell structurally inapplicable
 *   env-gated    skipped because an opt-in environment variable, binary, platform, build artifact
 *                or privilege is absent on this runner (gate named in `reason`)
 *   f3-xfail     expected failure pinned to finding F3 (Squad 0.9.1 `upgrade --dry-run` is not dry)
 *   digest-gap   expected failure declared by test/clients.test.ts for a host digest gap
 *   todo         it.todo placeholder (listed; release-blocking only when named in TODO_BLOCKERS)
 *   unexplained  anything else, including tests with no terminal state
 *
 *   node scripts/release/test-reconciliation.mjs --report vitest.json --out evidence [--baseline prior.json]
 *        [--fail-on-unexplained]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Reviewed skip/xfail/todo sources. Order matters: first match wins. */
export const CATEGORY_RULES = Object.freeze([
  { category: 'structural', file: /squad-20-upgrade-matrix\.test\.ts$/, title: /structurally inapplicable|not applicable|×.*: (no |cannot|does not)/i, reason: 'upgrade matrix: structurally inapplicable cell (7 declared in test-fixtures/spec/suite-v0.2/upgrade-matrix.json)' },
  { category: 'env-gated', file: /squad-20-upgrade-matrix\.test\.ts$/, reason: 'SQUAD_UPGRADE_MATRIX=1 not set (matrix runs only in squad-upgrade-matrix.yml)' },
  { category: 'env-gated', file: /squad-20-preview-tarball-matrix\.test\.ts$/, reason: 'SQUAD_PREVIEW_TARBALL_MATRIX=1 not set (exact-tarball matrix runs only in the attested preview workflow mode)' },
  { category: 'env-gated', file: /clients-real-cli\.test\.ts$/, reason: 'SQUAD_REAL_CLI_TESTS=1 not set / host CLI binaries absent' },
  { category: 'env-gated', file: /squad-20-real-clients-stdio\.e2e\.test\.ts$/, reason: 'SQUAD_REAL_CLI_TESTS=1 not set / host CLI binaries absent' },
  { category: 'env-gated', file: /squad-20-host-feature-matrix\.test\.ts$/, reason: 'live host evidence requires the real CLI binaries' },
  { category: 'env-gated', file: /mcp-spec-init\.test\.ts$/, title: /squad\.exe/, reason: 'it.runIf(win32): Windows-only PATH/.exe resolution' },
  { category: 'env-gated', file: /profile-boundary\.test\.ts$/, reason: 'host lacks 8.3 short names or symlink/junction privilege' },
  { category: 'env-gated', file: /state-backend\.test\.ts$/, reason: 'platform-gated state backend case' },
  { category: 'env-gated', file: /docs-build\.test\.ts$/, reason: 'docs dependencies not installed' },
  { category: 'env-gated', file: /(aspire-integration|cli\/aspire)\.test\.ts$/, reason: 'aspire CLI absent' },
  { category: 'env-gated', file: /gh-aw-(quality|cast-validator)\.test\.ts$/, reason: 'gh-aw extension absent (CI installs it; gate hard-fails there)' },
  { category: 'env-gated', file: /(package-exports-targets|bench-runner|cli-outside-project|cli\/command-help|upstream-runtime|cli\/upgrade)\.test\.ts$/, reason: 'requires a built dist/ (CI builds before testing)' },
  { category: 'env-gated', file: /release-pack-install\.test\.ts$/, reason: 'SQUAD_RELEASE_PACK_INSTALL=1 not set for the plain suite run; the release-verify workflow runs it as a dedicated step against the packed tarballs' },
  { category: 'env-gated', file: /(squad-agent-roster|state-backend-handshake)\.test\.ts$/, title: /file does not exist in this checkout/, reason: 'contributor-only .squad file absent from this checkout' },
  { category: 'f3-xfail', file: /squad-20-upgrade-matrix\.test\.ts$/, status: 'xfail', reason: 'finding F3: Squad 0.9.1 upgrade --dry-run is not dry (pinned xfail; xpass fails the suite)' },
  { category: 'digest-gap', file: /clients\.test\.ts$/, status: 'xfail', title: /^digest gap/, reason: 'test/clients.test.ts: per-host coordinator digest gap declared with it.fails' },
]);

/** it.todo titles that block a release (none today; the selfUpgradeCli todo was implemented). */
export const TODO_BLOCKERS = Object.freeze([]);

function relFile(name) {
  const norm = name.replace(/\\/g, '/');
  const i = norm.indexOf('/test/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

export function reconcile(report, { baseline } = {}) {
  const tests = [];
  const files = { total: report.testResults.length, byStatus: {} };
  for (const tr of report.testResults) {
    files.byStatus[tr.status] = (files.byStatus[tr.status] ?? 0) + 1;
    const file = relFile(tr.name);
    for (const a of tr.assertionResults) {
      // vitest's JSON reporter reports it.fails tests that failed as expected as "passed"; recover
      // the xfail bucket from the title convention used in this repo (`digest gap`, `F3`).
      const isXfail = a.status === 'passed' && (/^digest gap/.test(a.title) || /\bF3\b.*xfail|xfail.*\bF3\b/i.test(a.fullName));
      tests.push({ file, title: a.title, fullName: a.fullName, status: isXfail ? 'xfail' : a.status, failureMessages: a.failureMessages ?? [] });
    }
  }
  const byStatus = {};
  for (const t of tests) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  const nonPassing = tests.filter((t) => t.status !== 'passed');
  const categorized = nonPassing.map((t) => {
    let category = 'unexplained'; let reason = 'no reviewed rule matches this test';
    if (t.status === 'pending' || t.status === 'disabled') {
      // Collected but never reached a terminal state (e.g. a describe.skip nested inside a skipped
      // describe). The console summary silently drops these; they are never acceptable.
      reason = `vitest status '${t.status}': collected but never ran or skipped; flatten the skip decision`;
    } else if (t.status === 'todo') { category = TODO_BLOCKERS.includes(t.title) ? 'todo-blocking' : 'todo'; reason = 'it.todo placeholder'; }
    else {
      for (const rule of CATEGORY_RULES) {
        if (!rule.file.test(t.file)) continue;
        if (rule.status && rule.status !== t.status) continue;
        if (rule.title && !rule.title.test(t.fullName) && !rule.title.test(t.title)) continue;
        if (!rule.status && t.status === 'xfail') continue;
        category = rule.category; reason = rule.reason; break;
      }
      if (t.status === 'failed') { category = 'failed'; reason = t.failureMessages[0]?.split('\n')[0] ?? 'failed'; }
    }
    return { ...t, category, reason };
  });
  const byCategory = {};
  for (const t of categorized) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;

  const bucketSum = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const listed = tests.length;
  const unexplainedTotal = report.numTotalTests - listed;
  const summary = {
    numTotalTests: report.numTotalTests, listed, bucketSum, byStatus, byCategory,
    countsSum: bucketSum === listed && listed === report.numTotalTests,
    unlistedTests: unexplainedTotal,
    files,
    skippedFiles: report.testResults.filter((tr) => tr.assertionResults.length > 0 && tr.assertionResults.every((a) => a.status === 'skipped' || a.status === 'todo')).map((tr) => relFile(tr.name)),
    ok: report.numFailedTests === 0 && (byCategory.unexplained ?? 0) === 0 && (byCategory['todo-blocking'] ?? 0) === 0 && unexplainedTotal === 0 && bucketSum === report.numTotalTests,
  };
  let diff = null;
  if (baseline) {
    const key = (t) => `${t.file} :: ${t.fullName} [${t.status}]`;
    const prev = new Set((baseline.nonPassing ?? []).map(key));
    const now = new Set(categorized.map(key));
    diff = { baseline: baseline.summary?.numTotalTests ?? null, added: [...now].filter((k) => !prev.has(k)).sort(), removed: [...prev].filter((k) => !now.has(k)).sort(), totalDelta: report.numTotalTests - (baseline.summary?.numTotalTests ?? report.numTotalTests) };
  }
  return { generatedAt: new Date().toISOString(), summary, nonPassing: categorized.sort((a, b) => a.file.localeCompare(b.file) || a.fullName.localeCompare(b.fullName)), diffVsBaseline: diff };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const reportPath = path.resolve(arg('--report') ?? 'vitest-report.json');
  if (!existsSync(reportPath)) { console.error(`::error::vitest JSON report not found: ${reportPath}`); process.exit(2); }
  const outDir = path.resolve(arg('--out') ?? 'evidence');
  mkdirSync(outDir, { recursive: true });
  const baseline = arg('--baseline') ? JSON.parse(readFileSync(path.resolve(arg('--baseline')), 'utf8')) : undefined;
  const result = reconcile(JSON.parse(readFileSync(reportPath, 'utf8')), { baseline });
  writeFileSync(path.join(outDir, 'test-reconciliation.json'), JSON.stringify(result, null, 2) + '\n');
  const s = result.summary;
  console.log(`tests=${s.numTotalTests} listed=${s.listed} byStatus=${JSON.stringify(s.byStatus)} byCategory=${JSON.stringify(s.byCategory)} unlisted=${s.unlistedTests} skippedFiles=${s.skippedFiles.join(',') || '-'}`);
  for (const t of result.nonPassing.filter((t) => t.category === 'unexplained' || t.category === 'failed' || t.category === 'todo-blocking')) console.error(`::warning::${t.category}: ${t.file} :: ${t.fullName} [${t.status}]`);
  if (!s.countsSum || s.unlistedTests !== 0) console.error(`::error::${s.unlistedTests} test(s) are counted in numTotalTests but have no listed result (never reached a terminal state); see ${path.join(outDir, 'test-reconciliation.json')}`);
  const fail = process.argv.includes('--fail-on-unexplained') ? !s.ok : (s.numTotalTests > 0 && (s.byStatus.failed ?? 0) > 0);
  console.log(`${s.ok ? '✅' : '⚠️'} reconciliation written to ${outDir}`);
  process.exit(fail ? 1 : 0);
}
