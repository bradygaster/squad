/**
 * .squad/ Leakage Detector — warns if .squad/ files are included in a PR.
 *
 * Feature branches should not typically modify .squad/ files (team config,
 * agent charters, routing). This script detects accidental leakage.
 *
 * Usage: node scripts/check-squad-leakage.mjs [base-ref]
 * Default base-ref: origin/dev
 *
 * Exit code: always 0 (informational only — does not block merge)
 * Output: JSON { leaked: boolean, files: string[] }
 *
 * Uses only node:* built-ins (runs in CI before npm install).
 */

import { execFileSync } from 'node:child_process';

const baseRef = process.argv[2] || 'origin/dev';
const headRef = process.argv[3] || 'HEAD';

let changedFiles = [];
try {
  const output = execFileSync(
    'git',
    ['diff', `${baseRef}...${headRef}`, '--name-only', '--diff-filter=ACMRT', '--', '.squad/'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  changedFiles = output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
} catch (err) {
  // git diff can fail if base ref is missing — treat as no leakage
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`Warning: git diff failed: ${errorMessage}`);
}

const result = {
  leaked: changedFiles.length > 0,
  files: changedFiles,
};

console.log(JSON.stringify(result, null, 2));

if (result.leaked) {
  console.warn(`\n⚠️  Squad file leakage: ${changedFiles.length} .squad/ file(s) modified in this PR:`);
  for (const f of changedFiles) {
    console.warn(`  - ${f}`);
  }
  console.warn(
    '\nThis is usually unintentional. If these changes are deliberate, ensure they are ' +
    'approved by the team lead. .squad/ files affect team routing, agent charters, and decisions.',
  );
} else {
  console.log('\n✅ No .squad/ file leakage detected.');
}
