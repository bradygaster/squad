/**
 * Backend migration — upgrades state backend from local to orphan or two-layer.
 *
 * Currently supports:
 * - local → orphan
 * - local → two-layer
 *
 * Migration from orphan/two-layer back to local is not supported (would require
 * materializing all state from the orphan branch back to the working tree).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { installGitHooks } from './install-hooks.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const VALID_TARGETS = ['orphan', 'two-layer'];

/**
 * Migrate the state backend for an existing squad project.
 * Only local → orphan/two-layer is supported.
 */
export async function migrateStateBackend(dest: string, target: string): Promise<void> {
  if (!VALID_TARGETS.includes(target)) {
    console.log(`${YELLOW}⚠ Invalid backend target '${target}'. Supported: ${VALID_TARGETS.join(', ')}${RESET}`);
    return;
  }

  const configPath = path.join(dest, '.squad', 'config.json');
  let config: Record<string, unknown> = {};

  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* start fresh */ }

  const current = (config['stateBackend'] as string) || 'local';

  // Validate migration direction
  if (current === target) {
    console.log(`${YELLOW}⚠ Backend is already '${target}'. Nothing to do.${RESET}`);
    return;
  }

  if (current !== 'local' && current !== null) {
    console.log(`${YELLOW}⚠ Migration from '${current}' to '${target}' is not supported.${RESET}`);
    console.log(`  Only local → orphan or local → two-layer is supported at this time.`);
    return;
  }

  console.log(`\n${BOLD}Migrating state backend: ${current} → ${target}${RESET}\n`);

  // Step 1: Create orphan branch if needed
  try {
    execFileSync('git', ['rev-parse', '--verify', 'refs/heads/squad-state'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`  ${GREEN}✓${RESET} squad-state branch already exists`);
  } catch {
    try {
      const readmeContent = '# Squad State\n\nThis orphan branch stores mutable squad state.\nIt is managed automatically and should not be edited by hand.\n';
      const blobHash = execFileSync('git', ['hash-object', '-w', '--stdin'], {
        cwd: dest, encoding: 'utf-8', input: readmeContent, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const treeInput = `100644 blob ${blobHash}\tREADME.md\n`;
      const treeHash = execFileSync('git', ['mktree'], {
        cwd: dest, encoding: 'utf-8', input: treeInput, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const commitHash = execFileSync('git', ['commit-tree', treeHash, '-m', 'init: squad-state orphan branch'], {
        cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      execFileSync('git', ['update-ref', 'refs/heads/squad-state', commitHash], {
        cwd: dest, stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`  ${GREEN}✓${RESET} squad-state orphan branch created`);
    } catch (err) {
      console.log(`${YELLOW}⚠ Could not create squad-state branch: ${err instanceof Error ? err.message : err}${RESET}`);
      return;
    }
  }

  // Step 2: Update config
  config['stateBackend'] = target;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${GREEN}✓${RESET} config.json updated: stateBackend = ${target}`);

  // Step 3: Install git hooks
  installGitHooks(dest, { force: true });

  console.log(`\n${GREEN}${BOLD}✓ Migration complete.${RESET} Backend is now '${target}'.\n`);
}
