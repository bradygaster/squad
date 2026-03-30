/**
 * squad link <team-repo-path> — link a project to a remote team root.
 *
 * Writes `.squad/config.json` with a relative `teamRoot` path so the
 * dual-root resolver (resolveSquadPaths) can find the team identity dir.
 *
 * Remote squad mode concept by @spboyer (Shayne Boyer), PR bradygaster/squad#131.
 *
 * @module cli/commands/link
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { fatal } from '../core/errors.js';

const storage = new FSStorageProvider();

/**
 * Link the current project to a remote team root.
 *
 * @param projectDir - Project root (cwd or explicit).
 * @param teamRepoPath - Path (relative or absolute) to the team repo.
 */
export function runLink(projectDir: string, teamRepoPath: string): void {
  // Resolve the team repo path to an absolute path
  const absoluteTeam = path.resolve(projectDir, teamRepoPath);

  // Validate the target exists
  if (!storage.existsSync(absoluteTeam)) {
    fatal(`Target path does not exist: ${absoluteTeam}`);
  }

  if (!storage.isDirectorySync(absoluteTeam)) {
    fatal(`Target path is not a directory: ${absoluteTeam}`);
  }

  // Validate the target contains a .squad/ or .ai-team/ directory
  const hasSquad = storage.existsSync(path.join(absoluteTeam, '.squad'));
  const hasAiTeam = storage.existsSync(path.join(absoluteTeam, '.ai-team'));
  if (!hasSquad && !hasAiTeam) {
    fatal(`Target does not contain a .squad/ directory: ${absoluteTeam}`);
  }

  // Ensure .squad/ exists locally
  const squadDir = path.join(projectDir, '.squad');
  storage.mkdirSync(squadDir, { recursive: true });

  // Compute relative path from project root to team repo
  const relativePath = path.relative(projectDir, absoluteTeam);

  const config = {
    version: 1,
    teamRoot: relativePath,
    projectKey: null,
  };

  storage.writeSync(
    path.join(squadDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Ensure .squad/config.json is in .gitignore (machine-local path, never commit)
  const gitignorePath = path.join(projectDir, '.gitignore');
  const ignoreEntry = '.squad/config.json';
  let existingIgnore = '';
  if (storage.existsSync(gitignorePath)) {
    existingIgnore = storage.readSync(gitignorePath) ?? '';
  }
  if (!existingIgnore.includes(ignoreEntry)) {
    const block = (existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '')
      + '# Squad: local config (machine-specific paths, never commit)\n'
      + ignoreEntry + '\n';
    storage.appendSync(gitignorePath, block);
  }

  console.log(`✅ Linked to team root: ${relativePath}`);
}
