/**
 * AW Coordinator Team Context — generates the <!-- SQUAD_TEAM_CONTEXT_BEGIN/END -->
 * section injected into squad.agent.md after cast/recast/retire operations.
 *
 * Design:
 *  - Derives specialist roles, task types, and routing hints from team.md and routing.md
 *  - Sanitizes all untrusted text, including Markdown link destinations, Unicode bidi
 *    control characters, and dangerous structural characters, to prevent injection attacks
 *  - Deterministic: specialist table is sorted alphabetically by name; routing table
 *    preserves routing.md source order (which has intentional priority ordering)
 *  - No hardcoded default-cast names; works for any team composition
 *  - Authority boundaries are grounded in the coordinator's own refusal rules
 *    (not aspirational permissions) — derived from static coordinator contract
 *  - refreshTeamContextInAgentFile has no-op semantics: only writes when semantic
 *    team content changes (timestamp-independent comparison)
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
 * inline text.
 *
 * Contract:
 *  - Strips Markdown link destinations ([label](url) → label, [label][ref] → label)
 *  - Strips Unicode bidi control (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) and
 *    other dangerous invisible structural characters
 *  - Removes Markdown heading markers, code fences, HTML comment delimiters,
 *    and pipe characters that would break table alignment
 *  - Output is a single line (no embedded newlines)
 *  - Maximum 200 characters after sanitization
 *  - Does NOT alter alphanumeric text, emoji, or normal punctuation
 */
export function sanitizeField(raw: string): string {
  return raw
    // Flatten to single line first (prevents multi-line injection)
    .replace(/\r?\n/g, ' ')
    // Strip Unicode bidi control characters and dangerous invisible structural controls
    // (U+200E, U+200F LTR/RTL marks; U+202A–U+202E embedding/override; U+2066–U+2069 isolates)
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0085\u2028\u2029]/g, '')
    // Strip Markdown link destinations: [label](url) → label, [label][ref] → label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
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
    // Strip Unicode bidi control characters and dangerous invisible structural controls
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0085\u2028\u2029]/g, '')
    // Strip Markdown link destinations: [label](url) → label, [label][ref] → label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
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

/**
 * Sanitize a timestamp string for safe embedding inside an HTML comment.
 * Truncates at the first occurrence of --> (comment-close) to prevent comment
 * breakout; strips <!-- to prevent nested comment injection.
 */
function sanitizeTimestamp(ts: string): string {
  // Truncate at first --> to prevent HTML comment breakout —
  // any text after --> would escape the comment into rendered output
  const closeIdx = ts.indexOf('-->');
  const safe = closeIdx >= 0 ? ts.slice(0, closeIdx) : ts;
  return safe
    .replace(/<!--/g, '')
    .replace(/\r?\n/g, ' ')
    .trim()
    .slice(0, 50);
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
 * Normalized status values that explicitly signal a member is no longer active.
 * Matched case-insensitively as whole words so "reactivated" is not excluded.
 *
 * Strategy: blacklist-based filtering. Only the patterns below are excluded;
 * all other status values — including custom, unknown, or empty — are retained
 * so that non-standard teams are not silently dropped from context generation.
 */
const INACTIVE_STATUS_RE = /\b(?:retired|disabled|inactive|alumni)\b/i;

/**
 * Returns `true` when a status value should be treated as active (member
 * appears in the generated AW team context block).
 *
 * Unknown or custom statuses are intentionally retained — the contract is
 * "exclude known-inactive" not "include only known-active", which prevents
 * silently dropping valid members from custom teams.
 */
function isActiveStatus(status: string): boolean {
  return !INACTIVE_STATUS_RE.test(status);
}

/**
 * Extract active members from a team.md `## Members` table.
 *
 * Parses lines of the form:
 *   | Name | Role | Charter | Status |
 *
 * Rules:
 *  - Rows whose status explicitly signals retirement, deactivation, or alumni
 *    status (case-insensitive: "retired", "disabled", "inactive", "alumni") are
 *    excluded; all other statuses — including the built-in active forms
 *    ("Active", "Silent", "Monitor", "RAI", "Coding Agent") and any custom or
 *    unknown status — are retained so non-standard teams are not silently dropped
 *  - Coordinator row ("Squad | Coordinator") is excluded
 *  - Rows are returned in the order they appear (source-stable);
 *    generateAWTeamContextBlock applies alphabetical sort for deterministic output
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

    if (name && role && isActiveStatus(status)) {
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
 * Rows are returned in source order — routing.md has intentional priority ordering.
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
 * Preserves source order (routing.md has intentional priority ordering) and
 * shows all distinct task types — no deduplication by agent, which would lose
 * authoritative routing granularity. Capped at 15 rows for prompt budget.
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
    lines.push(`| ${sanitizeField(row.workType)} | ${sanitizeField(row.agent)} |`);
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
    lines.push(`| ${sanitizeField(m.name)} | ${sanitizeField(m.role)} | ${sanitizeField(m.status)} |`);
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
    if (/devops|infra|platform|ci/.test(r)) roleLabels.push('CI/CD configuration');
    if (/sdk/.test(r)) roleLabels.push('SDK integration');
    if (/typescript/.test(r)) roleLabels.push('TypeScript engineering');
    if (/runtime|core/.test(r)) roleLabels.push('runtime implementation');
    if (/observ|telemetry|aspire/.test(r)) roleLabels.push('observability');
    if (/release/.test(r)) roleLabels.push('release management');
    if (/distribution|network/.test(r)) roleLabels.push('package distribution');
    if (/ux|design|inco|tui|dsky|vox/.test(r)) roleLabels.push('UI/UX implementation');
    if (/review/.test(r)) roleLabels.push('code review');
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
 * @param timestamp - ISO timestamp for the auto-generated comment; sanitized
 *   to prevent HTML comment breakout
 */
export function generateAWTeamContextBlock(
  members: ActiveMember[],
  routingRows: RoutingRow[] = [],
  timestamp: string = new Date().toISOString(),
): string {
  if (members.length === 0) {
    return TEAM_CONTEXT_DEFAULT;
  }

  // Sort alphabetically by name for deterministic output regardless of team.md order.
  // Uses plain string comparison (not localeCompare) so ordering is locale-independent
  // and identical on every machine regardless of system locale settings.
  const sortedMembers = [...members].sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  const parts: string[] = [
    `<!-- Auto-generated by \`squad cast\` — last updated: ${sanitizeTimestamp(timestamp)}. Do not edit manually. -->`,
    '',
  ];

  const specialistTable = buildSpecialistTable(sortedMembers);
  if (specialistTable) {
    parts.push(specialistTable);
    parts.push('');
  }

  const routingTable = buildRoutingHintsTable(routingRows);
  if (routingTable) {
    parts.push(routingTable);
    parts.push('');
  }

  const capBoundaries = buildCapabilityBoundaries(sortedMembers);
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
 * @param timestamp - Optional timestamp to embed; defaults to current time.
 *   Pass an existing timestamp to produce a stable output for comparison.
 */
export function buildAndInjectTeamContext(
  squadDir: string,
  agentMd: string,
  timestamp?: string,
): string {
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

  const block = generateAWTeamContextBlock(members, routingRows, timestamp);
  return injectTeamContext(agentMd, block);
}

// ── Refresh helpers ────────────────────────────────────────────────────────

/**
 * Extract the "last updated" timestamp string from an existing team context
 * block embedded in squad.agent.md.
 *
 * Returns `undefined` if the timestamp comment is absent (e.g. new file or
 * legacy template without the comment).
 */
export function extractBlockTimestamp(content: string): string | undefined {
  // Non-greedy (.+?) so the match extends past any dots in fractional seconds
  // (e.g. "...T10:19:28.963Z") and stops only at the first ". Do not edit manually" suffix.
  // The previous [^.]+ would stop at the first dot, causing the match to fail entirely
  // for any ISO timestamp that includes milliseconds, making extractBlockTimestamp return
  // undefined and breaking _computeTeamContextRefresh no-op semantics.
  const m = content.match(
    /<!-- Auto-generated by `squad cast` — last updated: (.+?)\. Do not edit manually\. -->/,
  );
  return m?.[1];
}

/**
 * Compute whether squad.agent.md needs to be rewritten and what the new
 * content should be. Exported for direct unit testing without filesystem I/O.
 *
 * Logic:
 *  1. If markers are absent → no-op (nothing to refresh)
 *  2. Generate a candidate using the EXISTING timestamp (if any) so the
 *     comparison is timestamp-independent (semantic content only)
 *  3. If candidate === current → no-op (team and routing are unchanged)
 *  4. Otherwise → rebuild with a fresh timestamp and signal shouldWrite
 *
 * @param squadDir - `.squad/` directory used to load team.md / routing.md
 * @param currentContent - Existing squad.agent.md content
 * @param existingTimestamp - Timestamp extracted from the current block, or undefined
 * @param nowTimestamp - Current time to use when a semantic change is detected
 */
export function _computeTeamContextRefresh(
  squadDir: string,
  currentContent: string,
  existingTimestamp: string | undefined,
  nowTimestamp: string,
): { shouldWrite: boolean; content: string } {
  if (!currentContent.includes(TEAM_CONTEXT_BEGIN)) {
    return { shouldWrite: false, content: currentContent };
  }

  // Use the existing timestamp for comparison so a time-only delta doesn't trigger a write
  const tsForComparison = existingTimestamp ?? nowTimestamp;
  const candidate = buildAndInjectTeamContext(squadDir, currentContent, tsForComparison);

  if (candidate === currentContent) {
    // Semantic content unchanged — preserve existing file (no write)
    return { shouldWrite: false, content: currentContent };
  }

  // Team or routing changed — rebuild with fresh timestamp
  const updated = buildAndInjectTeamContext(squadDir, currentContent, nowTimestamp);
  return { shouldWrite: true, content: updated };
}

/**
 * Read, update, and write the team context section of an existing
 * squad.agent.md file.
 *
 * No-op semantics:
 *  - Returns without writing when the file does not exist
 *  - Returns without writing when the markers are absent (legacy install)
 *  - Returns without writing when the semantic team content is unchanged
 *    (timestamp is excluded from the comparison so the file is not dirtied
 *    on every call)
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
  const existingTs = extractBlockTimestamp(current);
  const now = new Date().toISOString();

  const { shouldWrite, content } = _computeTeamContextRefresh(
    squadDir,
    current,
    existingTs,
    now,
  );

  if (shouldWrite) {
    storage.writeSync(agentMdPath, content);
  }
}
