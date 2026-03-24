/**
 * Squad Configuration Loader
 * 
 * Loads and validates squad.config.ts or squad.config.json configuration files.
 * Implements the config schema design from spike #72.
 * 
 * @module runtime/config
 */

import { join, resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { MODELS } from './constants.js';
import type { AgentRole } from './constants.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

// ============================================================================
// Configuration Types (from spike #72)
// ============================================================================

/**
 * Model tier classification.
 */
export type ModelTier = 'premium' | 'standard' | 'fast';

/**
 * Model identifier from Copilot CLI.
 */
export type ModelId = string;

/**
 * Work type categories for routing.
 */
export type WorkType = 
  | 'feature-dev' 
  | 'bug-fix' 
  | 'testing' 
  | 'documentation' 
  | 'refactoring' 
  | 'architecture' 
  | 'research'
  | 'triage'
  | 'meta'
  | string; // Allow custom work types

/**
 * Agent role for model selection (re-exported from constants).
 */
export type { AgentRole } from './constants.js';

/**
 * Task output type for model selection.
 */
export type TaskOutputType = 'code' | 'text' | 'analysis' | 'decision';

/**
 * Model selection configuration (Layer 3 + Layer 4).
 */
export interface ModelSelectionConfig {
  /** Default model for new agents (Layer 4) */
  defaultModel: ModelId;
  
  /** Default tier when no specific model is chosen */
  defaultTier: ModelTier;
  
  /** Task output type → model mapping */
  taskRules?: TaskToModelRule[];
  
  /** Role → model mapping with conditions */
  roleMapping?: RoleToModelMapping[];
  
  /** Complexity-based adjustments */
  complexityAdjustments?: ComplexityAdjustment[];
  
  /** Fallback chains per tier */
  fallbackChains: {
    premium: ModelId[];
    standard: ModelId[];
    fast: ModelId[];
  };
  
  /** Prefer same provider when falling back */
  preferSameProvider?: boolean;
  
  /** Respect tier ceiling during fallback (don't upgrade to premium on standard failure) */
  respectTierCeiling?: boolean;
  
  /** Nuclear fallback configuration */
  nuclearFallback?: {
    enabled: boolean;
    model: ModelId;
    maxRetriesBeforeNuclear: number;
  };
}

/**
 * Task-to-model selection rule.
 */
export interface TaskToModelRule {
  /** Task output type */
  outputType: TaskOutputType;
  
  /** Model to use for this output type */
  model: ModelId;
  
  /** Optional conditions */
  conditions?: {
    minComplexity?: number;
    workType?: WorkType[];
  };
}

/**
 * Role-to-model mapping with override conditions.
 */
export interface RoleToModelMapping {
  /** Agent role */
  role: AgentRole;
  
  /** Default model for this role */
  model: ModelId;
  
  /** Override conditions */
  overrides?: {
    workType?: WorkType;
    model: ModelId;
  }[];
}

/**
 * Complexity-based model adjustment.
 */
export interface ComplexityAdjustment {
  /** Complexity threshold (0-10 scale) */
  threshold: number;
  
  /** Adjustment action */
  action: 'bump-tier' | 'downgrade-tier' | 'switch-to-specialist';
  
  /** Target model if action is 'switch-to-specialist' */
  targetModel?: ModelId;
}

/**
 * Routing rule: work type → agent mapping.
 */
export interface RoutingRule {
  /** Work type identifier */
  workType: WorkType;
  
  /** Agent(s) to route this work to */
  agents: string[];
  
  /** Examples to help LLM understand this work type */
  examples?: string[];
  
  /** Confidence level for LLM self-assessment */
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * Issue label-based routing rule.
 */
export interface IssueRoutingRule {
  /** Label to match */
  label: string;
  
  /** Action to take when label is present */
  action: 'assign' | 'route' | 'evaluate';
  
  /** Target agent or evaluation criteria */
  target?: string;
  
  /** Required labels (all must be present) */
  requiredLabels?: string[];
  
  /** Excluded labels (none can be present) */
  excludedLabels?: string[];
  
  /** Issue state filter */
  state?: 'open' | 'closed' | 'all';
}

/**
 * @copilot capability evaluation criteria.
 */
export interface CopilotCapabilityEvaluation {
  /** Capabilities to check */
  requiredCapabilities: string[];
  
  /** Fallback agent if @copilot cannot handle */
  fallbackAgent: string;
  
  /** Auto-route without asking if confidence is high */
  autoRouteOnHighConfidence?: boolean;
}

/**
 * Routing configuration.
 */
export interface RoutingConfig {
  /** Work type → agent routing rules */
  rules: RoutingRule[];
  
  /** Issue label → routing rules */
  issueRouting?: IssueRoutingRule[];
  
  /** @copilot capability evaluation */
  copilotEvaluation?: CopilotCapabilityEvaluation;
  
  /** Routing governance rules */
  governance?: {
    eagerByDefault?: boolean;
    scribeAutoRuns?: boolean;
    allowRecursiveSpawn?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Casting policy configuration.
 */
export interface CastingPolicy {
  /** Allowlist of fictional universes */
  allowlistUniverses?: string[];
  
  /** Capacity limits per universe */
  universeCapacity?: Record<string, number>;
  
  /** Overflow strategy when capacity is reached */
  overflowStrategy?: 'reject' | 'generic' | 'rotate';
  
  /** Universe-specific constraints */
  universeConstraints?: Record<string, {
    avoid?: string[];
    combine?: string[];
    maxPerRole?: number;
  }>;
}

/**
 * Agent source configuration (foundation for PRD 15).
 */
export interface AgentSourceConfig {
  /** Source type */
  type: 'local' | 'git' | 'npm' | 'url';
  
  /** Source location */
  location: string;
  
  /** Optional version/ref for git/npm sources */
  version?: string;
  
  /** Cache strategy */
  cache?: 'always' | 'never' | 'auto';
}

/**
 * Platform-specific overrides.
 */
export interface PlatformOverrides {
  /** VS Code-specific overrides */
  vscode?: {
    /** Disable model selection (Phase 1) */
    disableModelSelection?: boolean;
    
    /** Scribe mode (sync on VS Code, background on CLI) */
    scribeMode?: 'sync' | 'background';
    
    /** Other VS Code-specific settings */
    [key: string]: unknown;
  };
  
  /** CLI-specific overrides */
  cli?: {
    [key: string]: unknown;
  };
}

/**
 * Root Squad configuration object.
 */
export interface SquadConfig {
  /** Config schema version */
  version: string;
  
  /** Model selection configuration */
  models: ModelSelectionConfig;
  
  /** Routing configuration */
  routing: RoutingConfig;
  
  /** Casting policy configuration */
  casting?: CastingPolicy;
  
  /** Agent source configurations */
  agentSources?: AgentSourceConfig[];
  
  /** MCP integration configuration (pass-through to SDK) */
  mcp?: {
    servers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  
  /** Platform-specific overrides */
  platforms?: PlatformOverrides;
  
  /** Custom extensions */
  [key: string]: unknown;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default Squad configuration with typed defaults.
 */
export const DEFAULT_CONFIG: SquadConfig = {
  version: '1.0.0',
  models: {
    defaultModel: MODELS.DEFAULT,
    defaultTier: 'standard',
    fallbackChains: {
      premium: [...MODELS.FALLBACK_CHAINS.premium],
      standard: [...MODELS.FALLBACK_CHAINS.standard],
      fast: [...MODELS.FALLBACK_CHAINS.fast]
    },
    preferSameProvider: true,
    respectTierCeiling: true,
    nuclearFallback: {
      enabled: false,
      model: MODELS.NUCLEAR_FALLBACK,
      maxRetriesBeforeNuclear: MODELS.NUCLEAR_MAX_RETRIES
    }
  },
  routing: {
    rules: [
      {
        workType: 'feature-dev',
        agents: ['@coordinator'],
        confidence: 'high'
      }
    ],
    governance: {
      eagerByDefault: true,
      scribeAutoRuns: false,
      allowRecursiveSpawn: false
    }
  },
  casting: {
    allowlistUniverses: [
      'The Usual Suspects',
      'Breaking Bad',
      'The Wire',
      'Firefly',
      'Star Trek',
      'Lord of the Rings',
      'The Godfather',
      'Inception',
      'The Matrix',
      'Blade Runner',
      'Harry Potter',
      'Game of Thrones',
      'The Expanse',
      'Westworld',
      'Sherlock Holmes'
    ],
    overflowStrategy: 'generic',
    universeCapacity: {}
  },
  platforms: {
    vscode: {
      disableModelSelection: false,
      scribeMode: 'sync'
    }
  }
};

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Configuration load result.
 */
export interface ConfigLoadResult {
  /** Loaded configuration */
  config: SquadConfig;
  
  /** Configuration file path that was loaded (if any) */
  source?: string;
  
  /** Whether default config was used */
  isDefault: boolean;
}

/**
 * Configuration validation result.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Configuration validation error.
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public readonly errors: string[]) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Discovers Squad configuration file by walking up directory tree.
 * 
 * Search order per directory:
 * 1. squad.config.ts
 * 2. squad.config.js
 * 3. squad.config.json
 * 4. .squad/config.json
 * 
 * @param cwd - Starting directory for upward search
 * @returns Path to config file if found, undefined otherwise
 */
export function discoverConfigFile(cwd: string = process.cwd(), storage: StorageProvider = new FSStorageProvider()): string | undefined {
  let currentDir = resolve(cwd);
  const root = resolve(dirname(currentDir), '..');
  
  const configFiles = [
    'squad.config.ts',
    'squad.config.js',
    'squad.config.json',
    join('.squad', 'config.json')
  ];
  
  while (true) {
    for (const configFile of configFiles) {
      const configPath = join(currentDir, configFile);
      if (storage.existsSync(configPath)) {
        return configPath;
      }
    }
    
    // Check if we've reached the root
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir || currentDir === root) {
      break;
    }
    currentDir = parentDir;
  }
  
  return undefined;
}

/**
 * Loads Squad configuration from squad.config.ts, squad.config.js, squad.config.json, or .squad/config.json.
 * 
 * Search order:
 * 1. squad.config.ts (ESM import)
 * 2. squad.config.js (ESM import)
 * 3. squad.config.json (JSON parse)
 * 4. .squad/config.json (JSON parse)
 * 5. Walk up directory tree to find config file
 * 6. DEFAULT_CONFIG (fallback)
 * 
 * @param cwd - Working directory to search for config files
 * @returns Configuration load result with validation
 * @throws {ConfigValidationError} If config validation fails
 */
export async function loadConfig(cwd: string = process.cwd(), storage: StorageProvider = new FSStorageProvider()): Promise<ConfigLoadResult> {
  const resolvedCwd = resolve(cwd);
  
  // Try local configs first
  const localConfigs = [
    { path: join(resolvedCwd, 'squad.config.ts'), type: 'ts' as const },
    { path: join(resolvedCwd, 'squad.config.js'), type: 'js' as const },
    { path: join(resolvedCwd, 'squad.config.json'), type: 'json' as const },
    { path: join(resolvedCwd, '.squad', 'config.json'), type: 'json' as const }
  ];
  
  for (const { path: configPath, type } of localConfigs) {
    if (storage.existsSync(configPath)) {
      try {
        if (type === 'ts' || type === 'js') {
          const configUrl = pathToFileURL(configPath).href;
          const module = await import(configUrl);
          const config = module.default || module.squadConfig;
          
          if (!config) {
            throw new Error(`${configPath} must export default or named export "squadConfig"`);
          }
          
          const validated = validateConfig(config);
          return {
            config: validated,
            source: configPath,
            isDefault: false
          };
        } else {
          const content = storage.readSync(configPath);
          if (content === undefined) {
            throw new Error(`Config file not found: ${configPath}`);
          }
          const config = JSON.parse(content);
          const validated = validateConfig(config);
          
          return {
            config: validated,
            source: configPath,
            isDefault: false
          };
        }
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          throw error;
        }
        throw new Error(`Failed to load ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  // Walk up directory tree
  const discoveredPath = discoverConfigFile(dirname(resolvedCwd), storage);
  if (discoveredPath) {
    try {
      if (discoveredPath.endsWith('.ts') || discoveredPath.endsWith('.js')) {
        const configUrl = pathToFileURL(discoveredPath).href;
        const module = await import(configUrl);
        const config = module.default || module.squadConfig;
        
        if (!config) {
          throw new Error(`${discoveredPath} must export default or named export "squadConfig"`);
        }
        
        const validated = validateConfig(config);
        return {
          config: validated,
          source: discoveredPath,
          isDefault: false
        };
      } else {
        const content = storage.readSync(discoveredPath);
        if (content === undefined) {
          throw new Error(`Config file not found: ${discoveredPath}`);
        }
        const config = JSON.parse(content);
        const validated = validateConfig(config);
        
        return {
          config: validated,
          source: discoveredPath,
          isDefault: false
        };
      }
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new Error(`Failed to load ${discoveredPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Fall back to default config
  return {
    config: DEFAULT_CONFIG,
    source: undefined,
    isDefault: true
  };
}

/**
 * Validates Squad configuration schema and returns detailed result.
 * 
 * @param config - Configuration object to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfigDetailed(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: ['Config must be an object'],
      warnings
    };
  }
  
  const cfg = config as Partial<SquadConfig>;
  
  // Validate version
  if (!cfg.version || typeof cfg.version !== 'string') {
    errors.push('config.version is required and must be a string');
  }
  
  // Validate models section
  if (!cfg.models) {
    errors.push('config.models is required');
  } else {
    const models = cfg.models;
    
    if (!models.defaultModel || typeof models.defaultModel !== 'string') {
      errors.push('config.models.defaultModel is required and must be a string');
    }
    
    if (!models.defaultTier || !['premium', 'standard', 'fast'].includes(models.defaultTier)) {
      errors.push('config.models.defaultTier must be "premium", "standard", or "fast"');
    }
    
    if (!models.fallbackChains) {
      errors.push('config.models.fallbackChains is required');
    } else {
      if (!Array.isArray(models.fallbackChains.premium)) {
        errors.push('config.models.fallbackChains.premium must be an array');
      }
      if (!Array.isArray(models.fallbackChains.standard)) {
        errors.push('config.models.fallbackChains.standard must be an array');
      }
      if (!Array.isArray(models.fallbackChains.fast)) {
        errors.push('config.models.fallbackChains.fast must be an array');
      }
    }
    
    // Validate task rules if present
    if (models.taskRules) {
      if (!Array.isArray(models.taskRules)) {
        errors.push('config.models.taskRules must be an array');
      } else {
        models.taskRules.forEach((rule, idx) => {
          if (!rule.outputType || typeof rule.outputType !== 'string') {
            errors.push(`config.models.taskRules[${idx}].outputType is required`);
          }
          if (!rule.model || typeof rule.model !== 'string') {
            errors.push(`config.models.taskRules[${idx}].model is required`);
          }
        });
      }
    }
    
    // Validate role mapping if present
    if (models.roleMapping) {
      if (!Array.isArray(models.roleMapping)) {
        errors.push('config.models.roleMapping must be an array');
      } else {
        models.roleMapping.forEach((mapping, idx) => {
          if (!mapping.role || typeof mapping.role !== 'string') {
            errors.push(`config.models.roleMapping[${idx}].role is required`);
          }
          if (!mapping.model || typeof mapping.model !== 'string') {
            errors.push(`config.models.roleMapping[${idx}].model is required`);
          }
        });
      }
    }
  }
  
  // Validate routing section
  if (!cfg.routing) {
    errors.push('config.routing is required');
  } else {
    if (!Array.isArray(cfg.routing.rules)) {
      errors.push('config.routing.rules must be an array');
    } else {
      const agentNames = new Set<string>();
      cfg.routing.rules.forEach((rule, idx) => {
        if (!rule.workType || typeof rule.workType !== 'string') {
          errors.push(`config.routing.rules[${idx}].workType is required`);
        }
        if (!Array.isArray(rule.agents) || rule.agents.length === 0) {
          errors.push(`config.routing.rules[${idx}].agents must be a non-empty array`);
        } else {
          rule.agents.forEach(agent => agentNames.add(agent));
        }
      });
      
      // Check for duplicate work types
      const workTypes = new Set<string>();
      cfg.routing.rules.forEach(rule => {
        if (rule.workType) {
          if (workTypes.has(rule.workType)) {
            warnings.push(`Duplicate work type in routing rules: ${rule.workType}`);
          }
          workTypes.add(rule.workType);
        }
      });
    }
    
    // Validate issue routing if present
    if (cfg.routing.issueRouting) {
      if (!Array.isArray(cfg.routing.issueRouting)) {
        errors.push('config.routing.issueRouting must be an array');
      } else {
        cfg.routing.issueRouting.forEach((rule, idx) => {
          if (!rule.label || typeof rule.label !== 'string') {
            errors.push(`config.routing.issueRouting[${idx}].label is required`);
          }
          if (!rule.action || !['assign', 'route', 'evaluate'].includes(rule.action)) {
            errors.push(`config.routing.issueRouting[${idx}].action must be "assign", "route", or "evaluate"`);
          }
        });
      }
    }
  }
  
  // Validate agent sources if present
  if (cfg.agentSources) {
    if (!Array.isArray(cfg.agentSources)) {
      errors.push('config.agentSources must be an array');
    } else {
      cfg.agentSources.forEach((source, idx) => {
        if (!source.type || !['local', 'git', 'npm', 'url'].includes(source.type)) {
          errors.push(`config.agentSources[${idx}].type must be "local", "git", "npm", or "url"`);
        }
        if (!source.location || typeof source.location !== 'string') {
          errors.push(`config.agentSources[${idx}].location is required`);
        }
      });
    }
  }
  
  // Validate casting policy if present
  if (cfg.casting) {
    if (cfg.casting.allowlistUniverses && !Array.isArray(cfg.casting.allowlistUniverses)) {
      errors.push('config.casting.allowlistUniverses must be an array');
    }
    if (cfg.casting.overflowStrategy && !['reject', 'generic', 'rotate'].includes(cfg.casting.overflowStrategy)) {
      errors.push('config.casting.overflowStrategy must be "reject", "generic", or "rotate"');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates Squad configuration schema.
 * 
 * @param config - Configuration object to validate
 * @returns Validated configuration with defaults merged
 * @throws {ConfigValidationError} If validation fails
 */
export function validateConfig(config: unknown): SquadConfig {
  const result = validateConfigDetailed(config);
  
  if (!result.valid) {
    throw new ConfigValidationError(
      `Configuration validation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`,
      result.errors
    );
  }
  
  const cfg = config as Partial<SquadConfig>;
  
  // Merge with defaults for optional fields
  const validated: SquadConfig = {
    ...DEFAULT_CONFIG,
    ...cfg,
    models: {
      ...DEFAULT_CONFIG.models,
      ...cfg.models
    },
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...cfg.routing,
      governance: {
        ...DEFAULT_CONFIG.routing.governance,
        ...cfg.routing?.governance
      }
    },
    casting: {
      ...DEFAULT_CONFIG.casting,
      ...cfg.casting
    },
    platforms: {
      ...DEFAULT_CONFIG.platforms,
      ...cfg.platforms
    }
  };
  
  return validated;
}

/**
 * Synchronously loads Squad configuration.
 * Only supports squad.config.json (TypeScript config requires async import).
 * 
 * @param cwd - Working directory to search for config files
 * @returns Configuration load result with validation
 * @throws {ConfigValidationError} If config validation fails
 */
export function loadConfigSync(cwd: string = process.cwd(), storage: StorageProvider = new FSStorageProvider()): ConfigLoadResult {
  const resolvedCwd = resolve(cwd);
  
  // Only check squad.config.json (sync loading of .ts not supported)
  const jsonConfigPath = join(resolvedCwd, 'squad.config.json');
  if (storage.existsSync(jsonConfigPath)) {
    try {
      const content = storage.readSync(jsonConfigPath);
      if (content === undefined) {
        throw new Error(`Config file not found: ${jsonConfigPath}`);
      }
      const config = JSON.parse(content);
      const validated = validateConfig(config);
      
      return {
        config: validated,
        source: jsonConfigPath,
        isDefault: false
      };
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new Error(`Failed to load squad.config.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Fall back to default config
  return {
    config: DEFAULT_CONFIG,
    source: undefined,
    isDefault: true
  };
}
