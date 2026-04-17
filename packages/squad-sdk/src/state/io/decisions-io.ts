/**
 * Decisions Markdown I/O — parse and serialize decisions.md files.
 *
 * Wraps the existing `parseDecisionsMarkdown()` from markdown-migration.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/decisions-io
 */

import { parseDecisionsMarkdown, type ParsedDecision } from '../../config/markdown-migration.js';

export type { ParsedDecision };

/**
 * Parse decisions markdown into typed decision entries.
 * Delegates to the existing `parseDecisionsMarkdown()`.
 */
export function parseDecisions(markdown: string): ParsedDecision[] {
  const { decisions } = parseDecisionsMarkdown(markdown);
  return decisions;
}

/**
 * Serialize a single decision entry to markdown.
 *
 * Format:
 * ```
 * ### YYYY-MM-DD: Title
 * **By:** author
 * body content
 * ```
 */
export function serializeDecision(decision: ParsedDecision): string {
  const level = decision.headingLevel ?? 3;
  const hashes = '#'.repeat(level);

  // Heading with optional date prefix
  const datePrefix = decision.date ? `${decision.date}: ` : '';
  const lines: string[] = [`${hashes} ${datePrefix}${decision.title}`];

  // Body — author line is already embedded in body from the parser,
  // but if body doesn't contain **By:** and author is set, prepend it
  const bodyHasAuthor = /\*\*By:\*\*/i.test(decision.body);
  if (decision.author && !bodyHasAuthor) {
    lines.push(`**By:** ${decision.author}`);
  }
  if (decision.body) {
    lines.push(decision.body);
  }

  return lines.join('\n');
}

/**
 * Serialize an array of decisions to a full decisions.md file.
 *
 * Produces:
 * ```
 * # Decisions
 *
 * ### 2026-01-15: First Decision
 * ...
 *
 * ### 2026-02-01: Second Decision
 * ...
 * ```
 */
export function serializeDecisions(decisions: ParsedDecision[]): string {
  if (decisions.length === 0) {
    return '# Decisions\n';
  }
  const sections = decisions.map((d) => serializeDecision(d));
  return `# Decisions\n\n${sections.join('\n\n')}\n`;
}
