/**
 * Routing Markdown I/O — parse and serialize routing.md files.
 *
 * Wraps the existing `parseRoutingRulesMarkdown()` from markdown-migration.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/routing-io
 */

import { parseRoutingRulesMarkdown, type ParsedRoutingRule } from '../../config/markdown-migration.js';
import { normalizeEol } from '../../utils/normalize-eol.js';

export type { ParsedRoutingRule };

/** Result of parsing a routing.md file. */
export interface ParsedRouting {
  rules: ParsedRoutingRule[];
  moduleOwnership: Map<string, string>;
}

/**
 * Parse a `## Module Ownership` table into a Map<module, owner>.
 *
 * Expected format:
 * ```markdown
 * ## Module Ownership
 *
 * | Module | Owner |
 * |--------|-------|
 * | src/storage/ | EECOM |
 * ```
 */
function parseModuleOwnership(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = normalizeEol(markdown).split('\n');
  let inSection = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^##\s+module\s+ownership/i.test(trimmed)) {
      inSection = true;
      headerPassed = false;
      continue;
    }

    // Another ## heading ends the section
    if (inSection && /^##\s+/.test(trimmed) && !/module\s+ownership/i.test(trimmed)) {
      break;
    }

    if (!inSection || !trimmed.startsWith('|')) continue;

    // Detect header row (contains "module" or "owner")
    if (!headerPassed && /module|owner/i.test(trimmed)) {
      headerPassed = true;
      continue;
    }

    // Skip separator row
    if (/^[|:\-\s]+$/.test(trimmed)) continue;

    if (!headerPassed) continue;

    const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2 && cells[0] && cells[1]) {
      map.set(cells[0], cells[1]);
    }
  }

  return map;
}

/**
 * Parse routing markdown into typed routing rules and module ownership.
 * Delegates rule parsing to `parseRoutingRulesMarkdown()` and also
 * extracts the optional `## Module Ownership` section.
 */
export function parseRouting(markdown: string): ParsedRouting {
  const { rules } = parseRoutingRulesMarkdown(markdown);
  const moduleOwnership = parseModuleOwnership(markdown);
  return { rules, moduleOwnership };
}

/**
 * Serialize routing rules to a full routing.md file.
 *
 * Produces:
 * ```
 * # Routing Rules
 *
 * ## Routing Table
 *
 * | Work Type | Agent | Examples |
 * |-----------|-------|----------|
 * | feature-dev | Lead | New features |
 * ```
 */
export function serializeRouting(rules: ParsedRoutingRule[]): string {
  const lines: string[] = [
    '# Routing Rules',
    '',
    '## Routing Table',
    '',
    '| Work Type | Agent | Examples |',
    '|-----------|-------|----------|',
  ];

  for (const rule of rules) {
    const agents = rule.agents.join(', ');
    const examples = rule.examples ? rule.examples.join(', ') : '';
    lines.push(`| ${rule.workType} | ${agents} | ${examples} |`);
  }

  lines.push('');
  return lines.join('\n');
}
