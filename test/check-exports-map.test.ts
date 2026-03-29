/**
 * check-exports-map.mjs — Script execution test (#104)
 *
 * Validates that the exports map checker script:
 * 1. Executes without crashing (exits 0 or 1, not a runtime error)
 * 2. Produces structured output on stdout or stderr
 *
 * This does NOT test that exports are complete — the script itself
 * catches real gaps (e.g., platform, remote, roles, streams, upstream).
 * Those missing exports are expected; they are tracked separately.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(process.cwd(), 'scripts', 'check-exports-map.mjs');

function runScript(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res, rej) => {
    execFile('node', [SCRIPT_PATH], { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (!error) {
        res({ code: 0, stdout, stderr });
        return;
      }
      const err = error as NodeJS.ErrnoException & { status?: number; code?: number | string };
      if (typeof err.code === 'number') {
        res({ code: err.code, stdout, stderr });
        return;
      }
      if (typeof err.status === 'number') {
        res({ code: err.status, stdout, stderr });
        return;
      }
      // Non-numeric code or missing exit code (e.g., spawn ENOENT, signal termination)
      rej(error);
    });
  });
}

describe('check-exports-map.mjs', () => {
  let result: { code: number; stdout: string; stderr: string };

  beforeAll(async () => {
    result = await runScript();
  });

  it('executes without crashing (exits 0 or 1)', () => {
    // Exit 0 = all barrels mapped, exit 1 = some missing.
    // Both are valid outcomes. A crash would be a non-0/1 code or thrown error.
    expect([0, 1]).toContain(result.code);
  });

  it('produces output describing the check result', () => {
    const combined = result.stdout + result.stderr;
    // The script always prints either "passed" or "FAILED" in its output
    expect(combined).toMatch(/Exports map check (passed|FAILED)/);
  });

  it('reports MISSING entries with expected format when barrels are unmapped', () => {
    if (result.code === 1) {
      // When the check fails, each missing barrel is reported with a MISSING: prefix
      expect(result.stderr).toContain('MISSING:');
      // The error message should mention the skip label escape hatch
      expect(result.stderr).toContain('skip-exports-check');
    }
    // If code === 0, all barrels are mapped and there is nothing to assert here
  });
});
