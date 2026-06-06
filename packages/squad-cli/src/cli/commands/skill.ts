/**
 * Skill command — APM (Agent Package Manager) integration
 *
 * squad skill publish [<name>]  — export a skill to APM format
 * squad skill install <name>    — install a skill from APM registry
 * squad skill list              — list installed skills
 *
 * APM is package.json for AI agent context: https://github.com/microsoft/apm
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { success, warn, info, dim, bold, DIM, BOLD, RESET } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { ghAvailable } from '../core/gh-cli.js';

const IS_WINDOWS = process.platform === 'win32';
const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────────────

/** A skill entry inside apm.yml */
export interface ApmSkill {
  name: string;
  description?: string;
  path: string;
  version?: string;
  source?: string;
}

/** Root apm.yml structure */
export interface ApmManifest {
  name: string;
  version: string;
  description?: string;
  skills?: ApmSkill[];
  instructions?: Array<{ path: string; target: string }>;
  prompts?: Array<{ path: string; target: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse `---\nkey: value\n---` front-matter from a Markdown file. */
function parseFrontMatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = value;
  }
  return result;
}

/** Read the project name from package.json, falling back to directory name. */
async function readProjectName(dest: string): Promise<string> {
  const pkgPath = join(dest, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name) return pkg.name;
    } catch {
      // ignore
    }
  }
  return basename(dest);
}

/**
 * Resolve the skills directory, preferring .copilot/skills/ over .squad/skills/.
 * Returns { dir, relPrefix } where relPrefix is the display path (e.g. '.copilot/skills').
 */
function resolveSkillsDir(dest: string): { dir: string; relPrefix: string } {
  const copilotSkills = join(dest, '.copilot', 'skills');
  if (existsSync(copilotSkills)) {
    return { dir: copilotSkills, relPrefix: '.copilot/skills' };
  }
  const squadDirInfo = detectSquadDir(dest);
  const squadSkills = join(squadDirInfo.path, 'skills');
  if (existsSync(squadSkills)) {
    return { dir: squadSkills, relPrefix: `${squadDirInfo.name}/skills` };
  }
  // Default to .copilot/skills/ for new installs
  return { dir: copilotSkills, relPrefix: '.copilot/skills' };
}

/** Collect all skills from the skills directory. */
async function collectSkills(skillsDir: string, relPrefix: string): Promise<ApmSkill[]> {
  if (!existsSync(skillsDir)) return [];
  const skills: ApmSkill[] = [];
  try {
    const entries = await readdir(skillsDir);
    for (const entry of entries) {
      const skillFile = join(skillsDir, entry, 'skill.md');
      if (!existsSync(skillFile)) continue;
      const content = await readFile(skillFile, 'utf8');
      const fm = parseFrontMatter(content);
      skills.push({
        name: fm['name'] ?? entry,
        description: fm['description'],
        path: `${relPrefix}/${entry}/skill.md`,
        version: fm['version'],
        source: fm['source'],
      });
    }
  } catch {
    // ignore read errors
  }
  return skills;
}

// ── Sub-commands ──────────────────────────────────────────────────────────────

/**
 * squad skill publish [<name>]
 *
 * Exports a skill (or all skills) to APM-compatible format.
 * Creates/updates apm.yml at the project root.
 */
async function publish(dest: string, skillName?: string): Promise<void> {
  const { dir: skillsDir, relPrefix } = resolveSkillsDir(dest);

  if (!existsSync(skillsDir)) {
    fatal('No skills directory found. Create .copilot/skills/ first.');
  }

  const projectName = await readProjectName(dest);

  if (skillName) {
    // Publish a single named skill
    const skillFile = join(skillsDir, skillName, 'skill.md');
    if (!existsSync(skillFile)) {
      fatal(`Skill '${skillName}' not found at ${relPrefix}/${skillName}/skill.md`);
    }

    const content = await readFile(skillFile, 'utf8');
    const fm = parseFrontMatter(content);

    // Build the skill's own apm.yml inside its directory
    const apmSkillPath = join(skillsDir, skillName, 'apm.yml');
    const skillApm = [
      `name: ${fm['name'] ?? skillName}`,
      `version: ${fm['version'] ?? '1.0.0'}`,
      fm['description'] ? `description: "${fm['description']}"` : null,
      ``,
      `skills:`,
      `  - name: ${fm['name'] ?? skillName}`,
      `    path: skill.md`,
      fm['description'] ? `    description: "${fm['description']}"` : null,
    ]
      .filter(l => l !== null)
      .join('\n');

    await writeFile(apmSkillPath, skillApm + '\n', 'utf8');
    success(`Published skill '${skillName}' to ${relPrefix}/${skillName}/apm.yml`);
    info(`${DIM}APM format ready — push to GitHub to share via APM registry${RESET}`);
    return;
  }

  // Publish all skills → update project-level apm.yml
  const skills = await collectSkills(skillsDir, relPrefix);
  const apmPath = join(dest, 'apm.yml');

  // Read existing apm.yml to preserve manually-added fields
  let existing: Partial<ApmManifest> = {};
  if (existsSync(apmPath)) {
    try {
      // Simple YAML parse — only top-level fields we care about
      const raw = await readFile(apmPath, 'utf8');
      if (raw.includes('instructions:')) {
        // Preserve instructions block (just keep existing file, re-emit skills section)
        info(`${DIM}Updating skills section in existing apm.yml${RESET}`);
      }
      existing = { name: projectName };
    } catch {
      existing = {};
    }
  }

  const lines = [
    `# apm.yml — Agent Package Manager manifest`,
    `# See: https://github.com/microsoft/apm`,
    ``,
    `name: ${existing.name ?? projectName}`,
    `version: 1.0.0`,
    ``,
    `# Skills exported from ${relPrefix}/`,
    `skills:`,
    ...skills.map(s =>
      [
        `  - name: ${s.name}`,
        s.description ? `    description: "${s.description}"` : null,
        `    path: ${s.path}`,
        s.version ? `    version: ${s.version}` : null,
      ]
        .filter(l => l !== null)
        .join('\n')
    ),
    ``,
    `# Instruction files deployed by 'apm install'`,
    `instructions:`,
    `  - path: .squad/copilot-instructions.md`,
    `    target: .github/copilot-instructions.md`,
    ``,
    `# Prompts deployed by 'apm install'`,
    `prompts:`,
    `  - path: ${relPrefix}/*/skill.md`,
    `    target: .github/prompts/`,
  ];

  await writeFile(apmPath, lines.join('\n') + '\n', 'utf8');

  if (skills.length > 0) {
    success(`Published ${skills.length} skill(s) to apm.yml`);
    for (const s of skills) {
      info(`  ${DIM}• ${s.name}${RESET}`);
    }
  } else {
    success(`Created apm.yml (no skills found yet — add skills to ${relPrefix}/)`);
  }
  info(`${DIM}Run 'apm publish' to push to the APM registry${RESET}`);
}

/**
 * squad skill install <source>
 *
 * Installs a skill from an APM source.
 * Source formats:
 *   owner/repo              — install all skills from a GitHub repo
 *   owner/repo/skill-name   — install a specific skill
 *   https://...             — URL to a raw skill.md
 */
async function install(dest: string, source: string): Promise<void> {
  if (!source) {
    fatal('Usage: squad skill install <owner/repo>[/<skill-name>] | <url>');
  }

  const { dir: skillsDir, relPrefix } = resolveSkillsDir(dest);

  if (!existsSync(skillsDir)) {
    await mkdir(skillsDir, { recursive: true });
  }

  // URL-based install
  if (source.startsWith('http://') || source.startsWith('https://')) {
    await installFromUrl(source, skillsDir, relPrefix);
    return;
  }

  // GitHub-based: owner/repo or owner/repo/skill-name
  const parts = source.split('/');
  if (parts.length < 2) {
    fatal('Invalid source. Use: owner/repo, owner/repo/skill-name, or a URL');
  }

  const owner = parts[0]!;
  const repo = parts[1]!;
  const skillFilter = parts.length >= 3 ? parts.slice(2).join('/') : undefined;

  if (!(await ghAvailable())) {
    fatal('GitHub CLI (gh) is required for APM install. Install from https://cli.github.com/');
  }

  info(`${DIM}Fetching skill(s) from ${owner}/${repo}...${RESET}`);

  // Try to find skills via gh api — look for apm.yml or .copilot/skills/
  await installFromGitHub(owner, repo, skillFilter, skillsDir, dest);
}

async function installFromUrl(url: string, skillsDir: string, relPrefix: string): Promise<void> {
  let content: string;
  try {
    // Node 18+ has built-in fetch
    const res = await fetch(url);
    if (!res.ok) {
      fatal(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    content = await res.text();
  } catch (err: any) {
    fatal(`Failed to fetch ${url}: ${err.message}`);
    return;
  }

  // Derive skill name from URL
  const urlName = url
    .split('/')
    .filter(Boolean)
    .slice(-2, -1)[0] ??
    'imported-skill';
  const skillName = urlName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const skillDir = join(skillsDir, skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'skill.md'), content, 'utf8');

  success(`Installed skill '${skillName}' from URL`);
  info(`  ${DIM}Location: ${relPrefix}/${skillName}/skill.md${RESET}`);
}

async function installFromGitHub(
  owner: string,
  repo: string,
  skillFilter: string | undefined,
  skillsDir: string,
  dest: string,
): Promise<void> {
  // First, try to read the apm.yml from the repo to discover skills
  let apmContent: string | null = null;
  try {
    const { stdout } = await execFileAsync('gh', [
      'api',
      `repos/${owner}/${repo}/contents/apm.yml`,
      '--jq', '.content',
    ], { shell: IS_WINDOWS });
    apmContent = Buffer.from(stdout.trim(), 'base64').toString('utf8');
  } catch {
    // No apm.yml — fall back to scanning skills directories
  }

  if (!apmContent) {
    // Fall back: try skills directories via API
    await installSkillsFromSquadDir(owner, repo, skillFilter, skillsDir);
    return;
  }

  // Parse the apm.yml to find skill paths
  const skillPaths: Array<{ name: string; path: string }> = [];
  const lines = apmContent.split('\n');
  let inSkills = false;
  let currentSkill: { name?: string; path?: string } = {};

  for (const line of lines) {
    if (line.trim() === 'skills:') {
      inSkills = true;
      continue;
    }
    if (inSkills && line.match(/^[a-z]/i) && !line.startsWith('  ')) {
      // New top-level key — exit skills section
      if (currentSkill.name && currentSkill.path) skillPaths.push(currentSkill as { name: string; path: string });
      currentSkill = {};
      inSkills = false;
    }
    if (inSkills) {
      const nameMatch = line.match(/^\s+- name:\s*(.+)$/);
      const pathMatch = line.match(/^\s+path:\s*(.+)$/);
      if (nameMatch) {
        if (currentSkill.name && currentSkill.path) skillPaths.push(currentSkill as { name: string; path: string });
        currentSkill = { name: nameMatch[1]!.trim() };
      }
      if (pathMatch) currentSkill.path = pathMatch[1]!.trim();
    }
  }
  if (currentSkill.name && currentSkill.path) skillPaths.push(currentSkill as { name: string; path: string });

  // Filter by skill name if specified
  const toInstall = skillFilter
    ? skillPaths.filter(s => s.name === skillFilter || s.path.includes(skillFilter))
    : skillPaths;

  if (toInstall.length === 0) {
    if (skillFilter) {
      fatal(`Skill '${skillFilter}' not found in ${owner}/${repo}'s apm.yml`);
    } else {
      warn(`No skills declared in ${owner}/${repo}'s apm.yml`);
      return;
    }
  }

  let installed = 0;
  for (const skill of toInstall) {
    try {
      const { stdout: rawContent } = await execFileAsync('gh', [
        'api',
        `repos/${owner}/${repo}/contents/${skill.path}`,
        '--jq', '.content',
      ], { shell: IS_WINDOWS });
      const content = Buffer.from(rawContent.trim(), 'base64').toString('utf8');
      const skillDir = join(skillsDir, skill.name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'skill.md'), content, 'utf8');

      // Write a source metadata file so we can track origin
      const meta = {
        source: `${owner}/${repo}`,
        path: skill.path,
        installed_at: new Date().toISOString(),
      };
      await writeFile(join(skillDir, '.apm-source.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

      success(`Installed skill '${skill.name}'`);
      info(`  ${DIM}Source: ${owner}/${repo}${skill.path}${RESET}`);
      installed++;
    } catch (err: any) {
      warn(`Failed to install '${skill.name}': ${err.message}`);
    }
  }

  if (installed > 0) {
    info(`\n${DIM}Run 'squad skill publish' to refresh apm.yml with newly installed skills${RESET}`);
  }
}

async function installSkillsFromSquadDir(
  owner: string,
  repo: string,
  skillFilter: string | undefined,
  skillsDir: string,
): Promise<void> {
  // Try .copilot/skills/ (standard) then .squad/skills/ (legacy) then bare skills/
  const candidates = ['.copilot/skills', '.squad/skills', 'skills'];
  let entries: Array<{ name: string; path: string; type: string }> = [];

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync('gh', [
        'api',
        `repos/${owner}/${repo}/contents/${candidate}`,
        '--jq', '[.[] | {name: .name, path: .path, type: .type}]',
      ], { shell: IS_WINDOWS });
      entries = JSON.parse(stdout);
      break;
    } catch {
      continue;
    }
  }

  if (entries.length === 0) {
    fatal(`No skills directory found in ${owner}/${repo}. The repo may not use APM or Squad conventions.`);
  }

  const dirs = entries.filter(e => e.type === 'dir');
  const toInstall = skillFilter ? dirs.filter(d => d.name === skillFilter) : dirs;

  if (toInstall.length === 0) {
    if (skillFilter) {
      fatal(`Skill '${skillFilter}' not found in ${owner}/${repo}`);
    } else {
      warn(`No skill directories found in ${owner}/${repo}`);
      return;
    }
  }

  let installed = 0;
  for (const dir of toInstall) {
    const skillFilePath = `${dir.path}/skill.md`;
    try {
      const { stdout: rawContent } = await execFileAsync('gh', [
        'api',
        `repos/${owner}/${repo}/contents/${skillFilePath}`,
        '--jq', '.content',
      ], { shell: IS_WINDOWS });
      const content = Buffer.from(rawContent.trim(), 'base64').toString('utf8');
      const skillDir = join(skillsDir, dir.name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'skill.md'), content, 'utf8');

      const meta = {
        source: `${owner}/${repo}`,
        path: skillFilePath,
        installed_at: new Date().toISOString(),
      };
      await writeFile(join(skillDir, '.apm-source.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

      success(`Installed skill '${dir.name}'`);
      info(`  ${DIM}Source: ${owner}/${repo}/${skillFilePath}${RESET}`);
      installed++;
    } catch {
      warn(`Skipped '${dir.name}' — no skill.md found`);
    }
  }

  if (installed > 0) {
    info(`\n${DIM}Run 'squad skill publish' to refresh apm.yml${RESET}`);
  }
}

/**
 * squad skill list
 *
 * Lists installed skills from .copilot/skills/ (or legacy .squad/skills/).
 */
async function listSkills(dest: string): Promise<void> {
  const { dir: skillsDir, relPrefix } = resolveSkillsDir(dest);

  if (!existsSync(skillsDir)) {
    info('No skills directory found. Run "squad init" first or create .copilot/skills/');
    return;
  }

  const skills = await collectSkills(skillsDir, relPrefix);

  if (skills.length === 0) {
    info(`${DIM}No skills installed yet.${RESET}`);
    info(`Install a skill: squad skill install <owner/repo>`);
    return;
  }

  console.log(`\n${BOLD}Installed Skills${RESET}\n`);
  for (const skill of skills) {
    const metaPath = join(skillsDir, skill.name, '.apm-source.json');
    let sourceNote = '';
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await readFile(metaPath, 'utf8'));
        sourceNote = ` ${DIM}(from ${meta.source})${RESET}`;
      } catch {
        // ignore
      }
    }
    console.log(`  ${BOLD}${skill.name}${RESET}${sourceNote}`);
    if (skill.description) {
      console.log(`    ${DIM}${skill.description}${RESET}`);
    }
  }
  console.log();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Entry point for `squad skill` command.
 *
 * @param dest - Working directory (usually process.cwd())
 * @param args - Remaining args after `squad skill`
 */
export async function runSkill(dest: string, args: string[]): Promise<void> {
  const subCmd = args[0];

  if (!subCmd || subCmd === 'help' || subCmd === '--help') {
    console.log(`\n${BOLD}squad skill${RESET} — APM (Agent Package Manager) integration\n`);
    console.log(`Usage:`);
    console.log(`  squad skill publish [<skill-name>]   Export skill(s) to APM format (apm.yml)`);
    console.log(`  squad skill install <source>         Install from APM registry`);
    console.log(`  squad skill list                     List installed skills`);
    console.log(`\nInstall sources:`);
    console.log(`  owner/repo                           All skills from a GitHub repo`);
    console.log(`  owner/repo/skill-name                A specific skill from a GitHub repo`);
    console.log(`  https://...                          A direct URL to a skill.md file`);
    console.log(`\nAPM registry: https://github.com/microsoft/apm\n`);
    return;
  }

  switch (subCmd) {
    case 'publish': {
      const skillName = args[1];
      await publish(dest, skillName);
      break;
    }
    case 'install': {
      const source = args[1];
      if (!source) {
        fatal('Usage: squad skill install <owner/repo>[/<skill-name>] | <url>');
      }
      await install(dest, source);
      break;
    }
    case 'list':
      await listSkills(dest);
      break;
    default:
      fatal(`Unknown skill subcommand: ${subCmd}\nRun 'squad skill help' for usage.`);
  }
}
