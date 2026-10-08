/**
 * Charter Markdown I/O — parse and serialize charter.md files.
 *
 * Wraps the existing `parseCharterMarkdown()` from charter-compiler.ts
 * and adds serialization for round-trip support.
 *
 * @module state/io/charter-io
 */

import {
  charterSemanticKey,
  parseCharterMarkdown,
  type ParsedCharter,
} from '../../agents/charter-compiler.js';

export type { ParsedCharter };

export interface CharterSerializeOptions {
  /**
   * Canonical output is the default. `legacy` explicitly emits legacy
   * responsibility headings. `preserve` returns the original source verbatim
   * when source metadata is available.
   */
  format?: 'canonical' | 'legacy' | 'preserve';
}

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
export function serializeCharter(
  charter: ParsedCharter,
  options: CharterSerializeOptions = {},
): string {
  const format = options.format ?? 'canonical';
  if (format === 'preserve' && charter.fullContent) {
    return charter.fullContent;
  }

  if (
    format === 'canonical'
    && charter.source?.canonicalShape
    && charter.source.semanticKey === charterSemanticKey(charter)
  ) {
    return charter.fullContent;
  }

  const lines: string[] = [];
  const eol = charter.source?.eol ?? '\n';

  // Title line
  const name = charter.identity.name ?? 'Agent';
  const role = charter.identity.role ?? 'Developer';
  lines.push(`# ${name} — ${role}`);
  lines.push('');

  // Compatibility-only style prose is emitted only in explicit legacy mode.
  if (format === 'legacy' && charter.identity.style) {
    lines.push(`> ${charter.identity.style}`);
    lines.push('');
  }

  // Identity section
  lines.push('## Identity');
  lines.push('');
  if (charter.identity.id) {
    lines.push(`- **ID:** \`${charter.identity.id}\``);
  }
  if (charter.identity.purpose) {
    lines.push(`- **Purpose:** ${charter.identity.purpose}`);
  }
  if (!charter.identity.id && charter.identity.name) {
    lines.push(`- **Name:** ${charter.identity.name}`);
  }
  if (!charter.identity.purpose && charter.identity.role) {
    lines.push(`- **Role:** ${charter.identity.role}`);
  }
  if (
    charter.identity.expertise
    && charter.identity.expertise.length > 0
  ) {
    lines.push(`- **Expertise:** ${charter.identity.expertise.join(', ')}`);
  }
  if (charter.identity.style) {
    lines.push(`- **Style:** ${charter.identity.style}`);
  }
  lines.push('');

  const headings = format === 'legacy'
    ? {
        ownership: 'What I Own',
        boundaries: 'Boundaries',
        collaboration: 'Collaboration',
      }
    : {
        ownership: 'Accountable Responsibilities',
        boundaries: 'Non-Responsibilities',
        collaboration: 'Collaboration and Review Authority',
      };

  // Accountable responsibilities
  if (charter.ownership !== undefined) {
    lines.push(`## ${headings.ownership}`);
    lines.push('');
    lines.push(charter.ownership);
    lines.push('');
  }

  // Non-responsibilities
  if (charter.boundaries !== undefined) {
    lines.push(`## ${headings.boundaries}`);
    lines.push('');
    lines.push(charter.boundaries);
    lines.push('');
  }

  // Collaboration section
  if (charter.collaboration !== undefined) {
    lines.push(`## ${headings.collaboration}`);
    lines.push('');
    lines.push(charter.collaboration);
    lines.push('');
  }

  // Model section
  if (
    charter.modelPreference
    || charter.modelRationale
    || charter.modelFallback
    || charter.reasoningEffort
    || charter.authoredReasoningEffort
    || charter.contextTier
    || charter.authoredContextTier
  ) {
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
    const effort = charter.reasoningEffort ?? charter.authoredReasoningEffort;
    if (effort) {
      lines.push(`**Reasoning Effort:** ${effort}`);
    }
    const tier = charter.contextTier ?? charter.authoredContextTier;
    if (tier) {
      lines.push(`**Context Tier:** ${tier}`);
    }
    lines.push('');
  }

  const canonical = lines.join(eol).trimEnd() + eol;
  const extensions = charter.source?.extensions.join('') ?? '';
  return extensions
    ? `${canonical.trimEnd()}${eol}${eol}${extensions}`
    : canonical;
}
