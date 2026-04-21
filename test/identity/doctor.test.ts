/**
 * Tests for `squad identity doctor` — live identity health check command.
 *
 * Tests cover:
 *   - All-pass case (fully configured role)
 *   - Missing config.json case
 *   - Missing app registration case
 *   - Corrupt PEM case
 *   - Wrong permissions on PEM (skip on win32)
 *   - --role filter reduces checks to one role
 *   - --json output shape
 *   - Exit code 0 on pass, 1 on failure
 *   - --no-network skips network checks
 *
 * Uses mkdtempSync isolation pattern from test/identity/storage.test.ts.
 * Uses SQUAD_IDENTITY_MOCK=1 for network-requiring assertions.
 *
 * @module test/identity/doctor
 */

import { describe, it, expect, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveIdentityConfig, saveAppRegistration } from '@bradygaster/squad-sdk/identity';

// ============================================================================
// Test RSA key pair
// ============================================================================

const { privateKey: TEST_PEM } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ============================================================================
// Temp directory helpers
// ============================================================================

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-doctor-test-'));
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
// Helpers — scaffold a complete identity directory tree
// ============================================================================

function scaffoldIdentity(
  projectRoot: string,
  roleKey: string = 'lead',
  options: {
    pemContent?: string;
    installationId?: number;
    withGitignore?: boolean;
    withPem?: boolean;
  } = {},
): void {
  const {
    pemContent = TEST_PEM,
    installationId = 99999,
    withGitignore = true,
    withPem = true,
  } = options;

  // config.json
  saveIdentityConfig(projectRoot, { tier: 'per-role', apps: { [roleKey]: { appId: 12345, appSlug: `squad-${roleKey}`, installationId, tier: 'per-role', roleSlug: roleKey as import('@bradygaster/squad-sdk').RoleSlug } } });

  // apps/{role}.json
  saveAppRegistration(projectRoot, roleKey, { appId: 12345, appSlug: `squad-${roleKey}`, installationId });

  // keys/{role}.pem
  if (withPem) {
    const keysDir = join(projectRoot, '.squad', 'identity', 'keys');
    mkdirSync(keysDir, { recursive: true });
    const pemPath = join(keysDir, `${roleKey}.pem`);
    writeFileSync(pemPath, pemContent, { mode: 0o600 });
  }

  // .gitignore
  if (withGitignore) {
    writeFileSync(join(projectRoot, '.gitignore'), '.squad/identity/keys/\n');
  }
}

// ============================================================================
// runDoctor integration via direct function import
// ============================================================================

// We import runIdentity from the compiled CLI source via dynamic import
// to ensure we test the actual wired command rather than a unit.
// Since tests run in TypeScript (ts-node/vitest), we can import directly.

import { runIdentity } from '../../packages/squad-cli/src/cli/commands/identity.js';

// ============================================================================
// Tests
// ============================================================================

describe('squad identity doctor', () => {
  it('all-pass case: exits 0 and reports all checks passed with SQUAD_IDENTITY_MOCK=1', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    // Capture process.exit calls
    const exitOverride = (code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 0;
      throw new Error(`process.exit(${code})`);
    };
    process.exit = exitOverride as typeof process.exit;

    try {
      await runIdentity(dir, ['doctor', '--no-network']);
    } catch (e) {
      // expected if process.exit was called
    } finally {
      process.exit = origExit;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    // exitCode null means runDoctor returned normally (no exit call)
    expect(exitCode).toBeNull();
  });

  it('missing config.json case: exits 1', async () => {
    const dir = makeTmpDir();
    // No identity config at all

    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 1;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } catch {
      // expected
    } finally {
      process.exit = origExit;
    }

    expect(exitCode).toBe(1);
  });

  it('missing app registration: check fails with --no-network', async () => {
    const dir = makeTmpDir();
    // config exists but no app registration
    saveIdentityConfig(dir, { tier: 'per-role' });

    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 1;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } catch {
      // expected
    } finally {
      process.exit = origExit;
    }

    // No app registrations in config → exits 1
    expect(exitCode).toBe(1);
  });

  it('corrupt PEM case: PEM validation check fails', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead', { pemContent: 'NOT-A-VALID-PEM' });

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } catch {
      // may exit 1
    } finally {
      console.log = origLog;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    const jsonOutput = lines.find(l => l.trim().startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as {
      roles: Array<{ checks: Array<{ label: string; passed: boolean }> }>
    };
    const pemCheck = parsed.roles[0]?.checks.find(c => c.label.includes('valid RSA PEM'));
    expect(pemCheck?.passed).toBe(false);
  });

  it('wrong PEM permissions: check fails on non-Windows', async () => {
    if (process.platform === 'win32') return;

    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    // Deliberately set wrong permissions
    const pemPath = join(dir, '.squad', 'identity', 'keys', 'lead.pem');
    chmodSync(pemPath, 0o644);

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 1;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } catch {
      // expected
    } finally {
      console.log = origLog;
      process.exit = origExit;
    }

    const jsonOutput = lines.find(l => l.trim().startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as {
      roles: Array<{ checks: Array<{ label: string; passed: boolean }> }>
    };
    const modeCheck = parsed.roles[0]?.checks.find(c => c.label.includes('mode 0o600'));
    expect(modeCheck?.passed).toBe(false);
    expect(exitCode).toBe(1);
  });

  it('--role filter checks only the specified role', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');
    scaffoldIdentity(dir, 'backend');

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    try {
      await runIdentity(dir, ['doctor', '--role', 'lead', '--no-network', '--json']);
    } finally {
      console.log = origLog;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    const jsonOutput = lines.find(l => l.trim().startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as { roles: Array<{ role: string }> };
    expect(parsed.roles).toHaveLength(1);
    expect(parsed.roles[0]?.role).toBe('lead');
  });

  it('--json output shape has required fields', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } finally {
      console.log = origLog;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    const jsonOutput = lines.find(l => l.trim().startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as Record<string, unknown>;
    expect(parsed).toHaveProperty('roles');
    expect(parsed).toHaveProperty('summary');
    const summary = parsed['summary'] as Record<string, number>;
    expect(summary).toHaveProperty('passed');
    expect(summary).toHaveProperty('failed');
    expect(summary).toHaveProperty('warnings');
    expect(summary).toHaveProperty('skipped');
    const roles = parsed['roles'] as Array<Record<string, unknown>>;
    expect(roles.length).toBeGreaterThan(0);
    const firstRole = roles[0]!;
    expect(firstRole).toHaveProperty('role');
    expect(firstRole).toHaveProperty('checks');
    const checks = firstRole['checks'] as Array<Record<string, unknown>>;
    for (const check of checks) {
      expect(check).toHaveProperty('label');
      expect(check).toHaveProperty('passed');
      expect(check).toHaveProperty('warning');
      expect(check).toHaveProperty('skipped');
      expect(check).toHaveProperty('detail');
    }
  });

  it('exits 0 when all checks pass (--no-network)', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 0;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    try {
      await runIdentity(dir, ['doctor', '--no-network']);
    } catch {
      // process.exit was called
    } finally {
      process.exit = origExit;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    expect(exitCode).toBeNull(); // no process.exit call means exit 0
  });

  it('exits 1 when a check fails', async () => {
    const dir = makeTmpDir();
    // PEM is corrupt so the PEM validation check will fail
    scaffoldIdentity(dir, 'lead', { pemContent: 'GARBAGE' });

    let exitCode: number | null = null;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 1;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    try {
      await runIdentity(dir, ['doctor', '--no-network']);
    } catch {
      // expected
    } finally {
      process.exit = origExit;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    expect(exitCode).toBe(1);
  });

  it('--no-network skips network checks and marks them as skipped', async () => {
    const dir = makeTmpDir();
    scaffoldIdentity(dir, 'lead');

    const lines: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    try {
      await runIdentity(dir, ['doctor', '--no-network', '--json']);
    } finally {
      console.log = origLog;
      delete process.env['SQUAD_IDENTITY_MOCK'];
    }

    const jsonOutput = lines.find(l => l.trim().startsWith('{'));
    const parsed = JSON.parse(jsonOutput!) as { roles: Array<{ checks: Array<{ label: string; skipped: boolean }> }> };
    const skippedChecks = parsed.roles[0]!.checks.filter(c => c.skipped);
    expect(skippedChecks.length).toBeGreaterThan(0);
    expect(skippedChecks.some(c => c.label.toLowerCase().includes('network') || c.label.toLowerCase().includes('token'))).toBe(true);
  });
});
