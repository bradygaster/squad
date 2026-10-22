#!/usr/bin/env node
/**
 * Render the "Tested upgrade paths" section of
 * docs/src/content/docs/scenarios/upgrading.md from
 * test-fixtures/spec/suite-v0.2/upgrade-matrix.json, and fold suite results into that JSON.
 *
 * The JSON is the source of truth (runs are produced by test/squad-20-upgrade-matrix.test.ts
 * with SQUAD_UPGRADE_MATRIX=1; findings/expectedFailures are hand-maintained).
 *
 *   node scripts/render-upgrade-matrix.mjs                        # rewrite the docs section
 *   node scripts/render-upgrade-matrix.mjs --check                # exit 1 if the docs section is stale
 *   node scripts/render-upgrade-matrix.mjs --merge results.json   # replace the run for that platform, then render
 *   node scripts/render-upgrade-matrix.mjs --summary              # per-platform counts (for reports)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MATRIX_PATH = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'upgrade-matrix.json');
export const PAGE_PATH = path.join(ROOT, 'docs', 'src', 'content', 'docs', 'scenarios', 'upgrading.md');
export const START = '<!-- UPGRADE-MATRIX:START -->';
export const END = '<!-- UPGRADE-MATRIX:END -->';

const PLATFORM_LABEL = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };
const STATUS_ICON = { pass: '✅', fail: '🔴', skipped: '⏭️' };

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function platformsOf(matrix) {
  return [...new Set(matrix.runs.map((r) => r.platform))].sort();
}

function resultFor(run, producer, shape) {
  return run?.results.find((r) => r.producer === producer && r.shape === shape) ?? null;
}

/** Finding ids pinned on this result (recorded by the suite as notes `"<check>: F<n>"`). */
export function pinnedFindings(result) {
  const ids = new Set();
  for (const n of result.notes ?? []) {
    const m = /^[\w-]+: (F\d+)$/.exec(n);
    if (m) ids.add(m[1]);
  }
  for (const c of result.checks) if (c.status === 'xfail' && /^F\d+$/.test(c.detail ?? '')) ids.add(c.detail);
  return [...ids].sort();
}

/** One cell: status icon + pinned finding ids, or failing checks, or the skip reason. */
export function cell(result) {
  if (!result) return '—';
  if (result.status === 'skipped') return `${STATUS_ICON.skipped} skipped (${esc(result.reason)})`;
  const known = pinnedFindings(result);
  const fails = result.checks.filter((c) => c.status === 'fail' || c.status === 'xpass').map((c) => `${c.id}${c.detail ? `: ${c.detail}` : ''}`);
  const parts = [`${STATUS_ICON[result.status]} ${result.status}`];
  if (known.length) parts.push(`⚠️ known ${known.join(', ')}`);
  if (fails.length) parts.push(esc(fails.join('; ')));
  return parts.join(' ');
}

export function summarize(matrix) {
  const out = {};
  for (const run of matrix.runs) {
    const s = { pass: 0, fail: 0, skipped: 0, xfail: 0, target: run.target, commit: run.commit, recordedAt: run.recordedAt, node: run.node };
    for (const r of run.results) {
      s[r.status]++;
      if (r.checks.some((c) => c.status === 'xfail')) s.xfail++;
    }
    out[run.platform] = s;
  }
  return out;
}

export function renderSection(matrix) {
  const platforms = platformsOf(matrix);
  const lines = [];
  lines.push(START);
  lines.push('');
  lines.push('<!-- GENERATED from test-fixtures/spec/suite-v0.2/upgrade-matrix.json by scripts/render-upgrade-matrix.mjs. Edit the JSON (or merge new suite results), then re-run the script. -->');
  lines.push('');
  lines.push('## Tested upgrade paths');
  lines.push('');
  lines.push(`Every row below is a real published artifact of an older Squad release driven through \`squad init\` under a given project state shape, then upgraded with the CLI packed from the current tree (\`npm pack\` of \`@bradygaster/squad-sdk\` + \`@bradygaster/squad-cli\`) by \`test/squad-20-upgrade-matrix.test.ts\`. Statuses are honest: **pass** means every check passed, **fail** lists the failing checks, **skipped** carries the reason (the suite never silently passes a producer it could not obtain). ⚠️ *known* marks checks pinned to a recorded finding below (\`xfail\`); the suite fails the moment a pinned check starts passing so the pin cannot go stale. Machine-readable source: \`${path.relative(ROOT, MATRIX_PATH).replace(/\\/g, '/')}\` (protocol \`${matrix.protocol}\`).`);
  lines.push('');
  lines.push('### Runs');
  lines.push('');
  if (matrix.runs.length === 0) {
    lines.push('_No runs recorded yet. Run `SQUAD_UPGRADE_MATRIX=1 npx vitest run test/squad-20-upgrade-matrix.test.ts` and merge the results with `node scripts/render-upgrade-matrix.mjs --merge <results.json>`._');
    lines.push('');
  } else {
    lines.push('| Platform | Arch | Node | Target | Commit | Recorded | ✅ pass | 🔴 fail | ⏭️ skipped | ⚠️ with known findings |');
    lines.push('|----------|------|------|--------|--------|----------|---------|---------|-----------|------------------------|');
    const sum = summarize(matrix);
    for (const run of matrix.runs) {
      const s = sum[run.platform];
      lines.push(`| ${PLATFORM_LABEL[run.platform] ?? run.platform} (\`${run.platform}\`) | ${run.arch} | ${run.node} | v${run.target} | \`${run.commit}\` | ${run.recordedAt.slice(0, 10)} | ${s.pass} | ${s.fail} | ${s.skipped} | ${s.xfail} |`);
    }
    lines.push('');
  }
  lines.push('### Producers');
  lines.push('');
  lines.push('| Version | Artifact | Why it is in the matrix | `--state-backend` |');
  lines.push('|---------|----------|-------------------------|-------------------|');
  for (const p of matrix.producers) {
    const artifact = p.source === 'npm' ? 'npm tarball (`@bradygaster/squad-cli`)' : p.source === 'github-release' ? 'GitHub Release standalone bundle' : 'packed from this tree';
    lines.push(`| **${p.version}** | ${artifact} | ${esc(p.why)} | ${p.supports.stateBackend ? 'yes' : 'no'} |`);
  }
  lines.push('');
  lines.push('### State shapes');
  lines.push('');
  lines.push('| Shape | Setup |');
  lines.push('|-------|-------|');
  for (const [id, d] of Object.entries(matrix.shapes)) lines.push(`| \`${id}\` | ${esc(d)} |`);
  lines.push('');
  lines.push('### Results (version × shape × OS)');
  lines.push('');
  const header = platforms.length ? platforms.map((p) => PLATFORM_LABEL[p] ?? p) : ['(no runs yet)'];
  lines.push(`| Producer | Shape | ${header.join(' | ')} |`);
  lines.push(`|----------|-------|${header.map(() => '---').join('|')}|`);
  for (const p of matrix.producers) {
    for (const shape of Object.keys(matrix.shapes)) {
      const cells = platforms.length
        ? platforms.map((pl) => cell(resultFor(matrix.runs.find((r) => r.platform === pl), p.version, shape)))
        : ['—'];
      lines.push(`| **${p.version}** | \`${shape}\` | ${cells.join(' | ')} |`);
    }
  }
  lines.push('');
  lines.push('### Checks');
  lines.push('');
  lines.push('| Check | Meaning |');
  lines.push('|-------|---------|');
  for (const [id, d] of Object.entries(matrix.checks)) lines.push(`| \`${id}\` | ${esc(d)} |`);
  lines.push('');
  if (matrix.findings.length) {
    lines.push('### Findings');
    lines.push('');
    lines.push('Real upgrade defects observed by the suite. Each is pinned as an expected failure until fixed; the fix lands in the layer named, not in this test-only layer.');
    lines.push('');
    for (const f of matrix.findings) {
      lines.push(`#### ${f.id} — ${f.title}`);
      lines.push('');
      lines.push(`**Severity:** ${f.severity} · **Owner:** ${f.layer}`);
      lines.push('');
      lines.push('Repro:');
      lines.push('');
      for (const step of f.repro) lines.push(`1. ${step}`);
      lines.push('');
      lines.push(`Observed: ${f.observed}`);
      lines.push('');
      const pins = matrix.expectedFailures.filter((x) => x.finding === f.id);
      if (pins.length) {
        lines.push(`Pinned checks: ${pins.map((x) => `\`${x.check}\` (${x.producers === '*' ? 'all producers' : x.producers.join(', ')} × ${x.shapes === '*' ? 'all shapes' : x.shapes.join(', ')} × ${x.platforms === '*' ? 'all platforms' : x.platforms.join(', ')})`).join('; ')}.`);
        lines.push('');
      }
    }
  }
  const downgrade = [];
  for (const run of matrix.runs) {
    for (const p of matrix.producers) {
      const withNote = run.results.filter((r) => r.producer === p.version && (r.notes ?? []).some((n) => /upgrade --dry-run on upgraded project/.test(n)));
      const pick = withNote.find((r) => r.shape === 'default') ?? withNote[0];
      if (!pick) continue;
      const note = pick.notes.find((n) => /upgrade --dry-run on upgraded project/.test(n));
      const sameEverywhere = withNote.every((r) => r.notes.find((n) => /upgrade --dry-run on upgraded project/.test(n)) === note);
      downgrade.push({ platform: run.platform, producer: p.version, shapes: sameEverywhere ? `all ${withNote.length} shapes` : `\`${pick.shape}\``, note });
    }
  }
  if (downgrade.length) {
    lines.push('### Downgrade behavior (old CLI against an upgraded project)');
    lines.push('');
    lines.push('Recorded, not asserted beyond "the dry-run modified nothing": what each old CLI does when pointed at a project that is already on the new version.');
    lines.push('');
    lines.push('| Platform | Producer | Shapes | Observed |');
    lines.push('|----------|----------|--------|----------|');
    for (const n of downgrade) lines.push(`| \`${n.platform}\` | ${n.producer} | ${n.shapes} | ${esc(n.note.replace(/^old [\w.]+ upgrade --dry-run on upgraded project: /, ''))} |`);
    lines.push('');
  }
  lines.push(END);
  return lines.join('\n') + '\n';
}

export function extractSection(page) {
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  return page.slice(a, b + END.length) + '\n';
}

export function splice(page, section) {
  const existing = extractSection(page);
  if (existing) return page.replace(existing, section);
  // First render: insert before "## Migrations".
  const anchor = page.indexOf('\n## Migrations');
  if (anchor === -1) return page.trimEnd() + '\n\n---\n\n' + section;
  return page.slice(0, anchor) + '\n' + section + '\n---\n' + page.slice(anchor);
}

export function mergeRun(matrix, run) {
  if (!run || typeof run.platform !== 'string' || !Array.isArray(run.results)) throw new Error('results file must contain {platform, results[]}');
  const known = new Set(matrix.producers.map((p) => p.version));
  for (const r of run.results) if (!known.has(r.producer)) throw new Error(`results reference unknown producer ${r.producer}`);
  matrix.runs = matrix.runs.filter((r) => r.platform !== run.platform);
  matrix.runs.push(run);
  matrix.runs.sort((a, b) => a.platform.localeCompare(b.platform));
  return matrix;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const args = process.argv.slice(2);
  const mergeIdx = args.indexOf('--merge');
  if (mergeIdx !== -1) {
    const file = args[mergeIdx + 1];
    if (!file) { console.error('--merge requires a results file'); process.exit(2); }
    mergeRun(matrix, JSON.parse(fs.readFileSync(file, 'utf8')));
    fs.writeFileSync(MATRIX_PATH, JSON.stringify(matrix, null, 2) + '\n');
    console.log(`merged ${file} into ${path.relative(ROOT, MATRIX_PATH)}`);
  }
  if (args.includes('--summary')) {
    console.log(JSON.stringify(summarize(matrix), null, 2));
  } else if (args.includes('--check')) {
    const expected = renderSection(matrix).replace(/\r\n/g, '\n');
    const page = (fs.existsSync(PAGE_PATH) ? fs.readFileSync(PAGE_PATH, 'utf8') : '').replace(/\r\n/g, '\n');
    const actual = extractSection(page);
    if (expected !== actual) {
      console.error(`${path.relative(ROOT, PAGE_PATH)} upgrade-matrix section is stale; run: node scripts/render-upgrade-matrix.mjs`);
      process.exit(1);
    }
    console.log('upgrading.md upgrade-matrix section is up to date');
  } else {
    const page = fs.readFileSync(PAGE_PATH, 'utf8');
    const eol = page.includes('\r\n') ? '\r\n' : '\n';
    const next = splice(page.replace(/\r\n/g, '\n'), renderSection(matrix)).replace(/\n/g, eol);
    fs.writeFileSync(PAGE_PATH, next);
    console.log(`wrote ${path.relative(ROOT, PAGE_PATH)}`);
  }
}
