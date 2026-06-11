/**
 * Squad upgrade command — overwrites squad-owned files, runs migrations
 * Zero-dep implementation using Node.js stdlib only
 * @module cli/core/upgrade
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { success, warn, info, dim, bold } from './output.js';
import { fatal } from './errors.js';
import { detectSquadDir } from './detect-squad-dir.js';
import { TEMPLATE_MANIFEST, getTemplatesDir } from './templates.js';
import { runMigrations } from './migrations.js';
import { scrubEmails } from './email-scrub.js';
import { getPackageVersion, stampVersion, readInstalledVersion } from './version.js';
import { resolveSquadStateMcpSpec, type SquadStateMcpSpec } from './mcp-spec.js';
export { resolveSquadStateMcpSpec } from './mcp-spec.js';
import { ensureSquadStateMcpInRoot, ensureSquadStateMcpInUserConfig, tombstoneStaleSquadStateInProjectMcp } from './mcp-root.js';

const storage = new FSStorageProvider();

type McpConfigMode = 'copilot-file' | 'agent-frontmatter';

interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Returns true if the version looks like a local dev build or unpublished
 * pre-release that cannot be resolved from the public npm registry.
 * Guards against writing unresolvable version strings into MCP config
 * (see #1204).
 */
export function isLocalOrUnpublishedVersion(version: string): boolean {
  if (!version || version === '0.0.0') return true;
  // Local linked builds often have 0.0.0-development or similar sentinel
  if (/^0\.0\.0/.test(version)) return true;
  // Versions with `+` build metadata (e.g. 0.10.0+local.1234) are not
  // publishable to npm — they indicate a local build.
  if (version.includes('+')) return true;
  return false;
}

function buildMcpServerSpecs(isGitHub: boolean, cliVersion?: string): McpServerSpec[] {
  // Pin the squad-cli package to the currently-installed CLI version so that
  // `npx -y @bradygaster/squad-cli state-mcp` does NOT silently resolve to the
  // npm `latest` dist-tag (which may predate the `state-mcp` command and thus
  // expose zero tools to Copilot — see MCP-BRIDGE-BROKEN root cause).
  //
  // #1204: When the CLI is a local dev build or unpublished pre-release, fall
  // back to the @insider dist-tag to avoid writing an unresolvable version
  // string that breaks npx resolution at session start.
  let pkgSpec: string;
  if (!cliVersion || isLocalOrUnpublishedVersion(cliVersion)) {
    pkgSpec = '@bradygaster/squad-cli@insider';
  } else {
    pkgSpec = `@bradygaster/squad-cli@${cliVersion}`;
  }
  const servers: McpServerSpec[] = [
    {
      name: 'squad_state',
      command: 'npx',
      args: ['-y', pkgSpec, 'state-mcp'],
    },
  ];

  servers.push(isGitHub
    ? {
        name: 'EXAMPLE-github',
        command: 'npx',
        args: ['-y', '@anthropic/github-mcp-server'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      }
    : {
        name: 'EXAMPLE-azure-devops',
        command: 'npx',
        args: ['-y', '@azure/devops-mcp-server'],
        env: {
          AZURE_DEVOPS_ORG: '${AZURE_DEVOPS_ORG}',
          AZURE_DEVOPS_PAT: '${AZURE_DEVOPS_PAT}',
        },
      });

  return servers;
}

function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function yamlEnvValue(value: string): string {
  if (/^\$\{[A-Z0-9_]+\}$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildMcpFrontmatterBlock(isGitHub: boolean, cliVersion?: string): string {
  const lines = ['mcp-servers:'];
  for (const server of buildMcpServerSpecs(isGitHub, cliVersion)) {
    lines.push(`  ${server.name}:`);
    lines.push('    type: local');
    lines.push(`    command: ${server.command}`);
    lines.push(`    args: [${server.args.map(yamlSingleQuoted).join(', ')}]`);
    lines.push('    tools: ["*"]');

    if (server.env && Object.keys(server.env).length > 0) {
      lines.push('    env:');
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`      ${key}: ${yamlEnvValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

function injectMcpFrontmatter(content: string, isGitHub: boolean, cliVersion?: string): string {
  const closingStart = content.indexOf('\n---', 4);
  if (!content.startsWith('---') || closingStart === -1) {
    return content;
  }

  return content.slice(0, closingStart)
    + '\n'
    + buildMcpFrontmatterBlock(isGitHub, cliVersion)
    + content.slice(closingStart);
}

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
  /** When --self, install the insider (prerelease) tag instead of latest. */
  insider?: boolean;
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

function readSquadConfig(squadDir: string): Record<string, unknown> {
  const configPath = path.join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) return {};

  try {
    const raw = storage.readSync(configPath);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed config for upgrade compatibility.
  }

  return {};
}

function readMcpConfigMode(config: Record<string, unknown>): McpConfigMode {
  return config['mcpConfigMode'] === 'agent-frontmatter' ? 'agent-frontmatter' : 'copilot-file';
}

function detectMcpConfigMode(config: Record<string, unknown>, agentDest: string): McpConfigMode {
  const configuredMode = readMcpConfigMode(config);
  if (configuredMode === 'agent-frontmatter') return configuredMode;

  if (storage.existsSync(agentDest)) {
    const existingAgent = storage.readSync(agentDest) ?? '';
    const frontmatterEnd = existingAgent.indexOf('\n---', 4);
    const frontmatter = frontmatterEnd === -1 ? '' : existingAgent.slice(0, frontmatterEnd);
    if (frontmatter.includes('mcp-servers:')) {
      return 'agent-frontmatter';
    }
  }

  return configuredMode;
}

function detectIsGitHubForMcp(dest: string, config: Record<string, unknown>): boolean {
  if (config['platform'] === 'azure-devops') return false;

  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const remoteUrlLower = remoteUrl.toLowerCase();
    if (remoteUrlLower.includes('dev.azure.com') || remoteUrlLower.includes('visualstudio.com') || remoteUrlLower.includes('ssh.dev.azure.com')) {
      return false;
    }
  } catch {
    // No git remote — assume GitHub, matching init behavior.
  }

  return true;
}

function writeAgentTemplate(agentSrc: string, agentDest: string, cliVersion: string, mcpConfigMode: McpConfigMode, isGitHub: boolean): void {
  let agentContent = storage.readSync(agentSrc) ?? '';
  if (mcpConfigMode === 'agent-frontmatter') {
    agentContent = injectMcpFrontmatter(agentContent, isGitHub, cliVersion);
  }
  storage.writeSync(agentDest, agentContent);
  stampVersion(agentDest, cliVersion);
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
  '.squad/.cache/',
  '.squad-workstream',
];

const ENSURE_DIRECTORIES = [
  '.squad/identity',
  '.squad/orchestration-log',
  '.squad/log',
  '.squad/sessions',
  '.squad/decisions/inbox',
  '.squad/casting',
  '.squad/agents',
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
 * Scaffold default casting files (registry.json, policy.json, history.json)
 * if they don't already exist. Sources content from shipped templates when
 * available, falling back to inline JSON defaults.
 */
export function ensureCastingDefaults(dest: string, templatesDir?: string): string[] {
  const castingDir = path.join(dest, '.squad', 'casting');

  // Map destination file → template file name
  const templateMap: Array<{ name: string; templateName: string; fallback: string }> = [
    { name: 'registry.json', templateName: 'casting-registry.json', fallback: JSON.stringify({ agents: {} }, null, 2) + '\n' },
    { name: 'policy.json', templateName: 'casting-policy.json', fallback: JSON.stringify({ casting_policy_version: '1.1', allowlist_universes: [], universe_capacity: {} }, null, 2) + '\n' },
    { name: 'history.json', templateName: 'casting-history.json', fallback: JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} }, null, 2) + '\n' },
  ];

  // Use caller-provided templatesDir when available; resolve once otherwise
  let tDir = templatesDir;
  if (!tDir) {
    try {
      tDir = getTemplatesDir();
    } catch {
      // templates dir not found — will use inline fallbacks
    }
  }

  const created: string[] = [];
  for (const file of templateMap) {
    const filePath = path.join(castingDir, file.name);
    if (!storage.existsSync(filePath)) {
      // Prefer shipped template content; fall back to inline JSON
      let content = file.fallback;
      if (tDir) {
        const tplPath = path.join(tDir, file.templateName);
        if (storage.existsSync(tplPath)) {
          const tplContent = storage.readSync(tplPath);
          if (tplContent) content = tplContent;
        }
      }
      try {
        storage.mkdirSync(castingDir, { recursive: true });
        storage.writeSync(filePath, content);
        created.push(`.squad/casting/${file.name}`);
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && ['EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) {
          warn(`Could not write ${file.name} to .squad/casting/ (read-only). Create it manually.`);
          return created;
        }
        throw err;
      }
    }
  }
  return created;
}

/**
 * Warn when a built-in skill has been customized and is about to be overwritten.
 * Normalizes line endings before comparison to avoid false positives from CRLF differences.
 */
function warnIfSkillCustomized(srcPath: string, destPath: string, sourceName: string): void {
  if (!storage.existsSync(destPath)) return;
  const existing = (storage.readSync(destPath) ?? '').replace(/\r\n/g, '\n');
  const template = (storage.readSync(srcPath) ?? '').replace(/\r\n/g, '\n');
  if (existing && existing !== template) {
    const skillName = sourceName.split('/')[1] ?? sourceName;
    warn(`Skill '${skillName}' has been customized — overwriting with built-in version`);
  }
}

/**
 * Sync manifest-declared skills to .copilot/skills/, respecting overwriteOnUpgrade.
 * Only skills listed in TEMPLATE_MANIFEST are installed — not the entire templates/skills/ dir.
 */
function syncAllSkills(dest: string, templatesDir: string): number {
  const skillEntries = TEMPLATE_MANIFEST.filter(f => f.source.startsWith('skills/'));
  if (skillEntries.length === 0) return 0;

  const squadDir = path.join(dest, '.squad');
  let synced = 0;
  for (const entry of skillEntries) {
    const srcPath = path.join(templatesDir, entry.source);
    const destPath = path.join(squadDir, entry.destination);

    if (!storage.existsSync(srcPath)) continue;
    if (!entry.overwriteOnUpgrade && storage.existsSync(destPath)) continue;

    warnIfSkillCustomized(srcPath, destPath, entry.source);
    storage.mkdirSync(path.dirname(destPath), { recursive: true });
    storage.copySync(srcPath, destPath);
    synced++;
  }
  return synced;
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
async function runEnsureChecks(dest: string, templatesDir: string, filesUpdated: string[]): Promise<void> {
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

  const castingFiles = ensureCastingDefaults(dest, templatesDir);
  if (castingFiles.length > 0) {
    success(`scaffolded ${castingFiles.length} default casting files`);
    filesUpdated.push(...castingFiles);
  }

  const memoryFiles = ensureMemoryGovernanceUpgradeDefaults(dest);
  if (memoryFiles.length > 0) {
    success(`scaffolded memory governance defaults (${memoryFiles.length} files/directories)`);
    filesUpdated.push(...memoryFiles);
  }

  const builtinAgents = ensureBuiltinAgents(dest, templatesDir);
  if (builtinAgents.length > 0) {
    const uniqueAgentNames = Array.from(new Set(builtinAgents.map(p => path.basename(path.dirname(p)))));
    success(`scaffolded ${uniqueAgentNames.length} built-in agent(s): ${uniqueAgentNames.join(', ')}`);
    filesUpdated.push(...builtinAgents);
  }

  const skillCount = syncAllSkills(dest, templatesDir);
  if (skillCount > 0) {
    success(`synced ${skillCount} skills to .copilot/skills/`);
    filesUpdated.push(`skills (${skillCount})`);
  }

  refreshSquadTemplatesDir(dest, templatesDir);
  success('refreshed .squad/templates/');
  filesUpdated.push('.squad/templates/');

  // iter-8: write squad_state MCP entry to repo-root `.mcp.json`
  // (auto-loaded by Copilot CLI 5.3+ walking up from cwd to git root)
  // and tombstone any stale project-level entry left by older Squad
  // versions in `.copilot/mcp-config.json`. No HOME modifications.
  const pinnedSpec = await resolveSquadStateMcpSpec(getPackageVersion());
  try {
    const rootResult = ensureSquadStateMcpInRoot(dest, getPackageVersion(), pinnedSpec);
    if (rootResult.written) {
      success(`installed squad_state MCP server to .mcp.json (${describeMcpSpec(pinnedSpec)}) — Copilot CLI will auto-load on next invocation`);
      filesUpdated.push('.mcp.json');
    }
  } catch (err) {
    warn(`Could not write .mcp.json: ${err instanceof Error ? err.message : err}`);
  }
  // Also pin to user-level config for external `copilot -p` compatibility
  try {
    const userResult = ensureSquadStateMcpInUserConfig(dest, pinnedSpec);
    if (userResult.written) {
      success(`pinned squad_state to ~/.copilot/mcp-config.json for \`copilot -p\` mode compatibility`);
    }
  } catch {
    // best-effort: user-level config write failure does not block upgrade
  }
  const tomb = tombstoneStaleSquadStateInProjectMcp(dest);
  if (tomb.removed) {
    success(`removed stale squad_state from ${tomb.path} (now lives in .mcp.json)`);
    filesUpdated.push('.copilot/mcp-config.json (tombstoned)');
  }
}

/** Human-readable single-line description of an McpSpec for success() messages. */
export function describeMcpSpec(spec: SquadStateMcpSpec): string {
  // After iter-7 all specs are `npx -y <pkg@version-or-tag> state-mcp`.
  const pkg = spec.args[1] ?? '<unknown>';
  return spec.source === 'insider' ? `${pkg} (@insider fallback)` : pkg;
}

export function ensureMemoryGovernanceUpgradeDefaults(dest: string): string[] {
  const memoryDir = path.join(dest, '.squad', 'memory');
  const created: string[] = [];
  for (const dir of ['local', 'policy-inbox', 'semantic-inbox', 'tombstones']) {
    const fullPath = path.join(memoryDir, dir);
    if (!storage.existsSync(fullPath)) {
      storage.mkdirSync(fullPath, { recursive: true });
      created.push(path.join('.squad', 'memory', dir));
    }
  }
  const defaults = {
    'config.json': JSON.stringify({
      version: 1,
      defaultProvider: 'local',
      promptOnlyFallback: true,
      externalProviders: {
        hostInjectedCopilotAdapter: {
          enabled: false,
          requireApproval: true,
        },
      },
      policy: {
        rejectForbidden: true,
        rejectTransientDurableWrites: true,
        auditContent: false,
      },
    }, null, 2) + '\n',
    'index.json': '[]\n',
    'audit.jsonl': '',
  };
  for (const [file, content] of Object.entries(defaults)) {
    const fullPath = path.join(memoryDir, file);
    if (!storage.existsSync(fullPath)) {
      storage.writeSync(fullPath, content);
      created.push(path.join('.squad', 'memory', file));
    }
  }
  return created;
}

/**
 * Scaffold always-on built-in agent charters (Rai, Fact Checker) that ship
 * as templates but may be missing from older squads. Idempotent — only writes
 * when the agent directory is absent. Never overwrites existing charters or
 * history. Sources charter content from the shipped `templates/{name}-charter.md`
 * files when available, falling back to a minimal placeholder otherwise.
 *
 * Scribe and Ralph are intentionally NOT scaffolded here — they should already
 * exist in any squad that ran a prior init, and their charters are inlined in
 * cast.ts (no shipped template file). Adding them here would risk overwriting
 * customized versions on legacy squads.
 *
 * @param dest Root directory containing .squad/
 * @param templatesDir Directory containing shipped charter templates
 * @returns Paths (relative to dest) of created agent files
 */
export function ensureBuiltinAgents(dest: string, templatesDir: string): string[] {
  const agentsDir = path.join(dest, '.squad', 'agents');
  if (!storage.existsSync(agentsDir)) {
    storage.mkdirSync(agentsDir, { recursive: true });
  }

  // Built-in agents that ship as charter templates. Each entry maps to:
  //   - dirName: case-preserving directory name under .squad/agents/
  //   - templateFile: filename under templatesDir (charter template)
  //   - displayName: shown in history.md header
  const builtins: Array<{ dirName: string; templateFile: string; displayName: string }> = [
    { dirName: 'Rai', templateFile: 'Rai-charter.md', displayName: 'Rai' },
    { dirName: 'fact-checker', templateFile: 'fact-checker-charter.md', displayName: 'Fact Checker' },
  ];

  const created: string[] = [];
  for (const agent of builtins) {
    const agentDir = path.join(agentsDir, agent.dirName);
    const charterPath = path.join(agentDir, 'charter.md');
    const historyPath = path.join(agentDir, 'history.md');

    // Idempotent: skip if agent directory already exists. Never overwrite
    // existing charters or history files (preserves user customization).
    if (storage.existsSync(agentDir)) continue;

    // Source charter content from the shipped template; fall back to a
    // minimal placeholder if the template file is missing (defensive — should
    // not happen in a well-formed install, but better than crashing upgrade).
    const tplPath = path.join(templatesDir, agent.templateFile);
    let charterContent: string;
    if (storage.existsSync(tplPath)) {
      charterContent = storage.readSync(tplPath) ?? '';
    } else {
      charterContent = `# ${agent.displayName}\n\n> Charter template not found in shipped templates. Run \`squad upgrade\` after reinstalling the CLI to repair.\n`;
    }

    try {
      storage.mkdirSync(agentDir, { recursive: true });
      storage.writeSync(charterPath, charterContent);
      created.push(path.join('.squad', 'agents', agent.dirName, 'charter.md'));

      storage.writeSync(historyPath, `# ${agent.displayName} — History\n\n## Learnings\n\nInitial scaffold via \`squad upgrade\`. Ready for work.\n`);
      created.push(path.join('.squad', 'agents', agent.dirName, 'history.md'));
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && ['EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) {
        warn(`Could not scaffold built-in agent ${agent.displayName} (read-only). Create .squad/agents/${agent.dirName}/ manually.`);
        continue;
      }
      throw err;
    }
  }

  return created;
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
  const squadConfig = readSquadConfig(squadDirInfo.path);
  const mcpConfigMode = detectMcpConfigMode(squadConfig, agentDest);
  const isGitHubForMcp = detectIsGitHubForMcp(dest, squadConfig);

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
      writeAgentTemplate(agentSrc, agentDest, cliVersion, mcpConfigMode, isGitHubForMcp);
      success('upgraded squad.agent.md');
      filesUpdated.push('squad.agent.md');
    } else {
      warn('squad.agent.md.template not found — squad.agent.md was not refreshed. Reinstall or repair the CLI to restore the missing template.');
    }

    // Run infrastructure ensure checks even when already current
    await runEnsureChecks(dest, templatesDir, filesUpdated);

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
  writeAgentTemplate(agentSrc, agentDest, cliVersion, mcpConfigMode, isGitHubForMcp);

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

    if (file.source.startsWith('skills/')) {
      warnIfSkillCustomized(srcPath, destPath, file.source);
    }
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
  await runEnsureChecks(dest, templatesDir, filesUpdated);

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
 * appropriate global install command. On EACCES errors, suggests `sudo` with
 * the detected installer name.
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
  } catch (err: unknown) {
    // UPGRADE-EPERM-FALSE-SUCCESS fix: do NOT swallow self-upgrade failures.
    // Previously this only printed a warning and returned, causing the caller
    // (cli-entry.ts) to then unconditionally print "✅ Upgraded" and exit 0.
    // Now we surface the failure as a thrown error so the caller can exit non-zero
    // and avoid the contradictory success message.
    const errMsg = err instanceof Error ? err.message : String(err);
    const code = err instanceof Error && 'code' in err
      ? ((err as NodeJS.ErrnoException).code ?? '')
      : '';
    const isPermission = code === 'EACCES' || code === 'EPERM' || /EACCES|EPERM|permission denied/i.test(errMsg);
    const isBusy = code === 'EBUSY' || /EBUSY|in use|cannot access|being used by another process/i.test(errMsg);

    let hint: string;
    if (isPermission) {
      hint = `Permission denied. Try: sudo ${cmd}`;
    } else if (isBusy) {
      hint = `A file is in use (likely another squad shell is running). Close other squad CLI processes and retry: ${cmd}`;
    } else {
      hint = `Upgrade failed. Try running manually: ${cmd}`;
    }

    warn(hint);
    const failure = new Error(`Self-upgrade failed: ${hint}`);
    (failure as NodeJS.ErrnoException).code = code || undefined;
    throw failure;
  }
}
