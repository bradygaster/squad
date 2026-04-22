/**
 * squad shared <subcommand> — shared squad management commands.
 *
 * Subcommands:
 *   status   — show shared squad info for current clone
 *   add-url  — register an additional URL pattern
 *   list     — list all shared squads in the registry
 *   doctor   — health checks for shared squad configuration
 *
 * @module cli/commands/shared
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import { lstatSync, readlinkSync } from 'node:fs';
import {
  FSStorageProvider,
  resolveSharedSquad,
  loadRepoRegistry,
  addUrlPattern,
  resolveGlobalSquadPath,
  validateRepoKey,
  normalizeRemoteUrl,
  getRemoteUrl,
} from '@bradygaster/squad-sdk';
import type { SharedSquadManifest, NormalizedRemote } from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';
import { BOLD, RESET, GREEN, RED, YELLOW, DIM } from '../core/output.js';

const storage = new FSStorageProvider();

/**
 * Route shared subcommands.
 *
 * @param cwd - Current working directory.
 * @param subcommand - One of: status, add-url, list, doctor.
 * @param args - Remaining CLI arguments after the subcommand.
 */
export function runShared(cwd: string, subcommand: string, args: string[]): void {
  switch (subcommand) {
    case 'status':
      return runStatus(cwd);
    case 'add-url':
      return runAddUrl(cwd, args);
    case 'list':
      return runList();
    case 'doctor':
      return runDoctor();
    case 'diagnose':
      return runDiagnose(cwd);
    default:
      fatal(
        `Unknown shared subcommand: ${subcommand}\n` +
        '       Usage: squad shared <status|add-url|list|doctor|diagnose>',
      );
  }
}

// ============================================================================
// status
// ============================================================================

function runStatus(cwd: string): void {
  const resolved = resolveSharedSquad(cwd);
  if (!resolved) {
    console.log('Not in a shared squad.');
    console.log('');
    console.log(`${DIM}Hint: Run \`squad init --shared\` to create one,${RESET}`);
    console.log(`${DIM}or set up a shared squad in another clone and this one will auto-discover it.${RESET}`);
    return;
  }

  // Read manifest for extra info
  const manifestPath = path.join(resolved.teamDir, 'manifest.json');
  let urlPatterns: string[] = [];
  let repoKey = '';
  if (storage.existsSync(manifestPath)) {
    try {
      const raw = storage.readSync(manifestPath) ?? '';
      const manifest = JSON.parse(raw) as SharedSquadManifest;
      urlPatterns = manifest.urlPatterns ?? [];
      repoKey = manifest.repoKey ?? '';
    } catch {
      // best-effort
    }
  }

  console.log(`🔗 Shared squad: ${BOLD}${repoKey}${RESET}`);
  console.log(`   Team dir: ${resolved.teamDir}`);
  console.log(`   Local state: ${resolved.projectDir}`);

  // Count pending decisions inbox
  const inboxDir = path.join(resolved.teamDir, 'decisions', 'inbox');
  let pendingCount = 0;
  if (storage.existsSync(inboxDir)) {
    try {
      const entries = storage.listSync(inboxDir);
      pendingCount = entries.filter((e: string) => e.endsWith('.md')).length;
    } catch {
      // ignore
    }
  }
  console.log(`   Decisions: shared (${pendingCount} pending in inbox)`);

  if (urlPatterns.length > 0) {
    console.log('   URL patterns:');
    for (const p of urlPatterns) {
      console.log(`     - ${p}`);
    }
  }
}

// ============================================================================
// add-url
// ============================================================================

function runAddUrl(cwd: string, args: string[]): void {
  const pattern = args[0];
  if (!pattern) {
    fatal('Usage: squad shared add-url <url-pattern>');
  }

  // Try --key flag first, then fall back to discovery
  const keyIdx = args.indexOf('--key');
  let repoKey: string | undefined;

  if (keyIdx !== -1 && args[keyIdx + 1]) {
    repoKey = args[keyIdx + 1]!;
  } else {
    const resolved = resolveSharedSquad(cwd);
    if (!resolved) {
      fatal(
        'Not in a shared squad and no --key provided.\n' +
        '       Usage: squad shared add-url <pattern> [--key <repo-key>]',
      );
    }

    // Read manifest to get the repo key
    const manifestPath = path.join(resolved.teamDir, 'manifest.json');
    if (!storage.existsSync(manifestPath)) {
      fatal('Shared squad manifest not found. Run `squad init --shared` to recreate.');
    }

    try {
      const raw = storage.readSync(manifestPath) ?? '';
      const manifest = JSON.parse(raw) as SharedSquadManifest;
      repoKey = manifest.repoKey;
    } catch {
      fatal('Failed to read shared squad manifest.');
    }
  }

  try {
    addUrlPattern(repoKey!, pattern);
  } catch (err) {
    fatal((err as Error).message);
  }

  console.log(`✅ Added URL pattern for "${repoKey}"`);
}

// ============================================================================
// list
// ============================================================================

function runList(): void {
  const registry = loadRepoRegistry();
  if (!registry || registry.repos.length === 0) {
    console.log('No shared squads registered.');
    console.log(`${DIM}Run \`squad init --shared\` to create one.${RESET}`);
    return;
  }

  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
  } catch {
    fatal('Global config directory unreachable.');
    return;
  }

  console.log('');
  for (const entry of registry.repos) {
    const teamDir = path.join(globalDir, 'repos', ...entry.key.split('/'));
    const patternCount = entry.urlPatterns.length;
    const patternLabel = patternCount === 1 ? '1 URL pattern' : `${patternCount} URL patterns`;
    console.log(`  ${BOLD}${entry.key}${RESET}   ${teamDir}   ${patternLabel}`);
  }
  console.log('');
}

// ============================================================================
// doctor
// ============================================================================

function runDoctor(): void {
  console.log('🔍 Checking shared squad health...');

  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
    console.log(`   ${GREEN}✅${RESET} Global config dir accessible`);
  } catch {
    console.log(`   ${RED}❌${RESET} Global config dir unreachable (global squad data directory)`);
    return;
  }

  // Check registry
  const registry = loadRepoRegistry();
  if (!registry) {
    console.log(`   ${YELLOW}⚠️${RESET}  repos.json missing or invalid (no shared squads registered)`);
    return;
  }
  console.log(`   ${GREEN}✅${RESET} repos.json valid (${registry.repos.length} ${registry.repos.length === 1 ? 'entry' : 'entries'})`);

  // Check each entry
  for (const entry of registry.repos) {
    try {
      validateRepoKey(entry.key);
    } catch {
      console.log(`   ${RED}❌${RESET} ${entry.key} — invalid repo key`);
      continue;
    }

    const teamDir = path.join(globalDir, 'repos', ...entry.key.split('/'));

    // Team dir exists?
    if (!storage.existsSync(teamDir)) {
      console.log(`   ${YELLOW}⚠️${RESET}  ${entry.key} — team dir missing (stale registry entry?)`);
      continue;
    }

    // Manifest valid?
    const manifestPath = path.join(teamDir, 'manifest.json');
    if (!storage.existsSync(manifestPath)) {
      console.log(`   ${YELLOW}⚠️${RESET}  ${entry.key} — manifest.json missing`);
      continue;
    }

    try {
      const raw = storage.readSync(manifestPath) ?? '';
      const manifest = JSON.parse(raw) as SharedSquadManifest;
      if (manifest.version !== 1 || manifest.repoKey !== entry.key) {
        console.log(`   ${YELLOW}⚠️${RESET}  ${entry.key} — manifest.json content mismatch`);
        continue;
      }
    } catch {
      console.log(`   ${YELLOW}⚠️${RESET}  ${entry.key} — manifest.json parse error`);
      continue;
    }

    console.log(`   ${GREEN}✅${RESET} ${entry.key} — team dir exists, manifest valid`);

    // Check decisions/inbox
    const inboxDir = path.join(teamDir, 'decisions', 'inbox');
    if (storage.existsSync(inboxDir)) {
      let pendingCount = 0;
      try {
        const entries = storage.listSync(inboxDir);
        pendingCount = entries.filter((e: string) => e.endsWith('.md')).length;
      } catch {
        // ignore
      }

      // Check for orphaned processing dirs (stale if older than 5 minutes)
      const processingDir = path.join(teamDir, 'decisions', 'processing');
      let hasOrphanedProcessing = false;
      if (storage.existsSync(processingDir)) {
        const processingEntries = storage.listSync(processingDir);
        hasOrphanedProcessing = processingEntries.length > 0;
      }
      const processingNote = hasOrphanedProcessing ? ', processing: stale entries found' : ', processing: clean';

      console.log(`   ${GREEN}✅${RESET} ${entry.key} — decisions/inbox: ${pendingCount} pending${processingNote}`);
    }
  }

  // Path validation
  const reposRoot = path.join(globalDir, 'repos');
  if (storage.existsSync(reposRoot)) {
    console.log(`   ${GREEN}✅${RESET} Path validation: repos/ root exists`);
  }
}

// ============================================================================
// diagnose — step-by-step resolution trace for debugging
// ============================================================================

function runDiagnose(cwd: string): void {
  console.log('🔎 Shared squad resolution trace');
  console.log(`   cwd: ${cwd}`);
  console.log('');

  // Step 1: Find git root
  let gitRoot: string | null = null;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    console.log(`1. ${GREEN}✅${RESET} Git root: ${gitRoot}`);
  } catch {
    console.log(`1. ${RED}❌${RESET} Not in a git repository`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Cannot resolve shared squad — not a git repo.`);
    return;
  }

  // Step 2: Check local .squad/
  const localSquad = path.join(gitRoot, '.squad');
  const localAiTeam = path.join(gitRoot, '.ai-team');
  const hasLocalSquad = storage.existsSync(localSquad);
  const hasLocalAiTeam = storage.existsSync(localAiTeam);
  if (hasLocalSquad) {
    // Check if it's a junction/symlink pointing to the shared dir
    let isLink = false;
    let linkTarget = '';
    try {
      const stat = lstatSync(localSquad);
      isLink = stat.isSymbolicLink();
      if (isLink) {
        linkTarget = readlinkSync(localSquad).toString();
      }
    } catch {
      // lstat failed — treat as regular dir
    }
    if (isLink) {
      console.log(`2. ${YELLOW}⚠️${RESET}  Local .squad/ is a SYMLINK → ${linkTarget}`);
      console.log(`         ${DIM}Resolution uses worktree-local strategy (follows the link). Shared discovery skipped.${RESET}`);
    } else {
      console.log(`2. ${YELLOW}⚠️${RESET}  Local .squad/ EXISTS — resolution would use worktree-local, not shared`);
      console.log(`         Path: ${localSquad}`);
      console.log(`         ${DIM}(Shared resolution only activates when no local .squad/ is found)${RESET}`);
    }
  } else if (hasLocalAiTeam) {
    console.log(`2. ${YELLOW}⚠️${RESET}  Legacy .ai-team/ EXISTS — resolution would use worktree-local`);
    console.log(`         Path: ${localAiTeam}`);
  } else {
    console.log(`2. ${GREEN}✅${RESET} No local .squad/ or .ai-team/ — shared discovery will proceed`);
  }

  // Step 3: SQUAD_REPO_KEY env var
  const envKey = process.env['SQUAD_REPO_KEY'];
  if (envKey) {
    console.log(`3. ${GREEN}✅${RESET} SQUAD_REPO_KEY env var: "${envKey}" (skips URL matching)`);
  } else {
    console.log(`3. ${DIM}—${RESET}  SQUAD_REPO_KEY not set (will use URL matching)`);
  }

  // Step 4: SQUAD_APPDATA_OVERRIDE
  const appdataOverride = process.env['SQUAD_APPDATA_OVERRIDE'];
  if (appdataOverride) {
    console.log(`4. ${YELLOW}⚠️${RESET}  SQUAD_APPDATA_OVERRIDE: "${appdataOverride}"`);
  } else {
    console.log(`4. ${DIM}—${RESET}  SQUAD_APPDATA_OVERRIDE not set (using platform default)`);
  }

  // Step 5: Global squad path
  let globalDir: string;
  try {
    globalDir = resolveGlobalSquadPath();
    console.log(`5. ${GREEN}✅${RESET} Global config dir: ${globalDir}`);
  } catch (err) {
    console.log(`5. ${RED}❌${RESET} Global config dir UNREACHABLE`);
    console.log(`         ${(err as Error).message}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Cannot resolve shared squad — global squad data directory unreachable.`);
    return;
  }

  // Step 6: repos.json
  const reposJsonPath = path.join(globalDir, 'repos.json');
  if (!storage.existsSync(reposJsonPath)) {
    console.log(`6. ${RED}❌${RESET} repos.json NOT FOUND at ${reposJsonPath}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} No shared squads registered. Run \`squad init --shared\` or \`squad migrate --to shared\`.`);
    return;
  }

  const registry = loadRepoRegistry();
  if (!registry || registry.repos.length === 0) {
    console.log(`6. ${RED}❌${RESET} repos.json exists but is empty or invalid`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Registry has no entries.`);
    return;
  }
  console.log(`6. ${GREEN}✅${RESET} repos.json: ${registry.repos.length} registered ${registry.repos.length === 1 ? 'squad' : 'squads'}`);
  for (const entry of registry.repos) {
    console.log(`         ${DIM}key: ${entry.key}${RESET}`);
    for (const p of entry.urlPatterns) {
      console.log(`         ${DIM}  pattern: ${p}${RESET}`);
    }
  }

  // Step 7: Origin remote URL
  const remoteUrl = getRemoteUrl(gitRoot);
  if (!remoteUrl) {
    console.log(`7. ${RED}❌${RESET} No origin remote found`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Cannot discover shared squad — no origin remote. Set SQUAD_REPO_KEY env var instead.`);
    return;
  }
  console.log(`7. ${GREEN}✅${RESET} Origin URL: ${remoteUrl}`);

  // Step 8: Normalize URL
  let normalized: NormalizedRemote;
  try {
    normalized = normalizeRemoteUrl(remoteUrl);
    console.log(`8. ${GREEN}✅${RESET} Normalized URL: ${normalized.normalizedUrl}`);
    console.log(`         ${DIM}provider: ${normalized.provider}, key: ${normalized.key}${RESET}`);
  } catch (err) {
    console.log(`8. ${RED}❌${RESET} URL normalization failed: ${(err as Error).message}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Could not normalize origin URL.`);
    return;
  }

  // Step 9: Pattern matching
  const matchedEntry = registry.repos.find((entry) =>
    entry.urlPatterns.some((p) => p === normalized.normalizedUrl),
  );
  if (!matchedEntry) {
    console.log(`9. ${RED}❌${RESET} No URL pattern match`);
    console.log(`         ${DIM}Normalized URL "${normalized.normalizedUrl}" did not match any registered pattern.${RESET}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Origin URL doesn't match any registered shared squad.`);
    console.log(`${DIM}Fix: Run \`squad shared add-url "${normalized.normalizedUrl}" --key <repo-key>\`${RESET}`);
    console.log(`${DIM}  or: Run \`squad init --shared\` to register this clone${RESET}`);
    return;
  }
  console.log(`9. ${GREEN}✅${RESET} Matched: key="${matchedEntry.key}"`);

  // Step 10: Team dir exists
  const teamDir = path.join(globalDir, 'repos', ...matchedEntry.key.split('/'));
  if (!storage.existsSync(teamDir)) {
    console.log(`10. ${RED}❌${RESET} Team dir MISSING: ${teamDir}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Registry entry exists but team directory was not created.`);
    return;
  }
  console.log(`10. ${GREEN}✅${RESET} Team dir: ${teamDir}`);

  // Step 11: team.md exists and has members
  const teamMdPath = path.join(teamDir, 'team.md');
  if (!storage.existsSync(teamMdPath)) {
    console.log(`11. ${RED}❌${RESET} team.md NOT FOUND in team dir`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} Shared squad dir exists but has no team.md.`);
    return;
  }

  let teamMdContent = '';
  try {
    teamMdContent = storage.readSync(teamMdPath) ?? '';
  } catch {
    console.log(`11. ${RED}❌${RESET} team.md unreadable`);
    return;
  }

  // Detect corrupted single-line files (migration bug: all newlines stripped)
  if (teamMdContent.length > 50 && !teamMdContent.includes('\n')) {
    console.log(`11. ${RED}❌${RESET} team.md is CORRUPTED — entire file is a single line (no newlines)`);
    console.log(`         ${DIM}This is a known migration bug. The file content exists but has no line breaks.${RESET}`);
    console.log(`         ${DIM}Fix: rewrite team.md with proper newlines, or re-run migration.${RESET}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} team.md is corrupted (no newlines). The coordinator cannot parse it.`);
    return;
  }

  const membersMatch = teamMdContent.match(/## Members\s*\r?\n([\s\S]*?)(?=\r?\n##|$)/);
  if (!membersMatch) {
    console.log(`11. ${YELLOW}⚠️${RESET}  team.md exists but has no "## Members" section`);
    console.log(`         ${DIM}The coordinator looks for "## Members" — this header is required.${RESET}`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} team.md is missing ## Members header. The coordinator will enter Init Mode.`);
    return;
  }

  // Count roster rows (lines with | that aren't the header separator)
  const rosterLines = membersMatch[1]!
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.match(/^\|\s*-+/));
  // First row is the header
  const memberCount = Math.max(0, rosterLines.length - 1);

  if (memberCount === 0) {
    console.log(`11. ${YELLOW}⚠️${RESET}  team.md has ## Members but roster is EMPTY`);
    console.log('');
    console.log(`${BOLD}Verdict:${RESET} No agents in the roster. The coordinator will enter Init Mode.`);
    return;
  }

  console.log(`11. ${GREEN}✅${RESET} team.md: ${memberCount} ${memberCount === 1 ? 'member' : 'members'} in roster`);

  // Step 12: agents/ directory
  const agentsDir = path.join(teamDir, 'agents');
  if (storage.existsSync(agentsDir)) {
    try {
      const agentDirs = storage.listSync(agentsDir).filter(
        (name: string) => !name.startsWith('.') && name !== '_alumni',
      );
      const withCharters = agentDirs.filter((name: string) =>
        storage.existsSync(path.join(agentsDir, name, 'charter.md')),
      );
      console.log(`12. ${GREEN}✅${RESET} agents/: ${agentDirs.length} dirs, ${withCharters.length} with charters`);
      for (const name of withCharters) {
        console.log(`         ${DIM}${name}/${RESET}`);
      }
    } catch {
      console.log(`12. ${YELLOW}⚠️${RESET}  agents/ exists but could not list contents`);
    }
  } else {
    console.log(`12. ${YELLOW}⚠️${RESET}  agents/ directory not found in team dir`);
  }

  // Step 13: Final resolution test
  console.log('');
  console.log(`${DIM}Running full SDK resolution...${RESET}`);
  const resolved = resolveSharedSquad(gitRoot);
  if (resolved) {
    console.log(`${GREEN}${BOLD}✅ Verdict: Shared squad resolves successfully.${RESET}`);
    console.log(`   mode:       ${resolved.mode}`);
    console.log(`   teamDir:    ${resolved.teamDir}`);
    console.log(`   projectDir: ${resolved.projectDir}`);
  } else {
    console.log(`${RED}${BOLD}❌ Verdict: resolveSharedSquad() returned null.${RESET}`);
    console.log(`   ${DIM}The step-by-step trace above showed all checks passing,${RESET}`);
    console.log(`   ${DIM}but the SDK function returned null. This likely means a${RESET}`);
    console.log(`   ${DIM}security check (realpathSync/symlink validation) blocked it.${RESET}`);
  }
}
