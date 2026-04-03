/**
 * PR Readiness checks — pure check functions + orchestration.
 *
 * Each check is a pure function that returns { pass, detail }.
 * The `run()` function is the orchestrator: it reads PR context from
 * environment variables, calls the GitHub API via `fetchFn`, runs all
 * checks, builds the checklist markdown, and upserts the PR comment.
 *
 * The workflow invokes this script via `node scripts/pr-readiness.mjs`.
 *
 * Issue: #750
 */

import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMMENT_MARKER = '<!-- squad-pr-readiness -->';

/** Check-run names belonging to this workflow (filtered from CI checks). */
export const SELF_CHECK_NAMES = ['readiness', 'PR Readiness Check'];

/** Regex for source files that require a changeset. */
export const SOURCE_PATTERN = /^packages\/squad-(sdk|cli)\/src\//;

// ---------------------------------------------------------------------------
// Pure check functions
// ---------------------------------------------------------------------------

/**
 * Check 1: Single commit.
 * @param {number} commitCount
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkCommitCount(commitCount) {
  return {
    pass: commitCount === 1,
    detail: commitCount === 1
      ? '1 commit — clean history'
      : `${commitCount} commits — consider squashing before review`,
  };
}

/**
 * Check 2: Not in draft.
 * @param {boolean} isDraft
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkDraftStatus(isDraft) {
  return {
    pass: !isDraft,
    detail: isDraft
      ? 'PR is still in draft — mark as ready for review when done'
      : 'Ready for review',
  };
}

/**
 * Check 3: Branch freshness (up to date with base).
 * @param {number|null} behindBy — null when comparison failed
 * @param {string} baseRef
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkBranchFreshness(behindBy, baseRef) {
  if (behindBy === null) {
    return { pass: false, detail: 'Could not determine — check manually' };
  }
  const upToDate = behindBy === 0;
  return {
    pass: upToDate,
    detail: upToDate
      ? `Up to date with ${baseRef}`
      : `${baseRef} is ${behindBy} commit(s) ahead — rebase recommended`,
  };
}

/**
 * Check 4: Copilot review.
 * @param {Array<{ user?: { login?: string }, state?: string, submitted_at?: string, created_at?: string }>} reviews
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkCopilotReview(reviews) {
  const copilotReviews = (reviews || []).filter(
    (r) => r.user && r.user.login === 'copilot-pull-request-reviewer',
  );
  const latest = copilotReviews.length
    ? copilotReviews.reduce((a, b) => {
        const aTime = new Date(a.submitted_at || a.created_at || 0).getTime();
        const bTime = new Date(b.submitted_at || b.created_at || 0).getTime();
        return bTime > aTime ? b : a;
      })
    : null;
  const approved = latest && latest.state === 'APPROVED';
  return {
    pass: !!approved,
    detail: approved
      ? 'Copilot reviewed and approved'
      : latest
        ? `Copilot reviewed (state: ${latest.state})`
        : 'No Copilot review yet — it may still be processing',
  };
}

/**
 * Check 5: Changeset present.
 * @param {Array<{ filename: string }>} files — files changed in the PR
 * @param {Array<{ name: string }>} labels — PR labels
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkChangeset(files, labels) {
  const hasChangeset = files.some(
    (f) => f.filename.startsWith('.changeset/') && f.filename.endsWith('.md'),
  );
  const hasChangelogEdit = files.some((f) => f.filename === 'CHANGELOG.md');
  const hasChangelogArtifact = hasChangeset || hasChangelogEdit;
  const touchesSource = files.some((f) => SOURCE_PATTERN.test(f.filename));
  const hasSkipLabel = (labels || []).some((l) => l.name === 'skip-changelog');

  let pass = hasChangelogArtifact || !touchesSource;
  let detail = '';

  if (hasChangeset) {
    detail = 'Changeset file found';
  } else if (hasChangelogEdit) {
    detail = 'CHANGELOG.md edit found';
  } else if (!touchesSource) {
    detail = 'No source files changed — changeset not required';
  } else {
    detail =
      'Missing `.changeset/*.md` or `CHANGELOG.md` edit — run `npx changeset add` (or add `skip-changelog` label)';
  }

  if (hasSkipLabel && !hasChangelogArtifact) {
    pass = true;
    detail = 'Changeset skipped via `skip-changelog` label';
  }

  return { pass, detail };
}

/**
 * Check 6: No merge conflicts (mergeability).
 * @param {boolean|null} mergeable — true/false/null
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkMergeability(mergeable) {
  if (mergeable === true) {
    return { pass: true, detail: 'No merge conflicts' };
  }
  if (mergeable === false) {
    return { pass: false, detail: 'Merge conflicts detected — resolve before review' };
  }
  // null / unknown — don't penalize
  return { pass: true, detail: 'Merge status unknown — GitHub is still computing' };
}

/**
 * Check 7: Scope cleanliness — warn when PR includes `.squad/` or `docs/proposals/` files.
 * Informational only (always passes); helps flag accidental scope creep.
 * @param {Array<{ filename: string }>} files — files changed in the PR
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkScopeClean(files) {
  const squadFiles = (files || []).filter((f) => f.filename.startsWith('.squad/'));
  const proposalFiles = (files || []).filter((f) => f.filename.startsWith('docs/proposals/'));
  const squadCount = squadFiles.length;
  const proposalCount = proposalFiles.length;

  if (squadCount === 0 && proposalCount === 0) {
    return { pass: true, detail: 'No .squad/ or docs/proposals/ files' };
  }

  const parts = [];
  if (squadCount > 0) parts.push(`${squadCount} .squad/ file(s)`);
  if (proposalCount > 0) parts.push(`${proposalCount} docs/proposals/ file(s)`);
  return {
    pass: true,
    detail: `⚠️ PR includes ${parts.join(' and ')} — ensure these are intentional`,
  };
}

/**
 * Check 8: All Copilot review threads resolved.
 * @param {Array<{ isResolved: boolean, comments: { nodes: Array<{ author: { login: string } }> } }>} threads
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkCopilotThreads(threads) {
  const copilotThreads = (threads || []).filter(
    (t) =>
      t.comments &&
      t.comments.nodes &&
      t.comments.nodes[0]?.author?.login === 'copilot-pull-request-reviewer',
  );
  const unresolved = copilotThreads.filter((t) => !t.isResolved);
  return {
    pass: unresolved.length === 0,
    detail:
      unresolved.length === 0
        ? copilotThreads.length > 0
          ? `All ${copilotThreads.length} Copilot thread(s) resolved`
          : 'No Copilot review threads'
        : `${unresolved.length} unresolved Copilot thread(s) — fix and resolve before merging`,
  };
}

/**
 * Check 9: CI passing.
 * @param {Array<{ name: string, conclusion: string|null, status: string }>} checkRuns
 * @param {Array<object>} statuses — combined status entries
 * @returns {{ pass: boolean, detail: string }}
 */
export function checkCIStatus(checkRuns, statuses) {
  const otherChecks = (checkRuns || []).filter(
    (cr) => !SELF_CHECK_NAMES.includes(cr.name),
  );
  const failedChecks = otherChecks.filter(
    (cr) => cr.conclusion === 'failure' || cr.conclusion === 'cancelled',
  );
  const pendingChecks = otherChecks.filter(
    (cr) => cr.status === 'in_progress' || cr.status === 'queued',
  );

  if (failedChecks.length > 0) {
    return {
      pass: false,
      detail: `${failedChecks.length} check(s) failing: ${failedChecks.map((c) => c.name).join(', ')}`,
    };
  }
  if (pendingChecks.length > 0) {
    return {
      pass: false,
      detail: `${pendingChecks.length} check(s) still running`,
    };
  }
  if (otherChecks.length === 0 && (statuses || []).length === 0) {
    return { pass: false, detail: 'No CI checks have run yet' };
  }
  return { pass: true, detail: 'All checks passing' };
}

// ---------------------------------------------------------------------------
// Checklist markdown builder
// ---------------------------------------------------------------------------

/**
 * Build the PR readiness comment body.
 * @param {Array<{ name: string, pass: boolean, detail: string }>} checks
 * @param {string} owner
 * @param {string} repo
 * @param {string} baseRef
 * @returns {string}
 */
export function buildChecklist(checks, owner, repo, baseRef) {
  const allPass = checks.every((c) => c.pass);
  const passCount = checks.filter((c) => c.pass).length;

  const status = allPass
    ? '### ✅ PR is ready for review'
    : `### ⚠️ ${checks.length - passCount} item(s) to address before review`;

  const rows = checks.map((c) => {
    const icon = c.pass ? '✅' : '❌';
    return `| ${icon} | **${c.name}** | ${c.detail} |`;
  });

  return [
    COMMENT_MARKER,
    '## 🛫 PR Readiness Check',
    '',
    status,
    '',
    '| Status | Check | Details |',
    '|--------|-------|---------|',
    ...rows,
    '',
    '---',
    '*This check runs automatically on every push. Fix any ❌ items and push again.*',
    `*See [CONTRIBUTING.md](https://github.com/${owner}/${repo}/blob/${baseRef}/CONTRIBUTING.md#pr-readiness-checklist) and [PR Requirements](https://github.com/${owner}/${repo}/blob/${baseRef}/.github/PR_REQUIREMENTS.md) for details.*`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Paginate a GitHub REST list endpoint.
 * @param {typeof globalThis.fetch} fetchFn
 * @param {string} url — initial URL (with per_page param)
 * @param {Record<string,string>} headers
 * @returns {Promise<any[]>}
 */
export async function paginate(fetchFn, url, headers) {
  const items = [];
  let nextUrl = url;
  while (nextUrl) {
    const res = await fetchFn(nextUrl, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${nextUrl}`);
    const data = await res.json();
    items.push(...(Array.isArray(data) ? data : data.check_runs || []));
    // Parse Link header for next page
    const link = res.headers.get('link') || '';
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match ? match[1] : null;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Full PR readiness orchestrator.  Reads context from env vars, calls
 * GitHub API, runs all checks, and upserts the readiness comment.
 *
 * Dependencies (`env` and `fetchFn`) are injectable for testing.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.env] — defaults to process.env
 * @param {typeof globalThis.fetch} [opts.fetchFn] — defaults to global fetch
 * @returns {Promise<{ checks: Array<{name:string,pass:boolean,detail:string}>, action: string }>}
 */
export async function run({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  const token    = env.GITHUB_TOKEN;
  const prNumber = env.PR_NUMBER;
  const prDraft  = env.PR_DRAFT === 'true';
  const prHeadSha = env.PR_HEAD_SHA;
  const prBaseRef = env.PR_BASE_REF;
  const owner    = env.REPO_OWNER;
  const repo     = env.REPO_NAME;
  const runName  = env.RUN_NAME || '';
  // Labels come as a JSON array string when set, or empty
  const prLabelsRaw = env.PR_LABELS || '[]';

  let prLabels = [];
  try {
    prLabels = JSON.parse(prLabelsRaw);
  } catch {
    prLabels = [];
  }

  const apiHeaders = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'squad-pr-readiness',
  };

  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const checks = [];

  // 1. Commit count
  const commits = await paginate(
    fetchFn,
    `${apiBase}/pulls/${prNumber}/commits?per_page=100`,
    apiHeaders,
  );
  checks.push({ name: 'Single commit', ...checkCommitCount(commits.length) });

  // 2. Draft status
  checks.push({ name: 'Not in draft', ...checkDraftStatus(prDraft) });

  // 3. Branch freshness
  let behindBy = null;
  try {
    const compRes = await fetchFn(
      `${apiBase}/compare/${encodeURIComponent(prBaseRef)}...${prHeadSha}`,
      { headers: apiHeaders },
    );
    if (compRes.ok) {
      const comp = await compRes.json();
      behindBy = comp.behind_by;
    }
  } catch {
    // leave behindBy as null
  }
  checks.push({ name: 'Branch up to date', ...checkBranchFreshness(behindBy, prBaseRef) });

  // 4. Copilot review
  const reviews = await paginate(
    fetchFn,
    `${apiBase}/pulls/${prNumber}/reviews?per_page=100`,
    apiHeaders,
  );
  checks.push({ name: 'Copilot review', ...checkCopilotReview(reviews) });

  // 5. Changeset present
  const files = await paginate(
    fetchFn,
    `${apiBase}/pulls/${prNumber}/files?per_page=100`,
    apiHeaders,
  );
  checks.push({ name: 'Changeset present', ...checkChangeset(files, prLabels) });

  // 6. Scope cleanliness
  checks.push({ name: 'Scope clean', ...checkScopeClean(files) });

  // 7. Mergeability
  let mergeable = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prRes = await fetchFn(`${apiBase}/pulls/${prNumber}`, {
      headers: apiHeaders,
    });
    if (prRes.ok) {
      const prData = await prRes.json();
      if (prData.mergeable === null && attempt === 0) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      mergeable = prData.mergeable;
    }
    break;
  }
  checks.push({ name: 'No merge conflicts', ...checkMergeability(mergeable) });

  // 8. Copilot review threads resolved (via GraphQL)
  let reviewThreadNodes = [];
  try {
    const graphqlBody = JSON.stringify({
      query: `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                comments(first: 1) {
                  nodes {
                    author { login }
                  }
                }
              }
            }
          }
        }
      }`,
      variables: { owner, repo, number: parseInt(prNumber, 10) },
    });
    const threadsRes = await fetchFn('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: graphqlBody,
    });
    if (threadsRes.ok) {
      const threadsData = await threadsRes.json();
      reviewThreadNodes =
        threadsData.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
    }
  } catch {
    // leave empty — will show "No Copilot review threads"
  }
  checks.push({
    name: 'Copilot threads resolved',
    ...checkCopilotThreads(reviewThreadNodes),
  });

  // 9. CI status
  let checkRuns = [];
  let statusEntries = [];
  try {
    checkRuns = await paginate(
      fetchFn,
      `${apiBase}/commits/${prHeadSha}/check-runs?per_page=100`,
      apiHeaders,
    );
    const statusRes = await fetchFn(
      `${apiBase}/commits/${prHeadSha}/status`,
      { headers: apiHeaders },
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      statusEntries = statusData.statuses || [];
    }
  } catch {
    // leave empty
  }
  checks.push({ name: 'CI passing', ...checkCIStatus(checkRuns, statusEntries) });

  // ── Build checklist and upsert comment ──
  const body = buildChecklist(checks, owner, repo, prBaseRef);

  // Find existing comment
  const existingComments = await paginate(
    fetchFn,
    `${apiBase}/issues/${prNumber}/comments?per_page=100`,
    apiHeaders,
  );
  const existing = existingComments.find(
    (c) => c.body && c.body.includes(COMMENT_MARKER),
  );

  let action;
  if (existing) {
    await fetchFn(`${apiBase}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    action = 'updated';
  } else {
    await fetchFn(`${apiBase}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    action = 'created';
  }

  // Log summary
  const passCount = checks.filter((c) => c.pass).length;
  console.log(`PR Readiness: ${passCount}/${checks.length} checks passing`);
  if (passCount < checks.length) {
    const failing = checks.filter((c) => !c.pass).map((c) => c.name);
    console.log(`Failing: ${failing.join(', ')}`);
  }

  return { checks, action };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => {
      console.log(`Comment ${result.action}.`);
    })
    .catch((err) => {
      console.error('PR readiness script failed:', err);
      process.exitCode = 1;
    });
}
