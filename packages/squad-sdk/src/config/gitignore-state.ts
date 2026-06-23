/**
 * Helpers for managing the squad-state .gitignore marker block.
 *
 * When the state backend is 'two-layer' or 'orphan', .squad/decisions.md
 * and .squad/agents/history.md are owned by the squad-state orphan branch.
 * Adding them to .gitignore prevents accidental staging via git add .,
 * git add -A, IDE "stage all", or git commit -am -- defense-in-depth
 * complement to the pre-commit hook installed by squad upgrade --state-backend.
 *
 * The block is delimited by marker comments so it can be reliably added and
 * removed without touching unrelated .gitignore content.
 */

import type { StorageProvider } from '../storage/index.js';

export const SQUAD_STATE_GITIGNORE_OPEN_MARKER =
  '# Squad: state owned by squad-state branch (two-layer/orphan backend)';
export const SQUAD_STATE_GITIGNORE_CLOSE_MARKER =
  '# /Squad: state owned by squad-state branch';

const SQUAD_STATE_GITIGNORE_BLOCK =
  SQUAD_STATE_GITIGNORE_OPEN_MARKER + '\n' +
  '.squad/decisions.md\n' +
  '.squad/agents/*/history.md\n' +
  SQUAD_STATE_GITIGNORE_CLOSE_MARKER + '\n';

/**
 * Append the squad-state marker block to .gitignore if not already present.
 *
 * Idempotent: if the opening marker already exists in the file, this is a
 * no-op. Returns true if the block was added, false if it was already present.
 */
export function addSquadStateGitignoreBlock(
  gitignorePath: string,
  storage: StorageProvider,
): boolean {
  let content = '';
  if (storage.existsSync(gitignorePath)) {
    content = storage.readSync(gitignorePath) ?? '';
  }

  if (content.includes(SQUAD_STATE_GITIGNORE_OPEN_MARKER)) {
    return false;
  }

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  storage.writeSync(gitignorePath, content + prefix + SQUAD_STATE_GITIGNORE_BLOCK);
  return true;
}

/**
 * Remove the squad-state marker block from .gitignore if present.
 *
 * Finds the opening and closing marker lines and removes all lines between
 * them (inclusive), plus one leading blank line in what follows if present.
 * Returns true if the block was removed, false if it was not present.
 */
export function removeSquadStateGitignoreBlock(
  gitignorePath: string,
  storage: StorageProvider,
): boolean {
  if (!storage.existsSync(gitignorePath)) {
    return false;
  }

  const content = storage.readSync(gitignorePath) ?? '';
  if (!content.includes(SQUAD_STATE_GITIGNORE_OPEN_MARKER)) {
    return false;
  }

  const lines = content.split('\n');
  const openIdx = lines.findIndex((l) => l === SQUAD_STATE_GITIGNORE_OPEN_MARKER);
  if (openIdx === -1) return false;

  // Find the closing marker starting from the opening marker
  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (lines[i] === SQUAD_STATE_GITIGNORE_CLOSE_MARKER) {
      closeIdx = i;
      break;
    }
  }

  // If no closing marker found, remove from opening marker to end
  const endIdx = closeIdx !== -1 ? closeIdx : lines.length - 1;

  const before = lines.slice(0, openIdx);
  const after = lines.slice(endIdx + 1);

  // Rejoin: before-lines + after-lines (including trailing empty string if present,
  // which preserves a trailing newline from the original file content)
  const newContent = [...before, ...after].join('\n');
  storage.writeSync(gitignorePath, newContent);
  return true;
}