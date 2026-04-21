/**
 * Tests for execWithRoleToken and withRoleToken.
 *
 * Verifies that GH_TOKEN is set during execution, restored afterward,
 * and that identity failures fall back gracefully.
 *
 * @module test/identity/exec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks — intercept resolveTokenWithDiagnostics so we never hit real GitHub API.
// We mock the tokens module directly because exec.ts imports from ./tokens.js.
// ============================================================================

vi.mock('../../packages/squad-sdk/src/identity/tokens.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/squad-sdk/src/identity/tokens.js')>();
  return {
    ...actual,
    resolveTokenWithDiagnostics: vi.fn().mockResolvedValue({ token: null, resolvedRoleKey: null, error: null }),
  };
});

import { resolveTokenWithDiagnostics } from '../../packages/squad-sdk/src/identity/tokens.js';
const mockResolve = vi.mocked(resolveTokenWithDiagnostics);

// Import under test — must come after mock setup
import { execWithRoleToken, withRoleToken } from '../../packages/squad-sdk/src/identity/exec.js';

// ============================================================================
// Helpers
// ============================================================================

function mockToken(token: string, roleKey = 'backend') {
  mockResolve.mockResolvedValue({ token, resolvedRoleKey: roleKey, error: null });
}

function mockNoToken() {
  mockResolve.mockResolvedValue({ token: null, resolvedRoleKey: null, error: null });
}

// ============================================================================
// execWithRoleToken
// ============================================================================

describe('execWithRoleToken', () => {
  let savedGhToken: string | undefined;

  beforeEach(() => {
    savedGhToken = process.env['GH_TOKEN'];
    delete process.env['GH_TOKEN'];
    mockResolve.mockReset();
    mockNoToken();
  });

  afterEach(() => {
    if (savedGhToken !== undefined) {
      process.env['GH_TOKEN'] = savedGhToken;
    } else {
      delete process.env['GH_TOKEN'];
    }
  });

  it('sets GH_TOKEN during command execution', async () => {
    mockToken('ghs_bot_token_123');

    // echo $GH_TOKEN captures the value during execution
    const result = await execWithRoleToken('/fake/root', 'backend', 'echo $GH_TOKEN');

    expect(result.stdout.trim()).toBe('ghs_bot_token_123');
    expect(mockResolve).toHaveBeenCalledWith('/fake/root', 'backend');
  });

  it('restores GH_TOKEN to undefined after execution', async () => {
    mockToken('ghs_temp');

    await execWithRoleToken('/fake/root', 'backend', 'echo hello');

    expect(process.env['GH_TOKEN']).toBeUndefined();
  });

  it('restores previous GH_TOKEN value after execution', async () => {
    process.env['GH_TOKEN'] = 'user_personal_token';
    mockToken('ghs_bot_override', 'lead');

    await execWithRoleToken('/fake/root', 'lead', 'echo hi');

    expect(process.env['GH_TOKEN']).toBe('user_personal_token');
  });

  it('restores GH_TOKEN even when command fails', async () => {
    process.env['GH_TOKEN'] = 'original_value';
    mockToken('ghs_injected');

    await expect(
      execWithRoleToken('/fake/root', 'backend', 'exit 1'),
    ).rejects.toThrow();

    expect(process.env['GH_TOKEN']).toBe('original_value');
  });

  it('proceeds without injection when resolveToken returns null', async () => {
    mockNoToken();

    const result = await execWithRoleToken('/fake/root', 'backend', 'echo ok');

    expect(result.stdout.trim()).toBe('ok');
    expect(process.env['GH_TOKEN']).toBeUndefined();
  });

  it('proceeds without injection when resolveToken returns an error', async () => {
    mockResolve.mockResolvedValue({ token: null, resolvedRoleKey: null, error: { kind: 'runtime', message: 'PEM not found' } });

    const result = await execWithRoleToken('/fake/root', 'backend', 'echo fallback');

    expect(result.stdout.trim()).toBe('fallback');
    expect(process.env['GH_TOKEN']).toBeUndefined();
  });

  it('does not overwrite GH_TOKEN when resolveToken returns null', async () => {
    process.env['GH_TOKEN'] = 'user_token_keep';
    mockNoToken();

    const result = await execWithRoleToken('/fake/root', 'backend', 'echo $GH_TOKEN');

    expect(result.stdout.trim()).toBe('user_token_keep');
    expect(process.env['GH_TOKEN']).toBe('user_token_keep');
  });
});

// ============================================================================
// withRoleToken
// ============================================================================

describe('withRoleToken', () => {
  let savedGhToken: string | undefined;

  beforeEach(() => {
    savedGhToken = process.env['GH_TOKEN'];
    delete process.env['GH_TOKEN'];
    mockResolve.mockReset();
    mockNoToken();
  });

  afterEach(() => {
    if (savedGhToken !== undefined) {
      process.env['GH_TOKEN'] = savedGhToken;
    } else {
      delete process.env['GH_TOKEN'];
    }
  });

  it('sets GH_TOKEN during function execution', async () => {
    mockToken('ghs_fn_token', 'frontend');
    let captured: string | undefined;

    await withRoleToken('/fake/root', 'frontend', async () => {
      captured = process.env['GH_TOKEN'];
    });

    expect(captured).toBe('ghs_fn_token');
  });

  it('returns the value from the callback', async () => {
    mockToken('ghs_token');

    const result = await withRoleToken('/fake/root', 'backend', async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it('restores GH_TOKEN after function completes', async () => {
    process.env['GH_TOKEN'] = 'original';
    mockToken('ghs_override');

    await withRoleToken('/fake/root', 'backend', async () => {
      // do nothing
    });

    expect(process.env['GH_TOKEN']).toBe('original');
  });

  it('restores GH_TOKEN when function throws', async () => {
    process.env['GH_TOKEN'] = 'keep_me';
    mockToken('ghs_temp');

    await expect(
      withRoleToken('/fake/root', 'backend', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(process.env['GH_TOKEN']).toBe('keep_me');
  });

  it('falls back gracefully when no identity configured', async () => {
    mockNoToken();

    const result = await withRoleToken('/fake/root', 'backend', async () => {
      return process.env['GH_TOKEN'];
    });

    expect(result).toBeUndefined();
  });
});
