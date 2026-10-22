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

const STATUS_ICON = { supported: '✅', degraded: '⚠️', unsupported: '❌', 'n/a': '—' };
const VALIDATION_ICON = { 'validated-test': '🧪', 'validated-manual': '🖥️', 'static-only': '📄', untested: '❔', failing: '🔴' };

export function validationKind(entry) {
  return entry.split(':')[0];
}

/** Strongest evidence wins: failing > validated-test > validated-manual > static-only > untested. */
export function cellEvidence(cell) {
  const kinds = new Set(cell.validation.map(validationKind));
  for (const k of ['failing', 'validated-test', 'validated-manual', 'static-only', 'untested']) if (kinds.has(k)) return k;
  return 'untested';
}

/** True when the cell still carries an `untested` marker (no live-host evidence yet), whatever else it has. */
export function hasLiveGap(cell) {
  return cell.validation.some((v) => validationKind(v) === 'untested');
}

export function summarize(matrix) {
  const hosts = Object.keys(matrix.hosts);
  const out = {};
  for (const h of hosts) {
    const s = { supported: 0, degraded: 0, unsupported: 0, 'n/a': 0, 'validated-test': 0, 'validated-manual': 0, 'static-only': 0, untested: 0, failing: 0, live: 0 };
    for (const f of matrix.features) {
      const c = f.cells[h];
      s[c.status]++;
      const e = cellEvidence(c);
      if (e !== 'untested') s[e]++;
      if (hasLiveGap(c)) s.untested++;
      if (c.validation.some((v) => validationKind(v) === 'validated-manual')) s.live++;
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
  lines.push('| Status | Meaning |');
  lines.push('|--------|---------|');
  for (const [k, v] of Object.entries(matrix.statuses)) lines.push(`| ${STATUS_ICON[k]} \`${k}\` | ${v} |`);
  lines.push('');
  lines.push('| Validation | Meaning |');
  lines.push('|------------|---------|');
  for (const [k, v] of Object.entries(matrix.validationKinds)) lines.push(`| ${VALIDATION_ICON[validationKind(k)]} \`${k}\` | ${v} |`);
  lines.push('');
  lines.push('Each cell below shows **status / strongest evidence**, plus ❔ when the cell still lacks any live-host run (e.g. `✅ 🧪` = supported and covered by an automated test; `✅ 🧪 ❔` = the projection is tested but the host has not been driven for real; `⚠️ 📄` = degraded, only statically inspected). The **❔ untested** column in the summary counts every cell that still carries that marker.');
  lines.push('');
  lines.push('## Hosts');
  lines.push('');
  lines.push('| Host | CLI | Coordinator file | MCP config | Subagents | Background | Per-spawn model | Subagents inherit MCP |');
  lines.push('|------|-----|------------------|------------|-----------|------------|-----------------|-----------------------|');
  for (const h of hosts) {
    const m = matrix.hosts[h];
    const yn = (b) => (b ? 'yes' : 'no');
    lines.push(`| **${m.name}** (\`${h}\`) | \`${m.cli}\`${m.installedOnReferenceMachine ? '' : ' (not on the reference machine → static-only)'} | ${m.coordinatorFile} | ${m.mcpConfig} | ${yn(m.runtime.subagents)} | ${yn(m.runtime.backgroundRuns)} | ${yn(m.runtime.perSpawnModel)} | ${yn(m.runtime.mcpInheritedBySubagents)} |`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const sum = summarize(matrix);
  lines.push('| Host | ✅ supported | ⚠️ degraded | ❌ unsupported | — n/a | 🧪 test | 🖥️ manual (strongest) | 📄 static | ❔ untested | 🔴 failing | 🖥️ live-validated cells |');
  lines.push('|------|-------------|-------------|----------------|-------|---------|------------------------|-----------|------------|------------|-------------------------|');
  for (const h of hosts) {
    const s = sum[h];
    lines.push(`| \`${h}\` | ${s.supported} | ${s.degraded} | ${s.unsupported} | ${s['n/a']} | ${s['validated-test']} | ${s['validated-manual']} | ${s['static-only']} | ${s.untested} | ${s.failing} | ${s.live} |`);
  }
  lines.push('');
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
        return `${STATUS_ICON[c.status]} ${VALIDATION_ICON[cellEvidence(c)]}${hasLiveGap(c) && cellEvidence(c) !== 'untested' ? ' ❔' : ''}`;
      });
      lines.push(`| [${f.name}](#${f.id}) | ${f.dependsOn.join(', ')}${f.hostIndependent ? ' (host-independent)' : ''} | ${cells.join(' | ')} |`);
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
    lines.push('| Host | Status | Mechanism | Validation |');
    lines.push('|------|--------|-----------|------------|');
    for (const h of hosts) {
      const c = f.cells[h];
      const notes = c.notes ? ` _${c.notes}_` : '';
      const validation = c.validation.map((v) => `\`${v}\``).join('<br>');
      lines.push(`| \`${h}\` | ${STATUS_ICON[c.status]} ${c.status} | ${c.mechanism.replace(/\|/g, '\\|')}${notes.replace(/\|/g, '\\|')} | ${validation.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  if (matrix.liveRuns?.length) {
    lines.push('## Live run log');
    lines.push('');
    lines.push('Headless real-CLI runs behind the `validated-manual:lab:<scenario>` entries above. Each run drove the host\'s projected Squad coordinator against a real model in a throwaway repository; transcripts are kept outside the repository.');
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
    const expected = render(matrix);
    const actual = fs.existsSync(PAGE_PATH) ? fs.readFileSync(PAGE_PATH, 'utf8') : '';
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
