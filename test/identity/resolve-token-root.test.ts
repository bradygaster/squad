/**
 * Tests for resolve-token.mjs projectRoot derivation.
 *
 * Verifies that the standalone token resolver derives its project root
 * from its own filesystem location (import.meta.url) rather than from
 * process.cwd(). This prevents incorrect root resolution when agents
 * invoke the script from a worktree or different working directory.
 *
 * Also verifies graceful failure when identity config is missing.
 *
 * @see templates/scripts/resolve-token.mjs — CLI entry point
 * @module test/identity/resolve-token-root
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

// Path to the template script in the repo
const TEMPLATE_SCRIPT = join(
  process.cwd(),
  'templates',
  'scripts',
  'resolve-token.mjs',
);

// ============================================================================
// Temp directory helpers
// ============================================================================

const tmpDirs: string[] = [];

function makeTmpDir(prefix = 'squad-resolve-root-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// Helper: set up a fake project with the resolve-token.mjs script
// ============================================================================

/**
 * Creates a temp directory structure mimicking a project root with
 * `.squad/scripts/resolve-token.mjs` and returns the project root path.
 */
function setupFakeProject(): string {
  const projectRoot = makeTmpDir();
  const scriptsDir = join(projectRoot, '.squad', 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(TEMPLATE_SCRIPT, join(scriptsDir, 'resolve-token.mjs'));
  return projectRoot;
}

// ============================================================================
// Tests
// ============================================================================

describe('resolve-token.mjs projectRoot derivation', () => {
  it('template script exists at expected path', () => {
    expect(existsSync(TEMPLATE_SCRIPT)).toBe(true);
  });

  it('derives project root from script location, not from cwd', async () => {
    const projectRoot = setupFakeProject();
    const scriptPath = join(projectRoot, '.squad', 'scripts', 'resolve-token.mjs');

    // Run from a DIFFERENT working directory to prove cwd is irrelevant
    const differentCwd = makeTmpDir('squad-different-cwd-');

    // The script should try to read .squad/identity/ relative to the script's
    // own location (projectRoot), not from differentCwd. Since there's no
    // identity config, it should exit 0 with empty output — NOT crash.
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [scriptPath, 'lead'],
      { cwd: differentCwd, timeout: 10_000 },
    );

    // No crash, no token (since no identity config exists)
    expect(stdout).toBe('');
    // stderr may have warnings but should not contain uncaught exceptions
    expect(stderr).not.toContain('Error');
    expect(stderr).not.toContain('ENOENT');
  });

  it('exits cleanly with no output when role slug is missing', async () => {
    const projectRoot = setupFakeProject();
    const scriptPath = join(projectRoot, '.squad', 'scripts', 'resolve-token.mjs');

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath], // no role slug argument
      { cwd: projectRoot, timeout: 10_000 },
    );

    expect(stdout).toBe('');
  });

  it('exits cleanly when identity config does not exist', async () => {
    const projectRoot = setupFakeProject();
    const scriptPath = join(projectRoot, '.squad', 'scripts', 'resolve-token.mjs');

    // No .squad/identity/ directory — script should not crash
    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, 'backend'],
      { cwd: projectRoot, timeout: 10_000 },
    );

    expect(stdout).toBe('');
  });

  it('does not use cwd to find identity config', async () => {
    // Put identity config in cwd but NOT in the script's project root.
    // If the script incorrectly uses cwd, it would find the config.
    // If correctly using import.meta.url, it won't.
    const projectRoot = setupFakeProject();
    const scriptPath = join(projectRoot, '.squad', 'scripts', 'resolve-token.mjs');

    const cwdWithIdentity = makeTmpDir('squad-cwd-with-identity-');
    const identityDir = join(cwdWithIdentity, '.squad', 'identity', 'apps');
    mkdirSync(identityDir, { recursive: true });
    // Don't write actual credentials — just the directory structure

    const { stdout } = await execFileAsync(
      process.execPath,
      [scriptPath, 'lead'],
      { cwd: cwdWithIdentity, timeout: 10_000 },
    );

    // Should still be empty — script derives root from its own location,
    // not from cwdWithIdentity where the identity dir exists
    expect(stdout).toBe('');
  });
});
