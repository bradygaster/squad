/**
 * Init command implementation — uses SDK
 * Scaffolds a new Squad project with templates, workflows, and directory structure
 */

import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { detectSquadDir } from './detect-squad-dir.js';
import { success, BOLD, RESET, YELLOW, GREEN, DIM } from './output.js';
import { fatal } from './errors.js';
import { detectProjectType } from './project-type.js';
import { getPackageVersion } from './version.js';
import { initSquad as sdkInitSquad, cleanupOrphanInitPrompt, type InitOptions } from '@bradygaster/squad-sdk';

const CYAN = '\x1b[36m';

/**
 * Detect if the target directory is inside a parent git repo.
 * Returns the normalized git root path if a parent repo is detected,
 * or null if dest IS the git root or no git repo exists.
 */
export function detectParentGitRepo(dest: string): string | null {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().replace(/\//g, path.sep);
    const normalDest = path.resolve(dest);
    const normalGitRoot = path.resolve(gitRoot);
    if (normalDest.toLowerCase() !== normalGitRoot.toLowerCase()) {
      return normalGitRoot;
    }
  } catch {
    // No git available or not in a git repo
  }
  return null;
}

/** True when animations should be suppressed (NO_COLOR, dumb term, non-TTY). */
export function isInitNoColor(): boolean {
  return (
    (process.env['NO_COLOR'] != null && process.env['NO_COLOR'] !== '') ||
    process.env['TERM'] === 'dumb' ||
    !process.stdout.isTTY
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Typewriter effect — falls back to instant print when animations disabled. */
export async function typewrite(text: string, charMs: number = 8): Promise<void> {
  if (isInitNoColor()) {
    process.stdout.write(text + '\n');
    return;
  }
  for (const char of text) {
    process.stdout.write(char);
    await sleep(charMs);
  }
  process.stdout.write('\n');
}

/** Staggered list reveal — each line appears with a short delay. */
async function revealLines(lines: string[], delayMs: number = 30): Promise<void> {
  for (const line of lines) {
    if (!isInitNoColor()) await sleep(delayMs);
    console.log(line);
  }
}

/** The structures that init creates, for the ceremony summary. */
const INIT_LANDMARKS = [
  { emoji: '📁', label: 'Team workspace' },
  { emoji: '📋', label: 'Skills & ceremonies' },
  { emoji: '🔧', label: 'Workflows & CI' },
  { emoji: '🧠', label: 'Identity & wisdom' },
  { emoji: '🤖', label: 'Copilot agent prompt' },
];

/**
 * Show deprecation warning for .ai-team/ directory
 */
function showDeprecationWarning(): void {
  console.log();
  console.log(`${YELLOW}⚠️  DEPRECATION: .ai-team/ is deprecated and will be removed in v1.0.0${RESET}`);
  console.log(`${YELLOW}    Run 'npx @bradygaster/squad-cli upgrade --migrate-directory' to migrate to .squad/${RESET}`);
  console.log(`${YELLOW}    Details: https://github.com/bradygaster/squad/issues/101${RESET}`);
  console.log();
}

/**
 * Options for the init command.
 */
export interface RunInitOptions {
  /** Project description prompt — stored for REPL auto-casting. */
  prompt?: string;
  /** If true, disable extraction from consult sessions (read-only consultations) */
  extractionDisabled?: boolean;
  /** If false, skip GitHub workflow installation (default: true) */
  includeWorkflows?: boolean;
  /** If true, generate squad.config.ts with SDK builder syntax (default: false) */
  sdk?: boolean;
  /** If true, use built-in base roles instead of fictional universe casting (default: false) */
  roles?: boolean;
}

/**
 * Main init command handler
 */
export async function runInit(dest: string, options: RunInitOptions = {}): Promise<void> {
  const version = getPackageVersion();

  console.log();
  await typewrite(`${DIM}Let's build your team.${RESET}`, 8);
  console.log();

  // Detect project type
  const projectType = detectProjectType(dest);

  // ── Parent git repo detection ─────────────────────────────────────
  // Copilot resolves .github/agents/ relative to the git root.
  // If CWD is inside a parent git repo, the agent file will be
  // invisible to copilot because the git root points elsewhere.
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().replace(/\//g, path.sep);
    const normalDest = path.resolve(dest);
    const normalGitRoot = path.resolve(gitRoot);
    if (normalDest.toLowerCase() !== normalGitRoot.toLowerCase()) {
      console.log();
      console.log(`${YELLOW}${BOLD}⚠  Parent git repo detected${RESET}`);
      console.log(`${YELLOW}   Git root:  ${normalGitRoot}${RESET}`);
      console.log(`${YELLOW}   You're in: ${normalDest}${RESET}`);
      console.log();
      console.log(`${DIM}Copilot resolves .github/agents/ from the git root, not from here.${RESET}`);
      console.log(`${DIM}The Squad agent won't be visible to copilot in this folder.${RESET}`);
      console.log();
      // Auto-fix: run git init to create a repo boundary here
      console.log(`${CYAN}${BOLD}→${RESET} Running ${CYAN}git init${RESET} to create a repo boundary...`);
      execFileSync('git', ['init'], { cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      console.log(`${GREEN}${BOLD}✓${RESET} Initialized git repo at ${normalDest}`);
      console.log();
    }
  } catch {
    // No git available or not in a git repo — that's fine, continue normally.
    // Copilot will fall back to CWD for .github/agents/ discovery.
  }

  // Detect squad directory
  const squadInfo = detectSquadDir(dest);

  // Show deprecation warning if using .ai-team/
  if (squadInfo.isLegacy) {
    showDeprecationWarning();
  }

  // Build SDK options
  const initOptions: InitOptions = {
    teamRoot: dest,
    projectName: path.basename(dest) || 'my-project',
    agents: [
      {
        name: 'scribe',
        role: 'scribe',
        displayName: 'Scribe',
      }
    ],
    configFormat: options.sdk ? 'sdk' : 'markdown',
    skipExisting: true,
    includeWorkflows: options.includeWorkflows !== false,
    includeTemplates: true,
    includeMcpConfig: true,
    projectType: projectType as any,
    version,
    prompt: options.prompt,
    extractionDisabled: options.extractionDisabled,
  };

  // Handle SIGINT to cleanup orphan .init-prompt
  const squadDir = squadInfo.path;
  const sigintHandler = async () => {
    await cleanupOrphanInitPrompt(squadDir);
    process.exit(130);
  };
  process.on('SIGINT', sigintHandler);

  // Run SDK init
  let result;
  try {
    result = await sdkInitSquad(initOptions);
  } catch (err: any) {
    process.off('SIGINT', sigintHandler);
    fatal(`Failed to initialize squad: ${err.message}`);
    return; // Unreachable but makes TS happy
  }

  process.off('SIGINT', sigintHandler);

  // Persist --roles flag for the REPL to pick up during casting
  if (options.roles) {
    const rolesMarker = path.join(squadDir, '.init-roles');
    fs.writeFileSync(rolesMarker, '1', 'utf-8');
    success(`base roles enabled — team will use built-in role catalog`);
  }

  // Report .init-prompt storage
  if (options.prompt) {
    success(`.init-prompt stored — team will be cast when you start squad`);
  }

  // Report created files
  for (const file of result.createdFiles) {
    // Files are already relative to teamRoot, just display as-is
    success(file);
  }

  // Report skipped files
  for (const file of result.skippedFiles) {
    // Files are already relative to teamRoot, just display as-is
    console.log(`${DIM}${file} already exists — skipping${RESET}`);
  }

  // ── Celebration ceremony ──────────────────────────────────────────
  console.log();
  await typewrite(`${CYAN}${BOLD}◆ SQUAD${RESET}`, 10);
  if (!isInitNoColor()) await sleep(50);
  console.log();

  await revealLines(
    INIT_LANDMARKS.map(l => `  ${l.emoji}  ${l.label}`),
    30,
  );

  if (!isInitNoColor()) await sleep(80);
  console.log();
  console.log(`${GREEN}${BOLD}Your team is ready.${RESET} Run ${CYAN}${BOLD}squad${RESET} to start.`);
  console.log();

  if (squadInfo.isLegacy) {
    showDeprecationWarning();
  }
}
