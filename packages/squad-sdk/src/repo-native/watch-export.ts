/**
 * Watch mode for coordinator export.
 * Re-exports when .squad/ source files change.
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

const WATCH_PATTERNS = [
  'team.md',
  'routing.md',
  'ceremonies.md',
  'config.json',
];

/**
 * Start watching .squad/ source files for changes.
 * Returns a cleanup function to stop watching.
 */
export function startWatchExport(options: WatchExportOptions): () => void {
  const { root, squadRoot, onRebuild, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: fs.FSWatcher[] = [];

  const scheduleRebuild = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await onRebuild();
      } catch (err) {
        console.error(`Watch rebuild failed: ${(err as Error).message}`);
      }
    }, debounceMs);
  };

  // Watch top-level squad files
  for (const file of WATCH_PATTERNS) {
    const filePath = path.join(squadRoot, file);
    try {
      const watcher = fs.watch(filePath, { persistent: true }, () => {
        scheduleRebuild();
      });
      watchers.push(watcher);
    } catch {
      // File may not exist; that's fine
    }
  }

  // Watch agents directory
  const agentsDir = path.join(squadRoot, 'agents');
  try {
    if (fs.existsSync(agentsDir)) {
      const watcher = fs.watch(agentsDir, { recursive: true, persistent: true }, () => {
        scheduleRebuild();
      });
      watchers.push(watcher);
    }
  } catch {
    // Agents dir may not exist
  }

  // Watch skills directory
  const skillsDir = path.join(root, '.copilot', 'skills');
  try {
    if (fs.existsSync(skillsDir)) {
      const watcher = fs.watch(skillsDir, { recursive: true, persistent: true }, () => {
        scheduleRebuild();
      });
      watchers.push(watcher);
    }
  } catch {
    // Skills dir may not exist
  }

  // Return cleanup function
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
