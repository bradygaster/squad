/**
 * Smoke test for scripts/run-benchmarks.mjs.
 *
 * Why a separate test
 * -------------------
 * BenchmarkSuite itself has thorough unit tests in test/benchmarks.test.ts.
 * This file only verifies that the npm-script-facing shim:
 *   1. parses CLI flags correctly
 *   2. emits a usable formatted report
 *   3. emits valid JSON when --json is used
 *   4. honours --filter
 *   5. fails clearly when SDK dist is missing
 *
 * The runner intentionally imports from the built SDK at packages/squad-sdk/dist/.
 * The smoke tests therefore require `npm run build` to have happened. They skip
 * gracefully (with an informative message) if dist/ is not present, so this
 * file does not break clean checkouts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const REPO_ROOT = resolve(__dirname, '..');
const RUNNER = join(REPO_ROOT, 'scripts', 'run-benchmarks.mjs');
const SDK_DIST = join(REPO_ROOT, 'packages', 'squad-sdk', 'dist', 'runtime', 'benchmarks.js');

function runScript(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, [RUNNER, ...args], {
      env: { ...process.env, NO_COLOR: '1', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (c) => {
      stdoutBuf += c.toString();
    });
    child.stderr.on('data', (c) => {
      stderrBuf += c.toString();
    });
    child.on('error', rejectP);
    child.on('exit', (code) => resolveP({ code, stdout: stdoutBuf, stderr: stderrBuf }));
  });
}

const SDK_BUILT = existsSync(SDK_DIST);
// Tiny iteration count keeps these tests under a few hundred ms total.
const TINY_ITERATIONS = '--iterations=2';

describe('scripts/run-benchmarks.mjs', () => {
  beforeAll(() => {
    if (!SDK_BUILT) {
      // eslint-disable-next-line no-console
      console.warn(
        `[bench smoke] Skipping runtime tests: SDK dist not found at ${SDK_DIST}.\n` +
          '  Run `npm run build` to enable these tests.',
      );
    }
  });

  it('shows help with --help and exits 0', async () => {
    const result = await runScript(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--iterations');
    expect(result.stdout).toContain('--json');
    expect(result.stdout).toContain('--filter');
  });

  it('rejects unknown arguments with a non-zero exit and a helpful message', async () => {
    const result = await runScript(['--nope']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unknown argument');
    // help text should also be printed on stdout to guide the user
    expect(result.stdout).toContain('Usage:');
  });

  it('rejects --iterations with a non-integer value', async () => {
    const result = await runScript(['--iterations=abc']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--iterations');
  });

  it.runIf(SDK_BUILT)(
    'runs all benchmarks and prints a formatted table by default',
    async () => {
      const result = await runScript([TINY_ITERATIONS]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Avg (ms)');
      expect(result.stdout).toContain('P95 (ms)');
      expect(result.stdout).toContain('P99 (ms)');
      expect(result.stdout).toContain('configLoad');
      expect(result.stdout).toContain('charterCompile');
      expect(result.stdout).toContain('routing');
      expect(result.stdout).toContain('modelSelection');
      expect(result.stdout).toContain('exportImport');
      expect(result.stdout).toContain('Total time:');
      expect(result.stdout).toContain('Timestamp:');
    },
    20_000,
  );

  it.runIf(SDK_BUILT)(
    'emits valid JSON with --json',
    async () => {
      const result = await runScript([TINY_ITERATIONS, '--json']);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        results: Array<{
          name: string;
          iterations: number;
          avg: number;
          p95: number;
          p99: number;
        }>;
        totalTime: number;
        timestamp: string;
      };
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0]).toHaveProperty('name');
      expect(parsed.results[0]).toHaveProperty('iterations', 2);
      expect(parsed.results[0]).toHaveProperty('avg');
      expect(parsed.results[0]).toHaveProperty('p95');
      expect(parsed.results[0]).toHaveProperty('p99');
      expect(typeof parsed.totalTime).toBe('number');
      expect(typeof parsed.timestamp).toBe('string');
    },
    20_000,
  );

  it.runIf(SDK_BUILT)(
    '--filter selects matching benchmarks only',
    async () => {
      const result = await runScript([TINY_ITERATIONS, '--filter=routing', '--json']);
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        results: Array<{ name: string }>;
      };
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].name).toBe('routing');
    },
    20_000,
  );

  it.runIf(SDK_BUILT)(
    '--filter with no matches exits 1 and lists available benchmarks',
    async () => {
      const result = await runScript([TINY_ITERATIONS, '--filter=NONEXISTENT']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('no benchmarks match');
      expect(result.stderr).toContain('available:');
    },
    10_000,
  );
});
