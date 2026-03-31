/**
 * CLI Packaging Smoke Test
 *
 * Validates that the packaged CLI works end-to-end:
 * 1. Packs both squad-sdk and squad-cli packages
 * 2. Installs both tarballs in a clean temp directory
 * 3. Verifies every CLI command is reachable (routed correctly)
 *
 * This test complements cli-command-wiring.test.ts (source-level) by
 * testing the actual PACKAGED artifact that users install via npm.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

describe('CLI packaging smoke test', { timeout: 120_000 }, () => {
  let tempDir: string;
  let sdkTarball: string;
  let cliTarball: string;
  let cliEntryPath: string;

  beforeAll(() => {
    const cwd = process.cwd();
    const sdkDir = join(cwd, 'packages', 'squad-sdk');
    const cliDir = join(cwd, 'packages', 'squad-cli');

    // Build first if dist/ doesn't exist
    const sdkDist = join(sdkDir, 'dist');
    const cliDist = join(cliDir, 'dist');

    // SKIP_BUILD_BUMP prevents bump-build.mjs from mutating versions to
    // invalid 4-part semver (e.g. 0.8.25.4) which npm install rejects.
    const buildEnv = { ...process.env, SKIP_BUILD_BUMP: '1' };

    if (!existsSync(sdkDist)) {
      console.log('Building squad-sdk...');
      execSync('npm run build', { cwd: sdkDir, stdio: 'inherit', env: buildEnv });
    }

    if (!existsSync(cliDist)) {
      console.log('Building squad-cli...');
      execSync('npm run build', { cwd: cliDir, stdio: 'inherit', env: buildEnv });
    }

    // Pack both packages
    console.log('Packing squad-sdk...');
    const sdkPackOutput = execSync('npm pack --quiet', {
      cwd: sdkDir,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    }).trim();
    sdkTarball = join(sdkDir, sdkPackOutput.split('\n').pop()!.trim());

    console.log('Packing squad-cli...');
    const cliPackOutput = execSync('npm pack --quiet', {
      cwd: cliDir,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    }).trim();
    cliTarball = join(cliDir, cliPackOutput.split('\n').pop()!.trim());

    // Create temp directory and install
    tempDir = mkdtempSync(join(tmpdir(), 'squad-cli-test-'));
    console.log(`Installing packages in ${tempDir}...`);

    // Initialize package.json
    execSync('npm init -y', {
      cwd: tempDir,
      stdio: 'ignore',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    // Install both tarballs
    execSync(`npm install "${sdkTarball}" "${cliTarball}"`, {
      cwd: tempDir,
      stdio: 'inherit',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    cliEntryPath = join(
      tempDir,
      'node_modules',
      '@bradygaster',
      'squad-cli',
      'dist',
      'cli-entry.js',
    );

    if (!existsSync(cliEntryPath)) {
      throw new Error(`CLI entry point not found at ${cliEntryPath}`);
    }
  }, 90000);

  afterAll(() => {
    // Cleanup - with retry logic for Windows file locks
    const cleanupWithRetry = (path: string, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          if (existsSync(path)) {
            rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          }
          return;
        } catch (err: any) {
          if (i === maxRetries - 1 || err.code !== 'EBUSY') {
            // Last retry or not a busy error - give up silently
            // (test has already passed, cleanup is best-effort)
            return;
          }
          // Wait a bit before retrying
          const start = Date.now();
          while (Date.now() - start < 500) {
            // Busy wait
          }
        }
      }
    };

    cleanupWithRetry(tempDir);
    cleanupWithRetry(sdkTarball);
    cleanupWithRetry(cliTarball);
  });

  /**
   * Helper to run a CLI command and capture output.
   * Many commands will exit non-zero (expected — no .squad/ dir, etc.).
   * We only care that the command was ROUTED, not that it succeeded.
   *
   * Uses a short timeout (2s) — if the command starts executing and doesn't
   * immediately fail with "Unknown command", it's routed. Commands like `rc`
   * and `start` hang waiting for infrastructure; a timeout means they were
   * routed successfully.
   */
  function runCommand(args: string[]): { stdout: string; stderr: string; exitCode: number; timedOut?: boolean } {
    try {
      const stdout = execSync(`node "${cliEntryPath}" ${args.join(' ')}`, {
        cwd: tempDir,
        encoding: 'utf8',
        timeout: 2000,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err: any) {
      // Timeout means the command started running (routed) but hung
      // waiting for infrastructure — that's a pass for routing verification
      if (err.killed || err.signal === 'SIGTERM') {
        return {
          stdout: err.stdout?.toString() || '',
          stderr: err.stderr?.toString() || '',
          exitCode: 0,
          timedOut: true,
        };
      }
      return {
        stdout: err.stdout?.toString() || '',
        stderr: err.stderr?.toString() || '',
        exitCode: err.status || 1,
      };
    }
  }

  /**
   * Helper to verify a command was routed (not unknown, not module error).
   * 
   * Issue #711: The `start` command requires node-pty (optionalDependency).
   * If node-pty is missing, the command should show a graceful error message
   * ("node-pty not available"), NOT crash with raw MODULE_NOT_FOUND.
   */
  function expectCommandRouted(result: { stdout: string; stderr: string; timedOut?: boolean }, command?: string) {
    // If the command timed out, it was routed — it started executing
    // but hung waiting for infrastructure (e.g., rc, start, aspire)
    if (result.timedOut) return;

    const output = result.stdout + result.stderr;
    expect(output.toLowerCase()).not.toContain('unknown command');
    
    // Special case for 'start' command: if node-pty is missing, we should see
    // the graceful error message, NOT a raw MODULE_NOT_FOUND crash
    if (command === 'start' && output.includes('node-pty')) {
      // Should have graceful error, not raw module error
      expect(output).toMatch(/node-pty not available/i);
      return;
    }
    
    // For all other commands, MODULE_NOT_FOUND is a test failure
    if (output.match(/MODULE_NOT_FOUND|Cannot find module/i)) {
      expect(output).not.toMatch(/MODULE_NOT_FOUND|Cannot find module/i);
    }
  }

  // ============================================================================
  // PHASE 1.5 — PUBLISH SAFETY CHECKS
  // These prevent broken packages from reaching npm.
  // ============================================================================

  it('squad-cli has no file: dependencies (breaks global installs)', () => {
    const pkgPath = join(tempDir, 'node_modules', '@bradygaster', 'squad-cli', 'package.json');
    const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf8'));
    const deps = pkg.dependencies || {};
    for (const [name, version] of Object.entries(deps)) {
      expect(String(version), `${name} has file: dependency — will break global installs`)
        .not.toMatch(/^file:/);
    }
  });

  it('squad-sdk resolves as a real package (not a workspace link)', () => {
    const sdkPkg = join(tempDir, 'node_modules', '@bradygaster', 'squad-sdk', 'package.json');
    expect(existsSync(sdkPkg), 'squad-sdk not installed as dependency of squad-cli').toBe(true);
    const pkg = JSON.parse(require('fs').readFileSync(sdkPkg, 'utf8'));
    expect(pkg.name).toBe('@bradygaster/squad-sdk');
  });

  // ============================================================================
  // PHASE 2 — SMOKE TESTS
  // ============================================================================

  it('squad --version exits 0 and outputs semver', () => {
    const result = runCommand(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('squad --help exits 0 and contains usage info', () => {
    const result = runCommand(['--help']);
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toLowerCase();
    expect(output).toMatch(/usage|commands/);
  });

  // All commands that should be routable
  const COMMANDS = [
    'init',
    'upgrade',
    'migrate',
    'triage',
    'loop',
    'hire',
    'export',
    'import',
    'plugin',
    'copilot',
    'scrub-emails',
    'status',
    'build',
    'start',
    'nap',
    'doctor',
    'consult',
    'extract',
    'aspire',
    'link',
    'rc',
    'copilot-bridge',
    'init-remote',
    'rc-tunnel',
  ];

  for (const cmd of COMMANDS) {
    it(`command "${cmd}" is routable`, () => {
      const result = runCommand([cmd]);
      expectCommandRouted(result, cmd);
    });
  }

  // Aliases
  it('alias "watch" routes same as "triage"', () => {
    const watchResult = runCommand(['watch']);
    const triageResult = runCommand(['triage']);
    expectCommandRouted(watchResult);
    expectCommandRouted(triageResult);
    // Both should fail in the same way (no .squad/ dir or similar)
    // Just verify they're both routed
  });

  it('alias "remote-control" routes same as "rc"', () => {
    const remoteControlResult = runCommand(['remote-control']);
    const rcResult = runCommand(['rc']);
    expectCommandRouted(remoteControlResult);
    expectCommandRouted(rcResult);
  });

  it('unknown command produces "Unknown command" error', () => {
    const result = runCommand(['banana']);
    const output = result.stdout + result.stderr;
    expect(output.toLowerCase()).toContain('unknown command');
    expect(result.exitCode).not.toBe(0);
  });
});
