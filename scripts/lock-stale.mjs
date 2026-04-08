#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

/**
 * Build the cutoff ISO date string for items not updated in `days` days.
 * @param {number} days
 * @returns {string}
 */
export function buildCutoffDate(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Search GitHub for closed issues or PRs not updated since `cutoff`.
 * @param {{ type: 'issue' | 'pr', repo: string, cutoff: string, maxItems: number, fetchFn: typeof fetch, headers: Record<string,string> }} opts
 * @returns {Promise<Array<{ number: number, type: string }>>}
 */
export async function findStaleItems({ type, repo, cutoff, maxItems, fetchFn, headers }) {
  const qualifier = type === 'pr' ? 'type:pr' : 'type:issue';
  const q = `repo:${repo} is:closed is:unlocked ${qualifier} updated:<${cutoff}`;
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${maxItems}`;

  const res = await fetchFn(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.items || []).map((item) => ({ number: item.number, type }));
}

/**
 * Lock a list of issues/PRs with reason "resolved".
 * Handles "already locked" (HTTP 422) gracefully.
 * @param {{ items: Array<{ number: number, type: string }>, repo: string, fetchFn: typeof fetch, headers: Record<string,string>, delayMs?: number }} opts
 * @returns {Promise<{ lockedIssues: number, lockedPRs: number, skipped: number }>}
 */
export async function lockStaleItems({ items, repo, fetchFn, headers, delayMs = 500 }) {
  let lockedIssues = 0;
  let lockedPRs = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lockUrl = `https://api.github.com/repos/${repo}/issues/${item.number}/lock`;

    try {
      const res = await fetchFn(lockUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock_reason: 'resolved' }),
      });

      if (res.status === 204 || res.ok) {
        if (item.type === 'pr') lockedPRs++;
        else lockedIssues++;
        console.log(`  Locked ${item.type} #${item.number}`);
      } else if (res.status === 422) {
        skipped++;
        console.log(`  Skipped ${item.type} #${item.number} (already locked)`);
      } else {
        const text = await res.text().catch(() => '');
        console.error(`  ::warning::Failed to lock ${item.type} #${item.number}: HTTP ${res.status} ${text}`);
      }
    } catch (err) {
      console.error(`  ::warning::Failed to lock ${item.type} #${item.number}: ${err.message}`);
    }

    // Delay between calls to avoid rate limiting (skip after last item)
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { lockedIssues, lockedPRs, skipped };
}

/**
 * Main entry point: find and lock stale closed issues and PRs.
 * Configured via env vars or explicit options for testing.
 */
export async function run({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const lockAfterDays = parseInt(env.LOCK_AFTER_DAYS || '30', 10);
  const maxItems = parseInt(env.MAX_ITEMS || '50', 10);

  if (!token || !repo) {
    throw new Error('Missing required environment variables: GITHUB_TOKEN, GITHUB_REPOSITORY');
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const cutoff = buildCutoffDate(lockAfterDays);
  console.log(`Locking closed items in ${repo} inactive since ${cutoff} (max ${maxItems})…`);

  let issues = [];
  let prs = [];

  try {
    issues = await findStaleItems({ type: 'issue', repo, cutoff, maxItems, fetchFn, headers });
  } catch (err) {
    console.error(`Failed to search stale issues: ${err.message}`);
  }

  try {
    prs = await findStaleItems({ type: 'pr', repo, cutoff, maxItems, fetchFn, headers });
  } catch (err) {
    console.error(`Failed to search stale PRs: ${err.message}`);
  }

  const allItems = [...issues, ...prs];
  if (allItems.length === 0) {
    console.log('No stale items found.');
    return { lockedIssues: 0, lockedPRs: 0, skipped: 0 };
  }

  console.log(`Found ${issues.length} issues and ${prs.length} PRs to process.`);

  const result = await lockStaleItems({ items: allItems, repo, fetchFn, headers, delayMs: 500 });
  console.log(`Locked ${result.lockedIssues} issues, ${result.lockedPRs} PRs. Skipped ${result.skipped} (already locked).`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
