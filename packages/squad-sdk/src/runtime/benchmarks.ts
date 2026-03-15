/**
 * M6-11: Performance profiling & benchmarks
 * Provides benchmark utilities to measure Squad operation timings.
 *
 * @module runtime/benchmarks
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a single benchmark run.
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of iterations run */
  iterations: number;
  /** Average time in ms */
  avg: number;
  /** Minimum time in ms */
  min: number;
  /** Maximum time in ms */
  max: number;
  /** 95th percentile time in ms */
  p95: number;
  /** 99th percentile time in ms */
  p99: number;
}

/**
 * Timing summary returned by individual benchmark functions.
 */
export interface TimingResult {
  avg: number;
  min: number;
  max: number;
  p95: number;
}

/**
 * Full benchmark report returned by `runAll`.
 */
export interface BenchmarkReport {
  results: BenchmarkResult[];
  totalTime: number;
  timestamp: string;
}

/**
 * An async operation that can be benchmarked.
 */
export type BenchmarkFn = () => Promise<void> | void;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate percentile from a sorted array of numbers.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

/**
 * Measure the execution time of a function over N iterations and return stats.
 */
export async function measureIterations(
  fn: BenchmarkFn,
  iterations: number,
): Promise<{ avg: number; min: number; max: number; p95: number; p99: number; timings: number[] }> {
  if (iterations < 1) {
    throw new Error('Iterations must be at least 1');
  }

  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    timings.push(end - start);
  }

  timings.sort((a, b) => a - b);

  const sum = timings.reduce((a, b) => a + b, 0);
  return {
    avg: sum / timings.length,
    min: timings[0]!,
    max: timings[timings.length - 1]!,
    p95: percentile(timings, 95),
    p99: percentile(timings, 99),
    timings,
  };
}

// ============================================================================
// BenchmarkSuite
// ============================================================================

/**
 * Runs performance benchmarks on Squad operations.
 *
 * Usage:
 * ```ts
 * const suite = new BenchmarkSuite();
 * const report = await suite.runAll(100);
 * console.log(formatBenchmarkReport(report.results));
 * ```
 */
export class BenchmarkSuite {
  private benchmarks: Map<string, BenchmarkFn> = new Map();

  constructor() {
    // Register built-in benchmarks
    this.benchmarks.set('configLoad', () => this.configLoadOp());
    this.benchmarks.set('charterCompile', () => this.charterCompileOp());
    this.benchmarks.set('routing', () => this.routingOp());
    this.benchmarks.set('modelSelection', () => this.modelSelectionOp());
    this.benchmarks.set('exportImport', () => this.exportImportOp());
  }

  /**
   * Register a custom benchmark.
   */
  register(name: string, fn: BenchmarkFn): void {
    this.benchmarks.set(name, fn);
  }

  /**
   * Unregister a benchmark by name.
   */
  unregister(name: string): boolean {
    return this.benchmarks.delete(name);
  }

  /**
   * List all registered benchmark names.
   */
  list(): string[] {
    return [...this.benchmarks.keys()];
  }

  /**
   * Benchmark config loading.
   */
  async benchmarkConfigLoad(iterations: number): Promise<TimingResult> {
    const stats = await measureIterations(() => this.configLoadOp(), iterations);
    return { avg: stats.avg, min: stats.min, max: stats.max, p95: stats.p95 };
  }

  /**
   * Benchmark charter compilation.
   */
  async benchmarkCharterCompile(iterations: number): Promise<TimingResult> {
    const stats = await measureIterations(() => this.charterCompileOp(), iterations);
    return { avg: stats.avg, min: stats.min, max: stats.max, p95: stats.p95 };
  }

  /**
   * Benchmark routing operations.
   */
  async benchmarkRouting(iterations: number): Promise<TimingResult> {
    const stats = await measureIterations(() => this.routingOp(), iterations);
    return { avg: stats.avg, min: stats.min, max: stats.max, p95: stats.p95 };
  }

  /**
   * Benchmark model selection.
   */
  async benchmarkModelSelection(iterations: number): Promise<TimingResult> {
    const stats = await measureIterations(() => this.modelSelectionOp(), iterations);
    return { avg: stats.avg, min: stats.min, max: stats.max, p95: stats.p95 };
  }

  /**
   * Benchmark export/import round-trip.
   */
  async benchmarkExportImport(iterations: number): Promise<TimingResult> {
    const stats = await measureIterations(() => this.exportImportOp(), iterations);
    return { avg: stats.avg, min: stats.min, max: stats.max, p95: stats.p95 };
  }

  /**
   * Run all registered benchmarks and produce a full report.
   */
  async runAll(iterations: number = 100): Promise<BenchmarkReport> {
    const totalStart = performance.now();
    const results: BenchmarkResult[] = [];

    for (const [name, fn] of this.benchmarks) {
      const stats = await measureIterations(fn, iterations);
      results.push({
        name,
        iterations,
        avg: stats.avg,
        min: stats.min,
        max: stats.max,
        p95: stats.p95,
        p99: stats.p99,
      });
    }

    const totalTime = performance.now() - totalStart;

    return {
      results,
      totalTime,
      timestamp: new Date().toISOString(),
    };
  }

  // -- Internal operations simulating real Squad work --

  private configLoadOp(): void {
    // Simulate config parsing: build and validate a config-like object
    const config = {
      version: '1.0.0',
      models: { defaultModel: 'claude-sonnet-4.5', defaultTier: 'standard', fallbackChains: { premium: [], standard: [], fast: [] } },
      routing: { rules: [{ workType: 'feature-dev', agents: ['@coordinator'] }] },
    };
    JSON.parse(JSON.stringify(config));
  }

  private charterCompileOp(): void {
    // Simulate agent charter compilation from markdown
    const charter = `# Agent Charter\n\n## Role\nCore developer\n\n## Skills\n- TypeScript\n- Testing\n\n## Rules\n1. Follow conventions\n2. Write tests`;
    const lines = charter.split('\n');
    const sections: Record<string, string[]> = {};
    let current = '';
    for (const line of lines) {
      if (line.startsWith('## ')) {
        current = line.slice(3).trim().toLowerCase();
        sections[current] = [];
      } else if (current) {
        sections[current]!.push(line);
      }
    }
    JSON.stringify(sections);
  }

  private routingOp(): void {
    // Simulate routing rule evaluation
    const rules = [
      { workType: 'feature-dev', agents: ['fenster'], patterns: [/feature/i, /feat/i] },
      { workType: 'bug-fix', agents: ['kujan'], patterns: [/bug/i, /fix/i] },
      { workType: 'testing', agents: ['verbal'], patterns: [/test/i, /spec/i] },
      { workType: 'documentation', agents: ['mcmanus'], patterns: [/doc/i, /readme/i] },
    ];
    const input = 'Implement a new feature for the routing module';
    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(input)) break;
      }
    }
  }

  private modelSelectionOp(): void {
    // Simulate model selection logic
    const tiers = {
      premium: ['claude-opus-4.6', 'gpt-5.2'],
      standard: ['claude-sonnet-4.5', 'gpt-5.1-codex'],
      fast: ['claude-haiku-4.5', 'gpt-5-mini'],
    };
    const role = 'developer';
    const complexity = 7;
    const tier = complexity > 8 ? 'premium' : complexity > 4 ? 'standard' : 'fast';
    const models = tiers[tier as keyof typeof tiers];
    const _selected = models[0];
    void _selected;
    void role;
  }

  private exportImportOp(): void {
    // Simulate export → serialize → deserialize → import round-trip
    const bundle = {
      config: { version: '1.0.0', models: {}, routing: { rules: [] } },
      agents: [{ name: 'agent-1', role: 'developer', content: '# Agent' }],
      skills: ['typescript', 'testing'],
      routingRules: [{ pattern: 'feature/*', agent: 'agent-1' }],
      metadata: { version: '1.0.0', timestamp: new Date().toISOString(), source: 'test' },
    };
    const serialized = JSON.stringify(bundle);
    JSON.parse(serialized);
  }
}

// ============================================================================
// Report Formatting
// ============================================================================

/**
 * Format benchmark results as a terminal-formatted table.
 */
export function formatBenchmarkReport(results: BenchmarkResult[]): string {
  if (results.length === 0) {
    return 'No benchmark results to display.';
  }

  const COL_NAME = 24;
  const COL_NUM = 12;

  const header = [
    'Name'.padEnd(COL_NAME),
    'Iter'.padStart(COL_NUM),
    'Avg (ms)'.padStart(COL_NUM),
    'Min (ms)'.padStart(COL_NUM),
    'Max (ms)'.padStart(COL_NUM),
    'P95 (ms)'.padStart(COL_NUM),
    'P99 (ms)'.padStart(COL_NUM),
  ].join('  ');

  const separator = '─'.repeat(header.length);

  const rows = results.map((r) => {
    return [
      r.name.padEnd(COL_NAME),
      String(r.iterations).padStart(COL_NUM),
      r.avg.toFixed(3).padStart(COL_NUM),
      r.min.toFixed(3).padStart(COL_NUM),
      r.max.toFixed(3).padStart(COL_NUM),
      r.p95.toFixed(3).padStart(COL_NUM),
      r.p99.toFixed(3).padStart(COL_NUM),
    ].join('  ');
  });

  return [separator, header, separator, ...rows, separator].join('\n');
}
