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
    case 'init':
      await presetInit();
      break;
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
        `       Available: list | show <name> | apply <name> [--force] | save <name> | init`,
      );
  }
}

// ============================================================================
// Subcommand: init
// ============================================================================

async function presetInit(): Promise<void> {
  const homeDir = ensureSquadHome();
  const presetsDir = path.join(homeDir, 'presets');

  const seeded = seedBuiltinPresets();

  success('Presets directory initialized');
  info(`  Path: ${presetsDir}`);
  if (seeded.length > 0) {
    info(`  Built-in presets installed: ${seeded.join(', ')}`);
  }
  info(`  Run 'squad preset list' to see available presets.`);
}

// ============================================================================
// Subcommand: list
// ============================================================================

async function presetList(): Promise<void> {
  const presetsDir = resolvePresetsDir();

  if (!presetsDir) {
    info('No presets directory found.');
    info('  Run `squad preset init` to set up presets in squad home.');
    info('  Or set SQUAD_HOME to point to your squad home directory.');
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
        success(`  ✓ ${result.agent}`);
        installed++;
        break;
      case 'skipped':
        warn(`  ⊘ ${result.agent} — ${result.reason}`);
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
