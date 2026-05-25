import { describe, expect, it } from 'vitest';
import {
  createDefaultMemoryValueFixture,
  formatMemoryValueReport,
  runMemoryValueBenchmark,
} from '../packages/squad-sdk/src/runtime/memory-value-benchmark.js';

describe('memory value benchmark', () => {
  it('shows governed memory reducing context while preserving relevant facts', () => {
    const report = runMemoryValueBenchmark();

    expect(report.verdict).toBe('pass');
    expect(report.contextReductionPercent).toBeGreaterThanOrEqual(50);
    expect(report.governedEstimatedTokens).toBeLessThan(report.baselineEstimatedTokens);
    expect(report.governedRecall).toBeGreaterThanOrEqual(report.baselineRecall);
    expect(report.governedPrecision).toBeGreaterThan(report.baselinePrecision);
    expect(report.governedDecisionConsistency).toBeGreaterThan(report.baselineDecisionConsistency);
    expect(report.staleOrUnsafeFactsAvoided).toBe(report.staleOrUnsafeFactsLoadedByBaseline);
  });

  it('excludes archived, deleted, and never-load facts from governed task context', () => {
    const fixture = createDefaultMemoryValueFixture();
    const report = runMemoryValueBenchmark(fixture);
    const staleOrUnsafeIds = fixture.facts
      .filter(fact => fact.status !== 'active' || fact.loadGuidance === 'ARCHIVE' || fact.loadGuidance === 'NEVER')
      .map(fact => fact.id);

    for (const taskResult of report.taskResults) {
      expect(taskResult.governedLoadedIds.some(id => staleOrUnsafeIds.includes(id))).toBe(false);
    }
  });

  it('formats a human-readable report with the core measurement fields', () => {
    const output = formatMemoryValueReport(runMemoryValueBenchmark());

    expect(output).toContain('Memory value benchmark');
    expect(output).toContain('Verdict: PASS');
    expect(output).toContain('Context reduction:');
    expect(output).toContain('Decision consistency:');
    expect(output).toContain('Stale/unsafe facts avoided:');
  });

  it('keeps benchmark output free of raw secret-shaped fixture values', () => {
    const fixture = createDefaultMemoryValueFixture();
    const report = runMemoryValueBenchmark(fixture);
    const serialized = JSON.stringify({ fixture, report });

    expect(serialized).not.toMatch(/\b(password|passwd|token|api[_-]?key)\s*[:=]\s*\S+/i);
    expect(serialized).not.toContain('do-not-load-this-secret');
  });
});
