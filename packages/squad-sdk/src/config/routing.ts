/**
 * Routing Configuration Module
 * 
 * Parses routing.md markdown format into typed RoutingConfig and compiles routing rules
 * for fast pattern matching. Supports both markdown (legacy) and typed config (new).
 * 
 * @module config/routing
 */

import type { RoutingConfig, RoutingRule, IssueRoutingRule } from '../runtime/config.js';
import { normalizeEol } from '../utils/normalize-eol.js';

/**
 * Compiled routing matcher with regex patterns.
 */
export interface CompiledRouter {
  /** Compiled work type rules */
  workTypeRules: CompiledWorkTypeRule[];
  
  /** Compiled issue routing rules */
  issueRules?: CompiledIssueRule[];
  
  /** Fallback agent if no match */
  fallbackAgent?: string;
  
  /** Governance settings */
  governance?: {
    eagerByDefault?: boolean;
    scribeAutoRuns?: boolean;
    allowRecursiveSpawn?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Compiled work type rule with regex patterns.
 */
export interface CompiledWorkTypeRule {
  /** Original work type */
  workType: string;
  
  /** Agents to route to */
  agents: string[];
  
  /** Compiled regex patterns for matching */
  patterns: RegExp[];
  
  /** Examples for LLM understanding */
  examples?: string[];
  
  /** Confidence level */
  confidence?: 'high' | 'medium' | 'low';
  
  /** Priority (higher = more specific) */
  priority: number;
}

/**
 * Compiled issue routing rule.
 */
export interface CompiledIssueRule {
  /** Label pattern (regex) */
  labelPattern: RegExp;
  
  /** Action to take */
  action: 'assign' | 'route' | 'evaluate';
  
  /** Target agent */
  target?: string;
  
  /** Required labels (all must match) */
  requiredLabels?: RegExp[];
  
  /** Excluded labels (none can match) */
  excludedLabels?: RegExp[];
  
  /** Issue state filter */
  state?: 'open' | 'closed' | 'all';
}

/**
 * Routing match result.
 */
export interface RoutingMatch {
  /** Matched agents */
  agents: string[];
  
  /** Match confidence */
  confidence: 'high' | 'medium' | 'low';
  
  /** Matched rule */
  rule?: CompiledWorkTypeRule;
  
  /** Match reason */
  reason: string;
}

/**
 * Parses routing.md markdown table format into typed RoutingConfig.
 * 
 * Expected format:
 * ```markdown
 * ## Routing Table
 * 
 * | Work Type | Route To | Examples |
 * |-----------|----------|----------|
 * | feature-dev | Lead | New features, enhancements |
 * | bug-fix | Developer | Bug fixes, patches |
 * ```
 * 
 * @param content - Markdown content from routing.md
 * @returns Parsed routing configuration
 */
export function parseRoutingMarkdown(content: string): RoutingConfig {
  content = normalizeEol(content);
  const rules: RoutingRule[] = [];
  const lines = content.split('\n');
  
  let inRoutingTable = false;
  let headerPassed = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect routing table section
    if (trimmed.toLowerCase().includes('## routing table') || 
        trimmed.toLowerCase().includes('##routing table')) {
      inRoutingTable = true;
      headerPassed = false;
      continue;
    }
    
    // Stop at next section
    if (inRoutingTable && trimmed.startsWith('##') && !trimmed.toLowerCase().includes('routing table')) {
      inRoutingTable = false;
      continue;
    }
    
    // Parse table rows
    if (inRoutingTable && trimmed.startsWith('|')) {
      // Skip header row
      if (trimmed.toLowerCase().includes('work type') || trimmed.toLowerCase().includes('pattern')) {
        headerPassed = true;
        continue;
      }
      
      // Skip separator row
      if (trimmed.includes('---') || trimmed.includes('===')) {
        continue;
      }
      
      if (!headerPassed) {
        continue;
      }
      
      // Parse data row: | Work Type | Route To | Examples |
      const cells = trimmed
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell.length > 0);
      
      if (cells.length >= 2) {
        const workType = cells[0];
        const routeTo = cells[1]!;
        // Strip surrounding quotes (", ', `) so quoted and unquoted examples
        // tokenize identically. Without this, a quoted example like "unit tests"
        // keeps its quotes and compiles to patterns that never match, which made
        // quoted routing examples silently route everything to fallback.
        const examples = cells.length >= 3
          ? cells[2]!
              .split(',')
              .map(ex => ex.trim().replace(/^["'`]+|["'`]+$/g, '').trim())
              .filter(ex => ex.length > 0)
          : undefined;
        
        // Parse agent names (may be comma-separated or single)
        const agents = routeTo.split(',').map(a => a.trim()).filter(a => a.length > 0);
        
        if (workType && agents.length > 0) {
          rules.push({
            workType,
            agents,
            examples,
            confidence: 'high'
          });
        }
      }
    }
  }
  
  return {
    rules,
    governance: {
      eagerByDefault: true,
      scribeAutoRuns: false,
      allowRecursiveSpawn: false
    }
  };
}

/**
 * Compiles routing rules for fast pattern matching.
 * 
 * Creates regex patterns from work types and assigns priority scores
 * based on specificity. More specific patterns get higher priority.
 * 
 * @param config - Routing configuration to compile
 * @returns Compiled router with regex patterns
 */
export function compileRoutingRules(config: RoutingConfig): CompiledRouter {
  const workTypeRules: CompiledWorkTypeRule[] = [];
  
  for (const rule of config.rules) {
    const patterns = generatePatterns(rule.workType, rule.examples);
    const priority = calculatePriority(rule.workType, patterns);
    
    workTypeRules.push({
      workType: rule.workType,
      agents: rule.agents,
      patterns,
      examples: rule.examples,
      confidence: rule.confidence || 'medium',
      priority
    });
  }
  
  // Sort by priority (highest first)
  workTypeRules.sort((a, b) => b.priority - a.priority);
  
  // Compile issue routing rules if present
  const issueRules = config.issueRouting?.map(compileIssueRule);
  
  return {
    workTypeRules,
    issueRules,
    governance: config.governance
  };
}

/**
 * Matches a message to routing rules.
 * 
 * @param message - User message to match
 * @param router - Compiled router
 * @returns Best routing match
 */
export function matchRoute(message: string, router: CompiledRouter): RoutingMatch {
  const lowerMessage = message.toLowerCase();
  
  // Try to match work type rules
  for (const rule of router.workTypeRules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lowerMessage)) {
        return {
          agents: rule.agents,
          confidence: rule.confidence || 'medium',
          rule,
          reason: `Matched work type: ${rule.workType}`
        };
      }
    }
  }
  
  // No match - return fallback
  return {
    agents: router.fallbackAgent ? [router.fallbackAgent] : ['@coordinator'],
    confidence: 'low',
    reason: 'No matching route found, using fallback'
  };
}

/**
 * Generates regex patterns from work type and examples.
 */
function generatePatterns(workType: string, examples?: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  
  // Create pattern from work type itself
  const typeWords = workType
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(w => w.length > 2); // Skip short words like "to", "of"
  
  if (typeWords.length > 0) {
    // Match if all type words are present
    const typePattern = new RegExp(
      typeWords.map(w => `(?=.*\\b${escapeRegex(w)})`).join(''),
      'i'
    );
    patterns.push(typePattern);
  }
  
  // Create patterns from examples
  if (examples && examples.length > 0) {
    for (const example of examples) {
      const exampleWords = example
        .toLowerCase()
        .split(/[-_\s,]+/)
        .filter(w => w.length > 2);
      
      if (exampleWords.length > 0) {
        // Match if any significant example words are present
        const examplePattern = new RegExp(
          exampleWords.map(w => `\\b${escapeRegex(w)}\\b`).join('|'),
          'i'
        );
        patterns.push(examplePattern);
      }
    }
  }
  
  return patterns;
}

/**
 * Calculates priority for a rule based on specificity.
 * Higher values = more specific = higher priority.
 */
function calculatePriority(workType: string, patterns: RegExp[]): number {
  // Base priority on work type length and pattern count
  const typeLength = workType.length;
  const patternCount = patterns.length;
  const wordCount = workType.split(/[-_\s]+/).length;
  
  // More words and longer types are more specific
  return typeLength + (wordCount * 10) + (patternCount * 5);
}

/**
 * Compiles an issue routing rule with regex patterns.
 */
function compileIssueRule(rule: IssueRoutingRule): CompiledIssueRule {
  return {
    labelPattern: new RegExp(escapeRegex(rule.label), 'i'),
    action: rule.action,
    target: rule.target,
    requiredLabels: rule.requiredLabels?.map(label => new RegExp(escapeRegex(label), 'i')),
    excludedLabels: rule.excludedLabels?.map(label => new RegExp(escapeRegex(label), 'i')),
    state: rule.state
  };
}

/**
 * Escapes special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches issue labels to routing rules.
 * 
 * @param labels - Issue labels to match
 * @param rules - Compiled issue routing rules
 * @returns Matching rule if found
 */
export function matchIssueLabels(
  labels: string[],
  rules: CompiledIssueRule[]
): CompiledIssueRule | undefined {
  for (const rule of rules) {
    // Check if primary label matches
    const primaryMatch = labels.some(label => rule.labelPattern.test(label));
    if (!primaryMatch) {
      continue;
    }
    
    // Check required labels
    if (rule.requiredLabels && rule.requiredLabels.length > 0) {
      const allRequiredPresent = rule.requiredLabels.every(pattern =>
        labels.some(label => pattern.test(label))
      );
      if (!allRequiredPresent) {
        continue;
      }
    }
    
    // Check excluded labels
    if (rule.excludedLabels && rule.excludedLabels.length > 0) {
      const anyExcludedPresent = rule.excludedLabels.some(pattern =>
        labels.some(label => pattern.test(label))
      );
      if (anyExcludedPresent) {
        continue;
      }
    }
    
    return rule;
  }
  
  return undefined;
}
