#!/usr/bin/env node
/**
 * Render docs/src/content/docs/reference/host-feature-matrix.md from
 * test-fixtures/spec/suite-v0.2/host-feature-matrix.json.
 *
 * The JSON is the source of truth (hand-maintained, asserted by
 * test/squad-20-host-feature-matrix.test.ts). Re-run after editing it:
 *
 *   node scripts/render-host-feature-matrix.mjs            # write the page
 *   node scripts/render-host-feature-matrix.mjs --check    # exit 1 if the page is stale
 *   node scripts/render-host-feature-matrix.mjs --summary  # print per-host counts (for reports)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MATRIX_PATH = path.join(ROOT, 'test-fixtures', 'spec', 'suite-v0.2', 'host-feature-matrix.json');
export const PAGE_PATH = path.join(ROOT, 'docs', 'src', 'content', 'docs', 'reference', 'host-feature-matrix.md');

/** Capability axis: what the host can do. */
export const CAPABILITIES = ['supported', 'degraded', 'unsupported', 'n/a'];
/** Validation axis: how confident the capability claim is. */
export const VALIDATION_LEVELS = ['validated-live', 'validated-test', 'static-only', 'untested', 'blocked'];
const CAPABILITY_ICON = { supported: '✅', degraded: '⚠️', unsupported: '❌', 'n/a': '—' };
const VALIDATION_ICON = { 'validated-live': '🖥️', 'validated-test': '🧪', 'static-only': '📄', untested: '❔', blocked: '⛔' };

export function evidenceKind(entry) {
  return entry.split(':')[0];
}

/** True when the cell lists a recorded live run (`validated-manual:lab:…`) in its evidence. */
export function hasLiveRun(cell) {
  return cell.evidence.some((v) => evidenceKind(v) === 'validated-manual');
}

export function summarize(matrix) {
  const hosts = Object.keys(matrix.hosts);
  const out = {};
  for (const h of hosts) {
    const s = { supported: 0, degraded: 0, unsupported: 0, 'n/a': 0, 'validated-live': 0, 'validated-test': 0, 'static-only': 0, untested: 0, blocked: 0, expectedFailures: 0 };
    for (const f of matrix.features) {
      const c = f.cells[h];
      s[c.capability]++;
      s[c.validation]++;
      if (c.expectedFailure) s.expectedFailures++;
    }
    out[h] = s;
  }
  return out;
}

export function render(matrix) {
  const hosts = Object.keys(matrix.hosts);
  const lines = [];
  lines.push('---');
  lines.push('title: Host Feature Matrix');
  lines.push('description: Which Squad features work on which host (Copilot, Claude Code, Kiro, OpenCode, Cursor, Codex, Antigravity), what each depends on, and how each cell has been validated.');
  lines.push('order: 16');
  lines.push('---');
  lines.push('');
  lines.push('# Host Feature Matrix');
  lines.push('');
  lines.push('<!-- GENERATED from test-fixtures/spec/suite-v0.2/host-feature-matrix.json by scripts/render-host-feature-matrix.mjs. Edit the JSON, then re-run the script. -->');
  lines.push('');
  lines.push('> 🔗 Related: [Squad 2.0 Architecture](/squad/docs/concepts/squad-2-0-architecture/) · [Using Squad Across Clients](/squad/docs/scenarios/using-squad-across-clients/) · [Client Compatibility](/squad/docs/scenarios/client-compatibility/)');
  lines.push('');
  lines.push(`Squad features fall into five dependency classes. Features that depend only on the \`squad\` CLI (class **a**) behave identically everywhere because the host is not involved. Everything else depends on what the host's coordinator file contains, whether the \`squad_state\` MCP bridge is reachable, and what the host runtime can do. The machine-readable source is \`${path.relative(ROOT, MATRIX_PATH).replace(/\\/g, '/')}\` (protocol \`${matrix.protocol}\`).`);
  lines.push('');
  lines.push('## Dependency classes');
  lines.push('');
  lines.push('| Class | Depends on |');
  lines.push('|-------|------------|');
  for (const [k, v] of Object.entries(matrix.dependencyClasses)) lines.push(`| **${k}** | ${v} |`);
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('Every cell has two independent values. **Capability** says what the host can do; **validation** says how that claim was established. Neither implies the other: a `supported` cell may be only `static-only`, and an `unsupported` cell can be `validated-test` (a test proves the gap).');
  lines.push('');
  lines.push('| Capability | Meaning |');
  lines.push('|------------|---------|');
  for (const [k, v] of Object.entries(matrix.capabilities)) lines.push(`| ${CAPABILITY_ICON[k]} \`${k}\` | ${v} |`);
  lines.push('');
  lines.push('| Validation | Meaning |');
  lines.push('|------------|---------|');
  for (const [k, v] of Object.entries(matrix.validationLevels)) lines.push(`| ${VALIDATION_ICON[k]} \`${k}\` | ${v} |`);
  lines.push('');
  lines.push('| Evidence entry | Meaning |');
  lines.push('|----------------|---------|');
  for (const [k, v] of Object.entries(matrix.evidenceKinds)) lines.push(`| \`${k}\` | ${v} |`);
  lines.push('');
  lines.push('Each matrix cell shows **capability validation** (for example `✅ 🧪` = supported, covered by an automated test; `❌ 🧪` = unsupported, proven by an expected-failure test; `✅ 📄` = supported, statically inspected only; `✅ ⛔` = supported on paper, the live attempt for this host was blocked).');
  lines.push('');
  lines.push('## Hosts');
  lines.push('');
  lines.push('| Host | CLI | Coordinator file | MCP config | Subagents | Background | Per-spawn model | Subagents inherit MCP |');
  lines.push('|------|-----|------------------|------------|-----------|------------|-----------------|-----------------------|');
  for (const h of hosts) {
    const m = matrix.hosts[h];
    const yn = (b) => (b ? 'yes' : 'no');
    const cliNote = m.installedOnReferenceMachine ? (m.referenceMachineNote ? ` (${m.referenceMachineNote})` : '') : ' (not on the reference machine → static-only)';
    lines.push(`| **${m.name}** (\`${h}\`) | \`${m.cli}\`${cliNote} | ${m.coordinatorFile} | ${m.mcpConfig} | ${yn(m.runtime.subagents)} | ${yn(m.runtime.backgroundRuns)} | ${yn(m.runtime.perSpawnModel)} | ${yn(m.runtime.mcpInheritedBySubagents)} |`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const sum = summarize(matrix);
  lines.push('Capability counts and validation counts are independent breakdowns of the same cells (each row sums to the feature count twice).');
  lines.push('');
  lines.push('| Host | ✅ supported | ⚠️ degraded | ❌ unsupported | — n/a | 🖥️ validated-live | 🧪 validated-test | 📄 static-only | ❔ untested | ⛔ blocked | of which expected-failure gaps |');
  lines.push('|------|-------------|-------------|----------------|-------|-------------------|-------------------|----------------|------------|------------|--------------------------------|');
  for (const h of hosts) {
    const s = sum[h];
    lines.push(`| \`${h}\` | ${s.supported} | ${s.degraded} | ${s.unsupported} | ${s['n/a']} | ${s['validated-live']} | ${s['validated-test']} | ${s['static-only']} | ${s.untested} | ${s.blocked} | ${s.expectedFailures} |`);
  }
  lines.push('');
  if (Array.isArray(matrix.expectedFailures) && matrix.expectedFailures.length > 0) {
    lines.push('## Expected failures (`it.fails`)');
    lines.push('');
    lines.push('These digest gaps are pinned as expected failures, one test per host and gap: the `[<host>]` test turns red the moment a stack adds the section for that host. Until then the cell is **unsupported** for that host (validated by the failing test), never degraded or supported.');
    lines.push('');
    lines.push('| Feature | Test (title; each generated test appends the host as `[<host>]`) | Hosts | Meaning |');
    lines.push('|---------|-----------------------------|-------|---------|');
    for (const e of matrix.expectedFailures) {
      lines.push(`| [${e.featureId}](#${e.featureId}) | \`${e.test.replace(/\|/g, '\\|')}\` (${e.kind}${e.perHost ? ', per host' : ''}) | ${(e.hosts ?? []).map((h) => `\`${h}\``).join(' ')} | ${e.meaning} |`);
    }
    lines.push('');
  }
  if (Array.isArray(matrix.limitations) && matrix.limitations.length > 0) {
    lines.push('## Known limitations of this evidence');
    lines.push('');
    for (const l of matrix.limitations) lines.push(`- ${l}`);
    lines.push('');
  }
  lines.push('## Matrix');
  lines.push('');
  const areas = [...new Set(matrix.features.map((f) => f.area))];
  for (const area of areas) {
    lines.push(`### ${area}`);
    lines.push('');
    lines.push(`| Feature | Deps | ${hosts.map((h) => `\`${h}\``).join(' | ')} |`);
    lines.push(`|---------|------|${hosts.map(() => '---').join('|')}|`);
    for (const f of matrix.features.filter((x) => x.area === area)) {
      const cells = hosts.map((h) => {
        const c = f.cells[h];
        return `${CAPABILITY_ICON[c.capability]} ${VALIDATION_ICON[c.validation]}`;
      });
      lines.push(`| [${f.name.replace(/\|/g, '\\|')}](#${f.id}) | ${f.dependsOn.join(', ')}${f.hostIndependent ? ' (host-independent)' : ''} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push('## Per-feature detail');
  lines.push('');
  for (const f of matrix.features) {
    lines.push(`### ${f.id}`);
    lines.push('');
    lines.push(`**${f.name}**`);
    lines.push('');
    const docs = (f.docs ?? []).map((d) => `[${d}](/squad/docs/${d}/)`).join(' · ');
    const sections = f.canonicalSections?.length ? ` · canonical sections: ${f.canonicalSections.map((s) => `\`${s}\``).join(', ')}` : '';
    lines.push(`Depends on: **${f.dependsOn.join(', ')}**${f.hostIndependent ? ' (host-independent)' : ''}${docs ? ` · docs: ${docs}` : ''}${sections}`);
    lines.push('');
    lines.push('| Host | Capability | Validation | Mechanism | Evidence |');
    lines.push('|------|------------|------------|-----------|----------|');
    for (const h of hosts) {
      const c = f.cells[h];
      const notes = c.notes ? ` _${c.notes}_` : '';
      const flags = [c.expectedFailure ? ' (expected failure)' : '', c.blockedReason ? ` — ${c.blockedReason}` : ''].join('');
      const evidence = c.evidence.map((v) => `\`${v}\``).join('<br>') || '—';
      lines.push(`| \`${h}\` | ${CAPABILITY_ICON[c.capability]} ${c.capability} | ${VALIDATION_ICON[c.validation]} ${c.validation}${flags.replace(/\|/g, '\\|')} | ${c.mechanism.replace(/\|/g, '\\|')}${notes.replace(/\|/g, '\\|')} | ${evidence.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  if (matrix.liveRuns?.length) {
    lines.push('## Live run log');
    lines.push('');
    lines.push('Headless real-CLI runs behind the `validated-manual:lab:<scenario>` evidence entries above (only `pass`/`partial` runs raise a cell to `validated-live`). Each run drove the host\'s projected Squad coordinator against a real model in a throwaway repository; transcripts are kept outside the repository.');
    lines.push('');
    lines.push('| Date | Host | Scenario | Outcome | Observed tools | Notes |');
    lines.push('|------|------|----------|---------|----------------|-------|');
    const OUTCOME = { pass: '✅ pass', partial: '⚠️ partial', fail: '🔴 fail', blocked: '⛔ blocked' };
    for (const r of matrix.liveRuns) lines.push(`| ${r.date} | \`${r.host}\` | ${r.scenario} | ${OUTCOME[r.outcome] ?? r.outcome} | ${(r.observedTools ?? []).map((t) => `\`${t}\``).join(', ') || '—'} | ${(r.notes ?? '').replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  if (process.argv.includes('--summary')) {
    console.log(JSON.stringify(summarize(matrix), null, 2));
  } else if (process.argv.includes('--check')) {
    // Compare line-ending-insensitively (LF and CRLF checkouts both pass): autocrlf stores the page with CRLF.
    const expected = render(matrix).replace(/\r\n/g, '\n');
    const actual = (fs.existsSync(PAGE_PATH) ? fs.readFileSync(PAGE_PATH, 'utf8') : '').replace(/\r\n/g, '\n');
    if (expected !== actual) {
      console.error(`${path.relative(ROOT, PAGE_PATH)} is stale; run: node scripts/render-host-feature-matrix.mjs`);
      process.exit(1);
    }
    console.log('host-feature-matrix.md is up to date');
  } else {
    fs.writeFileSync(PAGE_PATH, render(matrix));
    console.log(`wrote ${path.relative(ROOT, PAGE_PATH)}`);
  }
}
