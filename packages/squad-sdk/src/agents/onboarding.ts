/**
 * Agent Onboarding Module (M2-10, PRD #111)
 * 
 * Handles runtime agent onboarding with context-aware charter generation.
 * Creates agent directory, charter, and history with project context.
 * 
 * @module agents/onboarding
 */

import { join } from 'path';
import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { SquadState } from '../state/squad-state.js';

// ============================================================================
// Onboarding Types
// ============================================================================

/**
 * Agent onboarding options.
 */
export interface OnboardOptions {
  /** Root directory for Squad team files */
  teamRoot: string;
  /** Agent name (kebab-case) */
  agentName: string;
  /** Agent role identifier */
  role: string;
  /** Display name (optional, defaults to titlecased name) */
  displayName?: string;
  /** Project context for charter generation */
  projectContext?: string;
  /** User name for initial history entry */
  userName?: string;
  /** Custom charter template override */
  charterTemplate?: string;
}

/**
 * Agent onboarding result.
 */
export interface OnboardResult {
  /** Created file paths */
  createdFiles: string[];
  /** Agent directory path */
  agentDir: string;
  /** Charter file path */
  charterPath: string;
  /** History file path */
  historyPath: string;
}

// ============================================================================
// Default Charter Templates
// ============================================================================

/**
 * Default charter templates for standard roles.
 */
const CHARTER_TEMPLATES: Record<string, (displayName: string, context?: string) => string> = {
  'lead': (displayName: string, context?: string) => `# ${displayName} — Technical Lead

Technical lead responsible for architecture, delegation, and project coordination.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Define technical direction and architecture
- Coordinate work across team members
- Review proposals and make final decisions
- Maintain code quality standards
- Mentor team members

## Work Style

- Think strategically about long-term maintainability
- Delegate work effectively to specialists
- Balance technical excellence with pragmatic delivery
- Document architectural decisions
- Foster collaborative team environment
`,

  'developer': (displayName: string, context?: string) => `# ${displayName} — Software Developer

Software developer focused on feature implementation and code quality.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Implement features according to specifications
- Write clean, maintainable code
- Create and maintain tests
- Review code from team members
- Document implementation decisions

## Work Style

- Follow established patterns and conventions
- Write tests alongside implementation
- Ask questions when requirements are unclear
- Collaborate with team members on complex problems
- Keep code simple and readable
`,

  'tester': (displayName: string, context?: string) => `# ${displayName} — Quality Assurance

Quality assurance specialist responsible for test coverage and validation.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Design and implement test strategies
- Write comprehensive test suites
- Validate features against requirements
- Identify edge cases and failure modes
- Maintain test infrastructure

## Work Style

- Think adversarially about how things can break
- Automate testing wherever possible
- Document test scenarios and coverage
- Collaborate with developers on testability
- Balance thoroughness with pragmatism
`,

  'scribe': (displayName: string, context?: string) => `# ${displayName} — Documentation Specialist

Documentation specialist maintaining history, decisions, and technical records.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Maintain agent history files
- Document team decisions
- Keep technical records organized
- Summarize work sessions
- Preserve institutional knowledge

## Work Style

- Write clear, concise documentation
- Organize information for easy retrieval
- Capture both what and why
- Update documentation proactively
- Maintain consistent formatting
`,

  'ralph': (displayName: string, context?: string) => `# ${displayName} — Work Monitor

Work monitor that tracks the work queue, monitors CI status, and ensures the team never sits idle.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Scan for untriaged issues and assign to the right team member
- Monitor PR lifecycle: drafts, review feedback, CI status, merge readiness
- Track work in progress and detect when tasks complete
- Report board status and flag blockers
- Keep the pipeline moving — dispatch, watch, scan again

## Work Style

- Read routing rules before assigning work
- Process all pending items in each cycle, not just the first
- Report board state after each cycle
- Never do the work — hand off to the responsible team member
- Loop until the board is clear, then idle
`,

  'designer': (displayName: string, context?: string) => `# ${displayName} — User Experience Designer

User experience designer focused on interface design and user interactions.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Design user interfaces and interactions
- Create prototypes and mockups
- Validate designs with users
- Maintain design consistency
- Document design decisions

## Work Style

- Think from the user's perspective
- Balance aesthetics with usability
- Iterate based on feedback
- Maintain design system consistency
- Collaborate with developers on implementation
`,

  'architect': (displayName: string, context?: string) => `# ${displayName} — Software Architect

Software architect responsible for system design and technical strategy.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Design system architecture
- Define technical standards
- Evaluate technology choices
- Plan for scalability and maintainability
- Document architectural decisions

## Work Style

- Think holistically about the system
- Balance ideal design with practical constraints
- Consider long-term implications
- Document trade-offs clearly
- Mentor team on architectural patterns
`
};

/**
 * Generate a generic charter when no template matches.
 */
function generateGenericCharter(displayName: string, role: string, context?: string): string {
  return `# ${displayName} — ${titleCase(role)}

Team member focused on ${role} responsibilities.

## Project Context

${context || 'Context will be provided by the team.'}

## Responsibilities

- Collaborate with team members on assigned work
- Maintain code quality and project standards
- Document decisions and progress in history
- Follow team conventions and guidelines

## Work Style

- Read project context and team decisions before starting work
- Communicate clearly with team members
- Follow established patterns and conventions
- Ask questions when requirements are unclear
- Keep work focused and incremental
`;
}

/**
 * Generate history.md content with project context.
 */
function generateHistory(
  displayName: string,
  role: string,
  projectContext?: string,
  userName?: string
): string {
  const now = new Date().toISOString().split('T')[0];
  
  return `# Project Context

${userName ? `- **Owner:** ${userName}\n` : ''}- **Agent:** ${displayName}
- **Role:** ${titleCase(role)}
- **Onboarded:** ${now}

## Core Context

${projectContext || 'Project context will be provided by the team.'}

## Recent Updates

📌 Agent ${displayName} onboarded on ${now}

## Learnings

Ready to contribute to the team.
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
// Onboarding Functions
// ============================================================================

/**
 * Onboard a new agent to the Squad.
 * 
 * Creates:
 * - Agent directory at .squad/agents/{name}/
 * - charter.md from role template + project context
 * - history.md with project description and tech stack
 * 
 * @param options - Onboarding options
 * @returns Result with created file paths
 */
export async function onboardAgent(
  options: OnboardOptions,
  storage: StorageProvider = new FSStorageProvider(),
  state?: SquadState,
): Promise<OnboardResult> {
  const {
    teamRoot,
    agentName,
    role,
    displayName,
    projectContext,
    userName,
    charterTemplate
  } = options;
  
  const createdFiles: string[] = [];
  
  // Validate inputs
  if (!teamRoot) {
    throw new Error('teamRoot is required');
  }
  if (!agentName) {
    throw new Error('agentName is required');
  }
  if (!role) {
    throw new Error('role is required');
  }
  
  // Normalize agent name (kebab-case)
  const normalizedName = agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  // Create agent directory
  const agentDir = join(teamRoot, '.squad', 'agents', normalizedName);
  if (await storage.exists(agentDir)) {
    throw new Error(`Agent directory already exists: ${agentDir}`);
  }
  
  // Write charter.md (storage.write auto-creates parent directories)
  
  // Determine display name
  const effectiveDisplayName = displayName || titleCase(normalizedName);
  
  // Generate charter
  let charterContent: string;
  if (charterTemplate) {
    charterContent = charterTemplate;
  } else {
    const templateFn = CHARTER_TEMPLATES[role.toLowerCase()];
    if (templateFn) {
      charterContent = templateFn(effectiveDisplayName, projectContext);
    } else {
      charterContent = generateGenericCharter(effectiveDisplayName, role, projectContext);
    }
  }
  
  // Generate history
  const historyContent = generateHistory(
    effectiveDisplayName,
    role,
    projectContext,
    userName
  );

  // Write agent files — use SquadState when available, raw storage otherwise
  const charterPath = join(agentDir, 'charter.md');
  const historyPath = join(agentDir, 'history.md');

  if (state) {
    // SquadState.agents.create() writes charter + generic history.
    // We write charter via state, then overwrite history with our richer template.
    await state.agents.create(normalizedName, charterContent);
    await storage.write(historyPath, historyContent);
  } else {
    await storage.write(charterPath, charterContent);
    await storage.write(historyPath, historyContent);
  }
  createdFiles.push(charterPath, historyPath);
  
  return {
    createdFiles,
    agentDir,
    charterPath,
    historyPath
  };
}

/**
 * Update an agent's configuration to squad.config.ts (if it exists).
 * 
 * This is a helper function to add agent routing after onboarding.
 * Only works with TypeScript configs (JSON requires manual edit).
 * 
 * @param teamRoot - Team root directory
 * @param agentName - Agent name to add
 * @param role - Agent role
 * @returns True if config was updated, false if not found or JSON format
 */
export async function addAgentToConfig(
  teamRoot: string,
  agentName: string,
  role: string,
  storage: StorageProvider = new FSStorageProvider()
): Promise<boolean> {
  const configPath = join(teamRoot, 'squad.config.ts');
  
  if (!await storage.exists(configPath)) {
    return false; // No TypeScript config to update
  }
  
  try {
    const content = await storage.read(configPath);
    if (content === undefined) {
      return false;
    }
    
    // Simple heuristic: add routing rule if role matches common work types
    const workTypeMap: Record<string, string> = {
      'developer': 'feature-dev',
      'tester': 'testing',
      'scribe': 'documentation',
      'architect': 'architecture',
      'designer': 'design'
    };
    
    const workType = workTypeMap[role.toLowerCase()];
    if (!workType) {
      return false; // No obvious work type mapping
    }
    
    // Check if this work type already has a rule
    const workTypePattern = new RegExp(`workType:\\s*['"]${workType}['"]`);
    if (workTypePattern.test(content)) {
      return false; // Already has a rule for this work type
    }
    
    // Find the routing rules array and add new rule
    const rulesPattern = /rules:\s*\[([^\]]*)\]/s;
    const match = content.match(rulesPattern);
    
    if (!match) {
      return false; // Cannot parse rules array
    }
    
    const newRule = `      {
        workType: '${workType}',
        agents: ['@${agentName}'],
        confidence: 'high'
      }`;
    
    const updatedRules = match[1]!.trim() + ',\n' + newRule;
    const updatedContent = content.replace(
      rulesPattern,
      `rules: [\n${updatedRules}\n    ]`
    );
    
    await storage.write(configPath, updatedContent);
    return true;
  } catch (error) {
    // Silently fail if we can't parse/update the config
    return false;
  }
}
