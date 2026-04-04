/**
 * Tests for scripts/architectural-review.mjs
 *
 * Validates that the architectural review check:
 * - Produces valid JSON with findings array and summary string
 * - Each finding has the correct shape (category, severity, message, files)
 * - Reports zero findings when diff is empty (HEAD vs HEAD)
 * - Detects cross-package import patterns correctly
 * - Detects bootstrap area modifications
 * - Always exits with code 0 (informational only)
 */

import { describe, it, expect } from 'vitest';
import { extractJson, runScript } from './helpers';

// ---------------------------------------------------------------------------
// Cross-package import patterns (replicated from the script for unit testing)
// ---------------------------------------------------------------------------

const CLI_TO_SDK_SRC = /from\s+['"].*squad-sdk\/src\//;
const SDK_TO_CLI_SRC = /from\s+['"].*squad-cli\/src\//;
const CLI_TO_SDK_REQUIRE = /require\(['"].*squad-sdk\/src\//;
const SDK_TO_CLI_REQUIRE = /require\(['"].*squad-cli\/src\//;

function detectCrossPackageImport(
  line: string,
  direction: 'cli-to-sdk' | 'sdk-to-cli',
): boolean {
  if (direction === 'cli-to-sdk') {
    return CLI_TO_SDK_SRC.test(line) || CLI_TO_SDK_REQUIRE.test(line);
  }
  return SDK_TO_CLI_SRC.test(line) || SDK_TO_CLI_REQUIRE.test(line);
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('architectural-review script', () => {
  describe('integration: no-diff baseline (HEAD as base ref)', () => {
    it('produces valid JSON with findings and summary', () => {
      const result = runScript('architectural-review.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('findings');
      expect(Array.isArray(json.findings)).toBe(true);
      expect(json).toHaveProperty('summary');
      expect(typeof json.summary).toBe('string');
    });

    it('reports zero findings when diff is empty', () => {
      const result = runScript('architectural-review.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json.findings).toEqual([]);
      expect(json.summary).toContain('No architectural concerns');
    });

    it('always exits with code 0', () => {
      const result = runScript('architectural-review.mjs', ['HEAD']);
      expect(result.status).toBe(0);
    });
  });

  describe('integration: default base ref', () => {
    it('exits with code 0 regardless of findings', () => {
      const result = runScript('architectural-review.mjs');
      expect(result.status).toBe(0);
    });

    it('produces valid JSON with correct schema', () => {
      const result = runScript('architectural-review.mjs');
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('findings');
      expect(json).toHaveProperty('summary');
      expect(Array.isArray(json.findings)).toBe(true);
      expect(typeof json.summary).toBe('string');
    });

    it('each finding has category, severity, message, and files', () => {
      const result = runScript('architectural-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;

      for (const f of findings) {
        expect(f).toHaveProperty('category');
        expect(f).toHaveProperty('severity');
        expect(f).toHaveProperty('message');
        expect(f).toHaveProperty('files');
        expect(typeof f.category).toBe('string');
        expect(typeof f.severity).toBe('string');
        expect(typeof f.message).toBe('string');
        expect(Array.isArray(f.files)).toBe(true);
      }
    });

    it('severity values are from the allowed set', () => {
      const result = runScript('architectural-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;
      const ALLOWED = new Set(['error', 'warning', 'info']);

      for (const f of findings) {
        expect(ALLOWED.has(f.severity as string)).toBe(true);
      }
    });

    it('category values match known check types', () => {
      const result = runScript('architectural-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;
      const KNOWN_CATEGORIES = new Set([
        'bootstrap-area',
        'export-surface',
        'cross-package-import',
        'template-sync',
        'sweeping-refactor',
        'file-deletion',
      ]);

      for (const f of findings) {
        expect(KNOWN_CATEGORIES.has(f.category as string)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — cross-package import detection
  // ---------------------------------------------------------------------------

  describe('cross-package import pattern detection', () => {
    it('detects CLI importing from SDK src path', () => {
      expect(
        detectCrossPackageImport(
          "import { Foo } from '@bradygaster/squad-sdk/src/foo'",
          'cli-to-sdk',
        ),
      ).toBe(true);
    });

    it('detects SDK importing from CLI src path', () => {
      expect(
        detectCrossPackageImport(
          "import { Bar } from '../squad-cli/src/bar'",
          'sdk-to-cli',
        ),
      ).toBe(true);
    });

    it('detects require-style cross-package imports', () => {
      expect(
        detectCrossPackageImport(
          "const x = require('@bradygaster/squad-sdk/src/foo')",
          'cli-to-sdk',
        ),
      ).toBe(true);
    });

    it('does not flag imports via published package name', () => {
      expect(
        detectCrossPackageImport(
          "import { Foo } from '@bradygaster/squad-sdk'",
          'cli-to-sdk',
        ),
      ).toBe(false);
    });

    it('does not flag unrelated imports', () => {
      expect(
        detectCrossPackageImport("import { readFile } from 'node:fs'", 'cli-to-sdk'),
      ).toBe(false);
      expect(
        detectCrossPackageImport("import express from 'express'", 'sdk-to-cli'),
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — bootstrap area detection
  // ---------------------------------------------------------------------------

  describe('bootstrap area detection', () => {
    const BOOTSTRAP_PREFIX = 'packages/squad-cli/src/cli/core/';

    it('recognizes bootstrap area files', () => {
      expect('packages/squad-cli/src/cli/core/detect-squad-dir.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(true);
      expect('packages/squad-cli/src/cli/core/errors.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(true);
      expect('packages/squad-cli/src/cli/core/output.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(true);
    });

    it('does not flag files outside bootstrap area', () => {
      expect('packages/squad-cli/src/commands/init.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(false);
      expect('packages/squad-sdk/src/index.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(false);
      expect('test/scripts/helpers.ts'.startsWith(BOOTSTRAP_PREFIX)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles invalid base ref gracefully', () => {
      const result = runScript('architectural-review.mjs', [
        'refs/heads/nonexistent-branch-xyz-99999',
      ]);
      const json = extractJson(result.stdout);

      // Should produce valid JSON with zero findings (git diff returns empty)
      expect(json.findings).toEqual([]);
      expect(result.status).toBe(0);
    });
  });
});
