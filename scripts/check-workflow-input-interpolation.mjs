#!/usr/bin/env node
// check-workflow-input-interpolation.mjs -- Catch prose-only workflow_dispatch input
// references in agentic workflow prompt bodies, AND validate dispatch_workflow safe-output
// JSON schemas to prevent the "empty probe destroys real dispatch" failure mode (#1772).
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
// DISPATCH SCHEMA GATE (#1772):
// Workflow prompts that reference dispatch_workflow safe-output MAY include a JSON
// example block showing the expected payload. When such a block is present, it must:
//   (a) include a non-empty "workflow_name" key -- missing or empty causes gh-aw to
//       run the wrong workflow or fail silently (confirmed in aspiregregator-squad-e2e
//       run 32316227601).
//   (b) include a non-empty "inputs" object -- top-level "command"/"issue_number" are
//       silently dropped by gh-aw; they must be nested under "inputs".
//   (c) if "inputs" is present, include "issue_number" -- dispatching without an issue
//       number causes the receiving workflow to create a junk issue (confirmed in runs
//       32324473906, 32394811753).
//
// This does not prevent an LLM from emitting an empty probe at runtime, but it does
// prevent the authoring mistake of shipping a workflow with a structurally wrong schema
// example. Combined with raising dispatch-workflow.max to >=2, the real dispatch gets a
// second chance even when the LLM probes first.
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

/**
 * Check dispatch_workflow JSON schema examples in a workflow body for completeness.
 *
 * gh-aw processes dispatch_workflow safe-output entries in emission order and applies
 * them up to the configured `max`. An empty or structurally incomplete entry emitted
 * BEFORE the real one consumes the slot silently -- the real dispatch is discarded
 * and the receiving workflow runs with no inputs (junk issue / wrong-skill failures).
 *
 * Rule: every JSON code block that appears adjacent to a `dispatch_workflow` or
 * `dispatch-workflow` reference in the body must:
 *   (a) include "workflow_name" with a non-empty value
 *   (b) include "inputs" as a non-empty object (not top-level command/issue_number)
 *   (c) if "inputs" is present, include "issue_number"
 *
 * Heuristic: a code block is "adjacent" if the preceding 20 lines contain
 * `dispatch_workflow` or `dispatch-workflow`. This is intentionally liberal --
 * false positives are far cheaper than missed malformed schemas.
 *
 * Blocks that are not valid JSON are skipped (other tooling owns JSON syntax).
 */
function checkDispatchWorkflowSchemas(file, lines, start) {
  let i = start;
  while (i < lines.length) {
    const line = lines[i];

    // Detect opening of a fenced JSON block
    if (!/^```json\s*$/.test(line)) {
      i++;
      continue;
    }

    // Collect the block content
    const blockStartLine = i;
    i++;
    const blockLines = [];
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      blockLines.push(lines[i]);
      i++;
    }
    i++; // consume closing ```

    // Is this block preceded by a dispatch_workflow reference?
    const lookbackStart = Math.max(start, blockStartLine - 20);
    const precedes = lines
      .slice(lookbackStart, blockStartLine)
      .some((l) => /dispatch[_-]workflow/i.test(l));
    if (!precedes) continue;

    let payload;
    try {
      payload = JSON.parse(blockLines.join('\n'));
    } catch {
      // Not valid JSON -- skip; JSON syntax errors are caught elsewhere.
      continue;
    }

    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) continue;

    const relFile = relative(REPO_ROOT, file).replace(/\\/g, '/');
    const blockLine = blockStartLine + 1;

    // (a) workflow_name must be present and non-empty
    if (!payload.workflow_name || typeof payload.workflow_name !== 'string' || payload.workflow_name.trim() === '') {
      violations.push({
        file: relFile,
        line: blockLine,
        ref: 'dispatch_workflow.workflow_name',
        text: '```json (dispatch_workflow payload missing or empty workflow_name)',
        kind: 'dispatch-schema-missing-workflow-name',
      });
    }

    // (b) inputs must be present as a non-empty object (not top-level keys)
    if (
      !payload.inputs ||
      typeof payload.inputs !== 'object' ||
      Array.isArray(payload.inputs) ||
      Object.keys(payload.inputs).length === 0
    ) {
      violations.push({
        file: relFile,
        line: blockLine,
        ref: 'dispatch_workflow.inputs',
        text: '```json (dispatch_workflow payload missing or empty inputs object)',
        kind: 'dispatch-schema-missing-inputs',
      });
    } else {
      // (c) inputs.issue_number must be present (may be a template placeholder)
      if (!Object.prototype.hasOwnProperty.call(payload.inputs, 'issue_number')) {
        violations.push({
          file: relFile,
          line: blockLine,
          ref: 'dispatch_workflow.inputs.issue_number',
          text: '```json (dispatch_workflow payload inputs missing issue_number)',
          kind: 'dispatch-schema-missing-issue-number',
        });
      }
    }

    // Flag top-level command/issue_number as they are silently dropped by gh-aw
    for (const key of ['command', 'issue_number']) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        violations.push({
          file: relFile,
          line: blockLine,
          ref: `dispatch_workflow.${key} (top-level)`,
          text: `\`\`\`json (dispatch_workflow payload has top-level "${key}" -- gh-aw ignores it; nest under inputs)`,
          kind: 'dispatch-schema-top-level-input',
        });
      }
    }
  }
}

const violations = [];
let scannedFiles = 0;

// SQUAD_GATE_SCAN_OVERRIDE is set by tests to point at a fixture directory instead
// of the real workflows tree. When set, only that directory is scanned.
const SCAN_OVERRIDE = process.env.SQUAD_GATE_SCAN_OVERRIDE;
const effectiveDirs = SCAN_OVERRIDE
  ? [SCAN_OVERRIDE]
  : SCAN_DIRS.map((d) => join(REPO_ROOT, d));

for (const dir of effectiveDirs) {
  if (!existsSync(dir)) continue;

  for (const file of collectMarkdown(dir)) {
    scannedFiles++;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const start = bodyStartLine(lines);
    checkWorkflowDispatchActionDefaults(file, lines);
    checkDispatchWorkflowSchemas(file, lines, start);

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
    `Workflow input interpolation check passed: ${scannedFiles} prompt file(s) scanned, no bare github.event.inputs.* references or malformed dispatch_workflow schemas.`,
  );
  process.exit(0);
}

const DISPATCH_KINDS = new Set([
  'dispatch-schema-missing-workflow-name',
  'dispatch-schema-missing-inputs',
  'dispatch-schema-missing-issue-number',
  'dispatch-schema-top-level-input',
]);

function kindLabel(kind) {
  if (kind === 'destructive-default') return 'default';
  if (DISPATCH_KINDS.has(kind)) return 'dispatch-schema';
  return 'reference';
}

console.error(
  `Workflow input interpolation check FAILED: ${violations.length} workflow input issue(s).\n`,
);
console.error(
  'Bare prompt references name an expression without resolving it, so the agent receives the literal text',
);
console.error('instead of the dispatched value -- and silently no-ops.');
console.error('Destructive action defaults let missing dispatch inputs silently run the wrong mode.');
console.error('Malformed dispatch_workflow schemas cause the receiving workflow to run with no inputs,');
console.error('creating junk issues or running the wrong skill (confirmed: aspiregregator-squad-e2e runs 32324473906, 32316227601).\n');

for (const { file, line, ref, text, kind } of violations) {
  console.error(`  ${file}:${line}`);
  console.error(`    ${kindLabel(kind)}: ${ref}`);
  console.error(`    line:      ${text}\n`);
}

console.error('To fix bare references: wrap the reference in an interpolation, e.g.');
console.error('  - **Dispatched command:** `${{ github.event.inputs.command }}`');
console.error('If the prompt genuinely needs to discuss the input rather than its value,');
console.error('describe it without the literal `github.event.inputs.` prefix.');
console.error('To fix destructive defaults: make the action input required, or use an inert default.');
console.error('To fix dispatch_workflow schemas: ensure the JSON example includes:');
console.error('  "workflow_name": "<name>",');
console.error('  "inputs": { "issue_number": "...", ... }');
console.error('Do not put command or issue_number at the top level -- gh-aw silently drops them.');
process.exit(1);
