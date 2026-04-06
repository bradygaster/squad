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
import { fileURLToPath } from 'node:url';

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
// Skill security scanning — Phase 1 (PRD #881)
// ---------------------------------------------------------------------------

const SKILL_CREDENTIAL_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub PAT', regex: /ghp_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub OAuth', regex: /gho_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub App Token', regex: /ghu_[A-Za-z0-9]{36,}/ },
  { name: 'OpenAI Key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'Private Key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { name: 'npm Token', regex: /npm_[A-Za-z0-9]{36,}/ },
  { name: 'Slack Token', regex: /xox[bpors]-[A-Za-z0-9-]+/ },
  { name: 'Generic Secret Assign', regex: /(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*["']?[A-Za-z0-9+/=_-]{20,}/ },
];

const SKILL_DOWNLOAD_EXEC_PATTERNS = [
  { name: 'curl pipe bash', regex: /curl\s+.*\|\s*(?:bash|sh|zsh)/ },
  { name: 'wget pipe bash', regex: /wget\s+.*\|\s*(?:bash|sh|zsh)/ },
  { name: 'irm pipe iex', regex: /irm\s+.*\|\s*iex/ },
  { name: 'Invoke-Expression', regex: /Invoke-Expression\s+.*(?:http|ftp|Invoke-WebRequest|irm)/ },
  { name: 'powershell -enc', regex: /powershell\s+.*-[Ee]nc(?:oded)?[Cc]ommand/ },
  { name: 'eval curl', regex: /eval\s+"\$\(curl/ },
  { name: 'source curl', regex: /source\s+<\(curl/ },
  { name: 'bash process sub', regex: /bash\s+<\(curl/ },
];

const SKILL_CRED_FILE_READ_PATTERNS = [
  { name: '.env read (cmd)', regex: /(?:cat|type|Get-Content|less|more|head|tail)\s+.*\.env(?!\.example|\.sample|\.template)\b/ },
  { name: '.env read (js)', regex: /(?:readFileSync|readFile)\s*\(.*\.env(?!\.example|\.sample|\.template)\b/ },
  { name: 'Private key read (cmd)', regex: /(?:cat|type|Get-Content)\s+.*(?:id_rsa|id_ed25519|\.pem|\.key)\b/ },
  { name: 'Private key read (js)', regex: /(?:readFileSync|readFile)\s*\(.*(?:id_rsa|id_ed25519|\.pem|\.key)\b/ },
  { name: 'AWS credentials read', regex: /(?:cat|type|readFileSync|Get-Content)\s*[\s(].*\.aws\/credentials/ },
  { name: '.npmrc read', regex: /(?:cat|type|readFileSync|Get-Content)\s*[\s(].*\.npmrc/ },
  { name: '.netrc read', regex: /(?:cat|type|readFileSync|Get-Content)\s*[\s(].*\.netrc/ },
];

const SKILL_PRIV_ESC_PATTERNS = [
  { name: 'sudo bash/sh', regex: /sudo\s+(?:bash|sh|zsh|su)/ },
  { name: 'sudo rm', regex: /sudo\s+rm\b/ },
  { name: 'RunAs admin', regex: /Start-Process\s+.*-Verb\s+RunAs/ },
  { name: 'SetExecutionPolicy', regex: /Set-ExecutionPolicy\s+(?:Bypass|Unrestricted)/ },
  { name: 'chmod 777', regex: /chmod\s+777/ },
];

const PLACEHOLDER_RE = /\.{2,}|x{4,}|X{4,}|_{4,}|<[^>]+>/;

/** Regex syntax markers — character classes [..] or quantifiers {n,m}. */
const REGEX_SYNTAX_RE = /\[[^\]]+\]|\{\d+[,\d]*\}/;

/**
 * Check whether a line is a markdown table row documenting regex patterns.
 * Used to suppress credential findings on pattern-documentation tables.
 */
function isRegexDocRow(line) {
  return /^\s*\|/.test(line) && REGEX_SYNTAX_RE.test(line);
}

/**
 * Detect fenced code block regions in markdown.
 * Handles backtick and tilde fences, variable-length delimiters,
 * and up to 3 leading spaces per CommonMark.
 */
function parseFencedRegions(lines) {
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  const fenced = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const m = line.match(/^\s{0,3}((`{3,})|(~{3,}))/);
      if (m) {
        inFence = true;
        fenceChar = m[2] ? '`' : '~';
        fenceLen = (m[2] || m[3]).length;
        fenced.add(i);
      }
    } else {
      fenced.add(i);
      const closeRe = new RegExp(
        `^\\s{0,3}${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`,
      );
      if (closeRe.test(line)) {
        inFence = false;
      }
    }
  }
  return { fenced, unclosed: inFence };
}

/** Remove inline code spans (backtick-delimited) from a line. */
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, '');
}

/** Check whether a regex match looks like a placeholder token. */
function isPlaceholder(matched) {
  return PLACEHOLDER_RE.test(matched);
}

/**
 * Scan skill markdown content for high-confidence security patterns.
 * Pure function — no side effects, no git calls.
 *
 * Suppression (Phase 1):
 *  - Lines inside fenced code blocks are skipped.
 *  - Inline code spans (backtick pairs) are stripped before matching.
 *  - Markdown table rows documenting regex patterns are suppressed for credentials.
 *  - Placeholder tokens (sk-..., ghp_xxxx, AKIA...) are ignored.
 *  - Fail-safe: unclosed fences = UNSUPPRESSED (fail-open for security).
 *
 * @param {string} content  Full markdown file content
 * @param {string} filePath Repo-relative file path (for findings)
 * @returns {Array<{category:string, severity:string, message:string, file:string, line:number}>}
 */
export function scanSkillContent(content, filePath) {
  const findings = [];
  const lines = content.split('\n');
  const { fenced, unclosed } = parseFencedRegions(lines);
  const suppressFenced = !unclosed;

  for (let i = 0; i < lines.length; i++) {
    if (suppressFenced && fenced.has(i)) continue;

    const scanText = stripInlineCode(lines[i]);
    const regexDocRow = isRegexDocRow(lines[i]);

    // P1: Embedded credentials (suppress on regex-doc table rows)
    if (!regexDocRow) {
      for (const { name, regex } of SKILL_CREDENTIAL_PATTERNS) {
        const m = scanText.match(regex);
        if (m && !isPlaceholder(m[0])) {
          findings.push({
            category: 'skill-credentials',
            severity: 'error',
            message: `Possible embedded credential (${name}) in skill file.`,
            file: filePath,
            line: i + 1,
          });
        }
      }
    }

    // P2: Credential file reads
    for (const { name, regex } of SKILL_CRED_FILE_READ_PATTERNS) {
      if (regex.test(scanText)) {
        findings.push({
          category: 'skill-credential-file-read',
          severity: 'error',
          message: `Credential file read instruction (${name}) in skill file.`,
          file: filePath,
          line: i + 1,
        });
      }
    }

    for (const { name, regex } of SKILL_DOWNLOAD_EXEC_PATTERNS) {
      if (regex.test(scanText)) {
        findings.push({
          category: 'skill-download-exec',
          severity: 'error',
          message: `Download-and-execute pattern (${name}) in skill file.`,
          file: filePath,
          line: i + 1,
        });
      }
    }

    for (const { name, regex } of SKILL_PRIV_ESC_PATTERNS) {
      if (regex.test(scanText)) {
        findings.push({
          category: 'skill-privilege-escalation',
          severity: 'error',
          message: `Privilege escalation pattern (${name}) in skill file.`,
          file: filePath,
          line: i + 1,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Security checks
// ---------------------------------------------------------------------------

function run() {
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
  if (file.startsWith('.squad/skills/') && file.endsWith('.md')) continue;
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

// 9. Skill security scanning (Phase 1 — PRD #881)
const skillFiles = changedFiles.filter((f) =>
  (f.startsWith('.copilot/skills/') || f.startsWith('.squad/skills/')) && f.endsWith('.md'),
);
for (const file of skillFiles) {
  const content = readFileSafe(file);
  if (!content) continue;
  findings.push(...scanSkillContent(content, file));
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
}

// Only run when executed directly (not imported for testing)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  run();
}
