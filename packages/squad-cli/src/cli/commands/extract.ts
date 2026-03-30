/**
 * squad extract — extract learnings from consult mode session.
 *
 * Reads staged learnings from .squad/extract/ (classified by Scribe during session)
 * and merges approved items to your personal squad.
 *
 * @module cli/commands/extract
 */

import { resolve, basename } from 'node:path';
import { createInterface } from 'node:readline';
import {
  isConsultMode,
  detectLicense,
  loadStagedLearnings,
  logConsultation,
  mergeToPersonalSquad,
  getPersonalSquadRoot,
  FSStorageProvider,
  type SquadDirConfig,
  type LicenseInfo,
  type StagedLearning,
} from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';

const storage = new FSStorageProvider();

/**
 * Prompt user for yes/no confirmation via stdin.
 */
async function promptConfirm(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(res => {
    rl.question(`${question} [y/N] `, answer => {
      rl.close();
      res(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt user to select items from a list.
 * Returns indices of selected items.
 */
async function promptSelection(
  items: string[],
  preselected: boolean[],
): Promise<boolean[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(res => {
    console.log('');
    console.log('Enter item numbers to toggle, or:');
    console.log('  a = accept all shown');
    console.log('  n = reject all shown');
    console.log('  done = finish selection');
    console.log('');

    const selected = [...preselected];

    const showItems = () => {
      items.forEach((item, i) => {
        const marker = selected[i] ? '✓' : ' ';
        console.log(`  [${marker}] ${i + 1}. ${item}`);
      });
    };

    showItems();

    const ask = () => {
      rl.question('\nToggle (1-' + items.length + '), a, n, or done: ', answer => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === 'done' || trimmed === '') {
          rl.close();
          res(selected);
          return;
        }
        if (trimmed === 'a') {
          selected.fill(true);
          showItems();
          ask();
          return;
        }
        if (trimmed === 'n') {
          selected.fill(false);
          showItems();
          ask();
          return;
        }
        const idx = parseInt(trimmed, 10) - 1;
        if (idx >= 0 && idx < items.length) {
          selected[idx] = !selected[idx];
          showItems();
        }
        ask();
      });
    };

    ask();
  });
}

/**
 * Run the extract command.
 *
 * @param cwd - Current working directory (project root).
 * @param args - Command-line arguments.
 */
export async function runExtract(cwd: string, args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const clean = args.includes('--clean');
  const yes = args.includes('--yes');
  const acceptRisks = args.includes('--accept-risks');
  const force = args.includes('--force');
  const squadDir = resolve(cwd, '.squad');
  const configPath = resolve(squadDir, 'config.json');

  // Check we're in consult mode
  if (!storage.existsSync(configPath)) {
    fatal(
      'No .squad/config.json found.\n' +
        '   Run `squad consult` first to enter consult mode.',
    );
  }

  let config: SquadDirConfig & { sourceSquad?: string };
  try {
    const raw = storage.readSync(configPath);
    if (!raw) {
      fatal('Invalid .squad/config.json — cannot parse.');
    }
    config = JSON.parse(raw);
  } catch {
    fatal('Invalid .squad/config.json — cannot parse.');
  }

  if (!isConsultMode(config)) {
    fatal(
      'Not in consult mode.\n' +
        '   This command only works after `squad consult`.\n' +
        '   If this is a project-owned squad, use `squad export` instead.',
    );
  }

  // Check if extraction is disabled
  if (config.extractionDisabled && !force) {
    fatal(
      'Extraction is disabled for this consult session.\n' +
        '   This was configured in your personal squad settings.\n' +
        '   Use --force to override.',
    );
  }

  const sourceSquad = config.sourceSquad;
  if (!sourceSquad) {
    fatal('Missing sourceSquad in config.json — cannot determine personal squad location.');
  }

  // Validate sourceSquad points to the expected personal squad root
  // This prevents malicious configs from writing to arbitrary paths
  const expectedPersonalSquad = getPersonalSquadRoot();
  if (resolve(sourceSquad) !== resolve(expectedPersonalSquad)) {
    fatal(
      `sourceSquad path mismatch.\n` +
        `   Config points to: ${sourceSquad}\n` +
        `   Expected: ${expectedPersonalSquad}\n` +
        `   This may indicate a tampered config. Aborting for safety.`,
    );
  }

  // Check license
  const licensePath = resolve(cwd, 'LICENSE');
  let license: LicenseInfo = { type: 'unknown' };

  if (storage.existsSync(licensePath)) {
    const licenseContent = storage.readSync(licensePath) ?? '';
    license = detectLicense(licenseContent);
  }

  // Block on copyleft unless --accept-risks
  if (license.type === 'copyleft' && !acceptRisks) {
    console.error(`🚫 License: ${license.spdxId || 'copyleft'}`);
    console.error('   Extraction blocked. Patterns from copyleft projects may carry');
    console.error('   license obligations that affect your future work.');
    console.error('');
    console.error('   See: https://squad.dev/docs/license-risk');
    console.error('');
    console.error('   To proceed anyway: squad extract --accept-risks');
    process.exit(1);
  }

  // Warn on unknown license
  if (license.type === 'unknown') {
    console.warn('⚠️  No LICENSE file found or license type unknown.');
    console.warn('   Cannot determine license risk for extraction.');
    console.warn('   Proceed with caution.');
    console.warn('');
  }

  // Show license status for permissive licenses
  if (license.type === 'permissive') {
    console.log(`✅ License: ${license.spdxId || 'permissive'} (safe to extract)`);
    console.log('');
  }

  // Load staged learnings from .squad/extract/
  const staged = loadStagedLearnings(squadDir);

  if (staged.length === 0) {
    console.log('📭 No learnings staged for extraction.');
    console.log('   (Scribe places generic learnings in .squad/extract/ during sessions)');
    console.log('');

    // Clean up if requested
    if (clean) {
      if (!yes) {
        const confirmed = await promptConfirm('Delete project .squad/ directory?');
        if (!confirmed) {
          console.log('Keeping .squad/ directory.');
          return;
        }
      }
      storage.deleteDirSync(squadDir);
      console.log('🗑️  Deleted .squad/');
    }
    return;
  }

  const projectName = basename(cwd);

  // Dry-run: preview what would happen
  if (dryRun) {
    console.log('📋 Dry-run mode — no changes will be made');
    console.log('');
    console.log(`   Project: ${projectName}`);
    console.log(`   Personal squad: ${sourceSquad}`);
    console.log(`   License: ${license.spdxId || license.type}`);
    console.log('');
    console.log(`📤 ${staged.length} learning(s) staged for extraction:`);
    for (const l of staged) {
      const summary = l.content.slice(0, 50).replace(/\n/g, ' ');
      console.log(`   - ${l.filename}: "${summary}${l.content.length > 50 ? '...' : ''}"`);
    }
    return;
  }

  // Interactive selection
  console.log(`📤 ${staged.length} learning(s) staged for extraction:`);
  console.log('');

  if (license.type === 'copyleft' && acceptRisks) {
    console.log(`⚠️  License: ${license.spdxId || 'copyleft'} (extracting with --accept-risks)`);
    console.log('');
  }

  const items = staged.map(l => {
    const summary = l.content.slice(0, 50).replace(/\n/g, ' ');
    return `${l.filename}: "${summary}${l.content.length > 50 ? '...' : ''}"`;
  });

  // Default all staged learnings to selected
  const preselected = staged.map(() => true);
  const selected = await promptSelection(items, preselected);

  const toExtract = staged.filter((_, i) => selected[i]);
  const toSkip = staged.filter((_, i) => !selected[i]);

  console.log('');

  if (toExtract.length === 0) {
    console.log('ℹ️  No learnings selected for extraction.');

    // Clean up if requested
    if (clean) {
      if (!yes) {
        const confirmed = await promptConfirm('Delete project .squad/ directory?');
        if (!confirmed) {
          console.log('Keeping .squad/ directory.');
          return;
        }
      }
      storage.deleteDirSync(squadDir);
      console.log('🗑️  Deleted .squad/');
    }
    return;
  }

  // Merge to personal squad
  const mergeResult = await mergeToPersonalSquad(toExtract, sourceSquad);

  // Log consultation
  const result = {
    extracted: toExtract,
    skipped: toSkip,
    license,
    projectName,
    timestamp: new Date().toISOString(),
    acceptedRisks: acceptRisks,
  };
  const logPath = await logConsultation(sourceSquad, result);

  // Remove extracted files from .squad/extract/
  for (const learning of toExtract) {
    storage.deleteSync(learning.filepath);
  }

  console.log('✅ Extraction complete!');
  console.log(`   - ${mergeResult.decisions} learning(s) merged to decisions.md`);
  console.log(`   - Logged to: ${logPath}`);

  // Clean up if requested
  if (clean) {
    if (!yes) {
      const confirmed = await promptConfirm('Delete project .squad/ directory?');
      if (!confirmed) {
        console.log('');
        console.log('Keeping .squad/ directory.');
        return;
      }
    }

    storage.deleteDirSync(squadDir);
    console.log('');
    console.log('🗑️  Deleted .squad/');
  }
}
