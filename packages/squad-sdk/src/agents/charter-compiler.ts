/**
 * Charter Compilation (M1-8 + M2-9)
 * 
 * Transforms agent charter.md files into typed SDK CustomAgentConfig.
 * Parses charter sections and builds the complete agent prompt with team context.
 * Supports config-driven overrides that merge with charter content.
 */

import { SquadCustomAgentConfig } from '../adapter/types.js';
import { ConfigurationError } from '../adapter/errors.js';
import { VALID_REASONING_EFFORTS, VALID_CONTEXT_TIERS } from '../config/models.js';
import {
  scanCharterMarkdown,
  type CharterMarkdownField,
  type CharterMarkdownScan,
} from './charter-markdown.js';
import {
  CHARTER_PROFILE,
  validateCharterMarkdown,
  type CharterValidationResult,
} from './charter-validator.js';

/** Set form for fast lookup. */
const VALID_EFFORTS = new Set<string>(VALID_REASONING_EFFORTS);

/** Set form for fast lookup. */
const VALID_TIERS = new Set<string>(VALID_CONTEXT_TIERS);

/**
 * Options for compiling a charter.
 */
export interface CharterCompileOptions {
  /** Agent name (e.g., 'verbal', 'fenster') */
  agentName: string;
  /** Full path to the agent's charter.md file */
  charterPath: string;
  /**
   * Raw charter markdown content. When omitted, the compatibility compiler
   * generates a canonical, behavior-neutral charter from `agentName`. Passing
   * an empty or invalid string is rejected.
   */
  charterContent?: string;
  /**
   * Charter profile used for validation. The convenience compiler defaults to
   * `squad-charter/v0.1`. This TypeScript-specific default is not part of the
   * portable runtime capability; portable conformance cases select a profile
   * explicitly.
   */
  profile?: string;
  /** Content of team.md (team roster) */
  teamContext?: string;
  /** Routing rules content */
  routingRules?: string;
  /** Relevant decision records */
  decisions?: string;
  /** Enabled plugin guidance and metadata to inject into spawned-agent context */
  pluginContext?: string;
  /** Config-driven overrides (config wins on conflict) */
  configOverrides?: CharterConfigOverrides;
}

/**
 * Config-driven overrides that merge with charter content.
 * Values from config take precedence over charter-parsed values.
 */
export interface CharterConfigOverrides {
  /** Override display name */
  displayName?: string;
  /** Override role */
  role?: string;
  /** Override or set model */
  model?: string;
  /** Override or set reasoning effort level */
  reasoningEffort?: string;
  /** Override or set context tier (context window size) */
  contextTier?: string;
  /** Override or set tools list */
  tools?: string[];
  /** Override or set status */
  status?: 'active' | 'inactive' | 'retired';
  /** Extra prompt content appended to charter */
  extraPrompt?: string;
}

/**
 * Parsed charter structure.
 */
export interface ParsedCharter {
  /** Identity section: canonical ID/purpose plus legacy descriptive fields */
  identity: {
    id?: string;
    purpose?: string;
    name?: string;
    role?: string;
    expertise?: string[];
    style?: string;
  };
  /** Accountable Responsibilities section content, or legacy What I Own */
  ownership?: string;
  /** Non-Responsibilities section content, or legacy Boundaries */
  boundaries?: string;
  /** Model preference from ## Model section */
  modelPreference?: string;
  /** Rationale for model preference from ## Model section */
  modelRationale?: string;
  /** Fallback model from ## Model section */
  modelFallback?: string;
  /** Reasoning effort preference from ## Model section */
  reasoningEffort?: string;
  /** Authored reasoning effort, including auto or an unsupported value */
  authoredReasoningEffort?: string;
  /** Context tier preference from ## Model section */
  contextTier?: string;
  /** Authored context tier, including auto or an unsupported value */
  authoredContextTier?: string;
  /** Collaboration and Review Authority content, or legacy Collaboration */
  collaboration?: string;
  /** Full charter content */
  fullContent: string;
  /** Source metadata used by lossless charter editors */
  source?: CharterSourceMetadata;
}

/**
 * Source representation retained for lossless no-op and extension-preserving
 * charter edits.
 */
export interface CharterSourceMetadata {
  /** Semantic snapshot captured when the source was parsed */
  semanticKey: string;
  /** Whether the source already uses the canonical responsibility headings */
  canonicalShape: boolean;
  /** Source line ending used when canonical known-field edits are emitted */
  eol: '\n' | '\r\n' | '\r';
  /** Unknown namespaced extension sections in source order, byte-for-byte */
  extensions: readonly string[];
}

/**
 * Extended result from charter compilation, includes metadata beyond CustomAgentConfig.
 */
export interface CompiledCharter extends SquadCustomAgentConfig {
  /** Resolved model (from config override or charter preference) */
  resolvedModel?: string;
  /** Resolved reasoning effort (from config override or charter preference) */
  resolvedReasoningEffort?: string;
  /** Resolved context tier (from config override or charter preference) */
  resolvedContextTier?: string;
  /** Resolved tools list (from config override or charter) */
  resolvedTools?: string[];
  /** Parsed charter data */
  parsed: ParsedCharter;
  /** Validation performed before behavior-affecting fields were applied */
  validation: CharterValidationResult;
}

/**
 * Compile a charter.md file into a CustomAgentConfig.
 * 
 * @param options - Charter compilation options
 * @returns Squad CustomAgentConfig ready for SDK registration
 * @throws {ConfigurationError} If charter is missing or malformed
 */
export function compileCharter(options: CharterCompileOptions): SquadCustomAgentConfig {
  return compileCharterFull(options);
}

/**
 * Compile a charter with full metadata including resolved model/tools.
 *
 * This is the TypeScript reference runtime adapter. Its omitted-content and
 * default-profile conveniences are not requirements for other implementations.
 * 
 * @param options - Charter compilation options
 * @returns CompiledCharter with full metadata
 * @throws {ConfigurationError} If charter is missing or malformed
 */
export function compileCharterFull(options: CharterCompileOptions): CompiledCharter {
  const { agentName, charterPath, charterContent, teamContext, routingRules, decisions, pluginContext, configOverrides } = options;

  try {
    const generatedCompatibility = charterContent === undefined;
    const content = charterContent ?? createCompatibilityCharter(agentName);
    const validation = validateCharterMarkdown(content, {
      path: charterPath,
      profile: options.profile ?? CHARTER_PROFILE,
    });
    if (!validation.accepted) {
      const summary = validation.diagnostics
        .filter(diagnostic => diagnostic.severity === 'error')
        .map(diagnostic => `${diagnostic.code} at ${diagnostic.line}:${diagnostic.column}`)
        .join(', ');
      throw new ConfigurationError(
        `Invalid charter for agent '${agentName}' at ${charterPath}: ${summary}`,
        {
          agentName,
          operation: 'compileCharter',
          timestamp: new Date(),
          metadata: {
            charterPath,
            profile: validation.profile,
            diagnostics: validation.diagnostics,
          },
        },
      );
    }
    const parsed = parseCharterMarkdown(content);
    
    // Build the complete prompt by composing sections
    const promptParts: string[] = [];
    
    // Add charter content
    promptParts.push(parsed.fullContent);
    
    // Add team context if available
    if (teamContext) {
      promptParts.push('\n\n## Team Context\n\n' + teamContext);
    }
    
    // Add routing rules if available
    if (routingRules) {
      promptParts.push('\n\n## Routing Rules\n\n' + routingRules);
    }
    
    // Add relevant decisions if available
    if (decisions) {
      promptParts.push('\n\n## Relevant Decisions\n\n' + decisions);
    }

    // Add enabled plugin guidance after built-in squad context. Plugins are
    // declarative/static only; this section is the runtime consumption point.
    if (pluginContext) {
      promptParts.push('\n\n## Plugin Context\n\n' + pluginContext);
    }

    // Append extra prompt from config overrides
    if (configOverrides?.extraPrompt) {
      promptParts.push('\n\n' + configOverrides.extraPrompt);
    }
    
    const prompt = promptParts.join('');
    
    // Config overrides win over charter-parsed values
    const role = configOverrides?.role || parsed.identity.role;
    const displayName = configOverrides?.displayName
      || (generatedCompatibility
        ? capitalize(agentName)
        : role
          ? `${capitalize(agentName)} — ${role}`
          : capitalize(agentName));
    
    const description = parsed.identity.expertise?.length
      ? `Expertise: ${parsed.identity.expertise.join(', ')}`
      : `${role || 'Agent'}`;

    // Resolve model: config override > charter preference. "auto" is authored
    // intent for runtime selection, never a literal model override.
    const configuredModel = configOverrides?.model?.trim();
    const charterModel = parsed.modelPreference?.trim();
    const resolvedModel = configuredModel?.toLowerCase() === 'auto'
      ? undefined
      : configuredModel || (charterModel?.toLowerCase() === 'auto' ? undefined : charterModel);

    // Resolve reasoning effort: config override > charter preference
    // Normalize: "auto" and invalid values resolve to undefined
    const configEffort = configOverrides?.reasoningEffort?.toLowerCase();
    const charterEffort = parsed.reasoningEffort; // already validated during parsing
    const validConfigEffort = configEffort && configEffort !== 'auto' && VALID_EFFORTS.has(configEffort) ? configEffort : undefined;
    const resolvedReasoningEffort = configEffort === 'auto'
      ? undefined
      : validConfigEffort || charterEffort;

    // Resolve context tier: config override > charter preference
    // Normalize: "auto" and invalid values resolve to undefined
    const configTier = configOverrides?.contextTier?.toLowerCase();
    const charterTier = parsed.contextTier; // already validated during parsing
    const validConfigTier = configTier && configTier !== 'auto' && VALID_TIERS.has(configTier) ? configTier : undefined;
    const resolvedContextTier = configTier === 'auto'
      ? undefined
      : validConfigTier || charterTier;

    // Resolve tools: config override > charter-extracted tools
    const resolvedTools = configOverrides?.tools;
    
    return {
      name: agentName,
      displayName,
      description,
      prompt,
      infer: true,
      tools: resolvedTools ?? null,
      resolvedModel,
      resolvedReasoningEffort,
      resolvedContextTier,
      resolvedTools,
      parsed,
      validation,
    };
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError(
      `Failed to compile charter for agent '${agentName}' at ${charterPath}: ${error instanceof Error ? error.message : String(error)}`,
      {
        agentName,
        operation: 'compileCharter',
        timestamp: new Date(),
        metadata: { charterPath },
      },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse charter markdown content into structured sections.
 * 
 * @param content - Raw charter.md content
 * @returns Parsed charter structure
 */
export function parseCharterMarkdown(content: string): ParsedCharter {
  const scan = scanCharterMarkdown(content);
  const result: ParsedCharter = {
    identity: {},
    fullContent: content,
  };
  
  if (!content || content.trim().length === 0) {
    return result;
  }
  
  const identityFields = fieldsInSection(scan, 'Identity');
  const id = findField(identityFields, 'ID');
  if (id) result.identity.id = stripCode(id.value);

  const purpose = findField(identityFields, 'Purpose');
  if (purpose) result.identity.purpose = purpose.value.trim();

  const name = findField(identityFields, 'Name');
  if (name) result.identity.name = name.value.trim();

  const role = findField(identityFields, 'Role');
  if (role) result.identity.role = role.value.trim();

  const expertise = findField(identityFields, 'Expertise');
  if (expertise) {
    result.identity.expertise = expertise.value
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
  }

  const style = findField(identityFields, 'Style');
  if (style) result.identity.style = style.value.trim();

  // Legacy charters identify the agent in the H1 instead of an Identity section.
  if (!result.identity.name || !result.identity.role) {
    const titleMatch = scan.h1?.name.match(/^(.+?)\s+(?:—|–|-)\s+(.+?)$/);
    if (titleMatch) {
      result.identity.name ??= titleMatch[1]!.trim();
      result.identity.role ??= titleMatch[2]!.trim();
    }
  }
  
  // Extract canonical ownership section or its legacy alias.
  result.ownership = findSectionBody(scan, 'Accountable Responsibilities', 'What I Own');
  
  // Extract canonical non-responsibilities section or its legacy alias.
  result.boundaries = findSectionBody(scan, 'Non-Responsibilities', 'Boundaries');
  
  // Extract ## Model section
  const modelFields = fieldsInSection(scan, 'Model');
  const preferred = findField(modelFields, 'Preferred');
  if (preferred) result.modelPreference = preferred.value.trim();

  const rationale = findField(modelFields, 'Rationale');
  if (rationale) result.modelRationale = rationale.value.trim();

  const fallback = findField(modelFields, 'Fallback');
  if (fallback) result.modelFallback = fallback.value.trim();

  const effort = findField(modelFields, 'Reasoning Effort');
  if (effort) {
    const raw = effort.value.trim().toLowerCase();
    result.authoredReasoningEffort = raw;
    // Normalize: "auto" → undefined, invalid values → undefined
    if (raw !== 'auto' && VALID_EFFORTS.has(raw)) {
      result.reasoningEffort = raw;
    } else if (raw !== 'auto') {
      // Surface invalid charter input to the author instead of dropping it silently.
      console.warn(
        `[squad] charter parse: ignoring invalid reasoning effort "${raw}" `
        + `(expected ${VALID_REASONING_EFFORTS.join(', ')}, or auto)`,
      );
    }
  }

  const tier = findField(modelFields, 'Context Tier');
  if (tier) {
    const raw = tier.value.trim().toLowerCase();
    result.authoredContextTier = raw;
    // Normalize: "auto" → undefined, invalid values → undefined
    if (raw !== 'auto' && VALID_TIERS.has(raw)) {
      result.contextTier = raw;
    } else if (raw !== 'auto') {
      // Surface invalid charter input to the author instead of dropping it silently.
      console.warn(
        `[squad] charter parse: ignoring invalid context tier "${raw}" `
        + `(expected ${VALID_CONTEXT_TIERS.join(', ')}, or auto)`,
      );
    }
  }
  
  // Extract canonical collaboration section or its legacy alias.
  result.collaboration = findSectionBody(
    scan,
    'Collaboration and Review Authority',
    'Collaboration',
  );

  Object.defineProperty(result, 'source', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: {
      semanticKey: charterSemanticKey(result),
      canonicalShape: hasCanonicalShape(scan),
      eol: scan.eol,
      extensions: scan.sections
        .filter(section => section.isExtension)
        .map(section => section.raw),
    } satisfies CharterSourceMetadata,
  });

  return result;
}

/** @internal Stable comparison key for source-aware serialization. */
export function charterSemanticKey(charter: ParsedCharter): string {
  return JSON.stringify({
    identity: charter.identity,
    ownership: charter.ownership,
    boundaries: charter.boundaries,
    modelPreference: charter.modelPreference,
    modelRationale: charter.modelRationale,
    modelFallback: charter.modelFallback,
    reasoningEffort: charter.reasoningEffort,
    authoredReasoningEffort: charter.authoredReasoningEffort,
    contextTier: charter.contextTier,
    authoredContextTier: charter.authoredContextTier,
    collaboration: charter.collaboration,
  });
}

function fieldsInSection(
  scan: CharterMarkdownScan,
  sectionName: string,
): readonly CharterMarkdownField[] {
  return scan.fields.filter(
    field => field.section.toLowerCase() === sectionName.toLowerCase(),
  );
}

function findField(
  fields: readonly CharterMarkdownField[],
  name: string,
): CharterMarkdownField | undefined {
  return fields.find(field => field.name.toLowerCase() === name.toLowerCase());
}

function findSectionBody(
  scan: CharterMarkdownScan,
  ...names: readonly string[]
): string | undefined {
  const section = scan.sections.find(candidate =>
    names.some(name => candidate.name.toLowerCase() === name.toLowerCase()),
  );
  return section?.body;
}

function stripCode(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function hasCanonicalShape(scan: CharterMarkdownScan): boolean {
  if (scan.h1s.length !== 1 || !/^.+?\s+—\s+.+?$/.test(scan.h1s[0]!.name)) {
    return false;
  }

  const standardSections = scan.sections.filter(section => !section.isExtension);
  const names = standardSections.map(section => section.name.toLowerCase());
  const expected = [
    'identity',
    'accountable responsibilities',
    'non-responsibilities',
    'collaboration and review authority',
  ];
  if (names.length === expected.length + 1) expected.push('model');
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    return false;
  }

  const canonicalExtensions = scan.sections
    .filter(section => section.isExtension)
    .every(section => /^X-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.name));
  if (!canonicalExtensions) return false;

  const compatibilityFields = new Set(['name', 'role', 'expertise', 'style', 'fallback']);
  if (scan.fields.some(field => compatibilityFields.has(field.name.toLowerCase()))) {
    return false;
  }

  const identityFields = fieldsInSection(scan, 'Identity');
  const ids = identityFields.filter(field => field.name.toLowerCase() === 'id');
  const purposes = identityFields.filter(field => field.name.toLowerCase() === 'purpose');
  return ids.length === 1
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stripCode(ids[0]!.value))
    && purposes.length === 1
    && purposes[0]!.value.trim().length > 0;
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function createCompatibilityCharter(agentName: string): string {
  const displayName = capitalize(agentName);
  return `# ${displayName} — Agent

## Identity
- **ID:** \`${agentName}\`
- **Purpose:** Provide compatibility behavior when no charter content was supplied.

## Accountable Responsibilities
- Follow the caller-provided task.

## Non-Responsibilities
- No additional responsibilities are inferred.

## Collaboration and Review Authority
- Follow caller-provided collaboration and review instructions.
`;
}
