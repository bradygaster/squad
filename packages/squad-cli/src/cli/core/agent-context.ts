/**
 * AW Coordinator Team Context — generates the <!-- SQUAD_TEAM_CONTEXT_BEGIN/END -->
 * section injected into squad.agent.md after cast/recast/retire operations.
 *
 * Design:
 *  - Derives specialist roles, task types, and routing hints from team.md and routing.md
 *  - Sanitizes all untrusted text so metadata cannot inject headings, code fences,
 *    hidden instructions, or structural Markdown
 *  - Deterministic: identical input produces identical output (sorted by name)
 *  - No hardcoded default-cast names; works for any team composition
 *  - Authority boundaries are grounded in the coordinator's own refusal rules
 *    (not aspirational permissions) — derived from static coordinator contract
 *
 * @module cli/core/agent-context
 */

import { join } from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

// ── Constants ──────────────────────────────────────────────────────────────

export const TEAM_CONTEXT_BEGIN = '<!-- SQUAD_TEAM_CONTEXT_BEGIN -->';
export const TEAM_CONTEXT_END = '<!-- SQUAD_TEAM_CONTEXT_END -->';

/** Default placeholder installed with the template — replaced on first cast. */
export const TEAM_CONTEXT_DEFAULT =
  '> No team configured yet. Run `squad cast` to populate this section with your\n' +
  '> team\'s specialists, routing hints, and capability boundaries.\n';

// ── Sanitization ───────────────────────────────────────────────────────────

/**
 * Sanitize a single text field for safe embedding in a Markdown table cell or
 * inline text. Removes or escapes Markdown heading markers, code fences, HTML
 * comment delimiters, and pipe characters that would break table alignment.
 *
 * Contract:
 *  - Output is a single line (no embedded newlines)
 *  - Maximum 200 characters after sanitization
 *  - Does NOT alter alphanumeric text, emoji, or normal punctuation
 */
export function sanitizeField(raw: string): string {
  return raw
    // Flatten to single line first (prevents multi-line injection)
    .replace(/\r?\n/g, ' ')
    // Strip Markdown heading markers (## Heading injection)
    .replace(/^#{1,6}\s+/gm, '')
    // Replace code-fence delimiters (``` and ~~~) to prevent code block injection
    .replace(/`{3,}/g, '`')
    .replace(/~{3,}/g, '~')
    // Strip HTML comment syntax to prevent hidden instruction injection
    .replace(/<!--/g, '\u2039!--')
    .replace(/-->/g, '--\u203a')
    // Replace pipe characters (break table structure) with a safe lookalike
    .replace(/\|/g, '\u2223')
    // Collapse repeated whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Truncate to prevent excessively long cells
    .slice(0, 200);
}

/**
 * Sanitize a free-text block (multi-line allowed, but structural injection is
 * still prevented). Used for longer fields like the capability summary.
 */
export function sanitizeBlock(raw: string): string {
  return raw
    // Strip heading markers at start of lines
    .replace(/^#{1,6}\s+/gm, '')
    // Replace code-fence delimiters
    .replace(/`{3,}/g, '`')
    .replace(/~{3,}/g, '~')
    // Strip HTML comment syntax
    .replace(/<!--/g, '\u2039!--')
    .replace(/-->/g, '--\u203a')
    .trim()
    .slice(0, 2000);
}

// ── Team member types ──────────────────────────────────────────────────────

export interface ActiveMember {
  /** Cast name, e.g. "EECOM" */
  name: string;
  /** Role label, e.g. "Core Dev" */
  role: string;
  /** Status string from team.md, e.g. "✅ Active" */
  status: string;
}

export interface RoutingRow {
  workType: string;
  agent: string;
  examples?: string;
}

// ── Parsers ────────────────────────────────────────────────────────────────

/**
 * Extract active members from a team.md `## Members` table.
 *
 * Parses lines of the form:
 *   | Name | Role | Charter | Status |
 *
 * Rules:
 *  - Only rows with status that includes "Active", "Silent", "Monitor", "RAI",
 *    or any emoji status are included (skips headers and separators)
 *  - Coordinator row ("Squad | Coordinator") is excluded
 *  - Rows are returned in the order they appear (deterministic)
 */
export function parseTeamMdMembers(content: string): ActiveMember[] {
  const members: ActiveMember[] = [];

  const membersSection = content.split(/^##\s+Members\b/m)[1];
  if (!membersSection) return members;

  // Stop at the next ## heading
  const section = membersSection.split(/^##\s+/m)[0] ?? membersSection;

  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    // Skip header and separator rows
    const firstCell = cells[0] ?? '';
    if (/^[-\s]+$/.test(firstCell)) continue;
    if (/^name$/i.test(firstCell)) continue;

    // Skip coordinator row
    if (/^squad$/i.test(firstCell) && /coordinator/i.test(cells[1] ?? '')) continue;

    const name = sanitizeField(firstCell);
    const role = sanitizeField(cells[1] ?? '');
    const status = sanitizeField(cells[3] ?? cells[2] ?? '✅ Active');

    if (name && role) {
      members.push({ name, role, status });
    }
  }

  return members;
}

/**
 * Extract routing rows from a routing.md `## Work Type → Agent` table.
 *
 * Parses lines of the form:
 *   | Work Type | Agent | Examples |
 *
 * The "Agent" cell often contains an emoji + name, e.g. "EECOM 🔧".
 */
export function parseRoutingMd(content: string): RoutingRow[] {
  const rows: RoutingRow[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const firstCell = cells[0] ?? '';
    if (/^[-\s]+$/.test(firstCell)) continue;
    if (/^work\s*type$/i.test(firstCell)) continue;
    if (/^module$/i.test(firstCell)) continue;
    if (/^signal$/i.test(firstCell)) continue;

    const workType = sanitizeField(firstCell);
    const agent = sanitizeField(cells[1] ?? '');
    const examples = cells[2] ? sanitizeField(cells[2]) : undefined;

    if (workType && agent) {
      rows.push({ workType, agent, examples });
    }
  }

  return rows;
}

// ── Context block generator ────────────────────────────────────────────────

/**
 * Build routing hints table for AW coordinators from routing rows.
 * Deduplicates by agent (keeps first occurrence of each agent name).
 * Returns an empty string when no routing data is available.
 */
function buildRoutingHintsTable(rows: RoutingRow[]): string {
  if (rows.length === 0) return '';

  const lines: string[] = [
    '**Routing hints for outer coordinators:**',
    '',
    '| Task Type | Preferred Agent |',
    '|-----------|----------------|',
  ];

  // Limit to 15 routing hints to keep the section concise
  const shown = rows.slice(0, 15);
  for (const row of shown) {
    lines.push(`| ${row.workType} | ${row.agent} |`);
  }

  return lines.join('\n');
}

/**
 * Build the specialist table from active members.
 */
function buildSpecialistTable(members: ActiveMember[]): string {
  if (members.length === 0) return '';

  const lines: string[] = [
    `**${members.length} active specialist${members.length === 1 ? '' : 's'}:**`,
    '',
    '| Agent | Role | Status |',
    '|-------|------|--------|',
  ];

  for (const m of members) {
    lines.push(`| ${m.name} | ${m.role} | ${m.status} |`);
  }

  return lines.join('\n');
}

/**
 * Build the capability boundaries paragraph.
 * These boundaries are grounded in the coordinator's refusal rules
 * (static contract) — not derived from team composition.
 */
function buildCapabilityBoundaries(members: ActiveMember[]): string {
  // Derive high-level capability labels from member roles
  const roleLabels: string[] = [];
  for (const m of members) {
    const r = m.role.toLowerCase();
    if (/lead|architect/.test(r)) roleLabels.push('architecture planning');
    if (/test|qa|quality/.test(r)) roleLabels.push('test authoring');
    if (/security|auth/.test(r)) roleLabels.push('security audit');
    if (/docs|devrel|writer|handbook/.test(r)) roleLabels.push('documentation');
    if (/devops|infra|platform|ci|booster/.test(r)) roleLabels.push('CI/CD configuration');
    if (/sdk|capcom/.test(r)) roleLabels.push('SDK integration');
    if (/typescript|control/.test(r)) roleLabels.push('TypeScript engineering');
    if (/runtime|core|eecom/.test(r)) roleLabels.push('runtime implementation');
    if (/observ|telemetry|aspire/.test(r)) roleLabels.push('observability');
    if (/release|surgeon/.test(r)) roleLabels.push('release management');
    if (/distribution|network/.test(r)) roleLabels.push('package distribution');
    if (/ux|design|inco|tui|dsky|vox/.test(r)) roleLabels.push('UI/UX implementation');
    if (/review|flight/.test(r)) roleLabels.push('code review');
  }

  // Always include core capabilities (apply to any Squad team)
  const baseCaps = ['PR review', 'code review', 'documentation'];
  const allCaps = Array.from(new Set([...baseCaps, ...roleLabels])).sort().join(', ');

  const lines: string[] = [
    '**Capability boundaries:**',
    '',
    `- ✅ **Can:** ${allCaps}.`,
    '- ❌ **Cannot:** Deploy to production, push directly to the default branch, bypass reviewer',
    '  gates, access external systems without MCP tools, provision infrastructure, or make',
    '  decisions without user confirmation on architecture changes.',
  ];

  return lines.join('\n');
}

/**
 * Generate the full AW team context block — the content that goes between
 * SQUAD_TEAM_CONTEXT_BEGIN and SQUAD_TEAM_CONTEXT_END markers.
 *
 * @param members - Active team members parsed from team.md
 * @param routingRows - Routing table rows parsed from routing.md (optional)
 * @param timestamp - ISO timestamp for the auto-generated comment
 */
export function generateAWTeamContextBlock(
  members: ActiveMember[],
  routingRows: RoutingRow[] = [],
  timestamp: string = new Date().toISOString(),
): string {
  if (members.length === 0) {
    return TEAM_CONTEXT_DEFAULT;
  }

  const parts: string[] = [
    `<!-- Auto-generated by \`squad cast\` — last updated: ${timestamp}. Do not edit manually. -->`,
    '',
  ];

  const specialistTable = buildSpecialistTable(members);
  if (specialistTable) {
    parts.push(specialistTable);
    parts.push('');
  }

  const routingTable = buildRoutingHintsTable(routingRows);
  if (routingTable) {
    parts.push(routingTable);
    parts.push('');
  }

  const capBoundaries = buildCapabilityBoundaries(members);
  if (capBoundaries) {
    parts.push(capBoundaries);
    parts.push('');
  }

  return parts.join('\n');
}

// ── Injection ──────────────────────────────────────────────────────────────

/**
 * Replace the content between SQUAD_TEAM_CONTEXT_BEGIN and SQUAD_TEAM_CONTEXT_END
 * markers with the given block.
 *
 * If the markers are absent (legacy install without markers) the content is
 * returned unchanged — callers must ensure the template has markers before
 * calling inject.
 *
 * Preserves everything outside the markers (coordinator instructions,
 * version stamp, user customizations outside the block).
 */
export function injectTeamContext(agentMd: string, block: string): string {
  const beginIdx = agentMd.indexOf(TEAM_CONTEXT_BEGIN);
  const endIdx = agentMd.indexOf(TEAM_CONTEXT_END);

  if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
    // Markers not found — return unchanged (no silent data loss)
    return agentMd;
  }

  const before = agentMd.slice(0, beginIdx + TEAM_CONTEXT_BEGIN.length);
  const after = agentMd.slice(endIdx);

  // Ensure block starts and ends with a newline for clean formatting
  const normalizedBlock = '\n' + block.replace(/\n+$/, '') + '\n';

  return before + normalizedBlock + after;
}

// ── High-level API ─────────────────────────────────────────────────────────

/**
 * Read team.md and routing.md from squadDir, generate the AW team context
 * block, and inject it into the given squad.agent.md content.
 *
 * Returns the updated content. Does not write to disk — callers are
 * responsible for writing.
 *
 * @param squadDir - Path to the `.squad/` directory
 * @param agentMd - Current content of squad.agent.md
 */
export function buildAndInjectTeamContext(squadDir: string, agentMd: string): string {
  const teamMdPath = join(squadDir, 'team.md');
  const routingMdPath = join(squadDir, 'routing.md');

  let members: ActiveMember[] = [];
  let routingRows: RoutingRow[] = [];

  try {
    if (storage.existsSync(teamMdPath)) {
      const teamContent = storage.readSync(teamMdPath) ?? '';
      members = parseTeamMdMembers(teamContent);
    }
  } catch {
    // If team.md is unreadable, leave members empty (produces default block)
  }

  try {
    if (storage.existsSync(routingMdPath)) {
      const routingContent = storage.readSync(routingMdPath) ?? '';
      routingRows = parseRoutingMd(routingContent);
    }
  } catch {
    // Routing is optional; proceed without it
  }

  const block = generateAWTeamContextBlock(members, routingRows);
  return injectTeamContext(agentMd, block);
}

/**
 * Read, update, and write the team context section of an existing
 * squad.agent.md file.
 *
 * If the file does not exist or the markers are absent, this is a no-op
 * (no file is created or corrupted).
 *
 * @param squadDir - Path to the `.squad/` directory
 * @param agentMdPath - Full path to the squad.agent.md file to update
 */
export function refreshTeamContextInAgentFile(
  squadDir: string,
  agentMdPath: string,
): void {
  if (!storage.existsSync(agentMdPath)) return;

  const current = storage.readSync(agentMdPath) ?? '';
  if (!current.includes(TEAM_CONTEXT_BEGIN)) return;

  const updated = buildAndInjectTeamContext(squadDir, current);
  if (updated !== current) {
    storage.writeSync(agentMdPath, updated);
  }
}
