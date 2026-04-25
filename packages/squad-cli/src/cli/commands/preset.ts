/**
 * squad preset — manage squad presets (curated agent collections)
 *
 * Presets are saved to SQUAD_HOME/presets/ (default: ~/.squad/presets/).
 * Each preset is a directory with a preset.json manifest + agents/ charters.
 *
 * Subcommands:
 *   squad preset list           — list available presets
 *   squad preset show <name>    — show preset details
 *   squad preset apply <name>   — install preset agents into current squad
 *   squad preset save <name>    — save current project agents as a preset
 *   squad preset init           — initialize presets directory in squad home
 *
 * Note: Presets capture agents only (charters). For full squad snapshots
 * including casting state, skills, and routing rules — e.g. to share a
 * configured squad or publish to an agent toolbox — use `squad export`.
 *
 * @module cli/commands/preset
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { resolveSquadHome, ensureSquadHome, resolvePresetsDir } from '@bradygaster/squad-sdk/resolution';
import { listPresets, loadPreset, applyPreset, savePreset, seedBuiltinPresets } from '@bradygaster/squad-sdk/presets';
import { resolveSquad } from '@bradygaster/squad-sdk/resolution';
import { success, warn, info, BOLD, RESET, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';

/**
 * Entry point for `squad preset` subcommands.
 */
export async function runPreset(cwd: string, subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
      await presetList();
      break;
    case 'show': {
      const name = args[0];
      if (!name) {
        fatal('Usage: squad preset show <name>');
      }
      await presetShow(name!);
      break;
    }
    case 'apply': {
      const name = args[0];
      if (!name) {
        fatal('Usage: squad preset apply <name> [--force]');
      }
      const force = args.includes('--force');
      await presetApply(cwd, name!, force);
      break;
    }
    case 'init': {
      const remote = args.includes('--remote');
      await presetInit(remote);
      break;
    }
    case 'save': {
      const name = args[0];
      if (!name) {
        fatal('Usage: squad preset save <name> [--force] [--description "..."]');
      }
      const force = args.includes('--force');
      const descIdx = args.indexOf('--description');
      const description = descIdx >= 0 ? args[descIdx + 1] : undefined;
      await presetSave(cwd, name!, force, description);
      break;
    }
    default:
      fatal(
        `Unknown preset subcommand: ${subcommand}\n` +
        `Usage:\n` +
        `  squad preset list\n` +
        `  squad preset show <name>\n` +
        `  squad preset apply <name> [--force]\n` +
        `  squad preset save <name>\n` +
        `  squad preset init [--remote]`,
      );
  }
}

// ============================================================================
// Subcommand: init
// ============================================================================

async function presetInit(remote: boolean): Promise<void> {
  if (remote) {
    await presetInitRemote();
    return;
  }

  const homeDir = ensureSquadHome();
  const presetsDir = path.join(homeDir, 'presets');

  const seeded = seedBuiltinPresets();

  success('Presets directory initialized');
  info(`  Path: ${presetsDir}`);
  if (seeded.length > 0) {
    info(`  Built-in presets installed: ${seeded.join(', ')}`);
  }
  info(`  Run 'squad preset list' to see available presets.`);
  console.log();
  info(`${DIM}Tip: Run 'squad preset init --remote' to back your squad home`);
  info(`with a private GitHub repo so presets roam across machines.${RESET}`);
}

async function presetInitRemote(): Promise<void> {
  // Check gh CLI is available
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    fatal('GitHub CLI (gh) is required for --remote. Install it: https://cli.github.com');
  }

  // Check gh auth
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    fatal('Not logged in to GitHub CLI. Run: gh auth login');
  }

  const os = await import('node:os');
  const envHome = process.env['SQUAD_HOME'];
  const homeDir = envHome ? path.resolve(envHome) : path.join(os.homedir(), '.squad');
  const repoName = 'squad-home';

  // Get GitHub username
  let ghUser: string;
  try {
    ghUser = execSync('gh api user --jq .login', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    fatal('Could not determine GitHub username. Run: gh auth login');
    return;
  }

  const repoFullName = `${ghUser}/${repoName}`;

  // Check if SQUAD_HOME is already a git repo
  if (fs.existsSync(path.join(homeDir, '.git'))) {
    info(`Squad home is already a git repo: ${homeDir}`);
    const seeded = seedBuiltinPresets();
    if (seeded.length > 0) {
      info(`  Built-in presets installed: ${seeded.join(', ')}`);
    }
    success('Squad home ready — presets roam via git push/pull.');
    return;
  }

  // If ~/.squad/ doesn't exist yet, try to clone existing remote repo
  if (!fs.existsSync(homeDir)) {
    let repoExists = false;
    try {
      execSync(`gh repo view ${repoFullName} --json name`, { stdio: 'pipe' });
      repoExists = true;
    } catch {
      repoExists = false;
    }

    if (repoExists) {
      // Second machine — clone existing squad home
      info(`Found existing repo ${repoFullName} — cloning...`);
      try {
        execSync(`gh repo clone ${repoFullName} "${homeDir}"`, { stdio: 'inherit' });
        const seeded = seedBuiltinPresets();
        if (seeded.length > 0) {
          info(`  New built-in presets added: ${seeded.join(', ')}`);
          try {
            execSync(`git -C "${homeDir}" add -A && git -C "${homeDir}" commit -m "seed built-in presets" --allow-empty`, { stdio: 'pipe' });
          } catch { /* nothing new to commit */ }
        }
        success(`Squad home cloned from ${repoFullName}`);
        info(`  Path: ${homeDir}`);
        success('Presets synced — you\'re ready to go.');
        return;
      } catch {
        fatal(`Failed to clone ${repoFullName}. Check permissions.`);
      }
    }

    // Repo doesn't exist — create fresh
    info(`Creating private repo ${repoFullName}...`);
    try {
      fs.mkdirSync(homeDir, { recursive: true });
      execSync(`git init`, { cwd: homeDir, stdio: 'pipe' });
      execSync(`gh repo create ${repoName} --private --source "${homeDir}" --push --description "Squad home — presets and config"`, {
        stdio: 'inherit',
      });
    } catch {
      fatal(`Failed to create repo. Try manually: gh repo create ${repoName} --private`);
    }
  } else {
    // ~/.squad/ exists but isn't a git repo — init and connect
    info(`Initializing git in existing squad home: ${homeDir}`);
    execSync(`git init`, { cwd: homeDir, stdio: 'pipe' });

    let repoExists = false;
    try {
      execSync(`gh repo view ${repoFullName} --json name`, { stdio: 'pipe' });
      repoExists = true;
    } catch {
      repoExists = false;
    }

    if (!repoExists) {
      info(`Creating private repo ${repoFullName}...`);
      try {
        execSync(`gh repo create ${repoName} --private --source "${homeDir}" --push --description "Squad home — presets and config"`, {
          stdio: 'inherit',
        });
      } catch {
        fatal(`Failed to create repo ${repoFullName}.`);
      }
    } else {
      info(`Connecting to existing repo ${repoFullName}...`);
      try {
        execSync(`git remote add origin https://github.com/${repoFullName}.git`, { cwd: homeDir, stdio: 'pipe' });
        execSync(`git pull origin main --allow-unrelated-histories`, { cwd: homeDir, stdio: 'pipe' });
      } catch {
        warn('Could not pull from remote. You may need to resolve manually.');
      }
    }
  }

  // Seed built-in presets and push
  const seeded = seedBuiltinPresets();

  try {
    execSync(`git -C "${homeDir}" add -A`, { stdio: 'pipe' });
    execSync(`git -C "${homeDir}" commit -m "Initialize squad home with presets"`, { stdio: 'pipe' });
    execSync(`git -C "${homeDir}" push -u origin main`, { stdio: 'pipe' });
  } catch {
    // May fail if nothing to commit or push
  }

  success(`Squad home initialized with private repo: ${repoFullName}`);
  info(`  Path: ${homeDir}`);
  if (seeded.length > 0) {
    info(`  Built-in presets installed: ${seeded.join(', ')}`);
  }
  console.log();
  info(`On another machine, run the same command to sync your presets:`);
  info(`  ${BOLD}squad preset init --remote${RESET}`);
}

// ============================================================================
// Subcommand: list
// ============================================================================

async function presetList(): Promise<void> {
  const presetsDir = resolvePresetsDir();

  if (!presetsDir) {
    info('No presets directory found.');
    info('  Run `squad preset init --remote` to set up with a GitHub repo (recommended).');
    info('  Or `squad preset init` for local-only setup.');
    return;
  }

  const presets = listPresets();

  if (presets.length === 0) {
    info(`Presets directory exists at ${presetsDir} but contains no presets.`);
    info('  Create a preset directory with a preset.json manifest.');
    return;
  }

  console.log(`\n${BOLD}Available Presets${RESET} (${presets.length}):\n`);

  const maxNameLen = Math.max(...presets.map(p => p.name.length), 4);

  console.log(
    `  ${'Name'.padEnd(maxNameLen)}  ` +
    `${'Agents'}  ` +
    `Description`
  );
  console.log(
    `  ${'─'.repeat(maxNameLen)}  ` +
    `${'─'.repeat(6)}  ` +
    `${'─'.repeat(40)}`
  );

  for (const preset of presets) {
    console.log(
      `  ${preset.name.padEnd(maxNameLen)}  ` +
      `${String(preset.agents.length).padEnd(6)}  ` +
      `${DIM}${preset.description}${RESET}`
    );
  }

  console.log();
}

// ============================================================================
// Subcommand: show
// ============================================================================

async function presetShow(name: string): Promise<void> {
  const preset = loadPreset(name);

  if (!preset) {
    fatal(`Preset '${name}' not found. Run 'squad preset list' to see available presets.`);
  }

  console.log(`\n${BOLD}${preset.name}${RESET} v${preset.version}`);
  console.log(`  ${preset.description}`);
  if (preset.author) console.log(`  Author: ${preset.author}`);
  if (preset.tags?.length) console.log(`  Tags: ${preset.tags.join(', ')}`);

  console.log(`\n  ${BOLD}Agents${RESET} (${preset.agents.length}):`);

  for (const agent of preset.agents) {
    console.log(`    • ${BOLD}${agent.name}${RESET} (${agent.role})${agent.description ? ` — ${DIM}${agent.description}${RESET}` : ''}`);
  }

  console.log();
}

// ============================================================================
// Subcommand: apply
// ============================================================================

async function presetApply(cwd: string, name: string, force: boolean): Promise<void> {
  // Find target squad directory
  const squadDir = resolveSquad(cwd);
  if (!squadDir) {
    fatal('No .squad/ directory found. Run `squad init` first, or use from a repo with a squad.');
  }

  const targetAgentsDir = path.join(squadDir, 'agents');

  const results = applyPreset(name, targetAgentsDir, { force });

  if (results.length === 1 && results[0]!.status === 'error' && results[0]!.agent === name) {
    fatal(results[0]!.reason ?? `Failed to apply preset '${name}'`);
  }

  let installed = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of results) {
    switch (result.status) {
      case 'installed':
        success(`  ${result.agent}`);
        installed++;
        break;
      case 'skipped':
        warn(`  ${result.agent} — ${result.reason}`);
        skipped++;
        break;
      case 'error':
        console.error(`  ✗ ${result.agent} — ${result.reason}`);
        errors++;
        break;
    }
  }

  console.log();
  if (installed > 0) success(`Applied preset '${name}': ${installed} agents installed`);
  if (skipped > 0) info(`  ${skipped} agents skipped (already exist)`);
  if (errors > 0) warn(`  ${errors} agents had errors`);
}

// ============================================================================
// Subcommand: save
// ============================================================================

async function presetSave(cwd: string, name: string, force: boolean, description?: string): Promise<void> {
  const squadDir = resolveSquad(cwd);
  if (!squadDir) {
    fatal('No .squad/ directory found. Initialize a squad first with `squad init`.');
  }

  try {
    const destDir = savePreset(name, squadDir, { force, description });
    success(`Preset '${name}' saved`);
    info(`  Location: ${destDir}`);
    info(`  Use it in any project: squad preset apply ${name}`);
    console.log();
    info(`${DIM}Tip: Presets save agents only (charters). For a full squad snapshot`);
    info(`including casting state, skills, and routing rules — e.g. to share`);
    info(`a configured squad or publish to an agent toolbox — use 'squad export'.${RESET}`);
  } catch (err) {
    fatal(String(err));
  }
}
