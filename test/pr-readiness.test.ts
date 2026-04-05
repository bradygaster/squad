/**
 * Tests for PR readiness check functions and orchestration.
 * Validates each pure check function independently, the checklist builder,
 * and the run() orchestrator with mocked fetchFn.
 * Issue: #750, PR: #752
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkCommitCount,
  checkDraftStatus,
  checkBranchFreshness,
  checkCopilotReview,
  checkChangeset,
  checkScopeClean,
  checkMergeability,
  checkCopilotThreads,
  checkCIStatus,
  buildChecklist,
  paginate,
  run,
  COMMENT_MARKER,
  SELF_CHECK_NAMES,
  SOURCE_PATTERN,
} from '../scripts/pr-readiness.mjs';

// ---------------------------------------------------------------------------
// checkCommitCount
// ---------------------------------------------------------------------------

describe('checkCommitCount', () => {
  it('passes with exactly 1 commit', () => {
    const result = checkCommitCount(1);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('1 commit');
  });

  it('fails with 0 commits', () => {
    const result = checkCommitCount(0);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('0 commits');
  });

  it('fails with multiple commits and suggests squashing', () => {
    const result = checkCommitCount(5);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('5 commits');
    expect(result.detail).toContain('squashing');
  });
});

// ---------------------------------------------------------------------------
// checkDraftStatus
// ---------------------------------------------------------------------------

describe('checkDraftStatus', () => {
  it('passes when PR is not a draft', () => {
    const result = checkDraftStatus(false);
    expect(result.pass).toBe(true);
    expect(result.detail).toBe('Ready for review');
  });

  it('fails when PR is a draft', () => {
    const result = checkDraftStatus(true);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('draft');
  });
});

// ---------------------------------------------------------------------------
// checkBranchFreshness
// ---------------------------------------------------------------------------

describe('checkBranchFreshness', () => {
  it('passes when branch is up to date (behindBy=0)', () => {
    const result = checkBranchFreshness(0, 'dev');
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('Up to date with dev');
  });

  it('fails when branch is behind', () => {
    const result = checkBranchFreshness(3, 'main');
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('3 commit(s) ahead');
    expect(result.detail).toContain('main');
  });

  it('fails gracefully when comparison failed (null)', () => {
    const result = checkBranchFreshness(null, 'dev');
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('Could not determine');
  });
});

// ---------------------------------------------------------------------------
// checkCopilotReview
// ---------------------------------------------------------------------------

describe('checkCopilotReview', () => {
  it('passes when copilot approved', () => {
    const reviews = [
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'APPROVED', submitted_at: '2025-01-01T00:00:00Z' },
    ];
    const result = checkCopilotReview(reviews);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('approved');
  });

  it('fails when copilot review state is CHANGES_REQUESTED', () => {
    const reviews = [
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2025-01-01T00:00:00Z' },
    ];
    const result = checkCopilotReview(reviews);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('CHANGES_REQUESTED');
  });

  it('fails when no copilot review exists', () => {
    const result = checkCopilotReview([]);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('No Copilot review yet');
  });

  it('handles null/undefined reviews array', () => {
    const result = checkCopilotReview(null);
    expect(result.pass).toBe(false);
  });

  it('ignores non-copilot reviews', () => {
    const reviews = [
      { user: { login: 'human-reviewer' }, state: 'APPROVED', submitted_at: '2025-01-01T00:00:00Z' },
    ];
    const result = checkCopilotReview(reviews);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('No Copilot review yet');
  });

  it('uses the latest copilot review when multiple exist', () => {
    const reviews = [
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2025-01-01T00:00:00Z' },
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'APPROVED', submitted_at: '2025-01-02T00:00:00Z' },
    ];
    const result = checkCopilotReview(reviews);
    expect(result.pass).toBe(true);
  });

  it('picks the latest review even when older one is approved', () => {
    const reviews = [
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'APPROVED', submitted_at: '2025-01-01T00:00:00Z' },
      { user: { login: 'copilot-pull-request-reviewer' }, state: 'CHANGES_REQUESTED', submitted_at: '2025-01-02T00:00:00Z' },
    ];
    const result = checkCopilotReview(reviews);
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkChangeset
// ---------------------------------------------------------------------------

describe('checkChangeset', () => {
  it('passes when changeset file exists', () => {
    const files = [{ filename: '.changeset/abc.md' }, { filename: 'packages/squad-sdk/src/foo.ts' }];
    const result = checkChangeset(files, []);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('Changeset file found');
  });

  it('passes when CHANGELOG.md is edited', () => {
    const files = [{ filename: 'CHANGELOG.md' }, { filename: 'packages/squad-cli/src/bar.ts' }];
    const result = checkChangeset(files, []);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('CHANGELOG.md edit found');
  });

  it('passes when no source files changed', () => {
    const files = [{ filename: 'README.md' }, { filename: '.github/workflows/ci.yml' }];
    const result = checkChangeset(files, []);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('changeset not required');
  });

  it('fails when source files changed but no changeset', () => {
    const files = [{ filename: 'packages/squad-sdk/src/index.ts' }];
    const result = checkChangeset(files, []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('Missing');
  });

  it('passes with skip-changelog label', () => {
    const files = [{ filename: 'packages/squad-sdk/src/index.ts' }];
    const labels = [{ name: 'skip-changelog' }];
    const result = checkChangeset(files, labels);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('skip-changelog');
  });

  it('prefers changeset detail over skip-changelog when both present', () => {
    const files = [{ filename: '.changeset/abc.md' }, { filename: 'packages/squad-sdk/src/x.ts' }];
    const labels = [{ name: 'skip-changelog' }];
    const result = checkChangeset(files, labels);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('Changeset file found');
  });

  it('handles null labels gracefully', () => {
    const files = [{ filename: 'packages/squad-sdk/src/index.ts' }];
    const result = checkChangeset(files, null);
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkScopeClean
// ---------------------------------------------------------------------------

describe('checkScopeClean', () => {
  it('passes with no scope files', () => {
    const files = [{ filename: 'packages/squad-sdk/src/index.ts' }, { filename: 'README.md' }];
    const result = checkScopeClean(files);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('No .squad/ or docs/proposals/ files');
  });

  it('warns when .squad/ files are present', () => {
    const files = [{ filename: '.squad/team.md' }, { filename: 'packages/squad-sdk/src/index.ts' }];
    const result = checkScopeClean(files);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('1 .squad/ file(s)');
    expect(result.detail).toContain('ensure these are intentional');
  });

  it('warns when docs/proposals/ files are present', () => {
    const files = [{ filename: 'docs/proposals/my-proposal.md' }];
    const result = checkScopeClean(files);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('1 docs/proposals/ file(s)');
    expect(result.detail).toContain('ensure these are intentional');
  });

  it('warns with both .squad/ and docs/proposals/ counts', () => {
    const files = [
      { filename: '.squad/team.md' },
      { filename: '.squad/routing.md' },
      { filename: 'docs/proposals/pr-readiness-checks.md' },
    ];
    const result = checkScopeClean(files);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('2 .squad/ file(s)');
    expect(result.detail).toContain('1 docs/proposals/ file(s)');
  });

  it('catches nested .squad/ paths', () => {
    const files = [{ filename: '.squad/agents/eecom/history.md' }];
    const result = checkScopeClean(files);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('1 .squad/ file(s)');
  });

  it('handles null/undefined files gracefully', () => {
    const result = checkScopeClean(null);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('No .squad/ or docs/proposals/ files');
  });
});

// ---------------------------------------------------------------------------
// checkMergeability
// ---------------------------------------------------------------------------

describe('checkMergeability', () => {
  it('passes when mergeable is true', () => {
    const result = checkMergeability(true);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('No merge conflicts');
  });

  it('fails when mergeable is false', () => {
    const result = checkMergeability(false);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('Merge conflicts');
  });

  it('passes (not penalized) when mergeable is null', () => {
    const result = checkMergeability(null);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// checkCIStatus
// ---------------------------------------------------------------------------

describe('checkCIStatus', () => {
  it('passes when all checks succeed', () => {
    const checks = [
      { name: 'build', conclusion: 'success', status: 'completed' },
      { name: 'lint', conclusion: 'success', status: 'completed' },
    ];
    const result = checkCIStatus(checks, [{ state: 'success' }]);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('All checks passing');
  });

  it('fails when checks are failing', () => {
    const checks = [
      { name: 'build', conclusion: 'failure', status: 'completed' },
      { name: 'lint', conclusion: 'success', status: 'completed' },
    ];
    const result = checkCIStatus(checks, []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('1 check(s) failing');
    expect(result.detail).toContain('build');
  });

  it('fails when checks are pending', () => {
    const checks = [
      { name: 'build', conclusion: null, status: 'in_progress' },
    ];
    const result = checkCIStatus(checks, []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('still running');
  });

  it('fails when no checks have run', () => {
    const result = checkCIStatus([], []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('No CI checks have run yet');
  });

  it('filters out self check runs', () => {
    const checks = [
      { name: 'readiness', conclusion: 'success', status: 'completed' },
      { name: 'PR Readiness Check', conclusion: 'success', status: 'completed' },
    ];
    const result = checkCIStatus(checks, []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('No CI checks have run yet');
  });

  it('reports cancelled checks as failures', () => {
    const checks = [
      { name: 'build', conclusion: 'cancelled', status: 'completed' },
    ];
    const result = checkCIStatus(checks, []);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('failing');
  });

  it('handles null checkRuns/statuses gracefully', () => {
    const result = checkCIStatus(null, null);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('No CI checks have run yet');
  });

  it('passes when only statuses exist (no check runs)', () => {
    const result = checkCIStatus([], [{ state: 'success' }]);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('All checks passing');
  });
});

// ---------------------------------------------------------------------------
// checkCopilotThreads
// ---------------------------------------------------------------------------

describe('checkCopilotThreads', () => {
  const copilotThread = (resolved: boolean, outdated = false) => ({
    isResolved: resolved,
    isOutdated: outdated,
    comments: { nodes: [{ author: { login: 'copilot-pull-request-reviewer' } }] },
  });

  const humanThread = (resolved: boolean) => ({
    isResolved: resolved,
    comments: { nodes: [{ author: { login: 'some-human' } }] },
  });

  it('passes when all copilot threads are resolved', () => {
    const threads = [copilotThread(true), copilotThread(true)];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('All 2 Copilot thread(s) resolved');
  });

  it('passes when no copilot threads exist', () => {
    const result = checkCopilotThreads([]);
    expect(result.pass).toBe(true);
    expect(result.detail).toBe('No Copilot review threads');
  });

  it('passes with null/undefined input', () => {
    expect(checkCopilotThreads(null).pass).toBe(true);
    expect(checkCopilotThreads(undefined).pass).toBe(true);
  });

  it('fails when unresolved copilot threads exist', () => {
    const threads = [copilotThread(true), copilotThread(false), copilotThread(false)];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('2 unresolved Copilot thread(s)');
  });

  it('ignores non-copilot threads', () => {
    const threads = [humanThread(false), copilotThread(true)];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('All 1 Copilot thread(s) resolved');
  });

  it('passes when unresolved threads are outdated', () => {
    const threads = [copilotThread(true), copilotThread(false, true)];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(true);
    expect(result.detail).not.toContain('unresolved');
  });

  it('handles mix of resolved, unresolved, and outdated threads', () => {
    const threads = [
      copilotThread(true),          // resolved
      copilotThread(false),         // unresolved (active)
      copilotThread(false, true),   // outdated (skipped)
    ];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain('1 unresolved');
  });

  it('includes "outdated skipped" in success message when applicable', () => {
    const threads = [
      copilotThread(true),          // resolved
      copilotThread(true),          // resolved
      copilotThread(false, true),   // outdated
    ];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(true);
    expect(result.detail).toContain('2 active Copilot thread(s) resolved');
    expect(result.detail).toContain('1 outdated skipped');
  });

  it('handles threads with missing comment data', () => {
    const threads = [
      { isResolved: false, comments: { nodes: [] } },
      { isResolved: false, comments: null },
      copilotThread(true),
    ];
    const result = checkCopilotThreads(threads);
    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildChecklist
// ---------------------------------------------------------------------------

describe('buildChecklist', () => {
  it('includes the comment marker', () => {
    const checks = [{ name: 'Test', pass: true, detail: 'OK' }];
    const body = buildChecklist(checks, 'owner', 'repo', 'dev');
    expect(body).toContain(COMMENT_MARKER);
  });

  it('shows ready status when all pass', () => {
    const checks = [
      { name: 'Single commit', pass: true, detail: '1 commit' },
      { name: 'Not in draft', pass: true, detail: 'Ready' },
    ];
    const body = buildChecklist(checks, 'owner', 'repo', 'dev');
    expect(body).toContain('✅ PR is ready for review');
  });

  it('shows warning status when some fail', () => {
    const checks = [
      { name: 'Single commit', pass: false, detail: '3 commits' },
      { name: 'Not in draft', pass: true, detail: 'Ready' },
    ];
    const body = buildChecklist(checks, 'owner', 'repo', 'dev');
    expect(body).toContain('⚠️ 1 item(s) to address');
  });

  it('includes links to CONTRIBUTING.md and PR_REQUIREMENTS.md', () => {
    const checks = [{ name: 'Test', pass: true, detail: 'OK' }];
    const body = buildChecklist(checks, 'myorg', 'myrepo', 'main');
    expect(body).toContain('https://github.com/myorg/myrepo/blob/main/CONTRIBUTING.md');
    expect(body).toContain('https://github.com/myorg/myrepo/blob/main/.github/PR_REQUIREMENTS.md');
  });

  it('renders a table row for each check', () => {
    const checks = [
      { name: 'A', pass: true, detail: 'OK' },
      { name: 'B', pass: false, detail: 'Bad' },
    ];
    const body = buildChecklist(checks, 'o', 'r', 'dev');
    expect(body).toContain('| ✅ | **A** | OK |');
    expect(body).toContain('| ❌ | **B** | Bad |');
  });
});

// ---------------------------------------------------------------------------
// paginate
// ---------------------------------------------------------------------------

describe('paginate', () => {
  it('collects items from a single page', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1 }, { id: 2 }],
      headers: new Map([['link', '']]),
    });
    const items = await paginate(mockFetch, 'https://api.example.com/items', {});
    expect(items).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('follows pagination links', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }],
        headers: new Map([['link', '<https://api.example.com/items?page=2>; rel="next"']]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 2 }],
        headers: new Map([['link', '']]),
      });
    const items = await paginate(mockFetch, 'https://api.example.com/items', {});
    expect(items).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Map(),
    });
    await expect(paginate(mockFetch, 'https://api.example.com/items', {})).rejects.toThrow('404');
  });

  it('extracts check_runs from wrapped response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ check_runs: [{ id: 1 }, { id: 2 }] }),
      headers: new Map([['link', '']]),
    });
    const items = await paginate(mockFetch, 'https://api.example.com/check-runs', {});
    expect(items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('SELF_CHECK_NAMES contains expected values', () => {
    expect(SELF_CHECK_NAMES).toContain('readiness');
    expect(SELF_CHECK_NAMES).toContain('PR Readiness Check');
  });

  it('SOURCE_PATTERN matches SDK source files', () => {
    expect(SOURCE_PATTERN.test('packages/squad-sdk/src/index.ts')).toBe(true);
  });

  it('SOURCE_PATTERN matches CLI source files', () => {
    expect(SOURCE_PATTERN.test('packages/squad-cli/src/cli.ts')).toBe(true);
  });

  it('SOURCE_PATTERN does not match non-source files', () => {
    expect(SOURCE_PATTERN.test('README.md')).toBe(false);
    expect(SOURCE_PATTERN.test('.github/workflows/ci.yml')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// run() orchestration
// ---------------------------------------------------------------------------

describe('run()', () => {
  const baseEnv = {
    GITHUB_TOKEN: 'test-token',
    PR_NUMBER: '42',
    PR_DRAFT: 'false',
    PR_HEAD_SHA: 'abc123',
    PR_BASE_REF: 'dev',
    REPO_OWNER: 'testorg',
    REPO_NAME: 'testrepo',
    RUN_NAME: 'Squad PR Readiness',
    PR_LABELS: '[]',
  };

  function createMockFetch(overrides = {}) {
    const defaults = {
      commits: [{ sha: 'abc123' }],
      compare: { behind_by: 0 },
      reviews: [{ user: { login: 'copilot-pull-request-reviewer' }, state: 'APPROVED', submitted_at: '2025-01-01T00:00:00Z' }],
      files: [{ filename: '.changeset/feat.md' }],
      pr: { mergeable: true },
      checkRuns: { check_runs: [{ name: 'build', conclusion: 'success', status: 'completed' }] },
      status: { statuses: [{ state: 'success' }] },
      comments: [],
      reviewThreads: {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{
                  isResolved: true,
                  comments: { nodes: [{ author: { login: 'copilot-pull-request-reviewer' } }] },
                }],
              },
            },
          },
        },
      },
    };
    const data = { ...defaults, ...overrides };

    return vi.fn().mockImplementation(async (url, opts) => {
      const headers = new Map([['link', '']]);
      const ok = (json) => ({ ok: true, json: async () => json, headers });

      // GraphQL endpoint for review threads
      if (url === 'https://api.github.com/graphql') return ok(data.reviewThreads);

      if (url.includes('/commits?')) return ok(data.commits);
      if (url.includes('/compare/')) return ok(data.compare);
      if (url.includes('/reviews?')) return ok(data.reviews);
      if (url.includes('/files?')) return ok(data.files);
      if (url.includes('/check-runs?')) return ok(data.checkRuns);
      if (url.includes('/status')) return ok(data.status);
      if (url.includes('/comments?')) return ok(data.comments);
      if (url.match(/\/pulls\/\d+$/)) return ok(data.pr);

      // POST/PATCH for comment upsert
      if (url.includes('/comments')) return ok({ id: 999 });

      return ok({});
    });
  }

  it('creates a comment when none exists (all checks pass)', async () => {
    const mockFetch = createMockFetch();
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    expect(result.action).toBe('created');
    expect(result.checks).toHaveLength(9);
    expect(result.checks.every((c) => c.pass)).toBe(true);

    // Verify POST was called for comment creation (not PATCH)
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => opts && opts.method === 'POST' && url.includes('/issues/'),
    );
    expect(postCalls.length).toBe(1);
    expect(postCalls[0][0]).toContain('/issues/42/comments');
  });

  it('updates an existing comment', async () => {
    const mockFetch = createMockFetch({
      comments: [{ id: 123, body: `${COMMENT_MARKER}\nold body` }],
    });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    expect(result.action).toBe('updated');
    const patchCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => opts && opts.method === 'PATCH',
    );
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0][0]).toContain('/issues/comments/123');
  });

  it('marks draft PRs as failing', async () => {
    const mockFetch = createMockFetch();
    const env = { ...baseEnv, PR_DRAFT: 'true' };
    const result = await run({ env, fetchFn: mockFetch });

    const draftCheck = result.checks.find((c) => c.name === 'Not in draft');
    expect(draftCheck.pass).toBe(false);
  });

  it('handles multiple commits', async () => {
    const mockFetch = createMockFetch({
      commits: [{ sha: '1' }, { sha: '2' }, { sha: '3' }],
    });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    const commitCheck = result.checks.find((c) => c.name === 'Single commit');
    expect(commitCheck.pass).toBe(false);
    expect(commitCheck.detail).toContain('3 commits');
  });

  it('handles branch behind base', async () => {
    const mockFetch = createMockFetch({ compare: { behind_by: 5 } });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    const branchCheck = result.checks.find((c) => c.name === 'Branch up to date');
    expect(branchCheck.pass).toBe(false);
    expect(branchCheck.detail).toContain('5 commit(s) ahead');
  });

  it('handles failed branch comparison gracefully', async () => {
    const mockFetch = createMockFetch();
    mockFetch.mockImplementation(async (url) => {
      const headers = new Map([['link', '']]);
      const ok = (json) => ({ ok: true, json: async () => json, headers });
      if (url === 'https://api.github.com/graphql') return ok({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });
      if (url.includes('/compare/')) return { ok: false, status: 404, headers };
      if (url.includes('/commits?')) return ok([{ sha: '1' }]);
      if (url.includes('/reviews?')) return ok([]);
      if (url.includes('/files?')) return ok([]);
      if (url.includes('/check-runs?')) return ok({ check_runs: [] });
      if (url.includes('/status')) return ok({ statuses: [] });
      if (url.includes('/comments?')) return ok([]);
      if (url.match(/\/pulls\/\d+$/)) return ok({ mergeable: true });
      if (url.includes('/comments')) return ok({ id: 1 });
      return ok({});
    });

    const result = await run({ env: baseEnv, fetchFn: mockFetch });
    const branchCheck = result.checks.find((c) => c.name === 'Branch up to date');
    expect(branchCheck.pass).toBe(false);
    expect(branchCheck.detail).toContain('Could not determine');
  });

  it('passes PR labels through for changeset check', async () => {
    const mockFetch = createMockFetch({
      files: [{ filename: 'packages/squad-sdk/src/foo.ts' }],
    });
    const env = {
      ...baseEnv,
      PR_LABELS: JSON.stringify([{ name: 'skip-changelog' }]),
    };
    const result = await run({ env, fetchFn: mockFetch });

    const changesetCheck = result.checks.find((c) => c.name === 'Changeset present');
    expect(changesetCheck.pass).toBe(true);
    expect(changesetCheck.detail).toContain('skip-changelog');
  });

  it('handles invalid PR_LABELS JSON gracefully', async () => {
    const mockFetch = createMockFetch({
      files: [{ filename: 'packages/squad-sdk/src/foo.ts' }],
    });
    const env = { ...baseEnv, PR_LABELS: 'not-json' };
    const result = await run({ env, fetchFn: mockFetch });

    const changesetCheck = result.checks.find((c) => c.name === 'Changeset present');
    expect(changesetCheck).toBeDefined();
  });

  it('handles merge conflict detection', async () => {
    const mockFetch = createMockFetch({ pr: { mergeable: false } });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    const mergeCheck = result.checks.find((c) => c.name === 'No merge conflicts');
    expect(mergeCheck.pass).toBe(false);
    expect(mergeCheck.detail).toContain('Merge conflicts');
  });

  it('handles CI failures', async () => {
    const mockFetch = createMockFetch({
      checkRuns: { check_runs: [{ name: 'build', conclusion: 'failure', status: 'completed' }] },
    });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    const ciCheck = result.checks.find((c) => c.name === 'CI passing');
    expect(ciCheck.pass).toBe(false);
    expect(ciCheck.detail).toContain('failing');
  });

  it('handles empty reviews (no copilot review)', async () => {
    const mockFetch = createMockFetch({ reviews: [] });
    const result = await run({ env: baseEnv, fetchFn: mockFetch });

    const copilotCheck = result.checks.find((c) => c.name === 'Copilot review');
    expect(copilotCheck.pass).toBe(false);
    expect(copilotCheck.detail).toContain('No Copilot review yet');
  });

  it('always produces 9 checks', async () => {
    const mockFetch = createMockFetch();
    const result = await run({ env: baseEnv, fetchFn: mockFetch });
    expect(result.checks).toHaveLength(9);

    const names = result.checks.map((c) => c.name);
    expect(names).toEqual([
      'Single commit',
      'Not in draft',
      'Branch up to date',
      'Copilot review',
      'Changeset present',
      'Scope clean',
      'No merge conflicts',
      'Copilot threads resolved',
      'CI passing',
    ]);
  });

  it('includes comment marker in upserted body', async () => {
    const mockFetch = createMockFetch();
    await run({ env: baseEnv, fetchFn: mockFetch });

    const postCall = mockFetch.mock.calls.find(
      ([url, opts]) => opts && opts.method === 'POST' && url.includes('/comments'),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall[1].body).body;
    expect(body).toContain(COMMENT_MARKER);
  });

  // -------------------------------------------------------------------------
  // API-based draft status override (line 389: prData?.draft ?? prDraft)
  // -------------------------------------------------------------------------

  it('uses API draft value (true) over env PR_DRAFT=false', async () => {
    const mockFetch = createMockFetch({ pr: { draft: true, mergeable: true } });
    const env = { ...baseEnv, PR_DRAFT: 'false' };
    const result = await run({ env, fetchFn: mockFetch });

    const draftCheck = result.checks.find((c) => c.name === 'Not in draft');
    expect(draftCheck.pass).toBe(false);
    expect(draftCheck.detail).toContain('draft');
  });

  it('uses API draft value (false) over env PR_DRAFT=true', async () => {
    const mockFetch = createMockFetch({ pr: { draft: false, mergeable: true } });
    const env = { ...baseEnv, PR_DRAFT: 'true' };
    const result = await run({ env, fetchFn: mockFetch });

    const draftCheck = result.checks.find((c) => c.name === 'Not in draft');
    expect(draftCheck.pass).toBe(true);
    expect(draftCheck.detail).toBe('Ready for review');
  });

  it('falls back to env PR_DRAFT when PR API fetch fails', async () => {
    const mockFetch = createMockFetch();
    mockFetch.mockImplementation(async (url, opts) => {
      const headers = new Map([['link', '']]);
      const ok = (json) => ({ ok: true, json: async () => json, headers });

      if (url === 'https://api.github.com/graphql') return ok({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });
      // PR endpoint fails
      if (url.match(/\/pulls\/\d+$/)) return { ok: false, status: 500, headers };
      if (url.includes('/commits?')) return ok([{ sha: '1' }]);
      if (url.includes('/compare/')) return ok({ behind_by: 0 });
      if (url.includes('/reviews?')) return ok([]);
      if (url.includes('/files?')) return ok([]);
      if (url.includes('/check-runs?')) return ok({ check_runs: [] });
      if (url.includes('/status')) return ok({ statuses: [] });
      if (url.includes('/comments?')) return ok([]);
      if (url.includes('/comments')) return ok({ id: 1 });
      return ok({});
    });

    const env = { ...baseEnv, PR_DRAFT: 'true' };
    const result = await run({ env, fetchFn: mockFetch });

    const draftCheck = result.checks.find((c) => c.name === 'Not in draft');
    expect(draftCheck.pass).toBe(false);
    expect(draftCheck.detail).toContain('draft');
  });
});
