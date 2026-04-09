/**
 * Squad Initialization Module (M2-6, PRD #98)
 * 
 * Creates new Squad projects with typed configuration.
 * Generates squad.config.ts or squad.config.json with agent definitions.
 * Scaffolds directory structure, templates, workflows, and agent files.
 * 
 * @module config/init
 */

import { join, dirname, relative as pathRelative } from 'path';
import { fileURLToPath } from 'url';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import { execFileSync } from 'node:child_process';
import { MODELS } from '../runtime/constants.js';
import type { SquadConfig, ModelSelectionConfig, RoutingConfig } from '../runtime/config.js';
import type { SubSquadDefinition } from '../streams/types.js';
import { ENGINEERING_ROLE_IDS } from '../roles/catalog.js';
import { getRoleById } from '../roles/index.js';

// ============================================================================
// Manifest-Curated Skills (must stay in sync with TEMPLATE_MANIFEST in CLI)
// ============================================================================

/**
 * The curated built-in skills shipped on init.
 * Only these skills are installed — not the full templates/skills/ directory.
 */
const MANIFEST_SKILL_NAMES = [
  'squad-conventions',
  'error-recovery',
  'secret-handling',
  'git-workflow',
  'session-recovery',
  'reviewer-protocol',
  'test-discipline',
  'agent-collaboration',
] as const;

// ============================================================================
// Template Resolution
// ============================================================================

/**
 * Get the SDK templates directory path.
 */
export function getSDKTemplatesDir(storage: StorageProvider = new FSStorageProvider()): string | null {
  // Use fileURLToPath for cross-platform compatibility (handles Windows drive letters, URL encoding)
  const currentDir = dirname(fileURLToPath(import.meta.url));
  
  // Try relative to this file (in dist/)
  const distPath = join(currentDir, '../../templates');
  if (storage.existsSync(distPath)) {
    return distPath;
  }
  
  // Try relative to package root (for dev)
  const pkgPath = join(currentDir, '../../../templates');
  if (storage.existsSync(pkgPath)) {
    return pkgPath;
  }
  
  return null;
}

/**
 * Copy a directory recursively.
 */
function copyRecursiveSync(src: string, dest: string, storage: StorageProvider = new FSStorageProvider()): void {
  if (!storage.existsSync(dest)) {
    storage.mkdirSync(dest, { recursive: true });
  }
  
  for (const entry of storage.isDirectorySync(src) ? storage.listSync(src) : []) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    if (storage.isDirectorySync(srcPath)) {
      copyRecursiveSync(srcPath, destPath, storage);
    } else {
      storage.copySync(srcPath, destPath);
    }
  }
}

// ============================================================================
// Initialization Types
// ============================================================================

/**
 * Agent specification for initialization.
 */
export interface InitAgentSpec {
  /** Agent name (kebab-case) */
  name: string;
  /** Agent role identifier */
  role: string;
  /** Display name (optional, defaults to titlecased name) */
  displayName?: string;
}

/**
 * Initialization options.
 */
export interface InitOptions {
  /** Root directory for Squad team files */
  teamRoot: string;
  /** Project name */
  projectName: string;
  /** Project description (optional) */
  projectDescription?: string;
  /** Agents to create */
  agents: InitAgentSpec[];
  /** Config format (typescript or json for old format, sdk for new builder syntax, markdown for no config file) */
  configFormat?: 'typescript' | 'json' | 'sdk' | 'markdown';
  /** User name for initial history entries */
  userName?: string;
  /** Skip files that already exist (default: true) */
  skipExisting?: boolean;
  /** Include GitHub workflows (default: true) */
  includeWorkflows?: boolean;
  /** Include .squad/templates/ copy (default: true) */
  includeTemplates?: boolean;
  /** Include sample MCP config (default: true) */
  includeMcpConfig?: boolean;
  /** Project type for workflow customization */
  projectType?: 'node' | 'python' | 'go' | 'rust' | 'java' | 'csharp' | 'unknown';
  /** Version to stamp in squad.agent.md */
  version?: string;
  /** Project description prompt — stored for REPL auto-casting. */
  prompt?: string;
  /** If true, disable extraction from consult sessions (read-only consultations) */
  extractionDisabled?: boolean;
  /** Optional SubSquad definitions — generates .squad/workstreams.json when provided */
  streams?: SubSquadDefinition[];
  /** If true, use built-in base roles with useRole() in SDK config (default: false) */
  roles?: boolean;
  /** Root directory for the .github/agents/squad.agent.md file.
   *  Defaults to teamRoot. In monorepos, this should be the git root
   *  so Copilot can discover the agent file, while teamRoot stays in
   *  the subfolder where .squad/ lives. */
  agentFileRoot?: string;
  /** ADO work item configuration — used when platform is azure-devops */
  adoConfig?: {
    defaultWorkItemType?: string;
    areaPath?: string;
    iterationPath?: string;
  };
}

/**
 * Initialization result.
 */
export interface InitResult {
  /** List of created file paths (relative to teamRoot) */
  createdFiles: string[];
  /** List of skipped file paths (already existed) */
  skippedFiles: string[];
  /** Warnings for degraded operations (e.g. missing templates) */
  warnings?: string[];
  /** Configuration file path */
  configPath: string;
  /** Agent directory paths */
  agentDirs: string[];
  /** Path to squad.agent.md */
  agentFile: string;
  /** Path to .squad/ directory */
  squadDir: string;
}

// ============================================================================
// Default Agent Templates
// ============================================================================

/**
 * Default agent templates for common roles.
 */
const AGENT_TEMPLATES: Record<string, { displayName: string; description: string }> = {
  'lead': {
    displayName: 'Lead',
    description: 'Technical lead responsible for architecture, delegation, and project coordination.'
  },
  'developer': {
    displayName: 'Developer',
    description: 'Software developer focused on feature implementation and code quality.'
  },
  'tester': {
    displayName: 'Tester',
    description: 'Quality assurance specialist responsible for test coverage and validation.'
  },
  'scribe': {
    displayName: 'Scribe',
    description: 'Documentation specialist maintaining history, decisions, and technical records.'
  },
  'ralph': {
    displayName: 'Ralph',
    description: 'Persistent memory agent that maintains context across sessions.'
  },
  'fact-checker': {
    displayName: 'Fact Checker',
    description: 'Devil\'s advocate and verification agent — validates claims, detects hallucinations, and runs counter-hypotheses.'
  }
};

// ============================================================================
// Configuration Templates
// ============================================================================

/**
 * Format a readonly string array as a single-quoted TypeScript array literal.
 */
function formatModelArray(chain: readonly string[]): string {
  return `[${chain.map(m => `'${m}'`).join(', ')}]`;
}

/**
 * Generate TypeScript config file content.
 */
function generateTypeScriptConfig(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;
  
  return `import type { SquadConfig } from '@bradygaster/squad';

/**
 * Squad Configuration for ${projectName}
 * ${projectDescription ? `\n * ${projectDescription}` : ''}
 */
const config: SquadConfig = {
  version: '1.0.0',
  
  models: {
    defaultModel: '${MODELS.DEFAULT}',
    defaultTier: 'standard',
    fallbackChains: {
      premium: ${formatModelArray(MODELS.FALLBACK_CHAINS.premium)},
      standard: ${formatModelArray(MODELS.FALLBACK_CHAINS.standard)},
      fast: ${formatModelArray(MODELS.FALLBACK_CHAINS.fast)}
    },
    preferSameProvider: true,
    respectTierCeiling: true,
    nuclearFallback: {
      enabled: false,
      model: '${MODELS.NUCLEAR_FALLBACK}',
      maxRetriesBeforeNuclear: ${MODELS.NUCLEAR_MAX_RETRIES}
    }
  },
  
  routing: {
    rules: [
      {
        workType: 'feature-dev',
        agents: ['@${agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'bug-fix',
        agents: ['@${agents.find(a => a.role === 'developer')?.name || agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'testing',
        agents: ['@${agents.find(a => a.role === 'tester')?.name || agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'documentation',
        agents: ['@${agents.find(a => a.role === 'scribe')?.name || agents[0]?.name || 'coordinator'}'],
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
      'Firefly'
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

export default config;
`;
}

/**
 * Generate JSON config file content.
 */
function generateJsonConfig(options: InitOptions): string {
  const { agents } = options;
  
  const config: SquadConfig = {
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
          agents: [`@${agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'bug-fix',
          agents: [`@${agents.find(a => a.role === 'developer')?.name || agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'testing',
          agents: [`@${agents.find(a => a.role === 'tester')?.name || agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'documentation',
          agents: [`@${agents.find(a => a.role === 'scribe')?.name || agents[0]?.name || 'coordinator'}`],
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
        'Firefly'
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
  
  return JSON.stringify(config, null, 2);
}

/**
 * Generate SDK builder config file content (new defineSquad() format).
 */
function generateSDKBuilderConfig(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;
  
  // Generate imports
  let code = `import {\n  defineSquad,\n  defineTeam,\n  defineAgent,\n} from '@bradygaster/squad-sdk';\n\n`;
  
  code += `/**\n * Squad Configuration — ${projectName}\n`;
  if (projectDescription) {
    code += ` *\n * ${projectDescription}\n`;
  }
  code += ` */\n`;
  
  // Generate agent definitions
  for (const agent of agents) {
    const displayName = agent.displayName || titleCase(agent.name);
    code += `const ${agent.name} = defineAgent({\n`;
    code += `  name: '${agent.name}',\n`;
    code += `  role: '${agent.role}',\n`;
    code += `  description: '${displayName}',\n`;
    code += `  status: 'active',\n`;
    code += `});\n\n`;
  }
  
  // Generate squad config
  code += `export default defineSquad({\n`;
  code += `  version: '1.0.0',\n\n`;
  code += `  team: defineTeam({\n`;
  code += `    name: '${projectName}',\n`;
  if (projectDescription) {
    code += `    description: '${projectDescription.replace(/'/g, "\\'")}',\n`;
  }
  code += `    members: [${agents.map(a => `'${a.name}'`).join(', ')}],\n`;
  code += `  }),\n\n`;
  code += `  agents: [${agents.map(a => a.name).join(', ')}],\n`;
  code += `});\n`;
  
  return code;
}

/** Default starter roles used when --sdk --roles is specified. */
const SDK_ROLES_STARTER_TEAM = ['lead', 'backend', 'frontend', 'tester'];

/**
 * Generate SDK builder config using useRole() for base roles.
 *
 * Produces a squad.config.ts that imports useRole from the SDK and
 * references built-in base role definitions instead of plain
 * defineAgent() calls.
 */
function generateSDKBuilderConfigWithRoles(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;

  // Partition agents into base-role agents and non-role agents
  const roleAgents = agents.filter(a => getRoleById(a.role));
  const plainAgents = agents.filter(a => !getRoleById(a.role));

  // If caller didn't provide any base-role agents, generate a
  // starter team from the default set.
  const effectiveRoleAgents = roleAgents.length > 0
    ? roleAgents
    : SDK_ROLES_STARTER_TEAM.map(id => {
        const role = getRoleById(id)!;
        return { name: id, role: id, displayName: role.title };
      });

  const needsDefineAgent = plainAgents.length > 0;
  const needsUseRole = effectiveRoleAgents.length > 0;

  // Build import list
  const imports = ['defineSquad', 'defineTeam'];
  if (needsDefineAgent) imports.push('defineAgent');
  if (needsUseRole) imports.push('useRole');

  let code = `import {\n${imports.map(i => `  ${i},`).join('\n')}\n} from '@bradygaster/squad-sdk';\n\n`;

  code += `/**\n * Squad Configuration — ${projectName}\n`;
  if (projectDescription) {
    code += ` *\n * ${projectDescription}\n`;
  }
  code += ` *\n * Uses built-in base roles from the role catalog.\n`;
  code += ` * Customize names and overrides for your project.\n`;
  code += ` */\n\n`;

  // Generate useRole() definitions
  for (const agent of effectiveRoleAgents) {
    const varName = agent.name.replace(/-/g, '_');
    code += `const ${varName} = useRole('${agent.role}', {\n`;
    code += `  name: '${agent.name}',\n`;
    code += `});\n\n`;
  }

  // Generate plain defineAgent() definitions (for system agents like scribe/ralph)
  for (const agent of plainAgents) {
    const displayName = agent.displayName || titleCase(agent.name);
    code += `const ${agent.name} = defineAgent({\n`;
    code += `  name: '${agent.name}',\n`;
    code += `  role: '${agent.role}',\n`;
    code += `  description: '${displayName}',\n`;
    code += `  status: 'active',\n`;
    code += `});\n\n`;
  }

  // All agent variable names in order
  const allVarNames = [
    ...effectiveRoleAgents.map(a => a.name.replace(/-/g, '_')),
    ...plainAgents.map(a => a.name),
  ];
  const allNames = [
    ...effectiveRoleAgents.map(a => `'${a.name}'`),
    ...plainAgents.map(a => `'${a.name}'`),
  ];

  code += `export default defineSquad({\n`;
  code += `  version: '1.0.0',\n\n`;
  code += `  team: defineTeam({\n`;
  code += `    name: '${projectName}',\n`;
  if (projectDescription) {
    code += `    description: '${projectDescription.replace(/'/g, "\\'")}',\n`;
  }
  code += `    members: [${allNames.join(', ')}],\n`;
  code += `  }),\n\n`;
  code += `  agents: [${allVarNames.join(', ')}],\n`;
  code += `});\n`;

  return code;
}

// ============================================================================
// Agent Template Generation
// ============================================================================

/**
 * Generate charter.md content for an agent.
 */
function generateCharter(agent: InitAgentSpec, projectName: string, projectDescription?: string): string {
  const template = AGENT_TEMPLATES[agent.role];
  const displayName = agent.displayName || template?.displayName || titleCase(agent.name);
  const description = template?.description || 'Team member focused on their assigned responsibilities.';
  
  return `# ${displayName} — ${titleCase(agent.role)}

${description}

## Project Context

**Project:** ${projectName}
${projectDescription ? `**Description:** ${projectDescription}\n` : ''}

## Responsibilities

- Collaborate with team members on assigned work
- Maintain code quality and project standards
- Document decisions and progress in history

## Work Style

- Read project context and team decisions before starting work
- Communicate clearly with team members
- Follow established patterns and conventions
`;
}

/**
 * Generate initial history.md content for an agent.
 */
function generateInitialHistory(
  agent: InitAgentSpec,
  projectName: string,
  projectDescription?: string,
  userName?: string
): string {
  const displayName = agent.displayName || AGENT_TEMPLATES[agent.role]?.displayName || titleCase(agent.name);
  const now = new Date().toISOString().split('T')[0];
  
  return `# Project Context

${userName ? `- **Owner:** ${userName}\n` : ''}- **Project:** ${projectName}
${projectDescription ? `- **Description:** ${projectDescription}\n` : ''}- **Created:** ${now}

## Core Context

Agent ${displayName} initialized and ready for work.

## Recent Updates

📌 Team initialized on ${now}

## Learnings

Initial setup complete.
`;
}

/**
 * Convert kebab-case or snake_case to Title Case.
 */
function titleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// Initialization Functions
// ============================================================================

/**
 * Stamp version into squad.agent.md content.
 * Replaces three locations: HTML comment, Identity Version line, and {version} placeholder.
 */
function stampVersionInContent(content: string, version: string): string {
  // HTML comment: <!-- version: X.Y.Z -->
  content = content.replace(
    /<!-- version: [^>]* -->/,
    `<!-- version: ${version} -->`
  );
  // Identity section: - **Version:** X.Y.Z
  content = content.replace(
    /- \*\*Version:\*\* [0-9.]+(?:-[a-z]+(?:\.\d+)?)?/m,
    `- **Version:** ${version}`
  );
  // Greeting placeholder: `Squad v{version}`
  content = content.replace(
    /`Squad v\{version\}`/g,
    `\`Squad v${version}\``
  );
  return content;
}

/**
 * Initialize a new Squad project.
 * 
 * Creates:
 * - .squad/ directory structure (agents, casting, decisions, skills, identity, etc.)
 * - squad.config.ts or squad.config.json
 * - Agent directories with charter.md and history.md
 * - .gitattributes for merge drivers
 * - .gitignore entries for logs
 * - .github/agents/squad.agent.md
 * - .github/workflows/ (optional)
 * - .squad/templates/ (optional)
 * - .copilot/mcp-config.json (optional)
 * - Identity files (now.md, wisdom.md)
 * - ceremonies.md
 * 
 * @param options - Initialization options
 * @returns Result with created file paths
 */

/**
 * Workflow files that are part of the Squad framework and should always be installed.
 * Other workflows in templates/workflows/ are generic CI/CD scaffolding and are opt-in.
 */
const FRAMEWORK_WORKFLOWS = [
  'squad-heartbeat.yml',
  'squad-issue-assign.yml',
  'squad-triage.yml',
  'sync-squad-labels.yml',
];

export async function initSquad(options: InitOptions, storage: StorageProvider = new FSStorageProvider()): Promise<InitResult> {
  const {
    teamRoot,
    projectName,
    projectDescription,
    agents,
    configFormat = 'typescript',
    userName,
    skipExisting = true,
    includeWorkflows = true,
    includeTemplates = true,
    includeMcpConfig = true,
    projectType = 'unknown',
    version = '0.0.0',
  } = options;
  
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];
  const warnings: string[] = [];
  const agentDirs: string[] = [];
  
  // Validate inputs
  if (!teamRoot) {
    throw new Error('teamRoot is required');
  }
  if (!projectName) {
    throw new Error('projectName is required');
  }
  if (!agents || agents.length === 0) {
    throw new Error('At least one agent is required');
  }
  
  // Get templates directory
  const templatesDir = getSDKTemplatesDir();
  
  // Helper to convert absolute path to relative
  const toRelativePath = (absolutePath: string): string => {
    // Use path.relative for correct cross-root handling (monorepo: agentFileRoot != teamRoot)
    const rel = pathRelative(teamRoot, absolutePath);
    // path.relative returns '' for same path, use '.' instead
    return rel || '.';
  };

  // Helper to write file (respects skipExisting)
  const writeIfNotExists = async (filePath: string, content: string): Promise<boolean> => {
    if (storage.existsSync(filePath) && skipExisting) {
      skippedFiles.push(toRelativePath(filePath));
      return false;
    }
    await storage.write(filePath, content);
    createdFiles.push(toRelativePath(filePath));
    return true;
  };
  
  // Helper to copy file (respects skipExisting)
  const copyIfNotExists = async (src: string, dest: string): Promise<boolean> => {
    if (storage.existsSync(dest) && skipExisting) {
      skippedFiles.push(toRelativePath(dest));
      return false;
    }
    await storage.mkdir(dirname(dest), { recursive: true });
    storage.copySync(src, dest);
    createdFiles.push(toRelativePath(dest));
    return true;
  };
  
  // -------------------------------------------------------------------------
  // Create .squad/ directory structure
  // -------------------------------------------------------------------------
  
  const squadDir = join(teamRoot, '.squad');
  const directories = [
    join(squadDir, 'agents'),
    join(squadDir, 'casting'),
    join(squadDir, 'decisions'),
    join(squadDir, 'decisions', 'inbox'),
    join(teamRoot, '.copilot', 'skills'),
    join(squadDir, 'plugins'),
    join(squadDir, 'identity'),
    join(squadDir, 'orchestration-log'),
    join(squadDir, 'log'),
    join(squadDir, '.scratch'),
  ];
  
  for (const dir of directories) {
    if (!storage.existsSync(dir)) {
      await storage.mkdir(dir, { recursive: true });
    }
  }
  
  // -------------------------------------------------------------------------
  // Scaffold .squad/casting/ files (policy, registry, history)
  // -------------------------------------------------------------------------

  const castingDir = join(squadDir, 'casting');
  const castingFiles: Array<{ name: string; templateName: string; fallback: string }> = [
    { name: 'policy.json', templateName: 'casting-policy.json', fallback: JSON.stringify({ casting_policy_version: '1.1', allowlist_universes: [], universe_capacity: {} }, null, 2) + '\n' },
    { name: 'registry.json', templateName: 'casting-registry.json', fallback: JSON.stringify({ agents: {} }, null, 2) + '\n' },
    { name: 'history.json', templateName: 'casting-history.json', fallback: JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} }, null, 2) + '\n' },
  ];

  for (const cf of castingFiles) {
    const dest = join(castingDir, cf.name);
    if (!storage.existsSync(dest)) {
      // Try to copy from SDK templates first, fall back to inline defaults
      const templateSrc = templatesDir ? join(templatesDir, cf.templateName) : null;
      if (templateSrc && storage.existsSync(templateSrc)) {
        storage.copySync(templateSrc, dest);
      } else {
        await storage.write(dest, cf.fallback);
      }
      createdFiles.push(toRelativePath(dest));
    } else {
      skippedFiles.push(toRelativePath(dest));
    }
  }

  // -------------------------------------------------------------------------
  // Create .squad/config.json for squad settings
  // -------------------------------------------------------------------------
  
  const squadConfigPath = join(squadDir, 'config.json');
  if (!storage.existsSync(squadConfigPath)) {
    // Detect platform from git remote for config
    let detectedPlatform: string | undefined;
    try {
      const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const remoteUrlLower = remoteUrl.toLowerCase();
      if (remoteUrlLower.includes('dev.azure.com') || remoteUrlLower.includes('visualstudio.com') || remoteUrlLower.includes('ssh.dev.azure.com')) {
        detectedPlatform = 'azure-devops';
      }
    } catch {
      // No git remote — skip platform detection
    }
    const squadConfig: Record<string, unknown> = {
      version: 1,
    };
    if (detectedPlatform) {
      squadConfig.platform = detectedPlatform;
    }
    if (detectedPlatform === 'azure-devops') {
      // ADO work item defaults — attempt to introspect the process template
      // to discover available work item types for the project.
      let introspectedTypes: string[] | undefined;
      try {
        const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        // Parse org/project from remote URL for introspection
        const httpsMatch = remoteUrl.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git/i);
        const sshMatch = remoteUrl.match(/ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\//i);
        const vsMatch = remoteUrl.match(/([^/.]+)\.visualstudio\.com\/([^/]+)\/_git/i);
        const parsed = httpsMatch ?? sshMatch ?? vsMatch;
        if (parsed && parsed[1] && parsed[2]) {
          const { getAvailableWorkItemTypes } = await import('../platform/azure-devops.js');
          const types = getAvailableWorkItemTypes(parsed[1], parsed[2]);
          const enabled = types.filter((t) => !t.disabled).map((t) => t.name);
          if (enabled.length > 0) {
            introspectedTypes = enabled;
          }
        }
      } catch {
        // Introspection failed — skip and use commented-out defaults
      }

      // Build the ADO config section: explicit options > introspected > commented defaults
      const adoSection: Record<string, unknown> = {};
      if (options.adoConfig?.defaultWorkItemType) {
        adoSection.defaultWorkItemType = options.adoConfig.defaultWorkItemType;
      }
      if (options.adoConfig?.areaPath) {
        adoSection.areaPath = options.adoConfig.areaPath;
      }
      if (options.adoConfig?.iterationPath) {
        adoSection.iterationPath = options.adoConfig.iterationPath;
      }

      squadConfig.ado = adoSection;

      // If introspection found types, store them so the user knows what's available
      if (introspectedTypes?.length) {
        adoSection._availableTypes = introspectedTypes;
      }
    }
    // Only include extractionDisabled if explicitly set
    if (options.extractionDisabled) {
      squadConfig.extractionDisabled = true;
    }
    await storage.write(squadConfigPath, JSON.stringify(squadConfig, null, 2));
    createdFiles.push(toRelativePath(squadConfigPath));
  }
  
  // -------------------------------------------------------------------------
  // Create configuration file
  // -------------------------------------------------------------------------
  
  // When configFormat is 'markdown', skip config file generation entirely
  let configPath: string;
  if (configFormat !== 'markdown') {
    const configFileName = configFormat === 'sdk' ? 'squad.config.ts' : 
                           configFormat === 'typescript' ? 'squad.config.ts' : 'squad.config.json';
    configPath = join(teamRoot, configFileName);
    const configContent = (configFormat === 'sdk' && options.roles) ? generateSDKBuilderConfigWithRoles(options) :
                          configFormat === 'sdk' ? generateSDKBuilderConfig(options) :
                          configFormat === 'typescript' ? generateTypeScriptConfig(options) :
                          generateJsonConfig(options);
    
    await writeIfNotExists(configPath, configContent);
  } else {
    // No config file for markdown-only mode
    configPath = '';
  }
  
  // -------------------------------------------------------------------------
  // Create agent directories and files
  // -------------------------------------------------------------------------
  
  const agentsDir = join(squadDir, 'agents');
  for (const agent of agents) {
    const agentDir = join(agentsDir, agent.name);
    agentDirs.push(agentDir);
    
    // Create charter.md
    const charterPath = join(agentDir, 'charter.md');
    const charterContent = generateCharter(agent, projectName, projectDescription);
    await writeIfNotExists(charterPath, charterContent);
    
    // Create history.md
    const historyPath = join(agentDir, 'history.md');
    const historyContent = generateInitialHistory(agent, projectName, projectDescription, userName);
    await writeIfNotExists(historyPath, historyContent);
  }
  
  // -------------------------------------------------------------------------
  // Create identity files (now.md, wisdom.md)
  // -------------------------------------------------------------------------
  
  const identityDir = join(squadDir, 'identity');
  const nowMdPath = join(identityDir, 'now.md');
  const wisdomMdPath = join(identityDir, 'wisdom.md');
  
  const nowContent = `---
updated_at: ${new Date().toISOString()}
focus_area: Initial setup
active_issues: []
---

# What We're Focused On

Getting started. Updated by coordinator at session start.
`;
  
  const wisdomContent = `---
last_updated: ${new Date().toISOString()}
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->
`;
  
  await writeIfNotExists(nowMdPath, nowContent);
  await writeIfNotExists(wisdomMdPath, wisdomContent);
  
  // -------------------------------------------------------------------------
  // Create ceremonies.md
  // -------------------------------------------------------------------------
  
  const ceremoniesDest = join(squadDir, 'ceremonies.md');
  if (templatesDir && storage.existsSync(join(templatesDir, 'ceremonies.md'))) {
    await copyIfNotExists(join(templatesDir, 'ceremonies.md'), ceremoniesDest);
  }
  
  // -------------------------------------------------------------------------
  // Create decisions.md (canonical location at squad root)
  // -------------------------------------------------------------------------
  
  const decisionsPath = join(squadDir, 'decisions.md');
  const decisionsContent = `# Squad Decisions

## Active Decisions

No decisions recorded yet.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
`;
  
  await writeIfNotExists(decisionsPath, decisionsContent);
  
  // -------------------------------------------------------------------------
  // Create team.md (required by shell lifecycle)
  // -------------------------------------------------------------------------
  
  const teamPath = join(squadDir, 'team.md');
  const teamContent = `# Squad Team

> ${projectDescription || projectName}

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|

## Project Context

- **Project:** ${projectName}
${projectDescription ? `- **Description:** ${projectDescription}\n` : ''}- **Created:** ${new Date().toISOString().split('T')[0]}
`;

  await writeIfNotExists(teamPath, teamContent);
  
  // -------------------------------------------------------------------------
  // Create routing.md
  // -------------------------------------------------------------------------
  
  const routingPath = join(squadDir, 'routing.md');
  if (templatesDir && storage.existsSync(join(templatesDir, 'routing.md'))) {
    await copyIfNotExists(join(templatesDir, 'routing.md'), routingPath);
  } else {
    const routingContent = `# Squad Routing

## Work Type Rules

| Work Type | Primary Agent | Fallback |
|-----------|---------------|----------|

## Governance

- Route based on work type and agent expertise
- Update this file as team capabilities evolve
`;
    await writeIfNotExists(routingPath, routingContent);
  }
  
  // -------------------------------------------------------------------------
  // Copy starter skills
  // -------------------------------------------------------------------------
  
  const skillsDir = join(teamRoot, '.copilot', 'skills');
  if (templatesDir && storage.existsSync(join(templatesDir, 'skills'))) {
    const skillsSrc = join(templatesDir, 'skills');
    const existingSkills = storage.existsSync(skillsDir) ? storage.listSync(skillsDir) : [];
    if (existingSkills.length === 0) {
      storage.mkdirSync(skillsDir, { recursive: true });
      for (const skillName of MANIFEST_SKILL_NAMES) {
        const srcSkill = join(skillsSrc, skillName);
        if (storage.existsSync(srcSkill)) {
          copyRecursiveSync(srcSkill, join(skillsDir, skillName), storage);
        }
      }
      createdFiles.push('.copilot/skills');
    }
  }
  
  // -------------------------------------------------------------------------
  // Create .gitattributes for merge drivers
  // -------------------------------------------------------------------------
  
  const gitattributesPath = join(teamRoot, '.gitattributes');
  const unionRules = [
    '.squad/decisions.md merge=union',
    '.squad/agents/*/history.md merge=union',
    '.squad/log/** merge=union',
    '.squad/orchestration-log/** merge=union',
  ];
  
  let existingAttrs = '';
  if (storage.existsSync(gitattributesPath)) {
    existingAttrs = storage.readSync(gitattributesPath) ?? '';
  }
  
  const missingRules = unionRules.filter(rule => !existingAttrs.includes(rule));
  if (missingRules.length > 0) {
    const block = (existingAttrs && !existingAttrs.endsWith('\n') ? '\n' : '')
      + '# Squad: union merge for append-only team state files\n'
      + missingRules.join('\n') + '\n';
    await storage.append(gitattributesPath, block);
    createdFiles.push(toRelativePath(gitattributesPath));
  }
  
  // -------------------------------------------------------------------------
  // Create .gitignore entries for runtime state (logs, inbox, sessions)
  // These paths are written during normal squad operation but should not be
  // committed to version control (they are runtime state).
  // -------------------------------------------------------------------------
  
  const gitignorePath = join(teamRoot, '.gitignore');
  const ignoreEntries = [
    '.squad/orchestration-log/',
    '.squad/log/',
    '.squad/decisions/inbox/',
    '.squad/sessions/',
    '.squad/.scratch/',
  ];
  
  let existingIgnore = '';
  if (storage.existsSync(gitignorePath)) {
    existingIgnore = storage.readSync(gitignorePath) ?? '';
  }
  
  const missingIgnore = ignoreEntries.filter(entry => !existingIgnore.includes(entry));
  if (missingIgnore.length > 0) {
    const block = (existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '')
      + '# Squad: ignore runtime state (logs, inbox, sessions)\n'
      + missingIgnore.join('\n') + '\n';
    await storage.append(gitignorePath, block);
    createdFiles.push(toRelativePath(gitignorePath));
  }
  
  // -------------------------------------------------------------------------
  // Create .github/agents/squad.agent.md
  // -------------------------------------------------------------------------
  
  const agentFile = join(options.agentFileRoot ?? teamRoot, '.github', 'agents', 'squad.agent.md');
  if (!storage.existsSync(agentFile) || !skipExisting) {
    if (templatesDir && storage.existsSync(join(templatesDir, 'squad.agent.md.template'))) {
      let agentContent = storage.readSync(join(templatesDir, 'squad.agent.md.template')) ?? '';
      agentContent = stampVersionInContent(agentContent, version);
      await storage.write(agentFile, agentContent);
      createdFiles.push(toRelativePath(agentFile));
    } else {
      warnings.push(`squad.agent.md template not found (${join(templatesDir || '.squad/templates', 'squad.agent.md.template')}) — Copilot agent file was not created or not refreshed`);
    }
  } else {
    skippedFiles.push(toRelativePath(agentFile));
  }
  
  // -------------------------------------------------------------------------
  // Copy .squad/templates/ (optional)
  // -------------------------------------------------------------------------
  
  if (includeTemplates && templatesDir) {
    const templatesDest = join(teamRoot, '.squad', 'templates');
    if (!storage.existsSync(templatesDest)) {
      copyRecursiveSync(templatesDir, templatesDest, storage);
      createdFiles.push(toRelativePath(templatesDest));
    } else {
      skippedFiles.push(toRelativePath(templatesDest));
    }
  }
  
  // -------------------------------------------------------------------------
  // Detect platform from git remote
  // -------------------------------------------------------------------------
  
  let isGitHub = true;
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const remoteUrlLower = remoteUrl.toLowerCase();
    if (remoteUrlLower.includes('dev.azure.com') || remoteUrlLower.includes('visualstudio.com') || remoteUrlLower.includes('ssh.dev.azure.com')) {
      isGitHub = false;
    }
  } catch {
    // No git remote — assume GitHub (default)
  }

  // -------------------------------------------------------------------------
  // Copy workflows (optional) — skip for ADO repos
  // -------------------------------------------------------------------------
  
  if (includeWorkflows && isGitHub && templatesDir && storage.existsSync(join(templatesDir, 'workflows'))) {
    // In monorepo mode (agentFileRoot != teamRoot), skip workflow placement.
    // GitHub Actions only reads from <repo-root>/.github/workflows/ — placing
    // workflows in a subfolder has no effect. Multiple squads in one monorepo
    // would also conflict on the same workflow files. (#939)
    const isMonorepoSubfolder = options.agentFileRoot && options.agentFileRoot !== teamRoot;
    if (isMonorepoSubfolder) {
      warnings.push('Skipped GitHub Actions workflows in monorepo-subfolder mode — workflows must be at the git root. Set up workflows manually or use a single shared workflow for all squads.');
    } else {
    const workflowsSrc = join(templatesDir, 'workflows');
    const workflowsDest = join(teamRoot, '.github', 'workflows');
    
    if (storage.isDirectorySync(workflowsSrc)) {
      const allWorkflowFiles = storage.listSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      const workflowFiles = allWorkflowFiles.filter(f => FRAMEWORK_WORKFLOWS.includes(f));
      await storage.mkdir(workflowsDest, { recursive: true });
      
      for (const file of workflowFiles) {
        const destFile = join(workflowsDest, file);
        if (!storage.existsSync(destFile) || !skipExisting) {
          storage.copySync(join(workflowsSrc, file), destFile);
          createdFiles.push(toRelativePath(destFile));
        } else {
          skippedFiles.push(toRelativePath(destFile));
        }
      }
    }
    }
  }
  
  // -------------------------------------------------------------------------
  // Create sample MCP config (optional)
  // -------------------------------------------------------------------------
  
  if (includeMcpConfig) {
    const mcpConfigPath = join(teamRoot, '.copilot', 'mcp-config.json');
    if (!storage.existsSync(mcpConfigPath)) {
      const mcpSample = isGitHub
        ? {
            mcpServers: {
              "EXAMPLE-github": {
                command: "npx",
                args: ["-y", "@anthropic/github-mcp-server"],
                env: {
                  GITHUB_TOKEN: "${GITHUB_TOKEN}"
                }
              }
            }
          }
        : {
            mcpServers: {
              "EXAMPLE-azure-devops": {
                command: "npx",
                args: ["-y", "@azure/devops-mcp-server"],
                env: {
                  AZURE_DEVOPS_ORG: "${AZURE_DEVOPS_ORG}",
                  AZURE_DEVOPS_PAT: "${AZURE_DEVOPS_PAT}"
                }
              }
            }
          };
      await storage.write(mcpConfigPath, JSON.stringify(mcpSample, null, 2) + '\n');
      createdFiles.push(toRelativePath(mcpConfigPath));
    } else {
      skippedFiles.push(toRelativePath(mcpConfigPath));
    }
  }
  
  // -------------------------------------------------------------------------
  // Generate .squad/workstreams.json (when SubSquads provided)
  // -------------------------------------------------------------------------

  if (options.streams && options.streams.length > 0) {
    const subsquadsConfig = {
      workstreams: options.streams,
      defaultWorkflow: 'branch-per-issue',
    };
    const workstreamsPath = join(squadDir, 'workstreams.json');
    await writeIfNotExists(workstreamsPath, JSON.stringify(subsquadsConfig, null, 2) + '\n');
  }

  // -------------------------------------------------------------------------
  // Add .squad-workstream to .gitignore (SubSquad activation file)
  // -------------------------------------------------------------------------

  {
    const workstreamIgnoreEntry = '.squad-workstream';
    let currentIgnore = '';
    if (storage.existsSync(gitignorePath)) {
      currentIgnore = storage.readSync(gitignorePath) ?? '';
    }
    if (!currentIgnore.includes(workstreamIgnoreEntry)) {
      const block = (currentIgnore && !currentIgnore.endsWith('\n') ? '\n' : '')
        + '# Squad: SubSquad activation file (local to this machine)\n'
        + workstreamIgnoreEntry + '\n';
      await storage.append(gitignorePath, block);
      createdFiles.push(toRelativePath(gitignorePath));
    }
  }

  // -------------------------------------------------------------------------
  // Create .first-run marker
  // -------------------------------------------------------------------------
  
  const firstRunMarker = join(squadDir, '.first-run');
  if (!storage.existsSync(firstRunMarker)) {
    await storage.write(firstRunMarker, new Date().toISOString() + '\n');
    createdFiles.push(toRelativePath(firstRunMarker));
  }
  
  // -------------------------------------------------------------------------
  // Store init prompt for REPL auto-casting
  // -------------------------------------------------------------------------
  
  if (options.prompt) {
    const promptFile = join(squadDir, '.init-prompt');
    await storage.write(promptFile, options.prompt);
    createdFiles.push(toRelativePath(promptFile));
  }
  
  return {
    createdFiles,
    skippedFiles,
    warnings,
    configPath,
    agentDirs,
    agentFile,
    squadDir,
  };
}

/**
 * Clean up orphan .init-prompt file.
 * Called by CLI on Ctrl+C abort to remove partial state.
 * 
 * @param squadDir - Path to the .squad directory
 */
export async function cleanupOrphanInitPrompt(squadDir: string, storage: StorageProvider = new FSStorageProvider()): Promise<void> {
  const promptFile = join(squadDir, '.init-prompt');
  if (storage.existsSync(promptFile)) {
    await storage.delete(promptFile);
  }
}
