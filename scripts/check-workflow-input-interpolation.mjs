#!/usr/bin/env node
// check-workflow-input-interpolation.mjs -- Catch prose-only workflow_dispatch input
// references in agentic workflow prompt bodies.
//
// An agentic workflow prompt is Markdown that gets rendered into the agent's context.
// Writing `github.event.inputs.command` in backticks names the expression but never
// resolves it, so the agent sees a literal string instead of the dispatched value.
// The workflow then looks healthy from the Actions tab -- run-name and `if:` guards
// interpolate correctly in frontmatter -- while the agent silently no-ops for want of
// a value that was delivered but never rendered.
//
// Rule: inside a prompt body, every `github.event.inputs.*` reference must appear
// within a `${{ ... }}` interpolation. Two deliberate exemptions:
//
//   * Frontmatter -- `run-name`, `if`, `concurrency` and friends are evaluated by
//     Actions itself, not by the agent.
//   * Other `github.event.*` paths -- see the INPUT_REF comment below.
//
// This scans whole files, including `## skill:` blocks, and that matters: mode
// playbooks are now extracted into inline skills and restored in isolation, with no
// guarantee about what precedes them. A skill body that needs a dispatch input must
// interpolate it itself -- it cannot lean on `## Trigger Context` having resolved the
// value into scope. Scanning skill bodies turns that from a convention into a
// structural guarantee.
//
// Exit 0 when clean, exit 1 with file:line details otherwise.
// Uses only Node.js built-ins (fs, path, url).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const SCAN_DIRS = [
  'workflows',
  '.squad-templates/workflows',
  'templates/workflows',
  'packages/squad-cli/templates/workflows',
  'packages/squad-sdk/templates/workflows',
];

// Scoped to `inputs.*` deliberately. Do NOT widen this to all `github.event.*`:
// `comment.body` and `issue.body` are attacker-controlled. gh-aw delivers them to the
// agent through sanitized trigger context, so interpolating them here would splice
// untrusted text straight into the prompt ahead of the sanitizer -- a prompt-injection
// vector. A bare prose reference to those paths is CORRECT and must not be "fixed".
// An earlier draft of this check flagged them; the gate was right and the tempting fix
// was wrong.
const INPUT_REF = /github\.event\.inputs\.[A-Za-z0-9_]+/g;
const INTERPOLATION = /\$\{\{[^}]*\}\}/g;
const ACTION_INPUT_NAMES = new Set(['command', 'action', 'mode', 'operation']);
const DESTRUCTIVE_DEFAULTS = new Set([
  'adopt',
  'cast',
  'cast-member',
  'connect',
  'implement',
  'plan accept',
  'plan activate',
  'retire',
]);

/** Collect .md files from a directory tree, skipping nothing -- these trees are small. */
function collectMarkdown(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectMarkdown(full));
    } else if (entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Return the 0-based line index where the prompt body starts.
 * A leading `---` fence opens YAML frontmatter; the body begins after its closing fence.
 * Without frontmatter the whole file is body.
 */
function bodyStartLine(lines) {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i + 1;
  }
  return 0;
}

function frontmatterEndLine(lines) {
  if (lines[0]?.trim() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i;
  }
  return -1;
}

function parseScalar(value) {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function checkWorkflowDispatchActionDefaults(file, lines) {
  const end = frontmatterEndLine(lines);
  if (end < 0) return;

  const workflowDispatchIndent = lines.findIndex((line, idx) =>
    idx < end && /^ {2}workflow_dispatch:\s*$/.test(line)
  );
  if (workflowDispatchIndent < 0) return;

  const inputsLine = lines.findIndex((line, idx) =>
    idx > workflowDispatchIndent && idx < end && /^ {4}inputs:\s*$/.test(line)
  );
  if (inputsLine < 0) return;

  let currentInput = null;
  for (let i = inputsLine + 1; i < end; i++) {
    const line = lines[i];
    if (/^ {0,3}\S/.test(line)) break;

    const inputMatch = line.match(/^ {6}([A-Za-z0-9_-]+):\s*$/);
    if (inputMatch) {
      currentInput = inputMatch[1];
      continue;
    }

    if (!currentInput || !ACTION_INPUT_NAMES.has(currentInput)) continue;

    const defaultMatch = line.match(/^ {8}default:\s*(.+)$/);
    if (!defaultMatch) continue;

    const defaultValue = parseScalar(defaultMatch[1]).toLowerCase();
    if (!DESTRUCTIVE_DEFAULTS.has(defaultValue)) continue;

    violations.push({
      file: relative(REPO_ROOT, file).replace(/\\/g, '/'),
      line: i + 1,
      ref: `${currentInput}.default`,
      text: line.trim(),
      kind: 'destructive-default',
    });
  }
}

const violations = [];
let scannedFiles = 0;

for (const relDir of SCAN_DIRS) {
  const dir = join(REPO_ROOT, relDir);
  if (!existsSync(dir)) continue;

  for (const file of collectMarkdown(dir)) {
    scannedFiles++;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const start = bodyStartLine(lines);
    checkWorkflowDispatchActionDefaults(file, lines);

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('github.event.inputs.')) continue;

      // Blank out every interpolation, then see if any reference survives outside one.
      const masked = line.replace(INTERPOLATION, (match) => ' '.repeat(match.length));
      const bare = masked.match(INPUT_REF);
      if (!bare) continue;

      for (const ref of bare) {
        violations.push({
          file: relative(REPO_ROOT, file).replace(/\\/g, '/'),
          line: i + 1,
          ref,
          text: line.trim(),
          kind: 'bare-input-reference',
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    `Workflow input interpolation check passed: ${scannedFiles} prompt file(s) scanned, no bare github.event.inputs.* references.`,
  );
  process.exit(0);
}

console.error(
  `Workflow input interpolation check FAILED: ${violations.length} workflow input issue(s).\n`,
);
console.error(
  'Bare prompt references name an expression without resolving it, so the agent receives the literal text',
);
console.error('instead of the dispatched value -- and silently no-ops.');
console.error('Destructive action defaults let missing dispatch inputs silently run the wrong mode.\n');

for (const { file, line, ref, text, kind } of violations) {
  console.error(`  ${file}:${line}`);
  console.error(`    ${kind === 'destructive-default' ? 'default' : 'reference'}: ${ref}`);
  console.error(`    line:      ${text}\n`);
}

console.error('To fix bare references: wrap the reference in an interpolation, e.g.');
console.error('  - **Dispatched command:** `${{ github.event.inputs.command }}`');
console.error('If the prompt genuinely needs to discuss the input rather than its value,');
console.error('describe it without the literal `github.event.inputs.` prefix.');
console.error('To fix destructive defaults: make the action input required, or use an inert default.');
process.exit(1);
