/**
 * Copilot agent CLI command — add/remove/auto-assign
 * Port from beta index.js lines 598-713
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import { success, dim, bold, info, BOLD, RESET, DIM } from '../core/output.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import {
  readTeamMd,
  writeTeamMd,
  hasCopilot,
  insertCopilotSection,
  removeCopilotSection,
  setAutoAssign
} from '../core/team-md.js';

export interface CopilotFlags {
  off?: boolean;
  autoAssign?: boolean;
}

/**
 * Run copilot command
 */
export async function runCopilot(dest: string, flags: CopilotFlags): Promise<void> {
  const squadDirInfo = detectSquadDir(dest);
  const squadDir = squadDirInfo.path;

  // Ensure squad directory exists
  if (!storage.existsSync(squadDir)) {
    throw new Error('No squad found — run init first, then add the copilot agent.');
  }

  let content = readTeamMd(squadDir);
  const copilotExists = hasCopilot(content);

  // Remove copilot
  if (flags.off) {
    if (!copilotExists) {
      console.log(`${DIM}Copilot coding agent is not on the team — nothing to remove${RESET}`);
      return;
    }
    
    // Remove the Coding Agent section
    content = removeCopilotSection(content);
    writeTeamMd(squadDir, content);
    success('Removed @copilot from the team roster');

    // Remove copilot-instructions.md
    const instructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
    if (storage.existsSync(instructionsDest)) {
      storage.deleteSync(instructionsDest);
      success('Removed .github/copilot-instructions.md');
    }
    return;
  }

  // Enable auto-assign (copilot already exists)
  if (copilotExists) {
    if (flags.autoAssign) {
      content = setAutoAssign(content, true);
      writeTeamMd(squadDir, content);
      success('Enabled @copilot auto-assign');
    } else {
      console.log(`${DIM}@copilot is already on the team${RESET}`);
    }
    return;
  }

  // Add copilot
  content = insertCopilotSection(content, flags.autoAssign);
  writeTeamMd(squadDir, content);
  success('Added @copilot (Coding Agent) to team roster');
  
  if (flags.autoAssign) {
    success('Auto-assign enabled — squad-labeled issues will be assigned to @copilot');
  }

  // Copy copilot-instructions.md from templates
  // Templates are at the root of the package (../../../templates from dist/cli/commands/)
  const currentFileUrl = new URL(import.meta.url);
  const currentFilePath = currentFileUrl.pathname.startsWith('/') && process.platform === 'win32'
    ? currentFileUrl.pathname.substring(1) // Remove leading / on Windows
    : currentFileUrl.pathname;
  const templatesSrc = path.resolve(path.dirname(currentFilePath), '..', '..', '..', 'templates');
  const instructionsSrc = path.join(templatesSrc, 'copilot-instructions.md');
  const instructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
  
  if (storage.existsSync(instructionsSrc)) {
    storage.mkdirSync(path.dirname(instructionsDest), { recursive: true });
    storage.copySync(instructionsSrc, instructionsDest);
    success('.github/copilot-instructions.md');
  }

  // Output guidance
  console.log();
  console.log(`${BOLD}@copilot is on the team.${RESET}`);
  console.log(`The coding agent will pick up issues matching its capability profile.`);
  if (!flags.autoAssign) {
    console.log(`Run with ${BOLD}--auto-assign${RESET} to auto-assign @copilot on squad-labeled issues.`);
  }
  console.log();
  console.log(`${BOLD}Required:${RESET} Add a classic PAT (repo scope) as a repo secret for auto-assignment:`);
  console.log(`  1. Create token:  ${DIM}https://github.com/settings/tokens/new${RESET}`);
  console.log(`  2. Set secret:    ${DIM}gh secret set COPILOT_ASSIGN_TOKEN${RESET}`);
  console.log();
}
