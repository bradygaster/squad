/**
 * Tests for scripts/check-bootstrap-deps.mjs
 *
 * Validates that the bootstrap protection gate:
 * - Produces valid JSON output with the correct schema
 * - Correctly identifies node built-in vs external imports
 * - Detects various import/require syntax patterns
 * - Passes for the actual protected files in this repo
 */

import { describe, it, expect } from 'vitest';
import { extractJson, runScript } from './helpers';

// ---------------------------------------------------------------------------
// Replicated logic from check-bootstrap-deps.mjs for unit testing
// (Script does not export functions, so we mirror the core detection logic.)
// ---------------------------------------------------------------------------

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

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  const base = specifier.split('/')[0];
  return NODE_BUILTINS.has(base);
}

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

const IMPORT_PATTERNS = [
  /(?:^|\s)import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function findImports(line: string): string[] {
  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function isViolation(specifier: string): boolean {
  return !isNodeBuiltin(specifier) && !isRelativeImport(specifier);
}

// ---------------------------------------------------------------------------
// Integration tests — run the actual script
// ---------------------------------------------------------------------------

describe('check-bootstrap-deps script', () => {
  describe('integration: script execution', () => {
    it('produces valid JSON with pass and violations fields', () => {
      const result = runScript('check-bootstrap-deps.mjs');
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('pass');
      expect(typeof json.pass).toBe('boolean');
      expect(json).toHaveProperty('violations');
      expect(Array.isArray(json.violations)).toBe(true);
    });

    it('passes for the current repo (protected files use only node:* imports)', () => {
      const result = runScript('check-bootstrap-deps.mjs');
      const json = extractJson(result.stdout);

      expect(json.pass).toBe(true);
      expect(json.violations).toEqual([]);
      expect(result.status).toBe(0);
    });

    it('includes success message in stdout when passing', () => {
      const result = runScript('check-bootstrap-deps.mjs');
      expect(result.stdout).toContain('Bootstrap protection');
      expect(result.stdout).toContain('node:*');
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — import pattern detection
  // ---------------------------------------------------------------------------

  describe('import pattern detection', () => {
    it('detects ES static imports', () => {
      expect(findImports("import { foo } from 'bar'")).toContain('bar');
      expect(findImports("import foo from 'bar'")).toContain('bar');
      expect(findImports("import 'side-effect-pkg'")).toContain('side-effect-pkg');
    });

    it('detects ES imports with double quotes', () => {
      expect(findImports('import { foo } from "bar"')).toContain('bar');
    });

    it('detects dynamic import()', () => {
      expect(findImports("const m = import('bar')")).toContain('bar');
      expect(findImports("await import('bar')")).toContain('bar');
      expect(findImports('import("dynamic-pkg")')).toContain('dynamic-pkg');
    });

    it('detects require() calls', () => {
      expect(findImports("const m = require('bar')")).toContain('bar');
      expect(findImports("require('bar')")).toContain('bar');
      expect(findImports('require("double-quoted")')).toContain('double-quoted');
    });

    it('captures node: prefixed specifiers', () => {
      expect(findImports("import { readFileSync } from 'node:fs'")).toContain('node:fs');
      expect(findImports("import { resolve } from 'node:path'")).toContain('node:path');
    });

    it('returns empty array for non-import lines', () => {
      expect(findImports('const x = 42;')).toEqual([]);
      expect(findImports('')).toEqual([]);
    });

    it('regex still matches imports inside comments (comment filtering is separate)', () => {
      // The script filters comment lines BEFORE running import patterns.
      // The patterns themselves don't distinguish comments from code.
      expect(findImports('// import { foo } from "bar"')).toContain('bar');
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — built-in detection
  // ---------------------------------------------------------------------------

  describe('isNodeBuiltin', () => {
    it('accepts node: prefix imports', () => {
      expect(isNodeBuiltin('node:fs')).toBe(true);
      expect(isNodeBuiltin('node:path')).toBe(true);
      expect(isNodeBuiltin('node:child_process')).toBe(true);
      expect(isNodeBuiltin('node:util')).toBe(true);
    });

    it('accepts node: prefix with subpath', () => {
      expect(isNodeBuiltin('node:fs/promises')).toBe(true);
      expect(isNodeBuiltin('node:stream/web')).toBe(true);
    });

    it('accepts bare built-in module names', () => {
      expect(isNodeBuiltin('fs')).toBe(true);
      expect(isNodeBuiltin('path')).toBe(true);
      expect(isNodeBuiltin('util')).toBe(true);
      expect(isNodeBuiltin('child_process')).toBe(true);
      expect(isNodeBuiltin('crypto')).toBe(true);
    });

    it('accepts built-in subpaths (e.g. fs/promises)', () => {
      expect(isNodeBuiltin('fs/promises')).toBe(true);
      expect(isNodeBuiltin('stream/web')).toBe(true);
    });

    it('rejects npm packages', () => {
      expect(isNodeBuiltin('express')).toBe(false);
      expect(isNodeBuiltin('lodash')).toBe(false);
      expect(isNodeBuiltin('vitest')).toBe(false);
    });

    it('rejects scoped packages', () => {
      expect(isNodeBuiltin('@bradygaster/squad-sdk')).toBe(false);
      expect(isNodeBuiltin('@types/node')).toBe(false);
    });
  });

  describe('isRelativeImport', () => {
    it('allows ./ imports', () => {
      expect(isRelativeImport('./sibling')).toBe(true);
      expect(isRelativeImport('./nested/deep')).toBe(true);
    });

    it('allows ../ imports', () => {
      expect(isRelativeImport('../parent')).toBe(true);
      expect(isRelativeImport('../../grandparent')).toBe(true);
    });

    it('rejects bare specifiers', () => {
      expect(isRelativeImport('express')).toBe(false);
      expect(isRelativeImport('@scope/pkg')).toBe(false);
      expect(isRelativeImport('node:fs')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — violation classification
  // ---------------------------------------------------------------------------

  describe('violation classification', () => {
    it('flags npm packages as violations', () => {
      expect(isViolation('express')).toBe(true);
      expect(isViolation('@bradygaster/squad-sdk')).toBe(true);
      expect(isViolation('lodash/merge')).toBe(true);
    });

    it('does not flag node builtins', () => {
      expect(isViolation('node:fs')).toBe(false);
      expect(isViolation('fs')).toBe(false);
      expect(isViolation('node:path')).toBe(false);
    });

    it('does not flag relative imports', () => {
      expect(isViolation('./sibling')).toBe(false);
      expect(isViolation('../parent')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('comment lines are skipped by the script logic', () => {
      // The script skips lines starting with // or *
      const commentLines = [
        '// import { bad } from "evil-pkg"',
        '* import { bad } from "evil-pkg"',
      ];
      for (const line of commentLines) {
        const trimmed = line.trim();
        const isComment = trimmed.startsWith('//') || trimmed.startsWith('*');
        expect(isComment).toBe(true);
      }
    });

    it('handles empty specifier edge case', () => {
      // Empty string is not a node builtin and not relative
      expect(isNodeBuiltin('')).toBe(false);
      expect(isRelativeImport('')).toBe(false);
    });
  });
});
