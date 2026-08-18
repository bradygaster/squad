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
//   * Other `github.event.*` paths (notably `comment.body` and `issue.body`) -- these
//     carry untrusted user text. gh-aw supplies them to the agent through sanitized
//     trigger context; interpolating them straight into the prompt would be a
//     prompt-injection vector, so bare prose references are correct there.
//
// Exit 0 when clean, exit 1 with file:line details otherwise.
// Uses only Node.js built-ins (fs, path).

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

const INPUT_REF = /github\.event\.inputs\.[A-Za-z0-9_]+/g;
const INTERPOLATION = /\$\{\{[^}]*\}\}/g;

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

const violations = [];
let scannedFiles = 0;

for (const relDir of SCAN_DIRS) {
  const dir = join(REPO_ROOT, relDir);
  if (!existsSync(dir)) continue;

  for (const file of collectMarkdown(dir)) {
    scannedFiles++;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const start = bodyStartLine(lines);

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
  `Workflow input interpolation check FAILED: ${violations.length} bare github.event.inputs.* reference(s) in prompt bodies.\n`,
);
console.error(
  'These name an expression without resolving it, so the agent receives the literal text',
);
console.error('instead of the dispatched value -- and silently no-ops.\n');

for (const { file, line, ref, text } of violations) {
  console.error(`  ${file}:${line}`);
  console.error(`    reference: ${ref}`);
  console.error(`    line:      ${text}\n`);
}

console.error('To fix: wrap the reference in an interpolation, e.g.');
console.error('  - **Dispatched command:** `${{ github.event.inputs.command }}`');
console.error('If the prompt genuinely needs to discuss the input rather than its value,');
console.error('describe it without the literal `github.event.inputs.` prefix.');
process.exit(1);
