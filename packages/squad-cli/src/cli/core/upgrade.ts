/**
 * Squad upgrade command — overwrites squad-owned files, runs migrations
 * Zero-dep implementation using Node.js stdlib only
 * @module cli/core/upgrade
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { success, warn, info, dim, bold } from './output.js';
import { fatal } from './errors.js';
import { detectSquadDir } from './detect-squad-dir.js';
import { TEMPLATE_MANIFEST, getTemplatesDir } from './templates.js';
import { runMigrations } from './migrations.js';
import { scrubEmails } from './email-scrub.js';
import { getPackageVersion, stampVersion, readInstalledVersion } from './version.js';

const storage = new FSStorageProvider();

function copyDirRecursive(src: string, dest: string, force = true): void {
  storage.mkdirSync(dest, { recursive: true });
  for (const entry of storage.listSync(src)) {
    const srcEntry = path.join(src, entry);
    const destEntry = path.join(dest, entry);
    if (storage.isDirectorySync(srcEntry)) {
      copyDirRecursive(srcEntry, destEntry, force);
    } else if (force || !storage.existsSync(destEntry)) {
      storage.copySync(srcEntry, destEntry);
    }
  }
}

export interface UpgradeOptions {
  migrateDirectory?: boolean;
  self?: boolean;
  force?: boolean;
}

export interface UpdateInfo {
  fromVersion: string;
  toVersion: string;
  filesUpdated: string[];
  migrationsRun: string[];
}

/**
 * Compare semver strings: -1 (a<b), 0 (a==b), 1 (a>b)
 */
function compareSemver(a: string, b: string): number {
  const stripPre = (v: string) => v.split('-')[0]!;
  const pa = stripPre(a).split('.').map(Number);
  const pb = stripPre(b).split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  
  // Base versions equal — pre-release is less than release
  const aPre = a.includes('-');
  const bPre = b.includes('-');
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre) return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}

/**
 * Detect project type by checking marker files
 */
function detectProjectType(dir: string): string {
  if (storage.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (storage.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (storage.existsSync(path.join(dir, 'requirements.txt')) ||
      storage.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (storage.existsSync(path.join(dir, 'pom.xml')) ||
      storage.existsSync(path.join(dir, 'build.gradle')) ||
      storage.existsSync(path.join(dir, 'build.gradle.kts'))) return 'java';
  
  try {
    const entries = storage.listSync(dir);
    if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln') || 
                         e.endsWith('.slnx') || e.endsWith('.fsproj') || 
                         e.endsWith('.vbproj'))) return 'dotnet';
  } catch {}
  
  return 'unknown';
}

/**
 * Project-type-sensitive workflows that need stubs for non-npm projects
 */
const PROJECT_TYPE_SENSITIVE_WORKFLOWS = new Set([
  'squad-ci.yml',
  'squad-release.yml',
  'squad-preview.yml',
  'squad-insider-release.yml',
  'squad-docs.yml',
]);

/**
 * Generate stub workflow for non-npm projects
 */
function generateProjectWorkflowStub(workflowFile: string, projectType: string): string | null {
  const typeLabel = projectType === 'unknown'
    ? 'Project type was not detected'
    : projectType + ' project';
  const todoBuildCmd = projectType === 'unknown'
    ? '# TODO: Project type was not detected — add your build/test commands here'
    : '# TODO: Add your ' + projectType + ' build/test commands here';
  const buildHints = [
    '          # Go:            go test ./...',
    '          # Python:        pip install -r requirements.txt && pytest',
    '          # .NET:          dotnet test',
    '          # Java (Maven):  mvn test',
    '          # Java (Gradle): ./gradlew test',
  ].join('\n');

  if (workflowFile === 'squad-ci.yml') {
    return 'name: Squad CI\n' +
      '# ' + typeLabel + ' — configure build/test commands below\n\n' +
      'on:\n' +
      '  pull_request:\n' +
      '    branches: [dev, preview, main, insider]\n' +
      '    types: [opened, synchronize, reopened]\n' +
      '  push:\n' +
      '    branches: [dev, insider]\n\n' +
      'permissions:\n' +
      '  contents: read\n\n' +
      'jobs:\n' +
      '  test:\n' +
      '    runs-on: ubuntu-latest\n' +
      '    steps:\n' +
      '      - uses: actions/checkout@v4\n\n' +
      '      - name: Build and test\n' +
      '        run: |\n' +
      '          ' + todoBuildCmd + '\n' +
      buildHints + '\n' +
      '          echo "No build commands configured — update squad-ci.yml"\n';
  }

  if (workflowFile === 'squad-release.yml') {
    return 'name: Squad Release\n' +
      '# ' + typeLabel + ' — configure build, test, and release commands below\n\n' +
      'on:\n' +
      '  push:\n' +
      '    branches: [main]\n\n' +
      'permissions:\n' +
      '  contents: write\n\n' +
      'jobs:\n' +
      '  release:\n' +
      '    runs-on: ubuntu-latest\n' +
      '    steps:\n' +
      '      - uses: actions/checkout@v4\n' +
      '        with:\n' +
      '          fetch-depth: 0\n\n' +
      '      - name: Build and test\n' +
      '        run: |\n' +
      '          ' + todoBuildCmd + '\n' +
      buildHints + '\n' +
      '          echo "No build commands configured — update squad-release.yml"\n\n' +
      '      - name: Create release\n' +
      '        env:\n' +
      '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n' +
      '        run: |\n' +
      '          # TODO: Add your release commands here (e.g., git tag, gh release create)\n' +
      '          echo "No release commands configured — update squad-release.yml"\n';
  }

  if (workflowFile === 'squad-preview.yml') {
    return 'name: Squad Preview Validation\n' +
      '# ' + typeLabel + ' — configure build, test, and validation commands below\n\n' +
      'on:\n' +
      '  push:\n' +
      '    branches: [preview]\n\n' +
      'permissions:\n' +
      '  contents: read\n\n' +
      'jobs:\n' +
      '  validate:\n' +
      '    runs-on: ubuntu-latest\n' +
      '    steps:\n' +
      '      - uses: actions/checkout@v4\n\n' +
      '      - name: Build and test\n' +
      '        run: |\n' +
      '          ' + todoBuildCmd + '\n' +
      buildHints + '\n' +
      '          echo "No build commands configured — update squad-preview.yml"\n\n' +
      '      - name: Validate\n' +
      '        run: |\n' +
      '          # TODO: Add pre-release validation commands here\n' +
      '          echo "No validation commands configured — update squad-preview.yml"\n';
  }

  if (workflowFile === 'squad-insider-release.yml') {
    return 'name: Squad Insider Release\n' +
      '# ' + typeLabel + ' — configure build, test, and insider release commands below\n\n' +
      'on:\n' +
      '  push:\n' +
      '    branches: [insider]\n\n' +
      'permissions:\n' +
      '  contents: write\n\n' +
      'jobs:\n' +
      '  release:\n' +
      '    runs-on: ubuntu-latest\n' +
      '    steps:\n' +
      '      - uses: actions/checkout@v4\n' +
      '        with:\n' +
      '          fetch-depth: 0\n\n' +
      '      - name: Build and test\n' +
      '        run: |\n' +
      '          ' + todoBuildCmd + '\n' +
      buildHints + '\n' +
      '          echo "No build commands configured — update squad-insider-release.yml"\n\n' +
      '      - name: Create insider release\n' +
      '        env:\n' +
      '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n' +
      '        run: |\n' +
      '          # TODO: Add your insider/pre-release commands here\n' +
      '          echo "No release commands configured — update squad-insider-release.yml"\n';
  }

  if (workflowFile === 'squad-docs.yml') {
    return 'name: Squad Docs — Build & Deploy\n' +
      '# ' + typeLabel + ' — configure documentation build commands below\n\n' +
      'on:\n' +
      '  workflow_dispatch:\n' +
      '  push:\n' +
      '    branches: [preview]\n' +
      '    paths:\n' +
      "      - 'docs/**'\n" +
      "      - '.github/workflows/squad-docs.yml'\n\n" +
      'permissions:\n' +
      '  contents: read\n' +
      '  pages: write\n' +
      '  id-token: write\n\n' +
      'jobs:\n' +
      '  build:\n' +
      '    runs-on: ubuntu-latest\n' +
      '    steps:\n' +
      '      - uses: actions/checkout@v4\n\n' +
      '      - name: Build docs\n' +
      '        run: |\n' +
      '          # TODO: Add your documentation build commands here\n' +
      '          # This workflow is optional — remove or customize it for your project\n' +
      '          echo "No docs build commands configured — update or remove squad-docs.yml"\n';
  }

  return null;
}

/**
 * Write workflow file: verbatim copy for npm, stub for others
 */
function writeWorkflowFile(file: string, srcPath: string, destPath: string, projectType: string): void {
  if (projectType !== 'npm' && PROJECT_TYPE_SENSITIVE_WORKFLOWS.has(file)) {
    const stub = generateProjectWorkflowStub(file, projectType);
    if (stub) {
      storage.writeSync(destPath, stub);
      return;
    }
  }
  storage.copySync(srcPath, destPath);
}

/* ── Infrastructure ensure functions ────────────────────────────── */

const GITATTRIBUTES_RULES = [
  '.squad/decisions.md merge=union',
  '.squad/agents/*/history.md merge=union',
  '.squad/log/** merge=union',
  '.squad/orchestration-log/** merge=union',
];

const GITIGNORE_ENTRIES = [
  '.squad/orchestration-log/',
  '.squad/log/',
  '.squad/decisions/inbox/',
  '.squad/sessions/',
  '.squad-workstream',
];

const ENSURE_DIRECTORIES = [
  '.squad/identity',
  '.squad/orchestration-log',
  '.squad/log',
  '.squad/sessions',
  '.squad/decisions/inbox',
  '.copilot/skills',
];

/**
 * Ensure .gitattributes has required merge=union rules (idempotent)
 */
export function ensureGitattributes(dest: string): string[] {
  const filePath = path.join(dest, '.gitattributes');
  let content = '';
  if (storage.existsSync(filePath)) {
    content = storage.readSync(filePath) ?? '';
  }
  const added: string[] = [];
  for (const rule of GITATTRIBUTES_RULES) {
    if (!content.includes(rule)) {
      added.push(rule);
    }
  }
  if (added.length > 0) {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    try {
      storage.writeSync(filePath, content + suffix + added.join('\n') + '\n');
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && ['EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) {
        warn('Could not update .gitattributes (read-only). Add merge=union entries manually.');
        return [];
      }
      throw err;
    }
  }
  return added;
}

/**
 * Check whether an existing gitignore line already covers a candidate entry
 * via parent-directory matching (e.g. `.squad/` covers `.squad/log/`).
 */
function isAlreadyCoveredByParent(entry: string, lines: string[]): boolean {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const parent = trimmed.endsWith('/') ? trimmed : trimmed + '/';
    if (entry.startsWith(parent) && entry !== trimmed) {
      return true;
    }
  }
  return false;
}

/**
 * Ensure .gitignore has required entries (idempotent).
 * Skips entries already covered by a parent path (e.g. `.squad/` covers `.squad/log/`).
 */
export function ensureGitignore(dest: string): string[] {
  const filePath = path.join(dest, '.gitignore');
  let content = '';
  if (storage.existsSync(filePath)) {
    content = storage.readSync(filePath) ?? '';
  }
  const existingLines = content.split('\n');
  const added: string[] = [];
  for (const entry of GITIGNORE_ENTRIES) {
    if (content.includes(entry)) continue;
    if (isAlreadyCoveredByParent(entry, existingLines)) continue;
    added.push(entry);
  }
  if (added.length > 0) {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    storage.writeSync(filePath, content + suffix + added.join('\n') + '\n');
  }
  return added;
}

/**
 * Create missing infrastructure directories
 */
export function ensureDirectories(dest: string): string[] {
  const created: string[] = [];
  for (const dir of ENSURE_DIRECTORIES) {
    const fullPath = path.join(dest, dir);
    if (!storage.existsSync(fullPath)) {
      storage.mkdirSync(fullPath, { recursive: true });
      created.push(dir);
    }
  }
  return created;
}

/**
 * Copy all skills from package templates to .copilot/skills/ (force: false)
 */
function syncAllSkills(dest: string, templatesDir: string): number {
  const skillsSrc = path.join(templatesDir, 'skills');
  const skillsDest = path.join(dest, '.copilot', 'skills');
  if (!storage.existsSync(skillsSrc)) return 0;
  storage.mkdirSync(skillsDest, { recursive: true });
  copyDirRecursive(skillsSrc, skillsDest, false);
  // Count skill directories synced
  try {
    return storage.listSync(skillsSrc).filter(e =>
      storage.isDirectorySync(path.join(skillsSrc, e))
    ).length;
  } catch { return 0; }
}

/**
 * Copy full templates/ directory to .squad/templates/ for user access
 */
function refreshSquadTemplatesDir(dest: string, templatesDir: string): void {
  const squadTemplatesDest = path.join(dest, '.squad', 'templates');
  storage.mkdirSync(squadTemplatesDest, { recursive: true });
  // Copy everything except workflows and skills (those have dedicated handling)
  const entries = storage.listSync(templatesDir);
  for (const entry of entries) {
    if (entry === 'workflows' || entry === 'skills') continue;
    const srcPath = path.join(templatesDir, entry);
    const destPath = path.join(squadTemplatesDest, entry);
    if (storage.isDirectorySync(srcPath)) {
      copyDirRecursive(srcPath, destPath);
    } else {
      storage.copySync(srcPath, destPath);
    }
  }
}

/**
 * Run all ensure* checks and skill/template sync — shared by both code paths
 */
function runEnsureChecks(dest: string, templatesDir: string, filesUpdated: string[]): void {
  const attrAdded = ensureGitattributes(dest);
  if (attrAdded.length > 0) {
    success(`ensured .gitattributes (${attrAdded.length} rules added)`);
    filesUpdated.push('.gitattributes');
  }

  const ignoreAdded = ensureGitignore(dest);
  if (ignoreAdded.length > 0) {
    success(`ensured .gitignore (${ignoreAdded.length} entries added)`);
    filesUpdated.push('.gitignore');
  }

  const dirsCreated = ensureDirectories(dest);
  if (dirsCreated.length > 0) {
    success(`created ${dirsCreated.length} missing directories`);
    filesUpdated.push(...dirsCreated);
  }

  const skillCount = syncAllSkills(dest, templatesDir);
  if (skillCount > 0) {
    success(`synced ${skillCount} skills to .copilot/skills/`);
    filesUpdated.push(`skills (${skillCount})`);
  }

  refreshSquadTemplatesDir(dest, templatesDir);
  success('refreshed .squad/templates/');
  filesUpdated.push('.squad/templates/');
}

/**
 * Run the upgrade command
 */
export async function runUpgrade(dest: string, options: UpgradeOptions = {}): Promise<UpdateInfo> {
  const cliVersion = getPackageVersion();
  const filesUpdated: string[] = [];
  
  // Detect squad directory
  const squadDirInfo = detectSquadDir(dest);
  
  if (squadDirInfo.isLegacy) {
    warn('DEPRECATION: .ai-team/ is deprecated and will be removed in v1.0.0');
    warn("Run 'squad upgrade --migrate-directory' to migrate to .squad/");
    console.log();
  }
  
  // Verify squad exists
  if (!storage.existsSync(squadDirInfo.path)) {
    fatal('No squad found — run init first.');
  }
  
  const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');
  const oldVersion = readInstalledVersion(agentDest) ?? '0.0.0';
  
  // Check if already current
  const isAlreadyCurrent = !options.force && oldVersion && oldVersion !== '0.0.0' && compareSemver(oldVersion, cliVersion) === 0;
  
  const projectType = detectProjectType(dest);
  
  if (isAlreadyCurrent) {
    info(`Already up to date (v${cliVersion})`);
    
    // Still run missing migrations
    const migrationsApplied = await runMigrations(squadDirInfo.path, oldVersion, cliVersion);
    
    // Refresh squad-owned files even when version matches
    const templatesDir = getTemplatesDir();
    const workflowsSrc = path.join(templatesDir, 'workflows');
    const workflowsDest = path.join(dest, '.github', 'workflows');
    
    if (storage.existsSync(workflowsSrc)) {
      const wfFiles = storage.listSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      storage.mkdirSync(workflowsDest, { recursive: true });
      
      for (const file of wfFiles) {
        writeWorkflowFile(file, path.join(workflowsSrc, file), path.join(workflowsDest, file), projectType);
      }
      success(`upgraded squad workflows (${wfFiles.length} files)`);
      filesUpdated.push(`workflows (${wfFiles.length} files)`);
    }
    
    // Refresh squad.agent.md
    const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
    if (storage.existsSync(agentSrc)) {
      storage.mkdirSync(path.dirname(agentDest), { recursive: true });
      storage.copySync(agentSrc, agentDest);
      stampVersion(agentDest, cliVersion);
      success('upgraded squad.agent.md');
      filesUpdated.push('squad.agent.md');
    } else {
      warn('squad.agent.md.template not found — squad.agent.md was not refreshed. Reinstall or repair the CLI to restore the missing template.');
    }
    
    // Run infrastructure ensure checks even when already current
    runEnsureChecks(dest, templatesDir, filesUpdated);
    
    return {
      fromVersion: oldVersion,
      toVersion: cliVersion,
      filesUpdated,
      migrationsRun: migrationsApplied,
    };
  }
  
  // Upgrade squad.agent.md
  const templatesDir = getTemplatesDir();
  const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
  
  if (!storage.existsSync(agentSrc)) {
    fatal('squad.agent.md.template not found in templates — installation may be corrupted');
  }
  
  storage.mkdirSync(path.dirname(agentDest), { recursive: true });
  storage.copySync(agentSrc, agentDest);
  stampVersion(agentDest, cliVersion);
  
  const fromLabel = oldVersion === '0.0.0' || !oldVersion ? 'unknown' : oldVersion;
  success(`upgraded coordinator from ${fromLabel} to ${cliVersion}`);
  filesUpdated.push('squad.agent.md');
  
  // Upgrade squad-owned files from template manifest
  // Exclude squad.agent.md — already copied and version-stamped above
  const filesToUpgrade = TEMPLATE_MANIFEST.filter(f => f.overwriteOnUpgrade && f.source !== 'squad.agent.md.template');
  
  for (const file of filesToUpgrade) {
    const srcPath = path.join(templatesDir, file.source);
    const destPath = path.join(squadDirInfo.path, file.destination);
    
    if (!storage.existsSync(srcPath)) continue;
    
    storage.mkdirSync(path.dirname(destPath), { recursive: true });
    storage.copySync(srcPath, destPath);
    
    filesUpdated.push(file.destination);
  }
  
  if (filesToUpgrade.length > 0) {
    success(`upgraded ${filesToUpgrade.length} squad-owned files`);
  }
  
  // Upgrade workflows
  const workflowsSrc = path.join(templatesDir, 'workflows');
  const workflowsDest = path.join(dest, '.github', 'workflows');
  
  if (storage.existsSync(workflowsSrc)) {
    const wfFiles = storage.listSync(workflowsSrc).filter(f => f.endsWith('.yml'));
    storage.mkdirSync(workflowsDest, { recursive: true });
    
    for (const file of wfFiles) {
      writeWorkflowFile(file, path.join(workflowsSrc, file), path.join(workflowsDest, file), projectType);
    }
    
    success(`upgraded squad workflows (${wfFiles.length} files)`);
    filesUpdated.push(`workflows (${wfFiles.length} files)`);
  }
  
  // Run migrations
  const migrationsApplied = await runMigrations(squadDirInfo.path, oldVersion, cliVersion);
  
  // Update copilot-instructions.md if @copilot is enabled
  const copilotInstructionsSrc = path.join(templatesDir, 'copilot-instructions.md');
  const copilotInstructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
  const teamMdPath = path.join(squadDirInfo.path, 'team.md');
  
  if (storage.existsSync(teamMdPath)) {
    const teamContent = storage.readSync(teamMdPath) ?? '';
    const copilotEnabled = teamContent.includes('🤖 Coding Agent');
    
    if (copilotEnabled && storage.existsSync(copilotInstructionsSrc)) {
      storage.mkdirSync(path.dirname(copilotInstructionsDest), { recursive: true });
      storage.copySync(copilotInstructionsSrc, copilotInstructionsDest);
      success('upgraded .github/copilot-instructions.md');
      filesUpdated.push('copilot-instructions.md');
    }
  }
  
  // Run infrastructure ensure checks
  runEnsureChecks(dest, templatesDir, filesUpdated);
  
  console.log();
  info(`Upgrade complete: v${fromLabel} → v${cliVersion}`);
  if (migrationsApplied.some(m => m.toLowerCase().includes('scrub email'))) {
    dim('Privacy scrub applied to .squad/ files (email addresses removed)');
  } else {
    dim('Preserves user state: team.md, decisions/, agents/*/history.md');
  }
  console.log();
  
  return {
    fromVersion: fromLabel,
    toVersion: cliVersion,
    filesUpdated,
    migrationsRun: migrationsApplied,
  };
}

// ============================================================================
// Self-upgrade: upgrade the CLI package itself
// ============================================================================

export interface SelfUpgradeOptions {
  insider?: boolean;
  force?: boolean;
}

/**
 * Detect the package manager that installed the CLI.
 * Returns 'npm', 'pnpm', 'yarn', or 'npm' as fallback.
 */
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  const execPath = process.env['npm_execpath'] ?? '';
  if (execPath.includes('pnpm')) return 'pnpm';
  if (execPath.includes('yarn')) return 'yarn';
  // Check npm_config_user_agent as fallback
  const userAgent = process.env['npm_config_user_agent'] ?? '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  return 'npm';
}

/**
 * Self-upgrade the Squad CLI package via the detected package manager.
 *
 * Detects whether the CLI was installed via npm, pnpm, or yarn and runs the
 * appropriate global install command. Only suggests `sudo` for npm (pnpm and
 * yarn typically do not require elevated permissions for global installs).
 */
export async function selfUpgradeCli(options: SelfUpgradeOptions = {}): Promise<void> {
  const { execSync } = await import('node:child_process');
  const tag = options.insider ? 'insider' : 'latest';
  const pkg = `@bradygaster/squad-cli@${tag}`;
  const pm = detectPackageManager();

  let cmd: string;
  switch (pm) {
    case 'pnpm':
      cmd = `pnpm add -g ${pkg}`;
      break;
    case 'yarn':
      cmd = `yarn global add ${pkg}`;
      break;
    default:
      cmd = `npm install -g ${pkg}`;
      break;
  }

  info(`Self-upgrading via ${pm}: ${cmd}`);

  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    // Only suggest sudo for npm — pnpm/yarn rarely need it
    if (pm === 'npm') {
      warn(`Permission denied. Try: sudo ${cmd}`);
    } else {
      warn(`Upgrade failed. Check ${pm} permissions or try running manually: ${cmd}`);
    }
  }
}
