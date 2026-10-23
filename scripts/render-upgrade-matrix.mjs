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

/** Short provenance label for a row: npm / GitHub Release / local HEAD. */
export function provenanceLabel(source) {
  return source === 'npm' ? 'npm' : source === 'github-release' ? 'GitHub Release' : 'local HEAD (pack)';
}

/**
 * One cell. Vocabulary is deliberate: a row "passes" only when every non-xfail assertion passed;
 * a row with pinned findings is "pass WITH known … failure (F<n>)", never a bare pass.
 */
export function cell(result, matrix) {
  if (!result) return '—';
  if (result.status === 'skipped') return `⏭️ not applicable — ${esc(result.reason)}`;
  const known = pinnedFindings(result);
  const fails = result.checks.filter((c) => c.status === 'fail' || c.status === 'xpass').map((c) => `${c.id}${c.detail ? `: ${c.detail}` : ''}`);
  if (result.status === 'fail') return `🔴 fail — ${esc(fails.join('; ') || result.reason)}`;
  if (known.length) {
    const labels = known.map((id) => {
      const checks = [...new Set(result.checks.filter((c) => c.status === 'xfail').map((c) => c.id))];
      const f = (matrix?.findings ?? []).find((x) => x.id === id);
      const destructive = f && /destructive|mutat|rewrit/i.test(`${f.title} ${f.observed}`) ? 'destructive ' : '';
      return `${destructive}${checks.join('/')} failure (${id})`;
    });
    return `✅⚠️ pass WITH known ${labels.join(' and ')}`;
  }
  return '✅ pass';
}

export function summarize(matrix) {
  const out = {};
  for (const run of matrix.runs) {
    const s = {
      passedAllNonXfail: 0, withKnownFailures: 0, failed: 0, inapplicable: 0, knownFindings: new Set(),
      target: run.target, targetSha: run.targetSha, harnessHash: run.harnessHash, event: run.event, runUrl: run.runUrl, recordedAt: run.recordedAt, node: run.node, arch: run.arch,
    };
    for (const r of run.results) {
      if (r.status === 'pass') {
        s.passedAllNonXfail++;
        const k = pinnedFindings(r);
        if (k.length) { s.withKnownFailures++; k.forEach((id) => s.knownFindings.add(id)); }
      } else if (r.status === 'fail') s.failed++;
      else s.inapplicable++;
    }
    s.knownFindings = [...s.knownFindings].sort();
    out[run.platform] = s;
  }
  return out;
}

/** The one sentence a run summary must use (never "N pass / 0 fail" without the qualifier). */
export function summarySentence(s, matrix) {
  const findingLabel = (id) => {
    const f = (matrix?.findings ?? []).find((x) => x.id === id);
    return f ? `${id}: ${f.title.split(':')[0].replace(/`/g, '')}` : id;
  };
  const known = s.withKnownFailures
    ? `; ${s.withKnownFailures} of them carry a known expected failure (${s.knownFindings.map(findingLabel).join('; ')})`
    : '';
  return `${s.passedAllNonXfail} rows passed all non-xfail assertions${known}; ${s.failed} rows failed; ${s.inapplicable} rows are structurally inapplicable (listed below).`;
}

function artifactCell(p) {
  if (p.source === 'npm') {
    const reg = p.artifacts.registry;
    return Object.entries(reg).map(([n, a]) => `\`${n}@${a.version}\`<br>sha1 \`${a.shasum}\`<br>\`${a.integrity}\``).join('<br>');
  }
  if (p.source === 'github-release') {
    const rel = p.artifacts.release;
    return `[${rel.repository} ${rel.tag}](https://github.com/${rel.repository}/releases/tag/${rel.tag}) — assets by immutable id:<br>` +
      Object.entries(rel.assets).map(([n, a]) => `\`${n}\` id \`${a.id}\` sha256 \`${a.sha256}\``).join('<br>');
  }
  return esc(p.artifacts.pack);
}

export function renderSection(matrix) {
  const platforms = platformsOf(matrix);
  const sum = summarize(matrix);
  const lines = [];
  lines.push(START);
  lines.push('');
  lines.push('<!-- GENERATED from test-fixtures/spec/suite-v0.2/upgrade-matrix.json by scripts/render-upgrade-matrix.mjs. Edit the JSON (or merge new suite results), then re-run the script. -->');
  lines.push('');
  lines.push('## Tested upgrade paths');
  lines.push('');
  lines.push(`Every row below is a pinned, published artifact of an older Squad release driven through \`squad init\` under a given project state shape, then **upgraded** with the CLI packed from the tree under test (\`npm pack\` of \`@bradygaster/squad-sdk\` + \`@bradygaster/squad-cli\`) by \`test/squad-20-upgrade-matrix.test.ts\`. A row **passes** only when every non-xfail assertion passed; a row that carries a pinned finding is reported as **pass WITH known … failure (F<n>)**, never as a bare pass; **fail** names the failing checks; **not applicable** cells are each explained individually below (none means "not run"). Machine-readable source: \`${path.relative(ROOT, MATRIX_PATH).replace(/\\/g, '/')}\` (protocol \`${matrix.protocol}\`).`);
  lines.push('');
  lines.push('### Three different things');
  lines.push('');
  lines.push('| Term | Meaning |');
  lines.push('|------|---------|');
  for (const [k, v] of Object.entries(matrix.concepts)) lines.push(`| **${k}** | ${esc(v)} |`);
  lines.push('');
  lines.push('> ⚠️ **Never run an older Squad CLI against an upgraded repository.** There is no supported downgrade. The `downgrade-probe` rows record what each old CLI does: 0.9.1 `squad upgrade --dry-run` is **not trustworthy** — it rewrites the coordinator, skills, workflows and templates in place (F3); 0.13.1–1.1.0 preview overwriting them. If an old CLI has already touched an upgraded repository, re-run `squad upgrade` with the current CLI to repair the Squad-owned files; your `.squad/` team state is not changed by either direction. `uninstallClients()` removes host projections only — it is **not** a way back to an older Squad.');
  lines.push('');
  lines.push('### Runs');
  lines.push('');
  if (matrix.runs.length === 0) {
    lines.push('_No runs recorded yet. The CI workflow `squad-upgrade-matrix.yml` records a run per OS at the tree under test; fold both artifacts with `node scripts/render-upgrade-matrix.mjs --merge <results.json>`._');
    lines.push('');
  } else {
    const shas = [...new Set(matrix.runs.map((r) => r.targetSha))];
    const hashes = [...new Set(matrix.runs.map((r) => r.harnessHash))];
    lines.push(`All recorded runs executed against **one tree**, commit \`${shas.join('`, `')}\`, with harness hash \`${hashes.map((h) => h.slice(0, 16)).join('`, `')}…\` (sha256 over the suite, renderer, workflow, fs hook and this fixture minus \`runs\`; the integrity test refuses a recorded run whose harness differs from the committed one, so folding results may change nothing but the runs data).`);
    lines.push('');
    lines.push('| Platform | Arch | Node | Target | Tree (targetSha) | Trigger | Recorded | Outcome |');
    lines.push('|----------|------|------|--------|------------------|---------|----------|---------|');
    for (const run of matrix.runs) {
      const s = sum[run.platform];
      const trigger = run.runUrl ? `[${run.event}](${run.runUrl})` : run.event;
      lines.push(`| ${PLATFORM_LABEL[run.platform] ?? run.platform} (\`${run.platform}\`) | ${run.arch} | ${run.node} | v${run.target} | \`${run.targetSha.slice(0, 12)}\` | ${trigger} | ${run.recordedAt.slice(0, 10)} | ${esc(summarySentence(s, matrix))} |`);
    }
    lines.push('');
  }
  lines.push('### Producers (pinned, immutable provenance)');
  lines.push('');
  lines.push('| Version | Provenance | Artifact pins | Why it is in the matrix | `--state-backend` |');
  lines.push('|---------|------------|---------------|-------------------------|-------------------|');
  for (const p of matrix.producers) {
    lines.push(`| **${p.version}** | ${provenanceLabel(p.source)} | ${artifactCell(p)} | ${esc(p.why)} | ${p.supports.stateBackend ? 'yes' : 'no'} |`);
  }
  lines.push('');
  lines.push('npm tarballs are fetched by exact version through the registry npm is configured for and verified against the recorded sha1 + sha512 before use; GitHub Release bundles are downloaded by immutable asset id and verified against the recorded sha256. A verification mismatch **fails** the producer\'s rows (it is never a skip); only an unreachable registry/release yields a skip, and that skip carries the reason.');
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
  lines.push(`| Producer | Provenance | Shape | ${header.join(' | ')} |`);
  lines.push(`|----------|------------|-------|${header.map(() => '---').join('|')}|`);
  for (const p of matrix.producers) {
    for (const shape of Object.keys(matrix.shapes)) {
      const cells = platforms.length
        ? platforms.map((pl) => cell(resultFor(matrix.runs.find((r) => r.platform === pl), p.version, shape), matrix))
        : [inapplicableFor(matrix, p.version, shape) ? '⏭️ not applicable (see below)' : '—'];
      lines.push(`| **${p.version}** | ${provenanceLabel(p.source)} | \`${shape}\` | ${cells.join(' | ')} |`);
    }
  }
  lines.push('');
  lines.push('### Not-applicable cells, each explained');
  lines.push('');
  lines.push(`These ${matrix.inapplicable.length} cells are structurally impossible to exercise — the old producer cannot create that project shape — so they are **not** "not run"; the suite asserts the recorded skipped rows are exactly this list.`);
  lines.push('');
  lines.push('| Producer | Shape | Why it cannot apply |');
  lines.push('|----------|-------|---------------------|');
  for (const x of matrix.inapplicable) lines.push(`| **${x.producer}** | \`${x.shape}\` | ${esc(x.reason)} |`);
  lines.push('');
  if (matrix.expectedFailures.length) {
    lines.push('### Expected failures (pinned)');
    lines.push('');
    lines.push('Each pin names an open finding; the suite reports the check as `xfail` and **fails the moment it starts passing** (`xpass`), so a pin cannot outlive its bug.');
    lines.push('');
    lines.push('| Check | Producers | Shapes | Platforms | Finding |');
    lines.push('|-------|-----------|--------|-----------|---------|');
    for (const x of matrix.expectedFailures) {
      lines.push(`| \`${x.check}\` | ${x.producers === '*' ? 'all' : x.producers.join(', ')} | ${x.shapes === '*' ? 'all' : x.shapes.map((s) => `\`${s}\``).join(', ')} | ${x.platforms === '*' ? 'all' : x.platforms.join(', ')} | [${x.finding}](#${x.finding.toLowerCase()}) |`);
    }
    lines.push('');
  }
  lines.push('### Checks');
  lines.push('');
  lines.push('| Check | Meaning |');
  lines.push('|-------|---------|');
  for (const [id, d] of Object.entries(matrix.checks)) lines.push(`| \`${id}\` | ${esc(d)} |`);
  lines.push('');
  lines.push('Paths a plain `squad upgrade` may create or rewrite (the only changes `user-state-preserved` accepts):');
  lines.push('');
  for (const re of matrix.squadOwned) lines.push(`- \`${re}\``);
  lines.push('');
  if (matrix.findings.length) {
    lines.push('### Findings');
    lines.push('');
    lines.push('Real upgrade defects observed by the suite. An open finding is pinned as an expected failure until fixed (the fix lands in the layer named, not in this test-only layer); a resolved finding keeps its repro here so the matrix row that used to carry it documents the regression guard.');
    lines.push('');
    for (const f of matrix.findings) {
      lines.push(`#### ${f.id} — ${f.title}`);
      lines.push('');
      lines.push(`**Severity:** ${f.severity} · **Owner:** ${f.layer} · **Status:** ${f.resolved ? '✅ resolved' : '🔴 open'}`);
      lines.push('');
      lines.push('Repro:');
      lines.push('');
      for (const step of f.repro) lines.push(`1. ${step}`);
      lines.push('');
      lines.push(`Observed: ${f.observed}`);
      lines.push('');
      if (f.resolved) {
        lines.push(`Resolved: ${f.resolved}`);
        lines.push('');
      }
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
    lines.push('### Unsupported downgrade — what each old CLI does to an upgraded repository');
    lines.push('');
    lines.push('Recorded by the `downgrade-probe` check (dry-run on a copy; the only assertion is "modified nothing"). This is **not** a supported path — see the warning at the top of this section.');
    lines.push('');
    lines.push('| Platform | Producer | Shapes | Observed |');
    lines.push('|----------|----------|--------|----------|');
    for (const n of downgrade) lines.push(`| \`${n.platform}\` | ${n.producer} | ${n.shapes} | ${esc(n.note.replace(/^old [\w.]+ upgrade --dry-run on upgraded project: /, ''))} |`);
    lines.push('');
  }
  lines.push(END);
  return lines.join('\n') + '\n';
}

function inapplicableFor(matrix, producer, shape) {
  return matrix.inapplicable.find((x) => x.producer === producer && x.shape === shape);
}

export function extractSection(page) {
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  return page.slice(a, b + END.length) + '\n';
}

export function splice(page, section) {
  const existing = extractSection(page);
  if (existing) {
    const at = page.indexOf(existing);
    return page.slice(0, at) + section + page.slice(at + existing.length);
  }
  // First render: insert before "## Migrations".
  const anchor = page.indexOf('\n## Migrations');
  if (anchor === -1) return page.trimEnd() + '\n\n---\n\n' + section;
  return page.slice(0, anchor) + '\n' + section + '\n---\n' + page.slice(anchor);
}

export function mergeRun(matrix, run) {
  if (!run || typeof run.platform !== 'string' || !Array.isArray(run.results)) throw new Error('results file must contain {platform, results[]}');
  if (!/^[0-9a-f]{40}$/.test(run.targetSha ?? '') || !/^[0-9a-f]{64}$/.test(run.harnessHash ?? '')) throw new Error('results file must carry targetSha (40 hex) and harnessHash (64 hex) — produced by the suite, not hand-written');
  const known = new Set(matrix.producers.map((p) => p.version));
  for (const r of run.results) if (!known.has(r.producer)) throw new Error(`results reference unknown producer ${r.producer}`);
  const others = matrix.runs.filter((r) => r.platform !== run.platform);
  const foreign = others.find((r) => r.targetSha !== run.targetSha);
  if (foreign) throw new Error(`run for ${run.platform} targets ${run.targetSha} but the recorded ${foreign.platform} run targets ${foreign.targetSha}; all recorded runs must come from one tree — re-record every platform`);
  matrix.runs = [...others, run].sort((a, b) => a.platform.localeCompare(b.platform));
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
