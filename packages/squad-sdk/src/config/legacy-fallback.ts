/**
 * Legacy Fallback — Backwards Compatibility (M3-9, Issue #150)
 *
 * Reads legacy squad.agent.md files and .ai-team/ directory structures,
 * maps them to typed SquadConfig, and merges with any existing config
 * (typed config always wins, legacy fills gaps).
 *
 * @module config/legacy-fallback
 */

import { join } from 'path';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import type {
  SquadConfig,
  RoutingConfig,
  RoutingRule,
  ModelSelectionConfig,
} from '../runtime/config.js';
import { DEFAULT_CONFIG } from '../runtime/config.js';
import { parseAgentDoc, type AgentDocMetadata } from './agent-doc.js';
import { parseRoutingMarkdown } from './routing.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Legacy configuration extracted from squad.agent.md and .ai-team/ files.
 */
export interface LegacyConfig {
  /** System prompt extracted from the agent doc */
  systemPrompt?: string;
  /** Tool names referenced in the agent doc */
  tools: string[];
  /** Agent definitions extracted from agent sections */
  agents: LegacyAgentDef[];
  /** Routing hints extracted from routing sections */
  routingHints: string[];
  /** Routing rules parsed from routing.md */
  routingRules: RoutingRule[];
  /** Model preferences found in the document */
  modelPreferences: string[];
  /** Source path that was loaded */
  sourcePath: string;
  /** Whether .ai-team/ directory was found */
  hasAiTeamDir: boolean;
}

/**
 * Agent definition extracted from a legacy squad.agent.md.
 */
export interface LegacyAgentDef {
  name: string;
  role?: string;
  description?: string;
  tools?: string[];
  model?: string;
}

// ============================================================================
// Detection
// ============================================================================

/** Paths to search for legacy agent files, in priority order. */
const LEGACY_AGENT_PATHS = [
  join('.github', 'agents', 'squad.agent.md'),
  join('.ai-team', 'squad.agent.md'),
] as const;

/** Paths to search for legacy routing files. */
const LEGACY_ROUTING_PATHS = [
  join('.ai-team', 'routing.md'),
  join('.github', 'agents', 'routing.md'),
] as const;

/** Paths to search for legacy team files. */
const LEGACY_TEAM_PATHS = [
  join('.ai-team', 'team.md'),
  join('.github', 'agents', 'team.md'),
] as const;

/**
 * Detect whether a project uses the legacy squad.agent.md format.
 *
 * Checks for:
 * - .github/agents/squad.agent.md
 * - .ai-team/squad.agent.md
 * - .ai-team/ directory with team.md or routing.md
 *
 * @param dir - Project root directory
 * @returns true if legacy format is detected
 */
export function detectLegacySetup(dir: string, storage: StorageProvider = new FSStorageProvider()): boolean {
  for (const relPath of LEGACY_AGENT_PATHS) {
    if (storage.existsSync(join(dir, relPath))) return true;
  }
  // Also detect bare .ai-team/ directories with team or routing files
  for (const relPath of [...LEGACY_ROUTING_PATHS, ...LEGACY_TEAM_PATHS]) {
    if (storage.existsSync(join(dir, relPath))) return true;
  }
  return false;
}

// ============================================================================
// Loading
// ============================================================================

/**
 * Load and parse a legacy squad.agent.md file from the given directory.
 *
 * Search order:
 *  1. .github/agents/squad.agent.md
 *  2. .ai-team/squad.agent.md
 *
 * Also loads routing.md and team.md if present in .ai-team/ or .github/agents/.
 *
 * @param dir - Project root directory
 * @returns Parsed LegacyConfig, or undefined if no legacy file found
 */
export function loadLegacyAgentMd(dir: string, storage: StorageProvider = new FSStorageProvider()): LegacyConfig | undefined {
  // Find the agent doc
  let agentMdPath: string | undefined;
  let agentMdContent: string | undefined;

  for (const relPath of LEGACY_AGENT_PATHS) {
    const fullPath = join(dir, relPath);
    if (storage.existsSync(fullPath)) {
      agentMdPath = fullPath;
      agentMdContent = storage.readSync(fullPath);
      break;
    }
  }

  if (!agentMdPath || !agentMdContent) {
    return undefined;
  }

  // Parse the agent doc
  const parsed = parseAgentDoc(agentMdContent);

  // Extract agent definitions from the document
  const agents = extractAgentDefs(agentMdContent, parsed);

  // Try to load routing.md
  let routingRules: RoutingRule[] = [];
  for (const relPath of LEGACY_ROUTING_PATHS) {
    const fullPath = join(dir, relPath);
    if (storage.existsSync(fullPath)) {
      const routingContent = storage.readSync(fullPath);
      if (routingContent !== undefined) {
        const routingConfig = parseRoutingMarkdown(routingContent);
        routingRules = routingConfig.rules;
      }
      break;
    }
  }

  // Check for .ai-team directory
  const hasAiTeamDir =
    storage.existsSync(join(dir, '.ai-team')) &&
    (storage.existsSync(join(dir, '.ai-team', 'team.md')) ||
      storage.existsSync(join(dir, '.ai-team', 'routing.md')));

  return {
    systemPrompt: agentMdContent,
    tools: parsed.tools,
    agents,
    routingHints: parsed.routingHints,
    routingRules,
    modelPreferences: parsed.modelPreferences,
    sourcePath: agentMdPath,
    hasAiTeamDir,
  };
}

// ============================================================================
// Merging
// ============================================================================

/**
 * Merge a legacy configuration with a typed SquadConfig.
 *
 * The typed config **always wins** on conflict. Legacy values fill gaps
 * where the typed config has no data.
 *
 * @param legacy - Legacy configuration from squad.agent.md
 * @param config - Typed Squad configuration (takes precedence)
 * @returns Merged configuration
 */
export function mergeLegacyWithConfig(
  legacy: LegacyConfig,
  config: SquadConfig,
): SquadConfig {
  // Emit deprecation warning
  emitDeprecationWarning(legacy.sourcePath);

  // Merge routing rules: config wins, legacy fills gaps
  const configWorkTypes = new Set(
    (config.routing?.rules ?? []).map((r) => r.workType),
  );
  const legacyRulesFiltered = legacy.routingRules.filter(
    (r) => !configWorkTypes.has(r.workType),
  );
  const mergedRoutingRules = [
    ...(config.routing?.rules ?? []),
    ...legacyRulesFiltered,
  ];

  // Merge model preferences: config wins
  const mergedModels: ModelSelectionConfig = {
    ...config.models,
  };
  if (
    legacy.modelPreferences.length > 0 &&
    config.models.defaultModel === DEFAULT_CONFIG.models.defaultModel
  ) {
    // Only use legacy model if config still has the default
    mergedModels.defaultModel = legacy.modelPreferences[0]!;
  }

  // Build merged routing
  const mergedRouting: RoutingConfig = {
    ...config.routing,
    rules: mergedRoutingRules,
  };

  return {
    ...config,
    models: mergedModels,
    routing: mergedRouting,
  };
}

// ============================================================================
// Deprecation Warning
// ============================================================================

/**
 * Emit a deprecation warning when legacy format is detected.
 * Uses console.warn so it's visible but non-blocking.
 */
export function emitDeprecationWarning(sourcePath: string): void {
  console.warn(
    `[squad] DEPRECATION: Legacy squad.agent.md detected at "${sourcePath}". ` +
      'Migrate to squad.config.ts for typed configuration. ' +
      'Run `squad init --migrate` to auto-convert.',
  );
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Extract agent definitions from squad.agent.md content.
 * Looks for patterns like "**AgentName** — Role" or "### AgentName" sections.
 */
function extractAgentDefs(
  content: string,
  parsed: AgentDocMetadata,
): LegacyAgentDef[] {
  const agents: LegacyAgentDef[] = [];
  const seen = new Set<string>();

  // Pattern 1: ### Agent sections (common in squad.agent.md)
  const sectionPattern = /^###\s+(\w+)\s*(?:[-—]\s*(.+))?$/gm;
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(content)) !== null) {
    const name = match[1]!.toLowerCase();
    const role = match[2]?.trim();
    if (!seen.has(name) && name.length > 1) {
      seen.add(name);
      agents.push({ name, role });
    }
  }

  // Pattern 2: **Name** — Role (bold name with dash)
  const boldPattern = /\*\*(\w+)\*\*\s*[-—]\s*(.+)/g;
  while ((match = boldPattern.exec(content)) !== null) {
    const name = match[1]!.toLowerCase();
    const role = match[2]!.trim();
    if (!seen.has(name) && name.length > 1) {
      seen.add(name);
      agents.push({ name, role });
    }
  }

  // If the parsed doc itself has a name, add it as the coordinator
  if (parsed.name && !seen.has(parsed.name.toLowerCase())) {
    agents.unshift({
      name: parsed.name.toLowerCase(),
      role: parsed.description ?? 'coordinator',
      tools: parsed.tools,
    });
  }

  return agents;
}
