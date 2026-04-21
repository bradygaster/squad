#!/usr/bin/env node
/**
 * test-identity-e2e.mjs — End-to-end identity smoke tests
 *
 * Exercises the full identity workflow against a real GitHub App registration
 * (the 'lead' role). Requires:
 *   - A .squad/identity/ directory with a configured 'lead' app
 *   - The 'lead' PEM key at .squad/identity/keys/lead.pem
 *   - The squad-sdk and squad-cli packages built (dist/ present)
 *
 * Usage:  node scripts/test-identity-e2e.mjs
 *
 * This is a standalone runner — NOT a vitest test. It imports from the
 * built SDK via the package subpath exports and shells out to the CLI
 * for command-level tests.
 *
 * Read-only except for the update round-trip test, which restores
 * the original installation ID.
 */

import { execSync, execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';

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
  resolveRoleSlug,
} from '@bradygaster/squad-sdk/identity';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CLI_BIN = resolve(PROJECT_ROOT, 'cli.js');

// ---------------------------------------------------------------------------
// Derive owner/repo from git remote
// ---------------------------------------------------------------------------
function getOwnerRepo() {
  const url = execSync('git remote get-url origin', {
    cwd: PROJECT_ROOT, encoding: 'utf-8',
  }).trim();
  // Handles HTTPS (github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git)
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
  results.push({ name, status: 'fail', reason });
  console.error(`  ❌ ${name}`);
  console.error(`     ${reason}`);
}

function skip(name, reason) {
  skipped++;
  results.push({ name, status: 'skip', reason });
  console.log(`  ⏭️  ${name} — ${reason}`);
}

/** Run a CLI command and return { stdout, stderr, exitCode }. */
function cli(args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, ...args], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------
console.log('\n🔍 Preflight checks\n');

const config = loadIdentityConfig(PROJECT_ROOT);
if (!config) {
  console.error('❌ No identity configuration found at .squad/identity/config.json');
  console.error('   This E2E test requires a configured identity. Exiting.');
  process.exit(1);
}

const leadReg = loadAppRegistration(PROJECT_ROOT, 'lead');
if (!leadReg) {
  console.error('❌ No app registration for "lead" role.');
  console.error('   Run: squad identity create --role lead');
  process.exit(1);
}

if (!hasPrivateKey(PROJECT_ROOT, 'lead')) {
  console.error('❌ PEM key missing for "lead" role.');
  console.error('   Expected at: .squad/identity/keys/lead.pem');
  process.exit(1);
}

console.log(`  Lead app: ${leadReg.appSlug} (appId=${leadReg.appId}, install=${leadReg.installationId})`);
console.log(`  Config tier: ${config.tier}`);
console.log();

// Save original installation ID for the round-trip restore
const originalInstallationId = leadReg.installationId;

// ============================================================================
// Test 1: squad identity status
// ============================================================================
console.log('━━━ Test 1: squad identity status ━━━\n');

try {
  const { stdout, exitCode } = cli(['identity', 'status']);
  if (exitCode !== 0) {
    fail('identity status exits 0', `exit code was ${exitCode}`);
  } else if (!stdout.includes('lead') || !stdout.includes(String(leadReg.appId))) {
    fail('identity status shows lead app', `output missing lead app info:\n${stdout}`);
  } else {
    pass('identity status shows lead app');
  }
} catch (err) {
  fail('identity status', err.message);
}

// ============================================================================
// Test 2: squad identity update --role lead (auto-detect)
// ============================================================================
console.log('\n━━━ Test 2: squad identity update --role lead (auto-detect) ━━━\n');

try {
  const { stdout, stderr, exitCode } = cli(['identity', 'update', '--role', 'lead']);
  if (exitCode === 0 && stdout.includes('Updated installation ID')) {
    const afterReg = loadAppRegistration(PROJECT_ROOT, 'lead');
    if (!afterReg || afterReg.installationId <= 0) {
      fail('update auto-detect writes valid ID', `installationId=${afterReg?.installationId}`);
    } else {
      pass(`update auto-detect writes valid ID (${afterReg.installationId})`);
    }
  } else if (exitCode !== 0 && (stdout + stderr).includes('No installation found')) {
    // App exists but isn't installed on any repo — environment-dependent
    skip('update auto-detect', 'app has no discoverable installation (install the app first)');
  } else {
    fail('update auto-detect', `exit=${exitCode}, output:\n${stdout}${stderr}`);
  }
} catch (err) {
  fail('update auto-detect', err.message);
}

// ============================================================================
// Test 3: squad identity update --role lead --installation-id 999999 (manual)
// ============================================================================
console.log('\n━━━ Test 3: squad identity update --role lead --installation-id 999999 ━━━\n');

try {
  const { stdout, exitCode } = cli([
    'identity', 'update', '--role', 'lead', '--installation-id', '999999',
  ]);
  if (exitCode !== 0) {
    fail('update manual override exits 0', `exit code was ${exitCode}`);
  } else {
    const afterReg = loadAppRegistration(PROJECT_ROOT, 'lead');
    if (afterReg?.installationId === 999999) {
      pass('update manual override sets installationId=999999');
    } else {
      fail('update manual override sets 999999', `got ${afterReg?.installationId}`);
    }
  }
} catch (err) {
  fail('update manual override', err.message);
}

// ============================================================================
// Test 4: squad identity update --role lead (restore original)
// ============================================================================
console.log('\n━━━ Test 4: squad identity update --role lead (restore) ━━━\n');

try {
  const { stdout, exitCode } = cli(['identity', 'update', '--role', 'lead']);
  if (exitCode !== 0) {
    // If auto-detect fails (e.g. network), restore manually
    console.log('  ⚠️  Auto-detect failed — restoring via manual override');
    cli(['identity', 'update', '--role', 'lead', '--installation-id', String(originalInstallationId)]);
  }
  const afterReg = loadAppRegistration(PROJECT_ROOT, 'lead');
  if (afterReg?.installationId === originalInstallationId) {
    pass(`restore original installationId=${originalInstallationId}`);
  } else if (afterReg?.installationId && afterReg.installationId > 0) {
    // Auto-detect may have found a different valid ID — acceptable
    pass(`restore found valid installationId=${afterReg.installationId} (may differ from original)`);
  } else {
    fail('restore original installationId', `got ${afterReg?.installationId}`);
  }
} catch (err) {
  // Safety net: always restore
  cli(['identity', 'update', '--role', 'lead', '--installation-id', String(originalInstallationId)]);
  fail('restore original installationId', err.message);
}

// ============================================================================
// Test 5: resolveToken('lead')
// ============================================================================
console.log('\n━━━ Test 5: resolveToken("lead") ━━━\n');

clearTokenCache();
try {
  const token = await resolveToken(PROJECT_ROOT, 'lead');
  if (!token) {
    fail('resolveToken returns a token', 'got null');
  } else if (typeof token !== 'string' || token.length < 10) {
    fail('resolveToken returns a valid token string', `got ${typeof token}, length=${token?.length}`);
  } else {
    pass(`resolveToken returns a token of length ${token.length}`);
  }
} catch (err) {
  fail('resolveToken', err.message);
}

// ============================================================================
// Test 6: execWithRoleToken — gh auth status
// ============================================================================
console.log('\n━━━ Test 6: execWithRoleToken — gh auth status ━━━\n');

clearTokenCache();
try {
  const { stdout, stderr } = await execWithRoleToken(PROJECT_ROOT, 'lead', 'gh auth status');
  // gh auth status may output to stderr
  const combined = stdout + stderr;
  if (combined.includes('Logged in') || combined.includes('Token:') || combined.includes('github.com')) {
    pass('execWithRoleToken runs gh auth status under bot token');
  } else {
    fail('execWithRoleToken gh auth status', `unexpected output:\n${combined}`);
  }
} catch (err) {
  // gh auth status may exit non-zero in some configurations but still show info
  const combined = (err.stdout ?? '') + (err.stderr ?? '') + err.message;
  if (combined.includes('github.com')) {
    pass('execWithRoleToken runs gh auth status (non-zero exit but shows info)');
  } else {
    fail('execWithRoleToken gh auth status', err.message);
  }
}

// ============================================================================
// Test 7: execWithRoleToken — gh api (verify bot can read the repo)
// ============================================================================
console.log('\n━━━ Test 7: execWithRoleToken — gh api (verify bot identity) ━━━\n');

clearTokenCache();
try {
  const { stdout } = await execWithRoleToken(
    PROJECT_ROOT, 'lead', `gh api /repos/${REPO_INFO.full} --jq .full_name`,
  );
  const repoName = stdout.trim();
  if (repoName === REPO_INFO.full) {
    pass(`gh api /repos/${REPO_INFO.full} readable (${repoName})`);
  } else {
    fail(`gh api /repos/${REPO_INFO.full}`, `expected "${REPO_INFO.full}", got: ${repoName}`);
  }
} catch (err) {
  const msg = err.message || '';
  if (msg.includes('401') || msg.includes('403')) {
    fail('execWithRoleToken gh api', `auth error: ${msg.substring(0, 200)}`);
  } else {
    fail('execWithRoleToken gh api', msg.substring(0, 200));
  }
}

// ============================================================================
// Test 8: Formatting — formatComment and formatCommitMessage
// ============================================================================
console.log('\n━━━ Test 8: Formatting ━━━\n');

// formatComment
try {
  const comment = formatComment({
    agentName: 'Flight',
    role: 'Lead',
    body: 'Architecture review complete.',
  });
  if (comment.includes('**Flight**') && comment.includes('Lead') && comment.includes('Architecture review')) {
    pass('formatComment produces correct output');
  } else {
    fail('formatComment', `unexpected output: ${comment}`);
  }
} catch (err) {
  fail('formatComment', err.message);
}

// formatComment — emoji mapping
try {
  const comment = formatComment({ agentName: 'Test', role: 'Core Dev', body: 'ok' });
  // 'Core Dev' should resolve to 'backend' slug → ⚙️ emoji
  if (comment.includes('⚙️')) {
    pass('formatComment maps "Core Dev" → backend emoji ⚙️');
  } else {
    fail('formatComment emoji mapping', `expected ⚙️ in: ${comment}`);
  }
} catch (err) {
  fail('formatComment emoji mapping', err.message);
}

// formatCommitMessage
try {
  const msg = formatCommitMessage({ agentName: 'Flight', message: 'refactor: extract auth module' });
  if (msg === '[Flight] refactor: extract auth module') {
    pass('formatCommitMessage produces [Agent] message format');
  } else {
    fail('formatCommitMessage', `expected "[Flight] refactor: extract auth module", got: ${msg}`);
  }
} catch (err) {
  fail('formatCommitMessage', err.message);
}

// resolveRoleSlug
try {
  const tests = [
    ['Tech Lead', 'lead'],
    ['Core Dev', 'backend'],
    ['QA', 'tester'],
    ['Documentation', 'docs'],
    ['DevOps', 'devops'],
    ['Unknown Role XYZ', 'backend'],  // default fallback
  ];
  let allOk = true;
  for (const [input, expected] of tests) {
    const got = resolveRoleSlug(input);
    if (got !== expected) {
      fail(`resolveRoleSlug("${input}")`, `expected "${expected}", got "${got}"`);
      allOk = false;
    }
  }
  if (allOk) {
    pass('resolveRoleSlug maps all test cases correctly');
  }
} catch (err) {
  fail('resolveRoleSlug', err.message);
}

// ============================================================================
// Test 9: Error cases
// ============================================================================
console.log('\n━━━ Test 9: Error cases ━━━\n');

// 9a: update with missing --role
try {
  const { exitCode, stderr } = cli(['identity', 'update']);
  if (exitCode !== 0) {
    pass('update without --role exits non-zero');
  } else {
    fail('update without --role should fail', 'exit code was 0');
  }
} catch (err) {
  fail('update without --role', err.message);
}

// 9b: update with unknown role
try {
  const { exitCode } = cli(['identity', 'update', '--role', 'nonexistent']);
  if (exitCode !== 0) {
    pass('update with unknown role exits non-zero');
  } else {
    fail('update with unknown role should fail', 'exit code was 0');
  }
} catch (err) {
  fail('update with unknown role', err.message);
}

// 9c: resolveToken for unconfigured role
clearTokenCache();
try {
  const token = await resolveToken(PROJECT_ROOT, 'nonexistent');
  if (token === null) {
    pass('resolveToken("nonexistent") returns null');
  } else {
    fail('resolveToken("nonexistent") should return null', `got: ${token}`);
  }
} catch (err) {
  // Throwing is also acceptable — non-fatal handled by exec wrappers
  pass('resolveToken("nonexistent") throws (acceptable)');
}

// 9d: loadAppRegistration for missing role
try {
  const reg = loadAppRegistration(PROJECT_ROOT, 'nonexistent');
  if (reg === null) {
    pass('loadAppRegistration("nonexistent") returns null');
  } else {
    fail('loadAppRegistration("nonexistent") should return null', `got: ${JSON.stringify(reg)}`);
  }
} catch (err) {
  fail('loadAppRegistration error case', err.message);
}

// 9e: hasPrivateKey for missing role
try {
  const has = hasPrivateKey(PROJECT_ROOT, 'nonexistent');
  if (has === false) {
    pass('hasPrivateKey("nonexistent") returns false');
  } else {
    fail('hasPrivateKey("nonexistent") should return false', `got: ${has}`);
  }
} catch (err) {
  fail('hasPrivateKey error case', err.message);
}

// ============================================================================
// Test 10: Git workflow — branch, commit, push, PR, cleanup
// ============================================================================
console.log('\n━━━ Test 10: Git workflow (branch → commit → push → PR → cleanup) ━━━\n');

{
  const timestamp = Date.now();
  const branch = `test/identity-e2e-${timestamp}`;
  const testFile = 'test-fixtures/identity-e2e-test.md';
  const botName = 'sabbour-squad-lead[bot]';
  const botEmail = 'sabbour-squad-lead[bot]@users.noreply.github.com';

  // Track state for cleanup
  let originalBranch = '';
  let prUrl = '';
  let branchCreated = false;
  let branchPushed = false;

  async function cleanup() {
    console.log('  🧹 Cleaning up...');

    // Close PR if opened (without --delete-branch to avoid local checkout switch)
    if (prUrl) {
      try {
        await execWithRoleToken(PROJECT_ROOT, 'lead', `gh pr close ${prUrl}`);
        console.log('     Closed PR');
      } catch { /* best effort */ }
    }

    // Delete remote branch separately (avoids the local checkout issue)
    if (branchPushed) {
      try {
        const token = await resolveToken(PROJECT_ROOT, 'lead');
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

    // Remove test file if it still exists
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) {
      try { unlinkSync(testFilePath); } catch { /* best effort */ }
    }
  }

  try {
    // Record current branch so we can switch back
    originalBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    }).trim();

    // 10a: Create test branch
    execSync(`git checkout -b ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = true;
    pass(`created branch ${branch}`);

    // 10b: Create test file
    const logDir = join(PROJECT_ROOT, '.squad', 'log');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(PROJECT_ROOT, testFile),
      `# Identity E2E Test\n\nTimestamp: ${new Date().toISOString()}\nBranch: ${branch}\n`,
      'utf-8',
    );
    pass('created test file');

    // 10c: Stage and commit with bot identity (using -c flags, not global config)
    execSync(`git add ${testFile}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    execSync(
      `git -c user.name="${botName}" -c user.email="${botEmail}" commit -m "test: identity E2E smoke test (${timestamp})"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' },
    );
    pass('committed with bot identity');

    // 10d: Push using bot token
    const token = await resolveToken(PROJECT_ROOT, 'lead');
    if (!token) throw new Error('resolveToken returned null — cannot push');

    execSync(
      `git push https://x-access-token:${token}@github.com/${REPO_INFO.full}.git ${branch}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' },
    );
    branchPushed = true;
    pass('pushed branch with bot token');

    // 10e: Open a draft PR
    const prResult = await execWithRoleToken(PROJECT_ROOT, 'lead',
      `gh pr create --draft --title "test: identity E2E smoke test" --body "Automated identity test — safe to close" --base dev --head ${branch}`,
    );
    prUrl = (prResult.stdout || '').trim();
    if (!prUrl || !prUrl.includes('github.com')) {
      throw new Error(`PR create did not return a URL: ${prUrl}`);
    }
    pass(`opened draft PR: ${prUrl}`);

    // 10f: Close the PR (without --delete-branch to avoid local checkout)
    await execWithRoleToken(PROJECT_ROOT, 'lead',
      `gh pr close ${prUrl}`,
    );
    prUrl = '';           // PR already closed

    // 10g: Delete remote branch with token-authenticated push
    const cleanupToken = await resolveToken(PROJECT_ROOT, 'lead');
    execSync(
      `git push https://x-access-token:${cleanupToken}@github.com/${REPO_INFO.full}.git --delete ${branch}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30_000 },
    );
    pass('closed PR and deleted remote branch');
    branchPushed = false;

    // 10h: Switch back and delete local branch
    execSync(`git checkout ${originalBranch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    execSync(`git branch -D ${branch}`, {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    });
    branchCreated = false;

    // Remove test file if it still exists locally
    const testFilePath = join(PROJECT_ROOT, testFile);
    if (existsSync(testFilePath)) unlinkSync(testFilePath);

    // Verify we're back on the original branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    if (currentBranch === originalBranch) {
      pass(`back on original branch (${originalBranch})`);
    } else {
      fail('restore original branch', `expected ${originalBranch}, on ${currentBranch}`);
    }
  } catch (err) {
    fail('git workflow', sanitizeError(err.message));
    await cleanup();
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '═'.repeat(50));
console.log(`  ✅ Passed: ${passed}`);
if (failed > 0) console.log(`  ❌ Failed: ${failed}`);
if (skipped > 0) console.log(`  ⏭️  Skipped: ${skipped}`);
console.log(`  Total:   ${passed + failed + skipped}`);
console.log('═'.repeat(50) + '\n');

if (failed > 0) {
  console.log('Failed tests:');
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`  ❌ ${r.name}: ${r.reason}`);
  }
  console.log();
}

process.exit(failed > 0 ? 1 : 0);
