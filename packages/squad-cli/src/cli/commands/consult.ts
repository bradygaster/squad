/**
 * squad consult — enter consult mode with your personal squad.
 *
 * Creates .squad/ with consult: true, pointing to your personal squad.
 * The project's .squad/ is hidden via .git/info/exclude (never committed).
 *
 * @module cli/commands/consult
 */

import { resolve, basename } from 'node:path';
import {
  setupConsultMode,
  isConsultMode,
  PersonalSquadNotFoundError,
  FSStorageProvider,
} from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import { fatal } from '../core/errors.js';

/**
 * Run the consult command.
 *
 * @param cwd - Current working directory (project root).
 * @param args - Command-line arguments.
 */
export async function runConsult(cwd: string, args: string[]): Promise<void> {
  const showStatus = args.includes('--status');
  const dryRun = args.includes('--check');
  const squadDir = resolve(cwd, '.squad');

  // --status: show current consult mode status (query only, no setup)
  if (showStatus) {
    if (storage.existsSync(squadDir)) {
      try {
        const raw = storage.readSync(resolve(squadDir, 'config.json'));
        if (!raw) {
          console.log('ℹ️  Project has .squad/ but config is invalid');
          return;
        }
        const config = JSON.parse(raw);
        if (isConsultMode(config)) {
          console.log('✅ Consult mode active');
          console.log(`   Team root: ${config.teamRoot ?? config.sourceSquad}`);
          console.log(`   Project: ${basename(cwd)}`);
          if (config.extractionDisabled) {
            console.log('   Extraction: disabled');
          }
        } else {
          console.log('ℹ️  Project has .squad/ but not in consult mode');
        }
      } catch {
        console.log('ℹ️  Project has .squad/ but config is invalid');
      }
    } else {
      console.log('ℹ️  Not in consult mode (no .squad/ directory)');
    }
    return;
  }

  // Setup consult mode via SDK
  // extractionDisabled is inherited from personal squad config
  try {
    const result = await setupConsultMode({
      projectRoot: cwd,
      dryRun,
    });

    if (dryRun) {
      console.log('📋 Dry-run: squad consult would:');
      console.log(`   1. Create ${result.squadDir}/config.json with consult: true`);
      console.log(`   2. Add .squad/ to ${result.gitExclude}`);
      console.log(`   3. Link to personal squad at ${result.personalSquadRoot}`);
      if (result.extractionDisabled) {
        console.log('   4. Extraction disabled (configured in personal squad)');
      }
    } else {
      console.log('✅ Consult mode activated');
      console.log(`   Team: ${result.personalSquadRoot}`);
      console.log(`   Project: ${result.projectName}`);
      if (result.extractionDisabled) {
        console.log('   Extraction: disabled (configured in personal squad)');
      }
      console.log('');
      console.log('   Your squad is now consulting on this project.');
      if (!result.extractionDisabled) {
        console.log('   Run `squad extract` when done to bring learnings home.');
      }
    }
  } catch (error) {
    if (error instanceof PersonalSquadNotFoundError) {
      fatal(
        'No personal squad found.\n' +
          '   Run `squad init --global` first to create your personal squad.',
      );
    }
    // Re-throw other SDK errors with CLI-friendly formatting
    if (error instanceof Error) {
      fatal(error.message);
    }
    throw error;
  }
}
