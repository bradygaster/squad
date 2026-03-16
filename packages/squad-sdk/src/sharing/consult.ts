/**
 * Consult mode SDK — setup, extraction, license detection, learning classification.
 *
 * This module provides the complete SDK surface for consult mode:
 *
 * High-level operations (mirror CLI commands):
 * - setupConsultMode(): Initialize consult mode in a project
 * - extractLearnings(): Extract learnings from a consult session
 *
 * Low-level utilities (used by high-level operations):
 * - detectLicense(): Identify project license type (permissive/copyleft/unknown)
 * - logConsultation(): Write/append consultation log entries
 * - mergeToPersonalSquad(): Merge generic learnings to personal squad
 *
 * @module sharing/consult
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { AgentHistory, HistoryEntry } from './history-split.js';
import { resolveGlobalSquadPath } from '../resolution.js';

// Re-export types for convenience
export type { AgentHistory, HistoryEntry } from './history-split.js';

// ============================================================================
// Typed Errors
// ============================================================================

/**
 * Thrown when setupConsultMode is called but no personal squad exists.
 * Consumers can catch this specifically to prompt users to run `squad init --global`.
 */
export class PersonalSquadNotFoundError extends Error {
  constructor() {
    super('No personal squad found. Run `squad init --global` first to create your personal squad.');
    this.name = 'PersonalSquadNotFoundError';
  }
}

/**
 * Error thrown when extraction is disabled for a consult session.
 * Consumers can catch this specifically to suggest using --force.
 */
export class ExtractionDisabledError extends Error {
  constructor() {
    super(
      'Extraction is disabled for this consult session.\n' +
      'This was configured in your personal squad settings.\n' +
      'Use --force to override.',
    );
    this.name = 'ExtractionDisabledError';
  }
}

// ============================================================================
// Consult Mode Agent File
// ============================================================================

/**
 * Consult mode preamble to inject after frontmatter in squad.agent.md.
 * This tells Squad it's in consult mode and should skip Init Mode.
 */
const CONSULT_MODE_PREAMBLE = `
<!-- consult-mode: true -->

## ⚡ Consult Mode Active

This project is in **consult mode**. Your personal squad has been copied into \`.squad/\` for this session.

**Key differences from normal mode:**
- **Skip Init Mode** — The team already exists (copied from your personal squad)
- **Isolated changes** — All changes stay local until you run \`squad extract\`
- **Invisible to project** — Both \`.squad/\` and this agent file are in \`.git/info/exclude\`

**When done:** Run \`squad extract\` to review learnings and merge generic ones back to your personal squad.

---

`;

/**
 * Get the full squad.agent.md template path.
 * Looks in the SDK package's templates directory.
 */
function getSquadAgentTemplatePath(): string | null {
  // Use fileURLToPath for cross-platform compatibility (handles Windows drive letters, URL encoding)
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  
  // Try relative to this file (in dist/)
  const distPath = path.resolve(currentDir, '../../templates/squad.agent.md');
  if (fs.existsSync(distPath)) {
    return distPath;
  }
  
  // Try relative to package root
  const pkgPath = path.resolve(currentDir, '../../../templates/squad.agent.md');
  if (fs.existsSync(pkgPath)) {
    return pkgPath;
  }
  
  return null;
}

/**
 * Get the git remote URL for a repository.
 * Converts SSH URLs to HTTPS format for display.
 */
function getGitRemoteUrl(projectRoot: string): string | undefined {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Convert SSH URL to HTTPS for readability
    // git@github.com:owner/repo.git → https://github.com/owner/repo
    if (remoteUrl.startsWith('git@')) {
      const match = remoteUrl.match(/git@([^:]+):(.+?)(\.git)?$/);
      if (match) {
        return `https://${match[1]}/${match[2]}`;
      }
    }

    // Remove .git suffix if present
    return remoteUrl.replace(/\.git$/, '');
  } catch {
    return undefined;
  }
}

/**
 * Generate squad.agent.md for consult mode.
 * Uses the full template with consult mode preamble injected.
 */
function getConsultAgentContent(projectName: string): string {
  const templatePath = getSquadAgentTemplatePath();
  
  if (templatePath && fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    // Find the end of frontmatter (second ---)
    const frontmatterEnd = template.indexOf('---', template.indexOf('---') + 3);
    if (frontmatterEnd !== -1) {
      const insertPoint = frontmatterEnd + 3;
      const before = template.slice(0, insertPoint);
      const after = template.slice(insertPoint);
      
      // Update description in frontmatter for consult mode
      const updatedBefore = before.replace(
        /description:\s*"[^"]*"/,
        `description: "Your AI team. Consulting on ${projectName} using your personal squad."`
      );
      
      return updatedBefore + '\n' + CONSULT_MODE_PREAMBLE + after;
    }
    
    // Fallback: prepend preamble
    return template + '\n' + CONSULT_MODE_PREAMBLE;
  }
  
  // Fallback: minimal agent if template not found
  return `---
name: Squad
description: "Your AI team. Consulting on ${projectName} using your personal squad."
---

${CONSULT_MODE_PREAMBLE}

You are **Squad (Consultant)** — working on **${projectName}** using a copy of your personal squad.

### Available Context (local copy in .squad/)

- **Team:** \`.squad/team.md\` for roster and roles
- **Routing:** \`.squad/routing.md\` for task routing rules  
- **Decisions:** \`.squad/decisions.md\` for your established patterns
- **Skills:** \`.copilot/skills/\` for reusable capabilities
- **Agents:** \`.squad/agents/\` for your squad agents

Work as you would with your personal squad, but in this external codebase.
`;
}

// ============================================================================
// Scribe Charter Patching for Consult Mode
// ============================================================================

/**
 * Consult mode instructions to append to Scribe charter.
 * This enables Scribe to classify decisions as generic or project-specific.
 */
const CONSULT_MODE_SCRIBE_PATCH = `

---

## Consult Mode Extraction

**This squad is in consult mode.** When merging decisions from the inbox, also classify each decision:

### Classification

For each decision in \`.squad/decisions/inbox/\`:

1. **Generic** (applies to any project) → Copy to \`.squad/extract/\` with the same filename
   - Signals: "always use", "never use", "prefer X over Y", "best practice", coding standards, patterns that work anywhere
   - These will be extracted to the personal squad via \`squad extract\`

2. **Project-specific** (only applies here) → Keep in local \`decisions.md\` only
   - Signals: Contains file paths from this project, references "this project/codebase/repo", mentions project-specific config/APIs/schemas

Generic decisions go to BOTH \`.squad/decisions.md\` (for this session) AND \`.squad/extract/\` (for later extraction).

### Extract Directory

\`\`\`
.squad/extract/           # Generic learnings staged for personal squad
├── decision-1.md         # Ready for extraction
└── pattern-auth.md       # Ready for extraction
\`\`\`

Run \`squad extract\` to review and merge these to your personal squad.
`;

/**
 * Patch the Scribe charter in the copied squad with consult mode instructions.
 */
function patchScribeCharterForConsultMode(squadDir: string): void {
  const charterPath = path.join(squadDir, 'agents', 'scribe', 'charter.md');
  
  if (!fs.existsSync(charterPath)) {
    // No scribe charter to patch — skip silently
    return;
  }

  const existing = fs.readFileSync(charterPath, 'utf-8');
  
  // Don't patch if already patched
  if (existing.includes('Consult Mode Extraction')) {
    return;
  }

  fs.appendFileSync(charterPath, CONSULT_MODE_SCRIBE_PATCH);
}

/**
 * List files recursively in a directory.
 */
function listFilesInDir(dir: string, basePath = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFilesInDir(path.join(dir, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  
  return files;
}

// ============================================================================
// Setup Consult Mode
// ============================================================================

/**
 * Options for setting up consult mode.
 */
export interface SetupConsultModeOptions {
  /** Project root directory (default: cwd) */
  projectRoot?: string;
  /** Path to personal squad root (auto-resolved if not provided) */
  personalSquadRoot?: string;
  /** If true, don't modify any files — just return what would happen */
  dryRun?: boolean;
  /** Override project name (default: basename of projectRoot). Useful for worktrees. */
  projectName?: string;
  /** If true, disable extraction back to personal squad (read-only consultation) */
  extractionDisabled?: boolean;
}

/**
 * Result of setupConsultMode().
 */
export interface SetupConsultModeResult {
  /** Path to project .squad/ directory */
  squadDir: string;
  /** Path to personal squad root */
  personalSquadRoot: string;
  /** Path to git exclude file */
  gitExclude: string;
  /** Project name (basename of project root) */
  projectName: string;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Path to created agent file (.github/agents/squad.agent.md) */
  agentFile: string;
  /** List of created file paths (relative to squadDir) */
  createdFiles: string[];
  /** Whether extraction is disabled for this consult session */
  extractionDisabled: boolean;
}

/**
 * Get the personal squad root path.
 * Returns {globalSquadPath}/.squad/
 */
export function getPersonalSquadRoot(): string {
  return path.resolve(resolveGlobalSquadPath(), '.squad');
}

/**
 * Resolve the git exclude path using git rev-parse (handles worktrees/submodules).
 *
 * @param cwd - Working directory inside the git repo
 * @throws Error if not a git repository
 */
export function resolveGitExcludePath(cwd: string): string {
  try {
    return execSync('git rev-parse --git-path info/exclude', {
      cwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    throw new Error('Not a git repository. Consult mode requires git.');
  }
}

/**
 * Set up consult mode in a project.
 *
 * Creates .squad/ with consult: true, pointing to your personal squad.
 * Creates .github/agents/squad.agent.md for `gh copilot --agent squad` support.
 * Both are hidden via .git/info/exclude (never committed).
 *
 * @param options - Setup options
 * @returns Setup result with paths and metadata
 * @throws Error if not a git repo, personal squad missing, or already squadified
 */
export async function setupConsultMode(
  options: SetupConsultModeOptions = {},
): Promise<SetupConsultModeResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const personalSquadRoot = options.personalSquadRoot || getPersonalSquadRoot();
  const dryRun = options.dryRun ?? false;

  const squadDir = path.resolve(projectRoot, '.squad');
  const projectName = options.projectName || path.basename(projectRoot);
  const agentFile = path.resolve(projectRoot, '.github', 'agents', 'squad.agent.md');

  // Check if we're in a git repository (handle worktrees/submodules where .git is a file)
  const gitPath = path.resolve(projectRoot, '.git');
  if (!fs.existsSync(gitPath)) {
    throw new Error('Not a git repository. Consult mode requires git.');
  }

  // Resolve exclude path via git rev-parse (handles worktrees/submodules)
  // Normalize to absolute path in case it's relative
  const gitExclude = (() => {
    const excludePath = resolveGitExcludePath(projectRoot);
    return path.isAbsolute(excludePath) ? excludePath : path.resolve(projectRoot, excludePath);
  })();

  // Check if personal squad exists
  if (!fs.existsSync(personalSquadRoot)) {
    throw new PersonalSquadNotFoundError();
  }

  // Read source squad's config to inherit extractionDisabled setting
  // Option takes precedence, then fall back to source config
  let extractionDisabled = options.extractionDisabled ?? false;
  const sourceConfigPath = path.join(personalSquadRoot, 'config.json');
  if (fs.existsSync(sourceConfigPath)) {
    try {
      const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf-8'));
      // Inherit from source unless explicitly overridden in options
      if (options.extractionDisabled === undefined && sourceConfig.extractionDisabled) {
        extractionDisabled = true;
      }
    } catch {
      // Ignore malformed config
    }
  }

  // Check if project already has .squad/
  if (fs.existsSync(squadDir)) {
    throw new Error(
      'This project already has a .squad/ directory. Cannot use consult mode on squadified projects.',
    );
  }

  // List files in personal squad (for dry run preview or later count)
  const sourceFiles = listFilesInDir(personalSquadRoot);

  if (!dryRun) {
    // Copy personal squad contents into project's .squad/
    // This isolates changes during the consult session
    fs.cpSync(personalSquadRoot, squadDir, { recursive: true });

    // Write/overwrite config.json with consult: true
    // Include SquadDirConfig fields so loadDirConfig() can read it
    // Note: version must be numeric for loadDirConfig() compatibility
    const config = {
      version: 1,
      teamRoot: personalSquadRoot,
      consult: true,
      sourceSquad: personalSquadRoot,
      projectName,
      createdAt: new Date().toISOString(),
      extractionDisabled,
    };
    fs.writeFileSync(
      path.join(squadDir, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf-8',
    );

    // Create sessions directory for tracking (if not copied)
    const sessionsDir = path.join(squadDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    // Create extract/ directory for staging generic learnings
    const extractDir = path.join(squadDir, 'extract');
    fs.mkdirSync(extractDir, { recursive: true });

    // Patch scribe-charter.md with consult mode extraction instructions
    patchScribeCharterForConsultMode(squadDir);

    // Create .github/agents/squad.agent.md for `gh copilot --agent squad`
    const agentDir = path.dirname(agentFile);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    fs.writeFileSync(agentFile, getConsultAgentContent(projectName), 'utf-8');

    // Add .squad/ and .github/agents/squad.agent.md to .git/info/exclude
    const excludeDir = path.dirname(gitExclude);
    if (!fs.existsSync(excludeDir)) {
      fs.mkdirSync(excludeDir, { recursive: true });
    }
    const excludeContent = fs.existsSync(gitExclude)
      ? fs.readFileSync(gitExclude, 'utf-8')
      : '';
    const excludeLines: string[] = [];
    if (!excludeContent.includes('.squad/')) {
      excludeLines.push('.squad/');
    }
    if (!excludeContent.includes('.github/agents/squad.agent.md')) {
      excludeLines.push('.github/agents/squad.agent.md');
    }
    if (excludeLines.length > 0) {
      fs.appendFileSync(gitExclude, '\n# Squad consult mode (local only)\n' + excludeLines.join('\n') + '\n');
    }
  }

  // List files created (from squad dir after copy, or from source for dry run)
  const createdFiles = dryRun ? sourceFiles : listFilesInDir(squadDir);

  return {
    squadDir,
    personalSquadRoot,
    gitExclude,
    projectName,
    dryRun,
    agentFile,
    createdFiles,
    extractionDisabled,
  };
}

// ============================================================================
// Extract Learnings
// ============================================================================

/**
 * Options for extracting learnings from a consult session.
 */
export interface ExtractLearningsOptions {
  /** Project root directory (default: cwd) */
  projectRoot?: string;
  /** Path to personal squad root (auto-resolved if not provided) */
  personalSquadRoot?: string;
  /** If true, don't modify files — just return staged learnings */
  dryRun?: boolean;
  /** If true, delete project .squad/ after extraction */
  clean?: boolean;
  /** If true, allow extraction from copyleft-licensed projects */
  acceptRisks?: boolean;
  /** Optional callback to select which learnings to extract (for interactive mode) */
  selectLearnings?: (learnings: StagedLearning[]) => Promise<StagedLearning[]>;
  /** Override project name (default: basename of projectRoot). Useful for worktrees. */
  projectName?: string;
  /** If true, override extractionDisabled setting in config */
  force?: boolean;
}

/**
 * Full result of extractLearnings().
 */
export interface ExtractLearningsResult extends ExtractionResult {
  /** Whether extraction was blocked by license */
  blocked: boolean;
  /** Number of decisions merged */
  decisionsMerged: number;
  /** Number of skills created (future) */
  skillsCreated: number;
  /** Path to consultation log file */
  consultationLogPath?: string;
  /** Whether project .squad/ was cleaned up */
  cleaned: boolean;
}

/**
 * Load session history from .squad/sessions/ directory.
 *
 * @param squadDir - Path to project .squad/ directory
 * @returns AgentHistory with entries from session files
 */
export function loadSessionHistory(squadDir: string): AgentHistory {
  const sessionsDir = path.join(squadDir, 'sessions');
  const entries: HistoryEntry[] = [];

  if (!fs.existsSync(sessionsDir)) {
    return { entries };
  }

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(sessionsDir, file), 'utf-8');
      const session = JSON.parse(content);

      // Extract learnings from session data
      if (session.learnings && Array.isArray(session.learnings)) {
        for (const learning of session.learnings) {
          entries.push({
            id: learning.id || `${file}-${entries.length}`,
            timestamp: learning.timestamp || session.timestamp || new Date().toISOString(),
            type: learning.type || 'pattern',
            content: learning.content || String(learning),
            agent: learning.agent,
          });
        }
      }

      // Extract decisions
      if (session.decisions && Array.isArray(session.decisions)) {
        for (const decision of session.decisions) {
          entries.push({
            id: decision.id || `${file}-decision-${entries.length}`,
            timestamp: decision.timestamp || session.timestamp || new Date().toISOString(),
            type: 'decision',
            content: decision.content || String(decision),
            agent: decision.agent,
          });
        }
      }
    } catch {
      // Skip malformed session files
    }
  }

  return { entries };
}

/**
 * Extract learnings from a consult mode session.
 *
 * Reads staged learnings from .squad/extract/ (classified by Scribe during session)
 * and optionally merges approved items to your personal squad.
 *
 * @param options - Extraction options
 * @returns Extraction result with learnings, merge stats, and paths
 * @throws Error if not in consult mode or license blocks extraction
 */
export async function extractLearnings(
  options: ExtractLearningsOptions = {},
): Promise<ExtractLearningsResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const personalSquadRoot = options.personalSquadRoot || getPersonalSquadRoot();
  const dryRun = options.dryRun ?? false;
  const clean = options.clean ?? false;
  const acceptRisks = options.acceptRisks ?? false;
  const force = options.force ?? false;

  const squadDir = path.resolve(projectRoot, '.squad');
  const projectName = options.projectName || path.basename(projectRoot);

  // Check if we're in consult mode
  if (!fs.existsSync(squadDir)) {
    throw new Error('Not in consult mode. No .squad/ directory found.');
  }

  const configPath = path.join(squadDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Invalid consult mode: missing config.json');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.consult) {
    throw new Error(
      'This project has a .squad/ but is not in consult mode. Use normal squad commands.',
    );
  }

  // Check if extraction is disabled for this consult session
  if (config.extractionDisabled && !force) {
    throw new ExtractionDisabledError();
  }

  // Detect license
  const licensePath = path.join(projectRoot, 'LICENSE');
  const licenseContent = fs.existsSync(licensePath)
    ? fs.readFileSync(licensePath, 'utf-8')
    : '';
  const license = detectLicense(licenseContent);

  // Block copyleft extraction unless --accept-risks
  const blocked = license.type === 'copyleft' && !acceptRisks;

  // Get repository URL for logging
  const repoUrl = getGitRemoteUrl(projectRoot);

  if (blocked) {
    return {
      extracted: [],
      skipped: [],
      license,
      projectName,
      repoUrl,
      timestamp: new Date().toISOString(),
      acceptedRisks: false,
      blocked: true,
      decisionsMerged: 0,
      skillsCreated: 0,
      cleaned: false,
    };
  }

  // Load staged learnings from .squad/extract/
  let staged = loadStagedLearnings(squadDir);

  // If interactive selection callback provided, let user choose
  let skipped: StagedLearning[] = [];
  if (options.selectLearnings && staged.length > 0) {
    const selected = await options.selectLearnings(staged);
    const selectedFilenames = new Set(selected.map(l => l.filename));
    skipped = staged.filter(l => !selectedFilenames.has(l.filename));
    staged = selected;
  }

  const result: ExtractionResult = {
    extracted: staged,
    skipped,
    license,
    projectName,
    repoUrl,
    timestamp: new Date().toISOString(),
    acceptedRisks: acceptRisks,
  };

  let decisionsMerged = 0;
  let skillsCreated = 0;
  let consultationLogPath: string | undefined;
  let cleaned = false;

  if (!dryRun && staged.length > 0) {
    // Merge to personal squad
    const mergeResult = await mergeToPersonalSquad(staged, personalSquadRoot);
    decisionsMerged = mergeResult.decisions;
    skillsCreated = mergeResult.skills;

    // Log consultation
    consultationLogPath = await logConsultation(personalSquadRoot, result);

    // Remove extracted files from .squad/extract/
    for (const learning of staged) {
      fs.rmSync(learning.filepath, { force: true });
    }
  }

  // Clean up entire .squad/ if requested
  if (clean && !dryRun) {
    fs.rmSync(squadDir, { recursive: true, force: true });
    cleaned = true;
  }

  return {
    ...result,
    blocked: false,
    decisionsMerged,
    skillsCreated,
    consultationLogPath,
    cleaned,
  };
}

// ============================================================================
// License Detection
// ============================================================================

/**
 * License classification result.
 */
export interface LicenseInfo {
  type: 'permissive' | 'copyleft' | 'unknown';
  spdxId?: string;
  name?: string;
  filePath?: string;
}

const COPYLEFT_LICENSES = [
  'GPL',
  'AGPL',
  'LGPL',
  'MPL',
  'EPL',
  'CDDL',
  'CC-BY-SA',
] as const;

const PERMISSIVE_LICENSES = [
  'MIT',
  'Apache',
  'BSD',
  'ISC',
  'Unlicense',
  'CC0',
  'WTFPL',
] as const;

/**
 * Escape a string so it can be safely used inside a RegExp pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect license type from LICENSE file content.
 *
 * @param licenseContent - Raw content of the LICENSE file
 * @returns License classification with type, optional SPDX ID, and name
 */
export function detectLicense(licenseContent: string): LicenseInfo {
  const content = licenseContent;
  const upperContent = licenseContent.toUpperCase();

  // 1. Prefer SPDX identifiers when present.
  const spdxMatch = content.match(/SPDX-License-Identifier:\s*([^\s*]+)/i);
  if (spdxMatch && spdxMatch[1]) {
    const spdxId = spdxMatch[1];
    const spdxIdUpper = spdxId.toUpperCase();

    const copyleftUpper = COPYLEFT_LICENSES.map(id => id.toUpperCase());
    const permissiveUpper = PERMISSIVE_LICENSES.map(id => id.toUpperCase());

    // Check for copyleft first (LGPL should match before GPL)
    for (const license of copyleftUpper) {
      if (spdxIdUpper.includes(license)) {
        return { type: 'copyleft', spdxId, name: spdxId };
      }
    }
    for (const license of permissiveUpper) {
      if (spdxIdUpper.includes(license)) {
        return { type: 'permissive', spdxId, name: spdxId };
      }
    }
    return { type: 'unknown', spdxId, name: spdxId };
  }

  // 2. Fallback: word-boundary regex, longest-first to avoid
  //    misclassifying e.g. "LGPL" as "GPL".
  const detectFromList = (
    licenses: readonly string[],
    type: LicenseInfo['type'],
  ): LicenseInfo | null => {
    const sorted = [...licenses].sort((a, b) => b.length - a.length);
    for (const license of sorted) {
      const pattern = new RegExp(
        `\\b${escapeRegex(license.toUpperCase())}\\b`,
        'i',
      );
      if (pattern.test(upperContent)) {
        return { type, spdxId: license, name: license };
      }
    }
    return null;
  };

  // Check copyleft first (more restrictive)
  const copyleftMatch = detectFromList(COPYLEFT_LICENSES, 'copyleft');
  if (copyleftMatch) return copyleftMatch;

  const permissiveMatch = detectFromList(PERMISSIVE_LICENSES, 'permissive');
  if (permissiveMatch) return permissiveMatch;

  return { type: 'unknown' };
}

// ============================================================================
// Staged Learnings (from .squad/extract/)
// ============================================================================

/**
 * A learning staged by Scribe for extraction to personal squad.
 * Files in .squad/extract/ are markdown files with decision content.
 */
export interface StagedLearning {
  /** Filename (e.g., "use-zod-validation.md") */
  filename: string;
  /** Full path to the file */
  filepath: string;
  /** Content of the file */
  content: string;
}

/**
 * Load staged learnings from .squad/extract/ directory.
 * These are generic learnings that Scribe classified during the session.
 *
 * @param squadDir - Path to project .squad/ directory
 * @returns Array of staged learnings
 */
export function loadStagedLearnings(squadDir: string): StagedLearning[] {
  const extractDir = path.join(squadDir, 'extract');
  const learnings: StagedLearning[] = [];

  if (!fs.existsSync(extractDir)) {
    return learnings;
  }

  const files = fs.readdirSync(extractDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filepath = path.join(extractDir, file);
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      learnings.push({
        filename: file,
        filepath,
        content,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return learnings;
}

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * Result of the extraction process.
 */
export interface ExtractionResult {
  /** Learnings extracted to personal squad */
  extracted: StagedLearning[];
  /** Learnings rejected by user */
  skipped: StagedLearning[];
  /** Project license info */
  license: LicenseInfo;
  /** Project name (for consultation log) */
  projectName: string;
  /** Extraction timestamp (ISO 8601) */
  timestamp: string;
  /** Whether --accept-risks was used */
  acceptedRisks: boolean;
  /** Repository URL (GitHub, etc.) */
  repoUrl?: string;
}

// ============================================================================
// Consultation Logging
// ============================================================================

/**
 * Write or append a consultation log entry to the personal squad.
 *
 * Creates the consultations directory if it doesn't exist.
 * For new projects, creates a full header; for existing projects, appends session entry.
 *
 * @param personalSquadRoot - Path to personal squad root (e.g. ~/.config/squad/.squad)
 * @param result - Extraction result with learnings and metadata
 * @returns Path to the consultation log file
 */
export async function logConsultation(
  personalSquadRoot: string,
  result: ExtractionResult,
): Promise<string> {
  const consultDir = path.join(personalSquadRoot, 'consultations');
  const logPath = path.join(consultDir, `${result.projectName}.md`);

  // Create consultations directory if needed
  if (!fs.existsSync(consultDir)) {
    fs.mkdirSync(consultDir, { recursive: true });
  }

  const today = result.timestamp.split('T')[0] ?? new Date().toISOString().split('T')[0]!; // YYYY-MM-DD format

  if (fs.existsSync(logPath)) {
    // Append to existing log — update "Last session" and add new entry
    let content = fs.readFileSync(logPath, 'utf-8');

    // Update "Last session" date
    content = content.replace(
      /\*\*Last session:\*\* \d{4}-\d{2}-\d{2}/,
      `**Last session:** ${today}`,
    );

    // Build session entry
    const sessionEntry = formatSessionEntry(result, today);

    // Append to file
    fs.writeFileSync(logPath, content + sessionEntry, 'utf-8');
  } else {
    // Create new consultation log with full header
    const header = formatLogHeader(result, today);
    const sessionEntry = formatSessionEntry(result, today);
    fs.writeFileSync(logPath, header + sessionEntry, 'utf-8');
  }

  return logPath;
}

/**
 * Format the header for a new consultation log file.
 */
function formatLogHeader(result: ExtractionResult, date: string): string {
  const repoLine = result.repoUrl
    ? `**Repository:** ${result.repoUrl}\n`
    : '';
  const licenseName = result.license.spdxId || result.license.name || result.license.type;

  return `# ${result.projectName}

${repoLine}**First consulted:** ${date}
**Last session:** ${date}
**License:** ${licenseName}

## Extracted Learnings

`;
}

/**
 * Format a session entry for the consultation log.
 */
function formatSessionEntry(result: ExtractionResult, date: string): string {
  if (result.extracted.length === 0) {
    return `### ${date}
- No learnings extracted

`;
  }

  // Just list titles/filenames, not content
  const lines = result.extracted.map(l => `- ${l.filename}`);

  return `### ${date}
${lines.join('\n')}

`;
}

// ============================================================================
// Merge to Personal Squad
// ============================================================================

/**
 * Check if content looks like a skill (has YAML frontmatter with skill markers).
 */
function isSkillContent(content: string): boolean {
  // Skills have YAML frontmatter with name/confidence/domain
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch || !frontmatterMatch[1]) return false;

  const frontmatter = frontmatterMatch[1];
  // Must have at least name and confidence to be a skill
  return frontmatter.includes('name:') && frontmatter.includes('confidence:');
}

/**
 * Extract skill name from YAML frontmatter.
 */
function extractSkillName(content: string): string | null {
  const match = content.match(/^---\n[\s\S]*?name:\s*["']?([^"'\n]+)["']?/);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Merge staged learnings into personal squad.
 *
 * Routes skills to personal squad directory via resolveGlobalSquadPath() to .copilot/skills/{name}/SKILL.md
 * Routes decisions to decisions.md in personal squad directory (with smart merge)
 *
 * @param learnings - Staged learnings to merge
 * @param personalSquadRoot - Path to personal squad root
 */
export async function mergeToPersonalSquad(
  learnings: StagedLearning[],
  personalSquadRoot: string,
): Promise<{ decisions: number; skills: number }> {
  if (learnings.length === 0) {
    return { decisions: 0, skills: 0 };
  }

  let decisionsAdded = 0;
  let skillsAdded = 0;

  const decisions: StagedLearning[] = [];
  const skills: StagedLearning[] = [];

  // Classify learnings
  for (const learning of learnings) {
    if (isSkillContent(learning.content)) {
      skills.push(learning);
    } else {
      decisions.push(learning);
    }
  }

  // Route skills to personal squad directory (via resolveGlobalSquadPath()) at .copilot/skills/{name}/SKILL.md
  const skillsDir = path.join(path.dirname(personalSquadRoot), '.copilot', 'skills');
  for (const skill of skills) {
    const skillName = extractSkillName(skill.content) || skill.filename.replace('.md', '');
    const skillDir = path.join(skillsDir, skillName);

    // Create skill directory if needed
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const skillPath = path.join(skillDir, 'SKILL.md');

    // Write skill (overwrites if exists — newer extraction wins)
    fs.writeFileSync(skillPath, skill.content, 'utf-8');
    skillsAdded++;
  }

  // Route decisions to personal squad directory at decisions.md
  if (decisions.length > 0) {
    const decisionsPath = path.join(personalSquadRoot, 'decisions.md');
    const newContent = decisions.map(d => d.content.trim()).join('\n\n');

    if (fs.existsSync(decisionsPath)) {
      const existing = fs.readFileSync(decisionsPath, 'utf-8');

      // Check if we already have an "Extracted from Consultations" section
      if (existing.includes('## Extracted from Consultations')) {
        // Append under the existing section (before any subsequent ## heading)
        const parts = existing.split('## Extracted from Consultations');
        const beforeSection = parts[0];
        const afterSection = parts[1] ?? '';

        // Find where the next section starts (if any)
        const nextSectionMatch = afterSection.match(/\n## /);
        if (nextSectionMatch && nextSectionMatch.index !== undefined) {
          // Insert before next section
          const sectionContent = afterSection.slice(0, nextSectionMatch.index);
          const rest = afterSection.slice(nextSectionMatch.index);
          fs.writeFileSync(
            decisionsPath,
            beforeSection +
              '## Extracted from Consultations' +
              sectionContent.trimEnd() +
              '\n\n' +
              newContent +
              '\n' +
              rest,
            'utf-8',
          );
        } else {
          // No next section — append to end
          fs.writeFileSync(
            decisionsPath,
            existing.trimEnd() + '\n\n' + newContent + '\n',
            'utf-8',
          );
        }
      } else {
        // No extraction section yet — create one
        fs.writeFileSync(
          decisionsPath,
          existing.trimEnd() + '\n\n## Extracted from Consultations\n\n' + newContent + '\n',
          'utf-8',
        );
      }
    } else {
      // Create new decisions file
      fs.writeFileSync(
        decisionsPath,
        `# Squad Decisions\n\n## Extracted from Consultations\n\n${newContent}\n`,
        'utf-8',
      );
    }
    decisionsAdded = decisions.length;
  }

  return { decisions: decisionsAdded, skills: skillsAdded };
}
