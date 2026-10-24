import { describe, expect, it } from 'vitest';
import { reconcile, shouldFail } from '../scripts/release/test-reconciliation.mjs';

function reportFor(
  file: string,
  title: string,
  status: 'passed' | 'skipped',
) {
  return {
    numTotalTests: 1,
    numFailedTests: 0,
    testResults: [{
      name: file,
      status: 'passed',
      assertionResults: [{
        title,
        fullName: `iter-8 mcp-root: repo-root .mcp.json writer + project tombstone ${title}`,
        status,
        failureMessages: [],
      }],
    }],
  };
}

describe('release test reconciliation', () => {
  it('classifies the self-described Windows-only skip in a Linux-shaped report', () => {
    const title = '[platform: win32] removes the legacy raw uppercase Windows drive hash while preserving unrelated entries';
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/mcp-root-write.test.ts', title, 'skipped'));

    expect(result.summary).toMatchObject({
      numTotalTests: 1,
      listed: 1,
      byStatus: { skipped: 1 },
      byCategory: { 'env-gated': 1 },
      countsSum: true,
      unlistedTests: 0,
      ok: true,
    });
    expect(result.nonPassing).toEqual([
      expect.objectContaining({
        file: 'test/mcp-root-write.test.ts',
        title,
        status: 'skipped',
        category: 'env-gated',
        reason: "it.runIf(process.platform === 'win32'): Windows-only legacy drive-hash reconciliation",
      }),
    ]);
    expect(shouldFail(result, { failOnUnexplained: true })).toBe(false);
  });

  it('keeps a truly unexplained skip release-blocking', () => {
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/other.test.ts', 'silently skips work', 'skipped'));

    expect(result.summary).toMatchObject({
      byCategory: { unexplained: 1 },
      ok: false,
    });
    expect(result.nonPassing[0]).toMatchObject({
      category: 'unexplained',
      reason: 'no reviewed rule matches this test',
    });
    expect(shouldFail(result, { failOnUnexplained: true })).toBe(true);
  });
});
