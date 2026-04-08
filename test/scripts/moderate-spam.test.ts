import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateSpamScore, moderateContent } from '../../scripts/moderate-spam.mjs';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENT_FILE = join(__dirname, '_test-event.json');

/** Helper to build a fake author profile. */
function fakeProfile(overrides = {}) {
  return {
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year old
    public_repos: 10,
    followers: 5,
    ...overrides,
  };
}

function newAccountProfile() {
  return fakeProfile({
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days old
    public_repos: 0,
    followers: 0,
  });
}

describe('moderate-spam', () => {
  describe('calculateSpamScore', () => {
    it('scores 0 for clean content from an established account', () => {
      const { score, reasons } = calculateSpamScore(
        'I found a bug when running `npm test`. Here are the repro steps.',
        fakeProfile(),
      );
      expect(score).toBe(0);
      expect(reasons).toHaveLength(0);
    });

    it('detects shortened URLs (+3)', () => {
      const { score, reasons } = calculateSpamScore(
        'Check out this cool tool https://bit.ly/xyz123',
        fakeProfile(),
      );
      expect(score).toBe(3);
      expect(reasons).toContain('content-pattern: shortUrls');
    });

    it('detects crypto scam patterns (+3)', () => {
      const { score, reasons } = calculateSpamScore(
        'Free bitcoin giveaway! Crypto invest now!',
        fakeProfile(),
      );
      expect(score).toBe(3);
      expect(reasons).toContain('content-pattern: cryptoScam');
    });

    it('detects adult content patterns (+3)', () => {
      const { score, reasons } = calculateSpamScore(
        'Visit this amazing dating site for singles near you',
        fakeProfile(),
      );
      expect(score).toBe(3);
      expect(reasons).toContain('content-pattern: adultContent');
    });

    it('detects file-sharing link patterns (+3)', () => {
      const { score, reasons } = calculateSpamScore(
        'Download the file from mega.nz/file/abc',
        fakeProfile(),
      );
      expect(score).toBe(3);
      expect(reasons).toContain('content-pattern: fileSharing');
    });

    it('detects mass @-mentions with 4+ tags (+1)', () => {
      const { score, reasons } = calculateSpamScore(
        'Hey @alice @bob @charlie @dave @eve please look at this',
        fakeProfile(),
      );
      expect(score).toBe(1);
      expect(reasons).toEqual(expect.arrayContaining([expect.stringContaining('mass-mentions')]));
    });

    it('does not flag fewer than 4 @-mentions', () => {
      const { score } = calculateSpamScore(
        'cc @alice @bob @charlie',
        fakeProfile(),
      );
      expect(score).toBe(0);
    });

    it('flags new accounts with zero repos and followers (+2)', () => {
      const { score, reasons } = calculateSpamScore(
        'This is a perfectly normal issue body.',
        newAccountProfile(),
      );
      expect(score).toBe(2);
      expect(reasons).toEqual(expect.arrayContaining([expect.stringContaining('new-account')]));
    });

    it('does not flag new accounts that have repos or followers', () => {
      const profile = fakeProfile({
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        public_repos: 3,
        followers: 0,
      });
      const { score } = calculateSpamScore('Normal issue text.', profile);
      expect(score).toBe(0);
    });

    it('combines content + account signals for high scores', () => {
      const { score } = calculateSpamScore(
        'Get free bitcoin now! Visit bit.ly/scam',
        newAccountProfile(),
      );
      // cryptoScam (+3) + shortUrls (+3) + new-account (+2) = 8
      expect(score).toBeGreaterThanOrEqual(8);
    });

    it('returns score >= 5 for obvious spam (auto-close threshold)', () => {
      const { score } = calculateSpamScore(
        'Free crypto invest now! Click tinyurl.com/deal @a @b @c @d @e',
        newAccountProfile(),
      );
      // cryptoScam (+3) + shortUrls (+3) + mass-mentions (+1) + new-account (+2) = 9
      expect(score).toBeGreaterThanOrEqual(5);
    });

    it('does not flag legitimate issues containing normal links', () => {
      const { score } = calculateSpamScore(
        'See https://github.com/bradygaster/squad/issues/42 and https://npmjs.com/package/foo for context.',
        fakeProfile(),
      );
      expect(score).toBe(0);
    });

    it('handles null/empty body gracefully', () => {
      const { score } = calculateSpamScore(null, fakeProfile());
      expect(score).toBe(0);

      const { score: score2 } = calculateSpamScore('', fakeProfile());
      expect(score2).toBe(0);
    });

    it('adds profile-unavailable signal for null authorProfile (+1)', () => {
      const { score, reasons } = calculateSpamScore('Some issue text.', null);
      expect(score).toBe(1);
      expect(reasons).toContain('profile-unavailable');
    });

    it('returns consistent scores on repeated calls (regex lastIndex safety)', () => {
      const body = 'Check out bit.ly/spam and tinyurl.com/scam';
      const profile = fakeProfile();
      const first = calculateSpamScore(body, profile);
      const second = calculateSpamScore(body, profile);
      expect(first.score).toBe(second.score);
      expect(first.reasons).toEqual(second.reasons);
    });

    it('scores overlapping patterns correctly', () => {
      const { score, reasons } = calculateSpamScore(
        'Visit bit.ly/deal for free bitcoin and mega.nz downloads!',
        fakeProfile(),
      );
      // shortUrls (+3) + cryptoScam (+3) + fileSharing (+3) = 9
      expect(score).toBe(9);
      expect(reasons).toContain('content-pattern: shortUrls');
      expect(reasons).toContain('content-pattern: cryptoScam');
      expect(reasons).toContain('content-pattern: fileSharing');
    });

    it('scores null body + new account profile as +2', () => {
      const { score, reasons } = calculateSpamScore(null, newAccountProfile());
      expect(score).toBe(2);
      expect(reasons).toEqual(expect.arrayContaining([expect.stringContaining('new-account')]));
    });
  });

  describe('moderateContent', () => {
    function writeEvent(payload: object) {
      writeFileSync(EVENT_FILE, JSON.stringify(payload), 'utf8');
    }

    afterEach(() => {
      if (existsSync(EVENT_FILE)) unlinkSync(EVENT_FILE);
    });

    function mockEnv(overrides: Record<string, string> = {}) {
      return {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_EVENT_PATH: EVENT_FILE,
        ...overrides,
      };
    }

    function createMockFetch(profileData: object | null = null) {
      const calls: Array<{ url: string; method: string; body?: unknown }> = [];

      const fn = vi.fn(
        async (url: string, init?: { method?: string; body?: string }) => {
          const method = init?.method ?? 'GET';
          const body = init?.body ? JSON.parse(init.body) : undefined;
          calls.push({ url, method, body });

          if (url.includes('/users/')) {
            if (profileData === null) {
              return { ok: false, status: 404, json: async () => ({}) };
            }
            return { ok: true, status: 200, json: async () => profileData };
          }

          return { ok: true, status: 200, json: async () => ({}) };
        },
      );

      return { fn, calls };
    }

    it('throws on missing env vars', async () => {
      await expect(moderateContent({ env: {} })).rejects.toThrow(
        'Missing required environment variables',
      );
    });

    it('closes + labels + comments when score >= 5', async () => {
      writeEvent({
        issue: {
          number: 42,
          title: 'Free bitcoin giveaway',
          body: 'Visit bit.ly/scam for crypto invest now!',
          user: { login: 'spammer' },
        },
      });

      const { fn, calls } = createMockFetch(newAccountProfile());
      await moderateContent({ env: mockEnv(), fetchFn: fn });

      const closeCall = calls.find(
        (c) => c.url.includes('/issues/42') && !c.url.includes('/labels') && !c.url.includes('/comments') && c.method === 'PATCH',
      );
      expect(closeCall).toBeDefined();
      expect((closeCall as { body: { state: string } }).body.state).toBe('closed');

      const labelCall = calls.find(
        (c) => c.url.includes('/issues/42/labels') && c.method === 'POST',
      );
      expect(labelCall).toBeDefined();
      expect((labelCall as { body: { labels: string[] } }).body.labels).toContain('spam');

      const commentCall = calls.find(
        (c) => c.url.includes('/issues/42/comments') && c.method === 'POST',
      );
      expect(commentCall).toBeDefined();
    });

    it('adds needs-review label when score is 3-4', async () => {
      writeEvent({
        issue: {
          number: 10,
          title: 'Normal title',
          body: 'Download from mega.nz/file/abc',
          user: { login: 'someuser' },
        },
      });

      const { fn, calls } = createMockFetch(fakeProfile());
      await moderateContent({ env: mockEnv(), fetchFn: fn });

      const labelCall = calls.find(
        (c) => c.url.includes('/issues/10/labels') && c.method === 'POST',
      );
      expect(labelCall).toBeDefined();
      expect((labelCall as { body: { labels: string[] } }).body.labels).toContain('needs-review');

      const closeCall = calls.find(
        (c) => c.url.includes('/issues/10') && !c.url.includes('/labels') && c.method === 'PATCH',
      );
      expect(closeCall).toBeUndefined();
    });

    it('makes no moderation API calls when score < 3', async () => {
      writeEvent({
        issue: {
          number: 5,
          title: 'Bug report',
          body: 'I found a bug in the CLI.',
          user: { login: 'gooduser' },
        },
      });

      const { fn, calls } = createMockFetch(fakeProfile());
      await moderateContent({ env: mockEnv(), fetchFn: fn });

      const nonProfileCalls = calls.filter((c) => !c.url.includes('/users/'));
      expect(nonProfileCalls).toHaveLength(0);
    });

    it('continues scoring when profile fetch fails with network error', async () => {
      writeEvent({
        issue: {
          number: 99,
          title: 'Free bitcoin giveaway',
          body: 'Visit bit.ly/scam for crypto invest now!',
          user: { login: 'spammer' },
        },
      });

      const calls: Array<{ url: string; method: string; body?: unknown }> = [];
      const fn = vi.fn(
        async (url: string, init?: { method?: string; body?: string }) => {
          const method = init?.method ?? 'GET';
          const body = init?.body ? JSON.parse(init.body) : undefined;
          calls.push({ url, method, body });

          if (url.includes('/users/')) {
            throw new Error('Network error');
          }

          return { ok: true, status: 200, json: async () => ({}) };
        },
      );

      await moderateContent({ env: mockEnv(), fetchFn: fn });

      // Content patterns still trigger: shortUrls(+3) + cryptoScam(+3) + profile-unavailable(+1) = 7 >= 5
      const closeCall = calls.find(
        (c) => c.url.includes('/issues/99') && !c.url.includes('/labels') && !c.url.includes('/comments') && c.method === 'PATCH',
      );
      expect(closeCall).toBeDefined();
    });

    it('still labels and comments when close API call fails', async () => {
      writeEvent({
        issue: {
          number: 42,
          title: 'Free bitcoin giveaway',
          body: 'Visit bit.ly/scam for crypto invest now!',
          user: { login: 'spammer' },
        },
      });

      const calls: Array<{ url: string; method: string; body?: unknown }> = [];
      const fn = vi.fn(
        async (url: string, init?: { method?: string; body?: string }) => {
          const method = init?.method ?? 'GET';
          const body = init?.body ? JSON.parse(init.body) : undefined;
          calls.push({ url, method, body });

          if (url.includes('/users/')) {
            return { ok: true, status: 200, json: async () => newAccountProfile() };
          }

          // Fail the close call
          if (method === 'PATCH' && url.includes('/issues/42')) {
            return { ok: false, status: 500, json: async () => ({}) };
          }

          return { ok: true, status: 200, json: async () => ({}) };
        },
      );

      await moderateContent({ env: mockEnv(), fetchFn: fn });

      // Label and comment should still be attempted despite close failure
      const labelCall = calls.find(
        (c) => c.url.includes('/issues/42/labels') && c.method === 'POST',
      );
      expect(labelCall).toBeDefined();

      const commentCall = calls.find(
        (c) => c.url.includes('/issues/42/comments') && c.method === 'POST',
      );
      expect(commentCall).toBeDefined();
    });
  });
});
