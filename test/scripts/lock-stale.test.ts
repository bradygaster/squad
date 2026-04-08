import { describe, it, expect, vi } from 'vitest';
import { buildCutoffDate, findStaleItems, lockStaleItems, run } from '../../scripts/lock-stale.mjs';

const DEFAULT_HEADERS = {
  Authorization: 'token test-token',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/** Helper: create a mock fetch that routes by URL pattern. */
function createMockFetch(
  handler: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }>,
) {
  return vi.fn(handler);
}

/** Helper: build a GitHub search response with the given issue numbers. */
function searchResponse(numbers: number[], type: 'issue' | 'pr' = 'issue') {
  return {
    total_count: numbers.length,
    items: numbers.map((n) => ({
      number: n,
      pull_request: type === 'pr' ? { url: `https://api.github.com/repos/owner/repo/pulls/${n}` } : undefined,
    })),
  };
}

describe('lock-stale', () => {
  describe('buildCutoffDate', () => {
    it('returns an ISO date string N days in the past', () => {
      const result = buildCutoffDate(30);
      const parsed = new Date(result);
      const diffMs = Date.now() - parsed.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      // Allow slight tolerance for execution time
      expect(diffDays).toBeGreaterThan(29.9);
      expect(diffDays).toBeLessThan(30.1);
    });
  });

  describe('findStaleItems', () => {
    it('returns correct items for issues', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => searchResponse([101, 102, 103]),
        text: async () => '',
      }));

      const items = await findStaleItems({
        type: 'issue',
        repo: 'owner/repo',
        cutoff: '2024-01-01T00:00:00Z',
        maxItems: 50,
        fetchFn,
        headers: DEFAULT_HEADERS,
      });

      expect(items).toEqual([
        { number: 101, type: 'issue' },
        { number: 102, type: 'issue' },
        { number: 103, type: 'issue' },
      ]);

      // Verify search query includes correct qualifiers
      const calledUrl = fetchFn.mock.calls[0][0] as string;
      expect(calledUrl).toContain('type%3Aissue');
      expect(calledUrl).toContain('is%3Aclosed');
      expect(calledUrl).toContain('is%3Aunlocked');
    });

    it('returns correct items for PRs', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => searchResponse([201, 202], 'pr'),
        text: async () => '',
      }));

      const items = await findStaleItems({
        type: 'pr',
        repo: 'owner/repo',
        cutoff: '2024-01-01T00:00:00Z',
        maxItems: 50,
        fetchFn,
        headers: DEFAULT_HEADERS,
      });

      expect(items).toEqual([
        { number: 201, type: 'pr' },
        { number: 202, type: 'pr' },
      ]);

      const calledUrl = fetchFn.mock.calls[0][0] as string;
      expect(calledUrl).toContain('type%3Apr');
    });

    it('handles empty results (no stale items)', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 0, items: [] }),
        text: async () => '',
      }));

      const items = await findStaleItems({
        type: 'issue',
        repo: 'owner/repo',
        cutoff: '2024-01-01T00:00:00Z',
        maxItems: 50,
        fetchFn,
        headers: DEFAULT_HEADERS,
      });

      expect(items).toEqual([]);
    });

    it('handles API errors gracefully', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: false,
        status: 403,
        json: async () => ({}),
        text: async () => 'rate limit exceeded',
      }));

      await expect(
        findStaleItems({
          type: 'issue',
          repo: 'owner/repo',
          cutoff: '2024-01-01T00:00:00Z',
          maxItems: 50,
          fetchFn,
          headers: DEFAULT_HEADERS,
        }),
      ).rejects.toThrow('GitHub search failed (403)');
    });

    it('respects MAX_ITEMS limit in API query', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => searchResponse([1, 2, 3]),
        text: async () => '',
      }));

      await findStaleItems({
        type: 'issue',
        repo: 'owner/repo',
        cutoff: '2024-01-01T00:00:00Z',
        maxItems: 10,
        fetchFn,
        headers: DEFAULT_HEADERS,
      });

      const calledUrl = fetchFn.mock.calls[0][0] as string;
      expect(calledUrl).toContain('per_page=10');
    });
  });

  describe('lockStaleItems', () => {
    it('calls lock API for each item', async () => {
      const calls: Array<{ url: string; method: string }> = [];
      const fetchFn = createMockFetch(async (url, init) => {
        calls.push({ url, method: init?.method || 'GET' });
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      });

      const items = [
        { number: 1, type: 'issue' },
        { number: 2, type: 'pr' },
        { number: 3, type: 'issue' },
      ];

      const result = await lockStaleItems({
        items,
        repo: 'owner/repo',
        fetchFn,
        headers: DEFAULT_HEADERS,
        delayMs: 0,
      });

      expect(calls).toHaveLength(3);
      expect(calls[0].url).toContain('/issues/1/lock');
      expect(calls[1].url).toContain('/issues/2/lock');
      expect(calls[2].url).toContain('/issues/3/lock');
      expect(calls.every((c) => c.method === 'PUT')).toBe(true);

      expect(result.lockedIssues).toBe(2);
      expect(result.lockedPRs).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('handles "already locked" response (HTTP 422) without error', async () => {
      const fetchFn = createMockFetch(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ message: 'already locked' }),
        text: async () => 'already locked',
      }));

      const items = [
        { number: 10, type: 'issue' },
        { number: 20, type: 'pr' },
      ];

      const result = await lockStaleItems({
        items,
        repo: 'owner/repo',
        fetchFn,
        headers: DEFAULT_HEADERS,
        delayMs: 0,
      });

      expect(result.lockedIssues).toBe(0);
      expect(result.lockedPRs).toBe(0);
      expect(result.skipped).toBe(2);
    });

    it('handles API failure on individual lock and continues with remaining', async () => {
      let callIndex = 0;
      const fetchFn = createMockFetch(async () => {
        callIndex++;
        if (callIndex === 2) {
          // Second call fails
          return { ok: false, status: 500, json: async () => ({}), text: async () => 'server error' };
        }
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      });

      const items = [
        { number: 1, type: 'issue' },
        { number: 2, type: 'issue' },
        { number: 3, type: 'issue' },
      ];

      const result = await lockStaleItems({
        items,
        repo: 'owner/repo',
        fetchFn,
        headers: DEFAULT_HEADERS,
        delayMs: 0,
      });

      // Items 1 and 3 succeed, item 2 fails
      expect(result.lockedIssues).toBe(2);
      expect(result.skipped).toBe(0);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('handles network error on individual lock and continues', async () => {
      let callIndex = 0;
      const fetchFn = createMockFetch(async () => {
        callIndex++;
        if (callIndex === 1) throw new Error('Network failure');
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      });

      const items = [
        { number: 1, type: 'issue' },
        { number: 2, type: 'pr' },
      ];

      const result = await lockStaleItems({
        items,
        repo: 'owner/repo',
        fetchFn,
        headers: DEFAULT_HEADERS,
        delayMs: 0,
      });

      expect(result.lockedIssues).toBe(0);
      expect(result.lockedPRs).toBe(1);
    });
  });

  describe('run', () => {
    it('logs correct summary counts', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const fetchFn = createMockFetch(async (url) => {
        // Search calls
        if (url.includes('/search/issues')) {
          if (url.includes('type%3Aissue')) {
            return { ok: true, status: 200, json: async () => searchResponse([1, 2]), text: async () => '' };
          }
          if (url.includes('type%3Apr')) {
            return { ok: true, status: 200, json: async () => searchResponse([3], 'pr'), text: async () => '' };
          }
        }
        // Lock calls
        return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
      });

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'owner/repo',
        LOCK_AFTER_DAYS: '30',
        MAX_ITEMS: '50',
      };

      const result = await run({ env, fetchFn });

      expect(result.lockedIssues).toBe(2);
      expect(result.lockedPRs).toBe(1);
      expect(result.skipped).toBe(0);

      const summaryCall = consoleSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('Locked 2 issues, 1 PRs'),
      );
      expect(summaryCall).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('throws on missing env vars', async () => {
      await expect(run({ env: {} })).rejects.toThrow('Missing required environment variables');
    });

    it('reports no stale items when search returns empty', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const fetchFn = createMockFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ total_count: 0, items: [] }),
        text: async () => '',
      }));

      const env = {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'owner/repo',
      };

      const result = await run({ env, fetchFn });

      expect(result.lockedIssues).toBe(0);
      expect(result.lockedPRs).toBe(0);

      const noItemsCall = consoleSpy.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('No stale items found'),
      );
      expect(noItemsCall).toBeDefined();

      consoleSpy.mockRestore();
    });
  });
});
