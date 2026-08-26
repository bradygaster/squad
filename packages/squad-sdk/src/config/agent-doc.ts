/**
 * Agent Documentation Parser (M2-12)
 *
 * Extracts structured metadata from .agent.md files so the markdown
 * becomes a reference document while typed config remains the runtime
 * source of truth.
 *
 * @module config/agent-doc
 */

import { normalizeEol } from '../utils/normalize-eol.js';

/**
 * Structured metadata extracted from an agent .md file.
 */
export interface AgentDocMetadata {
  /** Agent name from the IDENTITY section or top-level heading */
  name?: string;

  /** One-line description / role */
  description?: string;

  /** Expertise areas declared in the IDENTITY section (`**Expertise:** a, b`) */
  expertise: string[];

  /** Capability strings listed under CAPABILITIES */
  capabilities: string[];

  /** Routing hints (work-type patterns this agent handles) */
  routingHints: string[];

  /** Model preferences (e.g. "claude-sonnet-4.5") */
  modelPreferences: string[];

  /** Constraints / boundaries the agent must follow */
  constraints: string[];

  /** Tool names the agent is allowed to use */
  tools: string[];

  /** Extra sections not in the standard set, keyed by heading */
  extraSections: Record<string, string>;
}

/** Standard section names we recognise (case-insensitive). */
const STANDARD_SECTIONS = new Set([
  'identity',
  'capabilities',
  'routing',
  'constraints',
  'tools',
]);

/**
 * Parse an agent .agent.md file into structured metadata.
 *
 * Recognised top-level (##) sections:
 *   IDENTITY, CAPABILITIES, ROUTING, CONSTRAINTS, TOOLS
 *
 * Any other ## sections are captured in `extraSections`.
 *
 * @param markdown - Raw markdown content of the agent doc
 * @returns Parsed metadata
 */
export function parseAgentDoc(markdown: string): AgentDocMetadata {
  markdown = normalizeEol(markdown);
  const result: AgentDocMetadata = {
    expertise: [],
    capabilities: [],
    routingHints: [],
    modelPreferences: [],
    constraints: [],
    tools: [],
    extraSections: {},
  };

  if (!markdown || markdown.trim().length === 0) {
    return result;
  }

  // Try to extract the agent name from the first H1 heading
  const h1Match = markdown.match(/^#\s+(.+)/m);
  if (h1Match) {
    result.name = h1Match[1]!.trim();
  }

  // Split into sections by ## headings
  const sections = splitSections(markdown);

  for (const [heading, body] of sections) {
    const key = heading.toLowerCase().trim();

    if (key === 'identity') {
      parseIdentitySection(body, result);
    } else if (key === 'capabilities') {
      result.capabilities = parseBulletList(body);
    } else if (key === 'routing') {
      result.routingHints = parseBulletList(body);
      // Also check for model preferences inside routing
      parseModelHints(body, result);
    } else if (key === 'constraints') {
      result.constraints = parseBulletList(body);
    } else if (key === 'tools') {
      result.tools = parseBulletList(body);
    } else {
      // Non-standard section – capture verbatim
      result.extraSections[heading.trim()] = body.trim();
    }
  }

  // Also scan the full document for model preferences if none found yet
  if (result.modelPreferences.length === 0) {
    parseModelHints(markdown, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Splits markdown into (heading, body) pairs for each ## section.
 */
function splitSections(markdown: string): [string, string][] {
  const results: [string, string][] = [];
  const regex = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const indices: { heading: string; start: number; end: number }[] = [];

  while ((match = regex.exec(markdown)) !== null) {
    indices.push({
      heading: match[1]!,
      start: match.index + match[0].length,
      end: markdown.length, // will be narrowed below
    });
  }

  for (let i = 0; i < indices.length; i++) {
    if (i + 1 < indices.length) {
      // Body runs until the next ## heading line starts
      const nextHeadingPos = markdown.lastIndexOf(
        '\n',
        markdown.indexOf(`## ${indices[i + 1]!.heading}`, indices[i]!.start),
      );
      indices[i]!.end = nextHeadingPos >= 0 ? nextHeadingPos : indices[i + 1]!.start;
    }
    results.push([indices[i]!.heading, markdown.slice(indices[i]!.start, indices[i]!.end)]);
  }

  return results;
}

/**
 * Extracts bullet-list items (lines starting with - or *) from a block.
 */
function parseBulletList(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.+)/);
    if (m) {
      items.push(m[1]!.trim());
    }
  }
  return items;
}

/**
 * Parses the IDENTITY section for name, description, and model prefs.
 */
function parseIdentitySection(body: string, result: AgentDocMetadata): void {
  // **Name:** value  or  Name: value
  // Identity Name always takes precedence over H1 heading
  const nameMatch = body.match(/\*?\*?Name:?\*?\*?\s*(.+)/i);
  if (nameMatch) {
    result.name = nameMatch[1]!.trim();
  }

  // **Description:** or **Role:**
  const descMatch =
    body.match(/\*?\*?Description:?\*?\*?\s*(.+)/i) ??
    body.match(/\*?\*?Role:?\*?\*?\s*(.+)/i);
  if (descMatch) {
    result.description = descMatch[1]!.trim();
  }

  // **Expertise:** a, b, c
  const expertiseMatch = body.match(/\*?\*?Expertise:?\*?\*?\s*(.+)/i);
  if (expertiseMatch) {
    result.expertise = expertiseMatch[1]!
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  // Model preference inside identity
  parseModelHints(body, result);
}

/**
 * Scans text for model-preference patterns and appends unique values.
 */
function parseModelHints(text: string, result: AgentDocMetadata): void {
  // Explicit **Model:** or **Preferred Model:** lines
  const modelLine =
    text.match(/\*?\*?(?:Preferred\s+)?Model:?\*?\*?\s*(.+)/i);
  if (modelLine) {
    const models = modelLine[1]!
      .split(/[,;]/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    for (const m of models) {
      if (!result.modelPreferences.includes(m)) {
        result.modelPreferences.push(m);
      }
    }
  }
}
