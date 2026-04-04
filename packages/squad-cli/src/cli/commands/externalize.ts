/**
 * squad externalize — move .squad/ state out of the working tree.
 *
 * Moves all squad state to `{resolveGlobalSquadPath()}/projects/{projectKey}/`
 * (platform-specific: `%APPDATA%/squad/` on Windows, `~/Library/Application Support/squad/`
 * on macOS, `$XDG_CONFIG_HOME/squad/` on Linux) and writes a thin `.squad/config.json`
 * marker in the repo. After externalization:
 * - State survives branch switches (not tied to the working tree)
 * - State is invisible to `git status` and never pollutes PRs
 * - A `.squad/config.json` marker lets the walk-up resolver find state
 *
 * To restore local state, run `squad internalize`.
 *
 * @module cli/commands/externalize
 */

import path from 'node:path';
import { FSStorageProvider, resolveExternalStateDir, deriveProjectKey } from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';

const storage = new FSStorageProvider();

/** Directories under .squad/ that hold the actual state */
const STATE_DIRS = [
  'agents', 'casting', 'decisions', 'identity', 'orchestration-log',
  'log', 'plugins', 'templates', 'skills', 'sessions', '.scratch',
];

/** Files under .squad/ that hold state (not config.json — that stays) */
const STATE_FILES = [
  'team.md', 'routing.md', 'ceremonies.md', 'decisions.md',
  'decisions-archive.md', '.first-run',
];

/**
 * Move .squad/ state to the external directory.
 *
 * @param projectDir - Absolute path to the project root (where .squad/ lives).
 * @param projectKey - Optional explicit project key. Defaults to repo basename slug.
 */
export function runExternalize(projectDir: string, projectKey?: string): void {
  const squadDir = path.join(projectDir, '.squad');
  if (!storage.existsSync(squadDir)) {
    fatal('.squad/ directory not found. Run `squad init` first.');
  }

  // Derive project key
  const key = projectKey || deriveProjectKey(projectDir);
  const externalDir = resolveExternalStateDir(key, true);

  console.log(`📦 Externalizing .squad/ state to: ${externalDir}`);

  let movedCount = 0;

  // Move directories
  for (const dir of STATE_DIRS) {
    const src = path.join(squadDir, dir);
    if (!storage.existsSync(src)) continue;
    const dest = path.join(externalDir, dir);
    // Copy contents into the external state directory. If destination files
    // already exist, they may be overwritten by copyDirRecursive().
    copyDirRecursive(src, dest);
    storage.deleteDirSync?.(src);
    movedCount++;
  }

  // Move files
  for (const file of STATE_FILES) {
    const src = path.join(squadDir, file);
    if (!storage.existsSync(src)) continue;
    const dest = path.join(externalDir, file);
    const content = storage.readSync(src);
    if (content != null) {
      storage.mkdirSync(path.dirname(dest), { recursive: true });
      storage.writeSync(dest, content);
    }
    storage.deleteSync?.(src);
    movedCount++;
  }

  // Write thin config.json marker, preserving any existing config fields
  const configPath = path.join(squadDir, 'config.json');
  let existingConfig: Record<string, unknown> = {};
  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existingConfig = parsed as Record<string, unknown>;
        }
      }
    } catch { /* start fresh if config is malformed */ }
  }

  const config = {
    ...existingConfig,
    version: 1,
    teamRoot: '.',
    projectKey: key,
    stateLocation: 'external',
  };
  storage.writeSync(
    configPath,
    JSON.stringify(config, null, 2) + '\n',
  );

  // Ensure config.json is gitignored (it's machine-local)
  ensureGitignored(projectDir, '.squad/config.json');

  console.log(`✅ Externalized ${movedCount} items. State now at: ${externalDir}`);
  console.log(`   .squad/config.json marker left in repo (gitignored).`);
  console.log(`   Run \`squad internalize\` to move state back.`);
}

/**
 * Move externalized state back into the working tree.
 */
export function runInternalize(projectDir: string): void {
  const squadDir = path.join(projectDir, '.squad');
  const configPath = path.join(squadDir, 'config.json');

  if (!storage.existsSync(configPath)) {
    fatal('.squad/config.json not found. State is already local or not initialized.');
  }

  let config: { stateLocation?: string; projectKey?: string };
  try {
    config = JSON.parse(storage.readSync(configPath) ?? '{}');
  } catch {
    fatal('.squad/config.json is malformed.');
    return;
  }

  if (config.stateLocation !== 'external') {
    fatal('State is already local (stateLocation is not "external").');
  }

  const key = config.projectKey || deriveProjectKey(projectDir);
  const externalDir = resolveExternalStateDir(key, false);

  if (!storage.existsSync(externalDir)) {
    fatal(`External state directory not found: ${externalDir}`);
  }

  console.log(`📥 Internalizing state from: ${externalDir}`);

  let movedCount = 0;

  // Copy directories back
  for (const dir of STATE_DIRS) {
    const src = path.join(externalDir, dir);
    if (!storage.existsSync(src)) continue;
    const dest = path.join(squadDir, dir);
    copyDirRecursive(src, dest);
    movedCount++;
  }

  // Copy files back
  for (const file of STATE_FILES) {
    const src = path.join(externalDir, file);
    if (!storage.existsSync(src)) continue;
    const content = storage.readSync(src);
    if (content != null) {
      storage.writeSync(path.join(squadDir, file), content);
    }
    movedCount++;
  }

  // Remove the config.json marker to restore true local mode.
  // loadDirConfig() returns null when config.json is absent → resolveSquadPaths()
  // falls through to local mode (projectDir === teamDir).
  storage.deleteSync?.(configPath);

  console.log(`✅ Internalized ${movedCount} items. State is back in .squad/.`);
}

function copyDirRecursive(src: string, dest: string): void {
  storage.mkdirSync(dest, { recursive: true });
  const entries = storage.listSync?.(src) ?? [];
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (storage.isDirectorySync(srcPath)) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const content = storage.readSync(srcPath);
      if (content != null) {
        storage.writeSync(destPath, content);
      }
    }
  }
}

function ensureGitignored(projectDir: string, entry: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  let existing = '';
  if (storage.existsSync(gitignorePath)) {
    existing = storage.readSync(gitignorePath) ?? '';
  }
  if (!existing.includes(entry)) {
    const block = (existing && !existing.endsWith('\n') ? '\n' : '')
      + '# Squad: local config (machine-specific, never commit)\n'
      + entry + '\n';
    storage.appendSync(gitignorePath, block);
  }
}
