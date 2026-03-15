/**
 * Squad upgrade command — overwrites squad-owned files, runs migrations
 * Zero-dep implementation using Node.js stdlib only
 * @module cli/core/upgrade
 */

import fs from 'node:fs';
import path from 'node:path';
import { success, warn, info, dim, bold } from './output.js';
import { fatal } from './errors.js';
import { detectSquadDir } from './detect-squad-dir.js';
import { TEMPLATE_MANIFEST, getTemplatesDir } from './templates.js';
import { runMigrations } from './migrations.js';
import { scrubEmails } from './email-scrub.js';
import { getPackageVersion, stampVersion, readInstalledVersion } from './version.js';

export interface UpgradeOptions {
  migrateDirectory?: boolean;
  self?: boolean;
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
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) ||
      fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(dir, 'pom.xml')) ||
      fs.existsSync(path.join(dir, 'build.gradle')) ||
      fs.existsSync(path.join(dir, 'build.gradle.kts'))) return 'java';
  
  try {
    const entries = fs.readdirSync(dir);
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
      fs.writeFileSync(destPath, stub);
      return;
    }
  }
  fs.copyFileSync(srcPath, destPath);
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
  if (!fs.existsSync(squadDirInfo.path)) {
    fatal('No squad found — run init first.');
  }
  
  const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');
  const oldVersion = readInstalledVersion(agentDest) ?? '0.0.0';
  
  // Check if already current
  const isAlreadyCurrent = oldVersion && oldVersion !== '0.0.0' && compareSemver(oldVersion, cliVersion) === 0;
  
  const projectType = detectProjectType(dest);
  
  if (isAlreadyCurrent) {
    info(`Already up to date (v${cliVersion})`);
    
    // Still run missing migrations
    const migrationsApplied = await runMigrations(squadDirInfo.path, oldVersion, cliVersion);
    
    // Refresh squad-owned files even when version matches
    const templatesDir = getTemplatesDir();
    const workflowsSrc = path.join(templatesDir, 'workflows');
    const workflowsDest = path.join(dest, '.github', 'workflows');
    
    if (fs.existsSync(workflowsSrc)) {
      const wfFiles = fs.readdirSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      fs.mkdirSync(workflowsDest, { recursive: true });
      
      for (const file of wfFiles) {
        writeWorkflowFile(file, path.join(workflowsSrc, file), path.join(workflowsDest, file), projectType);
      }
      success(`upgraded squad workflows (${wfFiles.length} files)`);
      filesUpdated.push(`workflows (${wfFiles.length} files)`);
    }
    
    // Refresh squad.agent.md
    const agentSrc = path.join(templatesDir, 'squad.agent.md');
    if (fs.existsSync(agentSrc)) {
      fs.mkdirSync(path.dirname(agentDest), { recursive: true });
      fs.copyFileSync(agentSrc, agentDest);
      stampVersion(agentDest, cliVersion);
      success('upgraded squad.agent.md');
      filesUpdated.push('squad.agent.md');
    }
    
    return {
      fromVersion: oldVersion,
      toVersion: cliVersion,
      filesUpdated,
      migrationsRun: migrationsApplied,
    };
  }
  
  // Upgrade squad.agent.md
  const templatesDir = getTemplatesDir();
  const agentSrc = path.join(templatesDir, 'squad.agent.md');
  
  if (!fs.existsSync(agentSrc)) {
    fatal('squad.agent.md not found in templates — installation may be corrupted');
  }
  
  fs.mkdirSync(path.dirname(agentDest), { recursive: true });
  fs.copyFileSync(agentSrc, agentDest);
  stampVersion(agentDest, cliVersion);
  
  const fromLabel = oldVersion === '0.0.0' || !oldVersion ? 'unknown' : oldVersion;
  success(`upgraded coordinator from ${fromLabel} to ${cliVersion}`);
  filesUpdated.push('squad.agent.md');
  
  // Upgrade squad-owned files from template manifest
  // Exclude squad.agent.md — already copied and version-stamped above
  const filesToUpgrade = TEMPLATE_MANIFEST.filter(f => f.overwriteOnUpgrade && f.source !== 'squad.agent.md');
  
  for (const file of filesToUpgrade) {
    const srcPath = path.join(templatesDir, file.source);
    const destPath = path.join(squadDirInfo.path, file.destination);
    
    if (!fs.existsSync(srcPath)) continue;
    
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    
    filesUpdated.push(file.destination);
  }
  
  if (filesToUpgrade.length > 0) {
    success(`upgraded ${filesToUpgrade.length} squad-owned files`);
  }
  
  // Upgrade workflows
  const workflowsSrc = path.join(templatesDir, 'workflows');
  const workflowsDest = path.join(dest, '.github', 'workflows');
  
  if (fs.existsSync(workflowsSrc)) {
    const wfFiles = fs.readdirSync(workflowsSrc).filter(f => f.endsWith('.yml'));
    fs.mkdirSync(workflowsDest, { recursive: true });
    
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
  
  if (fs.existsSync(teamMdPath)) {
    const teamContent = fs.readFileSync(teamMdPath, 'utf8');
    const copilotEnabled = teamContent.includes('🤖 Coding Agent');
    
    if (copilotEnabled && fs.existsSync(copilotInstructionsSrc)) {
      fs.mkdirSync(path.dirname(copilotInstructionsDest), { recursive: true });
      fs.copyFileSync(copilotInstructionsSrc, copilotInstructionsDest);
      success('upgraded .github/copilot-instructions.md');
      filesUpdated.push('copilot-instructions.md');
    }
  }
  
  console.log();
  info(`Upgrade complete: v${fromLabel} → v${cliVersion}`);
  dim('Never touches user state: team.md, decisions/, agents/*/history.md');
  console.log();
  
  return {
    fromVersion: fromLabel,
    toVersion: cliVersion,
    filesUpdated,
    migrationsRun: migrationsApplied,
  };
}
