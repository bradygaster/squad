/**
 * squad identity — manage agent GitHub App identity.
 *
 * Usage:
 *   squad identity status                — show identity configuration and app registration status
 *   squad identity create                — auto-detect roles from .squad/team.md
 *   squad identity create --role lead    — create a GitHub App for a single role
 *   squad identity create --all          — create GitHub Apps for all 8 roles
 *   squad identity create --simple       — create a single shared GitHub App
 *   squad identity create --import /path — import identity from another Squad repo
 *   squad identity update --role lead    — re-detect installation ID for existing app
 *   squad identity rotate --role lead    — open app settings to regenerate key
 *   squad identity rotate --role lead --import key.pem — import a new PEM key
 *
 * The create flow uses the GitHub App Manifest flow:
 *   1. Generate a manifest JSON describing the app
 *   2. Start a local HTTP server to catch the redirect callback
 *   3. Open the browser to GitHub's app creation page
 *   4. Wait for the redirect with the `code` parameter
 *   5. Exchange the code for app credentials
 *   6. Save credentials to `.squad/identity/`
 *
 * @module cli/commands/identity
 */

import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, appendFileSync, chmodSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { exec, execSync } from 'node:child_process';
import { platform } from 'node:os';
import { createPrivateKey } from 'node:crypto';
import {
  loadIdentityConfig,
  saveIdentityConfig,
  loadAppRegistration,
  saveAppRegistration,
  hasPrivateKey,
  clearTokenCache,
  generateAppJWT,
  resolveTokenWithDiagnostics,
  peekTokenCache,
  getInstallationPermissions,
} from '@bradygaster/squad-sdk';
import type { IdentityConfig, IdentityTier, RoleSlug } from '@bradygaster/squad-sdk';
import { resolveRoleSlug } from '@bradygaster/squad-sdk';
import { BOLD, RESET, GREEN, DIM, RED, YELLOW } from '../core/output.js';

/** All canonical role slugs. */
const ALL_ROLES: readonly RoleSlug[] = [
  'lead', 'frontend', 'backend', 'tester', 'devops', 'docs', 'security', 'data', 'scribe',
];

/** Default permissions for squad GitHub Apps. */
const DEFAULT_PERMISSIONS = {
  issues: 'write',
  pull_requests: 'write',
  contents: 'write',
  metadata: 'read',
  statuses: 'write',
  checks: 'read',
  actions: 'read',
} as const;

/** Human-readable descriptions per role for the GitHub App profile. */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  lead: 'Squad AI team lead — architecture decisions, code review, and project coordination.',
  frontend: 'Squad AI frontend developer — UI components, styling, and client-side logic.',
  backend: 'Squad AI backend developer — APIs, services, data access, and server-side logic.',
  tester: 'Squad AI tester — test strategy, test cases, quality assurance, and edge cases.',
  devops: 'Squad AI DevOps engineer — CI/CD, infrastructure, deployment, and automation.',
  docs: 'Squad AI documentation writer — technical docs, API references, and guides.',
  security: 'Squad AI security engineer — threat modeling, audits, and secure coding.',
  data: 'Squad AI data engineer — databases, analytics, data pipelines, and modeling.',
  scribe: 'Squad AI scribe — retro logs, pulse issues, velocity reports, and docs sweeps.',
  shared: 'Squad AI team — shared identity for all AI team member interactions.',
};

// ============================================================================
// Helpers
// ============================================================================

function resolveSquadDir(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.squad');
    if (existsSync(candidate)) {
      return dir;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function listAgents(projectRoot: string): string[] {
  const agentsDir = join(projectRoot, '.squad', 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

/**
 * Ensure .squad/identity/keys/ is covered by .gitignore.
 * Appends the rule if missing. Logs what it did.
 */
function ensureKeysIgnored(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const covered =
    content.includes('.squad/identity/keys') ||
    content.includes('.squad/identity/keys/') ||
    content.includes('*.pem');
  if (!covered) {
    appendFileSync(gitignorePath, '\n# Squad: private keys must never be committed\n.squad/identity/keys/\n');
    console.log(`  ${GREEN}✓${RESET} Added .squad/identity/keys/ to .gitignore`);
  }
}

/**
 * Get the GitHub username via `gh api user`.
 * Falls back to 'squad-user' if gh CLI is not available.
 */
async function getGitHubUsername(): Promise<string> {
  return new Promise((resolve) => {
    exec('gh api user --jq .login', { timeout: 10_000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve('squad-user');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/** Prompt the user with a question and return their answer. */
function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Open a URL in the default browser (cross-platform).
 * Falls back to printing the URL if opening fails.
 */
function openBrowser(url: string): void {
  const os = platform();
  let cmd: string;
  if (os === 'darwin') {
    cmd = `open "${url}"`;
  } else if (os === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      console.log(`\n  ${YELLOW}⚠️${RESET}  Could not open browser automatically.`);
      console.log(`  Open this URL manually:\n  ${DIM}${url}${RESET}\n`);
    }
  });
}

/**
 * Build the GitHub App manifest JSON for the manifest flow.
 */
function buildManifest(
  appName: string,
  username: string,
  callbackUrl: string,
  roleSlug?: string,
): object {
  const description = ROLE_DESCRIPTIONS[roleSlug ?? 'shared']
    ?? ROLE_DESCRIPTIONS.shared;

  return {
    name: appName,
    url: `https://github.com/${username}`,
    description,
    hook_attributes: { url: `https://example.com/no-op`, active: false },
    redirect_url: callbackUrl,
    public: false,
    default_permissions: DEFAULT_PERMISSIONS,
    default_events: [],
  };
}

/**
 * Start a local HTTP server, serve the manifest form page, and wait for
 * the GitHub redirect with the `code` parameter.
 *
 * Returns the code from the callback.
 */
async function waitForManifestCode(
  manifestTemplate: object,
): Promise<{ code: string; port: number }> {
  return new Promise((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      // Serve the auto-submitting form page at /
      if (url.pathname === '/' && !url.searchParams.has('code')) {
        // Now we know the port — patch the manifest with the real callback URL
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const realCallbackUrl = `http://localhost:${port}`;
        const manifest = { ...manifestTemplate, redirect_url: realCallbackUrl };
        const manifestJson = JSON.stringify(manifest);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><head><title>Squad — GitHub App Setup</title></head>
<body>
  <h2>Creating GitHub App...</h2>
  <p>If the form doesn't submit automatically, click the button below.</p>
  <form id="manifest-form" action="https://github.com/settings/apps/new" method="post">
    <input type="hidden" name="manifest" value='${manifestJson.replace(/'/g, '&#39;')}'>
    <button type="submit">Create GitHub App</button>
  </form>
  <script>document.getElementById('manifest-form').submit();</script>
</body></html>`);
        return;
      }

      // Handle the callback with the code
      const code = url.searchParams.get('code');
      if (code) {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html><head><title>Squad — Success</title></head>
<body>
  <h2>✅ GitHub App created!</h2>
  <p>You can close this tab and return to the terminal.</p>
</body></html>`);
        clearTimeout(timeoutHandle);
        server.close();
        resolve({ code, port });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start local server'));
        return;
      }
      const port = addr.port;
      const localUrl = `http://localhost:${port}`;
      console.log(`\n  ${DIM}Local callback server listening on ${localUrl}${RESET}`);
      openBrowser(localUrl);
      console.log(`  Waiting for GitHub App creation...\n`);
    });

    server.on('error', (err) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });

    // Timeout after 5 minutes
    timeoutHandle = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for GitHub App creation (5 min)'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Exchange the manifest code for app credentials via GitHub API.
 * Uses `gh api` CLI (reliable in WSL) with fetch as fallback.
 */
async function exchangeManifestCode(code: string): Promise<{
  id: number;
  slug: string;
  pem: string;
  webhook_secret: string;
  client_id: string;
  client_secret: string;
}> {
  // Try gh CLI first — it handles auth, proxies, and DNS reliably
  try {
    const result = execSync(
      `gh api -X POST "app-manifests/${code}/conversions"`,
      { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const data = JSON.parse(result);
    return data;
  } catch {
    // gh CLI failed — fall back to fetch
  }

  const url = `https://api.github.com/app-manifests/${code}/conversions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    id: number;
    slug: string;
    pem: string;
    webhook_secret: string;
    client_id: string;
    client_secret: string;
  };

  return data;
}

/**
 * Get the installation ID for a newly created app.
 * Uses fetch with JWT auth, falling back to curl for WSL compatibility.
 */
async function getAppInstallationId(jwt: string): Promise<number | null> {
  // Try fetch first
  try {
    const response = await fetch('https://api.github.com/app/installations', {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) return null;

    const installations = (await response.json()) as Array<{ id: number }>;
    return installations[0]?.id ?? null;
  } catch {
    // fetch failed (WSL DNS issue) — fall back to curl
  }

  try {
    const result = execSync(
      `curl -sf -H "Authorization: Bearer ${jwt}" -H "Accept: application/vnd.github+json" https://api.github.com/app/installations`,
      { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const installations = JSON.parse(result) as Array<{ id: number }>;
    return installations[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Simple delay helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Save credentials from the manifest flow to the identity directory.
 */
function saveCredentials(
  projectRoot: string,
  key: string,
  appData: { id: number; slug: string; pem: string },
  installationId: number,
  tier: IdentityTier,
  roleSlug?: RoleSlug,
): void {
  // Save PEM key with restricted permissions (0o600 — owner read/write only)
  const keysDir = join(projectRoot, '.squad', 'identity', 'keys');
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(join(keysDir, `${key}.pem`), appData.pem, { encoding: 'utf-8', mode: 0o600 });

  // Ensure .gitignore covers the keys directory
  ensureKeysIgnored(projectRoot);

  // Save app registration
  saveAppRegistration(projectRoot, key, {
    appId: appData.id,
    appSlug: appData.slug,
    installationId,
    roleSlug,
    tier,
  });

  // Update config
  const config = loadIdentityConfig(projectRoot) ?? { tier, apps: {} };
  config.tier = tier;
  if (!config.apps) config.apps = {};
  config.apps[key] = {
    appId: appData.id,
    appSlug: appData.slug,
    installationId,
    roleSlug,
    tier,
  };
  saveIdentityConfig(projectRoot, config);
}

// ============================================================================
// Subcommands
// ============================================================================

function runStatus(projectRoot: string): void {
  const config = loadIdentityConfig(projectRoot);

  if (!config) {
    console.log(`\n${YELLOW}⚠️${RESET}  No identity configuration found.`);
    console.log(`   Run ${BOLD}squad identity create${RESET} for setup instructions.\n`);
    return;
  }

  console.log(`\n${BOLD}Identity configuration:${RESET}`);
  console.log(`  Tier: ${BOLD}${config.tier}${RESET}`);

  const appKeys = Object.keys(config.apps ?? {});
  if (appKeys.length === 0) {
    console.log(`\n  ${DIM}No app registrations configured.${RESET}\n`);
    return;
  }

  console.log(`\n  App registrations:`);

  const brokenRoles: string[] = [];

  for (const key of appKeys) {
    const reg = loadAppRegistration(projectRoot, key);
    const keyExists = hasPrivateKey(projectRoot, key);

    if (reg) {
      const keyStatus = keyExists
        ? `${GREEN}✓ key${RESET}`
        : `${RED}✗ no key${RESET}`;
      const installStatus = reg.installationId === 0
        ? `  ${RED}⚠ no installation${RESET}`
        : `  ${DIM}install ${reg.installationId}${RESET}`;
      console.log(
        `    ${BOLD}${key}${RESET}  ${DIM}→${RESET}  ${reg.appSlug} (app ${reg.appId})  ${keyStatus}${installStatus}`,
      );
      if (reg.installationId === 0 && keyExists) {
        brokenRoles.push(key);
      }
    } else {
      console.log(
        `    ${BOLD}${key}${RESET}  ${DIM}→${RESET}  ${RED}missing registration file${RESET}`,
      );
    }
  }

  if (brokenRoles.length > 0) {
    console.log(`\n  ${YELLOW}⚠️${RESET}  ${brokenRoles.length === 1 ? 'Role' : 'Roles'} with missing installation ID: ${BOLD}${brokenRoles.join(', ')}${RESET}`);
    console.log(`     Run ${BOLD}squad identity update --role ${brokenRoles[0]}${RESET} to re-detect the installation.`);
  }

  // Show agent mapping summary
  const agents = listAgents(projectRoot);
  if (agents.length > 0 && config.tier !== 'shared') {
    console.log(`\n  ${DIM}Agents: ${agents.join(', ')}${RESET}`);
  }

  console.log();
}

/**
 * Wait for the user to install the app, polling indefinitely until detected or
 * the user cancels with Ctrl+C. Keeps the UX tight — one command, fully working
 * identity at the end.
 */
async function waitForInstallation(
  jwt: string,
  appSlug: string,
  key: string,
): Promise<number> {
  const installUrl = `https://github.com/apps/${appSlug}/installations/select_target`;
  console.log(`\n  ${BOLD}App created! Now install it on your repository.${RESET}`);
  openBrowser(installUrl);
  console.log(`  ${DIM}${installUrl}${RESET}`);
  console.log(`\n  Waiting for installation... (Ctrl+C to cancel)\n`);

  // Poll every 3s with no hard timeout — user controls via Ctrl+C
  while (true) {
    const id = await getAppInstallationId(jwt);
    if (id) {
      console.log(`  ${GREEN}✓${RESET} App installed — installation ID ${id}`);
      return id;
    }
    await sleep(3_000);
  }
}

/**
 * Resolve a missing installation ID for an already-created app.
 * Used when `create` is re-run on a role that already has credentials but
 * installationId: 0. Makes `create` idempotent.
 */
async function resolveInstallationForExistingApp(
  projectRoot: string,
  key: string,
  tier: IdentityTier,
  roleSlug?: RoleSlug,
): Promise<boolean> {
  const reg = loadAppRegistration(projectRoot, key);
  if (!reg) return false;

  if (reg.installationId !== 0) {
    console.log(`\n${GREEN}✅${RESET} App ${BOLD}${reg.appSlug}${RESET} already configured (installation ${reg.installationId}).`);
    return true;
  }

  if (!hasPrivateKey(projectRoot, key)) {
    console.error(`${RED}✗${RESET} App exists but PEM key is missing for '${key}'.`);
    return false;
  }

  console.log(`\n  App ${BOLD}${reg.appSlug}${RESET} exists but installation is incomplete. Resolving...`);

  const pemPath = join(projectRoot, '.squad', 'identity', 'keys', `${key}.pem`);
  const pem = readFileSync(pemPath, 'utf-8');
  const { generateAppJWT } = await import('@bradygaster/squad-sdk');
  const jwt = await generateAppJWT(reg.appId, pem);

  // Try immediate detection first
  let installationId = await getAppInstallationId(jwt);
  if (!installationId) {
    installationId = await waitForInstallation(jwt, reg.appSlug, key);
  }

  // Update stored registration
  const updatedReg = { ...reg, installationId };
  saveAppRegistration(projectRoot, key, updatedReg);

  const config = loadIdentityConfig(projectRoot);
  if (config?.apps?.[key]) {
    config.apps[key].installationId = installationId;
    saveIdentityConfig(projectRoot, config);
  }

  clearTokenCache();
  console.log(`${GREEN}✅${RESET} Installation resolved for ${BOLD}${key}${RESET} → ${installationId}`);

  // Verify the identity works end-to-end: resolve a token
  try {
    const { resolveToken } = await import('@bradygaster/squad-sdk');
    const token = await resolveToken(projectRoot, key);
    if (token) {
      console.log(`  ${GREEN}✓${RESET} Token verified — identity is working\n`);
    } else {
      console.log(`  ${YELLOW}⚠${RESET} Installation saved but token resolution returned null\n`);
    }
  } catch {
    console.log(`  ${YELLOW}⚠${RESET} Installation saved but token verification failed (non-fatal)\n`);
  }

  return true;
}

/**
 * Import app credentials from another Squad repo into the current one.
 * Copies the app registration JSON and PEM key, updates the local config,
 * then triggers the installation resolution flow so the user can install
 * the app on the current repo.
 */
async function importAppCredentials(
  sourceRoot: string,
  targetRoot: string,
  key: string,
  tier: IdentityTier,
  roleSlug?: RoleSlug,
): Promise<boolean> {
  const sourceReg = loadAppRegistration(sourceRoot, key);
  if (!sourceReg) {
    console.log(`  ${DIM}No app registration for '${key}' in source repo — skipping import.${RESET}`);
    return false;
  }

  const sourcePemPath = join(sourceRoot, '.squad', 'identity', 'keys', `${key}.pem`);
  if (!existsSync(sourcePemPath)) {
    console.error(`${RED}✗${RESET} Source repo has app registration for '${key}' but PEM key is missing.`);
    return false;
  }

  console.log(`\n  Importing ${BOLD}${sourceReg.appSlug}${RESET} from source repo...`);

  // Copy PEM key (copyFileSync doesn't support mode; chmod separately)
  const targetKeysDir = join(targetRoot, '.squad', 'identity', 'keys');
  mkdirSync(targetKeysDir, { recursive: true });
  const targetPemPath = join(targetKeysDir, `${key}.pem`);
  copyFileSync(sourcePemPath, targetPemPath);
  try { chmodSync(targetPemPath, 0o600); } catch { /* non-fatal on platforms that don't support it */ }

  // Ensure .gitignore covers the keys directory
  ensureKeysIgnored(targetRoot);

  // Copy app registration (with installationId reset to 0 — new repo needs its own installation)
  const importedReg = { ...sourceReg, installationId: 0, roleSlug, tier };
  saveAppRegistration(targetRoot, key, importedReg);

  // Update local config
  const config = loadIdentityConfig(targetRoot) ?? { tier, apps: {} };
  config.tier = tier;
  if (!config.apps) config.apps = {};
  config.apps[key] = importedReg;
  saveIdentityConfig(targetRoot, config);

  console.log(`  ${GREEN}✓${RESET} Imported app registration and key for '${key}'.`);

  // Now resolve installation on the current repo
  return resolveInstallationForExistingApp(targetRoot, key, tier, roleSlug);
}

/**
 * Create a GitHub App for a single role (or 'shared') using the manifest flow.
 * Idempotent — if the app already exists, skips creation and resolves installation.
 *
 * Before opening the browser, checks with the user if the app name already
 * exists on GitHub (e.g., from another repo). If so, offers to import
 * credentials from the source repo or use a different name.
 */
async function createAppForRole(
  projectRoot: string,
  key: string,
  username: string,
  tier: IdentityTier,
  roleSlug?: RoleSlug,
  importSource?: string,
): Promise<boolean> {
  // Idempotent: if app already exists locally, skip creation and resolve installation
  const existingReg = loadAppRegistration(projectRoot, key);
  if (existingReg) {
    return resolveInstallationForExistingApp(projectRoot, key, tier, roleSlug);
  }

  // Import path: copy credentials from another repo instead of creating a new app
  if (importSource) {
    return importAppCredentials(importSource, projectRoot, key, tier, roleSlug);
  }

  let appName = tier === 'shared'
    ? `${username}-squad`
    : `${username}-squad-${key}`;

  // GitHub has no API to pre-check app name availability, so ask the user
  // before opening the browser (avoids the "name already taken" dead end).
  console.log(`\n  App name: ${BOLD}${appName}${RESET}`);
  console.log(`  ${DIM}(1)${RESET} Create new app ${DIM}(opens browser)${RESET}`);
  console.log(`  ${DIM}(2)${RESET} Already exists — reuse from another repo`);
  console.log(`  Or type a custom app name`);
  const choice = await ask(`\n  Choice [1]: `);

  if (choice === '2') {
    let sourcePath = (await ask(
      `  Path to repo with existing identity (has .squad/identity/): `,
    )).replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? '~');
    // Accept both repo root and direct .squad/identity path
    if (sourcePath.endsWith('.squad/identity') || sourcePath.endsWith('.squad/identity/')) {
      sourcePath = join(sourcePath, '..', '..');
    } else if (sourcePath.endsWith('.squad') || sourcePath.endsWith('.squad/')) {
      sourcePath = join(sourcePath, '..');
    }
    if (!sourcePath || !existsSync(join(sourcePath, '.squad', 'identity'))) {
      console.log(`\n  ${RED}✗${RESET} No identity config found at that path.`);
      return false;
    }
    return importAppCredentials(sourcePath, projectRoot, key, tier, roleSlug);
  } else if (choice && choice !== '1' && choice.length > 0) {
    appName = choice;
    console.log(`  Using custom name: ${BOLD}${appName}${RESET}`);
  }

  console.log(`\n${BOLD}Creating GitHub App: ${appName}${RESET}`);

  // Build manifest — port is determined when server starts, so use placeholder
  // that gets replaced once we know the port
  const callbackPlaceholder = 'http://localhost:0';
  const manifest = buildManifest(appName, username, callbackPlaceholder, roleSlug ?? (tier === 'shared' ? 'shared' : undefined));

  try {
    // Wait for the code from the manifest flow
    const { code } = await waitForManifestCode(manifest);

    console.log(`  ${DIM}Received code, exchanging for credentials...${RESET}`);

    // Exchange code for app credentials
    const appData = await exchangeManifestCode(code);

    // Generate a JWT to fetch installations
    const { generateAppJWT } = await import('@bradygaster/squad-sdk');
    const jwt = await generateAppJWT(appData.id, appData.pem);

    // Get installation ID (user needs to install the app first)
    let installationId = await getAppInstallationId(jwt);

    if (!installationId) {
      installationId = await waitForInstallation(jwt, appData.slug, key);
    }

    // Save credentials
    saveCredentials(projectRoot, key, appData, installationId, tier, roleSlug);

    console.log(`${GREEN}✅${RESET} Created ${BOLD}${appName}${RESET} — app ID ${appData.id}`);

    // Verify token works
    try {
      clearTokenCache();
      const { resolveToken } = await import('@bradygaster/squad-sdk');
      const token = await resolveToken(projectRoot, key);
      if (token) {
        console.log(`  ${GREEN}✓${RESET} Token verified — identity is working`);
      } else {
        console.log(`  ${YELLOW}⚠${RESET} App created but token resolution returned null`);
      }
    } catch {
      console.log(`  ${YELLOW}⚠${RESET} App created but token verification failed (non-fatal)`);
    }

    // Avatar upload instructions (GitHub API doesn't support programmatic logo upload)
    const avatarSlug = roleSlug ?? 'lead';
    const avatarFile = `docs/proposals/avatars/${avatarSlug}.png`;
    const appSettingsUrl = `https://github.com/settings/apps/${appData.slug}`;
    console.log(`\n  ${DIM}📷 To set the avatar, go to:${RESET}`);
    console.log(`  ${DIM}${appSettingsUrl}${RESET}`);
    console.log(`  ${DIM}Upload ${BOLD}${avatarFile}${RESET}${DIM} under "Display information → Logo"${RESET}\n`);

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}✗${RESET} Failed to create ${appName}: ${msg}`);
    return false;
  }
}

/**
 * Parse `.squad/team.md` to extract member roles and their resolved slugs.
 * Returns an array of { name, role, slug } or null if team.md is missing/empty.
 */
function parseTeamRoles(projectRoot: string): { name: string; role: string; slug: RoleSlug }[] | null {
  const teamPath = join(projectRoot, '.squad', 'team.md');
  if (!existsSync(teamPath)) return null;

  const content = readFileSync(teamPath, 'utf-8');
  const lines = content.split('\n');

  // Find the ## Members section and its table
  let inMembers = false;
  let headerParsed = false;
  const members: { name: string; role: string; slug: RoleSlug }[] = [];

  for (const line of lines) {
    if (/^## Members\b/i.test(line)) {
      inMembers = true;
      continue;
    }
    if (inMembers && /^## /.test(line)) break; // next section

    if (!inMembers) continue;

    // Skip header row and separator
    if (!headerParsed) {
      if (line.includes('|') && line.includes('Name') && line.includes('Role')) {
        headerParsed = true;
      }
      continue;
    }
    if (/^\s*\|[\s-|]+\|\s*$/.test(line)) continue; // separator row

    // Parse table row: | Name | Role | ... |
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const name = cells[0];
    const role = cells[1];
    if (!name || !role) continue;

    members.push({ name, role, slug: resolveRoleSlug(role) });
  }

  return members.length > 0 ? members : null;
}

async function runCreate(projectRoot: string, args: string[]): Promise<void> {
  // Parse flags
  const isAll = args.includes('--all');
  const isSimple = args.includes('--simple');
  const roleIndex = args.indexOf('--role');
  const roleArg = roleIndex >= 0 ? args[roleIndex + 1] : undefined;
  const importIndex = args.indexOf('--import');
  const importSource = importIndex >= 0 ? args[importIndex + 1] : undefined;

  // Validate --import path if provided
  if (importIndex >= 0 && !importSource) {
    console.error(`${RED}✗${RESET} --import requires a path to the source Squad repo.`);
    process.exit(1);
  }
  if (importSource) {
    const resolvedImport = resolveSquadDir(importSource);
    if (!resolvedImport) {
      console.error(`${RED}✗${RESET} No .squad directory found at: ${importSource}`);
      process.exit(1);
    }
  }

  // Validate mutually exclusive mode flags (--import is compatible with any mode)
  const flagCount = [isAll, isSimple, !!roleArg].filter(Boolean).length;
  if (flagCount > 1) {
    console.error(`${RED}✗${RESET} Use only one of: --role <role>, --all, --simple`);
    process.exit(1);
  }

  // Resolve import source root once (if provided)
  const importRoot = importSource ? resolveSquadDir(importSource) ?? undefined : undefined;

  if (flagCount === 0) {
    // Team-aware auto-detection: look for .squad/team.md
    const teamMembers = parseTeamRoles(projectRoot);
    if (teamMembers) {
      console.log(`\n🔍 Reading team roster from .squad/team.md...\n`);

      // Deduplicate slugs while preserving display info
      const seen = new Map<RoleSlug, { name: string; role: string }>();
      for (const m of teamMembers) {
        if (!seen.has(m.slug)) {
          seen.set(m.slug, { name: m.name, role: m.role });
        }
      }

      const uniqueSlugs = [...seen.keys()];
      console.log(`  Found ${uniqueSlugs.length} unique role${uniqueSlugs.length === 1 ? '' : 's'}:`);
      for (const [slug, info] of seen) {
        console.log(`    ${info.role} (${info.name})${' '.repeat(Math.max(1, 24 - info.role.length - info.name.length - 3))}→ ${slug}`);
      }

      const action = importRoot ? 'Importing' : 'Creating';
      console.log(`\n  ${action} apps for: ${uniqueSlugs.join(', ')}\n`);

      const username = await getGitHubUsername();
      console.log(`  GitHub user: ${BOLD}${username}${RESET}\n`);

      let successCount = 0;
      for (let i = 0; i < uniqueSlugs.length; i++) {
        const slug = uniqueSlugs[i]!;
        console.log(`  [${i + 1}/${uniqueSlugs.length}] ${action} app for ${slug}...`);
        const ok = await createAppForRole(projectRoot, slug, username, 'per-role', slug, importRoot);
        if (ok) successCount++;
      }
      console.log(`\n${GREEN}✅${RESET} ${action === 'Importing' ? 'Imported' : 'Created'} ${successCount}/${uniqueSlugs.length} apps.\n`);
      return;
    }

    // No team.md — fall back to usage help
    console.log(`\n${BOLD}squad identity create${RESET} — create GitHub App identities\n`);
    console.log(`  ${DIM}No flags + team.md  Auto-detect roles from .squad/team.md${RESET}`);
    console.log(`  ${BOLD}--role <role>${RESET}      Create app for a single role (${ALL_ROLES.join(', ')})`);
    console.log(`  ${BOLD}--all${RESET}              Create apps for all ${ALL_ROLES.length} roles`);
    console.log(`  ${BOLD}--simple${RESET}           Create a single shared app`);
    console.log(`  ${BOLD}--import <path>${RESET}    Import identity from another Squad repo\n`);
    console.log(`  Example: ${DIM}squad identity create --role lead${RESET}`);
    console.log(`  Example: ${DIM}squad identity create --import /path/to/other-repo${RESET}\n`);
    return;
  }

  const username = await getGitHubUsername();
  console.log(`  GitHub user: ${BOLD}${username}${RESET}`);

  if (isSimple) {
    // Single shared app
    await createAppForRole(projectRoot, 'shared', username, 'shared', undefined, importRoot);
    return;
  }

  if (roleArg) {
    // Validate role
    if (!ALL_ROLES.includes(roleArg as RoleSlug)) {
      console.error(`${RED}✗${RESET} Unknown role: ${roleArg}`);
      console.error(`  Valid roles: ${ALL_ROLES.join(', ')}`);
      process.exit(1);
    }
    await createAppForRole(projectRoot, roleArg, username, 'per-role', roleArg as RoleSlug, importRoot);
    return;
  }

  if (isAll) {
    // Create apps for all roles sequentially
    const action = importRoot ? 'Importing' : 'Creating';
    console.log(`\n  ${action} apps for all ${ALL_ROLES.length} roles...`);
    let successCount = 0;
    for (const role of ALL_ROLES) {
      const ok = await createAppForRole(projectRoot, role, username, 'per-role', role, importRoot);
      if (ok) successCount++;
    }
    console.log(`\n${GREEN}✅${RESET} ${action === 'Importing' ? 'Imported' : 'Created'} ${successCount}/${ALL_ROLES.length} apps.\n`);
  }
}

/**
 * Re-detect and update the installation ID for an existing app registration.
 * Does NOT create a new app or generate a new key — just queries GitHub API
 * to find/update the installation.
 *
 * Accepts --installation-id <id> for manual override without API query.
 */
async function runUpdate(projectRoot: string, args: string[]): Promise<void> {
  const roleIndex = args.indexOf('--role');
  const roleArg = roleIndex >= 0 ? args[roleIndex + 1] : undefined;

  if (!roleArg) {
    console.error(`${RED}✗${RESET} --role <role> is required.`);
    console.log(`  Example: ${DIM}squad identity update --role lead${RESET}`);
    process.exit(1);
  }

  if (!ALL_ROLES.includes(roleArg as RoleSlug) && roleArg !== 'shared') {
    console.error(`${RED}✗${RESET} Unknown role: ${roleArg}`);
    console.error(`  Valid roles: ${ALL_ROLES.join(', ')}, shared`);
    process.exit(1);
  }

  const reg = loadAppRegistration(projectRoot, roleArg);
  if (!reg || !hasPrivateKey(projectRoot, roleArg)) {
    console.error(
      `${RED}✗${RESET} No app registered for role '${roleArg}'. ` +
      `Run ${BOLD}squad identity create --role ${roleArg}${RESET} first.`,
    );
    process.exit(1);
  }

  // Manual override via --installation-id
  const installIdIndex = args.indexOf('--installation-id');
  const installIdArg = installIdIndex >= 0 ? args[installIdIndex + 1] : undefined;

  if (installIdArg) {
    const manualId = parseInt(installIdArg, 10);
    if (isNaN(manualId) || manualId <= 0) {
      console.error(`${RED}✗${RESET} Invalid installation ID: ${installIdArg}`);
      process.exit(1);
    }

    // Update stored registration
    saveAppRegistration(projectRoot, roleArg, { ...reg, installationId: manualId });

    const config = loadIdentityConfig(projectRoot);
    if (config?.apps?.[roleArg]) {
      config.apps[roleArg].installationId = manualId;
      saveIdentityConfig(projectRoot, config);
    }

    clearTokenCache();
    console.log(`${GREEN}✅${RESET} Updated installation ID for ${BOLD}${roleArg}${RESET}: ${manualId}`);
    return;
  }

  // Auto-detect via GitHub API
  const pemPath = join(projectRoot, '.squad', 'identity', 'keys', `${roleArg}.pem`);
  const pem = readFileSync(pemPath, 'utf-8');
  const { generateAppJWT } = await import('@bradygaster/squad-sdk');
  const jwt = await generateAppJWT(reg.appId, pem);

  const installationId = await getAppInstallationId(jwt);

  if (!installationId) {
    const slug = reg.appSlug;
    console.error(
      `${RED}❌${RESET} No installation found — install the app at ` +
      `https://github.com/apps/${slug}/installations/select_target`,
    );
    process.exit(1);
  }

  // Update stored registration
  saveAppRegistration(projectRoot, roleArg, { ...reg, installationId });

  const config = loadIdentityConfig(projectRoot);
  if (config?.apps?.[roleArg]) {
    config.apps[roleArg].installationId = installationId;
    saveIdentityConfig(projectRoot, config);
  }

  clearTokenCache();
  console.log(`${GREEN}✅${RESET} Updated installation ID for ${BOLD}${roleArg}${RESET}: ${installationId}`);
}

/**
 * Rotate the PEM key for a role's GitHub App.
 *
 * Without --import: opens the GitHub App settings page so the user can
 * regenerate the key manually, then re-run with --import.
 *
 * With --import <path>: imports the new PEM file and clears the token cache.
 */
async function runRotate(projectRoot: string, args: string[]): Promise<void> {
  const roleIndex = args.indexOf('--role');
  const roleArg = roleIndex >= 0 ? args[roleIndex + 1] : undefined;

  if (!roleArg) {
    console.error(`${RED}✗${RESET} --role <role> is required.`);
    console.log(`  Example: ${DIM}squad identity rotate --role lead${RESET}`);
    process.exit(1);
  }

  if (!ALL_ROLES.includes(roleArg as RoleSlug)) {
    console.error(`${RED}✗${RESET} Unknown role: ${roleArg}`);
    console.error(`  Valid roles: ${ALL_ROLES.join(', ')}`);
    process.exit(1);
  }

  const reg = loadAppRegistration(projectRoot, roleArg);
  if (!reg) {
    console.error(
      `${RED}✗${RESET} No app registered for role '${roleArg}'. ` +
      `Run ${BOLD}squad identity create --role ${roleArg}${RESET} first.`,
    );
    process.exit(1);
  }

  const importIndex = args.indexOf('--import');
  const importPath = importIndex >= 0 ? args[importIndex + 1] : undefined;

  if (!importPath) {
    // No --import flag — open the app settings page for manual key regeneration
    const settingsUrl = `https://github.com/settings/apps/${reg.appSlug}`;
    console.log(`\n${BOLD}Rotate key for ${roleArg}${RESET} (app: ${reg.appSlug})\n`);
    console.log(`  ${DIM}GitHub does not support key rotation via API.${RESET}`);
    console.log(`  ${DIM}Opening the app settings page — regenerate the private key there.${RESET}\n`);
    openBrowser(settingsUrl);
    console.log(`  After downloading the new key, run:`);
    console.log(`  ${BOLD}squad identity rotate --role ${roleArg} --import path/to/new-key.pem${RESET}\n`);
    return;
  }

  // --import mode: validate and import the new PEM file
  if (!existsSync(importPath)) {
    console.error(`${RED}✗${RESET} File not found: ${importPath}`);
    process.exit(1);
  }

  const pem = readFileSync(importPath, 'utf-8');
  if (!pem.includes('-----BEGIN') || !pem.includes('PRIVATE KEY-----')) {
    console.error(`${RED}✗${RESET} File does not look like a PEM private key: ${importPath}`);
    process.exit(1);
  }

  // Save the new PEM key with restricted permissions
  const keysDir = join(projectRoot, '.squad', 'identity', 'keys');
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(join(keysDir, `${roleArg}.pem`), pem, { encoding: 'utf-8', mode: 0o600 });

  // Ensure .gitignore covers the keys directory
  ensureKeysIgnored(projectRoot);

  // Clear cached tokens so the next request uses the new key
  clearTokenCache();

  console.log(`${GREEN}✅${RESET} Key rotated for ${BOLD}${roleArg}${RESET} (app: ${reg.appSlug})`);
  console.log(`  ${DIM}New key saved to .squad/identity/keys/${roleArg}.pem${RESET}`);
  console.log(`  ${DIM}Token cache cleared — next request will use the new key.${RESET}\n`);
}

// ============================================================================
// Export credentials as `gh secret set` commands for CI/CD
// ============================================================================

/**
 * Export credentials for one role as `gh secret set` commands.
 * Reads the app registration and PEM from the filesystem and outputs
 * copy-pasteable commands for injecting them into GitHub Actions secrets.
 */
function exportRole(projectRoot: string, roleKey: string): boolean {
  const reg = loadAppRegistration(projectRoot, roleKey);
  if (!reg) {
    console.log(`  ${DIM}${roleKey}${RESET} — ${YELLOW}no app registration${RESET}`);
    return false;
  }

  const pemPath = join(projectRoot, '.squad', 'identity', 'keys', `${roleKey}.pem`);
  if (!existsSync(pemPath)) {
    console.log(`  ${DIM}${roleKey}${RESET} — ${YELLOW}no private key${RESET}`);
    return false;
  }

  let pem: string;
  try {
    pem = readFileSync(pemPath, 'utf-8');
  } catch {
    console.log(`  ${DIM}${roleKey}${RESET} — ${RED}failed to read key${RESET}`);
    return false;
  }

  const envKey = roleKey.toUpperCase();
  const pemBase64 = Buffer.from(pem).toString('base64');

  console.log(`# ${roleKey}`);
  console.log(`gh secret set SQUAD_${envKey}_APP_ID --body "${reg.appId}"`);
  console.log(`gh secret set SQUAD_${envKey}_PRIVATE_KEY --body "${pemBase64}"`);
  console.log(`gh secret set SQUAD_${envKey}_INSTALLATION_ID --body "${reg.installationId}"`);
  console.log();

  return true;
}

function runExport(projectRoot: string, args: string[]): void {
  const isAll = args.includes('--all');
  const roleIndex = args.indexOf('--role');
  const roleArg = roleIndex >= 0 ? args[roleIndex + 1] : undefined;

  if (!isAll && !roleArg) {
    console.log(`\n${BOLD}squad identity export${RESET} — export credentials as GitHub Actions secrets\n`);
    console.log(`  ${BOLD}--role <role>${RESET}  Export credentials for a single role`);
    console.log(`  ${BOLD}--all${RESET}          Export credentials for all registered roles\n`);
    console.log(`  Example: ${DIM}squad identity export --role backend${RESET}`);
    console.log(`  Example: ${DIM}squad identity export --all${RESET}\n`);
    return;
  }

  if (roleArg) {
    if (!ALL_ROLES.includes(roleArg as RoleSlug) && roleArg !== 'shared') {
      console.error(`${RED}✗${RESET} Unknown role: ${roleArg}`);
      console.error(`  Valid roles: ${ALL_ROLES.join(', ')}, shared`);
      process.exit(1);
    }
    console.log();
    const ok = exportRole(projectRoot, roleArg);
    if (ok) {
      console.log(`${DIM}# Paste the commands above into your terminal to set GitHub Actions secrets.${RESET}\n`);
    }
    return;
  }

  if (isAll) {
    const config = loadIdentityConfig(projectRoot);
    const appKeys = Object.keys(config?.apps ?? {});
    if (appKeys.length === 0) {
      console.log(`\n${YELLOW}⚠️${RESET}  No app registrations found. Run ${BOLD}squad identity create${RESET} first.\n`);
      return;
    }

    console.log();
    let exported = 0;
    for (const key of appKeys) {
      if (exportRole(projectRoot, key)) exported++;
    }
    if (exported > 0) {
      console.log(`${DIM}# Paste the commands above into your terminal to set GitHub Actions secrets.${RESET}\n`);
    }
  }
}

// ============================================================================
// squad identity doctor — live health check
// ============================================================================

/** A single check result produced during doctor run. */
interface DoctorCheck {
  label: string;
  passed: boolean;
  warning: boolean;
  skipped: boolean;
  detail: string;
}

/** Per-role result aggregated by runDoctor. */
interface DoctorRoleResult {
  role: string;
  checks: DoctorCheck[];
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
}

function doctorCheck(
  label: string,
  fn: () => { ok: boolean; warning?: boolean; skipped?: boolean; detail?: string },
): DoctorCheck {
  try {
    const result = fn();
    return {
      label,
      passed: result.ok,
      warning: result.warning ?? false,
      skipped: result.skipped ?? false,
      detail: result.detail ?? '',
    };
  } catch (e) {
    return {
      label,
      passed: false,
      warning: false,
      skipped: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function checkSymbol(c: DoctorCheck): string {
  if (c.skipped) return `${DIM}–${RESET}`;
  if (c.warning) return `${YELLOW}⚠${RESET}`;
  if (c.passed) return `${GREEN}✓${RESET}`;
  return `${RED}✗${RESET}`;
}

async function runDoctorForRole(
  projectRoot: string,
  roleKey: string,
  noNetwork: boolean,
): Promise<DoctorRoleResult> {
  const checks: DoctorCheck[] = [];

  // Check 1: config.json exists and parses
  checks.push(doctorCheck('config.json exists and parses', () => {
    const config = loadIdentityConfig(projectRoot);
    if (!config) return { ok: false, detail: `${join(projectRoot, '.squad', 'identity', 'config.json')} missing or invalid JSON` };
    return { ok: true, detail: `tier: ${config.tier}` };
  }));

  // Check 2: app registration file exists
  checks.push(doctorCheck(`apps/${roleKey}.json exists`, () => {
    const reg = loadAppRegistration(projectRoot, roleKey);
    if (!reg) return { ok: false, detail: `${join(projectRoot, '.squad', 'identity', 'apps', `${roleKey}.json`)} missing` };
    return { ok: true, detail: `appId ${reg.appId}, installationId ${reg.installationId}` };
  }));

  // Check 3: PEM file exists
  const pemPath = join(projectRoot, '.squad', 'identity', 'keys', `${roleKey}.pem`);
  checks.push(doctorCheck(`keys/${roleKey}.pem exists`, () => {
    if (!existsSync(pemPath)) return { ok: false, detail: `${pemPath} not found` };
    return { ok: true, detail: pemPath };
  }));

  // Check 4: PEM file mode 0o600 (skip on Windows)
  checks.push(doctorCheck(`keys/${roleKey}.pem mode 0o600`, () => {
    if (platform() === 'win32') return { ok: true, skipped: true, detail: 'skipped on Windows' };
    if (!existsSync(pemPath)) return { ok: false, skipped: true, detail: 'key not present — skip' };
    const mode = statSync(pemPath).mode & 0o777;
    if (mode !== 0o600) {
      return { ok: false, warning: false, detail: `mode ${mode.toString(8)} (want 600) — run: chmod 600 ${pemPath}` };
    }
    return { ok: true, detail: `mode 600` };
  }));

  // Check 5: PEM parses as a valid private key
  checks.push(doctorCheck(`keys/${roleKey}.pem is valid RSA PEM`, () => {
    if (!existsSync(pemPath)) return { ok: false, skipped: true, detail: 'key not present — skip' };
    const pem = readFileSync(pemPath, 'utf-8');
    try {
      createPrivateKey(pem);
      return { ok: true, detail: 'RSA private key parsed successfully' };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }));

  // Check 6: .gitignore covers keys/
  checks.push(doctorCheck('.gitignore covers .squad/identity/keys/', () => {
    const gitignorePath = join(projectRoot, '.gitignore');
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
    const covered =
      content.includes('.squad/identity/keys') ||
      content.includes('.squad/identity/keys/') ||
      content.includes('*.pem');
    if (!covered) return { ok: false, detail: `${gitignorePath} does not exclude PEM keys — run: squad identity create` };
    return { ok: true, detail: '.gitignore covers .squad/identity/keys/' };
  }));

  // Checks 7–9 require the app registration
  const reg = loadAppRegistration(projectRoot, roleKey);
  const keyPresent = existsSync(pemPath);

  // Check 7: generateAppJWT succeeds
  checks.push(await (async () => {
    if (!reg || !keyPresent) {
      return { label: 'JWT signed successfully', passed: false, warning: false, skipped: true, detail: 'registration or key missing — skip' };
    }
    try {
      const pem = readFileSync(pemPath, 'utf-8');
      const jwt = await generateAppJWT(reg.appId, pem);
      const parts = jwt.split('.');
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString()) as { iss: number; exp: number };
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      return { label: 'JWT signed successfully', passed: true, warning: false, skipped: false, detail: `iss=${payload.iss}, exp in ${remaining}s` };
    } catch (e) {
      return { label: 'JWT signed successfully', passed: false, warning: false, skipped: false, detail: e instanceof Error ? e.message : String(e) };
    }
  })());

  if (noNetwork) {
    checks.push({ label: 'Installation token fetched (skipped: --no-network)', passed: true, warning: false, skipped: true, detail: '--no-network flag set' });
    checks.push({ label: 'Token has required scopes (skipped: --no-network)', passed: true, warning: false, skipped: true, detail: '--no-network flag set' });
  } else {
    // Check 8: live installation token fetch
    let fetchedToken: string | null = null;
    checks.push(await (async () => {
      clearTokenCache();
      const result = await resolveTokenWithDiagnostics(projectRoot, roleKey);
      if (result.token) {
        fetchedToken = result.token;
        return { label: 'Installation token fetched', passed: true, warning: false, skipped: false, detail: `token obtained (${result.resolvedRoleKey ?? roleKey})` };
      }
      if (result.error?.kind === 'not-configured') {
        return { label: 'Installation token fetched', passed: false, warning: false, skipped: false, detail: result.error.message };
      }
      return { label: 'Installation token fetched', passed: false, warning: false, skipped: false, detail: result.error?.message ?? 'unknown error' };
    })());

    // Check 9: token has expected scopes
    checks.push(await (async () => {
      if (!fetchedToken) {
        return { label: 'Token has required scopes', passed: false, warning: false, skipped: true, detail: 'no token — skip' };
      }
      const REQUIRED = ['issues', 'pull_requests', 'contents'];
      const perms = await getInstallationPermissions(fetchedToken);
      if (!perms) {
        return { label: 'Token has required scopes', passed: false, warning: true, skipped: false, detail: 'could not retrieve permissions from API' };
      }
      const missing = REQUIRED.filter(k => !perms[k]);
      if (missing.length > 0) {
        return { label: 'Token has required scopes', passed: false, warning: false, skipped: false, detail: `missing: ${missing.join(', ')} (have: ${Object.keys(perms).join(', ')})` };
      }
      const scopeStr = REQUIRED.map(k => `${k}:${perms[k]}`).join(', ');
      return { label: 'Token has required scopes', passed: true, warning: false, skipped: false, detail: scopeStr };
    })());
  }

  const result: DoctorRoleResult = {
    role: roleKey,
    checks,
    passed: checks.filter(c => c.passed && !c.skipped).length,
    failed: checks.filter(c => !c.passed && !c.skipped && !c.warning).length,
    warnings: checks.filter(c => c.warning).length,
    skipped: checks.filter(c => c.skipped).length,
  };
  return result;
}

async function runDoctor(projectRoot: string, args: string[]): Promise<void> {
  const roleIndex = args.indexOf('--role');
  const roleArg = roleIndex >= 0 ? args[roleIndex + 1] : undefined;
  const isJson = args.includes('--json');
  const noNetwork = args.includes('--no-network');

  const config = loadIdentityConfig(projectRoot);
  const appKeys = config ? Object.keys(config.apps ?? {}) : [];

  // Determine which roles to check
  let rolesToCheck: string[];
  if (roleArg) {
    if (!appKeys.includes(roleArg)) {
      // Role not in config but might still be partially set up
      rolesToCheck = [roleArg];
    } else {
      rolesToCheck = [roleArg];
    }
  } else if (appKeys.length > 0) {
    rolesToCheck = appKeys;
  } else {
    // No config — still run checks for a generic diagnostic
    if (isJson) {
      console.log(JSON.stringify({ error: 'No identity configuration found', checks: [], passed: 0, failed: 0, warnings: 0, skipped: 0 }, null, 2));
    } else {
      console.log(`\n${YELLOW}⚠️${RESET}  No identity configuration found.`);
      console.log(`   Run ${BOLD}squad identity create${RESET} to set up identity.\n`);
    }
    process.exit(1);
  }

  const results: DoctorRoleResult[] = [];
  for (const role of rolesToCheck) {
    if (!isJson) {
      console.log(`\n${BOLD}Checking identity for role: ${role}${RESET}`);
    }
    const result = await runDoctorForRole(projectRoot, role, noNetwork);
    results.push(result);

    if (!isJson) {
      for (const c of result.checks) {
        const sym = checkSymbol(c);
        const detail = c.detail ? `  ${DIM}${c.detail}${RESET}` : '';
        console.log(`  ${sym} ${c.label}${detail}`);
      }
      const failedChecks = result.checks.filter(c => !c.passed && !c.skipped && !c.warning);
      if (failedChecks.length > 0) {
        console.log(`\n  ${RED}${result.failed} check(s) failed for role: ${role}${RESET}`);
      } else {
        console.log(`\n  ${GREEN}All checks passed for role: ${role}${RESET}`);
      }
    }
  }

  // Summary table
  const totalPassed = results.reduce((n, r) => n + r.passed, 0);
  const totalFailed = results.reduce((n, r) => n + r.failed, 0);
  const totalWarnings = results.reduce((n, r) => n + r.warnings, 0);
  const totalSkipped = results.reduce((n, r) => n + r.skipped, 0);

  if (isJson) {
    const output = {
      roles: results.map(r => ({
        role: r.role,
        passed: r.passed,
        failed: r.failed,
        warnings: r.warnings,
        skipped: r.skipped,
        checks: r.checks.map(c => ({
          label: c.label,
          passed: c.passed,
          warning: c.warning,
          skipped: c.skipped,
          detail: c.detail,
        })),
      })),
      summary: { passed: totalPassed, failed: totalFailed, warnings: totalWarnings, skipped: totalSkipped },
    };
    console.log(JSON.stringify(output, null, 2));
  } else if (results.length > 1) {
    console.log(`\n${BOLD}Summary:${RESET}`);
    for (const r of results) {
      const status = r.failed > 0
        ? `${RED}FAIL${RESET}`
        : r.warnings > 0
          ? `${YELLOW}WARN${RESET}`
          : `${GREEN}PASS${RESET}`;
      console.log(`  ${BOLD}${r.role.padEnd(12)}${RESET}  ${status}  ${DIM}(${r.passed} pass, ${r.failed} fail, ${r.warnings} warn, ${r.skipped} skip)${RESET}`);
    }
    console.log(`\n  Total: ${GREEN}${totalPassed} passed${RESET}, ${RED}${totalFailed} failed${RESET}, ${YELLOW}${totalWarnings} warnings${RESET}, ${DIM}${totalSkipped} skipped${RESET}\n`);
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

// ============================================================================
// squad identity explain <role> — resolution trace
// ============================================================================

async function runExplain(projectRoot: string, args: string[]): Promise<void> {
  const isLive = args.includes('--live');
  const isJson = args.includes('--json');
  // positional role arg — first non-flag argument
  const roleArg = args.find(a => !a.startsWith('--'));

  if (!roleArg) {
    if (isJson) {
      console.log(JSON.stringify({ error: 'Usage: squad identity explain <role> [--live] [--json]' }, null, 2));
    } else {
      console.log(`\n${BOLD}squad identity explain${RESET} — trace the token resolution path for a role\n`);
      console.log(`  Usage: ${BOLD}squad identity explain <role>${RESET} [--live] [--json]\n`);
      console.log(`  Options:`);
      console.log(`    ${BOLD}--live${RESET}   Actually fetch the token and confirm end-to-end`);
      console.log(`    ${BOLD}--json${RESET}   Emit structured JSON\n`);
    }
    return; // exit 0 — diagnostic command
  }

  // Alias resolution: resolveRoleSlug maps role titles to canonical slugs
  const canonicalSlug = resolveRoleSlug(roleArg);
  const aliasResolved = canonicalSlug !== roleArg;

  // Env var check
  const envKey = roleArg.toUpperCase();
  const envAppId = process.env[`SQUAD_${envKey}_APP_ID`];
  const envPem = process.env[`SQUAD_${envKey}_PRIVATE_KEY`];
  const envInstall = process.env[`SQUAD_${envKey}_INSTALLATION_ID`];
  const envPresent = { appId: !!envAppId, privateKey: !!envPem, installationId: !!envInstall };
  const envAllSet = envPresent.appId && envPresent.privateKey && envPresent.installationId;
  const envAnySet = envPresent.appId || envPresent.privateKey || envPresent.installationId;

  // Filesystem check
  const configPath = join(projectRoot, '.squad', 'identity', 'config.json');
  const appsPath = join(projectRoot, '.squad', 'identity', 'apps', `${roleArg}.json`);
  const pemPath = join(projectRoot, '.squad', 'identity', 'keys', `${roleArg}.pem`);
  const fsConfigExists = existsSync(configPath);
  const fsAppsExists = existsSync(appsPath);
  const fsPemExists = existsSync(pemPath);

  const reg = loadAppRegistration(projectRoot, roleArg);

  // Cache state
  const cacheState = peekTokenCache(projectRoot, roleArg);

  // Determine final source before live fetch
  let expectedSource: 'env' | 'filesystem' | 'mock' | 'none';
  if (process.env['SQUAD_IDENTITY_MOCK'] === '1') {
    expectedSource = 'mock';
  } else if (envAllSet) {
    expectedSource = 'env';
  } else if (fsAppsExists && fsPemExists && reg && reg.installationId !== 0) {
    expectedSource = 'filesystem';
  } else {
    expectedSource = 'none';
  }

  // Live fetch (optional)
  let liveResult: Awaited<ReturnType<typeof resolveTokenWithDiagnostics>> | null = null;
  if (isLive) {
    liveResult = await resolveTokenWithDiagnostics(projectRoot, roleArg);
  }

  if (isJson) {
    const output = {
      inputRole: roleArg,
      canonicalSlug,
      aliasResolved,
      env: {
        vars: {
          [`SQUAD_${envKey}_APP_ID`]: envPresent.appId ? '(set)' : '(not set)',
          [`SQUAD_${envKey}_PRIVATE_KEY`]: envPresent.privateKey ? '(set)' : '(not set)',
          [`SQUAD_${envKey}_INSTALLATION_ID`]: envPresent.installationId ? '(set)' : '(not set)',
        },
        status: envAllSet ? 'present' : envAnySet ? 'partial' : 'absent',
      },
      filesystem: {
        configJson: fsConfigExists,
        appsJson: fsAppsExists,
        pemKey: fsPemExists,
        registration: reg ? { appId: reg.appId, installationId: reg.installationId } : null,
        status: fsAppsExists && fsPemExists && reg && reg.installationId !== 0 ? 'present' : 'absent',
      },
      cache: cacheState.cached
        ? { cached: true, expiresAt: cacheState.expiresAt.toISOString(), remainingMs: cacheState.remainingMs }
        : { cached: false },
      expectedSource,
      live: isLive
        ? {
            token: liveResult?.token ? '(present)' : null,
            resolvedRoleKey: liveResult?.resolvedRoleKey ?? null,
            error: liveResult?.error ?? null,
          }
        : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  console.log(`\n${BOLD}Resolving token for role: ${roleArg}${RESET}\n`);

  // Step 1: Input + alias
  console.log(`  ${BOLD}Step 1${RESET}  Input role key`);
  if (aliasResolved) {
    console.log(`           ${DIM}${roleArg}${RESET} → ${GREEN}${canonicalSlug}${RESET}  ${DIM}(resolved via alias)${RESET}`);
  } else {
    console.log(`           ${DIM}${roleArg}${RESET}  ${DIM}(canonical slug — no alias)${RESET}`);
  }

  // Step 2: Env vars
  console.log(`\n  ${BOLD}Step 2${RESET}  Env var override`);
  const varWidth = `SQUAD_${envKey}_INSTALLATION_ID`.length;
  for (const [name, present] of [
    [`SQUAD_${envKey}_APP_ID`, envPresent.appId],
    [`SQUAD_${envKey}_PRIVATE_KEY`, envPresent.privateKey],
    [`SQUAD_${envKey}_INSTALLATION_ID`, envPresent.installationId],
  ] as [string, boolean][]) {
    const status = present ? `${GREEN}set${RESET}` : `${DIM}not set${RESET}`;
    console.log(`           ${name.padEnd(varWidth + 2)} ${status}`);
  }
  if (envAllSet) {
    console.log(`           → env credentials: ${GREEN}present (will use)${RESET}`);
  } else if (envAnySet) {
    console.log(`           → env credentials: ${RED}partial (incomplete — will error)${RESET}`);
  } else {
    console.log(`           → env credentials: ${DIM}absent${RESET}`);
  }

  // Step 3: Filesystem
  console.log(`\n  ${BOLD}Step 3${RESET}  Filesystem lookup`);
  const files: [string, boolean, string][] = [
    ['.squad/identity/config.json', fsConfigExists, ''],
    [`.squad/identity/apps/${roleArg}.json`, fsAppsExists, reg ? `appId ${reg.appId}, installationId ${reg.installationId}` : ''],
    [`.squad/identity/keys/${roleArg}.pem`, fsPemExists, ''],
  ];
  for (const [name, exists, detail] of files) {
    const sym = exists ? `${GREEN}✓ found${RESET}` : `${RED}✗ missing${RESET}`;
    const d = detail ? `  ${DIM}(${detail})${RESET}` : '';
    console.log(`           ${name.padEnd(40)} ${sym}${d}`);
  }
  if (fsAppsExists && fsPemExists && reg && reg.installationId !== 0) {
    console.log(`           → filesystem credentials: ${GREEN}present${RESET}`);
  } else if (reg && reg.installationId === 0) {
    console.log(`           → filesystem credentials: ${YELLOW}incomplete (installationId = 0)${RESET}  ${DIM}run: squad identity update --role ${roleArg}${RESET}`);
  } else {
    console.log(`           → filesystem credentials: ${DIM}absent${RESET}`);
  }

  // Step 4: Cache
  console.log(`\n  ${BOLD}Step 4${RESET}  Token cache`);
  console.log(`           cache key: ${DIM}'${projectRoot}:${roleArg}'${RESET}`);
  if (cacheState.cached) {
    const remainSec = Math.round(cacheState.remainingMs / 1000);
    const remainMin = Math.floor(remainSec / 60);
    console.log(`           → ${GREEN}cache hit${RESET}  ${DIM}expires at ${cacheState.expiresAt.toISOString()} (${remainMin}m ${remainSec % 60}s remaining)${RESET}`);
  } else {
    console.log(`           → ${DIM}cache miss (no entry)${RESET}`);
  }

  // Step 5: Live fetch or dry-run note
  console.log(`\n  ${BOLD}Step 5${RESET}  GitHub API call`);
  if (isLive && liveResult) {
    if (liveResult.token) {
      console.log(`           ${GREEN}✓${RESET} Token fetched successfully  ${DIM}(role: ${liveResult.resolvedRoleKey ?? roleArg})${RESET}`);
    } else if (liveResult.error?.kind === 'not-configured') {
      console.log(`           ${DIM}–${RESET} Not configured: ${liveResult.error.message}`);
    } else {
      console.log(`           ${RED}✗${RESET} Runtime error: ${liveResult.error?.message ?? 'unknown'}`);
    }
  } else {
    if (expectedSource === 'none') {
      console.log(`           ${DIM}→ dry-run: would not fetch (no credentials configured)${RESET}`);
    } else {
      const apiPath = reg
        ? `POST /app/installations/${reg.installationId}/access_tokens`
        : `POST /app/installations/{id}/access_tokens`;
      console.log(`           ${DIM}→ dry-run: ${apiPath}${RESET}`);
      console.log(`           ${DIM}  (use --live to actually fetch the token)${RESET}`);
    }
  }

  // Final summary line
  const sourceLabel: Record<typeof expectedSource, string> = {
    env: 'env vars → API fetch',
    filesystem: 'filesystem → API fetch',
    mock: 'SQUAD_IDENTITY_MOCK=1 (mock)',
    none: 'none (not configured)',
  };
  console.log(`\n  Resolution path: ${BOLD}${sourceLabel[expectedSource]}${RESET}\n`);
}

// ============================================================================
// Entry point
// ============================================================================

export async function runIdentity(cwd: string, subArgs: string[]): Promise<void> {
  const sub = subArgs[0]?.toLowerCase();

  if (sub === 'status') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    runStatus(projectRoot);
    return;
  }

  if (sub === 'create') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    await runCreate(projectRoot, subArgs.slice(1));
    return;
  }

  if (sub === 'update') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    await runUpdate(projectRoot, subArgs.slice(1));
    return;
  }

  if (sub === 'rotate') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    await runRotate(projectRoot, subArgs.slice(1));
    return;
  }

  if (sub === 'export') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    runExport(projectRoot, subArgs.slice(1));
    return;
  }

  if (sub === 'doctor') {
    const projectRoot = resolveSquadDir(cwd);
    if (!projectRoot) {
      console.error(`${RED}✗${RESET} No squad found. Run "squad init" first.`);
      process.exit(1);
    }
    await runDoctor(projectRoot, subArgs.slice(1));
    return;
  }

  if (sub === 'explain') {
    // explain is diagnostic — fall back to cwd if no squad dir found
    const projectRoot = resolveSquadDir(cwd) ?? cwd;
    await runExplain(projectRoot, subArgs.slice(1));
    return;
  }

  // No subcommand — show usage
  console.log(`\n${BOLD}squad identity${RESET} — manage agent GitHub App identity\n`);
  console.log(`  ${BOLD}squad identity status${RESET}             — show identity configuration`);
  console.log(`  ${BOLD}squad identity create${RESET}             — auto-detect roles from team.md`);
  console.log(`  ${BOLD}squad identity create --role lead${RESET} — create app for a role`);
  console.log(`  ${BOLD}squad identity create --all${RESET}       — create apps for all roles`);
  console.log(`  ${BOLD}squad identity create --simple${RESET}    — create single shared app`);
  console.log(`  ${BOLD}squad identity create --import ..${RESET} — import identity from another repo`);
  console.log(`  ${BOLD}squad identity update --role lead${RESET} — re-detect installation ID`);
  console.log(`  ${BOLD}squad identity rotate --role lead${RESET} — rotate key for a role`);
  console.log(`  ${BOLD}squad identity export --role lead${RESET} — export secrets for CI/CD`);
  console.log(`  ${BOLD}squad identity export --all${RESET}       — export all secrets for CI/CD`);
  console.log(`  ${BOLD}squad identity doctor${RESET}             — run full health check for all roles`);
  console.log(`  ${BOLD}squad identity doctor --role lead${RESET} — health check for one role`);
  console.log(`  ${BOLD}squad identity explain lead${RESET}       — trace token resolution path\n`);
}
