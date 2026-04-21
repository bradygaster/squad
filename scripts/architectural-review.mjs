/**
 * Architectural Review Check — detects structural concerns in PRs.
 *
 * Checks for:
 * - Bootstrap area modifications (packages/squad-cli/src/cli/core/)
 * - New/modified exports in package entry points
 * - Cross-package import violations (CLI ↔ SDK direct paths)
 * - Template file sync (changes in one template dir without others)
 * - Sweeping refactors (>20 files changed)
 * - File deletions (potential breakage)
 *
 * Usage: node scripts/architectural-review.mjs [base-ref]
 * Default base-ref: origin/dev
 *
 * Exit code: always 0 (informational)
 * Output: JSON { findings: [{category, severity, message, files}], summary }
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

function gitDiffNames(filter) {
  try {
    const args = ['diff', `${baseRef}...${headRef}`, '--name-only'];
    if (filter) args.push(`--diff-filter=${filter}`);
    const output = execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function gitDiffContent() {
  try {
    return execFileSync('git', ['diff', `${baseRef}...${headRef}`, '-U3'], {
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

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const findings = [];

const allChanged = gitDiffNames('ACMRT');
const deletedFiles = gitDiffNames('D');
const diff = gitDiffContent();

// 1. Bootstrap area modifications
const bootstrapFiles = allChanged.filter((f) =>
  f.startsWith('packages/squad-cli/src/cli/core/'),
);
if (bootstrapFiles.length > 0) {
  findings.push({
    category: 'bootstrap-area',
    severity: 'warning',
    message:
      `${bootstrapFiles.length} file(s) in the bootstrap area (packages/squad-cli/src/cli/core/) were modified. ` +
      'These files must maintain zero external dependencies. Review carefully.',
    files: bootstrapFiles,
  });
}

// 2. Entry point export changes
const entryPoints = [
  'packages/squad-sdk/src/index.ts',
  'packages/squad-cli/src/index.ts',
];
const changedEntryPoints = allChanged.filter((f) => entryPoints.includes(f));
if (changedEntryPoints.length > 0) {
  // Check for added export lines in the diff
  const exportLines = diff
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('+') &&
        !line.startsWith('+++') &&
        /\bexport\b/.test(line),
    );
  if (exportLines.length > 0) {
    findings.push({
      category: 'export-surface',
      severity: 'warning',
      message:
        `Package entry point(s) modified with ${exportLines.length} new/changed export(s). ` +
        'New public API surface requires careful review for backward compatibility.',
      files: changedEntryPoints,
    });
  }
}

// 3. Cross-package imports
const cliFiles = allChanged.filter((f) =>
  f.startsWith('packages/squad-cli/'),
);
const sdkFiles = allChanged.filter((f) =>
  f.startsWith('packages/squad-sdk/'),
);

const crossImportViolations = [];
for (const file of cliFiles) {
  const content = readFileSafe(file);
  if (!content) continue;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (
      /from\s+['"].*squad-sdk\/src\//.test(lines[i]) ||
      /require\(['"].*squad-sdk\/src\//.test(lines[i])
    ) {
      crossImportViolations.push({ file, line: i + 1, direction: 'CLI → SDK src' });
    }
  }
}
for (const file of sdkFiles) {
  const content = readFileSafe(file);
  if (!content) continue;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (
      /from\s+['"].*squad-cli\/src\//.test(lines[i]) ||
      /require\(['"].*squad-cli\/src\//.test(lines[i])
    ) {
      crossImportViolations.push({ file, line: i + 1, direction: 'SDK → CLI src' });
    }
  }
}
if (crossImportViolations.length > 0) {
  findings.push({
    category: 'cross-package-import',
    severity: 'error',
    message:
      `${crossImportViolations.length} cross-package import(s) detected. ` +
      'Packages should import via the published package name, not direct src/ paths.',
    files: crossImportViolations.map(
      (v) => `${v.file}:${v.line} (${v.direction})`,
    ),
  });
}

// 4. Template sync check
const TEMPLATE_DIRS = [
  'templates/',
  '.squad-templates/',
  'packages/squad-cli/templates/',
  '.github/workflows/',
];
const touchedTemplateDirs = TEMPLATE_DIRS.filter((dir) =>
  allChanged.some((f) => f.startsWith(dir)),
);
if (touchedTemplateDirs.length === 1) {
  const untouched = TEMPLATE_DIRS.filter((d) => !touchedTemplateDirs.includes(d));
  findings.push({
    category: 'template-sync',
    severity: 'info',
    message:
      `Template files changed in ${touchedTemplateDirs[0]} but not in other template locations. ` +
      'If these templates should stay in sync, consider updating the others too.',
    files: [
      `Changed: ${touchedTemplateDirs.join(', ')}`,
      `Unchanged: ${untouched.join(', ')}`,
    ],
  });
}

// 5. Sweeping refactor signal
const totalChanged = allChanged.length + deletedFiles.length;
if (totalChanged > 20) {
  findings.push({
    category: 'sweeping-refactor',
    severity: 'warning',
    message:
      `This PR touches ${totalChanged} files (${allChanged.length} modified/added, ${deletedFiles.length} deleted). ` +
      'Large PRs are harder to review — consider splitting if possible.',
    files: [],
  });
}

// 6. File deletions
if (deletedFiles.length > 0) {
  const publicDeletions = deletedFiles.filter(
    (f) =>
      f.startsWith('packages/') &&
      (f.endsWith('/index.ts') || f.includes('/src/')),
  );
  if (publicDeletions.length > 0) {
    findings.push({
      category: 'file-deletion',
      severity: 'warning',
      message:
        `${publicDeletions.length} source file(s) deleted from packages/. ` +
        'Verify no public API or imports are broken.',
      files: publicDeletions,
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
  summary = '✅ No architectural concerns found.';
} else {
  const parts = [];
  if (errorCount) parts.push(`${errorCount} error(s)`);
  if (warnCount) parts.push(`${warnCount} warning(s)`);
  if (infoCount) parts.push(`${infoCount} info`);
  summary = `⚠️ Architectural review: ${parts.join(', ')}.`;
}

const result = { findings, summary };
console.log(JSON.stringify(result, null, 2));
console.log(`\n${summary}`);
