#!/usr/bin/env node
/**
 * Build the Squad 2.0 verification manifest at an exact commit.
 *
 * Ported from the reviewer-side generator used for merged dev f22847a9, made repo-relative and
 * reproducible in CI, with the reviewer-required fixes:
 *   - closure rows report presence facts separately: `carried` (evidence files exist and an anchor
 *     is present), `anchorPresent`, `contentEvidencePresent` (anchor found in implementation or test
 *     code, not only in docs/changesets); doc/changeset-only anchors must cite an implementation
 *     symbol and the exact regression test title, else the row is `presenceOnly`;
 *   - a separate `behavioralEvidence` section: layer tree equality, the cited CI run, and which
 *     regression test titles are defined in the tree and executed in the cited vitest report;
 *   - every count sums (validated by scripts/release/validate-manifest.mjs);
 *   - a `provenance.json` sidecar (sha256, bytes, run URL, commit + tree SHA, generator script hash,
 *     schema version + hash).
 *
 *   node scripts/release/build-manifest.mjs --out evidence [--sha <commit>] [--evidence evidence]
 *        [--vitest-report evidence/vitest-report.json] [--baseline prior-manifest.json]
 *        [--baseline-commit <sha>] [--branch dev]
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCHEMA_VERSION = 'squad-2.0-verification-manifest/v2';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const gitOk = (...args) => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).status === 0;
const treeOf = (sha) => (gitOk('cat-file', '-e', `${sha}^{commit}`) ? git('rev-parse', `${sha}^{tree}`) : null);

function arg(k, dflt) { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : dflt; }

/** Backticked test titles in a locking-tests cell, trimmed at an ellipsis. */
export function titlesOf(lockingTests) {
  return [...String(lockingTests ?? '').matchAll(/`([^`]+)`/g)]
    .map((m) => m[1].split('…')[0].trim())
    .filter((t) => t.length >= 8 && !/^\d+\.$/.test(t) && !/\b(?:skipIf|runIf|describe|it|test)\s*\(/.test(t))
    .map((t) => t.split(' > ').pop().replace(/^(?:P[12]|G\d+|R3-\d+:|\d+\.|\d+\+\d+\.)\s*/, '').trim())
    .filter((t) => t.length >= 8);
}

export function buildManifest(opts) {
  const sha = git('rev-parse', `${opts.sha ?? 'HEAD'}^{commit}`);
  const tree = git('rev-parse', `${sha}^{tree}`);
  const inputs = readJson(path.join(HERE, 'closure-items.json'));
  const tracked = git('ls-tree', '-r', '--name-only', sha).split(/\r?\n/).filter(Boolean);
  const trackedSet = new Set(tracked);
  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  const sdk = readJson(path.join(ROOT, 'packages/squad-sdk/package.json'));
  const cli = readJson(path.join(ROOT, 'packages/squad-cli/package.json'));

  // Text of every tracked text file at the target tree (read via one `git cat-file --batch` stream
  // so the manifest describes the commit, not the worktree, without spawning per file).
  const text = new Map();
  const wanted = tracked.filter((rel) => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|tgz|zip|lock)$/i.test(rel) && !rel.endsWith('package-lock.json'));
  const batch = spawnSync('git', ['-C', ROOT, 'cat-file', '--batch'], { input: wanted.map((rel) => `${sha}:${rel}`).join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024 });
  if (batch.status !== 0) throw new Error(`git cat-file --batch failed: ${batch.stderr}`);
  let cursor = 0; const out = batch.stdout;
  for (const rel of wanted) {
    const nl = out.indexOf(0x0a, cursor);
    const header = out.subarray(cursor, nl).toString('utf8');
    cursor = nl + 1;
    if (header.endsWith(' missing')) continue;
    const size = Number(header.split(' ')[2]);
    const buf = out.subarray(cursor, cursor + size);
    cursor += size + 1;
    if (size > 5_000_000 || buf.includes(0)) continue;
    text.set(rel, buf.toString('utf8'));
  }
  const kindOf = (rel) => (/^test\//.test(rel) || /\.test\.(ts|cjs|mjs|js)$/.test(rel) ? 'test' : /^(docs\/|\.changeset\/|\.copilot\/|\.squad-templates\/|templates\/|packages\/[^/]+\/templates\/)|\.md$/.test(rel) ? 'doc-only' : 'implementation');
  const findAnchor = (anchor, preferred) => {
    if (!anchor) return null;
    const order = [...preferred.filter((p) => text.has(p)), ...[...text.keys()].filter((p) => !preferred.includes(p)).sort((a, b) => ({ implementation: 0, test: 1, 'doc-only': 2 })[kindOf(a)] - ({ implementation: 0, test: 1, 'doc-only': 2 })[kindOf(b)])];
    for (const rel of order) if (text.get(rel).includes(anchor)) return rel;
    return null;
  };
  const testFiles = [...text.keys()].filter((p) => kindOf(p) === 'test');
  const findTitle = (title) => testFiles.find((p) => text.get(p).includes(title)) ?? null;

  // Optional vitest JSON report of the cited run for "executed" evidence.
  let reportTitles = null;
  if (opts.vitestReport && existsSync(opts.vitestReport)) {
    const report = readJson(opts.vitestReport);
    reportTitles = report.testResults.flatMap((tr) => tr.assertionResults.filter((a) => a.status === 'passed').map((a) => a.fullName));
  }
  const executed = (title) => (reportTitles ? reportTitles.some((f) => f.includes(title)) : null);

  const items = inputs.items.map((row) => {
    const evidenceLocationsPresent = row.evidenceLocations.length > 0 && row.evidenceLocations.every((p) => trackedSet.has(p));
    const anchorLocation = findAnchor(row.anchor, row.evidenceLocations);
    const anchorKind = anchorLocation ? kindOf(anchorLocation) : 'absent';
    const implFile = row.anchor ? row.evidenceLocations.find((p) => kindOf(p) === 'implementation' && text.get(p)?.includes(row.anchor)) ?? (anchorKind === 'implementation' ? anchorLocation : null) : null;
    const regressionTests = titlesOf(row.lockingTests).map((title) => ({ title, definedIn: findTitle(title), executedInCitedReport: executed(title) }));
    const contentEvidencePresent = anchorKind === 'implementation' || anchorKind === 'test' || (implFile !== null && regressionTests.some((t) => t.definedIn));
    const carried = evidenceLocationsPresent && anchorLocation !== null;
    return {
      id: row.id, ...(row.groupedFrom ? { groupedFrom: row.groupedFrom } : {}), finding: row.finding, originalLayer: row.originalLayer,
      evidenceLocations: row.evidenceLocations, evidenceLocationsPresent,
      anchor: row.anchor ?? null, anchorLocation, anchorKind, anchorPresent: anchorLocation !== null,
      implementationSymbol: implFile ? { symbol: row.anchor, file: implFile } : null,
      regressionTests, contentEvidencePresent: carried && contentEvidencePresent, presenceOnly: carried && !contentEvidencePresent, carried,
      sourceEvidence: row.sourceEvidence, lockingTests: row.lockingTests,
    };
  });
  const count = (f) => items.filter(f).length;
  const closure = {
    trackedItems: items.length, carried: count((i) => i.carried), notCarried: count((i) => !i.carried),
    contentEvidencePresent: count((i) => i.contentEvidencePresent), presenceOnly: count((i) => i.presenceOnly), anchorPresent: count((i) => i.anchorPresent),
    sums: { carriedPlusNotCarriedEqualsTracked: count((i) => i.carried) + count((i) => !i.carried) === items.length, contentPlusPresenceEqualsCarried: count((i) => i.contentEvidencePresent) + count((i) => i.presenceOnly) === count((i) => i.carried) },
    items,
  };

  const layers = inputs.stack.layers.map((l) => {
    const headTree = treeOf(l.head); const squashTree = treeOf(l.squash);
    return { ...l, headTree, squashTree, treeEqual: headTree && squashTree ? headTree === squashTree : null, verificationCommand: `git rev-parse ${l.head}^{tree} ${l.squash}^{tree}` };
  });
  const layersUnavailable = layers.filter((l) => l.treeEqual === null).length;

  const evidenceDir = opts.evidenceDir;
  const pack = evidenceDir && existsSync(path.join(evidenceDir, 'pack-evidence.json')) ? readJson(path.join(evidenceDir, 'pack-evidence.json')) : null;
  const lockReport = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'check-lockfile-registry.mjs'), '--json'], { encoding: 'utf8', cwd: ROOT }));
  const npmCi = evidenceDir && existsSync(path.join(evidenceDir, 'npm-ci.json')) ? readJson(path.join(evidenceDir, 'npm-ci.json')) : null;
  const recon = evidenceDir && existsSync(path.join(evidenceDir, 'test-reconciliation.json')) ? readJson(path.join(evidenceDir, 'test-reconciliation.json')) : null;
  const pkgEntry = (p, name) => {
    const t = pack?.packages?.[name];
    return { name: p.name, version: p.version, exportsCount: Object.keys(p.exports ?? {}).length, sdkDependency: p.dependencies?.['@bradygaster/squad-sdk'] ?? null, tarball: t ? { filename: t.filename, bytes: t.bytes, sha256: t.sha256, integrity: t.integrity, fileCount: t.fileCount, exportTargetsMissing: t.exportTargets.missing.length, privacyHits: t.privacy.hits.length, privacyAllowlisted: t.privacy.allowlisted.length } : null };
  };

  const citedRun = inputs.stack.citedCiRun;
  const baseline = opts.baseline && existsSync(opts.baseline) ? readJson(opts.baseline) : null;
  const baselineCommit = opts.baselineCommit ?? baseline?.target?.commit ?? baseline?.stack?.devHead ?? null;
  let diffStat = null; let firstParent = null;
  if (baselineCommit && gitOk('cat-file', '-e', `${baselineCommit}^{commit}`)) {
    const raw = git('diff', '--shortstat', baselineCommit, sha);
    const m = raw.match(/(?:(\d+) files? changed)?(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    diffStat = { raw, filesChanged: Number(m?.[1] || 0), insertions: Number(m?.[2] || 0), deletions: Number(m?.[3] || 0) };
    firstParent = git('log', '--first-parent', '--format=%H%x09%s', `${baselineCommit}..${sha}`).split(/\r?\n/).filter(Boolean).map((l) => { const [h, ...r] = l.split('\t'); return { sha: h, subject: r.join('\t') }; });
  }
  const baselineCarried = baseline?.closure?.carried ?? baseline?.closureMatrix?.carried ?? baseline?.closureMatrix?.findingsTracked ?? null;

  const scriptSha = sha256(readFileSync(fileURLToPath(import.meta.url)));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    generator: { script: 'scripts/release/build-manifest.mjs', scriptSha256: scriptSha, node: process.version, mode: process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'local' },
    target: { commit: sha, tree, branch: opts.branch ?? null, version: rootPkg.version, immutableVerification: { commitCommand: `git rev-parse ${sha}^{commit}`, treeCommand: `git rev-parse ${sha}^{tree}` } },
    stack: { id: inputs.stack.id, repo: inputs.stack.repo, base: inputs.stack.base, mergedDev: inputs.stack.mergedDev, layers, allLayerTreesEqual: layersUnavailable === 0 ? layers.every((l) => l.treeEqual) : null, layersUnavailable },
    ci: {
      citedRun: { id: citedRun.id, url: citedRun.url, headSha: citedRun.headSha, matchesTarget: citedRun.headSha === sha, conclusion: opts.citedConclusion ?? null, consoleSummary: citedRun.consoleSummary },
      thisRun: process.env.GITHUB_RUN_ID ? { id: process.env.GITHUB_RUN_ID, url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, workflow: process.env.GITHUB_WORKFLOW ?? '', attempt: process.env.GITHUB_RUN_ATTEMPT ?? '1' } : null,
    },
    packages: { '@bradygaster/squad-sdk': pkgEntry(sdk, '@bradygaster/squad-sdk'), '@bradygaster/squad-cli': pkgEntry(cli, '@bradygaster/squad-cli') },
    lockfiles: { files: lockReport.files.length, registryEntries: lockReport.entries, violations: lockReport.violations.length, deniedPatterns: lockReport.deniedPatterns, ok: lockReport.ok, externalNpmCi: npmCi },
    tests: recon ? { source: 'vitest JSON report of this run (scripts/release/test-reconciliation.mjs)', platform: recon.summary.platform, numTotalTests: recon.summary.numTotalTests, byStatus: recon.summary.byStatus, byCategory: recon.summary.byCategory, countsSum: recon.summary.countsSum, unlistedTests: recon.summary.unlistedTests, skippedFiles: recon.summary.skippedFiles, reconciliationFile: 'test-reconciliation.json' }
      : { source: `console summary of cited CI run ${citedRun.id} (no vitest JSON report available to this generator)`, numTotalTests: citedRun.consoleSummary.testsTotal, byStatus: { passed: citedRun.consoleSummary.testsPassed, xfail: citedRun.consoleSummary.expectedFailures, skipped: citedRun.consoleSummary.testsSkipped, todo: citedRun.consoleSummary.todos }, byCategory: {}, countsSum: citedRun.consoleSummary.testsPassed + citedRun.consoleSummary.expectedFailures + citedRun.consoleSummary.testsSkipped + citedRun.consoleSummary.todos === citedRun.consoleSummary.testsTotal, unlistedTests: citedRun.consoleSummary.testsTotal - (citedRun.consoleSummary.testsPassed + citedRun.consoleSummary.expectedFailures + citedRun.consoleSummary.testsSkipped + citedRun.consoleSummary.todos), skippedFiles: [], reconciliationFile: null },
    closure,
    behavioralEvidence: {
      treeEquality: { layersChecked: layers.length, layersEqual: layers.filter((l) => l.treeEqual === true).length, layersUnavailable },
      citedCiRun: { url: citedRun.url, headSha: citedRun.headSha, matchesTarget: citedRun.headSha === sha, conclusion: opts.citedConclusion ?? null },
      regressionTests: { titlesCited: items.reduce((a, i) => a + i.regressionTests.length, 0), titlesDefinedInTree: items.reduce((a, i) => a + i.regressionTests.filter((t) => t.definedIn).length, 0), titlesExecutedInReport: items.reduce((a, i) => a + i.regressionTests.filter((t) => t.executedInCitedReport === true).length, 0), reportAvailable: reportTitles !== null },
    },
    comparison: { baselineManifest: opts.baseline ? path.basename(opts.baseline) : null, baselineCommit, diffStat, firstParentCommits: firstParent, closureItemsBefore: baselineCarried, closureItemsCarriedNow: closure.carried, packageVersions: baseline ? { before: baseline.packages?.['@bradygaster/squad-sdk']?.version ?? baseline.packages?.['squad-sdk']?.version ?? null, now: sdk.version } : null, verdict: baselineCarried !== null ? `${closure.carried}/${closure.trackedItems} closure items carried at ${sha.slice(0, 8)} (baseline recorded ${baselineCarried}); ${closure.contentEvidencePresent} with code-level evidence, ${closure.presenceOnly} presence-only.` : null },
    artifacts: ['pack-evidence.json', 'test-reconciliation.json', 'npm-ci.json', 'lockfile-registry.json', 'policy-gates.json', 'provenance.json', 'manifest.schema.json'].filter((f) => f === 'provenance.json' || f === 'manifest.schema.json' || (evidenceDir && existsSync(path.join(evidenceDir, f)))),
  };
  return manifest;
}

export function renderMarkdown(m) {
  let md = `# Squad 2.0 verification manifest — \`${m.target.commit.slice(0, 8)}\` (${m.target.version})\n\nGenerated ${m.generatedAt} by \`${m.generator.script}\` (sha256 \`${m.generator.scriptSha256.slice(0, 12)}…\`, ${m.generator.mode}). Schema \`${m.schemaVersion}\`. Presence facts (carried / anchorPresent / contentEvidencePresent) and behavioral evidence (tree equality, cited CI run, regression tests) are reported separately.\n\n`;
  md += `## Target\n\n- Commit \`${m.target.commit}\` on \`${m.target.branch ?? '?'}\`\n- Tree \`${m.target.tree}\`\n- Verify: \`${m.target.immutableVerification.commitCommand}\`; \`${m.target.immutableVerification.treeCommand}\`\n\n`;
  md += `## Stack #${m.stack.id}\n\n| Layer | PR | Head tree | Squash tree | Equal |\n|---|---:|---|---|---|\n`;
  for (const l of m.stack.layers) md += `| ${l.layer} | #${l.pr} | \`${l.headTree ?? 'unavailable'}\` | \`${l.squashTree ?? 'unavailable'}\` | ${l.treeEqual === null ? 'unavailable' : l.treeEqual ? 'YES' : 'NO'} |\n`;
  md += `\n## CI\n\n- Cited run [${m.ci.citedRun.id}](${m.ci.citedRun.url}) at \`${m.ci.citedRun.headSha.slice(0, 8)}\` (matches target: ${m.ci.citedRun.matchesTarget}); console summary ${JSON.stringify(m.ci.citedRun.consoleSummary)}\n${m.ci.thisRun ? `- This run [${m.ci.thisRun.id}](${m.ci.thisRun.url}) (${m.ci.thisRun.workflow}, attempt ${m.ci.thisRun.attempt})\n` : ''}\n`;
  md += `## Packages\n\n| Package | Version | Exports | SDK dep | Tarball | Bytes | sha256 | integrity | Export targets missing | Privacy hits |\n|---|---|---:|---|---|---:|---|---|---:|---:|\n`;
  for (const p of Object.values(m.packages)) md += `| ${p.name} | ${p.version} | ${p.exportsCount} | ${p.sdkDependency ?? '—'} | ${p.tarball?.filename ?? '—'} | ${p.tarball?.bytes ?? '—'} | \`${p.tarball?.sha256 ?? '—'}\` | \`${p.tarball?.integrity ?? '—'}\` | ${p.tarball?.exportTargetsMissing ?? '—'} | ${p.tarball ? `${p.tarball.privacyHits} (+${p.tarball.privacyAllowlisted} allowlisted)` : '—'} |\n`;
  md += `\n## Lockfiles\n\n${m.lockfiles.files} lockfiles, ${m.lockfiles.registryEntries} registry entries, **${m.lockfiles.violations} violations** (denied: ${m.lockfiles.deniedPatterns.map((d) => `\`${d}\``).join(', ')}).${m.lockfiles.externalNpmCi ? ` External \`npm ci\`: \`${m.lockfiles.externalNpmCi.command}\` → exit ${m.lockfiles.externalNpmCi.exitCode}.` : ''}\n\n`;
  md += `## Tests\n\n${m.tests.source}: total ${m.tests.numTotalTests}; ${Object.entries(m.tests.byStatus).map(([k, v]) => `${v} ${k}`).join(', ')}; categories ${JSON.stringify(m.tests.byCategory)}; counts sum: **${m.tests.countsSum}**; unlisted: **${m.tests.unlistedTests}**; skipped files: ${m.tests.skippedFiles.join(', ') || 'none'}.\n\n`;
  md += `## Closure matrix\n\n**${m.closure.carried}/${m.closure.trackedItems} carried** (${m.closure.notCarried} not carried); **${m.closure.contentEvidencePresent} with code-level evidence**, ${m.closure.presenceOnly} presence-only; anchors present: ${m.closure.anchorPresent}.\n\n| ID | Anchor | Kind | Implementation symbol | Regression tests (defined / executed) | Carried | Content evidence |\n|---|---|---|---|---|---|---|\n`;
  for (const i of m.closure.items) md += `| ${i.id} | \`${String(i.anchor ?? '—').replace(/\|/g, '\\|')}\` in \`${i.anchorLocation ?? '—'}\` | ${i.anchorKind} | ${i.implementationSymbol ? `\`${i.implementationSymbol.symbol}\` in \`${i.implementationSymbol.file}\`` : '—'} | ${i.regressionTests.length ? i.regressionTests.map((t) => `${t.definedIn ? '✓' : '✗'}/${t.executedInCitedReport === null ? '?' : t.executedInCitedReport ? '✓' : '✗'} ${t.title.replace(/\|/g, '\\|')}`).join('<br>') : '—'} | ${i.carried ? 'yes' : 'NO'} | ${i.contentEvidencePresent ? 'yes' : i.presenceOnly ? 'presence-only' : 'NO'} |\n`;
  md += `\n## Behavioral evidence\n\n- Tree equality: ${m.behavioralEvidence.treeEquality.layersEqual}/${m.behavioralEvidence.treeEquality.layersChecked} layers equal (${m.behavioralEvidence.treeEquality.layersUnavailable} unavailable in this clone)\n- Cited CI run: ${m.behavioralEvidence.citedCiRun.url} at \`${m.behavioralEvidence.citedCiRun.headSha.slice(0, 8)}\` (matches target: ${m.behavioralEvidence.citedCiRun.matchesTarget})\n- Regression tests: ${m.behavioralEvidence.regressionTests.titlesDefinedInTree}/${m.behavioralEvidence.regressionTests.titlesCited} cited titles defined in the tree; ${m.behavioralEvidence.regressionTests.reportAvailable ? `${m.behavioralEvidence.regressionTests.titlesExecutedInReport} executed in the cited report` : 'no vitest report available to this generator (executed = unknown)'}\n\n`;
  if (m.comparison.baselineCommit) md += `## Comparison\n\nBaseline \`${m.comparison.baselineCommit.slice(0, 8)}\`${m.comparison.diffStat ? `: ${m.comparison.diffStat.raw}` : ''}. ${m.comparison.verdict ?? ''}\n\n${(m.comparison.firstParentCommits ?? []).map((c) => `- \`${c.sha.slice(0, 8)}\` ${c.subject}`).join('\n')}\n`;
  return md;
}

export function writeProvenance(outDir, manifestFile, manifest) {
  const bytes = readFileSync(manifestFile);
  const schemaBytes = Buffer.from(readFileSync(path.join(HERE, 'manifest.schema.json'), 'utf8').replace(/\r\n?/g, '\n'));
  const prov = {
    manifest: { file: path.basename(manifestFile), sha256: sha256(bytes), bytes: statSync(manifestFile).size },
    commit: manifest.target.commit, tree: manifest.target.tree, generatedAt: manifest.generatedAt,
    runUrl: manifest.ci.thisRun?.url ?? null,
    generatorScript: manifest.generator.script, generatorScriptSha256: manifest.generator.scriptSha256,
    schema: { file: 'manifest.schema.json', version: manifest.schemaVersion, sha256: sha256(schemaBytes) },
  };
  writeFileSync(path.join(outDir, 'provenance.json'), JSON.stringify(prov, null, 2) + '\n');
  writeFileSync(path.join(outDir, 'manifest.schema.json'), schemaBytes);
  return prov;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(arg('--out', 'evidence'));
  mkdirSync(outDir, { recursive: true });
  const manifest = buildManifest({ sha: arg('--sha'), evidenceDir: path.resolve(arg('--evidence', outDir)), vitestReport: arg('--vitest-report'), baseline: arg('--baseline'), baselineCommit: arg('--baseline-commit'), branch: arg('--branch'), citedConclusion: arg('--cited-conclusion') });
  const short = manifest.target.commit.slice(0, 8);
  const jsonFile = path.join(outDir, `squad-2.0-verification-manifest-${short}.json`);
  writeFileSync(jsonFile, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(path.join(outDir, `squad-2.0-verification-manifest-${short}.md`), renderMarkdown(manifest));
  const prov = writeProvenance(outDir, jsonFile, manifest);
  console.log(JSON.stringify({ manifest: jsonFile, commit: manifest.target.commit, tree: manifest.target.tree, closure: `${manifest.closure.carried}/${manifest.closure.trackedItems} carried, ${manifest.closure.contentEvidencePresent} content, ${manifest.closure.presenceOnly} presence-only`, layers: manifest.stack.allLayerTreesEqual, tests: manifest.tests.numTotalTests, unlisted: manifest.tests.unlistedTests, sha256: prov.manifest.sha256 }, null, 2));
}
