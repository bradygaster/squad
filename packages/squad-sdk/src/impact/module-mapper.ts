/**
 * Map file paths to modules and owners.
 * Reads routing.md for directory→agent mappings, package.json for workspace boundaries.
 * Falls back to directory heuristics when routing.md is unavailable.
 */

import type { DiffFile } from './diff-parser.js';

export interface ModuleMapping {
  module: string;
  primary: string;
  secondary: string;
  package: string;
}

export interface RoutingEntry {
  directory: string;
  primary: string;
  secondary: string;
}

/**
 * Parse the Module Ownership table from routing.md content.
 * Expected format:
 * | Module | Primary | Secondary |
 * |--------|---------|-----------|
 * | `src/adapter/` | EECOM 🔧 | CAPCOM 🕵️ |
 */
export function parseRoutingTable(routingContent: string): RoutingEntry[] {
  const entries: RoutingEntry[] = [];
  const lines = routingContent.split('\n');

  let inModuleTable = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect the Module Ownership heading
    if (trimmed.startsWith('## Module Ownership') || trimmed.startsWith('## Module ownership')) {
      inModuleTable = true;
      headerPassed = false;
      continue;
    }

    // Stop at next heading
    if (inModuleTable && trimmed.startsWith('## ') && !trimmed.toLowerCase().includes('module ownership')) {
      break;
    }

    if (!inModuleTable) continue;

    // Skip the header row and separator
    if (trimmed.startsWith('| Module') || trimmed.startsWith('| module')) {
      headerPassed = false;
      continue;
    }
    if (trimmed.startsWith('|---') || trimmed.startsWith('| ---')) {
      headerPassed = true;
      continue;
    }

    if (!headerPassed) continue;
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed
      .split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length < 2) continue;

    // Strip backticks and trailing slashes from directory
    const directory = (cells[0] ?? '')
      .replace(/`/g, '')
      .replace(/\/$/, '')
      .trim();

    // Strip emoji from agent names
    const primary = stripEmoji(cells[1] ?? '').trim();
    const secondary = stripEmoji(cells[2] ?? '—').trim();

    if (directory) {
      entries.push({ directory, primary, secondary: secondary === '—' ? '' : secondary });
    }
  }

  return entries;
}

function stripEmoji(text: string): string {
  // Remove common emoji characters and variation selectors
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').trim();
}

/**
 * Extract workspace package names from root package.json workspaces field.
 */
export function parseWorkspaces(packageJsonContent: string): string[] {
  try {
    const pkg = JSON.parse(packageJsonContent) as { workspaces?: string[] };
    return pkg.workspaces ?? [];
  } catch {
    return [];
  }
}

/**
 * Determine which package a file belongs to based on workspace patterns.
 */
function resolvePackage(filePath: string, workspaces: string[]): string {
  for (const ws of workspaces) {
    // Handle glob patterns like "packages/*"
    const prefix = ws.replace(/\*$/, '');
    if (filePath.startsWith(prefix)) {
      const rest = filePath.slice(prefix.length);
      const pkgName = rest.split('/')[0];
      if (pkgName) return `${prefix}${pkgName}`;
    }
  }
  return 'root';
}

/**
 * Map a file path to its module using routing entries.
 * Falls back to top-level directory heuristic.
 */
function resolveModule(filePath: string, routingEntries: RoutingEntry[]): { module: string; primary: string; secondary: string } {
  // Try routing entries — longest match wins
  let bestMatch: RoutingEntry | null = null;
  let bestLength = 0;

  for (const entry of routingEntries) {
    if (filePath.includes(entry.directory) && entry.directory.length > bestLength) {
      bestMatch = entry;
      bestLength = entry.directory.length;
    }
  }

  if (bestMatch) {
    return { module: bestMatch.directory, primary: bestMatch.primary, secondary: bestMatch.secondary };
  }

  // Fallback: use top-level directory as module name
  const parts = filePath.split('/');
  const topDir = parts.length > 1 ? parts[0]! : 'root';
  return { module: topDir, primary: 'unknown', secondary: '' };
}

/**
 * Map all diff files to their module assignments.
 */
export function mapModules(
  files: DiffFile[],
  routingEntries: RoutingEntry[],
  workspaces: string[],
): ModuleMapping[] {
  return files.map(file => {
    const { module, primary, secondary } = resolveModule(file.path, routingEntries);
    const pkg = resolvePackage(file.path, workspaces);
    return { module, primary, secondary, package: pkg };
  });
}
