/**
 * Comment spam moderation — pure scoring logic.
 *
 * Extracted from .github/workflows/squad-comment-moderation.yml so the
 * scoring heuristics can be unit-tested independently of the GitHub
 * Actions runtime.  All functions are pure (no API calls) — the workflow
 * remains the thin orchestrator that fetches data and acts on results.
 *
 * Issue: #751
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Author associations that are always trusted (never scored). */
export const TRUSTED_ASSOCIATIONS = [
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
  'CONTRIBUTOR',
];

/** Minimum aggregate score before a comment is flagged as spam. */
export const SPAM_THRESHOLD = 5;

/** Recruitment-spam regex patterns. */
export const RECRUITMENT_PATTERNS = [
  /\b(hiring|job opening|apply now|remote position|work from home)\b/i,
  /\b(join our team|we are looking for|urgent requirement|immediate joiner)\b/i,
  /\b(salary|compensation|ctc|lpa|per annum)\b/i,
  /\b(hr@|recruitment@|careers@|jobs@)/i,
  /\b(whatsapp|telegram)\s*(:|group|channel|number|no\.?)/i,
];

/** Crypto / SEO / gambling spam patterns. */
export const SPAM_PATTERNS = [
  /\b(crypto|bitcoin|ethereum|nft|web3|blockchain)\b/i,
  /\b(seo|backlink|link building|guest post|sponsored post)\b/i,
  /\b(casino|betting|gambling|forex|trading signals)\b/i,
  /\b(buy followers|buy likes|social media marketing)\b/i,
];

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the comment should be skipped entirely (trusted
 * author or bot sender).
 *
 * @param {string} authorAssociation  - e.g. 'OWNER', 'NONE'
 * @param {string} [senderType]       - e.g. 'Bot', 'User'
 * @returns {boolean}
 */
export function shouldSkipComment(authorAssociation, senderType) {
  if (senderType === 'Bot') return true;
  return TRUSTED_ASSOCIATIONS.includes(authorAssociation);
}

/**
 * Score a comment for spam signals.  Pure function — no API calls.
 *
 * @param {object}  opts
 * @param {string}  opts.body               - Comment body text.
 * @param {string}  opts.authorAssociation  - e.g. 'NONE', 'CONTRIBUTOR'.
 * @param {number|null} opts.userAgeDays    - Account age in days, or null
 *                                            if the lookup failed.
 * @param {boolean} opts.userLookupFailed   - True when the user API call
 *                                            errored (deleted account, etc.).
 * @returns {{ score: number, signals: string[] }}
 */
export function scoreComment({
  body = '',
  authorAssociation = 'NONE',
  userAgeDays = null,
  userLookupFailed = false,
}) {
  let score = 0;
  const signals = [];

  // Signal 1: Account age < 7 days (or lookup failed)
  if (userLookupFailed) {
    score += 3;
    signals.push('account_lookup_failed (possibly deleted)');
  } else if (userAgeDays !== null && userAgeDays < 7) {
    score += 3;
    signals.push(`account_age=${Math.round(userAgeDays)}d (<7d)`);
  }

  // Signal 2: No prior repo association
  if (authorAssociation === 'NONE') {
    score += 2;
    signals.push('author_association=NONE');
  }

  const bodyLower = body.toLowerCase();

  // Signal 3: Recruitment spam keywords
  const recruitmentHits = RECRUITMENT_PATTERNS.filter((p) => p.test(body));
  if (recruitmentHits.length > 0) {
    score += 3;
    signals.push(`recruitment_keywords=${recruitmentHits.length}_patterns`);
  }

  // Signal 4: Crypto / SEO / gambling spam
  const spamHits = SPAM_PATTERNS.filter((p) => p.test(body));
  if (spamHits.length > 0) {
    score += 3;
    signals.push(`spam_keywords=${spamHits.length}_patterns`);
  }

  // Signal 5: Excessive URLs (3+)
  const urlCount = (body.match(/https?:\/\/[^\s)>\]]+/g) || []).length;
  if (urlCount >= 3) {
    score += 2;
    signals.push(`urls=${urlCount}`);
  }

  // Signal 6: Excessively long comment from unknown user
  if (body.length > 2000 && authorAssociation === 'NONE') {
    score += 1;
    signals.push(`long_comment=${body.length}_chars`);
  }

  return { score, signals };
}

/**
 * Build the moderation notice posted after a comment is hidden.
 *
 * @param {string[]} signals   - Human-readable signal descriptions.
 * @param {string}   repoOwner
 * @param {string}   repoName
 * @returns {string}
 */
export function buildModerationNotice(signals, repoOwner, repoName) {
  return [
    '🤖 **Automated moderation:** This comment was automatically hidden because it matched multiple spam signals.',
    '',
    `**Signals:** ${signals.join(', ')}`,
    '',
    "If this was a legitimate comment, please reply to this thread or contact the maintainers — we'll restore it promptly.",
    '',
    `*This check is automated. See [comment-spam-protection proposal](https://github.com/${repoOwner}/${repoName}/blob/dev/docs/proposals/comment-spam-protection.md) for details.*`,
  ].join('\n');
}
