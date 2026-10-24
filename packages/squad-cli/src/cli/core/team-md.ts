/**
 * team.md parser and editor utilities — zero dependencies
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

/**
 * Read team.md content from squad directory
 */
export function readTeamMd(squadDir: string): string {
  const teamMdPath = path.join(squadDir, 'team.md');
  if (!storage.existsSync(teamMdPath)) {
    throw new Error('team.md not found — run init first');
  }
  const content = storage.readSync(teamMdPath);
  if (content === undefined) {
    throw new Error('team.md not found — run init first');
  }
  return content;
}

/**
 * Write team.md content to squad directory
 */
export function writeTeamMd(squadDir: string, content: string): void {
  const teamMdPath = path.join(squadDir, 'team.md');
  storage.writeSync(teamMdPath, content);
}

/**
 * Check if @copilot section exists in team.md
 */
export function hasCopilot(content: string): boolean {
  return content.includes('🤖 Coding Agent');
}

/**
 * Insert @copilot section before Project Context
 */
export function insertCopilotSection(content: string, autoAssign: boolean = false): string {
  const autoAssignValue = autoAssign ? 'true' : 'false';
  const copilotSection = `
## Coding Agent

<!-- copilot-auto-assign: ${autoAssignValue} -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

`;

  // Insert before "## Project Context" if it exists, otherwise append
  if (content.includes('## Project Context')) {
    return content.replace('## Project Context', copilotSection + '## Project Context');
  } else {
    return content.trimEnd() + '\n' + copilotSection;
  }
}

/**
 * Remove @copilot section from team.md
 */
export function removeCopilotSection(content: string): string {
  return content.replace(/\n## Coding Agent\n[\s\S]*?(?=\n## |\n*$)/, '');
}

/**
 * Set auto-assign flag in team.md
 */
export function setAutoAssign(content: string, enabled: boolean): string {
  const targetValue = enabled ? 'true' : 'false';
  const oppositeValue = enabled ? 'false' : 'true';
  return content.replace(
    `<!-- copilot-auto-assign: ${oppositeValue} -->`,
    `<!-- copilot-auto-assign: ${targetValue} -->`
  );
}

/* ── Built-in roster rows ─────────────────────────────────────────── */

export interface BuiltinRosterRow {
  name: string;
  role: string;
  /** Directory under .squad/agents/ (canonical lowercase id). */
  dirName: string;
  status: string;
}

/** The always-on built-ins the coordinator contract says "always appear in team.md". */
export const BUILTIN_ROSTER_ROWS: readonly BuiltinRosterRow[] = [
  { name: 'Scribe', role: 'Session Logger', dirName: 'scribe', status: '📋 Silent' },
  { name: 'Ralph', role: 'Work Monitor', dirName: 'ralph', status: '🔄 Monitor' },
  { name: 'Rai', role: 'RAI Reviewer', dirName: 'rai', status: '🛡️ RAI' },
  { name: 'Fact Checker', role: "Devil's Advocate & Verification Agent", dirName: 'fact-checker', status: '🔍 Verifier' },
];

function cellText(cell: string): string {
  return cell.replace(/[`*_]/g, '').trim().toLowerCase();
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(c => c.trim());
}

/** True when any table row in `content` already names this built-in or links its charter. */
export function rosterHasBuiltin(content: string, row: BuiltinRosterRow): boolean {
  const charterRef = `agents/${row.dirName}/charter.md`;
  const wanted = row.name.toLowerCase();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (line.includes(charterRef)) return true;
    const cells = splitRow(line);
    if (cells.length > 0 && cellText(cells[0]!) === wanted) return true;
  }
  return false;
}

/**
 * Built-ins whose agent directory exists under `agentsDir` but have no row in team.md.
 * Directory presence is checked case-insensitively so a not-yet-migrated `Rai/` still counts.
 */
export function missingBuiltinRosterRows(content: string, agentsDir: string): BuiltinRosterRow[] {
  if (!storage.existsSync(agentsDir)) return [];
  const present = new Set(storage.listSync(agentsDir).map(e => e.toLowerCase()));
  return BUILTIN_ROSTER_ROWS.filter(row => present.has(row.dirName) && !rosterHasBuiltin(content, row));
}

function renderRow(headerCells: string[], row: BuiltinRosterRow): string {
  const cells = headerCells.map(h => {
    const key = cellText(h);
    if (key === 'name') return row.name;
    if (key === 'role') return row.role;
    if (key === 'charter') return `\`.squad/agents/${row.dirName}/charter.md\``;
    if (key === 'status') return row.status;
    return '—';
  });
  return `| ${cells.join(' | ')} |`;
}

/**
 * Insert `rows` into team.md content. Target table: `## Built-in Support Agents` when present,
 * else `## Members`. A team.md without either table is returned unchanged — the roster is the
 * user's file and upgrade only completes an existing table, never invents one.
 * Preserves the file's EOL and every existing line; the rows go after the last existing row of
 * the target table so hand-ordered rosters keep their order.
 */
export function insertBuiltinRosterRows(content: string, rows: readonly BuiltinRosterRow[]): string {
  if (rows.length === 0) return content;
  const eol = /\r\n/.test(content) ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);

  const findTable = (heading: RegExp): { headerCells: string[]; insertAt: number } | null => {
    const headingIdx = lines.findIndex(l => heading.test(l.trim()));
    if (headingIdx === -1) return null;
    let i = headingIdx + 1;
    while (i < lines.length && !lines[i]!.trim().startsWith('|') && !/^##\s/.test(lines[i]!.trim())) i++;
    if (i >= lines.length || !lines[i]!.trim().startsWith('|')) return null;
    const headerCells = splitRow(lines[i]!);
    let last = i;
    while (last + 1 < lines.length && lines[last + 1]!.trim().startsWith('|')) last++;
    return { headerCells, insertAt: last + 1 };
  };

  const table = findTable(/^##\s+built-in support agents\s*$/i) ?? findTable(/^##\s+members\s*$/i);
  if (!table) return content;
  const rendered = rows.map(r => renderRow(table.headerCells, r));
  lines.splice(table.insertAt, 0, ...rendered);
  return lines.join(eol);
}

/**
 * Make sure every built-in whose agent directory exists has a roster row in team.md.
 * Idempotent: a built-in already named anywhere in a table is left alone; a team.md without a
 * roster table is left untouched (health reports the drift instead). Returns the display names
 * that were (or, with `dryRun`, would be) added.
 */
export function ensureBuiltinRosterRows(squadDir: string, options: { dryRun?: boolean } = {}): string[] {
  const teamMdPath = path.join(squadDir, 'team.md');
  if (!storage.existsSync(teamMdPath)) return [];
  const content = storage.readSync(teamMdPath);
  if (content === undefined || content.trim().length === 0) return [];
  const missing = missingBuiltinRosterRows(content, path.join(squadDir, 'agents'));
  if (missing.length === 0) return [];
  const next = insertBuiltinRosterRows(content, missing);
  if (next === content) return [];
  if (!options.dryRun) {
    storage.writeSync(teamMdPath, next);
  }
  return missing.map(r => r.name);
}
