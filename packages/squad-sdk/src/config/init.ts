/**
 * Squad Initialization Module (M2-6, PRD #98)
 * 
 * Creates new Squad projects with typed configuration.
 * Generates squad.config.ts or squad.config.json with agent definitions.
 * Scaffolds directory structure, templates, workflows, and agent files.
 * 
 * @module config/init
 */

import { mkdir, writeFile, readFile, copyFile, readdir, appendFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, cpSync, statSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { execFileSync } from 'node:child_process';
import { MODELS } from '../runtime/constants.js';
import type { SquadConfig, ModelSelectionConfig, RoutingConfig } from '../runtime/config.js';

// ============================================================================
// Template Resolution
// ============================================================================

/**
 * Get the SDK templates directory path.
 */
export function getSDKTemplatesDir(): string | null {
  // Use fileURLToPath for cross-platform compatibility (handles Windows drive letters, URL encoding)
  const currentDir = dirname(fileURLToPath(import.meta.url));
  
  // Try relative to this file (in dist/)
  const distPath = join(currentDir, '../../templates');
  if (existsSync(distPath)) {
    return distPath;
  }
  
  // Try relative to package root (for dev)
  const pkgPath = join(currentDir, '../../../templates');
  if (existsSync(pkgPath)) {
    return pkgPath;
  }
  
  return null;
}

/**
 * Copy a directory recursively.
 */
function copyRecursiveSync(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  for (const entry of statSync(src).isDirectory() ? readdirSync(src) : []) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    if (statSync(srcPath).isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
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
  /** Config format (typescript or json) */
  configFormat?: 'typescript' | 'json';
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
}

/**
 * Initialization result.
 */
export interface InitResult {
  /** List of created file paths (relative to teamRoot) */
  createdFiles: string[];
  /** List of skipped file paths (already existed) */
  skippedFiles: string[];
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
 */
function stampVersionInContent(content: string, version: string): string {
  return content.replace(
    /<!-- version: [^>]* -->/,
    `<!-- version: ${version} -->`
  );
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
export async function initSquad(options: InitOptions): Promise<InitResult> {
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
    // Use path separator-agnostic approach
    if (absolutePath.startsWith(teamRoot)) {
      const relative = absolutePath.slice(teamRoot.length);
      // Remove leading separator if present
      return relative.startsWith('/') || relative.startsWith('\\') 
        ? relative.slice(1) 
        : relative;
    }
    return absolutePath;
  };

  // Helper to write file (respects skipExisting)
  const writeIfNotExists = async (filePath: string, content: string): Promise<boolean> => {
    if (existsSync(filePath) && skipExisting) {
      skippedFiles.push(toRelativePath(filePath));
      return false;
    }
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    createdFiles.push(toRelativePath(filePath));
    return true;
  };
  
  // Helper to copy file (respects skipExisting)
  const copyIfNotExists = async (src: string, dest: string): Promise<boolean> => {
    if (existsSync(dest) && skipExisting) {
      skippedFiles.push(toRelativePath(dest));
      return false;
    }
    await mkdir(dirname(dest), { recursive: true });
    cpSync(src, dest);
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
    join(squadDir, 'skills'),
    join(squadDir, 'plugins'),
    join(squadDir, 'identity'),
    join(squadDir, 'orchestration-log'),
    join(squadDir, 'log'),
  ];
  
  for (const dir of directories) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
  
  // -------------------------------------------------------------------------
  // Create .squad/config.json for squad settings
  // -------------------------------------------------------------------------
  
  const squadConfigPath = join(squadDir, 'config.json');
  if (!existsSync(squadConfigPath)) {
    // Detect platform from git remote for config
    let detectedPlatform: string | undefined;
    try {
      const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8' }).trim();
      if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com') || remoteUrl.includes('ssh.dev.azure.com')) {
        detectedPlatform = 'azure-devops';
      }
    } catch {
      // No git remote — skip platform detection
    }
    const squadConfig: Record<string, unknown> = {
      version: 1,
      teamRoot: teamRoot,
    };
    if (detectedPlatform) {
      squadConfig.platform = detectedPlatform;
    }
    if (detectedPlatform === 'azure-devops') {
      // ADO work item defaults — users can customize these:
      // - org/project: set when work items live in a different project than the repo
      // - defaultWorkItemType: "User Story", "Scenario", "Bug", etc.
      // - areaPath: e.g. "MyProject\\Team A" (backslash-separated)
      // - iterationPath: e.g. "MyProject\\Sprint 1"
      squadConfig.ado = {
        // org: "my-org",           // uncomment if work items are in a different org
        // project: "my-project",   // uncomment if work items are in a different project
        // defaultWorkItemType: "User Story",
        // areaPath: "",
        // iterationPath: "",
      };
    }
    // Only include extractionDisabled if explicitly set
    if (options.extractionDisabled) {
      squadConfig.extractionDisabled = true;
    }
    await writeFile(squadConfigPath, JSON.stringify(squadConfig, null, 2), 'utf-8');
    createdFiles.push(toRelativePath(squadConfigPath));
  }
  
  // -------------------------------------------------------------------------
  // Create configuration file
  // -------------------------------------------------------------------------
  
  const configFileName = configFormat === 'typescript' ? 'squad.config.ts' : 'squad.config.json';
  const configPath = join(teamRoot, configFileName);
  const configContent = configFormat === 'typescript'
    ? generateTypeScriptConfig(options)
    : generateJsonConfig(options);
  
  await writeIfNotExists(configPath, configContent);
  
  // -------------------------------------------------------------------------
  // Create agent directories and files
  // -------------------------------------------------------------------------
  
  const agentsDir = join(squadDir, 'agents');
  for (const agent of agents) {
    const agentDir = join(agentsDir, agent.name);
    await mkdir(agentDir, { recursive: true });
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
  if (templatesDir && existsSync(join(templatesDir, 'ceremonies.md'))) {
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
  if (templatesDir && existsSync(join(templatesDir, 'routing.md'))) {
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
  
  const skillsDir = join(squadDir, 'skills');
  if (templatesDir && existsSync(join(templatesDir, 'skills'))) {
    const skillsSrc = join(templatesDir, 'skills');
    const existingSkills = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
    if (existingSkills.length === 0) {
      cpSync(skillsSrc, skillsDir, { recursive: true });
      createdFiles.push('.squad/skills');
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
  if (existsSync(gitattributesPath)) {
    existingAttrs = readFileSync(gitattributesPath, 'utf-8');
  }
  
  const missingRules = unionRules.filter(rule => !existingAttrs.includes(rule));
  if (missingRules.length > 0) {
    const block = (existingAttrs && !existingAttrs.endsWith('\n') ? '\n' : '')
      + '# Squad: union merge for append-only team state files\n'
      + missingRules.join('\n') + '\n';
    await appendFile(gitattributesPath, block);
    createdFiles.push(toRelativePath(gitattributesPath));
  }
  
  // -------------------------------------------------------------------------
  // Create .gitignore entries for logs
  // -------------------------------------------------------------------------
  
  const gitignorePath = join(teamRoot, '.gitignore');
  const ignoreEntries = [
    '.squad/orchestration-log/',
    '.squad/log/',
  ];
  
  let existingIgnore = '';
  if (existsSync(gitignorePath)) {
    existingIgnore = readFileSync(gitignorePath, 'utf-8');
  }
  
  const missingIgnore = ignoreEntries.filter(entry => !existingIgnore.includes(entry));
  if (missingIgnore.length > 0) {
    const block = (existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '')
      + '# Squad: ignore generated logs\n'
      + missingIgnore.join('\n') + '\n';
    await appendFile(gitignorePath, block);
    createdFiles.push(toRelativePath(gitignorePath));
  }
  
  // -------------------------------------------------------------------------
  // Create .github/agents/squad.agent.md
  // -------------------------------------------------------------------------
  
  const agentFile = join(teamRoot, '.github', 'agents', 'squad.agent.md');
  if (!existsSync(agentFile) || !skipExisting) {
    if (templatesDir && existsSync(join(templatesDir, 'squad.agent.md'))) {
      let agentContent = readFileSync(join(templatesDir, 'squad.agent.md'), 'utf-8');
      agentContent = stampVersionInContent(agentContent, version);
      await mkdir(dirname(agentFile), { recursive: true });
      await writeFile(agentFile, agentContent, 'utf-8');
      createdFiles.push(toRelativePath(agentFile));
    }
  } else {
    skippedFiles.push(toRelativePath(agentFile));
  }
  
  // -------------------------------------------------------------------------
  // Copy .squad/templates/ (optional)
  // -------------------------------------------------------------------------
  
  if (includeTemplates && templatesDir) {
    const templatesDest = join(teamRoot, '.squad', 'templates');
    if (!existsSync(templatesDest)) {
      cpSync(templatesDir, templatesDest, { recursive: true });
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
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8' }).trim();
    if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com') || remoteUrl.includes('ssh.dev.azure.com')) {
      isGitHub = false;
    }
  } catch {
    // No git remote — assume GitHub (default)
  }

  // -------------------------------------------------------------------------
  // Copy workflows (optional) — skip for ADO repos
  // -------------------------------------------------------------------------
  
  if (includeWorkflows && isGitHub && templatesDir && existsSync(join(templatesDir, 'workflows'))) {
    const workflowsSrc = join(templatesDir, 'workflows');
    const workflowsDest = join(teamRoot, '.github', 'workflows');
    
    if (statSync(workflowsSrc).isDirectory()) {
      const workflowFiles = readdirSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      await mkdir(workflowsDest, { recursive: true });
      
      for (const file of workflowFiles) {
        const destFile = join(workflowsDest, file);
        if (!existsSync(destFile) || !skipExisting) {
          cpSync(join(workflowsSrc, file), destFile);
          createdFiles.push(toRelativePath(destFile));
        } else {
          skippedFiles.push(toRelativePath(destFile));
        }
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // Create sample MCP config (optional)
  // -------------------------------------------------------------------------
  
  if (includeMcpConfig) {
    const mcpConfigPath = join(teamRoot, '.copilot', 'mcp-config.json');
    if (!existsSync(mcpConfigPath)) {
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
                args: ["-y", "azure-devops-mcp-server"],
                env: {
                  AZURE_DEVOPS_ORG: "${AZURE_DEVOPS_ORG}",
                  AZURE_DEVOPS_PAT: "${AZURE_DEVOPS_PAT}"
                }
              }
            }
          };
      await mkdir(dirname(mcpConfigPath), { recursive: true });
      await writeFile(mcpConfigPath, JSON.stringify(mcpSample, null, 2) + '\n', 'utf-8');
      createdFiles.push(toRelativePath(mcpConfigPath));
    } else {
      skippedFiles.push(toRelativePath(mcpConfigPath));
    }
  }
  
  // -------------------------------------------------------------------------
  // Create .first-run marker
  // -------------------------------------------------------------------------
  
  const firstRunMarker = join(squadDir, '.first-run');
  if (!existsSync(firstRunMarker)) {
    await writeFile(firstRunMarker, new Date().toISOString() + '\n', 'utf-8');
    createdFiles.push(toRelativePath(firstRunMarker));
  }
  
  // -------------------------------------------------------------------------
  // Store init prompt for REPL auto-casting
  // -------------------------------------------------------------------------
  
  if (options.prompt) {
    const promptFile = join(squadDir, '.init-prompt');
    await writeFile(promptFile, options.prompt, 'utf-8');
    createdFiles.push(toRelativePath(promptFile));
  }
  
  return {
    createdFiles,
    skippedFiles,
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
export async function cleanupOrphanInitPrompt(squadDir: string): Promise<void> {
  const promptFile = join(squadDir, '.init-prompt');
  if (existsSync(promptFile)) {
    await unlink(promptFile);
  }
}
