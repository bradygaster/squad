/**
 * Config command — manage squad configuration.
 *
 * Usage:
 *   squad config model                          — show current model configuration
 *   squad config model <model-name>             — set default model for all agents
 *   squad config model <model-name> --agent <n> — pin model to a specific agent
 *   squad config model --clear                  — clear default model override
 *   squad config model --clear --agent <n>      — clear a specific agent's override
 *   squad config context-tier                          — show current context tier configuration
 *   squad config context-tier <tier>                   — set default context tier for all agents
 *   squad config context-tier <tier> --agent <n>       — pin context tier to a specific agent
 *   squad config context-tier --clear                  — clear default context tier override
 *   squad config context-tier --clear --agent <n>      — clear a specific agent's override
 */

import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import {
  readModelPreference,
  writeModelPreference,
  readAgentModelOverrides,
  writeAgentModelOverrides,
  readContextTier,
  writeContextTier,
  readAgentContextTierOverrides,
  writeAgentContextTierOverrides,
  VALID_CONTEXT_TIERS,
  MODEL_CATALOG,
} from '@bradygaster/squad-sdk/config';
import { fatal } from '../core/errors.js';
import { BOLD, RESET, GREEN, DIM, RED, YELLOW } from '../core/output.js';

function resolveSquadDir(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.squad');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function listAgents(squadDir: string): string[] {
  const agentsDir = join(squadDir, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function isValidModel(name: string): boolean {
  return MODEL_CATALOG.some(m => m.id === name);
}

function showAvailableModels(): void {
  console.log(`\n  Available models:`);
  const byTier = new Map<string, string[]>();
  for (const m of MODEL_CATALOG) {
    const list = byTier.get(m.tier) ?? [];
    list.push(m.id);
    byTier.set(m.tier, list);
  }
  for (const [tier, models] of byTier) {
    console.log(`    ${BOLD}${tier}${RESET}: ${DIM}${models.join(', ')}${RESET}`);
  }
  console.log();
}

function isValidTier(name: string): boolean {
  return (VALID_CONTEXT_TIERS as readonly string[]).includes(name);
}

function showAvailableTiers(): void {
  console.log(`\n  Available context tiers: ${DIM}${VALID_CONTEXT_TIERS.join(', ')}${RESET}\n`);
}

function parseFlags(args: string[]): { clear: boolean; agent: string | null; positional: string[] } {
  let clear = false;
  let agent: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--clear') {
      clear = true;
    } else if (arg === '--agent') {
      agent = args[++i] ?? null;
      if (!agent) {
        fatal('--agent requires a name argument.');
      }
    } else if (arg && !arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  return { clear, agent, positional };
}

async function runModelSubcommand(squadDir: string, subArgs: string[]): Promise<void> {
  const { clear, agent, positional } = parseFlags(subArgs);
  const modelArg = positional[0] ?? null;

  // --- Clear ---
  if (clear) {
    if (agent) {
      const agents = listAgents(squadDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentModelOverrides(squadDir);
      delete overrides[agent];
      writeAgentModelOverrides(squadDir, overrides);
      console.log(`${GREEN}✓${RESET} Model override for ${BOLD}${agent}${RESET} cleared.`);
    } else {
      writeModelPreference(squadDir, null);
      console.log(`${GREEN}✓${RESET} Default model override cleared (reverted to auto-selection).`);
    }
    return;
  }

  // --- Set model ---
  if (modelArg) {
    if (!isValidModel(modelArg)) {
      console.error(`${RED}✗${RESET} Unknown model: ${BOLD}${modelArg}${RESET}`);
      showAvailableModels();
      process.exit(1);
    }

    if (agent) {
      const agents = listAgents(squadDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentModelOverrides(squadDir);
      overrides[agent] = modelArg;
      writeAgentModelOverrides(squadDir, overrides);
      console.log(`${GREEN}✓${RESET} Model for ${BOLD}${agent}${RESET} set to ${BOLD}${modelArg}${RESET}`);
    } else {
      writeModelPreference(squadDir, modelArg);
      console.log(`${GREEN}✓${RESET} Default model set to ${BOLD}${modelArg}${RESET}`);
    }
    return;
  }

  // --- Show current config ---
  const defaultModel = readModelPreference(squadDir);
  const overrides = readAgentModelOverrides(squadDir);
  const overrideEntries = Object.entries(overrides);

  console.log(`\n${BOLD}Model configuration:${RESET}`);
  console.log(`  Default model: ${defaultModel ? BOLD + defaultModel + RESET : `${DIM}(auto)${RESET}`}`);

  if (overrideEntries.length > 0) {
    console.log(`\n  Agent overrides:`);
    for (const [name, model] of overrideEntries) {
      console.log(`    ${name} ${DIM}→${RESET} ${model}`);
    }
  } else {
    console.log(`\n  ${DIM}No agent overrides configured.${RESET}`);
  }
  console.log();
}

async function runContextTierSubcommand(squadDir: string, subArgs: string[]): Promise<void> {
  const { clear, agent, positional } = parseFlags(subArgs);
  const tierArg = positional[0] ?? null;

  // --- Clear ---
  if (clear) {
    if (agent) {
      const agents = listAgents(squadDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentContextTierOverrides(squadDir);
      delete overrides[agent];
      writeAgentContextTierOverrides(squadDir, overrides);
      console.log(`${GREEN}✓${RESET} Context tier override for ${BOLD}${agent}${RESET} cleared.`);
    } else {
      writeContextTier(squadDir, null);
      console.log(`${GREEN}✓${RESET} Default context tier cleared (reverted to model default).`);
    }
    return;
  }

  // --- Set context tier ---
  if (tierArg) {
    if (!isValidTier(tierArg)) {
      console.error(`${RED}✗${RESET} Unknown context tier: ${BOLD}${tierArg}${RESET}`);
      showAvailableTiers();
      process.exit(1);
    }

    if (agent) {
      const agents = listAgents(squadDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentContextTierOverrides(squadDir);
      overrides[agent] = tierArg;
      writeAgentContextTierOverrides(squadDir, overrides);
      console.log(`${GREEN}✓${RESET} Context tier for ${BOLD}${agent}${RESET} set to ${BOLD}${tierArg}${RESET}`);
    } else {
      writeContextTier(squadDir, tierArg);
      console.log(`${GREEN}✓${RESET} Default context tier set to ${BOLD}${tierArg}${RESET}`);
    }
    return;
  }

  // --- Show current config ---
  const defaultTier = readContextTier(squadDir);
  const overrides = readAgentContextTierOverrides(squadDir);
  const overrideEntries = Object.entries(overrides);

  console.log(`\n${BOLD}Context tier configuration:${RESET}`);
  console.log(`  Default context tier: ${defaultTier ? BOLD + defaultTier + RESET : `${DIM}(model default)${RESET}`}`);

  if (overrideEntries.length > 0) {
    console.log(`\n  Agent overrides:`);
    for (const [name, tier] of overrideEntries) {
      console.log(`    ${name} ${DIM}→${RESET} ${tier}`);
    }
  } else {
    console.log(`\n  ${DIM}No agent overrides configured.${RESET}`);
  }
  showAvailableTiers();
}

export async function runConfig(cwd: string, subArgs: string[]): Promise<void> {
  const squadDir = resolveSquadDir(cwd);
  if (!squadDir) {
    fatal('No squad found. Run "squad init" first.');
    return;
  }

  const sub = subArgs[0]?.toLowerCase();

  if (sub === 'model') {
    await runModelSubcommand(squadDir, subArgs.slice(1));
    return;
  }

  if (sub === 'context-tier') {
    await runContextTierSubcommand(squadDir, subArgs.slice(1));
    return;
  }

  // No subcommand or unknown — show usage
  console.log(`\n${BOLD}squad config${RESET} — manage squad configuration\n`);
  console.log(`  ${BOLD}squad config model${RESET}                          — show current model config`);
  console.log(`  ${BOLD}squad config model <model>${RESET}                  — set default model`);
  console.log(`  ${BOLD}squad config model <model> --agent <name>${RESET}   — pin model to agent`);
  console.log(`  ${BOLD}squad config model --clear${RESET}                  — clear default model`);
  console.log(`  ${BOLD}squad config model --clear --agent <name>${RESET}   — clear agent override\n`);
  console.log(`  ${BOLD}squad config context-tier${RESET}                    — show current context-tier config`);
  console.log(`  ${BOLD}squad config context-tier <tier>${RESET}             — set default context tier`);
  console.log(`  ${BOLD}squad config context-tier <tier> --agent <name>${RESET} — pin context tier to agent`);
  console.log(`  ${BOLD}squad config context-tier --clear${RESET}            — clear default context tier`);
  console.log(`  ${BOLD}squad config context-tier --clear --agent <name>${RESET} — clear agent override\n`);
}
