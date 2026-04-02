/**
 * Tests for comment-moderation scoring logic.
 * Validates the pure functions extracted from the CI workflow.
 * Issue: #751, PR: #753
 */

import { describe, it, expect } from 'vitest';
import {
  shouldSkipComment,
  scoreComment,
  buildModerationNotice,
  TRUSTED_ASSOCIATIONS,
  SPAM_THRESHOLD,
  RECRUITMENT_PATTERNS,
  SPAM_PATTERNS,
} from '../scripts/comment-moderation.mjs';

// ---------------------------------------------------------------------------
// shouldSkipComment
// ---------------------------------------------------------------------------

describe('shouldSkipComment', () => {
  it.each(TRUSTED_ASSOCIATIONS)(
    'should skip trusted association: %s',
    (assoc) => {
      expect(shouldSkipComment(assoc, 'User')).toBe(true);
    },
  );

  it('should skip Bot sender type regardless of association', () => {
    expect(shouldSkipComment('NONE', 'Bot')).toBe(true);
  });

  it('should NOT skip a regular user with NONE association', () => {
    expect(shouldSkipComment('NONE', 'User')).toBe(false);
  });

  it('should NOT skip when senderType is undefined (legacy payloads)', () => {
    expect(shouldSkipComment('NONE', undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scoreComment — individual signals
// ---------------------------------------------------------------------------

describe('scoreComment', () => {
  // --- Signal 1: Account age ---

  describe('account age signal', () => {
    it('should add 3 points for accounts < 7 days old', () => {
      const { score, signals } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR', // not NONE — isolate this signal
        userAgeDays: 2,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringContaining('account_age=2d')]),
      );
    });

    it('should not score accounts >= 7 days old', () => {
      const { score } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 7,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });

    it('should add 3 points when user lookup fails (deleted account)', () => {
      const { score, signals } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: null,
        userLookupFailed: true,
      });
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringContaining('account_lookup_failed')]),
      );
    });

    it('should not score when userAgeDays is null and lookup succeeded', () => {
      const { score } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: null,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });
  });

  // --- Signal 2: Author association ---

  describe('author association signal', () => {
    it('should add 2 points for NONE association', () => {
      const { score, signals } = scoreComment({
        body: '',
        authorAssociation: 'NONE',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(2);
      expect(signals).toContain('author_association=NONE');
    });

    it('should not score non-NONE associations', () => {
      const { score } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });
  });

  // --- Signal 3: Recruitment keywords ---

  describe('recruitment keyword signal', () => {
    it('should detect "hiring" keyword', () => {
      const { score, signals } = scoreComment({
        body: 'We are hiring senior engineers!',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringMatching(/recruitment_keywords/)]),
      );
    });

    it('should detect multiple recruitment patterns', () => {
      const { signals } = scoreComment({
        body: 'We are hiring! Salary 100k. Join our team. whatsapp group link',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      // "hiring", "salary", "join our team", "whatsapp group" = 4 patterns
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringContaining('recruitment_keywords=4_patterns')]),
      );
    });

    it('should not score comments without recruitment keywords', () => {
      const { score } = scoreComment({
        body: 'Thanks for the great library!',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });
  });

  // --- Signal 4: Spam keywords ---

  describe('spam keyword signal', () => {
    it('should detect crypto spam', () => {
      const { score, signals } = scoreComment({
        body: 'Check out my new bitcoin trading bot!',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringMatching(/spam_keywords/)]),
      );
    });

    it('should detect SEO spam', () => {
      const { score } = scoreComment({
        body: 'I offer guest post and backlink services',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
    });

    it('should detect gambling spam', () => {
      const { score } = scoreComment({
        body: 'Best online casino and betting platform',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
    });
  });

  // --- Signal 5: Excessive URLs ---

  describe('URL count signal', () => {
    it('should add 2 points for 3+ URLs', () => {
      const body = 'Visit https://a.com https://b.com https://c.com';
      const { score, signals } = scoreComment({
        body,
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(2);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringContaining('urls=3')]),
      );
    });

    it('should not score for fewer than 3 URLs', () => {
      const body = 'See https://a.com and https://b.com';
      const { score } = scoreComment({
        body,
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });
  });

  // --- Signal 6: Long comment from unknown user ---

  describe('long comment signal', () => {
    it('should add 1 point for >2000 char comment from NONE association', () => {
      const body = 'x'.repeat(2001);
      const { score, signals } = scoreComment({
        body,
        authorAssociation: 'NONE',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      // 2 (NONE) + 1 (long) = 3
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringMatching(/long_comment=2001_chars/)]),
      );
    });

    it('should NOT score long comments from contributors', () => {
      const body = 'x'.repeat(2001);
      const { score } = scoreComment({
        body,
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });
  });

  // --- Combined / threshold tests ---

  describe('threshold behavior', () => {
    it('should reach threshold with new account + NONE + spam keywords', () => {
      // 3 (age) + 2 (NONE) + 3 (spam) = 8 ≥ 5
      const { score } = scoreComment({
        body: 'Buy crypto now! Best bitcoin deals!',
        authorAssociation: 'NONE',
        userAgeDays: 1,
        userLookupFailed: false,
      });
      expect(score).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
    });

    it('should stay below threshold for a single weak signal', () => {
      // Only 2 (NONE association)
      const { score } = scoreComment({
        body: 'Hello, nice project!',
        authorAssociation: 'NONE',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBeLessThan(SPAM_THRESHOLD);
    });

    it('should aggregate all signals correctly', () => {
      // 3 (age) + 2 (NONE) + 3 (recruitment) + 3 (spam) + 2 (urls) + 1 (long) = 14
      const urls = 'https://a.com https://b.com https://c.com';
      const body = `${'We are hiring! '.repeat(50)} bitcoin ${urls} ${'filler '.repeat(200)}`;
      const { score } = scoreComment({
        body,
        authorAssociation: 'NONE',
        userAgeDays: 1,
        userLookupFailed: false,
      });
      expect(score).toBe(14);
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('should handle empty comment body', () => {
      const { score, signals } = scoreComment({
        body: '',
        authorAssociation: 'NONE',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      // Only NONE = 2
      expect(score).toBe(2);
      expect(signals).toEqual(['author_association=NONE']);
    });

    it('should handle undefined / default parameters', () => {
      const { score } = scoreComment({});
      // defaults: body='', authorAssociation='NONE', userAgeDays=null, userLookupFailed=false
      // NONE = 2
      expect(score).toBe(2);
    });

    it('should handle zero-day-old account', () => {
      const { score, signals } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 0,
        userLookupFailed: false,
      });
      expect(score).toBe(3);
      expect(signals).toEqual(
        expect.arrayContaining([expect.stringContaining('account_age=0d')]),
      );
    });

    it('should handle exactly 7-day-old account (boundary)', () => {
      const { score } = scoreComment({
        body: '',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 7,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });

    it('should handle comment body with only whitespace', () => {
      const { score } = scoreComment({
        body: '   \n\t  ',
        authorAssociation: 'CONTRIBUTOR',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      expect(score).toBe(0);
    });

    it('should handle exactly 2000 chars (boundary — no long-comment signal)', () => {
      const body = 'x'.repeat(2000);
      const { score } = scoreComment({
        body,
        authorAssociation: 'NONE',
        userAgeDays: 365,
        userLookupFailed: false,
      });
      // Only NONE = 2, no long-comment signal at exactly 2000
      expect(score).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// buildModerationNotice
// ---------------------------------------------------------------------------

describe('buildModerationNotice', () => {
  it('should include all signals in the notice', () => {
    const notice = buildModerationNotice(
      ['account_age=1d (<7d)', 'author_association=NONE'],
      'testowner',
      'testrepo',
    );
    expect(notice).toContain('account_age=1d (<7d)');
    expect(notice).toContain('author_association=NONE');
  });

  it('should include the proposal link with correct owner/repo', () => {
    const notice = buildModerationNotice([], 'bradygaster', 'squad');
    expect(notice).toContain(
      'https://github.com/bradygaster/squad/blob/dev/docs/proposals/comment-spam-protection.md',
    );
  });

  it('should include restoration instructions', () => {
    const notice = buildModerationNotice([], 'o', 'r');
    expect(notice).toContain('reply to this thread');
    expect(notice).toContain('restore it promptly');
  });
});
