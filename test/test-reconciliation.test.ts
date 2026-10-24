import { describe, expect, it } from 'vitest';
import { reconcile, resolvePlatform, shouldFail } from '../scripts/release/test-reconciliation.mjs';

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
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/mcp-root-write.test.ts', title, 'skipped'), { platform: 'linux' });

    expect(result.summary).toMatchObject({
      numTotalTests: 1,
      listed: 1,
      byStatus: { skipped: 1 },
      byCategory: { 'env-gated': 1 },
      countsSum: true,
      unlistedTests: 0,
      platform: 'linux',
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

  it('fails when the Windows-only test is skipped on Windows', () => {
    const title = '[platform: win32] removes the legacy raw uppercase Windows drive hash while preserving unrelated entries';
    const result = reconcile(reportFor('D:\\a\\squad\\squad\\test\\mcp-root-write.test.ts', title, 'skipped'), { platform: 'win32' });

    expect(result.summary).toMatchObject({
      platform: 'win32',
      byCategory: { unexplained: 1 },
      ok: false,
    });
    expect(result.nonPassing[0]).toMatchObject({
      category: 'unexplained',
      reason: "expected to execute on win32, but report status was 'skipped'",
    });
    expect(shouldFail(result, { failOnUnexplained: true })).toBe(true);
  });

  it('requires the Windows-only test to be present and passed in Windows evidence', () => {
    const title = '[platform: win32] removes the legacy raw uppercase Windows drive hash while preserving unrelated entries';
    const result = reconcile(reportFor('D:\\a\\squad\\squad\\test\\mcp-root-write.test.ts', title, 'passed'), {
      platform: 'win32',
      requirePlatformExecutions: true,
    });

    expect(result.summary.requiredExecutions).toEqual([{
      file: 'test/mcp-root-write.test.ts',
      title,
      platform: 'win32',
      status: 'passed',
      ok: true,
    }]);
    expect(result.summary.ok).toBe(true);
    expect(shouldFail(result, { failOnUnexplained: true })).toBe(false);
  });

  it('fails Windows evidence when the required Windows-only test is absent', () => {
    const result = reconcile(reportFor('D:\\a\\squad\\squad\\test\\other.test.ts', 'ordinary passing test', 'passed'), {
      platform: 'win32',
      requirePlatformExecutions: true,
    });

    expect(result.summary.requiredExecutions).toEqual([
      expect.objectContaining({ platform: 'win32', status: 'missing', ok: false }),
    ]);
    expect(result.summary.ok).toBe(false);
    expect(shouldFail(result, { failOnUnexplained: true })).toBe(true);
  });

  it('fails when the non-Windows-only test is skipped on Linux', () => {
    const title = '[platform: non-win32] removes the legacy raw POSIX symlink hash while preserving unrelated entries';
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/mcp-root-write.test.ts', title, 'skipped'), { platform: 'linux' });

    expect(result.summary).toMatchObject({
      byCategory: { unexplained: 1 },
      ok: false,
    });
  });

  it('classifies the non-Windows-only skip as env-gated on Windows', () => {
    const title = '[platform: non-win32] removes the legacy raw POSIX symlink hash while preserving unrelated entries';
    const result = reconcile(reportFor('D:\\a\\squad\\squad\\test\\mcp-root-write.test.ts', title, 'skipped'), { platform: 'win32' });

    expect(result.summary).toMatchObject({
      byCategory: { 'env-gated': 1 },
      ok: true,
    });
  });

  it('keeps a truly unexplained skip release-blocking', () => {
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/other.test.ts', 'silently skips work', 'skipped'), { platform: 'linux' });

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

  it('fails a wrong-platform title claim instead of accepting a near match', () => {
    const wrongTitle = '[platform: non-win32] removes the legacy raw uppercase Windows drive hash while preserving unrelated entries';
    const result = reconcile(reportFor('/home/runner/work/squad/squad/test/mcp-root-write.test.ts', wrongTitle, 'skipped'), { platform: 'linux' });

    expect(result.nonPassing[0]).toMatchObject({
      category: 'unexplained',
      reason: 'no reviewed rule matches this test',
    });
    expect(result.summary.ok).toBe(false);
  });

  it('rejects a platform claim that differs from the execution host', () => {
    expect(() => resolvePlatform('linux', 'win32')).toThrow(
      "claimed reconciliation platform 'linux' does not match execution platform 'win32'",
    );
  });
});
