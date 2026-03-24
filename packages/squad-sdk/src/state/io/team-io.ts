/**
 * Team Markdown I/O — parse and serialize team.md files.
 *
 * Wraps the existing `parseTeamMarkdown()` from markdown-migration.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/team-io
 */

import { parseTeamMarkdown, type ParsedAgent } from '../../config/markdown-migration.js';
import { normalizeEol } from '../../utils/normalize-eol.js';

export type { ParsedAgent };

/**
 * Optional metadata for the team.md file header.
 */
export interface TeamMetadata {
  /** Team name displayed in the title */
  teamName?: string;
  /** Tagline shown below the title */
  tagline?: string;
}

/** Result of parsing a team.md file. */
export interface ParsedTeam {
  agents: ParsedAgent[];
  projectContext: string;
}

/**
 * Extract project context: everything between the `# Title` line and
 * the `## Members` (or first `##`) section, excluding the title and
 * any blockquote tagline on the line immediately after the title.
 */
function extractProjectContext(markdown: string): string {
  const lines = normalizeEol(markdown).split('\n');
  const contextLines: string[] = [];
  let pastTitle = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the title line
    if (!pastTitle) {
      if (/^#\s+/.test(trimmed)) {
        pastTitle = true;
      }
      continue;
    }

    // Stop at ## Members or any ## heading that signals the table section
    if (/^##\s+members/i.test(trimmed)) {
      break;
    }

    contextLines.push(line);
  }

  return contextLines.join('\n').trim();
}

/**
 * Parse team markdown into typed agent entries and project context.
 * Delegates agent parsing to `parseTeamMarkdown()` and also extracts
 * the project context section above the members table.
 */
export function parseTeam(markdown: string): ParsedTeam {
  const { agents } = parseTeamMarkdown(markdown);
  const projectContext = extractProjectContext(markdown);
  return { agents, projectContext };
}

/**
 * Serialize agents to a full team.md file.
 *
 * Produces the canonical table format:
 * ```
 * # Team Name
 *
 * ## Members
 *
 * | Name | Role | Charter | Status |
 * |------|------|---------|--------|
 * | Agent | Developer | `.squad/agents/agent/charter.md` | ✅ Active |
 * ```
 */
export function serializeTeam(agents: ParsedAgent[], metadata?: TeamMetadata): string {
  const teamName = metadata?.teamName ?? 'Team';
  const lines: string[] = [`# ${teamName}`];

  if (metadata?.tagline) {
    lines.push('');
    lines.push(`> ${metadata.tagline}`);
  }

  lines.push('');
  lines.push('## Members');
  lines.push('');
  lines.push('| Name | Role | Charter | Status |');
  lines.push('|------|------|---------|--------|');

  for (const agent of agents) {
    const name = agent.name;
    const role = agent.role;
    const charter = `.squad/agents/${agent.name}/charter.md`;
    const status = agent.status ?? '✅ Active';
    lines.push(`| ${name} | ${role} | \`${charter}\` | ${status} |`);
  }

  lines.push('');
  return lines.join('\n');
}
