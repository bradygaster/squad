/**
 * Security Review Check — detects potential security concerns in PR diffs.
 *
 * Checks for:
 * - secrets.* references in workflow files
 * - eval() usage in JS/TS
 * - child_process.exec with template literals (injection risk)
 * - Unsafe git operations (git add ., git add -A, git commit -a, git push --force)
 * - New npm dependencies
 * - PII-related environment variable patterns
 * - Workflow files with write permissions
 * - pull_request_target + actions/checkout combination (token exposure)
 *
 * Usage: node scripts/security-review.mjs [base-ref]
 * Default base-ref: origin/dev
 *
 * Exit code: always 0 (informational)
 * Output: JSON { findings: [{category, severity, message, file, line}], summary }
 *
 * Uses only node:* built-ins (runs in CI before npm install).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseRef = process.argv[2] || 'origin/dev';
const headRef = process.argv[3] || 'HEAD';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gitDiffNames() {
  try {
    const output = execFileSync(
      'git',
      ['diff', `${baseRef}...${headRef}`, '--name-only', '--diff-filter=ACMRT'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function gitDiffPatch() {
  try {
    return execFileSync('git', ['diff', `${baseRef}...${headRef}`, '-U0'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function readFileSafe(filePath) {
  try {
    if (headRef !== 'HEAD') {
      return execFileSync('git', ['show', `${headRef}:${filePath}`], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    }
    return readFileSync(resolve(filePath), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse unified diff into per-file added lines with line numbers.
 * Returns Map<filename, Array<{line: number, text: string}>>
 */
function parseAddedLines(patch) {
  const result = new Map();
  let currentFile = null;
  let hunkLine = 0;

  for (const rawLine of patch.split('\n')) {
    // New file header
    const fileMatch = rawLine.match(/^\+\+\+ b\/(.+)/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }
    // Hunk header — extract new file line number
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      hunkLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    // Added line
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++') && currentFile) {
      result.get(currentFile).push({ line: hunkLine, text: rawLine.slice(1) });
      hunkLine++;
    } else if (!rawLine.startsWith('-')) {
      // Context line — increment line counter
      hunkLine++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Security checks
// ---------------------------------------------------------------------------

const findings = [];
const changedFiles = gitDiffNames();
const patch = gitDiffPatch();
const addedByFile = parseAddedLines(patch);

const workflowFiles = changedFiles.filter((f) =>
  f.startsWith('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml')),
);
const jstsFiles = changedFiles.filter((f) =>
  /\.(js|ts|mjs|mts|cjs|cts)$/.test(f),
);
const pkgJsonFiles = changedFiles.filter((f) => f.endsWith('package.json'));

// 1. secrets.* references in workflow files
for (const file of workflowFiles) {
  const added = addedByFile.get(file) || [];
  for (const { line, text } of added) {
    // Exclude standard GITHUB_TOKEN and common safe patterns
    if (/secrets\./.test(text) && !/secrets\.GITHUB_TOKEN/.test(text)) {
      findings.push({
        category: 'secrets-reference',
        severity: 'warning',
        message: 'Non-standard secret reference in workflow — verify this secret is necessary and scoped correctly.',
        file,
        line,
      });
    }
  }
}

// 2. eval() usage
for (const file of jstsFiles) {
  const added = addedByFile.get(file) || [];
  for (const { line, text } of added) {
    if (/\beval\s*\(/.test(text)) {
      findings.push({
        category: 'eval-usage',
        severity: 'error',
        message: 'eval() detected — this is a code injection risk. Use safer alternatives.',
        file,
        line,
      });
    }
  }
}

// 3. child_process.exec with template literals
for (const file of jstsFiles) {
  const added = addedByFile.get(file) || [];
  for (const { line, text } of added) {
    if (/exec\s*\(\s*`/.test(text) || /exec\s*\(\s*['"].*\$\{/.test(text)) {
      findings.push({
        category: 'command-injection',
        severity: 'error',
        message:
          'exec() with template literal/interpolation detected — risk of command injection. ' +
          'Use execFile() with array arguments instead.',
        file,
        line,
      });
    }
  }
}

// 4. Unsafe git operations
const GIT_UNSAFE_PATTERNS = [
  { pattern: /git\s+add\s+\./, label: 'git add .' },
  { pattern: /git\s+add\s+-A/, label: 'git add -A' },
  { pattern: /git\s+commit\s+-a/, label: 'git commit -a' },
  { pattern: /git\s+push\s+--force/, label: 'git push --force' },
  { pattern: /--force-with-lease/, label: 'git push --force-with-lease' },
];

for (const file of changedFiles) {
  // Skill docs reference unsafe patterns as warnings — skip them
  if (file.startsWith('.copilot/skills/') && file.endsWith('.md')) continue;
  const added = addedByFile.get(file) || [];
  for (const { line, text } of added) {
    for (const { pattern, label } of GIT_UNSAFE_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          category: 'unsafe-git',
          severity: 'error',
          message: `Unsafe git operation: \`${label}\` — this can stage unintended files or force-push shared branches.`,
          file,
          line,
        });
      }
    }
  }
}

// 5. New npm dependencies
for (const file of pkgJsonFiles) {
  const added = addedByFile.get(file) || [];
  // Look for lines adding new dependencies
  const depLines = added.filter(({ text }) =>
    /^\s*"[^"]+"\s*:\s*"[~^]?\d/.test(text) || /^\s*"[^"]+"\s*:\s*"(workspace|npm):/.test(text),
  );
  if (depLines.length > 0) {
    findings.push({
      category: 'new-dependency',
      severity: 'info',
      message:
        `${depLines.length} new/changed dependency version(s) in ${file}. ` +
        'Verify these packages are trusted and necessary.',
      file,
      line: depLines[0].line,
    });
  }
}

// 6. PII-related environment variable patterns
const PII_PATTERNS = [
  /PASSWORD/i,
  /SECRET_KEY/i,
  /PRIVATE_KEY/i,
  /API_KEY/i,
  /ACCESS_TOKEN/i,
  /CREDENTIALS/i,
  /AUTH_TOKEN/i,
];

for (const file of workflowFiles) {
  const added = addedByFile.get(file) || [];
  for (const { line, text } of added) {
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(text) && !/secrets\./.test(text)) {
        findings.push({
          category: 'pii-env-var',
          severity: 'warning',
          message: `Environment variable with sensitive name pattern (${pattern.source}) — ensure this isn't hardcoded.`,
          file,
          line,
        });
        break; // one finding per line
      }
    }
  }
}

// 7. Workflow write permissions
for (const file of workflowFiles) {
  const content = readFileSafe(file);
  if (!content) continue;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/:\s*write\b/.test(lines[i]) && /permissions/i.test(lines.slice(Math.max(0, i - 5), i + 1).join('\n'))) {
      // Only flag if this line was added in the diff
      const added = addedByFile.get(file) || [];
      if (added.some((a) => a.line === i + 1)) {
        findings.push({
          category: 'workflow-permissions',
          severity: 'info',
          message: 'Workflow grants write permission — verify this is the minimum required scope.',
          file,
          line: i + 1,
        });
      }
    }
  }
}

// 8. pull_request_target + actions/checkout combination
for (const file of workflowFiles) {
  const content = readFileSafe(file);
  if (!content) continue;
  const hasPRTarget = /pull_request_target/.test(content);
  const hasCheckout = /actions\/checkout/.test(content);
  const checksOutHead =
    /ref:\s*.*pull_request\.head/.test(content) ||
    /ref:\s*.*github\.event\.pull_request\.head\.sha/.test(content);

  if (hasPRTarget && hasCheckout && checksOutHead) {
    findings.push({
      category: 'pr-target-checkout',
      severity: 'warning',
      message:
        'This workflow uses pull_request_target AND checks out the PR head. ' +
        'This grants write token to untrusted code — ensure no scripts from the PR are executed ' +
        'or use sparse-checkout to limit exposure.',
      file,
      line: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const errorCount = findings.filter((f) => f.severity === 'error').length;
const warnCount = findings.filter((f) => f.severity === 'warning').length;
const infoCount = findings.filter((f) => f.severity === 'info').length;

let summary;
if (findings.length === 0) {
  summary = '✅ No security concerns found.';
} else {
  const parts = [];
  if (errorCount) parts.push(`${errorCount} error(s)`);
  if (warnCount) parts.push(`${warnCount} warning(s)`);
  if (infoCount) parts.push(`${infoCount} info`);
  summary = `🔒 Security review: ${parts.join(', ')}.`;
}

const result = { findings, summary };
console.log(JSON.stringify(result, null, 2));
console.log(`\n${summary}`);
