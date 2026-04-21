/**
 * Squad Migrate Command — converts between markdown-only and SDK-First formats
 * @module cli/commands/migrate
 */

import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  FSStorageProvider,
  createSharedSquad,
  normalizeRemoteUrl,
  getRemoteUrl,
  validateRepoKey,
} from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import { success, warn, dim, bold, BOLD, RESET, DIM } from '../core/output.js';
import { fatal, SquadError } from '../core/errors.js';
import { migrateDirectory } from '../core/migrate-directory.js';
import type {
  AgentDefinition,
  TeamDefinition,
  RoutingDefinition,
  CastingDefinition,
} from '@bradygaster/squad-sdk';

export interface MigrateOptions {
  to?: 'sdk' | 'markdown' | 'shared';
  from?: 'ai-team';
  dryRun?: boolean;
  key?: string;
  keepLocal?: boolean;
}

interface ParsedTeam {
  name: string;
  description: string;
  projectContext: string;
  members: string[];
}

interface ParsedAgent {
  name: string;
  role: string;
  charter: string;
  status: 'active' | 'inactive' | 'retired';
}

interface ParsedRoutingRule {
  pattern: string;
  agents: string[];
  description?: string;
}

interface ParsedCasting {
  allowlistUniverses: string[];
  overflowStrategy: 'reject' | 'generic' | 'rotate';
  capacity?: Record<string, number>;
}

/**
 * Detect current squad mode
 */
function detectMode(cwd: string): 'sdk' | 'markdown' | 'legacy' | 'none' {
  const hasConfigTs = storage.existsSync(path.join(cwd, 'squad.config.ts'));
  const hasConfigJs = storage.existsSync(path.join(cwd, 'squad.config.js'));
  const hasSquadDir = storage.existsSync(path.join(cwd, '.squad'));
  const hasAiTeamDir = storage.existsSync(path.join(cwd, '.ai-team'));

  if (hasConfigTs || hasConfigJs) return 'sdk';
  if (hasSquadDir) return 'markdown';
  if (hasAiTeamDir) return 'legacy';
  return 'none';
}

/**
 * Parse team.md
 */
function parseTeamMd(squadDir: string): ParsedTeam {
  const teamPath = path.join(squadDir, 'team.md');
  if (!storage.existsSync(teamPath)) {
    fatal('No .squad/team.md found — cannot migrate');
  }

  const content = storage.readSync(teamPath) ?? '';
  const lines = content.split('\n');

  let name = 'untitled-squad';
  let description = '';
  let projectContext = '';
  const members: string[] = [];

  // Parse header (first h1 after front matter)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('# Squad Team')) {
      const match = line.match(/# Squad Team — (.+)/);
      if (match) name = match[1]!;
      break;
    }
  }

  // Parse description (blockquote after header)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('> ')) {
      description = line.slice(2).trim();
      break;
    }
  }

  // Parse ## Members table
  let inMembersTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Members')) {
      inMembersTable = true;
      continue;
    }
    
    if (inMembersTable && line.startsWith('##')) {
      inMembersTable = false;
      break;
    }
    
    if (inMembersTable && line.startsWith('|') && !line.includes('---') && !line.includes('Name')) {
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 4) {
        const memberName = cells[0]!.toLowerCase();
        const status = cells[3]!;
        // Only include active members
        if (status.includes('Active') || status.includes('✅')) {
          members.push(memberName);
        }
      }
    }
  }

  // Parse ## Project Context
  let inProjectContext = false;
  const contextLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Project Context')) {
      inProjectContext = true;
      continue;
    }
    
    if (inProjectContext && line.startsWith('##')) {
      break;
    }
    
    if (inProjectContext && line.trim()) {
      contextLines.push(line);
    }
  }
  projectContext = contextLines.join('\n');

  return { name, description, projectContext, members };
}

/**
 * Parse routing.md
 */
function parseRoutingMd(squadDir: string): { rules: ParsedRoutingRule[]; defaultAgent: string } {
  const routingPath = path.join(squadDir, 'routing.md');
  if (!storage.existsSync(routingPath)) {
    return { rules: [], defaultAgent: '@coordinator' };
  }

  const content = storage.readSync(routingPath) ?? '';
  const lines = content.split('\n');
  const rules: ParsedRoutingRule[] = [];

  let inWorkTypeTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Work Type')) {
      inWorkTypeTable = true;
      continue;
    }
    
    if (inWorkTypeTable && line.startsWith('##')) {
      break;
    }
    
    if (inWorkTypeTable && line.startsWith('|') && !line.includes('---') && !line.includes('Work Type')) {
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const workType = cells[0]!;
        const agentCell = cells[1]!;
        const examples = cells[2]!;
        
        // Extract agent name (remove emoji)
        const agentMatch = agentCell.match(/^(\w+)/);
        if (agentMatch) {
          const agentName = agentMatch[1]!.toLowerCase();
          const pattern = workType.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
          
          rules.push({
            pattern,
            agents: [`@${agentName}`],
            description: examples,
          });
        }
      }
    }
  }

  return { rules, defaultAgent: '@coordinator' };
}

/**
 * Parse agent charter metadata
 */
function parseAgentCharter(squadDir: string, agentName: string): ParsedAgent {
  const charterPath = path.join(squadDir, 'agents', agentName, 'charter.md');
  const role = agentName.charAt(0).toUpperCase() + agentName.slice(1);
  
  if (!storage.existsSync(charterPath)) {
    return {
      name: agentName,
      role,
      charter: `.squad/agents/${agentName}/charter.md`,
      status: 'active',
    };
  }

  const content = storage.readSync(charterPath) ?? '';
  const lines = content.split('\n');
  
  let parsedRole = role;
  
  // Parse first h1 for role (e.g., "# Edie — TypeScript Engineer")
  for (const line of lines) {
    if (line.startsWith('# ')) {
      const match = line.match(/# \w+ — (.+)/);
      if (match) {
        parsedRole = match[1]!;
        break;
      }
    }
  }

  return {
    name: agentName,
    role: parsedRole,
    charter: `.squad/agents/${agentName}/charter.md`,
    status: 'active',
  };
}

/**
 * Parse casting/policy.json
 */
function parseCastingPolicy(squadDir: string): ParsedCasting | undefined {
  const policyPath = path.join(squadDir, 'casting', 'policy.json');
  if (!storage.existsSync(policyPath)) {
    return undefined;
  }

  try {
    const content = storage.readSync(policyPath) ?? '';
    const policy = JSON.parse(content) as {
      allowlist_universes?: string[];
      universe_capacity?: Record<string, number>;
    };

    return {
      allowlistUniverses: policy.allowlist_universes ?? [],
      overflowStrategy: 'generic',
      capacity: policy.universe_capacity,
    };
  } catch {
    warn('Failed to parse casting/policy.json — skipping casting config');
    return undefined;
  }
}

/**
 * Generate squad.config.ts content
 */
function generateSquadConfig(
  team: ParsedTeam,
  agents: ParsedAgent[],
  routing: { rules: ParsedRoutingRule[]; defaultAgent: string },
  casting?: ParsedCasting,
): string {
  const lines: string[] = [];
  
  lines.push("import {");
  lines.push("  defineSquad,");
  lines.push("  defineTeam,");
  lines.push("  defineAgent,");
  lines.push("  defineRouting,");
  if (casting) {
    lines.push("  defineCasting,");
  }
  lines.push("} from '@bradygaster/squad-sdk';");
  lines.push("");
  lines.push("/**");
  lines.push(" * Squad Configuration");
  lines.push(" *");
  lines.push(" * Migrated from .squad/ markdown to SDK-first builder syntax.");
  lines.push(" * Run `squad build` to regenerate .squad/*.md from this file.");
  lines.push(" */");
  lines.push("export default defineSquad({");
  lines.push("  version: '1.0.0',");
  lines.push("");
  
  // Team section
  lines.push("  team: defineTeam({");
  lines.push(`    name: '${escapeString(team.name)}',`);
  if (team.description) {
    lines.push(`    description: '${escapeString(team.description)}',`);
  }
  if (team.projectContext) {
    const contextLines = team.projectContext.split('\n');
    if (contextLines.length === 1) {
      lines.push(`    projectContext: '${escapeString(team.projectContext)}',`);
    } else {
      lines.push("    projectContext:");
      contextLines.forEach((line, idx) => {
        const isLast = idx === contextLines.length - 1;
        lines.push(`      '${escapeString(line)}'${isLast ? ',' : ' +'}`);
      });
    }
  }
  lines.push(`    members: [${team.members.map(m => `'${m}'`).join(', ')}],`);
  lines.push("  }),");
  lines.push("");
  
  // Agents section
  lines.push("  agents: [");
  agents.forEach((agent, idx) => {
    const isLast = idx === agents.length - 1;
    lines.push(`    defineAgent({ name: '${agent.name}', role: '${escapeString(agent.role)}', charter: '${agent.charter}', status: '${agent.status}' })${isLast ? '' : ','}`);
  });
  lines.push("  ],");
  lines.push("");
  
  // Routing section
  if (routing.rules.length > 0) {
    lines.push("  routing: defineRouting({");
    lines.push("    rules: [");
    routing.rules.forEach((rule, idx) => {
      const isLast = idx === routing.rules.length - 1;
      const agentsStr = `[${rule.agents.map(a => `'${a}'`).join(', ')}]`;
      const desc = rule.description ? `, description: '${escapeString(rule.description)}'` : '';
      lines.push(`      { pattern: '${rule.pattern}', agents: ${agentsStr}${desc} }${isLast ? '' : ','}`);
    });
    lines.push("    ],");
    lines.push(`    defaultAgent: '${routing.defaultAgent}',`);
    lines.push("    fallback: 'coordinator',");
    lines.push("  }),");
    lines.push("");
  }
  
  // Casting section
  if (casting) {
    lines.push("  casting: defineCasting({");
    lines.push(`    allowlistUniverses: [${casting.allowlistUniverses.map(u => `'${escapeString(u)}'`).join(', ')}],`);
    lines.push(`    overflowStrategy: '${casting.overflowStrategy}',`);
    if (casting.capacity) {
      lines.push("    capacity: {");
      Object.entries(casting.capacity).forEach(([universe, count], idx, arr) => {
        const isLast = idx === arr.length - 1;
        lines.push(`      '${escapeString(universe)}': ${count}${isLast ? '' : ','}`);
      });
      lines.push("    },");
    }
    lines.push("  }),");
  }
  
  lines.push("});");
  lines.push("");
  
  return lines.join('\n');
}

/**
 * Escape single quotes in string literals
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/**
 * Main migrate command handler
 */
export async function runMigrate(cwd: string, options: MigrateOptions): Promise<void> {
  const mode = detectMode(cwd);
  
  // Handle --from ai-team (subsume upgrade --migrate-directory)
  if (options.from === 'ai-team') {
    if (mode !== 'legacy') {
      fatal('--from ai-team requires a .ai-team/ directory');
    }
    
    console.log(`\n${BOLD}Squad Migrate${RESET} — .ai-team/ → .squad/\n`);
    await migrateDirectory(cwd);
    
    console.log(`\n${dim('Next:')} Run ${BOLD}squad migrate --to sdk${RESET} to convert to SDK-First mode.`);
    return;
  }
  
  // Helper: recursively copy a directory using StorageProvider
  function copyDirRecursive(src: string, dest: string): void {
    storage.mkdirSync(dest, { recursive: true });
    const entries = storage.listSync?.(src) ?? [];
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      if (storage.isDirectorySync(srcPath)) {
        copyDirRecursive(srcPath, destPath);
      } else {
        const content = storage.readSync(srcPath);
        if (content != null) {
          storage.writeSync(destPath, content);
        }
      }
    }
  }

  // Handle --to shared (local .squad/ → shared mode)
  if (options.to === 'shared') {
    if (mode === 'none') {
      fatal('No squad found. Run `squad init` first.');
    }
    if (mode === 'legacy') {
      fatal('Found .ai-team/ directory. Run `squad migrate --from ai-team` first.');
    }

    const squadDir = path.join(cwd, '.squad');
    if (!storage.existsSync(squadDir)) {
      fatal('No .squad/ directory found.');
    }

    // Determine repo key
    let key = options.key;
    let urlPatterns: string[] = [];

    const remoteUrl = getRemoteUrl(cwd);
    if (!key) {
      if (!remoteUrl) {
        fatal(
          'Cannot auto-detect repo key: no git remote "origin" found.\n' +
          '       Use --key <owner/repo> to specify the key explicitly.',
        );
      }
      const normalized = normalizeRemoteUrl(remoteUrl);
      if (normalized.provider === 'unknown') {
        fatal(
          `Could not derive a supported repo key from origin URL.\n` +
          `       Remote: ${remoteUrl}\n` +
          `       Use --key <owner/repo> to specify the key explicitly.`,
        );
      }
      key = normalized.key;
      urlPatterns = [normalized.normalizedUrl];
    } else {
      if (remoteUrl) {
        const normalized = normalizeRemoteUrl(remoteUrl);
        urlPatterns = [normalized.normalizedUrl];
      }
    }

    try {
      validateRepoKey(key);
    } catch (err) {
      fatal((err as Error).message);
    }

    console.log(`\n${BOLD}Squad Migrate${RESET} — local .squad/ → shared\n`);
    console.log(`📦 Migrating local squad to shared...`);
    console.log(`   Source: ${squadDir}`);

    // Create shared squad
    let teamDir: string;
    try {
      teamDir = createSharedSquad(key, urlPatterns);
    } catch (err) {
      fatal((err as Error).message);
    }

    console.log(`   Target: ${teamDir}`);
    console.log('');

    // Copy team-state directories and files
    const teamDirs = ['agents', 'casting', 'skills', 'decisions', 'decisions/inbox'];
    for (const dir of teamDirs) {
      const srcDir = path.join(squadDir, dir);
      const destDir = path.join(teamDir, dir);
      if (storage.existsSync(srcDir)) {
        copyDirRecursive(srcDir, destDir);
        success(`Copying: ${dir}/`);
      }
    }

    const teamFiles = ['team.md', 'routing.md', 'decisions.md'];
    for (const file of teamFiles) {
      const srcFile = path.join(squadDir, file);
      const destFile = path.join(teamDir, file);
      if (storage.existsSync(srcFile)) {
        const content = storage.readSync(srcFile) ?? '';
        storage.writeSync(destFile, content);
        success(`Copying: ${file}`);
      }
    }

    // Copy .github/agents/ to .github-template/agents/ in the shared squad
    // so future `squad init --shared` connections can source the agent file
    const githubAgentsDir = path.join(cwd, '.github', 'agents');
    if (storage.existsSync(githubAgentsDir)) {
      const templateAgentsDir = path.join(teamDir, '.github-template', 'agents');
      copyDirRecursive(githubAgentsDir, templateAgentsDir);
      success(`Copying: .github/agents/ → .github-template/agents/`);
    }

    if (urlPatterns.length > 0) {
      console.log(`   Registered URL pattern: ${urlPatterns[0]}`);
    }

    console.log('');
    console.log(`✅ Migrated to shared squad "${key}"`);

    // Cleanup local files after successful migration
    if (!options.keepLocal) {
      console.log('');
      console.log(`🧹 Cleaning up local squad files...`);

      // Clean up .squad/ directory
      if (storage.existsSync(squadDir)) {
        // Check if .squad/ contains any git-tracked files
        let hasTrackedFiles = false;
        try {
          const tracked = execSync('git ls-files .squad/', { cwd, encoding: 'utf-8' }).trim();
          hasTrackedFiles = tracked.length > 0;
        } catch {
          // git ls-files failed — treat as untracked to be safe
        }

        if (hasTrackedFiles) {
          warn(`  .squad/ contains git-tracked files — left in place`);
          console.log(`         ${DIM}Run \`git rm -r .squad/\` to remove tracked files${RESET}`);
        } else {
          try {
            fs.rmSync(squadDir, { recursive: true, force: true });
            success('  Removed .squad/');
          } catch (err) {
            warn(`  Could not remove .squad/: ${(err as Error).message}`);
          }
        }
      }

      // Clean up .github/agents/squad.agent.md (only if untracked)
      const agentFile = path.join(cwd, '.github', 'agents', 'squad.agent.md');
      if (storage.existsSync(agentFile)) {
        let isTracked = false;
        try {
          const tracked = execSync('git ls-files .github/agents/squad.agent.md', { cwd, encoding: 'utf-8' }).trim();
          isTracked = tracked.length > 0;
        } catch { /* ignore */ }

        if (isTracked) {
          warn(`  .github/agents/squad.agent.md is git-tracked — left in place`);
        } else {
          try {
            fs.unlinkSync(agentFile);
            success('  Removed .github/agents/squad.agent.md');
            // Clean up empty .github/agents/ dir
            const agentsDir = path.join(cwd, '.github', 'agents');
            try {
              const remaining = fs.readdirSync(agentsDir);
              if (remaining.length === 0) fs.rmdirSync(agentsDir);
            } catch { /* ignore */ }
          } catch (err) {
            warn(`  Could not remove agent file: ${(err as Error).message}`);
          }
        }
      }

      // Clean up .gitattributes if it was squad-generated and untracked
      const gitattributes = path.join(cwd, '.gitattributes');
      if (storage.existsSync(gitattributes)) {
        let isTracked = false;
        try {
          const tracked = execSync('git ls-files .gitattributes', { cwd, encoding: 'utf-8' }).trim();
          isTracked = tracked.length > 0;
        } catch { /* ignore */ }

        if (!isTracked) {
          // Only remove if it looks squad-generated (contains merge=union for .squad/)
          const content = storage.readSync(gitattributes) ?? '';
          if (content.includes('.squad/') && content.includes('merge=union')) {
            try {
              fs.unlinkSync(gitattributes);
              success('  Removed .gitattributes (squad-generated)');
            } catch { /* ignore */ }
          }
        }
      }

      // Clean up .copilot/ if untracked
      const copilotDir = path.join(cwd, '.copilot');
      if (storage.existsSync(copilotDir)) {
        let isTracked = false;
        try {
          const tracked = execSync('git ls-files .copilot/', { cwd, encoding: 'utf-8' }).trim();
          isTracked = tracked.length > 0;
        } catch { /* ignore */ }

        if (!isTracked) {
          try {
            fs.rmSync(copilotDir, { recursive: true, force: true });
            success('  Removed .copilot/');
          } catch { /* ignore */ }
        }
      }

      console.log('');
      console.log(`   ${DIM}Use --keep-local to skip cleanup next time.${RESET}`);
    } else {
      console.log('');
      console.log(`   ${DIM}Local files left in place (--keep-local).${RESET}`);
      console.log(`   ${DIM}Run \`git clean -xdf .squad .github/agents .gitattributes .copilot\` to remove manually.${RESET}`);
    }
    return;
  }

  // Handle --to markdown (reverse migration)
  if (options.to === 'markdown') {
    if (mode !== 'sdk') {
      fatal('--to markdown requires a squad.config.ts or squad.config.js file');
    }
    
    console.log(`\n${BOLD}Squad Migrate${RESET} — SDK-First → markdown-only\n`);
    
    // Run squad build to ensure .squad/ is up to date
    dim('Regenerating .squad/ markdown from config...');
    const { runBuild } = await import('./build.js');
    await runBuild(cwd, { check: false, dryRun: false, watch: false });
    
    const configPath = storage.existsSync(path.join(cwd, 'squad.config.ts'))
      ? path.join(cwd, 'squad.config.ts')
      : path.join(cwd, 'squad.config.js');
    
    if (!options.dryRun) {
      // Backup the config file
      const backupPath = configPath + '.bak';
      storage.renameSync(configPath, backupPath);
      success(`Moved ${path.basename(configPath)} → ${path.basename(backupPath)}`);
      
      console.log();
      console.log(`${BOLD}✅ Converted to markdown-only.${RESET}`);
      console.log();
      console.log('Your .squad/ directory is now the source of truth.');
      console.log(`The config backup is at ${dim(path.basename(backupPath))}`);
      console.log();
    } else {
      console.log();
      console.log(`${DIM}[DRY RUN]${RESET} Would move ${path.basename(configPath)} → ${path.basename(configPath)}.bak`);
      console.log(`${DIM}[DRY RUN]${RESET} Your .squad/ directory would become the source of truth.`);
      console.log();
    }
    
    return;
  }
  
  // Handle --to sdk (markdown → SDK-First)
  if (options.to === 'sdk') {
    if (mode === 'none') {
      fatal('No squad found. Run `squad init` first.');
    }
    if (mode === 'legacy') {
      fatal('Found .ai-team/ directory. Run `squad migrate --from ai-team` first.');
    }
    if (mode === 'sdk') {
      fatal('Already in SDK-First mode (squad.config.ts exists)');
    }
    
    console.log(`\n${BOLD}Squad Migrate${RESET} — markdown → SDK-First\n`);
    
    const squadDir = path.join(cwd, '.squad');
    
    // Parse markdown files
    dim('Parsing .squad/ markdown files...');
    const team = parseTeamMd(squadDir);
    const routing = parseRoutingMd(squadDir);
    const casting = parseCastingPolicy(squadDir);
    
    const agents: ParsedAgent[] = [];
    for (const memberName of team.members) {
      agents.push(parseAgentCharter(squadDir, memberName));
    }
    
    success(`Parsed ${team.members.length} agents, ${routing.rules.length} routing rules`);
    
    // Generate squad.config.ts
    dim('Generating squad.config.ts...');
    const configContent = generateSquadConfig(team, agents, routing, casting);
    
    if (options.dryRun) {
      console.log();
      console.log(`${BOLD}[DRY RUN]${RESET} Generated squad.config.ts:\n`);
      console.log(dim('─'.repeat(80)));
      console.log(configContent);
      console.log(dim('─'.repeat(80)));
      console.log();
      return;
    }
    
    const configPath = path.join(cwd, 'squad.config.ts');
    storage.writeSync(configPath, configContent);
    success('Created squad.config.ts');
    
    console.log();
    console.log(`${BOLD}✅ Converted to SDK-First mode.${RESET}`);
    console.log();
    console.log(`Next steps:`);
    console.log(`  1. Review ${dim('squad.config.ts')}`);
    console.log(`  2. Run ${BOLD}squad build${RESET} to verify it regenerates .squad/ correctly`);
    console.log(`  3. Commit both the config and updated .squad/ files`);
    console.log();
    
    return;
  }
  
  // No --to flag → interactive mode (detect and suggest)
  console.log(`\n${BOLD}Squad Migrate${RESET} — convert between formats\n`);
  
  if (mode === 'none') {
    console.log('No squad found. Run `squad init` to create one.');
  } else if (mode === 'legacy') {
    console.log(`Current mode: ${BOLD}.ai-team/${RESET} (legacy)`);
    console.log();
    console.log('Suggested: Run `squad migrate --from ai-team` to upgrade to .squad/');
  } else if (mode === 'markdown') {
    console.log(`Current mode: ${BOLD}markdown-only${RESET}`);
    console.log();
    console.log('Your .squad/ directory is the source of truth.');
    console.log();
    console.log('To convert to SDK-First mode, run:');
    console.log(`  ${BOLD}squad migrate --to sdk${RESET}`);
  } else if (mode === 'sdk') {
    console.log(`Current mode: ${BOLD}SDK-First${RESET}`);
    console.log();
    console.log('Your squad.config.ts is the source of truth.');
    console.log();
    console.log('To convert back to markdown-only, run:');
    console.log(`  ${BOLD}squad migrate --to markdown${RESET}`);
  }
  
  console.log();
}
