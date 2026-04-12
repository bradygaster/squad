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

/** Entries under .squad/ that must NOT be externalized (they stay in the repo).
 *  All of these are read from the working tree by runtime code that does not
 *  go through external-state resolution (detectSquadDir → local .squad/).
 *  - config.json: thin marker read by the walk-up resolver
 *  - manifest.json: public contract read by cross-squad discovery
 *  - workstreams.json: workstream config read by streams resolver
 *  - upstream.json: upstream registry read by cross-squad discover/delegate
 *  - squad-registry.json: squad registry read by cross-squad discovery
 *  - _upstream_repos: git clone cache read locally by upstream/cross-squad resolvers
 */
const KEEP_LOCAL = new Set([
  'config.json',
  'manifest.json',
  'workstreams.json',
  'upstream.json',
  'squad-registry.json',
  '_upstream_repos',
]);

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

  // Dynamically discover everything in .squad/ — move it all except KEEP_LOCAL.
  // This eliminates silent orphaning when new state artifacts are added.
  const entries = storage.listSync?.(squadDir) ?? [];
  for (const entry of entries) {
    if (KEEP_LOCAL.has(entry)) continue;
    const src = path.join(squadDir, entry);
    const dest = path.join(externalDir, entry);
    if (storage.isDirectorySync(src)) {
      copyDirRecursive(src, dest);
      storage.deleteDirSync?.(src);
    } else {
      const content = storage.readSync(src);
      if (content != null) {
        storage.mkdirSync(path.dirname(dest), { recursive: true });
        storage.writeSync(dest, content);
      }
      storage.deleteSync?.(src);
    }
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

  // Dynamically discover everything in the external dir and copy it back.
  const entries = storage.listSync?.(externalDir) ?? [];
  for (const entry of entries) {
    if (KEEP_LOCAL.has(entry)) continue;
    const src = path.join(externalDir, entry);
    const dest = path.join(squadDir, entry);
    if (storage.isDirectorySync(src)) {
      copyDirRecursive(src, dest);
    } else {
      const content = storage.readSync(src);
      if (content != null) {
        storage.writeSync(dest, content);
      }
    }
    movedCount++;
  }

  // Remove external-state fields from config.json (stateLocation, teamRoot,
  // projectKey) to restore true local mode. Preserve any other settings
  // (e.g. consult, stateBackend). If nothing meaningful remains, delete the file
  // so loadDirConfig() returns null and resolveSquadPaths() falls through to
  // local mode.
  let fullConfig: Record<string, unknown> = {};
  try {
    const raw = storage.readSync(configPath);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        fullConfig = parsed as Record<string, unknown>;
      }
    }
  } catch { /* treat malformed as empty */ }

  delete fullConfig.stateLocation;
  delete fullConfig.teamRoot;
  delete fullConfig.projectKey;

  // Check if any meaningful fields remain beyond version
  const { version: _v, ...rest } = fullConfig;
  if (Object.keys(rest).length > 0) {
    storage.writeSync(configPath, JSON.stringify(fullConfig, null, 2) + '\n');
  } else {
    storage.deleteSync?.(configPath);
  }

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
