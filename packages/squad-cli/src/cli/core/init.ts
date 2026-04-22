/**
 * Init command implementation — uses SDK
 * Scaffolds a new Squad project with templates, workflows, and directory structure
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { detectSquadDir, resolveWorktreeMainCheckout } from './detect-squad-dir.js';
import { success, BOLD, RESET, YELLOW, GREEN, DIM } from './output.js';
import { fatal } from './errors.js';
import { detectProjectType } from './project-type.js';
import { getPackageVersion, stampVersion } from './version.js';
import { initSquad as sdkInitSquad, cleanupOrphanInitPrompt, ensurePersonalSquadDir, resolvePersonalSquadDir, type InitOptions } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

const CYAN = '\x1b[36m';

// ── APM manifest generation ───────────────────────────────────────────────────

/**
 * Generate a starter apm.yml at the project root.
 *
 * Only creates the file if it doesn't already exist, so repeat `squad init`
 * invocations are safe (skipExisting semantics mirror the SDK's behaviour).
 *
 * APM (Agent Package Manager) is package.json for AI agent context.
 * See: https://github.com/microsoft/apm
 */
export function generateApmYml(dest: string, projectName: string): void {
  const apmPath = path.join(dest, 'apm.yml');
  if (fs.existsSync(apmPath)) return; // skip if already present

  const content = [
    `# apm.yml — Agent Package Manager manifest`,
    `# See: https://github.com/microsoft/apm`,
    `#`,
    `# This file makes your Squad skills versioned, portable, and community-shareable.`,
    `# Run 'squad skill publish' to populate the skills section after adding skills.`,
    ``,
    `name: ${projectName}`,
    `version: 1.0.0`,
    ``,
    `# Skills — add entries here or run 'squad skill publish' to auto-populate`,
    `skills: []`,
    ``,
    `# Instruction files deployed by 'apm install'`,
    `instructions:`,
    `  - path: .squad/copilot-instructions.md`,
    `    target: .github/copilot-instructions.md`,
    ``,
    `# Prompts deployed by 'apm install'`,
    `prompts:`,
    `  - path: .squad/skills/*/skill.md`,
    `    target: .github/prompts/`,
  ].join('\n') + '\n';

  fs.writeFileSync(apmPath, content, 'utf8');
}

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
  /** If true, this is a global (personal squad) init — bootstrap personal-squad/ dir */
  isGlobal?: boolean;
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

  // ── Monorepo / subfolder detection ───────────────────────────────
  // Copilot resolves .github/agents/ relative to the git root.
  // If CWD is a subfolder of a larger repo (monorepo), we place
  // squad.agent.md at the git root and .squad/ in the subfolder.
  // Never run `git init` — it creates broken nested repos (#939).
  let agentFileRoot = dest; // default: place agent file relative to dest
  const parentGitRoot = detectParentGitRepo(dest);
  if (parentGitRoot) {
    console.log();
    console.log(`${CYAN}${BOLD}📦 Monorepo detected${RESET}`);
    console.log(`${DIM}   Git root:  ${parentGitRoot}${RESET}`);
    console.log(`${DIM}   You're in: ${path.resolve(dest)}${RESET}`);
    console.log();
    console.log(`${DIM}squad.agent.md → git root (.github/agents/)${RESET}`);
    console.log(`${DIM}.squad/        → here (${path.basename(path.resolve(dest))}/)${RESET}`);
    console.log();
    // Place the agent file at the git root so Copilot can find it.
    // Team state (.squad/) stays in cwd — resolved via cwd at runtime.
    agentFileRoot = parentGitRoot;
  }

  // Detect squad directory
  const squadInfo = detectSquadDir(dest);

  // ── Worktree guard ────────────────────────────────────────────────
  // Prevent silently scaffolding a duplicate .squad/ when running init
  // from a git worktree that already has .squad/ in the main checkout.
  const mainCheckout = resolveWorktreeMainCheckout(dest);
  if (mainCheckout) {
    const mainSquadDir = path.join(mainCheckout, '.squad');
    if (storage.existsSync(mainSquadDir)) {
      console.log();
      console.log(`${YELLOW}${BOLD}⚠  Git worktree detected${RESET}`);
      console.log(`${YELLOW}   Main checkout: ${mainCheckout}${RESET}`);
      console.log(`${YELLOW}   .squad/ already exists there.${RESET}`);
      console.log();
      console.log(`  ${BOLD}[s]${RESET} Use shared .squad/ from main checkout ${DIM}(recommended)${RESET}`);
      console.log(`  ${BOLD}[l]${RESET} Create a worktree-local .squad/ in this branch`);
      console.log();

      let useShared = true;
      if (process.stdin.isTTY) {
        const { createInterface } = await import('node:readline/promises');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = (await rl.question(`  Strategy [s/l, default: s]: `)).trim().toLowerCase();
          useShared = answer !== 'l' && answer !== 'local';
        } finally {
          rl.close();
        }
      } else {
        console.log(`  ${DIM}Non-interactive mode — defaulting to shared strategy.${RESET}`);
      }

      if (useShared) {
        console.log();
        console.log(`${GREEN}${BOLD}✓${RESET} Using shared .squad/ from ${mainCheckout}`);
        console.log(`${DIM}  No changes made. Run squad commands from the main checkout.${RESET}`);
        console.log();
        return;
      }

      // Local strategy: fall through to scaffold .squad/ in this worktree
      console.log();
      console.log(`${GREEN}${BOLD}→${RESET} Creating worktree-local .squad/ in ${dest}`);
      console.log();
    }
  }

  // Show deprecation warning if using .ai-team/
  if (squadInfo.isLegacy) {
    showDeprecationWarning();
  }

  // Build SDK options
  const initOptions: InitOptions = {
    teamRoot: dest,
    agentFileRoot,
    projectName: path.basename(dest) || 'my-project',
    agents: [
      {
        name: 'scribe',
        role: 'scribe',
        displayName: 'Scribe',
      },
      {
        name: 'ralph',
        role: 'ralph',
        displayName: 'Ralph',
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
    roles: options.roles,
  };

  // Handle SIGINT to cleanup orphan .init-prompt
  const squadDir = squadInfo.path;
  const sigintHandler = async () => {
    await cleanupOrphanInitPrompt(squadDir);
    process.exit(130);
  };
  process.on('SIGINT', sigintHandler);

  // Run SDK init — the CLI init is a thin ceremony wrapper around sdkInitSquad(),
  // which handles all file scaffolding, template expansion, and directory creation.
  // This separation allows the SDK to be used headlessly (e.g. in tests or CI)
  // while the CLI adds interactive UX (typewriter, celebrations, worktree guard).
  let result;
  try {
    result = await sdkInitSquad(initOptions);
  } catch (err: unknown) {
    process.off('SIGINT', sigintHandler);
    const message = err instanceof Error ? err.message : String(err);
    fatal(`Failed to initialize squad: ${message}`);
    return; // Unreachable but makes TS happy
  }

  process.off('SIGINT', sigintHandler);

  // Ensure version is fully stamped in squad.agent.md
  const agentPath = path.join(agentFileRoot, '.github', 'agents', 'squad.agent.md');
  if (storage.existsSync(agentPath)) {
    stampVersion(agentPath, version);
  }

  // Persist --roles flag for the REPL to pick up during casting
  if (options.roles) {
    const rolesMarker = path.join(squadDir, '.init-roles');
    storage.writeSync(rolesMarker, '1');
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

  // ── APM manifest ─────────────────────────────────────────────────────────────
  // Generate apm.yml so skills are ready for APM publishing/installation.
  // Uses the project name derived from the directory basename.
  const projectName = path.basename(dest) || 'my-project';
  const apmPath = path.join(dest, 'apm.yml');
  const apmAlreadyExisted = fs.existsSync(apmPath);
  generateApmYml(dest, projectName);
  if (!apmAlreadyExisted) {
    success('apm.yml');
  } else {
    console.log(`${DIM}apm.yml already exists — skipping${RESET}`);
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

  // ── Personal squad bridge ───────────────────────────────────────────
  if (options.isGlobal) {
    // Global init: ensure personal-squad/ directory exists alongside .squad/
    const personalDir = ensurePersonalSquadDir();
    console.log(`${GREEN}${BOLD}✓${RESET} Personal squad initialized at ${DIM}${personalDir}${RESET}`);
    console.log(`${DIM}  Add agents with: squad personal add <name> --role <role>${RESET}`);
    console.log();
  } else {
    // Repo init: inform user if personal squad is available
    const personalDir = resolvePersonalSquadDir();
    if (personalDir) {
      console.log(`${GREEN}${BOLD}✓${RESET} Personal squad detected — your personal agents will be available here.`);
      console.log();
    }
  }

  if (squadInfo.isLegacy) {
    showDeprecationWarning();
  }
}
