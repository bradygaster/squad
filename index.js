#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function fatal(msg) {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  fatal(`Unexpected error: ${err.message}`);
});

const root = __dirname;
const dest = process.cwd();
const pkg = require(path.join(root, 'package.json'));
const cmd = process.argv[2];

// --version / --help
if (cmd === '--version' || cmd === '-v') {
  console.log(pkg.version);
  process.exit(0);
}

if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(`\n${BOLD}squad${RESET} v${pkg.version} — Add an AI agent team to any project\n`);
  console.log(`Usage: npx github:bradygaster/squad [command]\n`);
  console.log(`Commands:`);
  console.log(`  ${BOLD}(default)${RESET}  Initialize Squad (skip files that already exist)`);
  console.log(`  ${BOLD}upgrade${RESET}    Update Squad-owned files to latest version`);
  console.log(`             Overwrites: squad.agent.md, .ai-team-templates/`);
  console.log(`             Never touches: .ai-team/ (your team state)`);
  console.log(`  ${BOLD}copilot${RESET}    Add/remove the Copilot coding agent (@copilot)`);
  console.log(`             Usage: copilot [--off] [--auto-assign]`);
  console.log(`  ${BOLD}export${RESET}     Export squad to a portable JSON snapshot`);
  console.log(`             Default: squad-export.json (use --out <path> to override)`);
  console.log(`  ${BOLD}import${RESET}     Import squad from an export file`);
  console.log(`             Usage: import <file> [--force]`);
  console.log(`  ${BOLD}help${RESET}       Show this help message`);
  console.log(`\nFlags:`);
  console.log(`  ${BOLD}--version, -v${RESET}  Print version`);
  console.log(`  ${BOLD}--help, -h${RESET}     Show help\n`);
  process.exit(0);
}

function copyRecursive(src, target) {
  try {
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(target, entry));
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(src, target);
    }
  } catch (err) {
    fatal(`Failed to copy ${path.relative(root, src)}: ${err.message}`);
  }
}

// --- Copilot subcommand ---
if (cmd === 'copilot') {
  const teamMd = path.join(dest, '.ai-team', 'team.md');
  if (!fs.existsSync(teamMd)) {
    fatal('No squad found — run init first, then add the copilot agent.');
  }

  const isOff = process.argv.includes('--off');
  const autoAssign = process.argv.includes('--auto-assign');
  let content = fs.readFileSync(teamMd, 'utf8');
  const hasCopilot = content.includes('🤖 Coding Agent');

  if (isOff) {
    if (!hasCopilot) {
      console.log(`${DIM}Copilot coding agent is not on the team — nothing to remove${RESET}`);
      process.exit(0);
    }
    // Remove the Coding Agent section
    content = content.replace(/\n## Coding Agent\n[\s\S]*?(?=\n## |\n*$)/, '');
    fs.writeFileSync(teamMd, content);
    console.log(`${GREEN}✓${RESET} Removed @copilot from the team roster`);

    // Remove copilot-instructions.md
    const instructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
    if (fs.existsSync(instructionsDest)) {
      fs.unlinkSync(instructionsDest);
      console.log(`${GREEN}✓${RESET} Removed .github/copilot-instructions.md`);
    }
    process.exit(0);
  }

  // Adding copilot
  if (hasCopilot) {
    // Update auto-assign if requested
    if (autoAssign) {
      content = content.replace('<!-- copilot-auto-assign: false -->', '<!-- copilot-auto-assign: true -->');
      fs.writeFileSync(teamMd, content);
      console.log(`${GREEN}✓${RESET} Enabled @copilot auto-assign`);
    } else {
      console.log(`${DIM}@copilot is already on the team${RESET}`);
    }
    process.exit(0);
  }

  // Add Coding Agent section before Project Context
  const autoAssignValue = autoAssign ? 'true' : 'false';
  const copilotSection = `
## Coding Agent

<!-- copilot-auto-assign: ${autoAssignValue} -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

`;

  // Insert before "## Project Context" if it exists, otherwise append
  if (content.includes('## Project Context')) {
    content = content.replace('## Project Context', copilotSection + '## Project Context');
  } else {
    content = content.trimEnd() + '\n' + copilotSection;
  }

  fs.writeFileSync(teamMd, content);
  console.log(`${GREEN}✓${RESET} Added @copilot (Coding Agent) to team roster`);
  if (autoAssign) {
    console.log(`${GREEN}✓${RESET} Auto-assign enabled — squad-labeled issues will be assigned to @copilot`);
  }

  // Copy copilot-instructions.md
  const instructionsSrc = path.join(root, 'templates', 'copilot-instructions.md');
  const instructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
  if (fs.existsSync(instructionsSrc)) {
    fs.mkdirSync(path.dirname(instructionsDest), { recursive: true });
    fs.copyFileSync(instructionsSrc, instructionsDest);
    console.log(`${GREEN}✓${RESET} .github/copilot-instructions.md`);
  }

  console.log();
  console.log(`${BOLD}@copilot is on the team.${RESET}`);
  console.log(`The coding agent will pick up issues matching its capability profile.`);
  if (!autoAssign) {
    console.log(`Run with ${BOLD}--auto-assign${RESET} to auto-assign @copilot on squad-labeled issues.`);
  }
  console.log();
  console.log(`${BOLD}Required:${RESET} Add a classic PAT (repo scope) as a repo secret for auto-assignment:`);
  console.log(`  1. Create token:  ${DIM}https://github.com/settings/tokens/new${RESET}`);
  console.log(`  2. Set secret:    ${DIM}gh secret set COPILOT_ASSIGN_TOKEN${RESET}`);
  console.log();
  process.exit(0);
}

// --- Export subcommand ---
if (cmd === 'export') {
  const teamMd = path.join(dest, '.ai-team', 'team.md');
  if (!fs.existsSync(teamMd)) {
    fatal('No squad found — run init first');
  }

  const manifest = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    squad_version: pkg.version,
    casting: {},
    agents: {},
    skills: []
  };

  // Read casting state
  const castingDir = path.join(dest, '.ai-team', 'casting');
  for (const file of ['registry.json', 'policy.json', 'history.json']) {
    const filePath = path.join(castingDir, file);
    try {
      if (fs.existsSync(filePath)) {
        manifest.casting[file.replace('.json', '')] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`${RED}✗${RESET} Warning: could not read casting/${file}: ${err.message}`);
    }
  }

  // Read agents
  const agentsDir = path.join(dest, '.ai-team', 'agents');
  try {
    if (fs.existsSync(agentsDir)) {
      for (const entry of fs.readdirSync(agentsDir)) {
        const agentDir = path.join(agentsDir, entry);
        if (!fs.statSync(agentDir).isDirectory()) continue;
        const agent = {};
        const charterPath = path.join(agentDir, 'charter.md');
        const historyPath = path.join(agentDir, 'history.md');
        if (fs.existsSync(charterPath)) agent.charter = fs.readFileSync(charterPath, 'utf8');
        if (fs.existsSync(historyPath)) agent.history = fs.readFileSync(historyPath, 'utf8');
        manifest.agents[entry] = agent;
      }
    }
  } catch (err) {
    console.error(`${RED}✗${RESET} Warning: could not read agents: ${err.message}`);
  }

  // Read skills
  const skillsDir = path.join(dest, '.ai-team', 'skills');
  try {
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir)) {
        const skillFile = path.join(skillsDir, entry, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          manifest.skills.push(fs.readFileSync(skillFile, 'utf8'));
        }
      }
    }
  } catch (err) {
    console.error(`${RED}✗${RESET} Warning: could not read skills: ${err.message}`);
  }

  // Determine output path
  const outIdx = process.argv.indexOf('--out');
  const outPath = (outIdx !== -1 && process.argv[outIdx + 1])
    ? path.resolve(process.argv[outIdx + 1])
    : path.join(dest, 'squad-export.json');

  try {
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch (err) {
    fatal(`Failed to write export file: ${err.message}`);
  }

  const displayPath = path.relative(dest, outPath) || path.basename(outPath);
  console.log(`${GREEN}✓${RESET} Exported squad to ${displayPath}`);
  console.log(`${DIM}⚠ Review agent histories before sharing — they may contain project-specific information${RESET}`);
  process.exit(0);
}

// --- Import subcommand ---
if (cmd === 'import') {
  const importFile = process.argv[3];
  if (!importFile) {
    fatal('Usage: squad import <file> [--force]');
  }

  const importPath = path.resolve(importFile);
  if (!fs.existsSync(importPath)) {
    fatal(`Import file not found: ${importFile}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(importPath, 'utf8'));
  } catch (err) {
    fatal(`Invalid JSON in import file: ${err.message}`);
  }

  if (manifest.version !== '1.0') {
    fatal(`Unsupported export version: ${manifest.version || 'missing'} (expected 1.0)`);
  }
  if (!manifest.agents || typeof manifest.agents !== 'object') {
    fatal('Invalid export file: missing or invalid "agents" field');
  }
  if (!manifest.casting || typeof manifest.casting !== 'object') {
    fatal('Invalid export file: missing or invalid "casting" field');
  }
  if (!Array.isArray(manifest.skills)) {
    fatal('Invalid export file: missing or invalid "skills" field');
  }

  const aiTeamDir = path.join(dest, '.ai-team');
  const hasForce = process.argv.includes('--force');

  // Collision detection
  if (fs.existsSync(aiTeamDir)) {
    if (!hasForce) {
      fatal('A squad already exists here. Use --force to replace (current squad will be archived).');
    }
    // Archive existing squad
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
    const archiveDir = path.join(dest, `.ai-team-archive-${ts}`);
    fs.renameSync(aiTeamDir, archiveDir);
  }

  // Create directory structure
  fs.mkdirSync(path.join(aiTeamDir, 'casting'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'decisions', 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'orchestration-log'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'log'), { recursive: true });
  fs.mkdirSync(path.join(aiTeamDir, 'skills'), { recursive: true });

  // Write empty project-specific files
  fs.writeFileSync(path.join(aiTeamDir, 'decisions.md'), '');
  fs.writeFileSync(path.join(aiTeamDir, 'team.md'), '');

  // Write casting state
  for (const [key, value] of Object.entries(manifest.casting)) {
    fs.writeFileSync(path.join(aiTeamDir, 'casting', `${key}.json`), JSON.stringify(value, null, 2) + '\n');
  }

  // Determine source project name from filename
  const sourceProject = path.basename(importPath, '.json');
  const importDate = new Date().toISOString().split('T')[0];

  // Write agents
  const agentNames = Object.keys(manifest.agents);
  for (const name of agentNames) {
    const agent = manifest.agents[name];
    const agentDir = path.join(aiTeamDir, 'agents', name);
    fs.mkdirSync(agentDir, { recursive: true });

    if (agent.charter) {
      fs.writeFileSync(path.join(agentDir, 'charter.md'), agent.charter);
    }

    // History split: separate portable knowledge from project learnings
    let historyContent = '';
    if (agent.history) {
      historyContent = splitHistory(agent.history, sourceProject);
    }
    historyContent = `📌 Imported from ${sourceProject} on ${importDate}. Portable knowledge carried over; project learnings from previous project preserved below.\n\n` + historyContent;
    fs.writeFileSync(path.join(agentDir, 'history.md'), historyContent);
  }

  // Write skills
  for (const skillContent of manifest.skills) {
    const nameMatch = skillContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    const skillName = nameMatch ? nameMatch[1].trim().toLowerCase().replace(/\s+/g, '-') : `skill-${manifest.skills.indexOf(skillContent)}`;
    const skillDir = path.join(aiTeamDir, 'skills', skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
  }

  // Determine universe for messaging
  let universe = 'unknown';
  if (manifest.casting.policy && manifest.casting.policy.universe) {
    universe = manifest.casting.policy.universe;
  }

  // Output
  console.log(`${GREEN}✓${RESET} Imported squad from ${path.basename(importPath)}`);
  console.log(`  ${agentNames.length} agents: ${agentNames.join(', ')}`);
  console.log(`  ${manifest.skills.length} skills imported`);
  console.log(`  Casting: ${universe} universe preserved`);
  console.log();
  console.log(`${DIM}⚠ Project-specific learnings are marked in agent histories — review if needed${RESET}`);
  console.log();
  console.log(`Next steps:`);
  console.log(`  1. Open Copilot and select Squad`);
  console.log(`  2. Tell the team about this project — they'll adapt`);
  console.log();
  process.exit(0);
}

// Split history into portable knowledge and project learnings
function splitHistory(history, sourceProject) {
  const lines = history.split('\n');
  const portable = [];
  const projectLearnings = [];

  // Sections that are project-specific by nature
  const projectSectionPatterns = [
    /^##\s*key file paths/i,
    /^##\s*sprint/i,
    /^##\s*pr\s*#/i,
    /^##\s*file system/i,
    /^##\s*session/i,
    /^###\s*key file paths/i,
    /^###\s*sprint/i,
    /^###\s*pr\s*#/i,
    /^###\s*file system/i,
    /^###\s*session/i,
  ];

  // Sections that are portable by nature
  const portableSectionPatterns = [
    /^##\s*learnings/i,
    /^##\s*portable knowledge/i,
    /^###\s*runtime architecture/i,
    /^###\s*windows compatibility/i,
    /^###\s*critical paths/i,
    /^###\s*forwardability/i,
    /^##\s*team updates/i,
  ];

  let currentSection = 'portable';
  let inProjectSection = false;

  for (const line of lines) {
    // Check if this line starts a new section
    if (/^#{1,3}\s/.test(line)) {
      const isProjectSection = projectSectionPatterns.some(p => p.test(line));
      const isPortableSection = portableSectionPatterns.some(p => p.test(line));

      if (isProjectSection) {
        inProjectSection = true;
      } else if (isPortableSection) {
        inProjectSection = false;
      }
      // Lines starting with 📌 are team updates — portable
    }

    if (inProjectSection) {
      projectLearnings.push(line);
    } else {
      portable.push(line);
    }
  }

  let result = '';
  if (portable.length > 0) {
    result += portable.join('\n');
  }
  if (projectLearnings.length > 0) {
    result += `\n\n## Project Learnings (from import — ${sourceProject})\n\n`;
    result += projectLearnings.join('\n');
  }
  return result;
}

// Validate source files exist
const agentSrcCheck = path.join(root, '.github', 'agents', 'squad.agent.md');
const templatesSrcCheck = path.join(root, 'templates');
if (!fs.existsSync(agentSrcCheck)) {
  fatal(`Source file missing: .github/agents/squad.agent.md — installation may be corrupted`);
}
if (!fs.existsSync(templatesSrcCheck) || !fs.statSync(templatesSrcCheck).isDirectory()) {
  fatal(`Source directory missing or corrupted: templates/ — installation may be corrupted`);
}

// Validate destination is writable
try {
  fs.accessSync(dest, fs.constants.W_OK);
} catch {
  fatal(`Cannot write to ${dest} — check directory permissions`);
}

const isUpgrade = cmd === 'upgrade';

// Stamp version into squad.agent.md after copying
function stampVersion(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Replace version field
  content = content.replace(/^version:\s*"[^"]*"/m, `version: "${pkg.version}"`);
  // Replace version in name field to show in agent picker UI
  // Handles both "Squad" and "Squad (vX.Y.Z)" formats
  content = content.replace(/^name:\s*Squad(?:\s*\([^)]*\))?$/m, `name: Squad (v${pkg.version})`);
  fs.writeFileSync(filePath, content);
}

// Read version from squad.agent.md frontmatter
function readInstalledVersion(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^version:\s*"([^"]+)"/m);
    return match ? match[1] : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Compare semver strings: -1 (a<b), 0 (a==b), 1 (a>b)
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

// Migration registry — additive-only operations keyed by version
const migrations = [
  {
    version: '0.2.0',
    description: 'Create .ai-team/skills/ directory',
    run(dest) {
      const skillsDir = path.join(dest, '.ai-team', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
    }
  },
  {
    version: '0.4.0',
    description: 'Create sample .copilot/mcp-config.json',
    run(dest) {
      const mcpDest = path.join(dest, '.copilot', 'mcp-config.json');
      if (!fs.existsSync(mcpDest)) {
        fs.mkdirSync(path.join(dest, '.copilot'), { recursive: true });
        const sample = { mcpServers: { "EXAMPLE-trello": { command: "npx", args: ["-y", "@trello/mcp-server"], env: { TRELLO_API_KEY: "${TRELLO_API_KEY}", TRELLO_TOKEN: "${TRELLO_TOKEN}" } } } };
        fs.writeFileSync(mcpDest, JSON.stringify(sample, null, 2) + '\n');
      }
    }
  }
];

// Run migrations applicable for upgrading from oldVersion to newVersion
function runMigrations(dest, oldVersion) {
  const applicable = migrations
    .filter(m => compareSemver(m.version, oldVersion) > 0)
    .sort((a, b) => compareSemver(a.version, b.version));
  for (const m of applicable) {
    try {
      m.run(dest);
    } catch (err) {
      console.error(`${RED}✗${RESET} Migration failed (${m.version}: ${m.description}): ${err.message}`);
    }
  }
  return applicable.length;
}

// Copy agent file (Squad-owned — overwrite on upgrade)
const agentSrc = path.join(root, '.github', 'agents', 'squad.agent.md');
const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');

// Capture old version BEFORE any writes (used for delta reporting + migration filtering)
const oldVersion = isUpgrade ? readInstalledVersion(agentDest) : null;

if (isUpgrade) {
  const isAlreadyCurrent = oldVersion && oldVersion !== '0.0.0' && compareSemver(oldVersion, pkg.version) === 0;

  if (isAlreadyCurrent) {
    // Still run missing migrations in case a prior upgrade was interrupted
    runMigrations(dest, oldVersion);

    // Even if already current, update copilot-instructions.md if @copilot is enabled
    const copilotInstructionsSrc = path.join(root, 'templates', 'copilot-instructions.md');
    const copilotInstructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
    const teamMd = path.join(dest, '.ai-team', 'team.md');
    const copilotEnabled = fs.existsSync(teamMd)
      && fs.readFileSync(teamMd, 'utf8').includes('🤖 Coding Agent');
    if (copilotEnabled && fs.existsSync(copilotInstructionsSrc)) {
      fs.mkdirSync(path.dirname(copilotInstructionsDest), { recursive: true });
      fs.copyFileSync(copilotInstructionsSrc, copilotInstructionsDest);
      console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} .github/copilot-instructions.md`);
    }

    // Refresh squad-owned files even when version matches
    const workflowsSrc = path.join(root, 'templates', 'workflows');
    const workflowsDest = path.join(dest, '.github', 'workflows');
    if (fs.existsSync(workflowsSrc) && fs.statSync(workflowsSrc).isDirectory()) {
      const wfFiles = fs.readdirSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      fs.mkdirSync(workflowsDest, { recursive: true });
      for (const file of wfFiles) {
        fs.copyFileSync(path.join(workflowsSrc, file), path.join(workflowsDest, file));
      }
      console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} squad workflows (${wfFiles.length} files)`);
    }

    // Refresh squad.agent.md
    try {
      fs.mkdirSync(path.dirname(agentDest), { recursive: true });
      fs.copyFileSync(agentSrc, agentDest);
      stampVersion(agentDest);
    } catch (err) {
      // Non-fatal in early-exit path
    }

    console.log(`${GREEN}✓${RESET} Already up to date (v${pkg.version})`);
    process.exit(0);
  }

  try {
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.copyFileSync(agentSrc, agentDest);
    stampVersion(agentDest);
  } catch (err) {
    fatal(`Failed to upgrade squad.agent.md: ${err.message}`);
  }

  const fromLabel = oldVersion === '0.0.0' || !oldVersion ? 'unknown' : oldVersion;
  console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} coordinator from ${fromLabel} to ${pkg.version}`);
} else if (fs.existsSync(agentDest)) {
  console.log(`${DIM}squad.agent.md already exists — skipping (run 'upgrade' to update)${RESET}`);
} else {
  try {
    fs.mkdirSync(path.dirname(agentDest), { recursive: true });
    fs.copyFileSync(agentSrc, agentDest);
    stampVersion(agentDest);
  } catch (err) {
    fatal(`Failed to create squad.agent.md: ${err.message}`);
  }
  console.log(`${GREEN}✓${RESET} .github/agents/squad.agent.md (v${pkg.version})`);
}

// Pre-create drop-box, orchestration-log, casting, and skills directories (additive-only)
const inboxDir = path.join(dest, '.ai-team', 'decisions', 'inbox');
const orchLogDir = path.join(dest, '.ai-team', 'orchestration-log');
const castingDir = path.join(dest, '.ai-team', 'casting');
const skillsDir = path.join(dest, '.ai-team', 'skills');
try {
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(orchLogDir, { recursive: true });
  fs.mkdirSync(castingDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
} catch (err) {
  fatal(`Failed to create .ai-team/ directories: ${err.message}`);
}

// Copy starter skills (skip if any skills already exist)
if (!isUpgrade) {
  const skillsSrc = path.join(root, 'templates', 'skills');
  if (fs.existsSync(skillsSrc) && fs.readdirSync(skillsDir).length === 0) {
    copyRecursive(skillsSrc, skillsDir);
    console.log(`${GREEN}✓${RESET} .ai-team/skills/ (starter skills)`);
  }
}

// Create sample MCP config (skip if .copilot/mcp-config.json already exists)
if (!isUpgrade) {
  const mcpDir = path.join(dest, '.copilot');
  const mcpConfigPath = path.join(mcpDir, 'mcp-config.json');
  if (!fs.existsSync(mcpConfigPath)) {
    try {
      fs.mkdirSync(mcpDir, { recursive: true });
      fs.writeFileSync(mcpConfigPath, JSON.stringify({
        mcpServers: {
          "EXAMPLE-trello": {
            command: "npx",
            args: ["-y", "@trello/mcp-server"],
            env: {
              TRELLO_API_KEY: "${TRELLO_API_KEY}",
              TRELLO_TOKEN: "${TRELLO_TOKEN}"
            }
          }
        }
      }, null, 2) + '\n');
      console.log(`${GREEN}✓${RESET} .copilot/mcp-config.json (MCP sample — rename EXAMPLE-trello to enable)`);
    } catch (err) {
      // Non-fatal — MCP config is optional
    }
  } else {
    console.log(`${DIM}mcp-config.json already exists — skipping${RESET}`);
  }
}

// Copy default ceremonies config
const ceremoniesDest = path.join(dest, '.ai-team', 'ceremonies.md');
if (!fs.existsSync(ceremoniesDest)) {
  const ceremoniesSrc = path.join(root, 'templates', 'ceremonies.md');
  fs.copyFileSync(ceremoniesSrc, ceremoniesDest);
  console.log(`${GREEN}✓${RESET} .ai-team/ceremonies.md`);
} else {
  console.log(`${DIM}ceremonies.md already exists — skipping${RESET}`);
}

// copilot-instructions.md — managed by `squad copilot` subcommand
// On upgrade, update if @copilot is enabled on the team
const copilotInstructionsSrc = path.join(root, 'templates', 'copilot-instructions.md');
const copilotInstructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
if (isUpgrade) {
  const teamMd = path.join(dest, '.ai-team', 'team.md');
  const copilotEnabled = fs.existsSync(teamMd)
    && fs.readFileSync(teamMd, 'utf8').includes('🤖 Coding Agent');
  if (copilotEnabled && fs.existsSync(copilotInstructionsSrc)) {
    fs.mkdirSync(path.dirname(copilotInstructionsDest), { recursive: true });
    fs.copyFileSync(copilotInstructionsSrc, copilotInstructionsDest);
    console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} .github/copilot-instructions.md`);
  }
}

// Append merge=union rules for append-only .ai-team/ files
const gitattributes = path.join(dest, '.gitattributes');
const unionRules = [
  '.ai-team/decisions.md merge=union',
  '.ai-team/agents/*/history.md merge=union',
  '.ai-team/log/** merge=union',
  '.ai-team/orchestration-log/** merge=union',
];
const existing = fs.existsSync(gitattributes) ? fs.readFileSync(gitattributes, 'utf8') : '';
const missing = unionRules.filter(rule => !existing.includes(rule));
if (missing.length) {
  const block = (existing && !existing.endsWith('\n') ? '\n' : '')
    + '# Squad: union merge for append-only team state files\n'
    + missing.join('\n') + '\n';
  fs.appendFileSync(gitattributes, block);
  console.log(`${GREEN}✓${RESET} .gitattributes (merge=union rules)`);
} else {
  console.log(`${DIM}.gitattributes merge rules already present — skipping${RESET}`);
}

// Copy templates (Squad-owned — overwrite on upgrade)
const templatesSrc = path.join(root, 'templates');
const templatesDest = path.join(dest, '.ai-team-templates');

if (isUpgrade) {
  copyRecursive(templatesSrc, templatesDest);
  console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} .ai-team-templates/`);

  // Run migrations applicable for this version jump
  runMigrations(dest, oldVersion || '0.0.0');
} else if (fs.existsSync(templatesDest)) {
  console.log(`${DIM}.ai-team-templates/ already exists — skipping (run 'upgrade' to update)${RESET}`);
} else {
  copyRecursive(templatesSrc, templatesDest);
  console.log(`${GREEN}✓${RESET} .ai-team-templates/`);
}

// Copy workflow templates (Squad-owned — overwrite on upgrade)
const workflowsSrc = path.join(root, 'templates', 'workflows');
const workflowsDest = path.join(dest, '.github', 'workflows');

if (fs.existsSync(workflowsSrc) && fs.statSync(workflowsSrc).isDirectory()) {
  const workflowFiles = fs.readdirSync(workflowsSrc).filter(f => f.endsWith('.yml'));

  if (isUpgrade) {
    fs.mkdirSync(workflowsDest, { recursive: true });
    for (const file of workflowFiles) {
      fs.copyFileSync(path.join(workflowsSrc, file), path.join(workflowsDest, file));
    }
    console.log(`${GREEN}✓${RESET} ${BOLD}upgraded${RESET} squad workflow files (${workflowFiles.length} workflows)`);
  } else {
    fs.mkdirSync(workflowsDest, { recursive: true });
    let copied = 0;
    for (const file of workflowFiles) {
      const destFile = path.join(workflowsDest, file);
      if (fs.existsSync(destFile)) {
        console.log(`${DIM}${file} already exists — skipping (run 'upgrade' to update)${RESET}`);
      } else {
        fs.copyFileSync(path.join(workflowsSrc, file), destFile);
        console.log(`${GREEN}✓${RESET} .github/workflows/${file}`);
        copied++;
      }
    }
    if (copied === 0 && workflowFiles.length > 0) {
      console.log(`${DIM}all squad workflows already exist — skipping${RESET}`);
    }
  }
}

if (isUpgrade) {
  console.log(`\n${DIM}.ai-team/ untouched — your team state is safe${RESET}`);

  // Hint about new features available after upgrade
  const teamMd = path.join(dest, '.ai-team', 'team.md');
  const copilotEnabled = fs.existsSync(teamMd)
    && fs.readFileSync(teamMd, 'utf8').includes('🤖 Coding Agent');
  if (!copilotEnabled) {
    console.log(`\n${BOLD}New:${RESET} @copilot coding agent support is now available.`);
    console.log(`  Run ${BOLD}npx squad copilot${RESET} to add it to your team.`);
  }
}

console.log();
console.log(`${BOLD}Squad is ${isUpgrade ? 'upgraded' : 'ready'}.${RESET}${isUpgrade ? ` (v${pkg.version})` : ''}`);
console.log();
if (!isUpgrade) {
  console.log(`Next steps:`);
  console.log(`  1. Open Copilot:  ${DIM}copilot${RESET}`);
  console.log(`  2. Select ${BOLD}Squad${RESET} from the /agents list`);
  console.log(`  3. Tell it what you're building`);
  console.log();
}
