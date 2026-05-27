/**
 * Watch mode for coordinator export.
 * Re-exports when .squad/ source files change.
 * Watches the .squad/ directory (not individual files) so that file
 * creations, renames, and deletions are also detected.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface WatchExportOptions {
  root: string;
  squadRoot: string;
  onRebuild: () => Promise<void>;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Relevant file patterns within .squad/ that should trigger a rebuild.
 */
const RELEVANT_EXTENSIONS = new Set(['.md', '.json']);

function isRelevantFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return RELEVANT_EXTENSIONS.has(ext);
}

/**
 * Watch a directory non-recursively (cross-platform safe).
 * Returns a watcher or null if the directory doesn't exist.
 */
function watchDir(
  dirPath: string,
  onChange: (filename: string | null) => void,
): fs.FSWatcher | null {
  try {
    if (!fs.existsSync(dirPath)) return null;
    return fs.watch(dirPath, { persistent: true }, (_event, filename) => {
      onChange(filename as string | null);
    });
  } catch {
    return null;
  }
}

/**
 * Watch a directory and its immediate subdirectories (one level deep).
 * Handles platforms where `{ recursive: true }` is unsupported.
 */
function watchDirRecursive(
  dirPath: string,
  onChange: (filename: string | null) => void,
): fs.FSWatcher[] {
  const watchers: fs.FSWatcher[] = [];

  // Watch the directory itself
  const rootWatcher = watchDir(dirPath, onChange);
  if (rootWatcher) watchers.push(rootWatcher);

  // Watch immediate subdirectories
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subWatcher = watchDir(path.join(dirPath, entry.name), onChange);
        if (subWatcher) watchers.push(subWatcher);
      }
    }
  } catch {
    // Directory may not be readable
  }

  return watchers;
}

/**
 * Start watching .squad/ source files for changes.
 * Watches directories instead of individual files, so new file creations
 * and renames are detected. Uses non-recursive watching with manual
 * subdirectory enumeration for cross-platform compatibility.
 * Returns a cleanup function to stop watching.
 */
export function startWatchExport(options: WatchExportOptions): () => void {
  const { root, squadRoot, onRebuild, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: fs.FSWatcher[] = [];

  const scheduleRebuild = (filename: string | null) => {
    // Filter out irrelevant file changes
    if (filename && !isRelevantFile(filename)) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await onRebuild();
      } catch (err) {
        console.error(`Watch rebuild failed: ${(err as Error).message}`);
      }
    }, debounceMs);
  };

  // Watch the .squad/ directory and subdirectories (agents/*)
  const squadWatchers = watchDirRecursive(squadRoot, scheduleRebuild);
  watchers.push(...squadWatchers);

  // Watch the agents subdirectories (one more level deep for charter files)
  const agentsDir = path.join(squadRoot, 'agents');
  try {
    if (fs.existsSync(agentsDir)) {
      const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true });
      for (const entry of agentDirs) {
        if (entry.isDirectory()) {
          const subAgentDir = path.join(agentsDir, entry.name);
          const watcher = watchDir(subAgentDir, scheduleRebuild);
          if (watcher) watchers.push(watcher);
        }
      }
    }
  } catch {
    // Agents dir structure may not exist
  }

  // Watch skills directory
  const skillsDir = path.join(root, '.copilot', 'skills');
  const skillWatchers = watchDirRecursive(skillsDir, scheduleRebuild);
  watchers.push(...skillWatchers);

  // Return cleanup function
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
