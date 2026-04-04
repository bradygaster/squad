#!/usr/bin/env node
/**
 * PR Architectural Impact Analysis
 *
 * Usage: node scripts/analyze-impact.mjs <PR_NUMBER>
 *
 * Uses the gh CLI to fetch PR data, then:
 *   1. Maps changed files → modules
 *   2. Calculates a risk tier (LOW / MEDIUM / HIGH / CRITICAL)
 *   3. Writes impact-report.md to cwd
 *   4. Outputs JSON summary to stdout
 *
 * Uses only Node.js built-ins (no npm dependencies).
 * Issue: #733
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseDiffNames, enrichFileStatuses } from './impact-utils/parse-diff.mjs';
import { calculateRisk } from './impact-utils/risk-scorer.mjs';
import { generateReport } from './impact-utils/report-generator.mjs';

// ── Module mapping ────────────────────────────────────────────────────────
// Directory prefix → module name (first match wins).
const MODULE_MAP = [
  ['packages/squad-sdk/', 'squad-sdk'],
  ['packages/squad-cli/', 'squad-cli'],
  ['.squad-templates/', 'templates'],
  ['.github/', 'ci-workflows'],
  ['scripts/', 'scripts'],
  ['.copilot/', 'copilot-config'],
  ['.squad/', 'squad-state'],
  ['test/', 'tests'],
  ['docs/', 'docs'],
];

// Patterns that flag a file as "critical" (config or entry points).
const CRITICAL_PATTERNS = [/package\.json$/, /tsconfig\.json$/, /index\.ts$/];

function mapFileToModule(filePath) {
  for (const [prefix, mod] of MODULE_MAP) {
    if (filePath.startsWith(prefix)) return mod;
  }
  return 'root';
}

function isCriticalFile(filePath) {
  return CRITICAL_PATTERNS.some((p) => p.test(filePath));
}

// ── Main ──────────────────────────────────────────────────────────────────

const prNumberRaw = process.argv[2];
const prNumber = parseInt(prNumberRaw, 10);
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  console.error('Usage: node scripts/analyze-impact.mjs <PR_NUMBER>  (must be a positive integer)');
  process.exit(1);
}

// Resolve repo slug (works in CI via env var, locally via gh).
const repoSlug =
  process.env.GITHUB_REPOSITORY ||
  execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
    encoding: 'utf8',
  }).trim();

// 1. Get changed files with statuses
let files;
try {
  // --paginate can emit multiple JSON arrays; use --jq '.[]' to emit one
  // JSON object per line, then parse each line individually.
  const apiOutput = execSync(
    `gh api repos/${repoSlug}/pulls/${prNumber}/files --paginate --jq '.[]'`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const apiFiles = apiOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  files = enrichFileStatuses(apiFiles);
} catch (err) {
  console.error('API error:', err.message || err);
  // Fallback: name-only diff (no added/deleted distinction)
  console.error('⚠ API file listing unavailable, falling back to gh pr diff --name-only');
  const diffOutput = execSync(`gh pr diff ${prNumber} --name-only`, {
    encoding: 'utf8',
  });
  files = parseDiffNames(diffOutput);
}

// 2. Map files → modules
const modules = {};
for (const filePath of files.all) {
  const mod = mapFileToModule(filePath);
  if (!modules[mod]) modules[mod] = [];
  modules[mod].push(filePath);
}

// 3. Identify critical files
const criticalFiles = files.all.filter((f) => isCriticalFile(f));

// 4. Calculate risk tier
const risk = calculateRisk({
  filesChanged: files.all.length,
  filesDeleted: files.deleted.length,
  modulesTouched: Object.keys(modules).length,
  criticalFiles,
});

// 5. Generate markdown report and write to cwd
const report = generateReport({ prNumber, risk, modules, files, criticalFiles });
writeFileSync('impact-report.md', report, 'utf8');

// 6. Output JSON summary to stdout
const result = {
  prNumber: Number(prNumber),
  risk,
  modules: Object.fromEntries(Object.entries(modules).map(([k, v]) => [k, v.length])),
  filesChanged: files.all.length,
  filesAdded: files.added.length,
  filesModified: files.modified.length,
  filesDeleted: files.deleted.length,
  criticalFiles,
};

console.log(JSON.stringify(result, null, 2));
