/**
 * squad init --shared [--key <repo-key>] — shared mode init command.
 *
 * Creates a shared squad under the global app data directory at
 * `squad/repos/{key}/` with team scaffolding (agents/, casting/,
 * decisions/, team.md, routing.md, etc.) and zero writes to the
 * repository working tree.
 *
 * If the shared squad already exists (duplicate key), treats it as
 * "attach to existing" rather than failing — enables multi-clone UX.
 * In this case, creates:
 *   - .squad junction → shared team dir
 *   - .github/agents/squad.agent.md (from shared squad template or built-in)
 *   - Clone-local state in the local app data directory
 *
 * @module cli/commands/init-shared
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  FSStorageProvider,
  createSharedSquad,
  createSharedSquadInRepo,
  loadRepoRegistry,
  lookupByKeyAcrossRepos,
  addUrlPattern,
  normalizeRemoteUrl,
  getRemoteUrl,
  resolveGlobalSquadPath,
  validateRepoKey,
  ensureCloneState,
} from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';
import { DIM, RESET } from '../core/output.js';

const storage = new FSStorageProvider();

/** Minimal team.md for a new shared squad. */
function defaultTeamMd(key: string): string {
  return `# Squad Team — ${key}

> Shared squad initialized via \`squad init --shared\`.

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|

## Project Context

This is a shared squad for the \`${key}\` repository.
`;
}

/** Minimal routing.md for a new shared squad. */
function defaultRoutingMd(): string {
  return `# Routing

> Work routing rules for this squad.

## Work Type Routing

| Work Type | Primary Agent | Examples |
|-----------|--------------|----------|
`;
}

/** Minimal decisions.md for a new shared squad. */
function defaultDecisionsMd(): string {
  return `# Decisions

> Team decisions that all agents must respect. Managed by Scribe.
`;
}

/**
 * Run shared squad initialization.
 *
 * If the shared squad already exists for this key, attaches to it
 * (optionally adding URL pattern) instead of failing.
 *
 * @param cwd - Current working directory (git repository root).
 * @param keyArg - Optional explicit repo key. Auto-detected from origin if omitted.
 */
export function runInitShared(cwd: string, keyArg?: string, squadRepoArg?: string): void {
  // Step 1: Determine repo key
  let key = keyArg;
  let urlPatterns: string[] = [];

  const remoteUrl = getRemoteUrl(cwd);

  if (!key) {
    if (!remoteUrl) {
      fatal(
        'Cannot auto-detect repo key: no git remote "origin" found.\n' +
        '       Use --key <owner/repo> to specify the key explicitly.',
      );
    }
    const normalized = normalizeRemoteUrl(remoteUrl);

    // Reject unknown providers with ambiguous keys
    if (normalized.provider === 'unknown') {
      fatal(
        `Could not derive a supported repo key from origin URL.\n` +
        `       Remote: ${remoteUrl}\n` +
        `       Use --key <owner/repo> to specify the key explicitly.`,
      );
    }

    key = normalized.key;
    urlPatterns = [normalized.normalizedUrl];
  } else {
    // Key provided explicitly — still register URL pattern if remote exists
    if (remoteUrl) {
      const normalized = normalizeRemoteUrl(remoteUrl);
      urlPatterns = [normalized.normalizedUrl];
    }
  }

  // Step 2: Validate key
  try {
    validateRepoKey(key);
  } catch (err) {
    fatal((err as Error).message);
  }

  // Step 3: Check if shared squad already exists — connect to it
  // Check git-backed pointers (~/.squad/squad-repos.json) first, then legacy %APPDATA%
  const located = lookupByKeyAcrossRepos(key);
  if (located) {
    const { entry: existing, squadRepoRoot } = located;
    // Derive teamDir from where the entry was actually found
    let globalDir: string;
    try {
      globalDir = resolveGlobalSquadPath();
    } catch {
      globalDir = '';
    }
    const isLegacyAppData = squadRepoRoot === globalDir;
    const teamDir = isLegacyAppData
      ? path.join(squadRepoRoot, 'repos', ...key.split('/'))
      : path.join(squadRepoRoot, ...key.split('/'));

    // Add URL pattern if we have one and it's not already registered
    if (urlPatterns.length > 0 && !existing.urlPatterns.includes(urlPatterns[0]!)) {
      try {
        addUrlPattern(key, urlPatterns[0]!);
      } catch {
        // best-effort
      }
    }

    // Sanity check: team dir must exist and have team.md
    const teamMdPath = path.join(teamDir, 'team.md');
    if (!storage.existsSync(teamDir) || !storage.existsSync(teamMdPath)) {
      fatal(
        `Shared squad "${key}" is registered but team dir is missing or incomplete.\n` +
        `       Expected: ${teamDir}\n` +
        `       Run \`squad migrate --to shared\` from the source clone first.`,
      );
    }

    // Resolve the git repository root (may differ from cwd if run from a subdir)
    let gitRoot: string;
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
    } catch {
      gitRoot = cwd; // Fallback to cwd if git rev-parse fails
    }

    // --- Shared squad connect: zero repo writes ---
    // The coordinator resolves the shared squad via the global squad
    // repos.json registry + origin URL matching. No junction, no agent
    // file in the repo. The user-global agent file handles coordination.

    // --- Create clone-local state ---
    try {
      ensureCloneState(gitRoot, key);
    } catch {
      // best-effort — clone state is not critical for connect
    }

    console.log('');
    console.log(`✅ Connected to shared squad "${key}"`);
    console.log(`   Team dir: ${teamDir}`);
    console.log(`   Resolution: via ${isLegacyAppData ? path.join(squadRepoRoot, 'repos.json') : path.join(squadRepoRoot, 'repos.json')} (origin URL match)`);
    console.log(`   Agent file: ~/.copilot/agents/squad.agent.md (user-global)`);
    console.log('');
    console.log(`   ${DIM}No files written to repository. The coordinator discovers this${RESET}`);
    console.log(`   ${DIM}squad automatically via origin remote URL matching.${RESET}`);
    console.log('');
    console.log(`   ${DIM}Troubleshoot: node <squad-cli>/dist/cli-entry.js shared diagnose${RESET}`);
    return;
  }

  // Step 4: Create shared squad (writes manifest + registry)
  let teamDir: string;
  try {
    if (squadRepoArg) {
      // Create in a git-backed squad repo clone
      teamDir = createSharedSquadInRepo(squadRepoArg, key, urlPatterns);
    } else {
      // Create in platform app data (legacy default)
      teamDir = createSharedSquad(key, urlPatterns);
    }
  } catch (err) {
    fatal((err as Error).message);
  }

  // Step 5: Scaffold team structure under teamDir
  const dirs = [
    path.join(teamDir, 'agents'),
    path.join(teamDir, 'casting'),
    path.join(teamDir, 'decisions'),
    path.join(teamDir, 'decisions', 'inbox'),
    path.join(teamDir, 'skills'),
  ];
  for (const dir of dirs) {
    if (!storage.existsSync(dir)) {
      storage.mkdirSync(dir, { recursive: true });
    }
  }

  // Scaffold markdown files (only if they don't already exist)
  const files: Array<[string, string]> = [
    [path.join(teamDir, 'team.md'), defaultTeamMd(key)],
    [path.join(teamDir, 'routing.md'), defaultRoutingMd()],
    [path.join(teamDir, 'decisions.md'), defaultDecisionsMd()],
  ];
  for (const [filePath, content] of files) {
    if (!storage.existsSync(filePath)) {
      storage.writeSync(filePath, content);
    }
  }

  // Step 6: Print success
  console.log(`✅ Created shared squad "${key}"`);
  console.log(`   Team dir: ${teamDir}`);
  if (urlPatterns.length > 0) {
    console.log(`   Registered URL pattern: ${urlPatterns[0]}`);
  }
  if (squadRepoArg) {
    console.log(`   Squad repo: ${path.resolve(squadRepoArg)}`);
    console.log(`   Pointer: ~/.squad/squad-repos.json`);
  }
  console.log('');
  console.log('   Other clones of this repo will auto-discover this squad.');
  console.log('   No files written to your repository.');
}
