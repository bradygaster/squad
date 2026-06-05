/**
 * Bootstrap Protection Gate — validates that protected bootstrap files
 * use only node:* built-in module imports. No npm or workspace deps allowed.
 *
 * Exit code: 0 = pass, 1 = violations found
 * Output: JSON { pass, violations: [{file, import, line}] }
 *
 * Uses only node:* built-ins (runs in CI before npm install).
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Protected bootstrap files — these MUST have zero non-node:* dependencies.
// ---------------------------------------------------------------------------

const PROTECTED_FILES = [
  'packages/squad-cli/src/cli/core/detect-squad-dir.ts',
  'packages/squad-cli/src/cli/core/errors.ts',
  'packages/squad-cli/src/cli/core/gh-cli.ts',
  'packages/squad-cli/src/cli/core/output.ts',
  'packages/squad-cli/src/cli/core/history-split.ts',
];

const refIndex = process.argv.indexOf('--ref');
const gitRef = refIndex !== -1 ? process.argv[refIndex + 1] : null;

// Node.js built-in modules (with and without node: prefix)
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
  'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
  'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'test', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
  'worker_threads', 'zlib',
]);

/**
 * Check whether an import specifier is a node built-in.
 * Accepts both `node:fs` and `fs` forms, as well as subpaths like `node:fs/promises`.
 */
function isNodeBuiltin(specifier) {
  if (specifier.startsWith('node:')) return true;
  const base = specifier.split('/')[0];
  return NODE_BUILTINS.has(base);
}

/**
 * Check whether an import is a relative path (sibling bootstrap file).
 * Relative imports within the same directory are allowed.
 */
function isRelativeImport(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

// Patterns that capture import/require specifiers in TS/JS
const IMPORT_PATTERNS = [
  // ES import — import ... from 'specifier'
  /(?:^|\s)import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  // Dynamic import — import('specifier')
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require — require('specifier')
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Scan a file for non-node:* imports.
 * @param {string} filePath
 * @returns {{ file: string, import: string, line: number }[]}
 */
function scanFile(filePath) {
  const violations = [];
  let content;
  try {
    if (gitRef) {
      content = execFileSync('git', ['show', `${gitRef}:${filePath}`], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } else {
      content = readFileSync(resolve(filePath), 'utf-8');
    }
  } catch (err) {
    // File might not exist in sparse checkout — skip silently
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Warning: could not read ${filePath}: ${errorMessage}`);
    return violations;
  }

  const lines = content.split('\n');
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track block comment state
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    // Skip single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    for (const pattern of IMPORT_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const specifier = match[1];
        if (!isNodeBuiltin(specifier) && !isRelativeImport(specifier)) {
          violations.push({
            file: filePath,
            import: specifier,
            line: i + 1,
          });
        }
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allViolations = [];
for (const file of PROTECTED_FILES) {
  allViolations.push(...scanFile(file));
}

const result = {
  pass: allViolations.length === 0,
  violations: allViolations,
};

console.log(JSON.stringify(result, null, 2));

if (!result.pass) {
  console.error(
    `\n❌ Bootstrap protection: ${allViolations.length} violation(s) found.`,
  );
  console.error('Protected bootstrap files must only import node:* built-in modules.');
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — imports "${v.import}"`);
  }
  process.exitCode = 1;
} else {
  console.log('\n✅ Bootstrap protection: all protected files use only node:* imports.');
}
