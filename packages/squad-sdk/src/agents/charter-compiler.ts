/**
 * Charter Compilation (M1-8 + M2-9)
 * 
 * Transforms agent charter.md files into typed SDK CustomAgentConfig.
 * Parses charter sections and builds the complete agent prompt with team context.
 * Supports config-driven overrides that merge with charter content.
 */

import { SquadCustomAgentConfig } from '../adapter/types.js';
import { ConfigurationError } from '../adapter/errors.js';
import { normalizeEol } from '../utils/normalize-eol.js';

/**
 * Options for compiling a charter.
 */
export interface CharterCompileOptions {
  /** Agent name (e.g., 'verbal', 'fenster') */
  agentName: string;
  /** Full path to the agent's charter.md file */
  charterPath: string;
  /** Raw charter markdown content (if already loaded) */
  charterContent?: string;
  /** Content of team.md (team roster) */
  teamContext?: string;
  /** Routing rules content */
  routingRules?: string;
  /** Relevant decision records */
  decisions?: string;
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
  /** Identity section: name, role, expertise, style */
  identity: {
    name?: string;
    role?: string;
    expertise?: string[];
    style?: string;
  };
  /** What I Own section content */
  ownership?: string;
  /** Boundaries section content */
  boundaries?: string;
  /** Model preference from ## Model section */
  modelPreference?: string;
  /** Rationale for model preference from ## Model section */
  modelRationale?: string;
  /** Fallback model from ## Model section */
  modelFallback?: string;
  /** Collaboration section content */
  collaboration?: string;
  /** Full charter content */
  fullContent: string;
}

/**
 * Extended result from charter compilation, includes metadata beyond CustomAgentConfig.
 */
export interface CompiledCharter extends SquadCustomAgentConfig {
  /** Resolved model (from config override or charter preference) */
  resolvedModel?: string;
  /** Resolved tools list (from config override or charter) */
  resolvedTools?: string[];
  /** Parsed charter data */
  parsed: ParsedCharter;
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
 * @param options - Charter compilation options
 * @returns CompiledCharter with full metadata
 * @throws {ConfigurationError} If charter is missing or malformed
 */
export function compileCharterFull(options: CharterCompileOptions): CompiledCharter {
  const { agentName, charterPath, charterContent, teamContext, routingRules, decisions, configOverrides } = options;

  try {
    const parsed = parseCharterMarkdown(charterContent ?? '');
    
    // Build the complete prompt by composing sections
    const promptParts: string[] = [];
    
    // Add charter content
    promptParts.push(parsed.fullContent || `# ${agentName} Charter\n\nAgent charter content.`);
    
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

    // Append extra prompt from config overrides
    if (configOverrides?.extraPrompt) {
      promptParts.push('\n\n' + configOverrides.extraPrompt);
    }
    
    const prompt = promptParts.join('');
    
    // Config overrides win over charter-parsed values
    const role = configOverrides?.role || parsed.identity.role;
    const displayName = configOverrides?.displayName
      || (role ? `${capitalize(agentName)} — ${role}` : capitalize(agentName));
    
    const description = parsed.identity.expertise?.length
      ? `Expertise: ${parsed.identity.expertise.join(', ')}`
      : `${role || 'Agent'}`;

    // Resolve model: config override > charter preference
    const resolvedModel = configOverrides?.model || parsed.modelPreference;

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
      resolvedTools,
      parsed,
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
  content = normalizeEol(content);
  const result: ParsedCharter = {
    identity: {},
    fullContent: content,
  };
  
  if (!content || content.trim().length === 0) {
    return result;
  }
  
  // Extract ## Identity section
  const identityMatch = content.match(/##\s+Identity\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (identityMatch) {
    const identityContent = identityMatch[1]!;
    
    // Parse identity fields
    const nameMatch = identityContent.match(/\*\*Name:\*\*\s*(.+)/i);
    if (nameMatch) result.identity.name = nameMatch[1]!.trim();
    
    const roleMatch = identityContent.match(/\*\*Role:\*\*\s*(.+)/i);
    if (roleMatch) result.identity.role = roleMatch[1]!.trim();
    
    const expertiseMatch = identityContent.match(/\*\*Expertise:\*\*\s*(.+)/i);
    if (expertiseMatch) {
      result.identity.expertise = expertiseMatch[1]!
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
    }
    
    const styleMatch = identityContent.match(/\*\*Style:\*\*\s*(.+)/i);
    if (styleMatch) result.identity.style = styleMatch[1]!.trim();
  }
  
  // Extract ## What I Own section
  const ownershipMatch = content.match(/##\s+What I Own\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (ownershipMatch) {
    result.ownership = ownershipMatch[1]!.trim();
  }
  
  // Extract ## Boundaries section
  const boundariesMatch = content.match(/##\s+Boundaries\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (boundariesMatch) {
    result.boundaries = boundariesMatch[1]!.trim();
  }
  
  // Extract ## Model section
  const modelMatch = content.match(/##\s+Model\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (modelMatch) {
    const modelContent = modelMatch[1]!;
    const preferredMatch = modelContent.match(/\*\*Preferred:\*\*\s*(.+)/i);
    if (preferredMatch) {
      result.modelPreference = preferredMatch[1]!.trim();
    }
    const rationaleMatch = modelContent.match(/\*\*Rationale:\*\*\s*(.+)/i);
    if (rationaleMatch) {
      result.modelRationale = rationaleMatch[1]!.trim();
    }
    const fallbackMatch = modelContent.match(/\*\*Fallback:\*\*\s*(.+)/i);
    if (fallbackMatch) {
      result.modelFallback = fallbackMatch[1]!.trim();
    }
  }
  
  // Extract ## Collaboration section
  const collaborationMatch = content.match(/##\s+Collaboration\s*\n([\s\S]*?)(?=\n##|\n---|$)/i);
  if (collaborationMatch) {
    result.collaboration = collaborationMatch[1]!.trim();
  }
  
  return result;
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
