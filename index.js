#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const root = __dirname;
const dest = process.cwd();

function copyRecursive(src, target) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(target, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(src, target);
  }
}

// Copy agent file
const agentSrc = path.join(root, '.github', 'agents', 'squad.agent.md');
const agentDest = path.join(dest, '.github', 'agents', 'squad.agent.md');

if (fs.existsSync(agentDest)) {
  console.log(`${DIM}squad.agent.md already exists — skipping${RESET}`);
} else {
  fs.mkdirSync(path.dirname(agentDest), { recursive: true });
  fs.copyFileSync(agentSrc, agentDest);
  console.log(`${GREEN}✓${RESET} .github/agents/squad.agent.md`);
}

// Pre-create drop-box, orchestration-log, and casting directories
const inboxDir = path.join(dest, '.ai-team', 'decisions', 'inbox');
const orchLogDir = path.join(dest, '.ai-team', 'orchestration-log');
const castingDir = path.join(dest, '.ai-team', 'casting');
fs.mkdirSync(inboxDir, { recursive: true });
fs.mkdirSync(orchLogDir, { recursive: true });
fs.mkdirSync(castingDir, { recursive: true });

// Copy templates
const templatesSrc = path.join(root, 'templates');
const templatesDest = path.join(dest, '.ai-team-templates');

if (fs.existsSync(templatesDest)) {
  console.log(`${DIM}.ai-team-templates/ already exists — skipping${RESET}`);
} else {
  copyRecursive(templatesSrc, templatesDest);
  console.log(`${GREEN}✓${RESET} .ai-team-templates/`);
}

console.log();
console.log(`${BOLD}Squad is ready.${RESET}`);
console.log();
console.log(`Next steps:`);
console.log(`  1. Open Copilot:  ${DIM}copilot${RESET}`);
console.log(`  2. Select ${BOLD}Squad${RESET} from the /agents list`);
console.log(`  3. Tell it what you're building`);
console.log();
