#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function fatal(msg) {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
}

// Detect squad directory — .squad/ first, fall back to .ai-team/
function detectSquadDir(dest) {
  const squadDir = path.join(dest, '.squad');
  const aiTeamDir = path.join(dest, '.ai-team');
  
  if (fs.existsSync(squadDir)) {
    return { path: squadDir, name: '.squad', isLegacy: false };
  }
  if (fs.existsSync(aiTeamDir)) {
    return { path: aiTeamDir, name: '.ai-team', isLegacy: true };
  }
  // Default for new installations
  return { path: squadDir, name: '.squad', isLegacy: false };
}

function showDeprecationWarning() {
  console.log();
  console.log(`${YELLOW}⚠️  DEPRECATION: .ai-team/ is deprecated and will be removed in v1.0.0${RESET}`);
  console.log(`${YELLOW}    Run 'npx github:bradygaster/squad upgrade --migrate-directory' to migrate to .squad/${RESET}`);
  console.log(`${YELLOW}    Details: https://github.com/bradygaster/squad/issues/101${RESET}`);
  console.log();
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
  console.log(`             Never touches: .squad/ or .ai-team/ (your team state)`);
  console.log(`             Flags: --migrate-directory (rename .ai-team/ → .squad/)`);
  console.log(`  ${BOLD}copilot${RESET}    Add/remove the Copilot coding agent (@copilot)`);
  console.log(`             Usage: copilot [--off] [--auto-assign]`);
  console.log(`  ${BOLD}plugin${RESET}     Manage plugin marketplaces`);
  console.log(`             Usage: plugin marketplace add|remove|list|browse`);
  console.log(`  ${BOLD}export${RESET}     Export squad to a portable JSON snapshot`);
  console.log(`             Default: squad-export.json (use --out <path> to override)`);
  console.log(`  ${BOLD}import${RESET}     Import squad from an export file`);
  console.log(`             Usage: import <file> [--force]`);
  console.log(`  ${BOLD}scrub-emails${RESET}  Remove email addresses from Squad state files`);
  console.log(`             Usage: scrub-emails [directory] (default: .ai-team/)`);
  console.log(`  ${BOLD}help${RESET}       Show this help message`);
  console.log(`\nFlags:`);
  console.log(`  ${BOLD}--version, -v${RESET}  Print version`);
  console.log(`  ${BOLD}--help, -h${RESET}     Show help`);
  console.log(`\nInsider channel: npx github:bradygaster/squad#insider\n`);
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

// Scrub email addresses from Squad state files
function scrubEmailsFromDirectory(dirPath) {
  const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const NAME_WITH_EMAIL_PATTERN = /([a-zA-Z0-9_-]+)\s*\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/g;
  
  const scrubbedFiles = [];
  const filesToScrub = [
    'team.md',
    'decisions.md',
    'routing.md',
    'ceremonies.md'
  ];
  
  // Scrub root-level files
  for (const file of filesToScrub) {
    const filePath = path.join(dirPath, file);
    if (fs.existsSync(filePath)) {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        
        // Replace "name (email)" → "name"
        const beforeNameEmail = content;
        content = content.replace(NAME_WITH_EMAIL_PATTERN, '$1');
        if (content !== beforeNameEmail) modified = true;
        
        // Replace bare emails in identity contexts (but preserve in URLs and code examples)
        const lines = content.split('\n');
        const scrubbed = lines.map(line => {
          // Skip lines that look like URLs, code blocks, or examples
          if (line.includes('http://') || line.includes('https://') || 
              line.includes('```') || line.includes('example.com') ||
              line.trim().startsWith('//') || line.trim().startsWith('#')) {
            return line;
          }
          // Scrub emails from identity/attribution contexts
          const before = line;
          const after = line.replace(EMAIL_PATTERN, '[email scrubbed]');
          if (before !== after) modified = true;
          return after;
        });
        
        if (modified) {
          fs.writeFileSync(filePath, scrubbed.join('\n'));
          scrubbedFiles.push(path.relative(dirPath, filePath));
        }
      } catch (err) {
        console.error(`${RED}✗${RESET} Failed to scrub ${file}: ${err.message}`);
      }
    }
  }
  
  // Scrub agent history files
  const agentsDir = path.join(dirPath, 'agents');
  if (fs.existsSync(agentsDir)) {
    try {
      for (const agentName of fs.readdirSync(agentsDir)) {
        const historyPath = path.join(agentsDir, agentName, 'history.md');
        if (fs.existsSync(historyPath)) {
          let content = fs.readFileSync(historyPath, 'utf8');
          let modified = false;
          
          // Replace "name (email)" → "name"
          const beforeNameEmail = content;
          content = content.replace(NAME_WITH_EMAIL_PATTERN, '$1');
          if (content !== beforeNameEmail) modified = true;
          
          // Scrub bare emails carefully
          const lines = content.split('\n');
          const scrubbed = lines.map(line => {
            // Skip URLs, code, examples
            if (line.includes('http://') || line.includes('https://') || 
                line.includes('```') || line.includes('example.com') ||
                line.trim().startsWith('//') || line.trim().startsWith('#')) {
              return line;
            }
            const before = line;
            const after = line.replace(EMAIL_PATTERN, '[email scrubbed]');
            if (before !== after) modified = true;
            return after;
          });
          
          if (modified) {
            fs.writeFileSync(historyPath, scrubbed.join('\n'));
            scrubbedFiles.push(path.relative(dirPath, historyPath));
          }
        }
      }
    } catch (err) {
      console.error(`${RED}✗${RESET} Failed to scrub agent histories: ${err.message}`);
    }
  }
  
  // Scrub log files
  const logDir = path.join(dirPath, 'log');
  if (fs.existsSync(logDir)) {
    try {
      const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.log'));
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        const before = content;
        content = content.replace(NAME_WITH_EMAIL_PATTERN, '$1');
        content = content.replace(EMAIL_PATTERN, '[email scrubbed]');
        if (content !== before) {
          fs.writeFileSync(filePath, content);
          scrubbedFiles.push(path.relative(dirPath, filePath));
        }
      }
    } catch (err) {
      console.error(`${RED}✗${RESET} Failed to scrub log files: ${err.message}`);
    }
  }
  
  return scrubbedFiles;
}

// Detect project type by checking for marker files in the target directory
function detectProjectType(dir) {
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) ||
      fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(dir, 'pom.xml')) ||
      fs.existsSync(path.join(dir, 'build.gradle')) ||
      fs.existsSync(path.join(dir, 'build.gradle.kts'))) return 'java';
  try {
    const entries = fs.readdirSync(dir);
    if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln'))) return 'dotnet';
  } catch {}
  return 'unknown';
}

// Workflows that contain Node.js/npm-specific commands and need project-type adaptation
const PROJECT_TYPE_SENSITIVE_WORKFLOWS = new Set([
  'squad-ci.yml',
  'squad-release.yml',
  'squad-preview.yml',
  'squad-insider-release.yml',
  'squad-docs.yml',
]);

// Generate a stub workflow for non-npm projects so no broken npm commands run
function generateProjectWorkflowStub(workflowFile, projectType) {
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

// Write a workflow file: verbatim copy for npm projects, stub for others
function writeWorkflowFile(file, srcPath, destPath, projectType) {
  if (projectType !== 'npm' && PROJECT_TYPE_SENSITIVE_WORKFLOWS.has(file)) {
    const stub = generateProjectWorkflowStub(file, projectType);
    if (stub) {
      fs.writeFileSync(destPath, stub);
      return;
    }
  }
  fs.copyFileSync(srcPath, destPath);
}

// --- Email scrubbing subcommand ---
if (cmd === 'scrub-emails') {
  const targetDir = process.argv[3] || path.join(dest, '.ai-team');
  
  if (!fs.existsSync(targetDir)) {
    fatal(`Directory not found: ${targetDir}`);
  }
  
  console.log(`${DIM}Scanning ${path.relative(dest, targetDir)} for email addresses...${RESET}`);
  const scrubbedFiles = scrubEmailsFromDirectory(targetDir);
  
  if (scrubbedFiles.length === 0) {
    console.log(`${GREEN}✓${RESET} No email addresses found — all clean`);
  } else {
    console.log(`${GREEN}✓${RESET} Scrubbed email addresses from ${scrubbedFiles.length} file(s):`);
    for (const file of scrubbedFiles) {
      console.log(`  ${BOLD}${file}${RESET}`);
    }
    console.log();
    console.log(`${YELLOW}⚠️  Note: Git history may still contain email addresses${RESET}`);
    console.log(`${YELLOW}   For a complete scrub, use git-filter-repo:${RESET}`);
    console.log(`${YELLOW}   https://github.com/newren/git-filter-repo${RESET}`);
  }
  console.log();
  process.exit(0);
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

// --- Plugin marketplace subcommand ---
if (cmd === 'plugin') {
  const subCmd = process.argv[3];
  const action = process.argv[4];

  if (subCmd !== 'marketplace' || !action) {
    fatal('Usage: squad plugin marketplace add|remove|list|browse');
  }

  const squadDirInfo = detectSquadDir(dest);
  const pluginsDir = path.join(squadDirInfo.path, 'plugins');
  const marketplacesFile = path.join(pluginsDir, 'marketplaces.json');

  function readMarketplaces() {
    if (!fs.existsSync(marketplacesFile)) return { marketplaces: [] };
    try {
      return JSON.parse(fs.readFileSync(marketplacesFile, 'utf8'));
    } catch {
      return { marketplaces: [] };
    }
  }

  function writeMarketplaces(data) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(marketplacesFile, JSON.stringify(data, null, 2) + '\n');
  }

  if (action === 'add') {
    const source = process.argv[5];
    if (!source || !source.includes('/')) {
      fatal('Usage: squad plugin marketplace add <owner/repo>');
    }
    const data = readMarketplaces();
    const name = source.split('/').pop();
    if (data.marketplaces.some(m => m.source === source)) {
      console.log(`${DIM}${source} is already registered${RESET}`);
      process.exit(0);
    }
    data.marketplaces.push({
      name,
      source,
      added_at: new Date().toISOString()
    });
    writeMarketplaces(data);
    console.log(`${GREEN}✓${RESET} Registered marketplace: ${BOLD}${name}${RESET} (${source})`);
    process.exit(0);
  }

  if (action === 'remove') {
    const name = process.argv[5];
    if (!name) {
      fatal('Usage: squad plugin marketplace remove <name>');
    }
    const data = readMarketplaces();
    const before = data.marketplaces.length;
    data.marketplaces = data.marketplaces.filter(m => m.name !== name);
    if (data.marketplaces.length === before) {
      fatal(`Marketplace "${name}" not found`);
    }
    writeMarketplaces(data);
    console.log(`${GREEN}✓${RESET} Removed marketplace: ${BOLD}${name}${RESET}`);
    process.exit(0);
  }

  if (action === 'list') {
    const data = readMarketplaces();
    if (data.marketplaces.length === 0) {
      console.log(`${DIM}No marketplaces registered${RESET}`);
      console.log(`\nAdd one with: ${BOLD}squad plugin marketplace add <owner/repo>${RESET}`);
      process.exit(0);
    }
    console.log(`\n${BOLD}Registered marketplaces:${RESET}\n`);
    for (const m of data.marketplaces) {
      const date = m.added_at ? ` ${DIM}(added ${m.added_at.split('T')[0]})${RESET}` : '';
      console.log(`  ${BOLD}${m.name}${RESET}  →  ${m.source}${date}`);
    }
    console.log();
    process.exit(0);
  }

  if (action === 'browse') {
    const name = process.argv[5];
    if (!name) {
      fatal('Usage: squad plugin marketplace browse <name>');
    }
    const data = readMarketplaces();
    const marketplace = data.marketplaces.find(m => m.name === name);
    if (!marketplace) {
      fatal(`Marketplace "${name}" not found. Run "squad plugin marketplace list" to see registered marketplaces.`);
    }

    // Browse the marketplace repo for plugins using gh CLI
    const { execSync } = require('child_process');
    let entries;
    try {
      const output = execSync(
        `gh api repos/${marketplace.source}/contents --jq "[.[] | select(.type == \\"dir\\") | .name]"`,
        { encoding: 'utf8', timeout: 15000 }
      ).trim();
      entries = JSON.parse(output);
    } catch (err) {
      fatal(`Could not browse ${marketplace.source} — is the GitHub CLI installed and authenticated?\n  ${err.message}`);
    }

    if (!entries || entries.length === 0) {
      console.log(`${DIM}No plugins found in ${marketplace.source}${RESET}`);
      process.exit(0);
    }

    console.log(`\n${BOLD}Plugins in ${marketplace.name}${RESET} (${marketplace.source}):\n`);
    for (const entry of entries) {
      console.log(`  📦 ${entry}`);
    }
    console.log(`\n${DIM}${entries.length} plugin(s) available${RESET}\n`);
    process.exit(0);
  }

  fatal(`Unknown action: ${action}. Usage: squad plugin marketplace add|remove|list|browse`);
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
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
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
  const importDate = new Date().toISOString();

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
const isSelfUpgrade = isUpgrade && process.argv.includes('--self');
const isMigrateDirectory = isUpgrade && process.argv.includes('--migrate-directory');

// Handle --migrate-directory flag: rename .ai-team/ to .squad/
if (isMigrateDirectory) {
  const aiTeamDir = path.join(dest, '.ai-team');
  const squadDir = path.join(dest, '.squad');
  
  if (!fs.existsSync(aiTeamDir)) {
    fatal('No .ai-team/ directory found — nothing to migrate.');
  }
  
  if (fs.existsSync(squadDir)) {
    fatal('.squad/ directory already exists — migration appears to be complete.');
  }
  
  console.log(`${DIM}Migrating .ai-team/ → .squad/...${RESET}`);
  
  try {
    // Rename directory
    fs.renameSync(aiTeamDir, squadDir);
    console.log(`${GREEN}✓${RESET} Renamed .ai-team/ → .squad/`);
    
    // Update .gitattributes
    const gitattributes = path.join(dest, '.gitattributes');
    if (fs.existsSync(gitattributes)) {
      let content = fs.readFileSync(gitattributes, 'utf8');
      const updated = content.replace(/\.ai-team\//g, '.squad/');
      if (content !== updated) {
        fs.writeFileSync(gitattributes, updated);
        console.log(`${GREEN}✓${RESET} Updated .gitattributes`);
      }
    }
    
    // Update .gitignore if it exists
    const gitignore = path.join(dest, '.gitignore');
    if (fs.existsSync(gitignore)) {
      let content = fs.readFileSync(gitignore, 'utf8');
      const updated = content.replace(/\.ai-team\//g, '.squad/');
      if (content !== updated) {
        fs.writeFileSync(gitignore, updated);
        console.log(`${GREEN}✓${RESET} Updated .gitignore`);
      }
    }
    
    // Scrub email addresses from migrated files
    console.log(`${DIM}Scrubbing email addresses from .squad/ files...${RESET}`);
    const scrubbedFiles = scrubEmailsFromDirectory(squadDir);
    if (scrubbedFiles.length > 0) {
      console.log(`${GREEN}✓${RESET} Scrubbed email addresses from ${scrubbedFiles.length} file(s)`);
    } else {
      console.log(`${GREEN}✓${RESET} No email addresses found`);
    }
    
    console.log();
    console.log(`${BOLD}Migration complete.${RESET}`);
    console.log(`${DIM}Commit the change:${RESET}`);
    console.log(`  git add -A`);
    console.log(`  git commit -m "chore: migrate .ai-team/ → .squad/"`);
    console.log();
    
  } catch (err) {
    fatal(`Migration failed: ${err.message}`);
  }
  
  process.exit(0);
}

// Stamp version into squad.agent.md after copying
function stampVersion(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Replace version in HTML comment (must come immediately after frontmatter closing ---)
  content = content.replace(/<!-- version: [^>]+ -->/m, `<!-- version: ${pkg.version} -->`);
  // Replace version in the Identity section's Version line
  content = content.replace(/- \*\*Version:\*\* [0-9.]+(?:-[a-z]+)?/m, `- **Version:** ${pkg.version}`);
  fs.writeFileSync(filePath, content);
}

// Read version from squad.agent.md HTML comment
function readInstalledVersion(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    // Try to read from HTML comment first (new format)
    const commentMatch = content.match(/<!-- version: ([0-9.]+(?:-[a-z]+)?) -->/);
    if (commentMatch) return commentMatch[1];
    // Fallback: try old frontmatter format for backward compatibility during upgrade
    const frontmatterMatch = content.match(/^version:\s*"([^"]+)"/m);
    return frontmatterMatch ? frontmatterMatch[1] : '0.0.0';
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
    description: 'Create .ai-team/plugins/ directory',
    run(dest) {
      const pluginsDir = path.join(dest, '.ai-team', 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
  },
  {
    version: '0.5.0',
    description: 'Scrub email addresses from Squad state files (privacy fix)',
    run(dest) {
      const aiTeamDir = path.join(dest, '.ai-team');
      if (fs.existsSync(aiTeamDir)) {
        const scrubbedFiles = scrubEmailsFromDirectory(aiTeamDir);
        if (scrubbedFiles.length > 0) {
          console.log(`${GREEN}✓${RESET} Privacy migration: scrubbed email addresses from ${scrubbedFiles.length} file(s)`);
        }
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

// Handle --self flag: refresh .ai-team/ from templates (for squad repo itself)
if (isSelfUpgrade) {
  const aiTeamDir = path.join(dest, '.ai-team');
  if (!fs.existsSync(aiTeamDir)) {
    fatal('No .ai-team/ directory found. Run init first, or remove --self flag.');
  }

  console.log(`${DIM}Refreshing .ai-team/ from templates (squad --self mode)...${RESET}`);

  // Refresh team-wide files from templates
  const filesToRefresh = [
    { src: 'team.md', dest: 'team.md' },
    { src: 'routing.md', dest: 'routing.md' },
    { src: 'ceremonies.md', dest: 'ceremonies.md' }
  ];

  for (const file of filesToRefresh) {
    const srcPath = path.join(root, 'templates', file.src);
    const destPath = path.join(aiTeamDir, file.dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`${GREEN}✓${RESET} ${BOLD}refreshed${RESET} .ai-team/${file.dest}`);
    }
  }

  // Refresh skills directory (don't touch agent directories — preserve history)
  const skillsSrc = path.join(root, 'templates', 'skills');
  const skillsDest = path.join(aiTeamDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    copyRecursive(skillsSrc, skillsDest);
    console.log(`${GREEN}✓${RESET} ${BOLD}refreshed${RESET} .ai-team/skills/`);
  }

  console.log();
  console.log(`${BOLD}Squad repo refreshed.${RESET}`);
  console.log(`${DIM}Agent histories preserved — only templates and skills updated${RESET}`);
  console.log();
  showDeprecationWarning();
  process.exit(0);
}

// Detect project type once for use throughout init/upgrade workflow generation
const projectType = detectProjectType(dest);

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
        writeWorkflowFile(file, path.join(workflowsSrc, file), path.join(workflowsDest, file), projectType);
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

// Detect or determine squad directory (.squad/ for new, detect for upgrades)
// Detect squad directory for dual-path support (.squad/ or .ai-team/)
const squadInfo = (() => {
  const squadDir = path.join(dest, '.squad');
  const aiTeamDir = path.join(dest, '.ai-team');
  
  if (fs.existsSync(squadDir)) {
    return { path: squadDir, name: '.squad', isLegacy: false };
  }
  if (fs.existsSync(aiTeamDir)) {
    return { path: aiTeamDir, name: '.ai-team', isLegacy: true };
  }
  // Default for new installations
  return { path: squadDir, name: '.squad', isLegacy: false };
})();

// Show deprecation warning if using .ai-team/ (but not on new installs)
if (squadInfo.isLegacy) {
  showDeprecationWarning();
}

// Pre-create drop-box, orchestration-log, casting, skills, plugins, and identity directories (additive-only)
const inboxDir = path.join(squadInfo.path, 'decisions', 'inbox');
const orchLogDir = path.join(squadInfo.path, 'orchestration-log');
const castingDir = path.join(squadInfo.path, 'casting');
const skillsDir = path.join(squadInfo.path, 'skills');
const pluginsDir = path.join(squadInfo.path, 'plugins');
const identityDir = path.join(squadInfo.path, 'identity');
try {
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(orchLogDir, { recursive: true });
  fs.mkdirSync(castingDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(identityDir, { recursive: true });
} catch (err) {
  fatal(`Failed to create ${squadInfo.name}/ directories: ${err.message}`);
}

// Copy starter skills (skip if any skills already exist)
if (!isUpgrade) {
  const skillsSrc = path.join(root, 'templates', 'skills');
  if (fs.existsSync(skillsSrc) && fs.readdirSync(skillsDir).length === 0) {
    copyRecursive(skillsSrc, skillsDir);
    console.log(`${GREEN}✓${RESET} ${squadInfo.name}/skills/ (starter skills)`);
  }
}

// Scaffold identity files (now.md, wisdom.md) — both init and upgrade
const nowMdPath = path.join(identityDir, 'now.md');
const wisdomMdPath = path.join(identityDir, 'wisdom.md');

if (!fs.existsSync(nowMdPath)) {
  const nowTemplate = `---
updated_at: ${new Date().toISOString()}
focus_area: Initial setup
active_issues: []
---

# What We're Focused On

Getting started. Updated by coordinator at session start.
`;
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(nowMdPath, nowTemplate);
  console.log(`${GREEN}✓${RESET} ${squadInfo.name}/identity/now.md`);
} else if (isUpgrade) {
  console.log(`${DIM}identity/now.md already exists — skipping${RESET}`);
}

if (!fs.existsSync(wisdomMdPath)) {
  const wisdomTemplate = `---
last_updated: ${new Date().toISOString()}
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->

## Anti-Patterns

<!-- Things we tried that didn't work. **Avoid:** description. **Why:** reason. -->
`;
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(wisdomMdPath, wisdomTemplate);
  console.log(`${GREEN}✓${RESET} ${squadInfo.name}/identity/wisdom.md`);
} else if (isUpgrade) {
  console.log(`${DIM}identity/wisdom.md already exists — skipping${RESET}`);
}

// Create sample MCP config (skip if .copilot/mcp-config.json already exists)
if (!isUpgrade) {
  const mcpDir = path.join(dest, '.copilot');
  const mcpConfigPath = path.join(mcpDir, 'mcp-config.json');
  if (!fs.existsSync(mcpConfigPath)) {
    try {
      fs.mkdirSync(mcpDir, { recursive: true });
      const mcpSample = {
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
      };
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpSample, null, 2) + '\n');
      console.log(`${GREEN}✓${RESET} .copilot/mcp-config.json (MCP sample — rename EXAMPLE-trello to enable)`);
    } catch (err) {
      // Non-fatal — MCP config is optional
    }
  } else {
    console.log(`${DIM}mcp-config.json already exists — skipping${RESET}`);
  }
}

// Copy default ceremonies config
const ceremoniesDest = path.join(squadInfo.path, 'ceremonies.md');
if (!fs.existsSync(ceremoniesDest)) {
  const ceremoniesSrc = path.join(root, 'templates', 'ceremonies.md');
  fs.copyFileSync(ceremoniesSrc, ceremoniesDest);
  console.log(`${GREEN}✓${RESET} ${squadInfo.name}/ceremonies.md`);
} else {
  console.log(`${DIM}ceremonies.md already exists — skipping${RESET}`);
}

// copilot-instructions.md — managed by `squad copilot` subcommand
// On upgrade, update if @copilot is enabled on the team
const copilotInstructionsSrc = path.join(root, 'templates', 'copilot-instructions.md');
const copilotInstructionsDest = path.join(dest, '.github', 'copilot-instructions.md');
if (isUpgrade) {
  const teamMd = path.join(squadInfo.path, 'team.md');
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
      writeWorkflowFile(file, path.join(workflowsSrc, file), path.join(workflowsDest, file), projectType);
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
        writeWorkflowFile(file, path.join(workflowsSrc, file), destFile, projectType);
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
  // Scrub email addresses from existing squad directory
  console.log(`${DIM}Scrubbing email addresses from ${squadInfo.name}/ files...${RESET}`);
  const scrubResult = scrubEmailsFromDirectory(squadInfo.path);
  const scrubbed = Array.isArray(scrubResult) ? scrubResult : [];
  if (scrubbed.length > 0) {
    console.log(`${GREEN}✓${RESET} Scrubbed email addresses from ${scrubbed.length} file(s)`);
  } else {
    console.log(`${GREEN}✓${RESET} No email addresses found`);
  }
  
  console.log(`\n${DIM}${squadInfo.name}/ untouched — your team state is safe${RESET}`);

  // Hint about new features available after upgrade
  const teamMd = path.join(squadInfo.path, 'team.md');
  const copilotEnabled = fs.existsSync(teamMd)
    && fs.readFileSync(teamMd, 'utf8').includes('🤖 Coding Agent');
  if (!copilotEnabled) {
    console.log(`\n${BOLD}New:${RESET} @copilot coding agent support is now available.`);
    console.log(`  Run ${BOLD}npx github:bradygaster/squad copilot${RESET} to add it to your team.`);
  }
}

console.log();
console.log(`${BOLD}Squad is ${isUpgrade ? 'upgraded' : 'ready'}.${RESET}${isUpgrade ? ` (v${pkg.version})` : ''}`);
console.log();
if (squadInfo.isLegacy) {
  showDeprecationWarning();
}
if (!isUpgrade) {
  console.log(`Next steps:`);
  console.log(`  1. Open Copilot:  ${DIM}copilot${RESET}`);
  console.log(`  2. Type ${BOLD}/agent${RESET} (CLI) or ${BOLD}/agents${RESET} (VS Code) and select ${BOLD}Squad${RESET}`);
  console.log(`  3. Tell it what you're building`);
  console.log();
} else {
  console.log();
}
