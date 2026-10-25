/**
 * Markdown-to-Config Migration
 *
 * Converts legacy .ai-team/ markdown files (team.md, routing.md, decisions.md)
 * into a typed SquadConfig object, enabling migration from the markdown-driven
 * workflow to the typed squad.config.ts format.
 *
 * @module config/markdown-migration
 */

import { normalizeEol } from '../utils/normalize-eol.js';

import type {
  SquadConfig,
  RoutingConfig,
  RoutingRule,
  ModelSelectionConfig,
} from '../runtime/config.js';
import { DEFAULT_CONFIG } from '../runtime/config.js';

// ============================================================================
// Parsed Markdown Types
// ============================================================================

/**
 * Agent info extracted from team.md.
 */
export interface ParsedAgent {
  /** Agent name (kebab-case) */
  name: string;
  /** Agent role */
  role: string;
  /** Skills / capabilities */
  skills: string[];
  /** Preferred model (if specified) */
  model?: string;
  /** Status */
  status?: string;
  /** Alternative names / aliases */
  aliases?: string[];
  /** Whether this agent is auto-assigned to matching work */
  autoAssign?: boolean;
}

/**
 * Routing rule extracted from routing.md.
 */
export interface ParsedRoutingRule {
  /** Work type or pattern */
  workType: string;
  /** Target agents */
  agents: string[];
  /** Example descriptions */
  examples?: string[];
}

/**
 * Decision extracted from decisions.md.
 */
export interface ParsedDecision {
  /** Decision title */
  title: string;
  /** Decision body / description */
  body: string;
  /** Whether this decision affects configuration */
  configRelevant: boolean;
  /** ISO 8601 date extracted from heading (e.g. "2026-02-21") */
  date?: string;
  /** Author extracted from **By:** lines */
  author?: string;
  /** Heading depth (2 for ##, 3 for ###) */
  headingLevel?: number;
}

/**
 * Complete result of parsing all markdown files.
 */
export interface MarkdownParseResult {
  /** Agents parsed from team.md */
  agents: ParsedAgent[];
  /** Routing rules parsed from routing.md */
  routingRules: ParsedRoutingRule[];
  /** Decisions parsed from decisions.md */
  decisions: ParsedDecision[];
  /** Warnings about unparseable sections */
  warnings: string[];
}

/**
 * Options for markdown migration.
 */
export interface MarkdownMigrationOptions {
  /** Content of team.md (may be undefined if file missing) */
  teamMd?: string;
  /** Content of routing.md (may be undefined if file missing) */
  routingMd?: string;
  /** Content of decisions.md (may be undefined if file missing) */
  decisionsMd?: string;
  /** Base config to merge into (defaults to DEFAULT_CONFIG) */
  baseConfig?: Partial<SquadConfig>;
}

/**
 * Result of a markdown migration.
 */
export interface MarkdownMigrationResult {
  /** Generated SquadConfig */
  config: SquadConfig;
  /** Parse result with all extracted data */
  parsed: MarkdownParseResult;
  /** Sections that were successfully migrated */
  migratedSections: string[];
  /** Sections that were skipped or missing */
  skippedSections: string[];
}

// ============================================================================
// team.md Parsing
// ============================================================================

/**
 * Parses team.md content into agent configurations.
 *
 * Supports two formats:
 * 1. Table format within a roster section: | Name | Role | Skills | Model |
 * 2. Section format: ## Agent Name \n Role: ... \n Skills: ...
 *
 * @param content - Raw team.md content
 * @returns Array of parsed agents and any warnings
 */
export function parseTeamMarkdown(content: string): { agents: ParsedAgent[]; warnings: string[] } {
  content = normalizeEol(content);
  const agents: ParsedAgent[] = [];
  const warnings: string[] = [];

  if (!content || !content.trim()) {
    return { agents, warnings };
  }

  const lines = content.split('\n');

  // Try table format first
  const tableAgents = parseTeamTable(lines);
  if (tableAgents.length > 0) {
    return { agents: tableAgents, warnings };
  }

  // Fall back to section format
  let currentAgent: Partial<ParsedAgent> | null = null;
  let inRoster = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect roster / team section
    if (/^##\s+(roster|team\s+members?|agents?)/i.test(trimmed)) {
      inRoster = true;
      continue;
    }

    // New section header (not roster-related) — stop
    if (inRoster && /^##\s+/.test(trimmed) && !/roster|team|agent/i.test(trimmed)) {
      if (currentAgent?.name) {
        agents.push(finalizeAgent(currentAgent));
      }
      currentAgent = null;
      inRoster = false;
      continue;
    }

    // Agent header (### Agent Name or **Agent Name**)
    if (inRoster && (/^###\s+/.test(trimmed) || /^\*\*[^*]+\*\*/.test(trimmed))) {
      if (currentAgent?.name) {
        agents.push(finalizeAgent(currentAgent));
      }

      const nameMatch = trimmed.match(/^###\s+(.+)/) || trimmed.match(/^\*\*([^*]+)\*\*/);
      currentAgent = { name: kebabCase(nameMatch?.[1] ?? ''), skills: [] };
      continue;
    }

    // Key-value lines within an agent section
    if (currentAgent) {
      // Match patterns like: - **Role:** Lead, - Role: Lead, * **Skills:** x, y
      const kvMatch = trimmed.match(/^[-*]*\s*\*{0,2}(role|skills?|model|status|preferred\s*model|aliases?|auto[-\s]*assign)\s*:?\s*\*{0,2}\s*:?\s*(.+)/i);
      if (kvMatch) {
        const key = kvMatch[1]!.toLowerCase().replace(/[\s-]+/g, '');
        const value = kvMatch[2]!.replace(/^\*+\s*/, '').trim();

        switch (key) {
          case 'role':
            currentAgent.role = value;
            break;
          case 'skill':
          case 'skills':
            currentAgent.skills = value.split(',').map((s) => s.trim()).filter(Boolean);
            break;
          case 'model':
          case 'preferredmodel':
            currentAgent.model = value;
            break;
          case 'status':
            currentAgent.status = value;
            break;
          case 'alias':
          case 'aliases':
            currentAgent.aliases = value.split(',').map((s) => s.trim()).filter(Boolean);
            break;
          case 'autoassign':
            currentAgent.autoAssign = /^(yes|true|1)$/i.test(value);
            break;
        }
      }
    }
  }

  // Flush last agent
  if (currentAgent?.name) {
    agents.push(finalizeAgent(currentAgent));
  }

  if (agents.length === 0) {
    warnings.push('Could not parse any agents from team.md');
  }

  return { agents, warnings };
}

/**
 * Parses a markdown table for agent rows.
 */
function parseTeamTable(lines: string[]): ParsedAgent[] {
  const agents: ParsedAgent[] = [];
  let headerCols: string[] | null = null;
  let inRosterSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const heading = headingMatch[2]!.trim();
      inRosterSection =
        headingMatch[1] === '##' &&
        /^(?:roster|team\s+roster|members?|team\s+members?|agents?)$/i.test(heading);
      headerCols = null;
      continue;
    }

    if (!trimmed.startsWith('|')) {
      headerCols = null;
      continue;
    }
    if (!inRosterSection) continue;

    const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);

    if (cells.some((c) => /^name$/i.test(c.replace(/[*_`]/g, '').trim()))) {
      headerCols = cells.map((c) => c.toLowerCase());
      continue;
    }

    // Skip separator row
    if (cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (headerCols && cells.length >= 2) {
      const get = (key: string) => {
        const idx = headerCols!.findIndex((h) => h.includes(key));
        return idx >= 0 && idx < cells.length ? cells[idx] : undefined;
      };

      const name = get('name');
      if (!name) continue;

      agents.push({
        name: kebabCase(name),
        role: get('role') ?? 'developer',
        skills: (get('skill') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        model: get('model') || undefined,
        status: get('status') || undefined,
        aliases: get('alias') ? get('alias')!.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        autoAssign: get('auto') !== undefined ? /^(yes|true|1)$/i.test(get('auto') ?? '') : undefined,
      });
    }
  }

  return agents;
}

// ============================================================================
// routing.md Parsing
// ============================================================================

/**
 * Parses routing.md content into routing rules.
 *
 * Canonical table format:
 * | Work Type | Route To | Examples |
 * |-----------|----------|----------|
 * | feature-dev | Lead | New features |
 *
 * Compatible readers also accept historical `Pattern | Owner | Reason`,
 * `Domain | Route to`, `Signal | Agent`, and
 * `Work Type | Primary Agent | Fallback` column semantics. The table may
 * appear under any heading, and recognized columns may appear in any order.
 *
 * @param content - Raw routing.md content
 * @returns Parsed routing rules and warnings
 */
export function parseRoutingRulesMarkdown(
  content: string,
): {
  rules: ParsedRoutingRule[];
  warnings: string[];
  agentReferences?: string[];
  markdownTableCount: number;
  routingTableCount: number;
} {
  content = normalizeEol(content);
  const rules: ParsedRoutingRule[] = [];
  const warnings: string[] = [];
  const agentReferences: string[] = [];
  const locatedRules: Array<{
    rule: ParsedRoutingRule;
    lineIndex: number;
  }> = [];
  const parsedRoutingLines = new Set<number>();
  let markdownTableCount = 0;
  let routingTableCount = 0;

  if (!content || !content.trim()) {
    return {
      rules,
      warnings,
      agentReferences,
      markdownTableCount,
      routingTableCount,
    };
  }

  const lines = content.split('\n');
  // `{Name}` / `{example tasks}` placeholders copied from templates are not agent references.
  const PLACEHOLDER = /^\{[^}]*\}$/;

  for (let index = 0; index < lines.length; index++) {
    const headerLine = lines[index]!.trim();
    const separatorLine = lines[index + 1]?.trim() ?? '';
    if (!headerLine.startsWith('|') || !separatorLine.startsWith('|')) continue;

    const headerCells = parseMarkdownTableCells(headerLine);
    const separatorCells = parseMarkdownTableCells(separatorLine);
    if (
      headerCells.length === 0 ||
      separatorCells.length !== headerCells.length ||
      !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      continue;
    }

    markdownTableCount++;
    const headerColumns = headerCells.map(normalizeRoutingHeader);
    const workTypeIndex = headerColumns.findIndex(isRoutingWorkTypeHeader);
    const agentIndexes = headerColumns
      .map((column, columnIndex) =>
        isRoutingAgentHeader(column) ? columnIndex : -1,
      )
      .filter((columnIndex) => columnIndex >= 0);
    const examplesIndex = headerColumns.findIndex(isRoutingExamplesHeader);
    const isRoutingTable = workTypeIndex >= 0 && agentIndexes.length > 0;
    if (isRoutingTable) {
      routingTableCount++;
      parsedRoutingLines.add(index);
      parsedRoutingLines.add(index + 1);
    }

    let rowIndex = index + 2;
    for (; rowIndex < lines.length; rowIndex++) {
      const rowLine = lines[rowIndex]!.trim();
      if (!rowLine.startsWith('|')) break;

      const cells = parseMarkdownTableCells(rowLine);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (!isRoutingTable) continue;
      parsedRoutingLines.add(rowIndex);

      const workType = cells[workTypeIndex];
      const agents = agentIndexes.flatMap((columnIndex) =>
        (cells[columnIndex] ?? '')
          .split(/\s*(?:,|\+|\band\b)\s*/i)
          .map((agent) => agent.trim())
          .filter(
            (agent) =>
              agent.length > 0 &&
              !/^[—-]+$/.test(agent) &&
              !PLACEHOLDER.test(agent),
          ),
      );
      const parsedExamples =
        examplesIndex >= 0
          ? (cells[examplesIndex] ?? '')
              .split(',')
              .map((example) => example.trim())
              .filter(Boolean)
          : undefined;
      const examples =
        parsedExamples && parsedExamples.length > 0
          ? parsedExamples
          : undefined;

      if (workType && !PLACEHOLDER.test(workType) && agents.length > 0) {
        locatedRules.push({
          rule: { workType, agents, examples },
          lineIndex: rowIndex,
        });
      }
    }

    index = rowIndex - 1;
  }

  const flattened = parseFlattenedLegacyRoutingRules(
    lines,
    parsedRoutingLines,
  );
  routingTableCount += flattened.sectionCount;
  locatedRules.push(...flattened.rules);

  locatedRules.sort((left, right) => left.lineIndex - right.lineIndex);
  for (const { rule } of locatedRules) {
    rules.push(rule);
    agentReferences.push(...rule.agents);
  }

  if (rules.length === 0) {
    warnings.push('Could not parse any routing rules from routing.md');
  }

  agentReferences.push(...parseModuleOwnershipAgentReferences(lines));

  return {
    rules,
    warnings,
    agentReferences,
    markdownTableCount,
    routingTableCount,
  };
}

function normalizeRoutingHeader(value: string): string {
  return value
    .replace(/[`*_~]/g, '')
    .replace(/[→➜]/g, ' to ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function isRoutingWorkTypeHeader(value: string): boolean {
  return /^(work type|pattern|domain|signal|task type)$/.test(value);
}

function isRoutingAgentHeader(value: string): boolean {
  return /^(route to|route|agent|agents|owner|primary|primary agent|secondary|secondary agent|fallback|fallback agent)$/.test(
    value,
  );
}

function isRoutingExamplesHeader(value: string): boolean {
  return /^(example|examples|reason|notes)$/.test(value);
}

function parseFlattenedLegacyRoutingRules(
  lines: string[],
  parsedRoutingLines: ReadonlySet<number>,
): {
  rules: Array<{ rule: ParsedRoutingRule; lineIndex: number }>;
  sectionCount: number;
} {
  const hasRoutingTableHeading = lines.some((line) =>
    /^##\s+routing\s+table\s*$/i.test(line.trim()),
  );
  if (!hasRoutingTableHeading) return { rules: [], sectionCount: 0 };

  const rules: Array<{ rule: ParsedRoutingRule; lineIndex: number }> = [];
  let sectionCount = 0;

  for (let headingIndex = 0; headingIndex < lines.length; headingIndex++) {
    if (
      !/^##\s+work\s+type\s*(?:→|->|to)\s*agent\s*$/i.test(
        lines[headingIndex]!.trim(),
      )
    ) {
      continue;
    }

    let sectionEnd = lines.length;
    for (let index = headingIndex + 1; index < lines.length; index++) {
      if (/^#{1,2}\s+/.test(lines[index]!.trim())) {
        sectionEnd = index;
        break;
      }
    }

    const tableRows = lines
      .slice(headingIndex + 1, sectionEnd)
      .map((line, offset) => ({
        cells: parseMarkdownTableCells(line.trim()),
        lineIndex: headingIndex + 1 + offset,
        isTableLine: line.trim().startsWith('|'),
      }))
      .filter(
        ({ lineIndex, isTableLine }) =>
          isTableLine && !parsedRoutingLines.has(lineIndex),
      );
    const hasKnownHeader = tableRows.some(({ cells }) => {
      const normalized = cells.map(normalizeRoutingHeader);
      return (
        normalized.join('|') === 'work type|route to|examples' ||
        normalized.join('|') === 'work type|primary|secondary'
      );
    });
    const hasThreeColumnSeparator = tableRows.some(
      ({ cells }) =>
        cells.length === 3 &&
        cells.every((cell) => /^:?-{3,}:?$/.test(cell)),
    );
    if (!hasKnownHeader || !hasThreeColumnSeparator) continue;

    const sectionRules: Array<{
      rule: ParsedRoutingRule;
      lineIndex: number;
    }> = [];
    for (const { cells, lineIndex } of tableRows) {
      if (cells.length !== 3) continue;
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;

      const workType = cells[0]!;
      const normalizedWorkType = normalizeRoutingHeader(workType);
      if (
        !workType ||
        workType.includes('`') ||
        /^(?:role|tier \d+|hot|cold|season|wiki|label|layer|file|event|task type|work type|status(?: .*)?|area(?: .*)?|needs(?: .*)?|squad(?: .*)?)$/.test(
          normalizedWorkType,
        )
      ) {
        continue;
      }

      const agents = parseLegacyAgentCell(cells[1] ?? '');
      if (agents.length === 0) continue;
      const examples = cells[2]?.trim()
        ? cells[2]!.split(',').map((example) => example.trim()).filter(Boolean)
        : undefined;
      sectionRules.push({
        rule: { workType, agents, examples },
        lineIndex,
      });
    }
    if (sectionRules.length > 0) {
      sectionCount++;
      rules.push(...sectionRules);
    }
  }

  return { rules, sectionCount };
}

function parseLegacyAgentCell(value: string): string[] {
  const agents = value
    .split(/\s*(?:,|\+|\band\b)\s*/i)
    .map((agent) => agent.trim())
    .filter(Boolean);
  if (agents.length === 0) return [];

  for (const agent of agents) {
    const normalized = agent
      .replace(/[`*_~]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .trim();
    if (
      !normalized ||
      normalized.split(/\s+/).length > 4 ||
      /[`/\\:.()]/.test(agent) ||
      /^(?:yes|no|true|false)$/i.test(normalized) ||
      !/^[A-Za-z@][A-Za-z0-9@' -]*$/.test(normalized)
    ) {
      return [];
    }
  }
  return agents;
}

function parseModuleOwnershipAgentReferences(lines: string[]): string[] {
  const references: string[] = [];
  let inTable = false;
  let agentColumns: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+module\s+ownership\b/i.test(trimmed)) {
      inTable = true;
      agentColumns = [];
      continue;
    }
    if (inTable && /^##\s+/.test(trimmed)) break;
    if (!inTable || !trimmed.startsWith('|')) continue;

    const cells = parseMarkdownTableCells(trimmed);
    if (
      agentColumns.length === 0 &&
      cells.some((cell) => /^(primary|secondary|owner|agent)$/i.test(cell))
    ) {
      agentColumns = cells
        .map((cell, index) =>
          /^(primary|secondary|owner|agent)$/i.test(cell) ? index : -1,
        )
        .filter((index) => index >= 0);
      continue;
    }
    if (cells.every((cell) => /^[-:]+$/.test(cell))) continue;

    for (const column of agentColumns) {
      const value = cells[column];
      if (!value || /^[—-]+$/.test(value)) continue;
      references.push(
        ...value
          .split(',')
          .map((agent) => agent.trim())
          .filter(Boolean),
      );
    }
  }

  return references;
}

function parseMarkdownTableCells(line: string): string[] {
  const cells = line.split('|').map((cell) => cell.trim());
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

// ============================================================================
// decisions.md Parsing
// ============================================================================

/**
 * Parses decisions.md content to extract config-relevant decisions.
 *
 * Looks for headings that denote individual decisions and checks body text
 * for config-relevant keywords (model, routing, governance, tier, agent).
 *
 * @param content - Raw decisions.md content
 * @returns Parsed decisions and warnings
 */
export function parseDecisionsMarkdown(
  content: string,
): { decisions: ParsedDecision[]; warnings: string[] } {
  content = normalizeEol(content);
  const decisions: ParsedDecision[] = [];
  const warnings: string[] = [];

  if (!content || !content.trim()) {
    return { decisions, warnings };
  }

  const lines = content.split('\n');
  let currentTitle: string | null = null;
  let currentHeadingLevel: number | undefined;
  let currentDate: string | undefined;
  let bodyLines: string[] = [];

  const CONFIG_KEYWORDS = /\b(model|routing|governance|tier|agent|fallback|config|migration)\b/i;
  const DATE_IN_HEADING = /^(\d{4}-\d{2}-\d{2}):\s*(.+)/;
  const AUTHOR_LINE = /^\*\*By:\*\*\s*(.+)/i;

  const flush = () => {
    if (currentTitle) {
      const body = bodyLines.join('\n').trim();
      const configRelevant = CONFIG_KEYWORDS.test(currentTitle) || CONFIG_KEYWORDS.test(body);

      // Extract author from body lines
      let author: string | undefined;
      for (const bl of bodyLines) {
        const authorMatch = bl.trim().match(AUTHOR_LINE);
        if (authorMatch) {
          author = authorMatch[1]!.trim();
          break;
        }
      }

      const decision: ParsedDecision = { title: currentTitle, body, configRelevant };
      if (currentDate) decision.date = currentDate;
      if (author) decision.author = author;
      if (currentHeadingLevel !== undefined) decision.headingLevel = currentHeadingLevel;

      decisions.push(decision);
    }
    currentTitle = null;
    currentDate = undefined;
    currentHeadingLevel = undefined;
    bodyLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^(###?)\s+(.+)/);
    if (headingMatch) {
      flush();
      const hashes = headingMatch[1]!;
      let titleText: string = headingMatch[2]!;
      currentHeadingLevel = hashes.length;

      // Extract date from heading like "### 2026-02-21: Title"
      const dateMatch = titleText.match(DATE_IN_HEADING);
      if (dateMatch) {
        currentDate = dateMatch[1];
        titleText = dateMatch[2]!;
      }

      currentTitle = titleText;
      continue;
    }

    if (currentTitle) {
      bodyLines.push(line);
    }
  }

  flush();

  return { decisions, warnings };
}

// ============================================================================
// Config Generation
// ============================================================================

/**
 * Converts parsed markdown data into a typed SquadConfig.
 *
 * @param parsed - Result from parsing all markdown files
 * @param base - Optional base config to merge with
 * @returns Generated SquadConfig
 */
export function generateConfigFromParsed(
  parsed: MarkdownParseResult,
  base?: Partial<SquadConfig>,
): SquadConfig {
  const baseConfig = base ?? {};

  // Build routing rules
  const routingRules: RoutingRule[] = parsed.routingRules.map((r) => ({
    workType: r.workType,
    agents: r.agents.map((a) => (a.startsWith('@') ? a : `@${a.toLowerCase()}`)),
    examples: r.examples,
    confidence: 'high' as const,
  }));

  const routing: RoutingConfig = {
    ...DEFAULT_CONFIG.routing,
    ...baseConfig.routing,
    rules: routingRules.length > 0 ? routingRules : DEFAULT_CONFIG.routing.rules,
  };

  // Build model config with agent overrides from team.md model preferences
  const agentOverrides: Record<string, string> = {};
  for (const agent of parsed.agents) {
    if (agent.model) {
      agentOverrides[agent.name] = agent.model;
    }
  }

  const models: ModelSelectionConfig = {
    ...DEFAULT_CONFIG.models,
    ...baseConfig.models,
  };

  // Apply agent-specific model overrides via roleMapping
  if (Object.keys(agentOverrides).length > 0 && !models.roleMapping) {
    models.roleMapping = parsed.agents
      .filter((a) => a.model)
      .map((a) => ({
        role: a.role as 'lead' | 'developer' | 'tester' | 'designer' | 'scribe' | 'coordinator',
        model: a.model!,
      }));
  }

  const config: SquadConfig = {
    ...DEFAULT_CONFIG,
    ...baseConfig,
    version: baseConfig.version ?? DEFAULT_CONFIG.version,
    models,
    routing,
  };

  return config;
}

// ============================================================================
// Main Migration Entrypoint
// ============================================================================

/**
 * Migrates legacy markdown configuration files to a typed SquadConfig.
 *
 * Handles partial migrations gracefully — any combination of files can be
 * missing and the result will still be a valid SquadConfig.
 *
 * @param options - Markdown file contents and options
 * @returns Migration result with generated config and diagnostics
 */
export function migrateMarkdownToConfig(options: MarkdownMigrationOptions): MarkdownMigrationResult {
  const warnings: string[] = [];
  const migratedSections: string[] = [];
  const skippedSections: string[] = [];

  // Parse team.md
  let agents: ParsedAgent[] = [];
  if (options.teamMd) {
    const teamResult = parseTeamMarkdown(options.teamMd);
    agents = teamResult.agents;
    warnings.push(...teamResult.warnings);
    if (agents.length > 0) {
      migratedSections.push('team');
    } else {
      skippedSections.push('team');
    }
  } else {
    skippedSections.push('team');
  }

  // Parse routing.md
  let routingRules: ParsedRoutingRule[] = [];
  if (options.routingMd) {
    const routingResult = parseRoutingRulesMarkdown(options.routingMd);
    routingRules = routingResult.rules;
    warnings.push(...routingResult.warnings);
    if (routingRules.length > 0) {
      migratedSections.push('routing');
    } else {
      skippedSections.push('routing');
    }
  } else {
    skippedSections.push('routing');
  }

  // Parse decisions.md
  let decisions: ParsedDecision[] = [];
  if (options.decisionsMd) {
    const decResult = parseDecisionsMarkdown(options.decisionsMd);
    decisions = decResult.decisions;
    warnings.push(...decResult.warnings);
    if (decisions.length > 0) {
      migratedSections.push('decisions');
    } else {
      skippedSections.push('decisions');
    }
  } else {
    skippedSections.push('decisions');
  }

  const parsed: MarkdownParseResult = { agents, routingRules, decisions, warnings };

  const config = generateConfigFromParsed(parsed, options.baseConfig);

  return { config, parsed, migratedSections, skippedSections };
}

// ============================================================================
// Helpers
// ============================================================================

function kebabCase(str: string): string {
  return str
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function finalizeAgent(partial: Partial<ParsedAgent>): ParsedAgent {
  return {
    name: partial.name ?? 'unknown',
    role: partial.role ?? 'developer',
    skills: partial.skills ?? [],
    model: partial.model,
    status: partial.status,
    aliases: partial.aliases,
    autoAssign: partial.autoAssign,
  };
}
