/**
 * Security tests for Teams adapter token management.
 * Covers: identity-scoped storage, logout, device-code timeout guards,
 * stale token cleanup, legacy migration, JWT claim extraction,
 * traversal protection, and identity cache resets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  getTokenPath,
  clearTokens,
  loadTokens,
  saveTokens,
  migrateLegacyTokens,
  extractJwtClaims,
  TeamsCommunicationAdapter,
  DEVICE_CODE_TIMEOUT_MS,
  DEVICE_CODE_MIN_POLL_MS,
  DEVICE_CODE_MAX_POLL_MS,
  LEGACY_TOKEN_PATH,
  PERMANENT_AUTH_ERRORS,
} from '../packages/squad-sdk/src/platform/comms-teams.js';

// Default client ID from the source (Microsoft Graph PowerShell)
const DEFAULT_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';

// ─── Mock node:fs so we never touch the real filesystem ──────────────

const mockFiles = new Map<string, string>();

vi.mock('node:fs', async () => {
  return {
    existsSync: (p: string) => mockFiles.has(p),
    readFileSync: (p: string) => {
      const content = mockFiles.get(p);
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeFileSync: (p: string, data: string) => {
      mockFiles.set(p, data);
    },
    mkdirSync: () => {},
    chmodSync: () => {},
    unlinkSync: (p: string) => {
      mockFiles.delete(p);
    },
  };
});

// Prevent icacls / chmod side effects
vi.mock('node:child_process', () => ({
  execFile: (_cmd: string, _args: string[], _cb: unknown) => {},
}));

beforeEach(() => {
  mockFiles.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a fake JWT with the given payload claims for testing. */
function fakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = 'fake-sig';
  return `${header}.${payload}.${signature}`;
}

// ─── getTokenPath — cache key design ─────────────────────────────────

describe('getTokenPath — identity-scoped file paths', () => {
  it('includes clientId in hash — different apps get different paths', () => {
    const pathA = getTokenPath('organizations', 'client-aaa');
    const pathB = getTokenPath('organizations', 'client-bbb');
    expect(pathA).not.toBe(pathB);
  });

  it('includes tenantId in hash — different tenants get different paths', () => {
    const pathA = getTokenPath('contoso.com', DEFAULT_CLIENT_ID);
    const pathB = getTokenPath('fabrikam.com', DEFAULT_CLIENT_ID);
    expect(pathA).not.toBe(pathB);
  });

  it('same config produces same path (deterministic)', () => {
    expect(getTokenPath('t', 'c')).toBe(getTokenPath('t', 'c'));
  });

  it('stays under the ~/.squad directory', () => {
    const p = getTokenPath('organizations', DEFAULT_CLIENT_ID);
    expect(p).toContain('.squad');
    expect(p).toContain('teams-tokens-');
  });

  it('traversal chars cannot escape ~/.squad', () => {
    const p = getTokenPath('../../etc/passwd', '../../../root/.ssh/id_rsa');
    expect(p).not.toContain('..');
    expect(p).not.toContain('etc');
    expect(p).not.toContain('passwd');
    expect(p).not.toContain('root');
    expect(p).toContain('teams-tokens-');
  });

  it('hash matches expected SHA-256(tenantId:clientId) prefix', () => {
    const hash = createHash('sha256').update('test-tenant:test-client').digest('hex').slice(0, 16);
    const p = getTokenPath('test-tenant', 'test-client');
    expect(p).toContain(`teams-tokens-${hash}.json`);
  });

  it('default "organizations" authority gets a valid unique path', () => {
    const p = getTokenPath('organizations', DEFAULT_CLIENT_ID);
    expect(p).toMatch(/teams-tokens-[a-f0-9]{16}\.json$/);
  });
});

// ─── Token storage: load / save / clear ──────────────────────────────

describe('identity-scoped token CRUD', () => {
  const tenantA = 'contoso.com';
  const tenantB = 'fabrikam.com';
  const client = DEFAULT_CLIENT_ID;

  const tokenA = {
    accessToken: fakeJwt({ tid: 'contoso-guid', oid: 'user-a' }),
    refreshToken: 'rt-contoso',
    expiresAt: Date.now() + 3600_000,
  };
  const tokenB = {
    accessToken: fakeJwt({ tid: 'fabrikam-guid', oid: 'user-b' }),
    refreshToken: 'rt-fabrikam',
    expiresAt: Date.now() + 3600_000,
  };

  it('saves and loads tokens for a config', () => {
    saveTokens(tenantA, client, tokenA);
    const loaded = loadTokens(tenantA, client);
    expect(loaded).not.toBeNull();
    expect(loaded!.refreshToken).toBe('rt-contoso');
  });

  it('isolates tokens between different tenants', () => {
    saveTokens(tenantA, client, tokenA);
    saveTokens(tenantB, client, tokenB);
    expect(loadTokens(tenantA, client)!.refreshToken).toBe('rt-contoso');
    expect(loadTokens(tenantB, client)!.refreshToken).toBe('rt-fabrikam');
  });

  it('isolates tokens between different client IDs', () => {
    saveTokens(tenantA, 'client-1', tokenA);
    saveTokens(tenantA, 'client-2', tokenB);
    expect(loadTokens(tenantA, 'client-1')!.refreshToken).toBe('rt-contoso');
    expect(loadTokens(tenantA, 'client-2')!.refreshToken).toBe('rt-fabrikam');
  });

  it('returns null for unknown config', () => {
    expect(loadTokens('unknown-tenant', client)).toBeNull();
  });

  it('rejects tokens with mismatched configTenantId metadata', () => {
    const path = getTokenPath(tenantA, client);
    mockFiles.set(path, JSON.stringify({ ...tokenA, configTenantId: 'wrong-tenant', clientId: client }));
    expect(loadTokens(tenantA, client)).toBeNull();
  });

  it('rejects tokens with mismatched clientId metadata', () => {
    const path = getTokenPath(tenantA, client);
    mockFiles.set(path, JSON.stringify({ ...tokenA, configTenantId: tenantA, clientId: 'wrong-client' }));
    expect(loadTokens(tenantA, client)).toBeNull();
  });

  it('stores authenticatedTenantId from JWT on save', () => {
    saveTokens(tenantA, client, tokenA);
    const raw = JSON.parse(mockFiles.get(getTokenPath(tenantA, client))!);
    expect(raw.authenticatedTenantId).toBe('contoso-guid');
    expect(raw.authenticatedUserId).toBe('user-a');
  });

  it('clearTokens removes tokens from disk', () => {
    saveTokens(tenantA, client, tokenA);
    expect(loadTokens(tenantA, client)).not.toBeNull();
    clearTokens(tenantA, client);
    expect(loadTokens(tenantA, client)).toBeNull();
  });

  it('clearTokens is a no-op for missing files', () => {
    expect(() => clearTokens('nonexistent', client)).not.toThrow();
  });
});

// ─── extractJwtClaims ────────────────────────────────────────────────

describe('extractJwtClaims', () => {
  it('extracts tid and oid from a valid JWT', () => {
    const jwt = fakeJwt({ tid: 'my-tenant-guid', oid: 'my-user-guid', aud: 'graph' });
    const claims = extractJwtClaims(jwt);
    expect(claims.tid).toBe('my-tenant-guid');
    expect(claims.oid).toBe('my-user-guid');
  });

  it('returns empty object for non-JWT string', () => {
    expect(extractJwtClaims('not-a-jwt')).toEqual({});
  });

  it('returns empty object for malformed base64', () => {
    expect(extractJwtClaims('a.!!!invalid!!!.c')).toEqual({});
  });

  it('handles JWT without tid/oid claims', () => {
    const jwt = fakeJwt({ sub: 'user', aud: 'graph' });
    const claims = extractJwtClaims(jwt);
    expect(claims.tid).toBeUndefined();
    expect(claims.oid).toBeUndefined();
  });

  it('ignores non-string tid/oid values', () => {
    const jwt = fakeJwt({ tid: 123, oid: null });
    const claims = extractJwtClaims(jwt);
    expect(claims.tid).toBeUndefined();
    expect(claims.oid).toBeUndefined();
  });
});

// ─── Legacy migration ────────────────────────────────────────────────

describe('migrateLegacyTokens', () => {
  it('migrates legacy token file to identity-scoped path', () => {
    const legacyToken = {
      accessToken: fakeJwt({ tid: 'legacy-tid', oid: 'legacy-oid' }),
      refreshToken: 'legacy-refresh',
      expiresAt: Date.now() + 3600_000,
    };
    mockFiles.set(LEGACY_TOKEN_PATH, JSON.stringify(legacyToken));

    migrateLegacyTokens('my-tenant', DEFAULT_CLIENT_ID);

    // Legacy file deleted
    expect(mockFiles.has(LEGACY_TOKEN_PATH)).toBe(false);
    // Token available at new path
    const loaded = loadTokens('my-tenant', DEFAULT_CLIENT_ID);
    expect(loaded).not.toBeNull();
    expect(loaded!.refreshToken).toBe('legacy-refresh');
  });

  it('is a no-op when no legacy file exists', () => {
    expect(() => migrateLegacyTokens('my-tenant', DEFAULT_CLIENT_ID)).not.toThrow();
    expect(loadTokens('my-tenant', DEFAULT_CLIENT_ID)).toBeNull();
  });
});

// ─── Logout ──────────────────────────────────────────────────────────

describe('TeamsCommunicationAdapter.logout()', () => {
  it('clears tokens from disk after logout', async () => {
    const tenantId = 'logout-test-tenant';
    saveTokens(tenantId, DEFAULT_CLIENT_ID, {
      accessToken: fakeJwt({ tid: 'x', oid: 'y' }),
      refreshToken: 'rt-logout',
      expiresAt: Date.now() + 3600_000,
    });

    const adapter = new TeamsCommunicationAdapter({ tenantId });
    await adapter.logout();

    expect(loadTokens(tenantId, DEFAULT_CLIENT_ID)).toBeNull();
  });

  it('is safe to call multiple times', async () => {
    const adapter = new TeamsCommunicationAdapter({ tenantId: 'double-logout' });
    await adapter.logout();
    await adapter.logout();
    // Should not throw
  });

  it('logout on one config does not affect another', async () => {
    const tenantA = 'iso-tenant-a';
    const tenantB = 'iso-tenant-b';
    const client = DEFAULT_CLIENT_ID;

    saveTokens(tenantA, client, {
      accessToken: fakeJwt({ tid: 'a-tid', oid: 'a-oid' }),
      refreshToken: 'a-refresh',
      expiresAt: Date.now() + 3600_000,
    });
    saveTokens(tenantB, client, {
      accessToken: fakeJwt({ tid: 'b-tid', oid: 'b-oid' }),
      refreshToken: 'b-refresh',
      expiresAt: Date.now() + 3600_000,
    });

    const adapterA = new TeamsCommunicationAdapter({ tenantId: tenantA });
    await adapterA.logout();

    expect(loadTokens(tenantA, client)).toBeNull();
    expect(loadTokens(tenantB, client)).not.toBeNull();
    expect(loadTokens(tenantB, client)!.refreshToken).toBe('b-refresh');
  });
});

// ─── Device-code timeout constants ───────────────────────────────────

describe('device-code timeout guards', () => {
  it('max timeout is 15 minutes', () => {
    expect(DEVICE_CODE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it('min poll interval is 2 seconds', () => {
    expect(DEVICE_CODE_MIN_POLL_MS).toBe(2_000);
  });

  it('max poll interval is 30 seconds', () => {
    expect(DEVICE_CODE_MAX_POLL_MS).toBe(30_000);
  });
});

// ─── Permanent auth error classification ─────────────────────────────

describe('PERMANENT_AUTH_ERRORS', () => {
  it('includes invalid_grant', () => {
    expect(PERMANENT_AUTH_ERRORS).toContain('invalid_grant');
  });

  it('includes interaction_required', () => {
    expect(PERMANENT_AUTH_ERRORS).toContain('interaction_required');
  });

  it('includes consent_required', () => {
    expect(PERMANENT_AUTH_ERRORS).toContain('consent_required');
  });

  it('includes invalid_client', () => {
    expect(PERMANENT_AUTH_ERRORS).toContain('invalid_client');
  });

  it('does NOT include transient errors', () => {
    expect(PERMANENT_AUTH_ERRORS).not.toContain('server_error');
    expect(PERMANENT_AUTH_ERRORS).not.toContain('temporarily_unavailable');
    expect(PERMANENT_AUTH_ERRORS).not.toContain('slow_down');
  });
});

// ─── Multi-config adapter isolation ──────────────────────────────────

describe('multi-config adapter isolation', () => {
  it('different clientIds for same tenant produce different cache files', () => {
    const pathA = getTokenPath('organizations', 'app-registration-1');
    const pathB = getTokenPath('organizations', 'app-registration-2');
    expect(pathA).not.toBe(pathB);
  });

  it('different tenantIds for same clientId produce different cache files', () => {
    const pathA = getTokenPath('tenant-alpha', DEFAULT_CLIENT_ID);
    const pathB = getTokenPath('tenant-beta', DEFAULT_CLIENT_ID);
    expect(pathA).not.toBe(pathB);
  });

  it('default "organizations" + default clientId has a stable path', () => {
    const p1 = getTokenPath('organizations', DEFAULT_CLIENT_ID);
    const p2 = getTokenPath('organizations', DEFAULT_CLIENT_ID);
    expect(p1).toBe(p2);
  });
});
