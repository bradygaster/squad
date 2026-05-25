/**
 * Deterministic memory-value benchmark.
 *
 * This does not pretend to measure LLM quality directly. It measures the part
 * Squad can verify locally: whether governed memory retrieval reduces context
 * payload while preserving relevant facts and excluding stale or unsafe memory.
 */

export type MemoryValueStatus = 'active' | 'superseded' | 'deleted';
export type MemoryValueLoadGuidance = 'ALWAYS' | 'ON-DEMAND' | 'ARCHIVE' | 'NEVER';

export interface MemoryValueFact {
  id: string;
  title: string;
  content: string;
  loadGuidance: MemoryValueLoadGuidance;
  status: MemoryValueStatus;
  tags: string[];
}

export interface MemoryValueTask {
  id: string;
  query: string;
  expectedRelevantIds: string[];
  conflictingIds: string[];
}

export interface MemoryValueFixture {
  facts: MemoryValueFact[];
  tasks: MemoryValueTask[];
}

export interface MemoryValueTaskResult {
  taskId: string;
  baselineLoadedIds: string[];
  governedLoadedIds: string[];
  baselineContextBytes: number;
  governedContextBytes: number;
  baselinePrecision: number;
  governedPrecision: number;
  baselineRecall: number;
  governedRecall: number;
  baselineDecisionConsistent: boolean;
  governedDecisionConsistent: boolean;
}

export interface MemoryValueReport {
  taskResults: MemoryValueTaskResult[];
  baselineContextBytes: number;
  governedContextBytes: number;
  baselineEstimatedTokens: number;
  governedEstimatedTokens: number;
  contextReductionPercent: number;
  baselinePrecision: number;
  governedPrecision: number;
  baselineRecall: number;
  governedRecall: number;
  baselineDecisionConsistency: number;
  governedDecisionConsistency: number;
  staleOrUnsafeFactsAvoided: number;
  staleOrUnsafeFactsLoadedByBaseline: number;
  verdict: 'pass' | 'fail';
}

const TOKEN_BYTES = 4;

export function createDefaultMemoryValueFixture(): MemoryValueFixture {
  return {
    facts: [
      {
        id: 'policy-aspire-config',
        title: 'Aspire configuration convention',
        content: 'For Aspire-orchestrated samples, lead docs with Aspire-injected ConnectionStrings__X via WithReference/WithEnvironment.',
        loadGuidance: 'ALWAYS',
        status: 'active',
        tags: ['aspire', 'configuration', 'docs'],
      },
      {
        id: 'archive-raw-env-config',
        title: 'Old standalone environment variable guidance',
        content: 'Use raw environment variables first when documenting sample connection strings.',
        loadGuidance: 'ARCHIVE',
        status: 'superseded',
        tags: ['aspire', 'configuration', 'docs'],
      },
      {
        id: 'local-memory-diagnostics',
        title: 'Memory diagnostics',
        content: 'Memory command diagnostics go to stderr and can be enabled with memory.logLevel in .squad/config.json.',
        loadGuidance: 'ON-DEMAND',
        status: 'active',
        tags: ['memory', 'diagnostics', 'logging'],
      },
      {
        id: 'local-memory-governance',
        title: 'Memory governance safety',
        content: 'Governed memory writes classify facts, reject forbidden content, and keep audit records without raw secret values.',
        loadGuidance: 'ON-DEMAND',
        status: 'active',
        tags: ['memory', 'governance', 'security'],
      },
      {
        id: 'archive-ci-rotation',
        title: 'Old CI rotation status',
        content: 'CI rotation was green last week and does not require action.',
        loadGuidance: 'ARCHIVE',
        status: 'active',
        tags: ['ci', 'rotation', 'status'],
      },
      {
        id: 'never-secret',
        title: 'Rejected credential placeholder',
        content: 'Redacted credential-like placeholder used only to prove NEVER-load exclusion.',
        loadGuidance: 'NEVER',
        status: 'deleted',
        tags: ['security', 'secret'],
      },
      {
        id: 'policy-headed-browser',
        title: 'Browser automation policy',
        content: 'Run browser automation in headed mode unless explicitly asked otherwise.',
        loadGuidance: 'ALWAYS',
        status: 'active',
        tags: ['browser', 'playwright', 'automation'],
      },
      {
        id: 'local-teams-reporting',
        title: 'Teams reporting',
        content: 'Send concise Squad progress reports to Teams channel squad-chat when asked for updates.',
        loadGuidance: 'ON-DEMAND',
        status: 'active',
        tags: ['teams', 'reporting', 'communication'],
      },
    ],
    tasks: [
      {
        id: 'aspire-docs',
        query: 'How should an Aspire sample document connection string configuration?',
        expectedRelevantIds: ['policy-aspire-config'],
        conflictingIds: ['archive-raw-env-config'],
      },
      {
        id: 'memory-diagnostics',
        query: 'How do I turn on logging for memory commands in the Squad config file?',
        expectedRelevantIds: ['local-memory-diagnostics', 'local-memory-governance'],
        conflictingIds: ['never-secret'],
      },
      {
        id: 'browser-tests',
        query: 'Should browser automation tests run headed or headless?',
        expectedRelevantIds: ['policy-headed-browser'],
        conflictingIds: [],
      },
      {
        id: 'teams-update',
        query: 'Where should a nicely formatted Squad status report be sent?',
        expectedRelevantIds: ['local-teams-reporting'],
        conflictingIds: [],
      },
    ],
  };
}

export function runMemoryValueBenchmark(fixture = createDefaultMemoryValueFixture()): MemoryValueReport {
  const taskResults = fixture.tasks.map(task => evaluateTask(fixture.facts, task));
  const baselineContextBytes = sum(taskResults.map(result => result.baselineContextBytes));
  const governedContextBytes = sum(taskResults.map(result => result.governedContextBytes));
  const staleOrUnsafeFactsLoadedByBaseline = sum(
    taskResults.map(result => result.baselineLoadedIds.filter(id => isStaleOrUnsafe(fixture.facts, id)).length),
  );
  const staleOrUnsafeFactsAvoided = sum(
    taskResults.map(result => result.baselineLoadedIds.filter(id => (
      isStaleOrUnsafe(fixture.facts, id) && !result.governedLoadedIds.includes(id)
    )).length),
  );

  const report: MemoryValueReport = {
    taskResults,
    baselineContextBytes,
    governedContextBytes,
    baselineEstimatedTokens: estimateTokens(baselineContextBytes),
    governedEstimatedTokens: estimateTokens(governedContextBytes),
    contextReductionPercent: percentReduction(baselineContextBytes, governedContextBytes),
    baselinePrecision: average(taskResults.map(result => result.baselinePrecision)),
    governedPrecision: average(taskResults.map(result => result.governedPrecision)),
    baselineRecall: average(taskResults.map(result => result.baselineRecall)),
    governedRecall: average(taskResults.map(result => result.governedRecall)),
    baselineDecisionConsistency: average(taskResults.map(result => result.baselineDecisionConsistent ? 1 : 0)),
    governedDecisionConsistency: average(taskResults.map(result => result.governedDecisionConsistent ? 1 : 0)),
    staleOrUnsafeFactsAvoided,
    staleOrUnsafeFactsLoadedByBaseline,
    verdict: 'fail',
  };

  report.verdict = report.contextReductionPercent >= 50
    && report.governedRecall >= report.baselineRecall
    && report.governedPrecision > report.baselinePrecision
    && report.governedDecisionConsistency > report.baselineDecisionConsistency
    && report.staleOrUnsafeFactsAvoided > 0
    ? 'pass'
    : 'fail';

  return report;
}

export function formatMemoryValueReport(report: MemoryValueReport): string {
  return [
    'Memory value benchmark',
    '======================',
    `Verdict: ${report.verdict.toUpperCase()}`,
    `Context bytes: baseline=${report.baselineContextBytes}, governed=${report.governedContextBytes}`,
    `Estimated tokens: baseline=${report.baselineEstimatedTokens}, governed=${report.governedEstimatedTokens}`,
    `Context reduction: ${report.contextReductionPercent.toFixed(1)}%`,
    `Precision: baseline=${report.baselinePrecision.toFixed(2)}, governed=${report.governedPrecision.toFixed(2)}`,
    `Recall: baseline=${report.baselineRecall.toFixed(2)}, governed=${report.governedRecall.toFixed(2)}`,
    `Decision consistency: baseline=${report.baselineDecisionConsistency.toFixed(2)}, governed=${report.governedDecisionConsistency.toFixed(2)}`,
    `Stale/unsafe facts avoided: ${report.staleOrUnsafeFactsAvoided}/${report.staleOrUnsafeFactsLoadedByBaseline}`,
  ].join('\n');
}

function evaluateTask(facts: MemoryValueFact[], task: MemoryValueTask): MemoryValueTaskResult {
  const baseline = baselineLoad(facts);
  const governed = governedLoad(facts, task);
  const baselineLoadedIds = baseline.map(fact => fact.id);
  const governedLoadedIds = governed.map(fact => fact.id);

  return {
    taskId: task.id,
    baselineLoadedIds,
    governedLoadedIds,
    baselineContextBytes: contextBytes(baseline),
    governedContextBytes: contextBytes(governed),
    baselinePrecision: precision(baselineLoadedIds, task.expectedRelevantIds),
    governedPrecision: precision(governedLoadedIds, task.expectedRelevantIds),
    baselineRecall: recall(baselineLoadedIds, task.expectedRelevantIds),
    governedRecall: recall(governedLoadedIds, task.expectedRelevantIds),
    baselineDecisionConsistent: decisionConsistent(baselineLoadedIds, task),
    governedDecisionConsistent: decisionConsistent(governedLoadedIds, task),
  };
}

function baselineLoad(facts: MemoryValueFact[]): MemoryValueFact[] {
  return facts;
}

function governedLoad(facts: MemoryValueFact[], task: MemoryValueTask): MemoryValueFact[] {
  const always = facts.filter(fact => fact.status === 'active' && fact.loadGuidance === 'ALWAYS');
  const onDemand = facts
    .filter(fact => fact.status === 'active' && fact.loadGuidance === 'ON-DEMAND')
    .map(fact => ({ fact, score: relevanceScore(fact, task.query) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.fact.id.localeCompare(right.fact.id))
    .map(item => item.fact);

  return uniqueById([...always, ...onDemand]);
}

function relevanceScore(fact: MemoryValueFact, query: string): number {
  const queryTokens = tokenize(query);
  const factTokens = new Set(tokenize(`${fact.title} ${fact.content} ${fact.tags.join(' ')}`));
  return queryTokens.filter(token => factTokens.has(token)).length;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4);
}

function uniqueById(facts: MemoryValueFact[]): MemoryValueFact[] {
  const seen = new Set<string>();
  return facts.filter(fact => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

function contextBytes(facts: MemoryValueFact[]): number {
  return Buffer.byteLength(facts.map(fact => `${fact.title}\n${fact.content}`).join('\n\n'), 'utf8');
}

function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / TOKEN_BYTES);
}

function precision(loadedIds: string[], expectedRelevantIds: string[]): number {
  if (loadedIds.length === 0) return 0;
  const expected = new Set(expectedRelevantIds);
  return loadedIds.filter(id => expected.has(id)).length / loadedIds.length;
}

function recall(loadedIds: string[], expectedRelevantIds: string[]): number {
  if (expectedRelevantIds.length === 0) return 1;
  const loaded = new Set(loadedIds);
  return expectedRelevantIds.filter(id => loaded.has(id)).length / expectedRelevantIds.length;
}

function decisionConsistent(loadedIds: string[], task: MemoryValueTask): boolean {
  const loaded = new Set(loadedIds);
  return task.expectedRelevantIds.every(id => loaded.has(id))
    && task.conflictingIds.every(id => !loaded.has(id));
}

function isStaleOrUnsafe(facts: MemoryValueFact[], id: string): boolean {
  const fact = facts.find(item => item.id === id);
  return fact?.status !== 'active'
    || fact.loadGuidance === 'ARCHIVE'
    || fact.loadGuidance === 'NEVER';
}

function percentReduction(baseline: number, governed: number): number {
  if (baseline === 0) return 0;
  return ((baseline - governed) / baseline) * 100;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
