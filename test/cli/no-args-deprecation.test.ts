/**
 * No-args deprecation message test (#665)
 *
 * Verifies that running `squad` with no arguments prints the REPL deprecation
 * notice, exits 0, and includes the expected guidance text.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const CLI_ENTRY = join(process.cwd(), 'packages', 'squad-cli', 'dist', 'cli-entry.js');

describe('CLI: no-args deprecation message (#665)', () => {
  it('dist/cli-entry.js exists (built before test run)', () => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
  });

  it('exits 0 when run with no arguments', () => {
    let code = 0;
    try {
      execFileSync(process.execPath, [CLI_ENTRY], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    } catch (err: any) {
      code = err.status ?? 1;
    }
    expect(code).toBe(0);
  });

  it('output mentions the REPL has been deprecated', () => {
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [CLI_ENTRY], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
    } catch (err: any) {
      stdout = (err.stdout ?? '') + (err.stderr ?? '');
    }
    expect(stdout.toLowerCase()).toMatch(/deprecated|repl/);
  });

  it('output contains the issue link', () => {
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [CLI_ENTRY], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
    } catch (err: any) {
      stdout = (err.stdout ?? '') + (err.stderr ?? '');
    }
    expect(stdout).toContain('github.com/bradygaster/squad/issues/665');
  });

  it('output contains the Copilot CLI install command', () => {
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [CLI_ENTRY], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
    } catch (err: any) {
      stdout = (err.stdout ?? '') + (err.stderr ?? '');
    }
    expect(stdout).toContain('gh extension install github/gh-copilot');
  });
});
