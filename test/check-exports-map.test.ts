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

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(process.cwd(), 'scripts', 'check-exports-map.mjs');

function runScript(): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((res) => {
    execFile('node', [SCRIPT_PATH], { cwd: process.cwd() }, (error, stdout, stderr) => {
      const code = error ? error.code ?? (error as NodeJS.ErrnoException & { status?: number }).status ?? 1 : 0;
      res({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

describe('check-exports-map.mjs', () => {
  it('executes without crashing (exits 0 or 1)', async () => {
    const { code } = await runScript();
    // Exit 0 = all barrels mapped, exit 1 = some missing.
    // Both are valid outcomes. A crash would be a non-0/1 code or thrown error.
    expect([0, 1]).toContain(code);
  });

  it('produces output describing the check result', async () => {
    const { stdout, stderr } = await runScript();
    const combined = stdout + stderr;
    // The script always prints either "passed" or "FAILED" in its output
    expect(combined).toMatch(/Exports map check (passed|FAILED)/);
  });

  it('reports MISSING entries with expected format when barrels are unmapped', async () => {
    const { code, stderr } = await runScript();
    if (code === 1) {
      // When the check fails, each missing barrel is reported with a MISSING: prefix
      expect(stderr).toContain('MISSING:');
      // The error message should mention the skip label escape hatch
      expect(stderr).toContain('skip-exports-check');
    }
    // If code === 0, all barrels are mapped and there is nothing to assert here
  });
});
