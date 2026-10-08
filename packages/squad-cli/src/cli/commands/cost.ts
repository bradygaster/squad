import {
  resolveSquadState,
  UsageLedger,
  type StateBackend,
  type UsageLedgerRecord,
  type UsageLedgerTurnStart,
} from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';

interface CostArgs {
  showAll: boolean;
  agentFilter?: string;
}

interface CostEntry {
  agent: string;
  sessionId: string;
  turnId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  timestamp: string;
}

interface AgentTotals {
  agent: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  turns: number;
}

interface UsageCoverage {
  attemptedTurns: number;
  recordedTurns: number;
}

const TOKEN_USAGE_RE =
  /\|\s*\*\*Token usage\*\*\s*\|\s*([\d,]+)\s+in\s*\/\s*([\d,]+)\s+out\s*[—-]\s*\$([\d.,]+)\s*\|/i;
const AGENT_RE = /\|\s*\*\*Agent routed\*\*\s*\|\s*(.+?)\s*\|/i;
const SAFE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z/;

function parseArgs(args: string[]): CostArgs {
  const showAll = args.includes('--all');
  const agentIdx = args.indexOf('--agent');
  const agentFilter = agentIdx !== -1 ? args[agentIdx + 1]?.trim() : undefined;

  if (agentIdx !== -1 && !agentFilter) {
    fatal('Usage: squad cost [--all] [--agent <name>]');
  }

  return { showAll, agentFilter };
}

function extractTimestamp(fileName: string): string | null {
  return fileName.match(SAFE_TIMESTAMP_RE)?.[0] ?? null;
}

function extractAgent(agentCell: string): string {
  return agentCell.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function parseCostEntry(content: string, timestamp: string): CostEntry | null {
  const tokenMatch = content.match(TOKEN_USAGE_RE);
  const agentMatch = content.match(AGENT_RE);

  if (!tokenMatch || !agentMatch) {
    return null;
  }

  const agent = extractAgent(agentMatch[1] ?? '');
  const inputTokens = parseNumber(tokenMatch[1] ?? '0');
  const outputTokens = parseNumber(tokenMatch[2] ?? '0');
  const estimatedCost = Number((tokenMatch[3] ?? '0').replace(/,/g, ''));

  if (!agent || Number.isNaN(inputTokens) || Number.isNaN(outputTokens) || Number.isNaN(estimatedCost)) {
    return null;
  }

  return {
    agent,
    sessionId: timestamp,
    model: 'self-reported',
    inputTokens,
    outputTokens,
    estimatedCost,
    timestamp,
  };
}

function fromLedgerRecord(record: UsageLedgerRecord): CostEntry {
  return {
    agent: record.agentName ?? 'unknown',
    sessionId: record.sessionId,
    ...(record.turnId ? { turnId: record.turnId } : {}),
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    estimatedCost: record.estimatedCost,
    timestamp: record.timestamp,
  };
}

function parseTimestamp(value: string): number | null {
  const isoValue = value.match(SAFE_TIMESTAMP_RE)
    ? value.replace(
        /^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})Z/,
        '$1$2:$3:$4Z',
      )
    : value;
  const timestamp = Date.parse(isoValue);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortNewestFirst(entries: readonly string[]): string[] {
  return [...entries].sort((a, b) => b.localeCompare(a));
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function printCoverage(coverage: UsageCoverage): void {
  const percentage = coverage.attemptedTurns === 0
    ? 0
    : (coverage.recordedTurns / coverage.attemptedTurns) * 100;
  console.log(
    `  Coverage: ${coverage.recordedTurns} of ${coverage.attemptedTurns} turn attempt${coverage.attemptedTurns === 1 ? '' : 's'} with recorded usage (${percentage.toFixed(1)}%)`,
  );
}

function printNoData(coverage?: UsageCoverage, invalidRecordCount = 0): void {
  console.log('💰 No token usage data found.');
  console.log('   Structured usage is recorded after a runtime turn completes.');
  if (coverage && coverage.attemptedTurns > 0) {
    printCoverage(coverage);
  }
  if (invalidRecordCount > 0) {
    console.log(`  ⚠ Skipped ${invalidRecordCount} invalid usage ledger record${invalidRecordCount === 1 ? '' : 's'}.`);
  }
}

function printSummary(
  entries: CostEntry[],
  source: 'structured' | 'legacy',
  agentFilter?: string,
  invalidRecordCount = 0,
  coverage?: UsageCoverage,
): void {
  const totalsByAgent = new Map<string, AgentTotals>();

  for (const entry of entries) {
    const current = totalsByAgent.get(entry.agent) ?? {
      agent: entry.agent,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      turns: 0,
    };

    current.inputTokens += entry.inputTokens;
    current.outputTokens += entry.outputTokens;
    current.estimatedCost += entry.estimatedCost;
    current.turns += 1;
    totalsByAgent.set(entry.agent, current);
  }

  const rows = [...totalsByAgent.values()].sort((a, b) => b.estimatedCost - a.estimatedCost || a.agent.localeCompare(b.agent));
  const total = rows.reduce(
    (acc, row) => {
      acc.inputTokens += row.inputTokens;
      acc.outputTokens += row.outputTokens;
      acc.estimatedCost += row.estimatedCost;
      acc.turns += row.turns;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, estimatedCost: 0, turns: 0 },
  );

  const agentWidth = Math.max(
    'Agent'.length,
    'Total'.length,
    ...rows.map(row => row.agent.length),
  ) + 2;
  const inputWidth = Math.max('Input Tokens'.length, ...rows.map(row => formatInteger(row.inputTokens).length), formatInteger(total.inputTokens).length) + 2;
  const outputWidth = Math.max('Output Tokens'.length, ...rows.map(row => formatInteger(row.outputTokens).length), formatInteger(total.outputTokens).length) + 2;
  const costWidth = Math.max('Est. Cost'.length, ...rows.map(row => formatCost(row.estimatedCost).length), formatCost(total.estimatedCost).length) + 2;

  const divider = `  ${'─'.repeat(agentWidth)}${' '.repeat(2)}${'─'.repeat(inputWidth)}${' '.repeat(2)}${'─'.repeat(outputWidth)}${' '.repeat(2)}${'─'.repeat(costWidth)}`;
  const formatRow = (label: string, inputTokens: number, outputTokens: number, estimatedCost: number): string =>
    `  ${label.padEnd(agentWidth)}${formatInteger(inputTokens).padStart(inputWidth)}  ${formatInteger(outputTokens).padStart(outputWidth)}  ${formatCost(estimatedCost).padStart(costWidth)}`;

  console.log('💰 Squad Cost Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log(
    `  ${'Agent'.padEnd(agentWidth)}${'Input Tokens'.padStart(inputWidth)}  ${'Output Tokens'.padStart(outputWidth)}  ${'Est. Cost'.padStart(costWidth)}`,
  );
  console.log(divider);
  for (const row of rows) {
    console.log(formatRow(row.agent, row.inputTokens, row.outputTokens, row.estimatedCost));
  }
  console.log(divider);
  console.log(formatRow('Total', total.inputTokens, total.outputTokens, total.estimatedCost));
  console.log();

  const sessionCount = new Set(entries.map(entry => entry.sessionId)).size;
  const modelTotals = new Map<string, { turns: number; estimatedCost: number }>();
  for (const entry of entries) {
    const model = modelTotals.get(entry.model) ?? { turns: 0, estimatedCost: 0 };
    model.turns += 1;
    model.estimatedCost += entry.estimatedCost;
    modelTotals.set(entry.model, model);
  }

  const filterLabel = agentFilter ? ` for ${agentFilter}` : '';
  console.log(`  📊 ${rows.length} agent${rows.length === 1 ? '' : 's'} across ${total.turns} turn${total.turns === 1 ? '' : 's'} in ${sessionCount} session${sessionCount === 1 ? '' : 's'}${filterLabel}`);
  console.log(`  Models: ${[...modelTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([model, values]) => `${model} (${values.turns} turn${values.turns === 1 ? '' : 's'}, ${formatCost(values.estimatedCost)})`)
    .join(', ')}`);

  if (source === 'structured') {
    console.log('  Source: structured runtime usage ledger');
    if (coverage && coverage.attemptedTurns > 0) {
      printCoverage(coverage);
    }
    if (invalidRecordCount > 0) {
      console.log(`  ⚠ Skipped ${invalidRecordCount} invalid usage ledger record${invalidRecordCount === 1 ? '' : 's'}.`);
    }
  } else {
    console.log('  ⚠ Source: legacy self-reported orchestration logs; totals are estimates.');
  }
}

function listMarkdownFiles(backend: StateBackend, dir: string): string[] {
  return backend.list(dir).filter(entry => entry.endsWith('.md'));
}

function getCurrentSessionCutoff(backend: StateBackend): number | null {
  try {
    const logFiles = sortNewestFirst(listMarkdownFiles(backend, 'log'));
    for (const file of logFiles) {
      const timestamp = extractTimestamp(file);
      if (timestamp) {
        return parseTimestamp(timestamp);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function matchesScope(
  record: Pick<UsageLedgerRecord | UsageLedgerTurnStart, 'agentName' | 'timestamp'>,
  cutoffTimestamp: number | null,
  agentFilter?: string,
): boolean {
  const timestamp = parseTimestamp(record.timestamp);
  return timestamp !== null
    && (cutoffTimestamp === null || timestamp > cutoffTimestamp)
    && (!agentFilter || (record.agentName ?? 'unknown').toLowerCase() === agentFilter.toLowerCase());
}

function calculateCoverage(entries: CostEntry[], turnStarts: UsageLedgerTurnStart[]): UsageCoverage {
  const attemptedTurnIds = new Set(turnStarts.map(turn => turn.turnId));
  const recordedTurnIds = new Set(
    entries
      .map(entry => entry.turnId)
      .filter((turnId): turnId is string =>
        typeof turnId === 'string' && attemptedTurnIds.has(turnId)),
  );
  return {
    attemptedTurns: attemptedTurnIds.size,
    recordedTurns: recordedTurnIds.size,
  };
}

async function readStructuredEntries(
  backend: StateBackend,
  cutoffTimestamp: number | null,
  agentFilter?: string,
): Promise<{ entries: CostEntry[]; coverage: UsageCoverage; invalidRecordCount: number }> {
  const result = await new UsageLedger(backend).read();
  const entries = result.records
    .filter(record => matchesScope(record, cutoffTimestamp, agentFilter))
    .map(fromLedgerRecord);
  const turnStarts = result.turnStarts.filter(record => matchesScope(record, cutoffTimestamp, agentFilter));

  return {
    entries,
    coverage: calculateCoverage(entries, turnStarts),
    invalidRecordCount: result.invalidRecordCount,
  };
}

function readLegacyEntries(
  backend: StateBackend,
  cutoffTimestamp: number | null,
  agentFilter?: string,
): CostEntry[] {
  let files: string[];
  try {
    files = sortNewestFirst(listMarkdownFiles(backend, 'orchestration-log'));
  } catch {
    return [];
  }

  const entries: CostEntry[] = [];
  for (const file of files) {
    const timestamp = extractTimestamp(file);
    const parsedTimestamp = timestamp ? parseTimestamp(timestamp) : null;
    if (!timestamp || parsedTimestamp === null || (cutoffTimestamp !== null && parsedTimestamp <= cutoffTimestamp)) {
      continue;
    }

    const content = backend.read(`orchestration-log/${file}`);
    if (!content) continue;
    const parsed = parseCostEntry(content, timestamp);
    if (!parsed || (agentFilter && parsed.agent.toLowerCase() !== agentFilter.toLowerCase())) {
      continue;
    }
    entries.push(parsed);
  }

  return entries;
}

export async function runCost(args: string[], teamRoot: string): Promise<void> {
  const { showAll, agentFilter } = parseArgs(args);
  const stateContext = resolveSquadState(teamRoot);
  if (!stateContext) {
    printNoData();
    return;
  }

  const cutoffTimestamp = showAll ? null : getCurrentSessionCutoff(stateContext.backend);
  const structured = await readStructuredEntries(stateContext.backend, cutoffTimestamp, agentFilter);
  if (structured.entries.length > 0) {
    printSummary(
      structured.entries,
      'structured',
      agentFilter,
      structured.invalidRecordCount,
      structured.coverage,
    );
    return;
  }

  if (structured.coverage.attemptedTurns > 0) {
    printNoData(structured.coverage, structured.invalidRecordCount);
    return;
  }

  const legacyEntries = readLegacyEntries(stateContext.backend, cutoffTimestamp, agentFilter);
  if (legacyEntries.length > 0) {
    printSummary(legacyEntries, 'legacy', agentFilter);
    return;
  }

  printNoData(undefined, structured.invalidRecordCount);
}
