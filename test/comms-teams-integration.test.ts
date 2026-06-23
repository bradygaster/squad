/**
 * Integration tests for Teams adapter class methods.
 *
 * These tests ensureAuthenticated, ensureChat, postUpdate, and pollForReplies
 * with a mocked global `fetch` and mocked `node:fs` (for token persistence).
 * The real Graph API is never contacted.
 *
 * Auth is bypassed for most tests by returning a valid cached token from fs.
 * The token-refresh test uses an expired cached token so the adapter tries
 * the refresh endpoint (a mocked fetch call) — browser auth is never reached.
 *
 * Closes #772
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Module mocks (hoisted before adapter import) ────────────────────

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() =>
    JSON.stringify({
      accessToken: 'cached-access-token',
      refreshToken: 'cached-refresh-token',
      expiresAt: Date.now() + 3_600_000,
    }),
  ),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

const cpMocks = vi.hoisted(() => ({
  execFile: vi.fn(
    (_cmd: string, _args: string[], cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
    },
  ),
}));

const osMocks = vi.hoisted(() => ({
  platform: vi.fn(() => 'linux' as NodeJS.Platform),
  homedir: vi.fn(() => '/mock-home'),
}));

/** Minimal mock server that rejects immediately via the 'error' event. */
const httpMocks = vi.hoisted(() => ({
  createServer: vi.fn((_handler?: unknown) => {
    type Handler = (...args: unknown[]) => void;
    const handlers: Record<string, Handler[]> = {};
    return {
      on(event: string, handler: Handler) {
        (handlers[event] ??= []).push(handler);
        return this;
      },
      listen(..._args: unknown[]) {
        // Fire the error handler on next tick (after it's registered)
        process.nextTick(() => {
          for (const h of handlers['error'] ?? []) {
            h(new Error('mock: no browser in CI'));
          }
        });
      },
      close() {},
      address() {
        return { port: 0 };
      },
    };
  }),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, ...fsMocks };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, execFile: cpMocks.execFile };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, platform: osMocks.platform, homedir: osMocks.homedir };
});

vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http');
  return { ...actual, createServer: httpMocks.createServer };
});

import { TeamsCommunicationAdapter } from '../packages/squad-sdk/src/platform/comms-teams.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────

const ME_RESPONSE = { id: 'my-user-id', displayName: 'Test User' };
const CHAT_RESPONSE = { id: '19:test-chat-id@thread.v2' };
const MESSAGE_POST_RESPONSE = { id: 'msg-1' };

// ─── Setup / Teardown ────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Default: valid cached token (most tests skip auth entirely)
  fsMocks.existsSync.mockReturnValue(true);
  fsMocks.readFileSync.mockReturnValue(
    JSON.stringify({
      accessToken: 'cached-access-token',
      refreshToken: 'cached-refresh-token',
      expiresAt: Date.now() + 3_600_000,
    }),
  );
  fsMocks.writeFileSync.mockReset();
  fsMocks.mkdirSync.mockReset();

  // Default: execFile succeeds (no-op callback)
  cpMocks.execFile.mockImplementation(
    (_cmd: string, _args: string[], cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
    },
  );

  // Default: non-Windows platform
  osMocks.platform.mockReturnValue('linux');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Standard fetch mock for Graph API endpoints (auth already handled by cached tokens). */
function setupGraphMock(overrides?: Partial<Record<string, () => Response>>) {
  fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    for (const [pattern, handler] of Object.entries(overrides ?? {})) {
      if (urlStr.includes(pattern)) return handler!();
    }

    if (urlStr.includes('/v1.0/me') && !urlStr.includes('/chats')) return jsonResponse(ME_RESPONSE);
    if (urlStr.includes('/v1.0/chats') && !urlStr.includes('/messages')) {
      return jsonResponse(CHAT_RESPONSE);
    }
    if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);

    // Token refresh endpoint (for the refresh test)
    if (urlStr.includes('/oauth2/v2.0/token')) {
      return jsonResponse({
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
        expires_in: 3600,
      });
    }

    return jsonResponse({ error: 'unexpected' }, 404);
  });
}

// ─── 1. Token refresh flow: expired → refresh → success ──────────────

describe('ensureAuthenticated (via postUpdate)', () => {
  it('refreshes an expired token via the refresh endpoint', async () => {
    // Provide an EXPIRED cached token with a refresh token
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(
      JSON.stringify({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh',
        expiresAt: 0, // expired
      }),
    );

    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'alice@contoso.com' });
    let refreshCalled = false;

    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      // Token refresh endpoint — the key assertion
      if (urlStr.includes('/oauth2/v2.0/token')) {
        refreshCalled = true;
        return jsonResponse({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        });
      }

      if (urlStr.includes('/v1.0/me') && !urlStr.includes('/chats')) return jsonResponse(ME_RESPONSE);
      if (urlStr.includes('/v1.0/chats') && !urlStr.includes('/messages')) return jsonResponse(CHAT_RESPONSE);
      if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);
      return jsonResponse({}, 404);
    });

    const result = await adapter.postUpdate({ title: 'Refresh', body: 'Test' });

    expect(refreshCalled).toBe(true);
    expect(result.id).toBe('19:test-chat-id@thread.v2');
    expect(result.url).toContain('https://teams.microsoft.com/l/chat/');
    // Verify token was persisted
    expect(fsMocks.writeFileSync).toHaveBeenCalled();
  });

  it('reuses a valid cached token without re-authenticating', async () => {
    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'alice@contoso.com' });
    setupGraphMock();

    const result = await adapter.postUpdate({ title: 'Cached', body: 'No auth' });

    expect(result.id).toBe('19:test-chat-id@thread.v2');
    // No token endpoint should have been called
    const tokenCalls = fetchMock.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/oauth2/'),
    );
    expect(tokenCalls).toHaveLength(0);
  });
});

// ─── 3. postUpdate to chat vs channel ────────────────────────────────

describe('saveTokens — icacls warning on Windows (#770)', () => {
  it('logs warning when icacls fails on Windows', async () => {
    // Expired token → triggers refresh → saveTokens() runs on success
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(
      JSON.stringify({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh',
        expiresAt: 0,
      }),
    );

    // Platform = Windows → saveTokens takes the icacls branch
    osMocks.platform.mockReturnValue('win32');

    // execFile calls back with an error (simulates icacls failure)
    cpMocks.execFile.mockImplementation(
      (_cmd: string, _args: string[], cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('Access is denied'));
      },
    );

    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'alice@contoso.com' });

    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('/oauth2/v2.0/token')) {
        return jsonResponse({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        });
      }
      if (urlStr.includes('/v1.0/me') && !urlStr.includes('/chats')) return jsonResponse(ME_RESPONSE);
      if (urlStr.includes('/v1.0/chats') && !urlStr.includes('/messages')) return jsonResponse(CHAT_RESPONSE);
      if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);
      return jsonResponse({}, 404);
    });

    await adapter.postUpdate({ title: 'icacls', body: 'test' });

    // Verify icacls was attempted
    expect(cpMocks.execFile).toHaveBeenCalledWith(
      'icacls',
      expect.arrayContaining([expect.stringContaining('.squad')]),
      expect.any(Function),
    );
    // Verify warning was logged
    expect(warnSpy).toHaveBeenCalledWith(
      '⚠️ Could not restrict token file permissions:',
      'Access is denied',
    );
  });
});

// ─── Token refresh failure → graceful fallback ───────────────────────

describe('token refresh failure fallback', () => {
  it('warns on refresh failure and falls back to device code', async () => {
    // Expired token with refresh token → adapter tries refresh first
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(
      JSON.stringify({
        accessToken: 'expired-token',
        refreshToken: 'stale-refresh',
        expiresAt: 0,
      }),
    );

    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'bob@contoso.com' });
    let refreshAttempted = false;
    let deviceCodeCompleted = false;

    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      // Token endpoint — differentiate refresh vs device code by grant_type
      if (urlStr.includes('/oauth2/v2.0/token')) {
        const body = init?.body?.toString() ?? '';
        if (body.includes('grant_type=refresh_token')) {
          refreshAttempted = true;
          // Return error (no access_token) → triggers throw in refreshAccessToken
          return jsonResponse({
            error: 'invalid_grant',
            error_description: 'Refresh token expired',
          });
        }
        // Device code grant — success
        deviceCodeCompleted = true;
        return jsonResponse({
          access_token: 'device-code-token',
          refresh_token: 'device-code-refresh',
          expires_in: 3600,
        });
      }

      // Device code initiation
      if (urlStr.includes('/devicecode')) {
        return jsonResponse({
          device_code: 'dc-fallback',
          user_code: 'FALL-BACK',
          verification_uri: 'https://microsoft.com/devicelogin',
          expires_in: 900,
          interval: 0.001, // near-instant polling for test speed
          message: 'Authenticate',
        });
      }

      // Graph API calls
      if (urlStr.includes('/v1.0/me') && !urlStr.includes('/chats')) return jsonResponse(ME_RESPONSE);
      if (urlStr.includes('/v1.0/chats') && !urlStr.includes('/messages')) return jsonResponse(CHAT_RESPONSE);
      if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);
      return jsonResponse({}, 404);
    });

    const result = await adapter.postUpdate({ title: 'Fallback', body: 'Works' });

    // Refresh was attempted and failed
    expect(refreshAttempted).toBe(true);
    // Warning logged about refresh failure
    expect(warnSpy).toHaveBeenCalledWith('⚠️  Token refresh permanently failed (invalid_grant) — re-authenticating...');
    // Fell through to device code and succeeded
    expect(deviceCodeCompleted).toBe(true);
    expect(result.id).toBeDefined();
  });
});

// ─── postUpdate to chat vs channel ───────────────────────────────────

describe('postUpdate — channel mode', () => {
  it('posts to a team channel and returns encoded deep-link URL (#771)', async () => {
    const adapter = new TeamsCommunicationAdapter({
      teamId: 'team-abc',
      channelId: '19:channel@thread.tacv2',
    });
    setupGraphMock();

    const result = await adapter.postUpdate({
      title: 'Channel Post',
      body: 'Team update',
      author: 'EECOM',
    });

    expect(result.id).toBe('team-abc|19:channel@thread.tacv2');
    // #771: channelId MUST be URI-encoded in the deep-link
    expect(result.url).toBe(
      `https://teams.microsoft.com/l/channel/${encodeURIComponent('19:channel@thread.tacv2')}`,
    );
  });

  it('posts to a 1:1 chat and returns a chat deep-link URL', async () => {
    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'bob@contoso.com' });
    setupGraphMock();

    const result = await adapter.postUpdate({ title: 'Chat', body: 'Hello Bob' });

    expect(result.id).toBe('19:test-chat-id@thread.v2');
    expect(result.url).toContain('https://teams.microsoft.com/l/chat/');
  });
});

// ─── 4–5. pollForReplies ─────────────────────────────────────────────

describe('pollForReplies', () => {
  it('filters out own messages and returns others', async () => {
    const adapter = new TeamsCommunicationAdapter({ chatId: '19:poll@thread.v2' });
    setupGraphMock({
      '/messages': () =>
        jsonResponse({
          value: [
            {
              id: 'msg-own',
              body: { content: '<p>My own message</p>' },
              from: { user: { displayName: 'Test User', id: 'my-user-id' } },
              createdDateTime: '2024-01-01T01:00:00Z',
            },
            {
              id: 'msg-other',
              body: { content: '<p>Reply from Alice</p>' },
              from: { user: { displayName: 'Alice', id: 'alice-id' } },
              createdDateTime: '2024-01-01T02:00:00Z',
            },
          ],
        }),
    });

    const replies = await adapter.pollForReplies({
      threadId: '19:poll@thread.v2',
      since: new Date('2024-01-01T00:00:00Z'),
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]!.author).toBe('Alice');
    expect(replies[0]!.body).toBe('Reply from Alice');
    expect(replies[0]!.id).toBe('msg-other');
  });

  it('returns empty array and warns on Graph API error', async () => {
    const adapter = new TeamsCommunicationAdapter({ chatId: '19:err@thread.v2' });
    setupGraphMock({
      '/messages': () => jsonResponse({ error: 'Internal Server Error' }, 500),
    });

    const replies = await adapter.pollForReplies({
      threadId: '19:err@thread.v2',
      since: new Date(),
    });

    expect(replies).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('pollForReplies failed'),
    );
  });

  it('handles channel mode composite threadId', async () => {
    const adapter = new TeamsCommunicationAdapter({});
    setupGraphMock({
      '/messages': () =>
        jsonResponse({
          value: [
            {
              id: 'ch-msg-1',
              body: { content: '<p>Channel reply</p>' },
              from: { user: { displayName: 'Dana', id: 'dana-id' } },
              createdDateTime: '2024-06-01T10:00:00Z',
            },
          ],
        }),
    });

    const replies = await adapter.pollForReplies({
      threadId: 'team-abc|19:channel@thread.tacv2',
      since: new Date('2024-06-01T00:00:00Z'),
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]!.author).toBe('Dana');
  });
});

// ─── 6. ensureChat: recipientUpn vs "me" mode ────────────────────────

describe('ensureChat (via postUpdate)', () => {
  it('"me" mode with explicit chatId skips chat creation', async () => {
    const adapter = new TeamsCommunicationAdapter({
      recipientUpn: 'me',
      chatId: '19:explicit@thread.v2',
    });

    const graphCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      graphCalls.push(urlStr);

      if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);
      if (urlStr.includes('/v1.0/me')) return jsonResponse(ME_RESPONSE);
      return jsonResponse({}, 404);
    });

    const result = await adapter.postUpdate({ title: 'Me', body: 'Self-chat' });
    expect(result.id).toBe('19:explicit@thread.v2');

    // No POST to /chats (chat creation) should have happened
    const chatCreationCalls = graphCalls.filter(
      (u) => u.includes('/v1.0/chats') && !u.includes('/messages'),
    );
    expect(chatCreationCalls).toHaveLength(0);
  });

  it('"me" mode without chatId throws descriptive error', async () => {
    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'me' });
    setupGraphMock();

    await expect(
      adapter.postUpdate({ title: 'Fail', body: 'No chatId' }),
    ).rejects.toThrow('requires an explicit chatId');
  });

  it('recipientUpn mode creates a 1:1 chat via Graph POST', async () => {
    const adapter = new TeamsCommunicationAdapter({ recipientUpn: 'carol@contoso.com' });
    let chatCreateCalled = false;

    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/v1.0/me') && !urlStr.includes('/chats')) return jsonResponse(ME_RESPONSE);
      if (urlStr.includes('/v1.0/chats') && !urlStr.includes('/messages')) {
        chatCreateCalled = true;
        expect(init?.method).toBe('POST');
        return jsonResponse(CHAT_RESPONSE);
      }
      if (urlStr.includes('/messages')) return jsonResponse(MESSAGE_POST_RESPONSE);
      return jsonResponse({}, 404);
    });

    const result = await adapter.postUpdate({ title: 'UPN', body: '1:1 chat' });
    expect(result.id).toBe('19:test-chat-id@thread.v2');
    expect(chatCreateCalled).toBe(true);
  });
});
