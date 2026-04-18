/**
 * Tests for identity storage — reading/writing identity config, app
 * registrations, and private key detection.
 *
 * Uses temp directories for isolation following the project pattern from
 * test/build-command.test.ts (mkdtempSync + afterEach cleanup).
 *
 * @see docs/proposals/agent-github-identity.md — "Credential Management"
 * @module test/identity/storage
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadIdentityConfig,
  saveIdentityConfig,
  loadAppRegistration,
  hasPrivateKey,
} from '@bradygaster/squad-sdk/identity';

// ============================================================================
// Temp directory helpers (matches test/build-command.test.ts pattern)
// ============================================================================
const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-identity-test-'));
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
// loadIdentityConfig
// ============================================================================
describe('loadIdentityConfig', () => {
  it('returns null when no config exists', () => {
    const dir = makeTmpDir();
    const result = loadIdentityConfig(dir);
    expect(result).toBeNull();
  });

  it('reads valid config', () => {
    const dir = makeTmpDir();
    const identityDir = join(dir, '.squad', 'identity');
    mkdirSync(identityDir, { recursive: true });

    const config = { tier: 'per-role' as const, username: 'sabbour' };
    writeFileSync(join(identityDir, 'config.json'), JSON.stringify(config));

    const result = loadIdentityConfig(dir);
    expect(result).toEqual(config);
  });
});

// ============================================================================
// saveIdentityConfig
// ============================================================================
describe('saveIdentityConfig', () => {
  it('creates the file and parent dirs', () => {
    const dir = makeTmpDir();
    const config = { tier: 'per-role' as const, username: 'sabbour' };

    saveIdentityConfig(dir, config);

    // Verify the file was written by reading it back
    const result = loadIdentityConfig(dir);
    expect(result).toEqual(config);
  });
});

// ============================================================================
// loadAppRegistration
// ============================================================================
describe('loadAppRegistration', () => {
  it('reads app JSON', () => {
    const dir = makeTmpDir();
    const appsDir = join(dir, '.squad', 'identity', 'apps');
    mkdirSync(appsDir, { recursive: true });

    const appData = {
      appId: 12345,
      installationId: 67890,
      appSlug: 'sabbour-squad-backend',
    };
    writeFileSync(join(appsDir, 'backend.json'), JSON.stringify(appData));

    const result = loadAppRegistration(dir, 'backend');
    expect(result).toEqual(appData);
  });
});

// ============================================================================
// hasPrivateKey
// ============================================================================
describe('hasPrivateKey', () => {
  it('returns true when PEM exists', () => {
    const dir = makeTmpDir();
    const keysDir = join(dir, '.squad', 'identity', 'keys');
    mkdirSync(keysDir, { recursive: true });
    writeFileSync(join(keysDir, 'backend.pem'), '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----');

    expect(hasPrivateKey(dir, 'backend')).toBe(true);
  });

  it('returns false when PEM missing', () => {
    const dir = makeTmpDir();
    // No keys directory at all
    expect(hasPrivateKey(dir, 'backend')).toBe(false);
  });
});
