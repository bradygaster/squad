#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ARTIFACT_PATH = '.github/agents/squad.agent.md';
const TEMPLATE_PATH = '.squad-templates/squad.agent.md';
const BUDGET_PATH = '.github/size-budget.json';
const REPORT_PATH = 'size-guard-report.json';
const HEAD_CANARY = 'SQUAD_COORDINATOR_CANARY_HEAD_b7d2';
const EOF_CANARY = 'SQUAD_COORDINATOR_CANARY_a8f3';

const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const backtest = args.has('--backtest');

function bytesOf(text) {
  return Buffer.byteLength(text, 'utf8');
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function readText(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function tryReadText(path) {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
}

function countTokens(text) {
  const code = [
    'import sys',
    'import tiktoken',
    'enc = tiktoken.get_encoding("o200k_base")',
    'data = sys.stdin.read()',
    'print(len(enc.encode(data)))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', code], {
    input: text,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status === 0) {
    const parsed = Number(String(result.stdout).trim());
    if (Number.isFinite(parsed)) {
      return { count: parsed, encoding: 'o200k_base', estimate: false, method: 'python3+tiktoken' };
    }
  }
  return {
    count: Math.ceil(bytesOf(text) / 4),
    encoding: 'o200k_base',
    estimate: true,
    method: 'ceil(utf8_bytes/4)',
    note: 'python3+tiktoken unavailable; byte-based estimate only',
  };
}

function evaluateGoldens(text) {
  const lines = text.split(/\r?\n/);
  const headLine = lines.findIndex(line => line.includes(HEAD_CANARY)) + 1;
  const eofLine = lines.findIndex(line => line.includes(EOF_CANARY)) + 1;
  const lastNonEmpty = [...lines].reverse().find(line => line.trim().length > 0)?.trim() ?? '';
  const checks = [
    {
      id: 'head_canary_present',
      label: `HEAD canary ${HEAD_CANARY} present`,
      pass: text.includes(HEAD_CANARY),
      detail: headLine ? `line ${headLine}` : 'missing',
    },
    {
      id: 'head_canary_first_15_lines',
      label: 'HEAD canary within first 15 lines',
      pass: headLine > 0 && headLine <= 15,
      detail: headLine ? `line ${headLine}` : 'missing',
    },
    {
      id: 'eof_canary_present',
      label: `EOF canary ${EOF_CANARY} present`,
      pass: text.includes(EOF_CANARY),
      detail: eofLine ? `line ${eofLine}` : 'missing',
    },
    {
      id: 'eof_canary_last_non_empty_line',
      label: 'EOF canary on last non-empty line',
      pass: lastNonEmpty === `<!-- ${EOF_CANARY} -->`,
      detail: lastNonEmpty === `<!-- ${EOF_CANARY} -->` ? 'last non-empty line' : 'not last non-empty line',
    },
    {
      id: 'dispatch_stop_gate',
      label: 'Dispatch/STOP gate language present',
      pass: text.includes('**STOP gate:**') && text.includes('The coordinator ROUTES — it does not BUILD') && text.includes('MUST dispatch'),
      detail: 'checks STOP gate, ROUTES/does-not-BUILD, and dispatch-not-inline language',
    },
    {
      id: 'state_backend_handshake',
      label: 'STATE_BACKEND handshake language present',
      pass: text.includes('State-backend handshake — MANDATORY') && text.includes('STATE_BACKEND'),
      detail: 'stable string: State-backend handshake — MANDATORY',
    },
    {
      id: 'reviewer_lockout',
      label: 'Reviewer Rejection lockout language present',
      pass: text.includes('Reviewer Rejection Protocol') && text.includes('The original author is locked out.'),
      detail: 'stable strings: Reviewer Rejection Protocol / The original author is locked out.',
    },
    {
      id: 'mention_guard_and_cast_name',
      label: '@copilot auto-assign / cast-name `name` rule present',
      pass: text.includes('copilot-auto-assign: true/false') && text.includes('The `name` parameter MUST be the agent\'s lowercase cast name'),
      detail: 'stable strings: copilot-auto-assign: true/false / lowercase cast name',
    },
  ];
  const passed = checks.filter(check => check.pass).length;
  return { passed, failed: checks.length - passed, total: checks.length, checks };
}

function measureText(text, sourcePath = ARTIFACT_PATH) {
  return {
    path: sourcePath,
    bytes: bytesOf(text),
    chars: [...text].length,
    lines: countLines(text),
    tokens: countTokens(text),
    artifact_sha256: sha256(text),
    goldens: evaluateGoldens(text),
  };
}

function findSkillFiles(dir) {
  const files = [];
  const full = join(ROOT, dir);
  if (!existsSync(full)) return files;
  function walk(abs) {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name === 'SKILL.md') files.push(relative(ROOT, child));
    }
  }
  walk(full);
  return files;
}

function extractFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return undefined;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[0] : undefined;
}

function measureAlwaysLoadedSkillFrontmatter() {
  const skillFiles = [...findSkillFiles('.copilot/skills'), ...findSkillFiles('.squad/skills')];
  const alwaysOn = [];
  for (const path of skillFiles) {
    const text = readText(path);
    const frontmatter = extractFrontmatter(text);
    if (!frontmatter) continue;
    if (/always[-_ ]?(on|apply|loaded)\s*:\s*true/i.test(frontmatter)) {
      alwaysOn.push({ path, bytes: bytesOf(frontmatter) });
    }
  }
  if (alwaysOn.length === 0) {
    return {
      status: 'unavailable',
      bytes: 0,
      files: [],
      note: 'No always-on skill frontmatter marker was determinable locally; excluded from D2 rather than silently assuming zero.',
    };
  }
  return {
    status: 'measured',
    bytes: alwaysOn.reduce((sum, file) => sum + file.bytes, 0),
    files: alwaysOn,
  };
}

function measureSquadStateToolSchema() {
  const candidates = [
    'packages/squad-cli/src/cli/commands/state-mcp.ts',
    'packages/squad-cli/dist/cli/commands/state-mcp.js',
  ];
  const located = candidates.find(path => existsSync(join(ROOT, path)));
  return {
    status: 'unavailable',
    bytes: 0,
    located_source: located ?? null,
    note: located
      ? 'squad_state MCP schemas are assembled from the runtime ToolRegistry; static schema JSON was not locally extractable without importing project packages.'
      : 'No squad_state MCP source/schema file was located.',
  };
}

function computeD2(artifactBytes) {
  const skillFrontmatter = measureAlwaysLoadedSkillFrontmatter();
  const squadStateToolSchema = measureSquadStateToolSchema();
  const measuredAdditions = [skillFrontmatter, squadStateToolSchema]
    .filter(component => component.status === 'measured')
    .reduce((sum, component) => sum + component.bytes, 0);
  return {
    local_estimate_only: true,
    label: 'LOCAL-ESTIMATE-ONLY; does not subtract from any provider aggregate',
    total_bytes: artifactBytes + measuredAdditions,
    components: {
      artifact: { status: 'measured', bytes: artifactBytes, path: ARTIFACT_PATH },
      always_loaded_skill_frontmatter: skillFrontmatter,
      squad_state_tool_schema: squadStateToolSchema,
    },
  };
}

function readBudget() {
  const text = tryReadText(BUDGET_PATH);
  if (!text) return { status: 'missing', path: BUDGET_PATH };
  try {
    return { status: 'loaded', path: BUDGET_PATH, data: JSON.parse(text) };
  } catch (error) {
    return { status: 'invalid', path: BUDGET_PATH, error: error instanceof Error ? error.message : String(error) };
  }
}

function evaluateBudget(artifactBytes) {
  const budget = readBudget();
  if (budget.status !== 'loaded') return budget;
  const softCeiling = Number(budget.data.soft_ceiling_bytes);
  const grewBeyondSoftCeiling = Number.isFinite(softCeiling) && artifactBytes > softCeiling;
  const overrides = Array.isArray(budget.data.reviewed_overrides) ? budget.data.reviewed_overrides : [];
  const coveringOverride = overrides.find(entry => {
    const approvedBytes = Number(entry?.approved_bytes);
    return Number.isFinite(approvedBytes) && approvedBytes >= artifactBytes && entry?.reviewer && entry?.reason;
  });
  return {
    status: 'loaded',
    path: BUDGET_PATH,
    mode: budget.data.mode,
    soft_ceiling_bytes: softCeiling,
    grew_beyond_soft_ceiling: grewBeyondSoftCeiling,
    reviewed_override_covers_current_size: Boolean(coveringOverride),
    covering_override: coveringOverride ?? null,
    note: grewBeyondSoftCeiling
      ? (coveringOverride ? 'grew beyond soft ceiling; reviewed override covers current size' : 'grew beyond soft ceiling; no reviewed override covers current size')
      : 'within provisional soft ceiling',
  };
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function gitShowText(ref, paths) {
  for (const path of paths) {
    const result = spawnSync('git', ['show', `${ref}:${path}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status === 0) return { text: result.stdout, path };
  }
  return undefined;
}

function findSlimAnchor() {
  try {
    const log = git(['log', '--all', '--format=%H%x09%s']);
    const match = log.split('\n').find(line => /1308|slim squad\.agent/i.test(line));
    if (match) {
      const [sha, subject] = match.split('\t');
      return { ref: sha, label: '#1308 slim commit', note: subject };
    }
  } catch (error) {
    // Fall through to earliest reachable anchor.
  }
  const allCommits = git(['log', '--all', '--reverse', '--format=%H']).trim().split('\n').filter(Boolean);
  for (const sha of allCommits) {
    if (gitShowText(sha, [ARTIFACT_PATH, TEMPLATE_PATH])) {
      return { ref: sha, label: 'slim-era anchor fallback', note: 'Could not locate #1308; earliest reachable squad.agent.md used.' };
    }
  }
  return undefined;
}

function backtestReport() {
  const slim = findSlimAnchor();
  const refs = [];
  if (slim) refs.push(slim);
  else refs.push({ ref: null, label: '#1308 slim commit', note: 'unavailable: no reachable squad.agent.md history found' });
  refs.push({ ref: 'origin/dev', label: 'origin/dev', note: 'current mainline baseline' });
  refs.push({ ref: 'HEAD', label: 'HEAD', note: 'current branch working tree for HEAD artifact' });

  const rows = refs.map(entry => {
    if (entry.ref === null) return { ...entry, available: false };
    const content = entry.ref === 'HEAD'
      ? { text: readText(ARTIFACT_PATH), path: ARTIFACT_PATH }
      : gitShowText(entry.ref, [ARTIFACT_PATH, TEMPLATE_PATH]);
    if (!content) return { ...entry, available: false, note: `${entry.note}; artifact/template unavailable at ref` };
    const metrics = measureText(content.text, content.path);
    return {
      ...entry,
      available: true,
      source_path: content.path,
      short_ref: entry.ref === 'HEAD' || entry.ref === 'origin/dev' ? entry.ref : entry.ref.slice(0, 12),
      bytes: metrics.bytes,
      chars: metrics.chars,
      lines: metrics.lines,
      tokens: metrics.tokens,
      golden_passed: metrics.goldens.passed,
      golden_failed: metrics.goldens.failed,
      golden_total: metrics.goldens.total,
    };
  });

  return { mode: 'backtest', report_only: true, refs: rows };
}

function currentReport() {
  const artifact = readText(ARTIFACT_PATH);
  const template = tryReadText(TEMPLATE_PATH);
  const d1 = measureText(artifact, ARTIFACT_PATH);
  return {
    mode: 'current',
    report_only: true,
    generated_at: new Date().toISOString(),
    d1_artifact_ceiling: d1,
    d2_net_resident_startup_estimate: computeD2(d1.bytes),
    d3_governance_golden_regression: d1.goldens,
    d4_reviewed_override: evaluateBudget(d1.bytes),
    artifact_sha256: d1.artifact_sha256,
    template_sha256: template ? sha256(template) : null,
    template_path: TEMPLATE_PATH,
  };
}

function pad(value, width) {
  const string = String(value);
  return string.length >= width ? string : string + ' '.repeat(width - string.length);
}

function tokenText(tokens) {
  return `${tokens.count}${tokens.estimate ? ' est' : ''}`;
}

function renderBacktest(report) {
  const header = ['Ref', 'Bytes', 'Chars', 'Lines', 'Tokens', 'Goldens', 'Source'];
  const rows = report.refs.map(row => row.available
    ? [row.label, row.bytes, row.chars, row.lines, tokenText(row.tokens), `${row.golden_passed}/${row.golden_total} pass`, row.source_path]
    : [row.label, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', row.note ?? 'unavailable']);
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map(row => String(row[index]).length)));
  const lines = [
    'Size Regression Guard Backtest (REPORT-ONLY)',
    '',
    header.map((cell, index) => pad(cell, widths[index])).join(' | '),
    widths.map(width => '-'.repeat(width)).join('-|-'),
    ...rows.map(row => row.map((cell, index) => pad(cell, widths[index])).join(' | ')),
    '',
    'Note: older refs are expected to fail new canary goldens; this is historical signal, not an error.',
  ];
  return lines.join('\n');
}

function renderCurrent(report) {
  const d1 = report.d1_artifact_ceiling;
  const tokenSuffix = d1.tokens.estimate ? ' (estimate; python3+tiktoken unavailable)' : ' (o200k_base)';
  const d2 = report.d2_net_resident_startup_estimate;
  const d4 = report.d4_reviewed_override;
  return [
    'Size Regression Guard (REPORT-ONLY)',
    '',
    `D1 artifact: ${d1.bytes} bytes, ${d1.chars} chars, ${d1.lines} lines, ${d1.tokens.count} tokens${tokenSuffix}`,
    `D3 goldens: ${d1.goldens.passed}/${d1.goldens.total} pass (${d1.goldens.failed} fail)`,
    `D2 local estimate only: ${d2.total_bytes} bytes; skill frontmatter=${d2.components.always_loaded_skill_frontmatter.status}; squad_state schema=${d2.components.squad_state_tool_schema.status}`,
    `D4 budget: ${d4.status}${d4.status === 'loaded' ? `; soft_ceiling_bytes=${d4.soft_ceiling_bytes}; ${d4.note}` : ''}`,
    `artifact_sha256: ${report.artifact_sha256}`,
    `template_sha256: ${report.template_sha256 ?? 'unavailable'}`,
    '',
    'Governance goldens:',
    ...d1.goldens.checks.map(check => `- ${check.pass ? 'PASS' : 'FAIL'} ${check.id}: ${check.detail}`),
    '',
    `Machine-readable JSON written to ${REPORT_PATH}`,
  ].join('\n');
}

const report = backtest ? backtestReport() : currentReport();
if (!backtest) {
  writeFileSync(join(ROOT, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
}

if (jsonOnly) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${backtest ? renderBacktest(report) : renderCurrent(report)}\n`);
}

process.exit(0);
