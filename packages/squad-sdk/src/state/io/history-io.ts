/**
 * History Markdown I/O — parse and serialize history.md files.
 *
 * Wraps the existing section-parsing logic from history-shadow.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/history-io
 */

import type { ParsedHistory, HistorySection } from '../../agents/history-shadow.js';
import { normalizeEol } from '../../utils/normalize-eol.js';

export type { ParsedHistory, HistorySection };

/** Standard sections in order of appearance. */
const SECTION_ORDER: Array<{ header: HistorySection; key: keyof ParsedHistory }> = [
  { header: 'Context', key: 'context' },
  { header: 'Learnings', key: 'learnings' },
  { header: 'Decisions', key: 'decisions' },
  { header: 'Patterns', key: 'patterns' },
  { header: 'Issues', key: 'issues' },
  { header: 'References', key: 'references' },
];

/**
 * Parse history markdown into typed sections.
 *
 * Mirrors the section-extraction logic in `readHistory()` from
 * history-shadow.ts but operates purely on a string (no filesystem).
 *
 * Note: the original regex uses `\Z` which is not a valid JS anchor.
 * We use an explicit section-split approach to correctly handle the
 * last section in the file.
 */
export function parseHistory(markdown: string): ParsedHistory {
  const content = normalizeEol(markdown);
  const parsed: ParsedHistory = { fullContent: content } as ParsedHistory;

  if (!content || content.trim().length === 0) {
    return parsed;
  }

  // Build a map of h2 section name → content by splitting at ## headers.
  // Uses header start positions as boundaries (avoids the broken \Z anchor
  // in the original readHistory regex).
  const headerRegex = /^##\s+(.+?)\s*$/gm;
  const headers: Array<{ name: string; start: number; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(content)) !== null) {
    headers.push({ name: m[1]!, start: m.index, contentStart: m.index + m[0].length });
  }

  const sectionMap = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    const hdr = headers[i]!;
    const nextHdr = headers[i + 1];
    const start = hdr.contentStart;
    const end = nextHdr ? nextHdr.start : content.length;
    const sectionContent = content.substring(start, end).trim();
    if (sectionContent.length > 0) {
      sectionMap.set(hdr.name, sectionContent);
    }
  }

  for (const { header, key } of SECTION_ORDER) {
    const value = sectionMap.get(header);
    if (value !== undefined) {
      (parsed as unknown as Record<string, unknown>)[key] = value;
    }
  }

  return parsed;
}

/**
 * Serialize a ParsedHistory back to markdown.
 *
 * Reconstructs the history.md with `# AgentName` header and `## Section` blocks.
 */
export function serializeHistory(history: ParsedHistory): string {
  // If fullContent has a title line, extract it; otherwise use a generic header
  const titleMatch = history.fullContent.match(/^#\s+(.+)$/m);
  const lines: string[] = [];

  if (titleMatch) {
    lines.push(titleMatch[0]);
    lines.push('');
  }

  for (const { header, key } of SECTION_ORDER) {
    const value = history[key] as string | undefined;
    if (value !== undefined && value.length > 0) {
      lines.push(`## ${header}`);
      lines.push('');
      lines.push(value);
      lines.push('');
    }
  }

  if (lines.length === 0) {
    return '';
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Produce a string fragment for appending a new entry to a history section.
 *
 * @param section - Target section name (e.g., 'Learnings')
 * @param entry - Content to append (without date header)
 * @param date - Optional ISO date string (defaults to today)
 * @returns Formatted entry string including `### YYYY-MM-DD` sub-header
 */
export function serializeHistoryAppend(
  section: HistorySection,
  entry: string,
  date?: string,
): string {
  const dateStr = date ?? new Date().toISOString().split('T')[0];
  return `### ${dateStr}\n\n${entry}\n`;
}
