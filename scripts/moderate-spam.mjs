#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

/** Spam signal patterns and thresholds. */
export const SPAM_SIGNALS = {
  shortUrls: /bit\.ly|tinyurl|t\.co|goo\.gl|rb\.gy/gi,
  fileSharing: /dropbox\.com|drive\.google|mega\.nz|mediafire/gi,
  cryptoScam: /free.*bitcoin|bitcoin.*giveaway|crypto.*invest.*now|guaranteed.*profit/gi,
  adultContent: /onlyfans|dating.*site|meet.*singles/gi,
  massTag: /@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?\b/g,
  accountAgeDays: 7,
  minFollowers: 0,
  minPublicRepos: 0,
};

/**
 * Calculate a spam score for content authored by a given profile.
 * @param {string} body - Issue/comment text to evaluate.
 * @param {{ created_at: string, public_repos: number, followers: number } | null} authorProfile
 * @returns {{ score: number, reasons: string[] }}
 */
export function calculateSpamScore(body, authorProfile) {
  let score = 0;
  const reasons = [];

  if (!body) body = '';

  const contentPatterns = {
    shortUrls: SPAM_SIGNALS.shortUrls,
    fileSharing: SPAM_SIGNALS.fileSharing,
    cryptoScam: SPAM_SIGNALS.cryptoScam,
    adultContent: SPAM_SIGNALS.adultContent,
  };

  for (const [name, pattern] of Object.entries(contentPatterns)) {
    pattern.lastIndex = 0;
    if (pattern.test(body)) {
      score += 3;
      reasons.push(`content-pattern: ${name}`);
    }
  }

  // Flag 4+ @-mentions
  SPAM_SIGNALS.massTag.lastIndex = 0;
  const mentions = body.match(SPAM_SIGNALS.massTag);
  if (mentions && mentions.length >= 4) {
    score += 1;
    reasons.push(`mass-mentions: ${mentions.length}`);
  }

  // New account with zero activity
  if (authorProfile) {
    const createdAt = new Date(authorProfile.created_at);
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (
      ageDays < SPAM_SIGNALS.accountAgeDays &&
      authorProfile.public_repos === SPAM_SIGNALS.minPublicRepos &&
      authorProfile.followers === SPAM_SIGNALS.minFollowers
    ) {
      score += 2;
      reasons.push(`new-account: ${Math.floor(ageDays)}d old, 0 repos, 0 followers`);
    }
  } else {
    score += 1;
    reasons.push('profile-unavailable');
  }

  return { score, reasons };
}

/**
 * Evaluate a newly-opened issue and take moderation action when warranted.
 * Designed to be called from CI with GITHUB_TOKEN, GITHUB_REPOSITORY, and
 * GITHUB_EVENT_PATH environment variables set.
 */
export async function moderateContent({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const eventPath = env.GITHUB_EVENT_PATH;

  if (!token || !repo || !eventPath) {
    throw new Error('Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH');
  }

  const { readFile } = await import('node:fs/promises');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));

  const issue = event.issue;
  if (!issue) {
    console.log('No issue in event payload, skipping.');
    return;
  }

  if (!issue.user) {
    console.log('Skipping — issue author account unavailable');
    return;
  }

  const author = issue.user.login;
  const body = `${issue.title ?? ''}\n\n${issue.body ?? ''}`;
  const [owner, repoName] = repo.split('/');

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let profile = null;
  try {
    const profileRes = await fetchFn(`https://api.github.com/users/${encodeURIComponent(author)}`, { headers });
    if (!profileRes.ok) {
      console.warn(`Failed to fetch profile for ${author}: ${profileRes.status}`);
    } else {
      profile = await profileRes.json();
    }
  } catch (err) {
    console.warn(`Profile fetch error for ${author}: ${err.message}`);
  }

  const { score, reasons } = calculateSpamScore(body, profile);
  console.log(`Spam score for issue #${issue.number} by ${author}: ${score} (${reasons.join(', ')})`);

  if (score >= 5) {
    try {
      const closeRes = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}/issues/${issue.number}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      });
      if (!closeRes.ok) throw new Error(`HTTP ${closeRes.status}`);
      console.log(`  ✓ Closed issue #${issue.number}`);
    } catch (err) {
      console.error(`  ✗ Failed to close issue #${issue.number}: ${err.message}`);
    }

    try {
      const labelRes = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}/issues/${issue.number}/labels`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: ['spam'] }),
      });
      if (!labelRes.ok) throw new Error(`HTTP ${labelRes.status}`);
      console.log(`  ✓ Added 'spam' label to issue #${issue.number}`);
    } catch (err) {
      console.error(`  ✗ Failed to label issue #${issue.number}: ${err.message}`);
    }

    try {
      const commentRes = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}/issues/${issue.number}/comments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: [
            '🚫 **This issue was automatically closed as spam.**',
            '',
            `Detected signals: ${reasons.join(', ')}`,
            '',
            'If this was a mistake, please contact a maintainer to reopen.',
          ].join('\n'),
        }),
      });
      if (!commentRes.ok) throw new Error(`HTTP ${commentRes.status}`);
      console.log(`  ✓ Posted spam comment on issue #${issue.number}`);
    } catch (err) {
      console.error(`  ✗ Failed to comment on issue #${issue.number}: ${err.message}`);
    }

    console.log(`Issue #${issue.number} closed as spam.`);
  } else if (score >= 3) {
    try {
      const labelRes = await fetchFn(`https://api.github.com/repos/${owner}/${repoName}/issues/${issue.number}/labels`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: ['needs-review'] }),
      });
      if (!labelRes.ok) throw new Error(`HTTP ${labelRes.status}`);
      console.log(`Issue #${issue.number} flagged for review.`);
    } catch (err) {
      console.error(`Failed to add 'needs-review' label to issue #${issue.number}: ${err.message}`);
    }
  } else {
    console.log(`Issue #${issue.number} looks clean.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  moderateContent()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
