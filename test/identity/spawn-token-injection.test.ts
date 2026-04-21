/**
 * Tests for GH_TOKEN injection during agent spawn.
 *
 * Verifies that spawnAgent() resolves the agent's role identity and
 * sets process.env.GH_TOKEN before creating the session, then restores
 * the original value after the session completes.
 *
 * @see packages/squad-cli/src/cli/shell/spawn.ts
 * @module test/identity/spawn-token-injection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { SessionRegistry } from '@bradygaster/squad-cli/shell/sessions';
import { spawnAgent } from '@bradygaster/squad-cli/shell/spawn';

const FIXTURES = join(process.cwd(), 'test-fixtures');

// ============================================================================
// Mocks
// ============================================================================

// Mock the identity module — we don't want real JWT generation or API calls
vi.mock('@bradygaster/squad-sdk/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bradygaster/squad-sdk/identity')>();
  return {
    ...actual,
    resolveToken: vi.fn().mockResolvedValue(null),
  };
});

import { resolveToken } from '@bradygaster/squad-sdk/identity';
const mockResolveToken = vi.mocked(resolveToken);

function createMockSession() {
  return {
    sessionId: 'mock-session-id',
    sendMessage: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockClient(session = createMockSession()) {
  return {
    createSession: vi.fn().mockResolvedValue(session),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('spawnAgent GH_TOKEN injection', () => {
  let registry: SessionRegistry;
  let savedGhToken: string | undefined;

  beforeEach(() => {
    registry = new SessionRegistry();
    savedGhToken = process.env['GH_TOKEN'];
    delete process.env['GH_TOKEN'];
    mockResolveToken.mockReset();
    mockResolveToken.mockResolvedValue(null);
  });

  afterEach(() => {
    if (savedGhToken !== undefined) {
      process.env['GH_TOKEN'] = savedGhToken;
    } else {
      delete process.env['GH_TOKEN'];
    }
  });

  it('sets GH_TOKEN when resolveToken returns a token', async () => {
    mockResolveToken.mockResolvedValue('ghs_installation_token_abc');
    const mockSession = createMockSession();
    const mockClient = createMockClient(mockSession);

    // Capture the GH_TOKEN value during createSession
    let capturedToken: string | undefined;
    mockClient.createSession.mockImplementation(async () => {
      capturedToken = process.env['GH_TOKEN'];
      return mockSession;
    });

    await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(mockResolveToken).toHaveBeenCalledWith(FIXTURES, 'backend');
    expect(capturedToken).toBe('ghs_installation_token_abc');
  });

  it('restores GH_TOKEN after spawn completes', async () => {
    mockResolveToken.mockResolvedValue('ghs_temp_token');
    const mockClient = createMockClient();

    await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    // GH_TOKEN should be cleaned up (was undefined before)
    expect(process.env['GH_TOKEN']).toBeUndefined();
  });

  it('restores previous GH_TOKEN value after spawn', async () => {
    process.env['GH_TOKEN'] = 'user_original_token';
    mockResolveToken.mockResolvedValue('ghs_injected_token');
    const mockClient = createMockClient();

    await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(process.env['GH_TOKEN']).toBe('user_original_token');
  });

  it('restores GH_TOKEN even when session fails', async () => {
    process.env['GH_TOKEN'] = 'original';
    mockResolveToken.mockResolvedValue('ghs_injected');
    const mockClient = createMockClient();
    mockClient.createSession.mockRejectedValue(new Error('connection failed'));

    const result = await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(result.status).toBe('error');
    expect(process.env['GH_TOKEN']).toBe('original');
  });

  it('skips GH_TOKEN injection when resolveToken returns null', async () => {
    mockResolveToken.mockResolvedValue(null);
    const mockClient = createMockClient();

    let capturedToken: string | undefined;
    mockClient.createSession.mockImplementation(async () => {
      capturedToken = process.env['GH_TOKEN'];
      return createMockSession();
    });

    await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(capturedToken).toBeUndefined();
  });

  it('skips GH_TOKEN injection when resolveToken throws', async () => {
    mockResolveToken.mockRejectedValue(new Error('PEM read failed'));
    const mockClient = createMockClient();

    let capturedToken: string | undefined;
    mockClient.createSession.mockImplementation(async () => {
      capturedToken = process.env['GH_TOKEN'];
      return createMockSession();
    });

    const result = await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    // Should still succeed — identity errors are non-fatal
    expect(result.status).toBe('completed');
    expect(capturedToken).toBeUndefined();
  });

  it('maps role title to correct slug via resolveRoleSlug', async () => {
    mockResolveToken.mockResolvedValue(null);
    const mockClient = createMockClient();

    // Fenster's charter is "# Fenster — Core Dev" → resolveRoleSlug("Core Dev") → "backend"
    await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(mockResolveToken).toHaveBeenCalledWith(FIXTURES, 'backend');

    // Hockney's charter is "# Hockney — Tester" → resolveRoleSlug("Tester") → "tester"
    mockResolveToken.mockReset();
    mockResolveToken.mockResolvedValue(null);

    await spawnAgent('hockney', 'run tests', registry, {
      mode: 'sync',
      client: mockClient as any,
      teamRoot: FIXTURES,
    });

    expect(mockResolveToken).toHaveBeenCalledWith(FIXTURES, 'tester');
  });

  it('works without a client (stub mode) even with identity configured', async () => {
    mockResolveToken.mockResolvedValue('ghs_some_token');

    const result = await spawnAgent('fenster', 'do something', registry, {
      mode: 'sync',
      teamRoot: FIXTURES,
    });

    expect(result.status).toBe('completed');
    expect(result.response).toContain('no client provided');
    // GH_TOKEN should be cleaned up
    expect(process.env['GH_TOKEN']).toBeUndefined();
  });
});
