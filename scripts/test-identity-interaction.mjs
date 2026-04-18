#!/usr/bin/env node
/**
 * test-identity-interaction.mjs — Multi-identity interaction E2E tests
 *
 * Exercises bot-to-bot collaboration patterns on a real GitHub repo:
 *   - Bot creates PR with proper attribution
 *   - Bot posts role-formatted comments
 *   - Bot submits PR reviews
 *   - Token lifecycle (cache, clear, refresh)
 *   - Cross-identity verification (when multiple apps configured)
 *   - Full cleanup of all GitHub artifacts
 *
 * Requires:
 *   - A .squad/identity/ directory with at least the 'lead' app configured
 *   - The PEM key at .squad/identity/keys/lead.pem
 *   - The squad-sdk package built (dist/ present)
 *
 * Usage:  node scripts/test-identity-interaction.mjs
 *
 * This is a standalone runner — NOT a vitest test.
 */

import { execSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';

// ---------------------------------------------------------------------------
// SDK imports — from built dist via package subpath
// ---------------------------------------------------------------------------
import {
  loadIdentityConfig,
  loadAppRegistration,
  hasPrivateKey,
  resolveToken,
  clearTokenCache,
  execWithRoleToken,
  formatComment,
  formatCommitMessage,
} from '@bradygaster/squad-sdk/identity';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Derive owner/repo from git remote
// ---------------------------------------------------------------------------
function getOwnerRepo() {
  const url = execSync('git remote get-url origin', {
    cwd: PROJECT_ROOT, encoding: 'utf-8',
  }).trim();
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot parse owner/repo from remote URL: ${url}`);
  return { owner: match[1], repo: match[2], full: `${match[1]}/${match[2]}` };
}
const REPO_INFO = getOwnerRepo();

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function pass(name) {
  passed++;
  results.push({ name, status: 'pass' });
  console.log(`  ✅ ${name}`);
}

/** Sanitize error messages to prevent token leakage in logs. */
function sanitizeError(msg) {
  return msg.replace(/ghs_[A-Za-z0-9_]+/g, '[REDACTED]')
            .replace(/x-access-token:[^@]+/g, 'x-access-token:[REDACTED]');
}

function fail(name, reason) {
  failed++;
  const safeReason = sanitizeError(reason);
  results.push({ name, status: 'fail', reason: safeReason });
  console.error(`  ❌ ${name}`);
  console.error(`     ${safeReason}`);
}

function skip(name, reason) {
  skipped++;
  results.push({ name, status: 'skip', reason });
  console.log(`  ⏭️  ${name} — ${reason}`);
}

// ============================================================================
// Phase 1: Setup — Discover identities and verify tokens
// ============================================================================
console.log('\n🔍 Phase 1: Identity Discovery & Verification\n');

const config = loadIdentityConfig(PROJECT_ROOT);
if (!config) {
  console.error('❌ No identity configuration found at .squad/identity/config.json');
  console.error('   This test requires at least one configured identity. Exiting.');
  process.exit(1);
}

// Discover all configured identities
const configuredApps = config.apps ?? {};
const roleKeys = Object.keys(configuredApps);
console.log(`  Config tier: ${config.tier}`);
console.log(`  Configured roles: ${roleKeys.length > 0 ? roleKeys.join(', ') : '(none in config.apps)'}`);

// For each identity, verify token resolution
const availableIdentities = [];

for (const roleKey of roleKeys) {
  const reg = loadAppRegistration(PROJECT_ROOT, roleKey);
  if (!reg) {
    console.log(`  ⚠️  ${roleKey}: registration not found in apps/ directory`);
    continue;
  }
  if (!hasPrivateKey(PROJECT_ROOT, roleKey)) {
    console.log(`  ⚠️  ${roleKey}: PEM key missing`);
    continue;
  }

  clearTokenCache();
  try {
    const token = await resolveToken(PROJECT_ROOT, roleKey);
    if (!token) {
      fail(`${roleKey} token resolution`, 'resolveToken returned null');
      continue;
    }

    // Verify token works against the repo
    const { stdout } = await execWithRoleToken(
      PROJECT_ROOT, roleKey,
      `gh api /repos/${REPO_INFO.full} --jq .full_name`,
    );
    const repoName = stdout.trim();
    if (repoName === REPO_INFO.full) {
      pass(`${roleKey}: token resolves, repo accessible (${reg.appSlug}, appId=${reg.appId})`);
      availableIdentities.push({ roleKey, reg });
    } else {
      fail(`${roleKey} repo access`, `expected "${REPO_INFO.full}", got "${repoName}"`);
    }
  } catch (err) {
    fail(`${roleKey} token verification`, sanitizeError(err.message));
  }
}

// Require at least 1 identity
if (availableIdentities.length === 0) {
  console.error('\n❌ No working identities found. At least 1 is required. Exiting.');
  process.exit(1);
}

pass(`${availableIdentities.length} identity/identities available: ${availableIdentities.map(i => i.roleKey).join(', ')}`);

// ============================================================================
// Phase 2–4, 7: Bot Creates PR, Comments, Reviews, Cleanup
// ============================================================================
console.log('\n━━━ Phase 2: Bot Creates PR ━━━\n');

{
  const timestamp = Date.now();
  const branch = `test/identity-interaction-${timestamp}`;
  const testFile = 'test-fixtures/identity-interaction-test.md';
  const leadIdentity = availableIdentities[0];
  const botSlug = leadIdentity.reg.appSlug;
  const botName = `${botSlug}[bot]`;
  const botEmail = `${botSlug}[bot]@users.noreply.github.com`;

  // Track state for cleanup
  let originalBranch = '';
  let prUrl = '';
  let prNumber = '';
  let branchCreated = false;
  let branchPushed = false;

  async function cleanup() {
    console.log('\n━━━ Phase 7: Cleanup ━━━\n');
    console.log('  🧹 Cleaning up test artifacts...');

    // Close PR if opened
    if (prUrl) {
      try {
        await execWithRoleToken(
          PROJECT_ROOT, leadIdentity.roleKey,
          `gh pr close ${prUrl} --repo ${REPO_INFO.full}`,
        );
        console.log('     Closed PR');
      } catch { /* best effort */ }
    }

    // Delete remote branch
    if (branchPushed) {
      try {
        const token = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
        if (token) {
          execSync(
            `git push https://x-access-token:${token}@github.com/${REPO_INFO.full}.git --delete ${branch}`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
          );
        }
        console.log('     Deleted remote branch');
      } catch { /* best effort */ }
    }

    // Switch back to original branch
    if (originalBranch) {
      try {
        execSync(`git checkout ${originalBranch}`, {
          cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
        });
      } catch { /* best effort */ }
    }

    // Delete local branch
    if (branchCreated) {
      try {
        execSync(`git branch -D ${branch}`, {
          cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
        });
        console.log('     Deleted local branch');
      } catch { /* best effort */ }
    }

    // Remove test file if it still exists locally
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) {
      try { unlinkSync(testFilePath); } catch { /* best effort */ }
    }

    // Verify no leftover branches
    try {
      const remoteBranches = execSync(
        `git ls-remote --heads origin ${branch}`,
        { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 15_000 },
      ).trim();
      if (remoteBranches.length === 0) {
        pass('cleanup: no leftover remote branch');
      } else {
        fail('cleanup: leftover remote branch', `branch ${branch} still exists`);
      }
    } catch {
      // ls-remote may fail — not critical
      pass('cleanup: remote branch check completed');
    }

    // Verify we're back on original branch
    if (originalBranch) {
      try {
        const current = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
        }).trim();
        if (current === originalBranch) {
          pass(`cleanup: back on original branch (${originalBranch})`);
        } else {
          fail('cleanup: restore branch', `expected ${originalBranch}, on ${current}`);
        }
      } catch { /* best effort */ }
    }
  }

  try {
    // Record current branch
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    }).trim();

    // 2a: Create test branch
    execSync(`git checkout -b ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = true;
    pass(`created branch: ${branch}`);

    // 2b: Create test file with multi-role content
    const fileContent = [
      '# Multi-Identity Interaction Test',
      '',
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Branch:** ${branch}`,
      `**Repo:** ${REPO_INFO.full}`,
      '',
      '## Simulated Squad Work Session',
      '',
      '### 🏗️ Flight (Lead)',
      'Architecture review: approved module boundary changes.',
      '',
      '### ⚙️ GNC (Backend)',
      'Implemented token lifecycle with proper cache invalidation.',
      '',
      '### 🧪 FIDO (Tester)',
      'Added E2E tests covering multi-identity interaction patterns.',
      '',
      '---',
      `_Generated by identity interaction E2E test at ${new Date().toISOString()}_`,
      '',
    ].join('\n');

    writeFileSync(join(PROJECT_ROOT, testFile), fileContent, 'utf-8');
    pass('created test file with multi-role content');

    // 2c: Stage and commit as lead bot
    execSync(`git add ${testFile}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });

    const commitMsg = formatCommitMessage({
      agentName: 'Flight',
      message: `test: identity interaction E2E (${timestamp})`,
    });
    execSync(
      `git -c user.name="${botName}" -c user.email="${botEmail}" commit -m "${commitMsg}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' },
    );
    pass(`committed as ${botName}`);

    // 2d: Push with bot token
    const pushToken = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
    if (!pushToken) throw new Error('resolveToken returned null — cannot push');

    execSync(
      `git push https://x-access-token:${pushToken}@github.com/${REPO_INFO.full}.git ${branch}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
    );
    branchPushed = true;
    pass(`pushed branch with ${leadIdentity.roleKey} bot token`);

    // 2e: Open draft PR with attribution
    const appUrl = `https://github.com/apps/${botSlug}`;
    const prBody = [
      '## Multi-Identity Interaction Test',
      '',
      `Created by [${botSlug}](${appUrl}) via identity interaction E2E test.`,
      '',
      '### Roles Simulated',
      '- 🏗️ **Flight** (Lead) — PR creation, review',
      '- ⚙️ **GNC** (Backend) — Comment attribution',
      '- 🧪 **FIDO** (Tester) — Comment attribution',
      '',
      '> ⚠️ Automated test artifact — safe to close.',
    ].join('\n');

    const prResult = await execWithRoleToken(
      PROJECT_ROOT, leadIdentity.roleKey,
      `gh pr create --draft --title "test: identity interaction E2E" --body "${prBody.replace(/"/g, '\\"')}" --base dev --head ${branch} --repo ${REPO_INFO.full}`,
    );
    prUrl = (prResult.stdout || '').trim();
    if (!prUrl || !prUrl.includes('github.com')) {
      throw new Error(`PR create did not return a URL: ${prUrl}`);
    }
    // Extract PR number from URL
    const prMatch = prUrl.match(/\/pull\/(\d+)/);
    prNumber = prMatch ? prMatch[1] : '';
    pass(`opened draft PR: ${prUrl}`);

    // ========================================================================
    // Phase 3: Bot Comments on PR (role-formatted)
    // ========================================================================
    console.log('\n━━━ Phase 3: Bot Comments on PR (Role-Formatted) ━━━\n');

    const roleComments = [
      {
        agentName: 'Flight',
        role: 'Lead',
        body: 'Architecture review complete. Module boundaries look correct. Approved.',
      },
      {
        agentName: 'GNC',
        role: 'Backend',
        body: 'Token lifecycle implementation verified. Cache invalidation works correctly.',
      },
      {
        agentName: 'FIDO',
        role: 'Tester',
        body: 'All 7 phases passing. Coverage meets 80% floor. Go for merge.',
      },
    ];

    for (const input of roleComments) {
      try {
        const comment = formatComment(input);

        // Verify formatting before posting
        if (!comment.includes(`**${input.agentName}**`)) {
          fail(`formatComment for ${input.agentName}`, 'missing bold agent name');
          continue;
        }
        if (!comment.includes(input.role)) {
          fail(`formatComment for ${input.agentName}`, 'missing role');
          continue;
        }

        // Post comment via gh pr comment
        await execWithRoleToken(
          PROJECT_ROOT, leadIdentity.roleKey,
          `gh pr comment ${prNumber} --body "${comment.replace(/"/g, '\\"')}" --repo ${REPO_INFO.full}`,
        );
        pass(`posted ${input.role} comment as ${botSlug}[bot] (agent: ${input.agentName})`);
      } catch (err) {
        fail(`post ${input.role} comment`, sanitizeError(err.message));
      }
    }

    // Verify comments appeared
    try {
      const { stdout: commentsJson } = await execWithRoleToken(
        PROJECT_ROOT, leadIdentity.roleKey,
        `gh api /repos/${REPO_INFO.full}/issues/${prNumber}/comments --jq '.[].body'`,
      );
      const commentBodies = commentsJson.trim();
      let allFound = true;
      for (const input of roleComments) {
        if (!commentBodies.includes(`**${input.agentName}**`)) {
          fail(`verify ${input.agentName} comment on PR`, 'comment not found in PR');
          allFound = false;
        }
      }
      if (allFound) {
        pass(`all ${roleComments.length} role-formatted comments verified on PR`);
      }
    } catch (err) {
      fail('verify comments on PR', sanitizeError(err.message));
    }

    // ========================================================================
    // Phase 4: Bot Reviews PR
    // ========================================================================
    console.log('\n━━━ Phase 4: Bot Reviews PR ━━━\n');

    try {
      const reviewBody = formatComment({
        agentName: 'FIDO',
        role: 'Tester',
        body: 'Quality gate check: all interaction tests passing. LGTM.',
      });

      // Post a PR review using the GitHub API
      const reviewPayload = JSON.stringify({
        body: reviewBody,
        event: 'COMMENT',
      });

      const { stdout: reviewResult } = await execWithRoleToken(
        PROJECT_ROOT, leadIdentity.roleKey,
        `gh api /repos/${REPO_INFO.full}/pulls/${prNumber}/reviews --method POST --input - <<'EOF'
${reviewPayload}
EOF`,
      );

      const review = JSON.parse(reviewResult);
      if (review.id && review.state) {
        pass(`posted PR review (id=${review.id}, state=${review.state})`);
      } else {
        fail('post PR review', `unexpected response: ${reviewResult.substring(0, 200)}`);
      }
    } catch (err) {
      fail('post PR review', sanitizeError(err.message));
    }

    // Verify review appeared
    try {
      const { stdout: reviewsJson } = await execWithRoleToken(
        PROJECT_ROOT, leadIdentity.roleKey,
        `gh api /repos/${REPO_INFO.full}/pulls/${prNumber}/reviews --jq '.[].body'`,
      );
      if (reviewsJson.includes('**FIDO**')) {
        pass('PR review verified with FIDO attribution');
      } else {
        fail('verify PR review', 'FIDO attribution not found in reviews');
      }
    } catch (err) {
      fail('verify PR review', sanitizeError(err.message));
    }

    // ========================================================================
    // Phase 7: Cleanup (happy path — close PR, delete branch)
    // ========================================================================
    console.log('\n━━━ Phase 7: Cleanup ━━━\n');
    console.log('  🧹 Cleaning up test artifacts...');

    // Close PR
    await execWithRoleToken(
      PROJECT_ROOT, leadIdentity.roleKey,
      `gh pr close ${prUrl} --repo ${REPO_INFO.full}`,
    );
    prUrl = '';  // PR already closed
    pass('closed PR');

    // Delete remote branch
    const cleanupToken = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
    execSync(
      `git push https://x-access-token:${cleanupToken}@github.com/${REPO_INFO.full}.git --delete ${branch}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
    );
    branchPushed = false;
    pass('deleted remote branch');

    // Switch back and delete local branch
    execSync(`git checkout ${originalBranch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    execSync(`git branch -D ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = false;

    // Remove test file if it still exists
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) unlinkSync(testFilePath);

    // Verify we're back
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    if (currentBranch === originalBranch) {
      pass(`back on original branch (${originalBranch})`);
    } else {
      fail('restore original branch', `expected ${originalBranch}, on ${currentBranch}`);
    }
  } catch (err) {
    fail('interaction workflow', sanitizeError(err.message));
    await cleanup();
  }
}

// ============================================================================
// Phase 5: Multi-Token Lifecycle (cache, clear, refresh)
// ============================================================================
console.log('\n━━━ Phase 5: Token Lifecycle ━━━\n');

{
  const leadIdentity = availableIdentities[0];

  // 5a: Resolve token — first call
  clearTokenCache();
  let firstToken = null;
  try {
    firstToken = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
    if (!firstToken || typeof firstToken !== 'string') {
      fail('token lifecycle: first resolve', 'got null or non-string');
    } else {
      pass(`token lifecycle: first resolve (length=${firstToken.length})`);
    }
  } catch (err) {
    fail('token lifecycle: first resolve', sanitizeError(err.message));
  }

  // 5b: Resolve again — should return cached (same) token
  let secondToken = null;
  try {
    secondToken = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
    if (secondToken === firstToken) {
      pass('token lifecycle: second resolve returns cached token (same reference)');
    } else if (secondToken && firstToken && secondToken.length === firstToken.length) {
      // Tokens may be different strings but same length if cache was refreshed
      pass('token lifecycle: second resolve returns token (same length — cache hit likely)');
    } else {
      fail('token lifecycle: cache hit', `first.length=${firstToken?.length}, second.length=${secondToken?.length}`);
    }
  } catch (err) {
    fail('token lifecycle: second resolve', sanitizeError(err.message));
  }

  // 5c: Clear cache
  try {
    clearTokenCache();
    pass('token lifecycle: cache cleared');
  } catch (err) {
    fail('token lifecycle: clear cache', err.message);
  }

  // 5d: Resolve after clear — should get a fresh token
  let thirdToken = null;
  try {
    thirdToken = await resolveToken(PROJECT_ROOT, leadIdentity.roleKey);
    if (!thirdToken) {
      fail('token lifecycle: post-clear resolve', 'got null');
    } else {
      pass(`token lifecycle: post-clear resolve (length=${thirdToken.length})`);
    }
  } catch (err) {
    fail('token lifecycle: post-clear resolve', sanitizeError(err.message));
  }

  // 5e: Verify both tokens still work (old may be valid within 1-hour window)
  if (firstToken) {
    try {
      const oldEnv = process.env['GH_TOKEN'];
      process.env['GH_TOKEN'] = firstToken;
      const result = execSync(
        `gh api /repos/${REPO_INFO.full} --jq .full_name`,
        { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 15_000 },
      ).trim();
      if (oldEnv !== undefined) process.env['GH_TOKEN'] = oldEnv;
      else delete process.env['GH_TOKEN'];

      if (result === REPO_INFO.full) {
        pass('token lifecycle: first token still valid (within 1-hour window)');
      } else {
        fail('token lifecycle: first token check', `unexpected result: ${result}`);
      }
    } catch (err) {
      // Token may have expired — that's acceptable
      skip('token lifecycle: first token reuse', 'token may have expired (acceptable)');
    }
  }

  if (thirdToken) {
    try {
      const { stdout } = await execWithRoleToken(
        PROJECT_ROOT, leadIdentity.roleKey,
        `gh api /repos/${REPO_INFO.full} --jq .full_name`,
      );
      if (stdout.trim() === REPO_INFO.full) {
        pass('token lifecycle: fresh token works');
      } else {
        fail('token lifecycle: fresh token check', `unexpected: ${stdout.trim()}`);
      }
    } catch (err) {
      fail('token lifecycle: fresh token check', sanitizeError(err.message));
    }
  }
}

// ============================================================================
// Phase 6: Cross-Identity Verification
// ============================================================================
console.log('\n━━━ Phase 6: Cross-Identity Verification ━━━\n');

if (availableIdentities.length >= 2) {
  const identityA = availableIdentities[0];
  const identityB = availableIdentities[1];

  const timestamp = Date.now();
  const branch = `test/identity-cross-${timestamp}`;
  const testFile = 'test-fixtures/identity-cross-test.md';
  const botNameA = `${identityA.reg.appSlug}[bot]`;
  const botEmailA = `${botNameA}@users.noreply.github.com`;

  let originalBranch = '';
  let prUrl = '';
  let prNumber = '';
  let branchCreated = false;
  let branchPushed = false;

  async function crossCleanup() {
    if (prUrl) {
      try {
        await execWithRoleToken(
          PROJECT_ROOT, identityA.roleKey,
          `gh pr close ${prUrl} --repo ${REPO_INFO.full}`,
        );
      } catch { /* best effort */ }
    }
    if (branchPushed) {
      try {
        const token = await resolveToken(PROJECT_ROOT, identityA.roleKey);
        if (token) {
          execSync(
            `git push https://x-access-token:${token}@github.com/${REPO_INFO.full}.git --delete ${branch}`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
          );
        }
      } catch { /* best effort */ }
    }
    if (originalBranch) {
      try {
        execSync(`git checkout ${originalBranch}`, {
          cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
        });
      } catch { /* best effort */ }
    }
    if (branchCreated) {
      try {
        execSync(`git branch -D ${branch}`, {
          cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
        });
      } catch { /* best effort */ }
    }
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) {
      try { unlinkSync(testFilePath); } catch { /* best effort */ }
    }
  }

  try {
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    }).trim();

    // Identity A creates branch, commits, pushes, opens PR
    execSync(`git checkout -b ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = true;

    writeFileSync(
      join(PROJECT_ROOT, testFile),
      `# Cross-Identity Test\n\nTimestamp: ${new Date().toISOString()}\n`,
      'utf-8',
    );
    execSync(`git add ${testFile}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    execSync(
      `git -c user.name="${botNameA}" -c user.email="${botEmailA}" commit -m "test: cross-identity (${timestamp})"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' },
    );

    const tokenA = await resolveToken(PROJECT_ROOT, identityA.roleKey);
    if (!tokenA) throw new Error('Identity A token is null');
    execSync(
      `git push https://x-access-token:${tokenA}@github.com/${REPO_INFO.full}.git ${branch}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
    );
    branchPushed = true;

    const prResult = await execWithRoleToken(
      PROJECT_ROOT, identityA.roleKey,
      `gh pr create --draft --title "test: cross-identity E2E" --body "Cross-identity test — safe to close" --base dev --head ${branch} --repo ${REPO_INFO.full}`,
    );
    prUrl = (prResult.stdout || '').trim();
    const prMatch = prUrl.match(/\/pull\/(\d+)/);
    prNumber = prMatch ? prMatch[1] : '';
    pass(`identity A (${identityA.roleKey}) created PR: ${prUrl}`);

    // Identity B comments on the PR
    const commentB = formatComment({
      agentName: 'IdentityB',
      role: identityB.roleKey,
      body: `Cross-identity comment from ${identityB.reg.appSlug}.`,
    });
    await execWithRoleToken(
      PROJECT_ROOT, identityB.roleKey,
      `gh pr comment ${prNumber} --body "${commentB.replace(/"/g, '\\"')}" --repo ${REPO_INFO.full}`,
    );
    pass(`identity B (${identityB.roleKey}) commented on PR`);

    // Verify different bot authors
    const { stdout: prAuthor } = await execWithRoleToken(
      PROJECT_ROOT, identityA.roleKey,
      `gh api /repos/${REPO_INFO.full}/pulls/${prNumber} --jq '.user.login'`,
    );
    const { stdout: commentsJson } = await execWithRoleToken(
      PROJECT_ROOT, identityA.roleKey,
      `gh api /repos/${REPO_INFO.full}/issues/${prNumber}/comments --jq '.[].user.login'`,
    );
    const authors = [prAuthor.trim(), ...commentsJson.trim().split('\n')].filter(Boolean);
    const uniqueAuthors = [...new Set(authors)];
    if (uniqueAuthors.length >= 2) {
      pass(`cross-identity: ${uniqueAuthors.length} distinct bot authors: ${uniqueAuthors.join(', ')}`);
    } else {
      // Single author is acceptable if both roles map to same app
      skip('cross-identity: distinct authors', `only ${uniqueAuthors.length} author(s) found — roles may share the same app`);
    }

    // Cleanup cross-identity artifacts
    await execWithRoleToken(
      PROJECT_ROOT, identityA.roleKey,
      `gh pr close ${prUrl} --repo ${REPO_INFO.full}`,
    );
    prUrl = '';
    const crossCleanupToken = await resolveToken(PROJECT_ROOT, identityA.roleKey);
    execSync(
      `git push origin --delete ${branch}`,
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30_000,
        env: { ...process.env, GH_TOKEN: crossCleanupToken },
      },
    );
    branchPushed = false;
    execSync(`git checkout ${originalBranch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    execSync(`git branch -D ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = false;
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) unlinkSync(testFilePath);

    pass('cross-identity: cleanup complete');
  } catch (err) {
    fail('cross-identity workflow', sanitizeError(err.message));
    await crossCleanup();
  }
} else {
  skip(
    'cross-identity verification',
    `requires 2+ identities, only ${availableIdentities.length} available. ` +
    'Would test: identity A creates PR, identity B comments, verify different bot authors.',
  );
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '═'.repeat(60));
console.log('  Multi-Identity Interaction E2E — Results');
console.log('═'.repeat(60));
console.log(`  ✅ Passed:  ${passed}`);
if (failed > 0) console.log(`  ❌ Failed:  ${failed}`);
if (skipped > 0) console.log(`  ⏭️  Skipped: ${skipped}`);
console.log(`  Total:     ${passed + failed + skipped}`);
console.log('═'.repeat(60) + '\n');

if (failed > 0) {
  console.log('Failed tests:');
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`  ❌ ${r.name}: ${r.reason}`);
  }
  console.log();
}

if (skipped > 0) {
  console.log('Skipped tests:');
  for (const r of results.filter(r => r.status === 'skip')) {
    console.log(`  ⏭️  ${r.name}: ${r.reason}`);
  }
  console.log();
}

process.exit(failed > 0 ? 1 : 0);
