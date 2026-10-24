/**
 * Squad upgrade command — overwrites squad-owned files, runs migrations
 * Zero-dep implementation using Node.js stdlib only
 * @module cli/core/upgrade
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FSStorageProvider, stripTeamCapabilitiesBlock, syncTeamCapabilities } from '@bradygaster/squad-sdk';
import { clearResolveSquadCache, isRetiredProfileTeamRoot } from '@bradygaster/squad-sdk/resolution';
import {
  backfillCastingRegistryFromTeam,
  ensureCastingRegistryPair,
  preflightCastingRegistryPair,
  repairHandwrittenCastingRegistry,
  type RepairResult,
} from '@bradygaster/squad-sdk/casting';
import { success, warn, info, dim, BOLD, RESET } from './output.js';
import { fatal, fatalNoSquad } from './errors.js';
import { detectSquadDir } from './detect-squad-dir.js';
import { TEMPLATE_MANIFEST, getTemplatesDir } from './templates.js';
import { runMigrations } from './migrations.js';
import { scrubEmails } from './email-scrub.js';
import { getPackageVersion, stampVersion, readInstalledVersion } from './version.js';
import { projectSquadStateMcpSpec, resolveSquadStateMcpSpec, type SquadStateMcpSpec } from './mcp-spec.js';
import { copyManagedFile, syncCopilotInstructionsFile, writeManagedText } from './managed-file.js';
export { resolveSquadStateMcpSpec } from './mcp-spec.js';
import {
  ensureSquadStateMcpInRoot,
  reconcileSquadStateUserConfig,
  tombstoneStaleSquadStateInProjectMcp,
} from './mcp-root.js';
import { applyClientProjectionsForUpgrade, reportClientResults, type ClientId } from './clients.js';
import {
  applyRetiredFiles,
  applySquadOwnedFiles,
  contentHash,
  formatSquadOwnedPlan,
  listFilesRecursive,
  planRetiredFiles,
  planSquadOwnedFiles,
  SHIPPED_MANIFEST_RELATIVE_PATH,
  writeShippedManifest,
  type SquadOwnedCandidate,
  type SquadOwnedPlan,
} from './squad-owned-files.js';
import { compareVersions } from '../upgrade.js';

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
      copyManagedFile(srcEntry, destEntry);
    }
  }
}

export interface UpgradeOptions {
  migrateDirectory?: boolean;
  self?: boolean;
  force?: boolean;
  /** When --self, install the insider (prerelease) tag instead of latest. */
  insider?: boolean;
  /** Preview what upgrade would change without writing. */
  dryRun?: boolean;
  /** Add these client hosts to the configured set; configured clients are always refreshed. */
  clients?: ClientId[];
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

/** Label for the project in upgrade output: configured name, else the repository directory name. */
export function readProjectLabel(dest: string, config: Record<string, unknown>): string {
  for (const key of ['projectName', 'name']) {
    const value = config[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return path.basename(path.resolve(dest)) || dest;
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

/**
 * Squad 1.x `init` pointed a project's `teamRoot` at the user-profile squad that 2.0 removed.
 * Such a project would resolve in remote mode against a directory Squad no longer reads.
 * Remove the key (nothing else in config.json changes); genuine dual-root targets stay.
 */
function stripRetiredProfileTeamRoot(squadDir: string, dest: string, dryRun: boolean): void {
  const configPath = path.join(squadDir, 'config.json');
  if (!storage.existsSync(configPath)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.readSync(configPath) ?? '');
  } catch {
    return;
  }
  // readSquadConfig() tolerates null/non-object config.json; so must this preflight.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  const record = parsed as Record<string, unknown>;
  const teamRoot = record['teamRoot'];
  if (typeof teamRoot !== 'string' || teamRoot.length === 0 || teamRoot === '.') return;
  const target = path.resolve(dest, teamRoot);
  if (!isRetiredProfileTeamRoot(target)) return;
  if (dryRun) {
    info('Would remove obsolete "teamRoot" setting from .squad/config.json.');
    return;
  }
  delete record['teamRoot'];
  storage.writeSync(configPath, JSON.stringify(record, null, 2) + '\n');
  clearResolveSquadCache();
  info('Removed obsolete "teamRoot" setting from .squad/config.json.');
}

/**
 * Remove every machine-written stamp from a coordinator file so two copies that differ only
 * by version/package-spec markers compare equal (an upgrade must not read its own stamps as
 * a user customization).
 */
export function stripAgentStamps(s: string): string {
  return s
    .replace(/<!-- squad-cli v[\d.]+[-\w.]* -->\n?/g, '')
    .replace(/<!-- version: [^>]+ -->/g, '<!-- version: X -->')
    .replace(/- \*\*Version:\*\* \S+/g, '- **Version:** X')
    .replace(/`Squad v[^`]+`/g, '`Squad vX`')
    .replace(/@bradygaster\/squad-cli@[^\s"'\]]+/g, '@bradygaster/squad-cli@X');
}

function writeAgentTemplate(agentSrc: string, agentDest: string, cliVersion: string, mcpConfigMode: McpConfigMode, isGitHub: boolean, options?: { dryRun?: boolean; squadDir?: string }): void {
  let agentContent = storage.readSync(agentSrc) ?? '';
  if (mcpConfigMode === 'agent-frontmatter') {
    agentContent = injectMcpFrontmatter(agentContent, isGitHub, cliVersion);
  }

  // Back up locally-customized squad.agent.md before overwriting (#1052)
  if (storage.existsSync(agentDest)) {
    const existing = storage.readSync(agentDest) ?? '';
    // Strip every stamp form before comparing (they change on every upgrade), and the
    // generated Team Capabilities block (#1608) — machine written on every cast change.
    const normalize = (s: string) => stripTeamCapabilitiesBlock(stripAgentStamps(s));
    const normalizedExisting = normalize(existing.replace(/\r\n/g, '\n'));
    const normalizedTemplate = normalize(agentContent.replace(/\r\n/g, '\n'));

    if (normalizedExisting !== normalizedTemplate && normalizedExisting.trim().length > 0) {
      const backupPath = agentDest + '.local-backup';
      if (options?.dryRun) {
        warn(`squad.agent.md has local customizations — would back up to ${path.basename(backupPath)}`);
        return;
      }
      // Keep an existing backup when it already holds this exact content.
      if ((storage.existsSync(backupPath) ? storage.readSync(backupPath) : null) !== existing) {
        storage.writeSync(backupPath, existing);
      }
      warn(`squad.agent.md has local customizations — backed up to ${path.basename(backupPath)}`);
      info(`  To restore: copy ${path.basename(backupPath)} → ${path.basename(agentDest)}`);
    } else if (options?.dryRun) {
      const installed = readInstalledVersion(agentDest);
      if (installed === cliVersion) {
        info(`squad.agent.md is up to date (v${cliVersion}) — would re-render unchanged`);
      } else {
        info(`squad.agent.md is unmodified — would refresh with latest template (${installed ?? 'unknown'} → ${cliVersion})`);
      }
      return;
    }
  } else if (options?.dryRun) {
    info('squad.agent.md does not exist — would create from template');
    return;
  }

  writeManagedText(agentDest, agentContent);
  stampVersion(agentDest, cliVersion);

  // Re-advertise the current cast to outer coordinators (#1608). An upgrade
  // still succeeds if rendering fails, but the stale-data risk is surfaced.
  if (options?.squadDir) {
    try {
      syncTeamCapabilities({ squadDir: options.squadDir, agentFile: agentDest, storage });
    } catch (error) {
      warn(
        `Could not refresh squad.agent.md team capabilities: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
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
 * Content a workflow file should have in this project: the shipped template verbatim for
 * npm projects, a project-type stub for the build/test-sensitive ones otherwise.
 */
function workflowContent(file: string, srcPath: string, projectType: string): string {
  if (projectType !== 'npm' && PROJECT_TYPE_SENSITIVE_WORKFLOWS.has(file)) {
    const stub = generateProjectWorkflowStub(file, projectType);
    if (stub) return stub;
  }
  return storage.readSync(srcPath) ?? '';
}

/**
 * Every squad-owned file an upgrade may write, in plan order:
 *  1. manifest entries with `overwriteOnUpgrade` (templates, skills, flat casting JSON),
 *  2. `.github/workflows/*.yml` (verbatim or project-type stub),
 *  3. the full `.squad/templates/` mirror — including `skills/` and `workflows/`, which
 *     previous releases never refreshed (#2047).
 * `squad.agent.md` is excluded: it has its own stamp-aware writer.
 */
export function collectSquadOwnedCandidates(
  dest: string,
  squadDir: string,
  templatesDir: string,
  projectType: string,
): SquadOwnedCandidate[] {
  const candidates: SquadOwnedCandidate[] = [];

  for (const entry of TEMPLATE_MANIFEST) {
    if (!entry.overwriteOnUpgrade || entry.source === 'squad.agent.md.template') continue;
    if (entry.source.startsWith('workflows/')) continue; // handled below with project-type stubs
    candidates.push({
      src: path.join(templatesDir, entry.source),
      absPath: path.join(squadDir, entry.destination),
    });
  }

  const workflowsSrc = path.join(templatesDir, 'workflows');
  if (storage.existsSync(workflowsSrc)) {
    for (const file of storage.listSync(workflowsSrc).filter(f => f.endsWith('.yml')).sort()) {
      const srcPath = path.join(workflowsSrc, file);
      candidates.push({
        src: srcPath,
        absPath: path.join(dest, '.github', 'workflows', file),
        content: workflowContent(file, srcPath, projectType),
      });
    }
  }

  const squadTemplatesDest = path.join(dest, '.squad', 'templates');
  const manifestAbs = path.join(dest, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/'));
  for (const src of listFilesRecursive(templatesDir)) {
    const absPath = path.join(squadTemplatesDest, path.relative(templatesDir, src));
    if (absPath === manifestAbs) continue;
    candidates.push({ src, absPath });
  }

  return candidates;
}

/** Plan every squad-owned file for this project (pure; nothing is written). */
export function planUpgradeFiles(dest: string, squadDir: string, templatesDir: string): SquadOwnedPlan {
  return planSquadOwnedFiles(dest, collectSquadOwnedCandidates(dest, squadDir, templatesDir, detectProjectType(dest)));
}

/**
 * Record what `squad init` just shipped so the first `squad upgrade` can tell user edits from
 * template revisions. Best effort: init must not fail because the manifest could not be written.
 */
export function recordShippedFilesAfterInit(dest: string, squadDir: string, templatesDir: string, version: string): boolean {
  try {
    writeShippedManifest(dest, version, planUpgradeFiles(dest, squadDir, templatesDir));
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply the squad-owned file plan (verified backups first), then record what shipped.
 * Returns the repo-relative paths that were written.
 */
function applyUpgradeFiles(dest: string, plan: SquadOwnedPlan, cliVersion: string, filesUpdated: string[]): void {
  // Retirement is planned from the PREVIOUS manifest, so it must run before the new one is written.
  const retired = planRetiredFiles(dest, plan);
  const result = applySquadOwnedFiles(plan, { warn });
  for (const rel of result.backedUp) info(`  To restore: copy ${path.basename(rel)}.local-backup → ${path.basename(rel)}`);
  if (result.written.length > 0) {
    success(`upgraded ${result.written.length} squad-owned file(s)${result.backedUp.length > 0 ? ` (${result.backedUp.length} file(s) backed up to .local-backup)` : ''}`);
    filesUpdated.push(...result.written);
  } else {
    info(`squad-owned files already up to date (${plan.files.length} checked)`);
  }
  if (result.aborted.length > 0) {
    warn(`${result.aborted.length} file(s) were NOT overwritten because their backup could not be verified: ${result.aborted.join(', ')}`);
  }
  const retirement = applyRetiredFiles(retired);
  if (retirement.removed.length > 0) {
    success(`removed ${retirement.removed.length} retired squad-owned file(s) no longer shipped: ${retirement.removed.join(', ')}`);
    filesUpdated.push(...retirement.removed.map(r => `${r} (removed)`));
  }
  for (const kept of retirement.kept) {
    warn(`${kept} is no longer shipped by Squad but was modified locally — left in place; delete it yourself if unneeded`);
  }
  writeShippedManifest(dest, cliVersion, plan);
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
  '.squad/backend/',
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
  '.github/skills',
];

/** The line ending most of `text` uses; CRLF wins ties so a Windows file never gains bare LFs. */
export function dominantEol(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

/**
 * Append `lines` to a line-oriented file without rewriting any existing byte: the file's own
 * dominant EOL is used for the new lines and a missing trailing newline is supplied first.
 */
export function appendLinesPreservingEol(filePath: string, lines: readonly string[]): void {
  const existing = storage.existsSync(filePath) ? (storage.readSync(filePath) ?? '') : '';
  const eol = dominantEol(existing);
  const bridge = existing.length > 0 && !/\r?\n$/.test(existing) ? eol : '';
  storage.writeSync(filePath, existing + bridge + lines.join(eol) + eol);
}

/**
 * Ensure .gitattributes has required merge=union rules (idempotent).
 * Missing rules are appended in the file's own EOL style; existing lines are never rewritten.
 */
export function ensureGitattributes(dest: string, options: { dryRun?: boolean } = {}): string[] {
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
  if (added.length > 0 && !options.dryRun) {
    try {
      appendLinesPreservingEol(filePath, added);
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
 * Missing entries are appended in the file's own EOL style; the file is never rewritten
 * wholesale (a one-line addition must not produce a whole-file CRLF/LF diff, #2297).
 */
export function ensureGitignore(dest: string, options: { dryRun?: boolean } = {}): string[] {
  const filePath = path.join(dest, '.gitignore');
  let content = '';
  if (storage.existsSync(filePath)) {
    content = storage.readSync(filePath) ?? '';
  }
  const existingLines = content.split(/\r?\n/);
  const added: string[] = [];
  for (const entry of GITIGNORE_ENTRIES) {
    if (content.includes(entry)) continue;
    if (isAlreadyCoveredByParent(entry, existingLines)) continue;
    added.push(entry);
  }
  if (added.length > 0 && !options.dryRun) {
    appendLinesPreservingEol(filePath, added);
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

  // Use caller-provided templatesDir when available; resolve once otherwise
  let tDir = templatesDir;
  if (!tDir) {
    try {
      tDir = getTemplatesDir();
    } catch {
      // templates dir not found — will use inline fallbacks
    }
  }

  const templateContent = (templateName: string, fallback: string): string => {
    if (!tDir) return fallback;
    const templatePath = path.join(tDir, templateName);
    return storage.existsSync(templatePath)
      ? (storage.readSync(templatePath) ?? fallback)
      : fallback;
  };

  const created: string[] = [];
  try {
    storage.mkdirSync(castingDir, { recursive: true });
    // LLM-handwritten registries (role keys, agents arrays, no schema) are normalized instead of crashing upgrade;
    // the repair itself decides whether existing history.json content blocks it
    const repair = repairHandwrittenCastingRegistry(castingDir);
    if (repair.repaired) {
      warn('Normalized a handwritten .squad/casting/registry.json');
      created.push(...repair.files.map((f) => `.squad/casting/${f}`));
    } else {
      warnCastingRepairSkipped('Could not normalize handwritten .squad/casting/registry.json', repair);
    }
    const pair = withCastingRepairContext(repair, () => ensureCastingRegistryPair(
      castingDir,
      templateContent(
        'casting-registry.json',
        JSON.stringify({ schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1, generated_at: '1970-01-01T00:00:00.000Z', agents: {} }, null, 2) + '\n',
      ),
      templateContent(
        'casting-history.json',
        JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} }, null, 2) + '\n',
      ),
      'CLI upgrade',
    ));
    if (pair.created) {
      created.push('.squad/casting/registry.json', '.squad/casting/history.json');
    }
    // team.md + charters written directly by a model on an older CLI leave the registry empty: backfill it from the roster
    const backfill = backfillCastingRegistryFromTeam(castingDir, path.join(dest, '.squad', 'team.md'));
    if (backfill.repaired) {
      warn('Backfilled .squad/casting/registry.json from .squad/team.md');
      created.push(...backfill.files.map((f) => `.squad/casting/${f}`).filter((f) => !created.includes(f)));
    } else {
      warnCastingRepairSkipped('Could not backfill .squad/casting/registry.json from .squad/team.md', backfill);
    }

    const policyPath = path.join(castingDir, 'policy.json');
    if (!storage.existsSync(policyPath)) {
      storage.writeSync(
        policyPath,
        templateContent(
          'casting-policy.json',
          JSON.stringify({ casting_policy_version: '1.1', allowlist_universes: [], universe_capacity: {} }, null, 2) + '\n',
        ),
      );
      created.push('.squad/casting/policy.json');
    }
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && ['EPERM', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) {
      warn('Could not write casting defaults to .squad/casting/ (read-only). Create them manually.');
      return created;
    }
    throw err;
  }
  return created;
}

/**
 * Generic pair-initialization / consistency failures carry no hint about *why* a handwritten
 * registry could not be normalized. Legacy-migration errors (entries provenance, missing universe,
 * …) are specific already and pass through untouched.
 */
const GENERIC_CASTING_PAIR_ERROR = /Cannot (initialize|read a consistent) casting registry/;

/**
 * Run a managed-pair operation; when it fails with the generic pair error after the handwritten
 * repair declined with a reason, rethrow with the reason, the offending entries and the fix.
 */
function withCastingRepairContext<T>(repair: RepairResult, run: () => T): T {
  try {
    return run();
  } catch (err: unknown) {
    if (!repair.repaired && repair.reason && err instanceof Error && GENERIC_CASTING_PAIR_ERROR.test(err.message)) {
      fatal(formatCastingRepairBlocked(repair));
    }
    throw err;
  }
}

/** Actionable fail-closed message for a casting registry that is neither readable nor repairable. */
export function formatCastingRepairBlocked(repair: RepairResult): string {
  const lines = [
    `.squad/casting/registry.json cannot be read or repaired: ${repair.reason ?? 'unknown reason'}`,
  ];
  for (const { name, reason } of repair.dropped ?? []) {
    lines.push(`  - ${name}: ${reason}`);
  }
  lines.push(
    'Fix .squad/casting/registry.json so every agent entry is an object with `name` and `role`',
    '(e.g. "tester": { "name": "Quinn", "role": "Tester" }), or re-cast with `npx squad cast --name <Name> --role <Role>`,',
    'then run `squad upgrade` again.',
  );
  return lines.join('\n');
}

/**
 * Legacy `.copilot/skills/<name>/` entries Squad is allowed to touch: manifest skills (moved to
 * `.github/skills/`) plus any skill that ships in `templates/skills/` whose legacy copy is
 * byte-for-byte (EOL-insensitive) a copy Squad itself wrote — proven by matching either the
 * current template or the `.squad/templates/skills/<name>/` snapshot init seeded. Anything
 * else is user content and is never listed (#2232, #2047).
 */
export function findLegacyCopilotSkills(dest: string): string[] {
  const legacyDir = path.join(dest, '.copilot', 'skills');
  if (!storage.existsSync(legacyDir)) return [];
  const manifestSkills = new Set(
    TEMPLATE_MANIFEST
      .filter(f => f.source.startsWith('skills/'))
      .map(f => f.source.split('/')[1]) // 'skills/foo/SKILL.md' -> 'foo'
      .filter((s): s is string => Boolean(s)),
  );
  let templatesDir: string | undefined;
  try {
    templatesDir = getTemplatesDir();
  } catch {
    templatesDir = undefined;
  }

  const result: string[] = [];
  for (const entry of storage.listSync(legacyDir).sort()) {
    const legacySkillDir = path.join(legacyDir, entry);
    if (!storage.isDirectorySync(legacySkillDir)) continue;
    if (manifestSkills.has(entry)) {
      result.push(entry);
      continue;
    }
    if (templatesDir && isSquadShippedSkillCopy(dest, templatesDir, entry, legacySkillDir)) {
      result.push(entry);
    }
  }
  return result;
}

/** True when every file in the legacy skill dir equals the shipped template (current or snapshot). */
function isSquadShippedSkillCopy(dest: string, templatesDir: string, name: string, legacySkillDir: string): boolean {
  const sources = [
    path.join(templatesDir, 'skills', name),
    path.join(dest, '.squad', 'templates', 'skills', name),
  ].filter(dir => storage.existsSync(dir));
  if (sources.length === 0) return false;
  const files = listFilesRecursive(legacySkillDir);
  if (files.length === 0) return false;
  return sources.some(sourceDir => files.every(file => {
    const counterpart = path.join(sourceDir, path.relative(legacySkillDir, file));
    if (!storage.existsSync(counterpart)) return false;
    return contentHash(storage.readSync(file) ?? '') === contentHash(storage.readSync(counterpart) ?? '');
  }));
}

/**
 * Migrate skills from the legacy `.copilot/skills/<name>/` location to the
 * canonical `.github/skills/<name>/`. Manifest skills are moved; other skills are
 * removed only when `findLegacyCopilotSkills` proved them to be unmodified Squad
 * copies. User-added or edited skills in `.copilot/skills/` are never touched.
 * After successful migration, removes the now-empty `.copilot/skills/` directory.
 *
 * Idempotent: when a skill already exists at the new location the legacy
 * copy is tombstoned without comparing content — this protects any
 * in-place customization the user made at `.github/skills/<name>/` from
 * being clobbered, and means re-running upgrade is a no-op on the new
 * location. If only the legacy copy exists, it is moved over.
 *
 * See bradygaster/squad#1126 (canonical issue) — this is the migration
 * piece of that fix; #1304 is the PR that implements it.
 */
function migrateLegacyCopilotSkills(dest: string): { migrated: string[]; tombstoned: string[] } {
  const legacyDir = path.join(dest, '.copilot', 'skills');
  if (!storage.existsSync(legacyDir)) return { migrated: [], tombstoned: [] };

  const manifestSkills = new Set(
    TEMPLATE_MANIFEST
      .filter(f => f.source.startsWith('skills/'))
      .map(f => f.source.split('/')[1]) // 'skills/foo/SKILL.md' -> 'foo'
      .filter((s): s is string => Boolean(s)),
  );

  const newDir = path.join(dest, '.github', 'skills');
  const migrated: string[] = [];
  const tombstoned: string[] = [];

  for (const entry of findLegacyCopilotSkills(dest)) {
    const legacySkillDir = path.join(legacyDir, entry);
    if (!storage.isDirectorySync(legacySkillDir)) continue;

    const newSkillDir = path.join(newDir, entry);
    if (!manifestSkills.has(entry) || storage.existsSync(newSkillDir)) {
      // Retired Squad copy, or the new location already has it — drop the legacy copy without overwriting.
      try {
        storage.deleteDirSync(legacySkillDir);
        tombstoned.push(path.posix.join('.copilot/skills', entry));
      } catch {
        // best-effort; leave the legacy dir if we can't remove it
      }
      continue;
    }

    try {
      storage.mkdirSync(newDir, { recursive: true });
      copyDirRecursive(legacySkillDir, newSkillDir);
      storage.deleteDirSync(legacySkillDir);
      migrated.push(path.posix.join('.github/skills', entry));
    } catch {
      // best-effort; leave the legacy dir if anything fails
    }
  }

  // If the legacy `.copilot/skills/` directory is now empty, remove it too.
  try {
    if (storage.existsSync(legacyDir) && storage.listSync(legacyDir).length === 0) {
      storage.deleteDirSync(legacyDir);
      tombstoned.push('.copilot/skills');
    }
  } catch {
    // best-effort
  }

  return { migrated, tombstoned };
}

/**
 * Re-run the ESM import patcher against the project's own node_modules (#1190).
 *
 * npm runs postinstall with cwd inside the installed package dir, so a global
 * `npm install -g` only ever patches the global copy — the consumer repo's
 * node_modules stays unpatched and `squad doctor` keeps failing its
 * vscode-jsonrpc / copilot-sdk checks there. Loading the patch script and
 * pointing it at `<dest>/node_modules` closes that gap on every upgrade.
 *
 * Returns true when at least one file was patched.
 */
export async function ensureEsmImportsPatched(dest: string): Promise<boolean> {
  // Locate scripts/patch-esm-imports.mjs by walking up from the compiled file,
  // same approach as getTemplatesDir() — works from dist/cli/core/ and bundles.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let scriptPath: string | undefined;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'scripts', 'patch-esm-imports.mjs');
    if (storage.existsSync(candidate)) {
      scriptPath = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!scriptPath) return false;

  try {
    const patcher = await import(pathToFileURL(scriptPath).href) as {
      patchVscodeJsonrpcExports: (searchRoots?: string[]) => boolean;
      patchCopilotSdkSessionJs: (searchRoots?: string[]) => boolean;
    };
    const roots = [path.join(dest, 'node_modules')];
    const patchedExports = patcher.patchVscodeJsonrpcExports(roots);
    const patchedSession = patcher.patchCopilotSdkSessionJs(roots);
    return patchedExports || patchedSession;
  } catch (err) {
    warn(`Could not patch ESM imports in ${path.join(dest, 'node_modules')}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Run all ensure* checks and skill/template sync — shared by both code paths
 */
/**
 * Scaffold/repair the casting registry pair before the coordinator file is rendered, so one
 * upgrade produces the final file (F4: a 0.9.x project with an empty casting/ used to need two).
 * Idempotent; the later ensure pass finds nothing left to create.
 */
function preflightCastingPair(dest: string, templatesDir: string, filesUpdated: string[]): void {
  const created = ensureCastingDefaults(dest, templatesDir);
  if (created.length > 0) {
    success(`scaffolded ${created.length} default casting files`);
    filesUpdated.push(...created);
  }
}

/**
 * Built-in agent housekeeping that must happen BEFORE the coordinator file is rendered:
 * migrate `agents/Rai/` → `agents/rai/` and scaffold missing built-in charters. team.md is
 * user-owned and is changed only by the explicit `squad roster` command.
 */
function prepareBuiltinAgents(dest: string, templatesDir: string, filesUpdated: string[]): void {
  const raiMigration = migrateLegacyRaiAgent(dest);
  if (raiMigration.migrated.length > 0) {
    success(`migrated .squad/agents/Rai/ → .squad/agents/rai/${raiMigration.recordedInGit ? ' (recorded with git mv)' : ''}`);
    filesUpdated.push(...raiMigration.migrated);
  }
  if (raiMigration.tombstoned.length > 0) {
    success('removed stale .squad/agents/Rai/ (superseded by .squad/agents/rai/)');
  }

  const builtinAgents = ensureBuiltinAgents(dest, templatesDir);
  if (builtinAgents.length > 0) {
    const uniqueAgentNames = Array.from(new Set(builtinAgents.map(p => path.basename(path.dirname(p)))));
    success(`scaffolded ${uniqueAgentNames.length} built-in agent(s): ${uniqueAgentNames.join(', ')}`);
    filesUpdated.push(...builtinAgents);
  }

}

/**
 * Move manifest skills from `.copilot/skills/` to `.github/skills/` BEFORE the squad-owned
 * plan is built, so a customized legacy copy becomes the "existing" file the plan compares
 * (and backs up) instead of being tombstoned behind a freshly written template.
 */
function runLegacySkillMigration(dest: string, filesUpdated: string[]): void {
  const skillMigration = migrateLegacyCopilotSkills(dest);
  if (skillMigration.migrated.length > 0) {
    success(`migrated ${skillMigration.migrated.length} skill(s) from .copilot/skills/ → .github/skills/`);
    filesUpdated.push(...skillMigration.migrated);
  }
  if (skillMigration.tombstoned.length > 0) {
    success(`removed ${skillMigration.tombstoned.length} stale .copilot/skills entries (now live at .github/skills/)`);
  }
}

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

  const userOwned = ensureUserOwnedTemplates(dest, templatesDir);
  if (userOwned.length > 0) {
    success(`installed ${userOwned.length} missing user-owned template(s): ${userOwned.join(', ')}`);
    filesUpdated.push(...userOwned);
  }

  // iter-8: write squad_state MCP entry to repo-root `.mcp.json`
  // (auto-loaded by Copilot CLI ≥1.0.59, which walks up from cwd to the
  // git root looking for .mcp.json) and tombstone any stale project-level
  // entry left by older Squad versions in `.copilot/mcp-config.json`.
  // No HOME modifications.
  const pinnedSpec = projectSquadStateMcpSpec(await resolveSquadStateMcpSpec(getPackageVersion()));
  try {
    const rootResult = ensureSquadStateMcpInRoot(dest, getPackageVersion(), pinnedSpec);
    if (rootResult.written) {
      success(`installed squad_state MCP server to .mcp.json (${describeMcpSpec(pinnedSpec)}) — Copilot CLI will auto-load on next invocation`);
      filesUpdated.push('.mcp.json');
    }
  } catch (err) {
    warn(`Could not write .mcp.json: ${err instanceof Error ? err.message : err}`);
  }
  // iter-8: do NOT write to ~/.copilot/mcp-config.json on upgrade. The
  // repo-root .mcp.json write above is sufficient for Copilot CLI ≥1.0.59
  // (walks from cwd up looking for .mcp.json) AND for `copilot -p` from
  // the project root. Out-of-tree `copilot -p` should use
  // `--additional-mcp-config @.mcp.json`. See bradygaster/squad#1296.
  const tomb = tombstoneStaleSquadStateInProjectMcp(dest);
  if (tomb.removed) {
    success(`removed stale squad_state from ${tomb.path} (now lives in .mcp.json)`);
    filesUpdated.push('.copilot/mcp-config.json (tombstoned)');
  }
  const userConfig = reconcileSquadStateUserConfig(dest);
  if (userConfig.action === 'removed') {
    success(`removed duplicate ${(userConfig.keys ?? [userConfig.key]).join(', ')} from ${userConfig.path} (.mcp.json takes precedence)`);
    info(`  Backup: ${userConfig.backupPath}`);
  }

  // #1190: patch ESM imports in the repo-local node_modules — postinstall only
  // ever runs against the installed package's own directory tree.
  if (await ensureEsmImportsPatched(dest)) {
    success('patched ESM imports in repo-local node_modules (vscode-jsonrpc / copilot-sdk, see #449)');
    filesUpdated.push('node_modules (ESM patch)');
  }
}

/** Human-readable single-line description of an McpSpec for success() messages. */
export function describeMcpSpec(spec: SquadStateMcpSpec): string {
  if (spec.source === 'standalone') {
    return `${spec.command} (machine-specific standalone bundle; exact-version fallback recorded)`;
  }
  if (spec.source === 'local-entry') {
    return `${spec.command} ${spec.args[0]} (machine-specific installed CLI; exact-version fallback recorded)`;
  }
  const pkg = spec.args[1] ?? '<unknown>';
  return pkg;
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
 * Migrate the legacy case-sensitive `.squad/agents/Rai/` directory — produced
 * by prior releases that scaffolded the built-in with a capitalized directory
 * name — to the canonical lowercase `.squad/agents/rai/`, preserving any
 * existing charter/history content.
 *
 * Detection uses `storage.listSync` (on-disk entry names) rather than
 * `storage.existsSync('.squad/agents/rai')`, because `existsSync` can report
 * a false positive for `rai` on case-insensitive filesystems (macOS, Windows)
 * even when only the legacy `Rai` entry physically exists — that false
 * positive would make the migration silently no-op on those platforms and
 * leave the case-sensitive `.squad/agents/Rai/` behind on Linux checkouts of
 * the same repo.
 *
 * Idempotent and duplicate-safe:
 *  - Only `Rai/` exists → rename it to `rai/` through a temporary name
 *    (`Rai` → `.rai-tmp` → `rai`), because a direct case-only rename is a
 *    no-op for git on case-insensitive filesystems (Windows, macOS) and the
 *    index keeps tracking `agents/Rai/` forever (#2299). When the directory
 *    is tracked, both steps go through `git mv` so the rename is recorded;
 *    otherwise (or when git is unavailable) the filesystem is renamed directly.
 *  - A leftover `.rai-tmp/` from an interrupted run is finished (→ `rai/`) or
 *    dropped when `rai/` already exists.
 *  - Both `Rai/` and `rai/` exist (possible on a case-sensitive filesystem
 *    after a partial upgrade) → canonical `rai/` wins; the legacy `Rai/` is
 *    removed without overwriting `rai/`, so no in-place customization at the
 *    canonical location is ever clobbered.
 *  - Neither exists, or only `rai/` exists → no-op.
 *
 * @param dest Root directory containing .squad/
 * @returns Paths (relative to dest) affected by the migration
 */
export function migrateLegacyRaiAgent(dest: string): { migrated: string[]; tombstoned: string[]; recordedInGit: boolean } {
  const agentsDir = path.join(dest, '.squad', 'agents');
  const none = { migrated: [], tombstoned: [], recordedInGit: false };
  if (!storage.existsSync(agentsDir)) return none;

  const entries = storage.listSync(agentsDir);
  const legacyDir = path.join(agentsDir, 'Rai');
  const tempDir = path.join(agentsDir, '.rai-tmp');
  const canonicalDir = path.join(agentsDir, 'rai');
  const migrated: string[] = [];
  const tombstoned: string[] = [];
  let recordedInGit = false;

  const hasLegacy = entries.includes('Rai') && storage.isDirectorySync(legacyDir);
  const hasTemp = entries.includes('.rai-tmp') && storage.isDirectorySync(tempDir);
  const hasCanonical = entries.includes('rai');

  const gitMove = (from: string, to: string): boolean => {
    try {
      const rel = (p: string) => path.relative(dest, p).split(path.sep).join('/');
      // Only a tracked directory can be recorded; `ls-files` prints nothing for untracked paths.
      const tracked = execFileSync('git', ['ls-files', '--', rel(from)], { cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (!tracked) return false;
      execFileSync('git', ['mv', rel(from), rel(to)], { cwd: dest, stdio: ['pipe', 'pipe', 'pipe'] });
      return storage.existsSync(to) && storage.listSync(agentsDir).includes(path.basename(to));
    } catch {
      return false;
    }
  };
  const move = (from: string, to: string): void => {
    if (gitMove(from, to)) {
      recordedInGit = true;
      return;
    }
    storage.renameSync(from, to);
  };

  // Finish or discard an interrupted two-step rename before looking at Rai/.
  if (hasTemp) {
    try {
      if (hasCanonical) {
        storage.deleteDirSync(tempDir);
      } else {
        move(tempDir, canonicalDir);
        migrated.push(path.posix.join('.squad/agents', 'rai'));
      }
    } catch {
      // best-effort; leave the temp dir if we can't move it
    }
  }

  if (!hasLegacy) return { migrated, tombstoned, recordedInGit };

  if (hasCanonical || (hasTemp && migrated.length > 0)) {
    // Both exist — canonical `rai/` wins, drop the legacy copy as-is.
    try {
      storage.deleteDirSync(legacyDir);
      tombstoned.push(path.posix.join('.squad/agents', 'Rai'));
    } catch {
      // best-effort; leave the legacy dir if we can't remove it
    }
    return { migrated, tombstoned, recordedInGit };
  }

  try {
    move(legacyDir, tempDir);
    move(tempDir, canonicalDir);
    migrated.push(path.posix.join('.squad/agents', 'rai'));
  } catch {
    // best-effort; leave whatever step completed — the next run finishes it
  }
  return { migrated, tombstoned, recordedInGit };
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
 * Callers should run `migrateLegacyRaiAgent(dest)` before this function so a
 * pre-existing legacy `.squad/agents/Rai/` is renamed to `rai/` first — this
 * function's idempotency check (`storage.existsSync(agentDir)`) would
 * otherwise miss it on case-sensitive filesystems and scaffold a duplicate.
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
  //
  // dirName/templateFile use the authoritative lowercase kebab-case built-in
  // ID (`rai`, not `Rai`) so this matches the canonical `.squad-templates/`
  // charter filenames and the directory IDs every other built-in scaffolder
  // (cast.ts's `memberId()`) now produces. Canonical built-in contract:
  // scribe, ralph, rai, fact-checker.
  const builtins: Array<{ dirName: string; templateFile: string; displayName: string }> = [
    { dirName: 'rai', templateFile: 'rai-charter.md', displayName: 'Rai' },
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
 * Install user-owned template files that are missing on disk.
 *
 * Iterates TEMPLATE_MANIFEST entries with `overwriteOnUpgrade: false` and
 * copies each source template to its destination only if the destination
 * does not yet exist.  Existing user-customized files are never touched.
 *
 * Called during both `squad init` (post-SDK scaffolding) and `squad upgrade`
 * (via runEnsureChecks) so that newly-added user-owned templates are installed
 * for existing squads on upgrade without overwriting any prior customization.
 */
export function ensureUserOwnedTemplates(dest: string, templatesDir: string): string[] {
  const created: string[] = [];
  const squadDir = path.join(dest, '.squad');
  const userOwned = TEMPLATE_MANIFEST.filter(f => !f.overwriteOnUpgrade && !f.source.startsWith('skills/'));

  for (const entry of userOwned) {
    const srcPath = path.join(templatesDir, entry.source);
    // Destination paths can be relative to .squad/ or can use '../' for repo root
    const destPath = entry.destination.startsWith('../')
      ? path.join(dest, entry.destination.slice(3))
      : path.join(squadDir, entry.destination);

    if (!storage.existsSync(srcPath)) continue;
    if (storage.existsSync(destPath)) continue;

    storage.mkdirSync(path.dirname(destPath), { recursive: true });
    copyManagedFile(srcPath, destPath);
    created.push(entry.destination);
  }
  return created;
}

/** Refresh configured (plus any newly requested) client projections. */
async function refreshClients(dest: string, squadDir: string, options: UpgradeOptions, filesUpdated: string[]): Promise<void> {
  try {
    const synced = await applyClientProjectionsForUpgrade(dest, squadDir, {
      clients: options.clients,
      warn: (m) => warn(m.replace(/^⚠\s*/, '')),
    });
    if (synced.clients.length === 0) return;
    reportClientResults(synced.results, (m) => (m.startsWith('⚠') ? warn(m.slice(2)) : success(m.slice(2))));
    filesUpdated.push(`clients (${synced.clients.join(', ')})`);
  } catch (err) {
    warn(`Could not refresh client files: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Surface why a handwritten-registry repair or team.md backfill declined to act, including per-entry drops. */
function warnCastingRepairSkipped(headline: string, result: RepairResult): void {
  if (result.repaired || !result.reason) return;
  warn(`${headline}: ${result.reason}`);
  for (const { name, reason } of result.dropped ?? []) {
    dim(`    - ${name}: ${reason}`);
  }
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
    fatalNoSquad();
  }

  const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');
  const oldVersion = readInstalledVersion(agentDest) ?? '0.0.0';
  stripRetiredProfileTeamRoot(squadDirInfo.path, dest, options.dryRun === true);
  const squadConfig = readSquadConfig(squadDirInfo.path);
  const mcpConfigMode = detectMcpConfigMode(squadConfig, agentDest);
  const isGitHubForMcp = detectIsGitHubForMcp(dest, squadConfig);

  // Check if already current
  const isAlreadyCurrent = !options.force && oldVersion && oldVersion !== '0.0.0' && compareSemver(oldVersion, cliVersion) === 0;

  const projectType = detectProjectType(dest);

  // A handwritten registry (model wrote registry.json itself over the empty init pair) is repaired BEFORE the
  // strict preflight, which would otherwise reject it and make the repair in ensureCastingDefaults unreachable.
  // The repair reconciles a single Init Mode history snapshot; registries with real history keep failing closed.
  const castingDir = path.join(squadDirInfo.path, 'casting');
  const dryRun = options.dryRun ?? false;
  const repair = repairHandwrittenCastingRegistry(castingDir, { dryRun });
  const handwrittenRepaired = repair.repaired;
  if (handwrittenRepaired) {
    if (dryRun) {
      info('Would normalize handwritten .squad/casting/registry.json to a managed registry/history pair.');
    } else {
      warn('Normalized a handwritten .squad/casting/registry.json');
    }
  } else {
    warnCastingRepairSkipped('Could not normalize handwritten .squad/casting/registry.json', repair);
  }
  // Legacy registries still go through the strict preflight (and its specific errors); only the
  // preflight's generic failure is enriched with the handwritten-repair reason and fix.
  const castingMigrated = handwrittenRepaired && dryRun
    ? false
    : withCastingRepairContext(repair, () => preflightCastingRegistryPair(castingDir, dryRun));
  if (castingMigrated) {
    info(dryRun
      ? 'Would migrate legacy casting state to a managed registry/history pair.'
      : 'Migrated legacy casting state to a managed registry/history pair.');
  }

  // --dry-run: preview what upgrade would do without writing (#1052, #2297)
  if (options.dryRun) {
    const projectLabel = readProjectLabel(dest, squadConfig);
    info(`\n${BOLD}Dry run${RESET} — ${projectLabel}: previewing upgrade from ${oldVersion && oldVersion !== '0.0.0' ? oldVersion : 'unknown'} → ${cliVersion}\n`);
    const backfill = backfillCastingRegistryFromTeam(castingDir, path.join(squadDirInfo.path, 'team.md'), { dryRun: true });
    if (backfill.repaired) {
      info('Would backfill .squad/casting/registry.json from .squad/team.md');
    } else {
      warnCastingRepairSkipped('Would not backfill .squad/casting/registry.json from .squad/team.md', backfill);
    }
    const templatesDir = getTemplatesDir();
    const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
    if (storage.existsSync(agentSrc)) {
      writeAgentTemplate(agentSrc, agentDest, cliVersion, mcpConfigMode, isGitHubForMcp, { dryRun: true, squadDir: squadDirInfo.path });
    }
    const plan = planSquadOwnedFiles(dest, collectSquadOwnedCandidates(dest, squadDirInfo.path, templatesDir, projectType));
    for (const line of formatSquadOwnedPlan(plan)) info(line);
    const retired = planRetiredFiles(dest, plan);
    for (const file of retired) {
      info(file.customized
        ? `  keep       ${file.relPath}  (retired by Squad but modified locally — would be left in place)`
        : `  remove     ${file.relPath}  (retired — no longer shipped, unmodified)`);
    }
    const staleSkills = findLegacyCopilotSkills(dest);
    if (staleSkills.length > 0) info(`Would move/remove ${staleSkills.length} legacy .copilot/skills entr${staleSkills.length === 1 ? 'y' : 'ies'}: ${staleSkills.join(', ')}`);
    const attrs = ensureGitattributes(dest, { dryRun: true });
    if (attrs.length > 0) info(`Would append ${attrs.length} rule(s) to .gitattributes (existing lines untouched).`);
    const ignores = ensureGitignore(dest, { dryRun: true });
    if (ignores.length > 0) info(`Would append ${ignores.length} entr${ignores.length === 1 ? 'y' : 'ies'} to .gitignore (existing lines untouched): ${ignores.join(', ')}`);
    try {
      const userConfig = reconcileSquadStateUserConfig(dest, { dryRun: true });
      if (userConfig.action === 'would-remove') {
        info(`Would remove duplicate ${(userConfig.keys ?? [userConfig.key]).join(', ')} from ${userConfig.path} after backing it up (.mcp.json takes precedence).`);
      }
      const planned = await applyClientProjectionsForUpgrade(dest, squadDirInfo.path, {
        clients: options.clients,
        dryRun: true,
        warn: (m) => warn(m.replace(/^⚠\s*/, '')),
      });
      if (planned.clients.length > 0) info(`Would project client host files for: ${planned.clients.join(', ')}`);
    } catch (err) {
      warn(`Could not plan client files: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log(`\nRun without --dry-run to apply.\n`);
    return { fromVersion: oldVersion, toVersion: cliVersion, filesUpdated: [], migrationsRun: [] };
  }

  if (isAlreadyCurrent) {
    info(`Already up to date (v${cliVersion})`);

    // Still run missing migrations
    const migrationsApplied = await runMigrations(squadDirInfo.path, oldVersion, cliVersion);

    const templatesDir = getTemplatesDir();

    // Legacy skill copies move first so the plan below compares (and backs up) the user's file.
    runLegacySkillMigration(dest, filesUpdated);

    // Refresh squad-owned files even when version matches (content-compared, backups verified)
    const plan = planSquadOwnedFiles(dest, collectSquadOwnedCandidates(dest, squadDirInfo.path, templatesDir, projectType));
    applyUpgradeFiles(dest, plan, cliVersion, filesUpdated);

    // The casting pair must exist BEFORE the coordinator is written: syncTeamCapabilities reads it
    // to render the <!-- squad:capabilities --> block, so a 0.9.x project (empty casting/) would
    // otherwise get the block only on the SECOND upgrade (F4, upgrade matrix).
    prepareBuiltinAgents(dest, templatesDir, filesUpdated);
    preflightCastingPair(dest, templatesDir, filesUpdated);

    // Refresh squad.agent.md
    const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
    if (storage.existsSync(agentSrc)) {
      storage.mkdirSync(path.dirname(agentDest), { recursive: true });
      writeAgentTemplate(agentSrc, agentDest, cliVersion, mcpConfigMode, isGitHubForMcp, { squadDir: squadDirInfo.path });
      success('upgraded squad.agent.md');
      filesUpdated.push('squad.agent.md');
    } else {
      warn('squad.agent.md.template not found — squad.agent.md was not refreshed. Reinstall or repair the CLI to restore the missing template.');
    }

    // Run infrastructure ensure checks even when already current
    await runEnsureChecks(dest, templatesDir, filesUpdated);
    await refreshClients(dest, squadDirInfo.path, options, filesUpdated);

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

  // See preflightCastingPair: the capabilities block needs the casting pair first (F4).
  prepareBuiltinAgents(dest, templatesDir, filesUpdated);
  preflightCastingPair(dest, templatesDir, filesUpdated);

  storage.mkdirSync(path.dirname(agentDest), { recursive: true });
  writeAgentTemplate(agentSrc, agentDest, cliVersion, mcpConfigMode, isGitHubForMcp, { squadDir: squadDirInfo.path });

  const fromLabel = oldVersion === '0.0.0' || !oldVersion ? 'unknown' : oldVersion;
  success(`upgraded coordinator from ${fromLabel} to ${cliVersion}`);
  filesUpdated.push('squad.agent.md');

  // Legacy skill copies move first so the plan below compares (and backs up) the user's file.
  runLegacySkillMigration(dest, filesUpdated);

  // Upgrade every squad-owned file (manifest templates, skills, workflows, .squad/templates mirror):
  // content-compared, customized files backed up and verified before being overwritten.
  const plan = planSquadOwnedFiles(dest, collectSquadOwnedCandidates(dest, squadDirInfo.path, templatesDir, projectType));
  applyUpgradeFiles(dest, plan, cliVersion, filesUpdated);

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
      syncCopilotInstructionsFile(copilotInstructionsSrc, copilotInstructionsDest);
      success('upgraded .github/copilot-instructions.md');
      filesUpdated.push('copilot-instructions.md');
    }
  }

  // Run infrastructure ensure checks
  await runEnsureChecks(dest, templatesDir, filesUpdated);
  await refreshClients(dest, squadDirInfo.path, options, filesUpdated);

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

export type SelfUpgradePackageManager = 'npm' | 'pnpm' | 'yarn';

/** npm dist-tags the self-upgrade can target. `insider` is the canonical prerelease channel (preview is an alias). */
export type SelfUpgradeTag = 'latest' | 'insider';

/** Minimal shape of `child_process.execSync` used by the self-upgrade; injectable for tests. */
export type SelfUpgradeExec = (command: string, options: { stdio: 'inherit' }) => unknown;

/** Resolve the version an npm dist-tag currently points at; `null` when the registry cannot be reached. */
export type SelfUpgradeTagResolver = (tag: SelfUpgradeTag) => Promise<string | null>;

export interface SelfUpgradeOptions {
  insider?: boolean;
  force?: boolean;
  /** Print the exact command and perform nothing (#2295). */
  dryRun?: boolean;
  /** Override the detected package manager (tests, or a future `--pm` flag). */
  packageManager?: SelfUpgradePackageManager;
  /** Override the shell-out; defaults to `child_process.execSync`. */
  exec?: SelfUpgradeExec;
  /** Running CLI version used for channel detection and the downgrade guard; defaults to the package version. */
  currentVersion?: string;
  /** Override the dist-tag → version lookup; defaults to the public npm registry. */
  resolveTagVersion?: SelfUpgradeTagResolver;
}

export interface SelfUpgradeResult {
  packageManager: SelfUpgradePackageManager;
  tag: SelfUpgradeTag;
  command: string;
  currentVersion: string;
  /** Version the tag resolved to, or null when the registry was unreachable. */
  targetVersion: string | null;
  /** False for --dry-run. */
  performed: boolean;
}

/**
 * Which dist-tag a running CLI should follow: a prerelease install (`2.0.0-preview.1`,
 * `1.2.0-insider.3`) stays on `insider` (the canonical channel; `preview` is an alias of it),
 * a stable install follows `latest`. Blindly using `latest` from a preview downgraded users (#2295).
 */
export function detectSelfUpgradeTag(currentVersion: string): SelfUpgradeTag {
  const prerelease = currentVersion.split('-').slice(1).join('-').toLowerCase();
  if (!prerelease) return 'latest';
  if (prerelease.startsWith('insider') || prerelease.startsWith('preview')) return 'insider';
  return 'latest';
}

/** The exact command `selfUpgradeCli` runs for a package manager and dist-tag. */
export function selfUpgradeCommand(packageManager: SelfUpgradePackageManager, insiderOrTag: boolean | SelfUpgradeTag): string {
  const tag: SelfUpgradeTag = typeof insiderOrTag === 'boolean' ? (insiderOrTag ? 'insider' : 'latest') : insiderOrTag;
  const pkg = `@bradygaster/squad-cli@${tag}`;
  switch (packageManager) {
    case 'pnpm': return `pnpm add -g ${pkg}`;
    case 'yarn': return `yarn global add ${pkg}`;
    default: return `npm install -g ${pkg}`;
  }
}

/** Default dist-tag lookup against the public npm registry (3s timeout, never throws). */
export async function resolveSelfUpgradeTagVersion(tag: SelfUpgradeTag): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://registry.npmjs.org/-/package/@bradygaster%2Fsquad-cli/dist-tags', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const tags = await res.json() as Record<string, string>;
    return typeof tags[tag] === 'string' ? tags[tag]! : null;
  } catch {
    return null;
  }
}

/**
 * Detect the package manager that installed the CLI.
 * Returns 'npm', 'pnpm', 'yarn', or 'npm' as fallback.
 */
export function detectPackageManager(): SelfUpgradePackageManager {
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
 * - The dist-tag follows the running CLI's channel (`insider` for any prerelease,
 *   `latest` for stable) unless `--insider` forces `insider`.
 * - The tag is resolved against the registry first; a target older than the running
 *   version is refused unless `--force` (a preview must never silently become `latest`).
 * - `--dry-run` prints the exact command and performs nothing: no exec, no network side
 *   effects beyond the read-only tag lookup.
 * - On EACCES errors, suggests `sudo` with the detected installer name.
 */
export async function selfUpgradeCli(options: SelfUpgradeOptions = {}): Promise<SelfUpgradeResult> {
  const pm = options.packageManager ?? detectPackageManager();
  const currentVersion = options.currentVersion ?? getPackageVersion();
  const tag: SelfUpgradeTag = options.insider ? 'insider' : detectSelfUpgradeTag(currentVersion);
  const cmd = selfUpgradeCommand(pm, tag);
  const resolve = options.resolveTagVersion ?? resolveSelfUpgradeTagVersion;
  const targetVersion = await resolve(tag);

  if (targetVersion && safeCompareVersions(targetVersion, currentVersion) < 0) {
    const msg = `Refusing to downgrade: @${tag} currently resolves to ${targetVersion}, older than the installed ${currentVersion}. `
      + `Pass --force to install it anyway${tag === 'latest' ? ', or --insider to stay on the prerelease channel' : ''}.`;
    if (!options.force) {
      throw Object.assign(new Error(msg), { code: 'EDOWNGRADE' });
    }
    warn(msg.replace('Refusing to downgrade', 'Downgrading on --force'));
  }

  const target = targetVersion ? ` (${tag} → ${targetVersion})` : ` (${tag}; registry not reachable to confirm the target version)`;
  const result: SelfUpgradeResult = { packageManager: pm, tag, command: cmd, currentVersion, targetVersion, performed: false };

  if (options.dryRun) {
    info(`${BOLD}Dry run${RESET} — would self-upgrade via ${pm}${target}:`);
    info(`  ${cmd}`);
    info('Nothing was installed. Run without --dry-run to apply.');
    return result;
  }

  const exec: SelfUpgradeExec = options.exec ?? (await import('node:child_process')).execSync;
  info(`Self-upgrading via ${pm}${target}: ${cmd}`);

  try {
    exec(cmd, { stdio: 'inherit' });
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
  return { ...result, performed: true };
}

/** `compareVersions` that treats unparsable versions as equal instead of throwing. */
function safeCompareVersions(a: string, b: string): number {
  try {
    return compareVersions(a, b);
  } catch {
    return 0;
  }
}
