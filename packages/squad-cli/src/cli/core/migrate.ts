/**
 * Squad migrate command — backs up, cleans, and reinitialises .squad/
 * Safe for all install methods: global npm, local npm, npx.
 * @module cli/core/migrate
 */

import fs from 'node:fs';
import path from 'node:path';
import { initSquad as sdkInitSquad } from '@bradygaster/squad-sdk';
import { success, warn, info, DIM, BOLD, RESET } from './output.js';
import { getPackageVersion } from './version.js';

export interface MigrateOptions {
  /** Preview what would happen without making changes. */
  dryRun?: boolean;
  /** Custom directory to write the backup into. Defaults to .squad-backup-{timestamp}/ */
  backupDir?: string;
}

/** Files and directories that Squad owns and regenerates — never restored from backup. */
const SQUAD_OWNED = [
  'templates',
  'casting',
];

/** Files and directories that belong to the user — restored from backup after reinit. */
const USER_OWNED = [
  'agents',
  'decisions.md',
  'decisions',
  'routing.md',
  'team.md',
  'skills',
  'log',
  'orchestration-log',
  'identity',
];

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function removeRecursive(target: string): void {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

export async function runMigrate(cwd: string, options: MigrateOptions = {}): Promise<void> {
  const { dryRun = false } = options;

  const prefix = dryRun ? `${DIM}[dry-run]${RESET} ` : '';

  console.log();
  console.log(`${BOLD}Squad Migrate${RESET}${dryRun ? ` ${DIM}(dry-run — no changes will be made)${RESET}` : ''}`);
  console.log();

  // Detect the squad directory — support both .squad/ and legacy .ai-team/
  let squadDir = path.join(cwd, '.squad');
  const legacyDir = path.join(cwd, '.ai-team');

  if (!fs.existsSync(squadDir)) {
    if (fs.existsSync(legacyDir)) {
      warn(`Found legacy .ai-team/ directory. This migration will move it to .squad/.`);
      squadDir = legacyDir;
    } else {
      info('No .squad/ or .ai-team/ directory found. Running a fresh init instead.');
      if (!dryRun) {
        const version = getPackageVersion();
        await sdkInitSquad({
          teamRoot: cwd,
          projectName: path.basename(cwd) || 'my-project',
          agents: [{ name: 'scribe', role: 'scribe', displayName: 'Scribe' }],
          skipExisting: true,
          includeWorkflows: true,
          includeTemplates: true,
          version,
        });
        success('Initialized fresh .squad/ directory.');
      } else {
        console.log(`${prefix}Would run: squad init`);
      }
      return;
    }
  }

  // Step 1: Back up
  const timestamp = formatTimestamp();
  const backupRoot = options.backupDir
    ? path.resolve(cwd, options.backupDir)
    : path.join(cwd, `.squad-backup-${timestamp}`);

  console.log(`  Step 1/4  Backup`);
  console.log(`           ${squadDir}`);
  console.log(`        →  ${backupRoot}`);
  console.log();

  if (!dryRun) {
    if (fs.existsSync(backupRoot)) {
      warn(`Backup directory already exists: ${backupRoot}`);
      process.exit(1);
    }
    copyRecursive(squadDir, backupRoot);
    success(`Backed up to ${path.relative(cwd, backupRoot)}/`);
  } else {
    console.log(`${prefix}Would copy ${path.relative(cwd, squadDir)}/ → ${path.relative(cwd, backupRoot)}/`);
  }

  // Step 2: Remove squad-owned files from the existing directory
  console.log();
  console.log(`  Step 2/4  Remove Squad-owned files`);

  for (const owned of SQUAD_OWNED) {
    const target = path.join(squadDir, owned);
    if (fs.existsSync(target)) {
      if (!dryRun) {
        removeRecursive(target);
        console.log(`           removed: ${path.relative(cwd, target)}`);
      } else {
        console.log(`${prefix}Would remove: ${path.relative(cwd, target)}`);
      }
    }
  }

  // Also remove the top-level squad.agent.md (Squad-owned in project root)
  const agentFile = path.join(cwd, '.github', 'agents', 'squad.agent.md');
  if (fs.existsSync(agentFile)) {
    if (!dryRun) {
      removeRecursive(agentFile);
      console.log(`           removed: ${path.relative(cwd, agentFile)}`);
    } else {
      console.log(`${prefix}Would remove: ${path.relative(cwd, agentFile)}`);
    }
  }

  // If migrating from .ai-team/, remove it entirely now (after backup)
  if (squadDir === legacyDir) {
    if (!dryRun) {
      removeRecursive(legacyDir);
      console.log(`           removed legacy: .ai-team/`);
    } else {
      console.log(`${prefix}Would remove: .ai-team/`);
    }
  }

  // Step 3: Reinitialize
  console.log();
  console.log(`  Step 3/4  Reinitialize .squad/`);

  if (!dryRun) {
    const version = getPackageVersion();
    await sdkInitSquad({
      teamRoot: cwd,
      projectName: path.basename(cwd) || 'my-project',
      agents: [{ name: 'scribe', role: 'scribe', displayName: 'Scribe' }],
      skipExisting: true,
      includeWorkflows: true,
      includeTemplates: true,
      version,
    });
    success('Scaffolded fresh .squad/ directory.');
  } else {
    console.log(`${prefix}Would run: sdkInitSquad (fresh scaffold)`);
  }

  // Step 4: Restore user-owned files
  console.log();
  console.log(`  Step 4/4  Restore user files from backup`);

  for (const userFile of USER_OWNED) {
    const backupSrc = path.join(backupRoot, userFile);
    const restoreDest = path.join(cwd, '.squad', userFile);

    if (!fs.existsSync(backupSrc)) continue;

    if (!dryRun) {
      // Skip if reinit already wrote this file and the user had nothing custom
      // (user-owned files that exist in the fresh scaffold are still overwritten by the backup)
      copyRecursive(backupSrc, restoreDest);
      console.log(`           restored: .squad/${userFile}`);
    } else {
      console.log(`${prefix}Would restore: backup/${userFile} → .squad/${userFile}`);
    }
  }

  console.log();
  if (dryRun) {
    console.log(`${DIM}Dry run complete. No changes were made.${RESET}`);
    console.log(`${DIM}Run without --dry-run to apply.${RESET}`);
  } else {
    success('Migration complete.');
    console.log();
    console.log(`  Your backup is at: ${DIM}${path.relative(cwd, backupRoot)}/${RESET}`);
    console.log(`  Run ${BOLD}squad doctor${RESET} to verify the new setup.`);
    console.log();
    console.log(`  ${DIM}When you're happy everything works, you can delete the backup:${RESET}`);
    console.log(`  ${DIM}  rm -rf ${path.relative(cwd, backupRoot)}${RESET}`);
  }
  console.log();
}
