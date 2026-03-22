/**
 * squad personal — manage personal squad agents (ambient team)
 *
 * Subcommands:
 *   squad personal init          — bootstrap personal squad directory
 *   squad personal list          — list personal agents
 *   squad personal add <name>    — add a personal agent
 *   squad personal remove <name> — remove a personal agent
 *
 * @module cli/commands/personal
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveGlobalSquadPath, resolvePersonalSquadDir } from '@bradygaster/squad-sdk/resolution';
import { resolvePersonalAgents } from '@bradygaster/squad-sdk/agents/personal';
import { success, warn, info, BOLD, RESET, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';

/**
 * Entry point for `squad personal` subcommands.
 */
export async function runPersonal(cwd: string, subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'init':
      await personalInit();
      break;
    case 'list':
      await personalList();
      break;
    case 'add': {
      const name = args[0];
      if (!name) {
        fatal('Usage: squad personal add <name> --role <role>');
      }
      const roleIdx = args.indexOf('--role');
      const role = (roleIdx !== -1 && args[roleIdx + 1]) ? args[roleIdx + 1] : 'agent';
      await personalAdd(name, role);
      break;
    }
    case 'remove': {
      const name = args[0];
      if (!name) {
        fatal('Usage: squad personal remove <name>');
      }
      await personalRemove(name);
      break;
    }
    default:
      fatal(
        `Unknown personal subcommand: ${subcommand}\n` +
        `       Available: init, list, add <name> --role <role>, remove <name>`,
      );
  }
}

// ============================================================================
// Subcommand: init
// ============================================================================

async function personalInit(): Promise<void> {
  const globalDir = resolveGlobalSquadPath();
  const personalDir = path.join(globalDir, 'personal-squad');
  
  if (fs.existsSync(personalDir)) {
    warn(`Personal squad already initialized at ${personalDir}`);
    return;
  }
  
  // Create directory structure
  const agentsDir = path.join(personalDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  
  // Create config.json
  const config = {
    defaultModel: 'auto',
    ghostProtocol: true,
  };
  const configPath = path.join(personalDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  
  success('Personal squad initialized');
  info(`  Path: ${personalDir}`);
  info(`  Add agents with: squad personal add <name> --role <role>`);
}

// ============================================================================
// Subcommand: list
// ============================================================================

async function personalList(): Promise<void> {
  const personalDir = resolvePersonalSquadDir();
  
  if (!personalDir) {
    info('No personal squad found.');
    info('  Run `squad personal init` to create your personal squad.');
    return;
  }
  
  const agents = await resolvePersonalAgents();
  
  if (agents.length === 0) {
    info('No personal agents found.');
    info(`  Add agents with: squad personal add <name> --role <role>`);
    return;
  }
  
  console.log(`\n${BOLD}Personal Squad Agents${RESET} (${agents.length}):\n`);
  
  // Calculate column widths
  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const maxRoleLen = Math.max(...agents.map(a => a.role.length), 4);
  
  // Header
  console.log(
    `  ${'Name'.padEnd(maxNameLen)}  ` +
    `${'Role'.padEnd(maxRoleLen)}  ` +
    `Charter Path`
  );
  console.log(
    `  ${'─'.repeat(maxNameLen)}  ` +
    `${'─'.repeat(maxRoleLen)}  ` +
    `${'─'.repeat(40)}`
  );
  
  // Rows
  for (const agent of agents) {
    const charterPath = path.join(agent.personal.sourceDir, 'charter.md');
    const relativePath = path.relative(process.cwd(), charterPath);
    console.log(
      `  ${agent.name.padEnd(maxNameLen)}  ` +
      `${agent.role.padEnd(maxRoleLen)}  ` +
      `${DIM}${relativePath}${RESET}`
    );
  }
  
  console.log();
}

// ============================================================================
// Subcommand: add
// ============================================================================

async function personalAdd(name: string, role: string): Promise<void> {
  const personalDir = resolvePersonalSquadDir();
  
  if (!personalDir) {
    fatal('Personal squad not initialized. Run `squad personal init` first.');
  }
  
  const agentDir = path.join(personalDir, 'agents', name);
  
  if (fs.existsSync(agentDir)) {
    warn(`Agent '${name}' already exists at ${agentDir}`);
    return;
  }
  
  // Create agent directory
  fs.mkdirSync(agentDir, { recursive: true });
  
  // Create charter.md
  const charterContent = generatePersonalCharterTemplate(name, role);
  const charterPath = path.join(agentDir, 'charter.md');
  fs.writeFileSync(charterPath, charterContent, 'utf-8');
  
  // Create empty history.md
  const historyPath = path.join(agentDir, 'history.md');
  fs.writeFileSync(historyPath, '# History\n\n<!-- Agent activity log -->\n', 'utf-8');
  
  success(`Added personal agent: ${name}`);
  info(`  Role: ${role}`);
  info(`  Charter: ${charterPath}`);
  info(`  Edit the charter to customize this agent's behavior.`);
}

// ============================================================================
// Subcommand: remove
// ============================================================================

async function personalRemove(name: string): Promise<void> {
  const personalDir = resolvePersonalSquadDir();
  
  if (!personalDir) {
    fatal('Personal squad not initialized. Run `squad personal init` first.');
  }
  
  const agentDir = path.join(personalDir, 'agents', name);
  
  if (!fs.existsSync(agentDir)) {
    fatal(`Agent '${name}' not found in personal squad`);
  }
  
  // Remove agent directory recursively
  fs.rmSync(agentDir, { recursive: true, force: true });
  
  success(`Removed personal agent: ${name}`);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a personal agent charter template.
 * Note: PR #3 will add a proper personal-charter.md template to templates/.
 * For now, we use a simplified inline template.
 */
function generatePersonalCharterTemplate(name: string, role: string): string {
  return `# ${name} — ${role}

> Your one-line personality statement — what makes you tick

## Identity

- **Name:** ${name}
- **Role:** ${role}
- **Expertise:** [Your 2-3 specific skills]
- **Style:** [How you communicate — direct? thorough? opinionated?]

## What I Own

- [Area of responsibility 1]
- [Area of responsibility 2]
- [Area of responsibility 3]

## How I Work

- [Key approach or principle 1]
- [Key approach or principle 2]
- [Pattern or convention I follow]

## Boundaries

**I handle:** [types of work this agent does]

**I don't handle:** [types of work that belong to other team members]

**When I'm unsure:** I say so and suggest who might know.

## Model

- **Preferred:** auto
- **Rationale:** Coordinator selects the best model based on task type

## Collaboration

This is a personal agent — you're ambient across all projects.
Ghost protocol is enforced in project contexts (observe, suggest, never modify).

## Voice

[1-2 sentences describing personality. Be specific — you have opinions,
preferences, and a style that's distinctly yours.]
`;
}
