/**
 * Tests for `squad identity explain <role>` — resolution trace command.
 *
 * Tests cover:
 *   - Role with env credentials (shows env vars as set)
 *   - Role with filesystem credentials (shows filesystem as present)
 *   - Role alias resolution (e.g., 'architect' → 'lead')
 *   - --json output shape
 *   - --live vs non-live (dry-run vs actual fetch via SQUAD_IDENTITY_MOCK=1)
 *   - Cache state reporting
 *   - No credentials configured (expectedSource: none)
 *   - Exit code always 0
 *
 * Uses mkdtempSync isolation pattern from test/identity/storage.test.ts.
 *
 * @module test/identity/explain
 */

import { describe, it, expect, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveIdentityConfig,
  saveAppRegistration,
  clearTokenCache,
} from '@bradygaster/squad-sdk/identity';

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
  const dir = mkdtempSync(join(tmpdir(), 'squad-explain-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  clearTokenCache();
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
// Helpers
// ============================================================================

function scaffoldFilesystemIdentity(projectRoot: string, roleKey: string = 'lead'): void {
  saveIdentityConfig(projectRoot, {
    tier: 'per-role',
    apps: {
      [roleKey]: { appId: 12345, appSlug: `squad-${roleKey}`, installationId: 99999 },
    },
  });
  saveAppRegistration(projectRoot, roleKey, {
    appId: 12345,
    appSlug: `squad-${roleKey}`,
    installationId: 99999,
  });
  const keysDir = join(projectRoot, '.squad', 'identity', 'keys');
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(join(keysDir, `${roleKey}.pem`), TEST_PEM, { mode: 0o600 });
}

import { runIdentity } from '../../packages/squad-cli/src/cli/commands/identity.js';

// ============================================================================
// Capture console output helper
// ============================================================================

function captureConsole(fn: () => Promise<void>): Promise<{ lines: string[]; exitCode: number | null }> {
  return new Promise(async (resolve) => {
    const lines: string[] = [];
    let exitCode: number | null = null;

    const origLog = console.log;
    const origExit = process.exit.bind(process);

    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
    process.exit = ((code?: number | string) => {
      exitCode = typeof code === 'number' ? code : 0;
      throw new Error(`exit(${code})`);
    }) as typeof process.exit;

    try {
      await fn();
    } catch {
      // may throw from mocked process.exit
    } finally {
      console.log = origLog;
      process.exit = origExit;
    }

    resolve({ lines, exitCode });
  });
}

function parseJsonOutput(lines: string[]): Record<string, unknown> | null {
  const jsonLine = lines.find(l => l.trim().startsWith('{'));
  if (!jsonLine) return null;
  try {
    return JSON.parse(jsonLine) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('squad identity explain', () => {
  it('no args: shows usage and exits 0', async () => {
    const dir = makeTmpDir();
    const { lines, exitCode } = await captureConsole(() =>
      runIdentity(dir, ['explain']),
    );
    expect(exitCode).toBeNull(); // exits 0
    const output = lines.join('\n');
    expect(output).toMatch(/squad identity explain/);
  });

  it('role with filesystem credentials: shows filesystem as present', async () => {
    const dir = makeTmpDir();
    scaffoldFilesystemIdentity(dir, 'lead');

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    const fs = parsed!['filesystem'] as Record<string, unknown>;
    expect(fs['configJson']).toBe(true);
    expect(fs['appsJson']).toBe(true);
    expect(fs['pemKey']).toBe(true);
    expect(fs['status']).toBe('present');
    expect(parsed!['expectedSource']).toBe('filesystem');
  });

  it('role with env credentials: shows env as present', async () => {
    const dir = makeTmpDir();
    process.env['SQUAD_BACKEND_APP_ID'] = '12345';
    process.env['SQUAD_BACKEND_PRIVATE_KEY'] = Buffer.from(TEST_PEM).toString('base64');
    process.env['SQUAD_BACKEND_INSTALLATION_ID'] = '99999';

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'backend', '--json']),
    );

    delete process.env['SQUAD_BACKEND_APP_ID'];
    delete process.env['SQUAD_BACKEND_PRIVATE_KEY'];
    delete process.env['SQUAD_BACKEND_INSTALLATION_ID'];

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    const env = parsed!['env'] as Record<string, unknown>;
    expect(env['status']).toBe('present');
    expect(parsed!['expectedSource']).toBe('env');
  });

  it('role alias resolution: "architect" maps to "lead"', async () => {
    const dir = makeTmpDir();

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'architect', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed!['inputRole']).toBe('architect');
    expect(parsed!['canonicalSlug']).toBe('lead');
    expect(parsed!['aliasResolved']).toBe(true);
  });

  it('canonical slug: no alias resolution reported', async () => {
    const dir = makeTmpDir();

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed!['inputRole']).toBe('lead');
    expect(parsed!['canonicalSlug']).toBe('lead');
    expect(parsed!['aliasResolved']).toBe(false);
  });

  it('no credentials: expectedSource is none', async () => {
    const dir = makeTmpDir();

    const { lines, exitCode } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'backend', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed!['expectedSource']).toBe('none');
    expect(exitCode).toBeNull(); // exits 0
  });

  it('--json output has required shape', async () => {
    const dir = makeTmpDir();
    scaffoldFilesystemIdentity(dir, 'lead');

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveProperty('inputRole');
    expect(parsed).toHaveProperty('canonicalSlug');
    expect(parsed).toHaveProperty('aliasResolved');
    expect(parsed).toHaveProperty('env');
    expect(parsed).toHaveProperty('filesystem');
    expect(parsed).toHaveProperty('cache');
    expect(parsed).toHaveProperty('expectedSource');
    expect(parsed).toHaveProperty('live');

    const env = parsed!['env'] as Record<string, unknown>;
    expect(env).toHaveProperty('vars');
    expect(env).toHaveProperty('status');

    const fs = parsed!['filesystem'] as Record<string, unknown>;
    expect(fs).toHaveProperty('configJson');
    expect(fs).toHaveProperty('appsJson');
    expect(fs).toHaveProperty('pemKey');
    expect(fs).toHaveProperty('status');

    const cache = parsed!['cache'] as Record<string, unknown>;
    expect(cache).toHaveProperty('cached');
  });

  it('--live with SQUAD_IDENTITY_MOCK=1: live field shows token present', async () => {
    const dir = makeTmpDir();
    scaffoldFilesystemIdentity(dir, 'lead');

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--live', '--json']),
    );
    delete process.env['SQUAD_IDENTITY_MOCK'];

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    const live = parsed!['live'] as Record<string, unknown>;
    expect(live).not.toBeNull();
    expect(live['token']).toBe('(present)');
    expect(live['error']).toBeNull();
  });

  it('non-live (default): live field is null in JSON output', async () => {
    const dir = makeTmpDir();
    scaffoldFilesystemIdentity(dir, 'lead');

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed!['live']).toBeNull();
  });

  it('exit code is always 0 (diagnostic command)', async () => {
    const dir = makeTmpDir();
    // No configuration at all

    const { exitCode } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    expect(exitCode).toBeNull(); // no exit call = exit 0
  });

  it('env var values are masked in JSON output (show only presence)', async () => {
    const dir = makeTmpDir();
    process.env['SQUAD_LEAD_APP_ID'] = 'SECRET_12345';
    process.env['SQUAD_LEAD_PRIVATE_KEY'] = 'SECRET_PEM';
    process.env['SQUAD_LEAD_INSTALLATION_ID'] = 'SECRET_99999';

    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );

    delete process.env['SQUAD_LEAD_APP_ID'];
    delete process.env['SQUAD_LEAD_PRIVATE_KEY'];
    delete process.env['SQUAD_LEAD_INSTALLATION_ID'];

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    const env = parsed!['env'] as Record<string, unknown>;
    const vars = env['vars'] as Record<string, string>;
    // Values should be masked — should show '(set)' not the actual values
    for (const val of Object.values(vars)) {
      expect(val).not.toContain('SECRET_');
    }
    // Should show (set) for the present vars
    expect(vars['SQUAD_LEAD_APP_ID']).toBe('(set)');
    expect(vars['SQUAD_LEAD_PRIVATE_KEY']).toBe('(set)');
    expect(vars['SQUAD_LEAD_INSTALLATION_ID']).toBe('(set)');
  });

  it('SQUAD_IDENTITY_MOCK=1: expectedSource is mock', async () => {
    const dir = makeTmpDir();

    process.env['SQUAD_IDENTITY_MOCK'] = '1';
    const { lines } = await captureConsole(() =>
      runIdentity(dir, ['explain', 'lead', '--json']),
    );
    delete process.env['SQUAD_IDENTITY_MOCK'];

    const parsed = parseJsonOutput(lines);
    expect(parsed).not.toBeNull();
    expect(parsed!['expectedSource']).toBe('mock');
  });
});
