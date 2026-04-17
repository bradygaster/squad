/**
 * Tests for scripts/security-review.mjs
 *
 * Validates that the security review check:
 * - Produces valid JSON with findings array and summary string
 * - Each finding has the correct shape (category, severity, message, file, line)
 * - Reports zero findings when diff is empty (HEAD vs HEAD)
 * - Correctly parses unified diff patches (parseAddedLines logic)
 * - Detects eval(), command injection, unsafe git ops, secrets, PII patterns
 * - Always exits with code 0 (informational only)
 */

import { describe, it, expect } from 'vitest';
import { extractJson, runScript } from './helpers';

// ---------------------------------------------------------------------------
// Replicated parseAddedLines from security-review.mjs for unit testing
// ---------------------------------------------------------------------------

interface AddedLine {
  line: number;
  text: string;
}

function parseAddedLines(patch: string): Map<string, AddedLine[]> {
  const result = new Map<string, AddedLine[]>();
  let currentFile: string | null = null;
  let hunkLine = 0;

  for (const rawLine of patch.split('\n')) {
    const fileMatch = rawLine.match(/^\+\+\+ b\/(.+)/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      hunkLine = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++') && currentFile) {
      result.get(currentFile)!.push({ line: hunkLine, text: rawLine.slice(1) });
      hunkLine++;
    } else if (!rawLine.startsWith('-')) {
      hunkLine++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Replicated security patterns from the script
// ---------------------------------------------------------------------------

const EVAL_PATTERN = /\beval\s*\(/;
const EXEC_TEMPLATE = /exec\s*\(\s*`/;
const EXEC_INTERPOLATION = /exec\s*\(\s*['"].*\$\{/;

const GIT_UNSAFE_PATTERNS = [
  { pattern: /git\s+add\s+\./, label: 'git add .' },
  { pattern: /git\s+add\s+-A/, label: 'git add -A' },
  { pattern: /git\s+commit\s+-a/, label: 'git commit -a' },
  { pattern: /git\s+push\s+--force/, label: 'git push --force' },
  { pattern: /--force-with-lease/, label: 'git push --force-with-lease' },
];

const SECRETS_PATTERN = /secrets\./;
const SECRETS_GITHUB_TOKEN = /secrets\.GITHUB_TOKEN/;

const PII_PATTERNS = [
  /PASSWORD/i,
  /SECRET_KEY/i,
  /PRIVATE_KEY/i,
  /API_KEY/i,
  /ACCESS_TOKEN/i,
  /CREDENTIALS/i,
  /AUTH_TOKEN/i,
];

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('security-review script', () => {
  describe('integration: no-diff baseline (HEAD as base ref)', () => {
    it('produces valid JSON with findings and summary', () => {
      const result = runScript('security-review.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('findings');
      expect(Array.isArray(json.findings)).toBe(true);
      expect(json).toHaveProperty('summary');
      expect(typeof json.summary).toBe('string');
    });

    it('reports zero findings when diff is empty', () => {
      const result = runScript('security-review.mjs', ['HEAD']);
      const json = extractJson(result.stdout);

      expect(json.findings).toEqual([]);
      expect(json.summary).toContain('No security concerns');
    });

    it('always exits with code 0', () => {
      const result = runScript('security-review.mjs', ['HEAD']);
      expect(result.status).toBe(0);
    });
  });

  describe('integration: default base ref', () => {
    it('exits with code 0 regardless of findings', () => {
      const result = runScript('security-review.mjs');
      expect(result.status).toBe(0);
    });

    it('produces valid JSON with correct schema', () => {
      const result = runScript('security-review.mjs');
      const json = extractJson(result.stdout);

      expect(json).toHaveProperty('findings');
      expect(json).toHaveProperty('summary');
      expect(Array.isArray(json.findings)).toBe(true);
    });

    it('each finding has category, severity, message, file, and line', () => {
      const result = runScript('security-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;

      for (const f of findings) {
        expect(f).toHaveProperty('category');
        expect(f).toHaveProperty('severity');
        expect(f).toHaveProperty('message');
        expect(f).toHaveProperty('file');
        expect(f).toHaveProperty('line');
        expect(typeof f.category).toBe('string');
        expect(typeof f.severity).toBe('string');
        expect(typeof f.message).toBe('string');
        expect(typeof f.file).toBe('string');
        expect(typeof f.line).toBe('number');
      }
    });

    it('severity values are from the allowed set', () => {
      const result = runScript('security-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;
      const ALLOWED = new Set(['error', 'warning', 'info']);

      for (const f of findings) {
        expect(ALLOWED.has(f.severity as string)).toBe(true);
      }
    });

    it('category values match known check types', () => {
      const result = runScript('security-review.mjs');
      const json = extractJson(result.stdout);
      const findings = json.findings as Array<Record<string, unknown>>;
      const KNOWN_CATEGORIES = new Set([
        'secrets-reference',
        'eval-usage',
        'command-injection',
        'unsafe-git',
        'new-dependency',
        'pii-env-var',
        'workflow-permissions',
        'pr-target-checkout',
        'skill-credentials',
        'skill-credential-file-read',
        'skill-download-exec',
        'skill-privilege-escalation',
      ]);

      for (const f of findings) {
        expect(KNOWN_CATEGORIES.has(f.category as string)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — parseAddedLines
  // ---------------------------------------------------------------------------

  describe('parseAddedLines', () => {
    it('parses a simple single-file patch', () => {
      const patch = [
        'diff --git a/file.ts b/file.ts',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,3 +1,4 @@',
        ' const a = 1;',
        '+const b = 2;',
        ' const c = 3;',
      ].join('\n');

      const result = parseAddedLines(patch);
      expect(result.has('file.ts')).toBe(true);
      const lines = result.get('file.ts')!;
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('const b = 2;');
      expect(lines[0].line).toBe(2);
    });

    it('parses multiple files in a single patch', () => {
      const patch = [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,2 +1,3 @@',
        ' line1',
        '+added-a',
        ' line2',
        'diff --git a/b.ts b/b.ts',
        '--- a/b.ts',
        '+++ b/b.ts',
        '@@ -5,2 +5,3 @@',
        ' old-line',
        '+added-b',
        ' next-line',
      ].join('\n');

      const result = parseAddedLines(patch);
      expect(result.has('a.ts')).toBe(true);
      expect(result.has('b.ts')).toBe(true);
      expect(result.get('a.ts')![0].text).toBe('added-a');
      expect(result.get('a.ts')![0].line).toBe(2);
      expect(result.get('b.ts')![0].text).toBe('added-b');
      expect(result.get('b.ts')![0].line).toBe(6);
    });

    it('handles multiple hunks in one file', () => {
      const patch = [
        '+++ b/file.ts',
        '@@ -1,3 +1,4 @@',
        ' line1',
        '+hunk1-add',
        ' line3',
        '@@ -10,2 +11,3 @@',
        ' line10',
        '+hunk2-add',
        ' line12',
      ].join('\n');

      const result = parseAddedLines(patch);
      const lines = result.get('file.ts')!;
      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual({ line: 2, text: 'hunk1-add' });
      expect(lines[1]).toEqual({ line: 12, text: 'hunk2-add' });
    });

    it('handles empty patch', () => {
      const result = parseAddedLines('');
      expect(result.size).toBe(0);
    });

    it('ignores removed lines (lines starting with -)', () => {
      const patch = [
        '+++ b/file.ts',
        '@@ -1,3 +1,3 @@',
        ' context',
        '-removed',
        '+added',
        ' context2',
      ].join('\n');

      const result = parseAddedLines(patch);
      const lines = result.get('file.ts')!;
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe('added');
    });

    it('strips the leading + from added line text', () => {
      const patch = [
        '+++ b/file.ts',
        '@@ -1,1 +1,2 @@',
        ' existing',
        '+  indented code',
      ].join('\n');

      const result = parseAddedLines(patch);
      expect(result.get('file.ts')![0].text).toBe('  indented code');
    });
  });

  // ---------------------------------------------------------------------------
  // Unit tests — security pattern detection
  // ---------------------------------------------------------------------------

  describe('eval() detection', () => {
    it('detects eval with parentheses', () => {
      expect(EVAL_PATTERN.test('const x = eval("code")')).toBe(true);
      expect(EVAL_PATTERN.test('eval(userInput)')).toBe(true);
      expect(EVAL_PATTERN.test('  eval (')).toBe(true);
    });

    it('does not false-positive on similar function names', () => {
      expect(EVAL_PATTERN.test('evaluate(x)')).toBe(false);
      expect(EVAL_PATTERN.test('myeval(x)')).toBe(false);
    });

    it('does not match eval in comments or strings when not called', () => {
      expect(EVAL_PATTERN.test('// eval is bad')).toBe(false);
      expect(EVAL_PATTERN.test('const name = "eval"')).toBe(false);
    });
  });

  describe('command injection detection', () => {
    it('detects exec with template literal', () => {
      expect(EXEC_TEMPLATE.test('exec(`ls ${dir}`)')).toBe(true);
      expect(EXEC_TEMPLATE.test("child_process.exec(`cmd`)")).toBe(true);
    });

    it('detects exec with string interpolation', () => {
      expect(EXEC_INTERPOLATION.test('exec("ls ${dir}")')).toBe(true);
    });

    it('does not flag execFile with array args', () => {
      expect(EXEC_TEMPLATE.test("execFile('ls', ['-la'])")).toBe(false);
      expect(EXEC_INTERPOLATION.test("execFile('ls', ['-la'])")).toBe(false);
    });
  });

  describe('unsafe git operation detection', () => {
    it('detects git add .', () => {
      expect(GIT_UNSAFE_PATTERNS[0].pattern.test('git add .')).toBe(true);
      expect(GIT_UNSAFE_PATTERNS[0].pattern.test('  git add . && git commit')).toBe(true);
    });

    it('detects git add -A', () => {
      expect(GIT_UNSAFE_PATTERNS[1].pattern.test('git add -A')).toBe(true);
    });

    it('detects git commit -a', () => {
      expect(GIT_UNSAFE_PATTERNS[2].pattern.test('git commit -a -m "msg"')).toBe(true);
    });

    it('detects git push --force', () => {
      expect(GIT_UNSAFE_PATTERNS[3].pattern.test('git push --force origin main')).toBe(true);
    });

    it('detects --force-with-lease', () => {
      expect(GIT_UNSAFE_PATTERNS[4].pattern.test('git push --force-with-lease')).toBe(true);
    });

    it('does not flag safe git operations', () => {
      const safe = 'git add path/to/specific-file.ts';
      for (const { pattern } of GIT_UNSAFE_PATTERNS) {
        expect(pattern.test(safe)).toBe(false);
      }
    });

    it('does not flag git commit without -a', () => {
      expect(GIT_UNSAFE_PATTERNS[2].pattern.test('git commit -m "message"')).toBe(false);
    });
  });

  describe('secrets reference detection', () => {
    it('detects non-standard secret references', () => {
      expect(SECRETS_PATTERN.test('${{ secrets.MY_CUSTOM_TOKEN }}')).toBe(true);
      expect(!SECRETS_GITHUB_TOKEN.test('${{ secrets.MY_CUSTOM_TOKEN }}')).toBe(true);
    });

    it('allows secrets.GITHUB_TOKEN', () => {
      const line = '${{ secrets.GITHUB_TOKEN }}';
      // GITHUB_TOKEN is excluded from findings
      expect(SECRETS_GITHUB_TOKEN.test(line)).toBe(true);
    });

    it('does not flag lines without secrets reference', () => {
      expect(SECRETS_PATTERN.test('const token = process.env.TOKEN')).toBe(false);
    });
  });

  describe('PII environment variable detection', () => {
    it('detects PASSWORD patterns', () => {
      expect(PII_PATTERNS.some((p) => p.test('DB_PASSWORD=foo'))).toBe(true);
    });

    it('detects API_KEY patterns', () => {
      expect(PII_PATTERNS.some((p) => p.test('OPENAI_API_KEY'))).toBe(true);
    });

    it('detects ACCESS_TOKEN patterns', () => {
      expect(PII_PATTERNS.some((p) => p.test('MY_ACCESS_TOKEN'))).toBe(true);
    });

    it('detects PRIVATE_KEY patterns', () => {
      expect(PII_PATTERNS.some((p) => p.test('SSH_PRIVATE_KEY'))).toBe(true);
    });

    it('does not flag safe environment variables', () => {
      const safeVars = ['NODE_ENV', 'CI', 'HOME', 'PATH', 'PORT'];
      for (const v of safeVars) {
        expect(PII_PATTERNS.some((p) => p.test(v))).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles invalid base ref gracefully', () => {
      const result = runScript('security-review.mjs', [
        'refs/heads/nonexistent-branch-xyz-99999',
      ]);
      const json = extractJson(result.stdout);

      expect(json.findings).toEqual([]);
      expect(result.status).toBe(0);
    });

    it('summary uses security emoji when findings exist', () => {
      // When there are findings, summary starts with 🔒
      // When empty, it starts with ✅
      const result = runScript('security-review.mjs', ['HEAD']);
      const json = extractJson(result.stdout);
      if ((json.findings as unknown[]).length === 0) {
        expect(json.summary).toContain('✅');
      } else {
        expect(json.summary).toContain('🔒');
      }
    });
  });
});
