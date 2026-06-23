/**
 * Charter Markdown I/O — parse and serialize charter.md files.
 *
 * Wraps the existing `parseCharterMarkdown()` from charter-compiler.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/charter-io
 */

import { parseCharterMarkdown, type ParsedCharter } from '../../agents/charter-compiler.js';

export type { ParsedCharter };

/**
 * Parse charter markdown into a typed structure.
 * Delegates to the existing `parseCharterMarkdown()`.
 */
export function parseCharter(markdown: string): ParsedCharter {
  return parseCharterMarkdown(markdown);
}

/**
 * Serialize a ParsedCharter back to markdown.
 *
 * Produces the canonical charter.md format:
 * ```
 * # {Name} — {Role}
 * > {style quote}
 * ## Identity
 * ...
 * ```
 */
export function serializeCharter(charter: ParsedCharter): string {
  const lines: string[] = [];

  // Title line
  const name = charter.identity.name ?? 'Agent';
  const role = charter.identity.role ?? 'Developer';
  lines.push(`# ${name} — ${role}`);
  lines.push('');

  // Style quote
  if (charter.identity.style) {
    lines.push(`> ${charter.identity.style}`);
    lines.push('');
  }

  // Identity section
  lines.push('## Identity');
  lines.push('');
  if (charter.identity.name) {
    lines.push(`- **Name:** ${charter.identity.name}`);
  }
  if (charter.identity.role) {
    lines.push(`- **Role:** ${charter.identity.role}`);
  }
  if (charter.identity.expertise && charter.identity.expertise.length > 0) {
    lines.push(`- **Expertise:** ${charter.identity.expertise.join(', ')}`);
  }
  if (charter.identity.style) {
    lines.push(`- **Style:** ${charter.identity.style}`);
  }
  lines.push('');

  // What I Own section
  if (charter.ownership !== undefined) {
    lines.push('## What I Own');
    lines.push('');
    lines.push(charter.ownership);
    lines.push('');
  }

  // Boundaries section
  if (charter.boundaries !== undefined) {
    lines.push('## Boundaries');
    lines.push('');
    lines.push(charter.boundaries);
    lines.push('');
  }

  // Model section
  if (charter.modelPreference || charter.modelRationale || charter.modelFallback) {
    lines.push('## Model');
    lines.push('');
    if (charter.modelPreference) {
      lines.push(`**Preferred:** ${charter.modelPreference}`);
    }
    if (charter.modelRationale) {
      lines.push(`**Rationale:** ${charter.modelRationale}`);
    }
    if (charter.modelFallback) {
      lines.push(`**Fallback:** ${charter.modelFallback}`);
    }
    lines.push('');
  }

  // Collaboration section
  if (charter.collaboration !== undefined) {
    lines.push('## Collaboration');
    lines.push('');
    lines.push(charter.collaboration);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
