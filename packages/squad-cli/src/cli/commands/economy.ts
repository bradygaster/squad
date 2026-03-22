/**
 * Economy mode command — toggle cost-conscious model selection.
 *
 * Usage:
 *   squad economy on    — enable economy mode (persisted to config.json)
 *   squad economy off   — disable economy mode
 *   squad economy       — show current status
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { writeEconomyMode, readEconomyMode } from '@bradygaster/squad-sdk/config';
import { fatal } from '../core/errors.js';
import { BOLD, RESET, GREEN, DIM } from '../core/output.js';

function resolveSquadDir(cwd: string): string | null {
  // Walk up to find .squad/
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

export async function runEconomy(cwd: string, subArgs: string[]): Promise<void> {
  const squadDir = resolveSquadDir(cwd);
  if (!squadDir) {
    fatal('No squad found. Run "squad init" first.');
    return;
  }

  const sub = subArgs[0]?.toLowerCase();

  if (sub === 'on') {
    writeEconomyMode(squadDir, true);
    console.log(`${GREEN}✓${RESET} Economy mode ${BOLD}enabled${RESET} — cheaper models will be used for auto-selection.`);
    console.log(`  Saved to: ${DIM}${join(squadDir, 'config.json')}${RESET}`);
    return;
  }

  if (sub === 'off') {
    writeEconomyMode(squadDir, false);
    console.log(`${GREEN}✓${RESET} Economy mode ${BOLD}disabled${RESET} — returning to standard model selection.`);
    console.log(`  Saved to: ${DIM}${join(squadDir, 'config.json')}${RESET}`);
    return;
  }

  // Status display
  const enabled = readEconomyMode(squadDir);
  console.log(`\n${BOLD}Economy Mode${RESET}\n`);
  console.log(`  Status: ${enabled ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`}`);
  console.log(`  Config: ${DIM}${join(squadDir, 'config.json')}${RESET}\n`);
  if (enabled) {
    console.log(`  When active, auto-selected models are downgraded:`);
    console.log(`    ${DIM}claude-opus-4.6   → claude-sonnet-4.5  (architecture/review)${RESET}`);
    console.log(`    ${DIM}claude-sonnet-4.6 → gpt-4.1            (code writing)${RESET}`);
    console.log(`    ${DIM}claude-haiku-4.5  → gpt-4.1            (docs/mechanical)${RESET}`);
    console.log(`  Explicit overrides (config.json, charter) are never changed.\n`);
  } else {
    console.log(`  Usage: squad economy on | off\n`);
  }
}
