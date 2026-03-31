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
import { mkdtempSync, rmSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const NO_COLOR_ENV = {
  ...process.env,
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  npm_config_loglevel: process.env['npm_config_loglevel'] ?? 'warn',
};
const MISSING_MODULE_RE = /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/i;

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

interface InstalledCli {
  tempDir: string;
  cliEntryPath: string;
}

describe('CLI packaging smoke test', { timeout: 120_000 }, () => {
  let packageArtifactsDir: string | undefined;
  let installedCli: InstalledCli | undefined;
  let sdkTarball: string;
  let cliTarball: string;

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

    packageArtifactsDir = mkdtempSync(join(tmpdir(), 'squad-cli-pack-'));

    // Pack both packages into an isolated temp directory so reruns do not
    // reuse or mutate repo-local tarballs between installs.
    const sdkPackOutput = execSync(`npm pack --quiet --pack-destination "${packageArtifactsDir}"`, {
      cwd: sdkDir,
      encoding: 'utf8',
      env: NO_COLOR_ENV,
    }).trim();
    sdkTarball = join(packageArtifactsDir, sdkPackOutput.split('\n').pop()!.trim());

    const cliPackOutput = execSync(`npm pack --quiet --pack-destination "${packageArtifactsDir}"`, {
      cwd: cliDir,
      encoding: 'utf8',
      env: NO_COLOR_ENV,
    }).trim();
    cliTarball = join(packageArtifactsDir, cliPackOutput.split('\n').pop()!.trim());

    const installPackedCli = (prefix: string): InstalledCli => {
      const tempDir = mkdtempSync(join(tmpdir(), prefix));

      execSync('npm init -y', {
        cwd: tempDir,
        stdio: 'ignore',
        env: NO_COLOR_ENV,
      });

      execSync(`npm install "${sdkTarball}" "${cliTarball}"`, {
        cwd: tempDir,
        stdio: 'pipe',
        env: NO_COLOR_ENV,
      });

      const cliEntryPath = join(
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

      return { tempDir, cliEntryPath };
    };

    installedCli = installPackedCli('squad-cli-test-');
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

    cleanupWithRetry(installedCli?.tempDir ?? '');
    cleanupWithRetry(packageArtifactsDir ?? '');
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
  function runCommand(args: string[], cli = installedCli): CommandResult {
    if (!cli) {
      throw new Error('CLI package is not installed for this test');
    }

    try {
      const stdout = execFileSync(process.execPath, [cli.cliEntryPath, ...args], {
        cwd: cli.tempDir,
        encoding: 'utf8',
        timeout: 2000,
        env: NO_COLOR_ENV,
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
   */
  function expectCommandRouted(result: { stdout: string; stderr: string; timedOut?: boolean }) {
    // If the command timed out, it was routed — it started executing
    // but hung waiting for infrastructure (e.g., rc, start, aspire)
    if (result.timedOut) return;

    const output = result.stdout + result.stderr;
    expect(output.toLowerCase()).not.toContain('unknown command');
    expect(output).not.toMatch(MISSING_MODULE_RE);
  }

  function isDependencyInstalled(cli: InstalledCli | undefined, dependency: string): boolean {
    return Boolean(findDependencyPath(cli, dependency));
  }

  function findDependencyPath(cli: InstalledCli | undefined, dependency: string): string | undefined {
    if (!cli) return undefined;

    return [
      join(cli.tempDir, 'node_modules', dependency),
      join(cli.tempDir, 'node_modules', '@bradygaster', 'squad-cli', 'node_modules', dependency),
    ].find(path => existsSync(path));
  }

  // ============================================================================
  // PHASE 1.5 — PUBLISH SAFETY CHECKS
  // These prevent broken packages from reaching npm.
  // ============================================================================

  it('squad-cli has no file: dependencies (breaks global installs)', () => {
    expect(installedCli).toBeDefined();
    const pkgPath = join(installedCli!.tempDir, 'node_modules', '@bradygaster', 'squad-cli', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = pkg.dependencies || {};
    for (const [name, version] of Object.entries(deps)) {
      expect(String(version), `${name} has file: dependency — will break global installs`)
        .not.toMatch(/^file:/);
    }
  });

  it('squad-sdk resolves as a real package (not a workspace link)', () => {
    expect(installedCli).toBeDefined();
    const sdkPkg = join(installedCli!.tempDir, 'node_modules', '@bradygaster', 'squad-sdk', 'package.json');
    expect(existsSync(sdkPkg), 'squad-sdk not installed as dependency of squad-cli').toBe(true);
    const pkg = JSON.parse(readFileSync(sdkPkg, 'utf8'));
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
      expectCommandRouted(result);
    });
  }

  it('start command gracefully handles forced-missing node-pty', () => {
    expect(installedCli).toBeDefined();

    const nodePtyPath = findDependencyPath(installedCli, 'node-pty');
    if (!nodePtyPath) {
      const result = runCommand(['start']);
      expect(result.timedOut).not.toBe(true);

      const output = result.stdout + result.stderr;
      expect(output).toMatch(/node-pty not available/i);
      expect(output).not.toMatch(MISSING_MODULE_RE);
      return;
    }

    const hiddenNodePtyPath = `${nodePtyPath}-forced-missing`;
    renameSync(nodePtyPath, hiddenNodePtyPath);

    try {
      expect(isDependencyInstalled(installedCli, 'node-pty')).toBe(false);

      const result = runCommand(['start']);
      expect(result.timedOut).not.toBe(true);

      const output = result.stdout + result.stderr;
      expect(output).toMatch(/node-pty not available/i);
      expect(output).not.toMatch(MISSING_MODULE_RE);
    } finally {
      renameSync(hiddenNodePtyPath, nodePtyPath);
    }
  });

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
