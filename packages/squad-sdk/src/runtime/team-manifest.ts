/**
 * Team manifest parsing — pure functions for reading team.md metadata.
 *
 * Extracts agent roster, role emoji mapping, and welcome screen data
 * from the .squad/ directory structure.
 *
 * @module runtime/team-manifest
 */

import path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

/** Debug logger — writes to stderr only when SQUAD_DEBUG=1. */
function debugLog(...args: unknown[]): void {
  if (process.env['SQUAD_DEBUG'] === '1') {
    console.error('[SQUAD_DEBUG]', ...args);
  }
}

export interface DiscoveredAgent {
  name: string;
  role: string;
  charter: string | undefined;
  status: string;
}

/**
 * Parse the Members table from team.md and extract agent metadata.
 *
 * Expected markdown table format:
 * ```
 * | Name | Role | Charter | Status |
 * |------|------|---------|--------|
 * | Keaton | Lead | `.squad/agents/keaton/charter.md` | ✅ Active |
 * ```
 */
export function parseTeamManifest(content: string): DiscoveredAgent[] {
  const agents: DiscoveredAgent[] = [];
  const lines = content.split('\n');

  let inMembersTable = false;
  let headerParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect the "Members" section header
    if (/^#+\s*Members/i.test(trimmed)) {
      inMembersTable = true;
      headerParsed = false;
      continue;
    }

    // Stop at the next section header
    if (inMembersTable && /^#+\s/.test(trimmed) && !/^#+\s*Members/i.test(trimmed)) {
      inMembersTable = false;
      continue;
    }

    if (!inMembersTable) continue;

    // Skip non-table lines
    if (!trimmed.startsWith('|')) continue;

    // Skip the header row (contains "Name") and separator row (contains "---")
    if (trimmed.includes('---') || /\|\s*Name\s*\|/i.test(trimmed)) {
      headerParsed = true;
      continue;
    }

    if (!headerParsed) continue;

    const cells = trimmed
      .split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length < 4) continue;

    const name = cells[0]!;
    const role = cells[1]!;
    const charter = cells[2]?.startsWith('`') ? cells[2].replace(/`/g, '') : undefined;

    // Extract status text from emoji-prefixed status (e.g. "✅ Active" → "Active")
    const rawStatus = cells[3]!;
    const status = rawStatus.replace(/^[^\w]*/, '').trim();

    agents.push({ name, role, charter, status });
  }

  return agents;
}

/** Role → emoji mapping for rich terminal display. */
export function getRoleEmoji(role: string): string {
  const normalized = role.toLowerCase();
  const exactMap: Record<string, string> = {
    'lead': '🏗️',
    'prompt engineer': '💬',
    'core dev': '🔧',
    'tester': '🧪',
    'devrel': '📢',
    'sdk expert': '📦',
    'typescript engineer': '⌨️',
    'git & release': '🏷️',
    'node.js runtime': '⚡',
    'distribution': '📤',
    'security': '🔒',
    'graphic designer': '🎨',
    'vs code extension': '🧩',
    'session logger': '📋',
    'work monitor': '🔄',
    'coordinator': '🎯',
    'coding agent': '🤖',
  };
  if (exactMap[normalized]) return exactMap[normalized]!;
  // Keyword-based fallbacks for custom roles
  if (normalized.includes('lead') || normalized.includes('architect')) return '🏗️';
  if (normalized.includes('frontend') || normalized.includes('ui')) return '⚛️';
  if (normalized.includes('backend') || normalized.includes('api') || normalized.includes('server')) return '🔧';
  if (normalized.includes('test') || normalized.includes('qa') || normalized.includes('quality')) return '🧪';
  if (normalized.includes('game') || normalized.includes('logic')) return '🎮';
  if (normalized.includes('devops') || normalized.includes('infra') || normalized.includes('platform')) return '⚙️';
  if (normalized.includes('security') || normalized.includes('auth')) return '🔒';
  if (normalized.includes('doc') || normalized.includes('writer') || normalized.includes('devrel')) return '📝';
  if (normalized.includes('data') || normalized.includes('database') || normalized.includes('analytics')) return '📊';
  if (normalized.includes('design') || normalized.includes('visual') || normalized.includes('graphic')) return '🎨';
  if (normalized.includes('dev') || normalized.includes('engineer')) return '🔧';
  return '🔹';
}

export interface WelcomeData {
  projectName: string;
  description: string;
  agents: Array<{ name: string; role: string; emoji: string }>;
  focus: string | null;
  /** True on the very first launch after `squad init`. */
  isFirstRun: boolean;
}

/**
 * Load welcome screen data from .squad/ directory.
 *
 * Uses FSStorageProvider (sync) so all reads are routed through the
 * StorageProvider abstraction. Kept synchronous to preserve the React
 * useState initializer contract in App.tsx (Phase 3 migration).
 */
export function loadWelcomeData(teamRoot: string): WelcomeData | null {
  try {
    const storage = new FSStorageProvider();
    const teamPath = path.join(teamRoot, '.squad', 'team.md');
    const content = storage.readSync(teamPath);
    if (content === undefined) return null;

    const titleMatch = content.match(/^#\s+Squad Team\s+—\s+(.+)$/m);
    const projectName = titleMatch?.[1] ?? 'Squad';
    const descMatch = content.match(/^>\s+(.+)$/m);
    const description = descMatch?.[1] ?? '';

    const agents = parseTeamManifest(content)
      .filter(a => a.status === 'Active')
      .map(a => ({ name: a.name, role: a.role, emoji: getRoleEmoji(a.role) }));

    let focus: string | null = null;
    const nowPath = path.join(teamRoot, '.squad', 'identity', 'now.md');
    const nowContent = storage.readSync(nowPath);
    if (nowContent !== undefined) {
      const focusMatch = nowContent.match(/focus_area:\s*(.+)/);
      focus = focusMatch?.[1]?.trim() ?? null;
    }

    // Detect and consume first-run marker from `squad init`
    const firstRunPath = path.join(teamRoot, '.squad', '.first-run');
    let isFirstRun = false;
    if (storage.existsSync(firstRunPath)) {
      isFirstRun = true;
      try { storage.deleteSync(firstRunPath); } catch { /* non-fatal */ }
    }

    return { projectName, description, agents, focus, isFirstRun };
  } catch (err) {
    debugLog('loadWelcomeData failed:', err);
    return null;
  }
}
