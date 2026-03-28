/**
 * Publish Policy Lint Test (#557)
 *
 * Validates that all npm publish commands in workflow files are
 * workspace-scoped (-w or --workspace). Bare npm publish would
 * publish the root package.json — a critical incident vector.
 *
 * Also tests the grep logic itself with known good/bad inputs.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core lint function (mirrors CI shell logic) ────────────────────────

/**
 * Returns true if the line contains a workspace-scoped npm publish
 * or is not a publish command at all. Returns false for bare publishes.
 */
function isCompliant(line: string): boolean {
  const trimmed = line.trim();
  // Skip comment lines
  if (trimmed.startsWith('#')) return true;
  // If no npm publish pattern, line is fine
  if (!/npm.*publish/.test(trimmed)) return true;
  // Skip meta-references: echo output, grep patterns, YAML name keys
  if (/echo\s/.test(trimmed)) return true;
  if (/grep\s/.test(trimmed)) return true;
  if (/^\s*-?\s*name:/.test(line)) return true;
  // Must have -w or --workspace flag
  return /\s-w[\s]/.test(trimmed) || /\s-w$/.test(trimmed) || /\s--workspace[\s]/.test(trimmed) || /\s--workspace$/.test(trimmed);
}

/**
 * Scans a YAML file's lines and returns violations (bare npm publish).
 */
function findViolations(content: string): { line: number; text: string }[] {
  const violations: { line: number; text: string }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!isCompliant(lines[i])) {
      violations.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return violations;
}

// ─── Unit tests for the lint logic ──────────────────────────────────────

describe('publish-policy lint logic', () => {
  describe('should PASS (workspace-scoped)', () => {
    const goodLines = [
      'npm -w packages/squad-sdk publish --access public --provenance',
      'npm -w packages/squad-cli publish --tag insider --access public',
      'run: npm -w packages/squad-sdk publish --access public --provenance',
      'run: npm -w packages/squad-cli publish --tag insider --access public',
      'npm --workspace packages/squad-sdk publish --access public',
      'npm --workspace packages/squad-cli publish --tag insider',
    ];

    for (const line of goodLines) {
      it(`allows: ${line}`, () => {
        expect(isCompliant(line)).toBe(true);
      });
    }
  });

  describe('should FAIL (bare publish)', () => {
    const badLines = [
      'npm publish',
      'npm publish --access public',
      'run: npm publish --tag insider',
      'run: npm publish --access public --provenance',
      'npm publish --tag insider --access public',
    ];

    for (const line of badLines) {
      it(`rejects: ${line}`, () => {
        expect(isCompliant(line)).toBe(false);
      });
    }
  });

  describe('should skip non-publish and comment lines', () => {
    const neutralLines = [
      '# npm publish --access public',
      '  # run: npm publish',
      'npm install',
      'npm test',
      'echo "npm publish is dangerous"',
      'npm ci',
      '      - name: Enforce workspace-scoped npm publish',
      'BARE=$(grep -n \'npm.*publish\' "$wf" || true)',
    ];

    for (const line of neutralLines) {
      it(`ignores: ${line}`, () => {
        expect(isCompliant(line)).toBe(true);
      });
    }
  });

  it('findViolations returns correct line numbers', () => {
    const content = [
      'name: test',
      '# npm publish bare in comment',
      'run: npm -w packages/sdk publish --access public',
      'run: npm publish --access public',
      'run: npm publish',
    ].join('\n');

    const violations = findViolations(content);
    expect(violations).toHaveLength(2);
    expect(violations[0].line).toBe(4);
    expect(violations[0].text).toBe('run: npm publish --access public');
    expect(violations[1].line).toBe(5);
    expect(violations[1].text).toBe('run: npm publish');
  });
});

// ─── Live workflow file validation ──────────────────────────────────────

describe('publish-policy: live workflow files', () => {
  const workflowDir = join(process.cwd(), '.github', 'workflows');
  const workflowFiles = readdirSync(workflowDir).filter(f => f.endsWith('.yml'));

  it('workflow directory has files to check', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  for (const file of workflowFiles) {
    it(`${file} — no bare npm publish`, () => {
      const content = readFileSync(join(workflowDir, file), 'utf-8');
      const violations = findViolations(content);
      if (violations.length > 0) {
        const details = violations
          .map(v => `  line ${v.line}: ${v.text}`)
          .join('\n');
        expect.fail(
          `Bare npm publish found in ${file} (missing -w/--workspace):\n${details}`,
        );
      }
    });
  }
});
