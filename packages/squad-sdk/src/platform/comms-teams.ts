/**
 * Microsoft Teams communication adapter — bidirectional chat via Graph API.
 *
 * Auth priority: cached token → refresh → browser PKCE → device code fallback.
 * Uses the Microsoft Graph PowerShell first-party client ID by default (works
 * in every Microsoft tenant with no custom Entra registration required).
 * Tokens stored in ~/.squad/teams-tokens.json.
 *
 * @module platform/comms-teams
 */

import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { CommunicationAdapter, CommunicationChannel, CommunicationReply } from './types.js';

// ─── Defaults ────────────────────────────────────────────────────────

/** Microsoft Graph PowerShell — first-party, present in every tenant */
const DEFAULT_CLIENT_ID = '14d82eec-204b-4c2f-b7e8-296a70dab67e';
/** Multi-tenant "organizations" endpoint — works for any Entra org */
const DEFAULT_TENANT_ID = 'organizations';

// ─── Config ──────────────────────────────────────────────────────────

export interface TeamsCommsConfig {
  tenantId?: string;
  clientId?: string;
  /** User to message — UPN like "bradyg@microsoft.com" or "me" for self-chat */
  recipientUpn?: string;
  /** Existing chat ID (skip chat creation if known) */
  chatId?: string;
  /** Teams channel ID (alternative to 1:1 chat) */
  channelId?: string;
  teamId?: string;
}

// ─── Token Storage ───────────────────────────────────────────────────

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const SQUAD_DIR = join(homedir(), '.squad');
const TOKEN_PATH = join(SQUAD_DIR, 'teams-tokens.json');

function loadTokens(): StoredTokens | null {
  try {
    if (!existsSync(TOKEN_PATH)) return null;
    const raw = readFileSync(TOKEN_PATH, 'utf-8');
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

// Security: tokens stored with 0o600 permissions (owner-only read/write).
// Consider OS keychain integration for production use.
function saveTokens(tokens: StoredTokens): void {
  if (!existsSync(SQUAD_DIR)) {
    mkdirSync(SQUAD_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });

  // Ensure permissions are correct even if file already existed
  if (platform() === 'win32') {
    execFile('icacls', [TOKEN_PATH, '/inheritance:r', '/grant:r', `${process.env.USERNAME ?? 'CURRENT_USER'}:(R,W)`], (err) => {
      if (err) console.warn('⚠️ Could not restrict token file permissions:', err.message);
    });
  } else {
    chmodSync(SQUAD_DIR, 0o700);
    chmodSync(TOKEN_PATH, 0o600);
  }
}

// ─── Graph Helpers ───────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Chat.ReadWrite ChatMessage.Send ChatMessage.Read User.Read offline_access';

async function graphFetch(
  url: string,
  accessToken: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 429 || res.status === 503 || res.status === 504) {
      if (attempt < maxRetries) {
        const retryAfter = Math.min(
          Number(res.headers.get('Retry-After') || '5'),
          30,
        );
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Graph API ${res.status}: ${res.statusText} — ${text}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return undefined;
  }
  // Unreachable, but satisfies TypeScript
  throw new Error('Graph API request failed after retries');
}

// ─── Auth Flows ──────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

function parseTokens(data: TokenResponse): StoredTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ─── Browser Auth (Authorization Code + PKCE) ────────────────────────

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Squad — Authenticated</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.card{text-align:center;padding:2rem 3rem;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{margin:0 0 .5rem;font-size:1.4rem}p{color:#555;margin:0}</style></head>
<body><div class="card"><h1>✅ Authentication successful!</h1><p>You can close this tab and return to the terminal.</p></div></body></html>`;

/** Open a URL in the user's default browser. */
function openBrowser(url: string): void {
  const p = platform();
  if (p === 'win32') {
    // Use PowerShell Start-Process to avoid cmd.exe & metacharacter injection
    execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`], () => {});
  } else if (p === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

/** Base64-URL encode (no padding). */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startBrowserAuthFlow(tenantId: string, clientId: string): Promise<StoredTokens> {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const oauthState = base64url(randomBytes(16));

  return new Promise<StoredTokens>((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost`);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');
      const returnedState = reqUrl.searchParams.get('state');

      if (error) {
        const errorDesc = reqUrl.searchParams.get('error_description') ?? '';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Authentication failed</h1><p>${escapeHtml(error)}</p><p>${escapeHtml(errorDesc)}</p></body></html>`);
        cleanup();
        reject(new Error(`Browser auth denied: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code');
        return;
      }

      // Validate state to prevent CSRF
      if (returnedState !== oauthState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid state parameter — possible CSRF attack');
        cleanup();
        reject(new Error('OAuth state mismatch — possible CSRF'));
        return;
      }

      // Exchange code for tokens
      const redirectUri = `http://localhost:${(server.address() as { port: number }).port}`;
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          scope: SCOPES,
        }),
      })
        .then(async (tokenRes) => {
          const data = (await tokenRes.json()) as TokenResponse;
          if (!data.access_token) {
            throw new Error(`Token exchange failed: ${data.error} — ${data.error_description}`);
          }
          const tokens = parseTokens(data);
          saveTokens(tokens);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(SUCCESS_HTML);
          cleanup();
          resolve(tokens);
        })
        .catch((err) => {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Token exchange failed');
          cleanup();
          reject(err);
        });
    });

    // Timeout — 120 seconds to complete browser auth
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Browser auth timed out after 120 seconds'));
    }, 120_000);

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    // Handle server startup errors (port exhaustion, permission denied, etc.)
    server.on('error', (err) => {
      cleanup();
      reject(new Error(`OAuth callback server failed: ${(err as Error).message}`));
    });

    // Bind to a random available port
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const redirectUri = `http://localhost:${port}`;
      const authorizeUrl =
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256` +
        `&state=${encodeURIComponent(oauthState)}` +
        `&prompt=select_account`;

      console.log('🌐 Opening browser for Teams authentication...');
      openBrowser(authorizeUrl);
    });
  });
}

// ─── Device Code Flow (fallback) ─────────────────────────────────────

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

async function startDeviceCodeFlow(tenantId: string, clientId: string): Promise<StoredTokens> {
  const deviceCodeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const dcRes = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES,
    }),
  });
  if (!dcRes.ok) {
    throw new Error(`Device code request failed: ${dcRes.status} ${await dcRes.text()}`);
  }
  const dcData = (await dcRes.json()) as DeviceCodeResponse;

  console.log(`\n🔐 Teams authentication required`);
  console.log(`   ${dcData.message}\n`);

  const pollInterval = (dcData.interval || 5) * 1000;
  const deadline = Date.now() + dcData.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: dcData.device_code,
      }),
    });

    const tokenData = (await tokenRes.json()) as TokenResponse;

    if (tokenData.access_token) {
      const tokens = parseTokens(tokenData);
      saveTokens(tokens);
      console.log(`✅ Teams authentication successful — tokens saved\n`);
      return tokens;
    }

    if (tokenData.error === 'authorization_pending') continue;

    if (tokenData.error === 'slow_down') {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    throw new Error(`Device code auth failed: ${tokenData.error} — ${tokenData.error_description}`);
  }

  throw new Error('Device code flow timed out — user did not authenticate in time');
}

// ─── Token Refresh ───────────────────────────────────────────────────

async function refreshAccessToken(
  tenantId: string,
  clientId: string,
  refreshToken: string,
): Promise<StoredTokens> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });

  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${data.error} — ${data.error_description}`);
  }

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

// ─── User ID Cache ───────────────────────────────────────────────────

let cachedUserId: string | null = null;

async function getMyUserId(accessToken: string): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  try {
    const me = (await graphFetch(`${GRAPH_BASE}/me`, accessToken)) as { id: string };
    cachedUserId = me.id;
    return cachedUserId;
  } catch (err) {
    console.warn(`⚠️ Teams /me fetch failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── Adapter ─────────────────────────────────────────────────────────

export class TeamsCommunicationAdapter implements CommunicationAdapter {
  readonly channel: CommunicationChannel = 'teams-graph';

  private tokens: StoredTokens | null = null;
  private resolvedChatId: string | null;
  private readonly clientId: string;
  private readonly tenantId: string;

  constructor(private readonly config: TeamsCommsConfig) {
    this.resolvedChatId = config.chatId ?? null;
    this.clientId = config.clientId ?? DEFAULT_CLIENT_ID;
    this.tenantId = config.tenantId ?? DEFAULT_TENANT_ID;
  }

  /**
   * Ensure we have a valid access token.
   * Priority: cached → refresh → browser PKCE → device code fallback.
   */
  private async ensureAuthenticated(): Promise<string> {
    if (!this.tokens) {
      this.tokens = loadTokens();
    }

    // Valid token — return it
    if (this.tokens && Date.now() < this.tokens.expiresAt - 60_000) {
      return this.tokens.accessToken;
    }

    // Expired but have refresh token — try refresh
    if (this.tokens?.refreshToken) {
      try {
        this.tokens = await refreshAccessToken(
          this.tenantId,
          this.clientId,
          this.tokens.refreshToken,
        );
        return this.tokens.accessToken;
      } catch {
        console.warn('⚠️  Token refresh failed — re-authenticating...');
      }
    }

    // Try browser auth code flow with PKCE first
    try {
      this.tokens = await startBrowserAuthFlow(this.tenantId, this.clientId);
      console.log('✅ Teams authentication successful — tokens saved');
      return this.tokens.accessToken;
    } catch {
      console.log('Browser auth unavailable, falling back to device code...');
    }

    // Fallback — device code flow (works in headless/SSH environments)
    this.tokens = await startDeviceCodeFlow(this.tenantId, this.clientId);
    return this.tokens.accessToken;
  }

  /**
   * Find or create a 1:1 chat with the recipient.
   */
  private async ensureChat(accessToken: string): Promise<string> {
    if (this.resolvedChatId) return this.resolvedChatId;

    const upn = this.config.recipientUpn;

    // "me" mode requires an explicit chat ID to avoid selecting an arbitrary 1:1 chat.
    if (!upn || upn === 'me') {
      if (!this.config.chatId) {
        throw new Error(
          'Teams "me" mode requires an explicit chatId to avoid routing messages to the wrong one-on-one chat. Provide config.chatId or set recipientUpn to a specific user.',
        );
      }
      validateGraphId(this.config.chatId, 'chatId');
      this.resolvedChatId = this.config.chatId;
      return this.resolvedChatId;
    }

    // Create 1:1 chat with recipient UPN — Graph requires both participants
    const safeUpn = validateGraphId(upn, 'recipientUpn');
    const meRes = (await graphFetch(`${GRAPH_BASE}/me`, accessToken)) as { id: string };
    const chatRes = (await graphFetch(`${GRAPH_BASE}/chats`, accessToken, {
      method: 'POST',
      body: {
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${meRes.id}')`,
          },
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${safeUpn}')`,
          },
        ],
      },
    })) as { id: string };
    this.resolvedChatId = chatRes.id;
    return this.resolvedChatId;
  }

  async postUpdate(options: {
    title: string;
    body: string;
    category?: string;
    author?: string;
  }): Promise<{ id: string; url?: string }> {
    const accessToken = await this.ensureAuthenticated();

    // Use channel message if teamId + channelId are configured
    if (this.config.teamId && this.config.channelId) {
      const safeTeamId = validateGraphId(this.config.teamId, 'teamId');
      const safeChannelId = validateGraphId(this.config.channelId, 'channelId');
      const url = `${GRAPH_BASE}/teams/${safeTeamId}/channels/${safeChannelId}/messages`;
      await graphFetch(url, accessToken, {
        method: 'POST',
        body: {
          body: {
            contentType: 'html',
            content: formatTeamsMessage(options.title, options.body, options.author),
          },
        },
      });

      // Return stable composite ID so pollForReplies can locate the channel
      return {
        id: `${this.config.teamId}|${this.config.channelId}`,
        url: `https://teams.microsoft.com/l/channel/${encodeURIComponent(this.config.channelId)}`,
      };
    }

    // 1:1 chat mode
    const chatId = await this.ensureChat(accessToken);
    const safeChatId = validateGraphId(chatId, 'chatId');
    const url = `${GRAPH_BASE}/chats/${safeChatId}/messages`;
    await graphFetch(url, accessToken, {
      method: 'POST',
      body: {
        body: {
          contentType: 'html',
          content: formatTeamsMessage(options.title, options.body, options.author),
        },
      },
    });

    // Return chatId so pollForReplies can locate the right chat
    return {
      id: chatId,
      url: this.getNotificationUrl(chatId),
    };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    const accessToken = await this.ensureAuthenticated();
    const sinceIso = options.since.toISOString();

    // Channel mode: threadId is "teamId|channelId" composite from postUpdate
    let messagesUrl: string;
    if (options.threadId.includes('|')) {
      const [teamId, channelId] = options.threadId.split('|', 2);
      if (teamId && channelId) {
        const safeTeamId = validateGraphId(teamId, 'teamId');
        const safeChannelId = validateGraphId(channelId, 'channelId');
        const url = new URL(`${GRAPH_BASE}/teams/${safeTeamId}/channels/${safeChannelId}/messages`);
        url.searchParams.set('$filter', `createdDateTime gt ${sinceIso}`);
        url.searchParams.set('$top', '50');
        url.searchParams.set('$orderby', 'createdDateTime asc');
        messagesUrl = url.toString();
      } else {
        return [];
      }
    } else {
      // 1:1 chat mode: threadId is the chatId
      const chatId = this.resolvedChatId ?? options.threadId;
      const safeChatId = validateGraphId(chatId, 'chatId');
      const url = new URL(`${GRAPH_BASE}/chats/${safeChatId}/messages`);
      url.searchParams.set('$filter', `createdDateTime gt ${sinceIso}`);
      url.searchParams.set('$top', '50');
      url.searchParams.set('$orderby', 'createdDateTime asc');
      messagesUrl = url.toString();
    }

    let data: { value: Array<{ id: string; body: { content: string }; from: { user: { displayName: string; id: string } } | null; createdDateTime: string }> };
    try {
      data = (await graphFetch(messagesUrl, accessToken)) as typeof data;
    } catch (err) {
      console.warn(`⚠️ Teams pollForReplies failed: ${(err as Error).message}`);
      return [];
    }

    const myId = await getMyUserId(accessToken);

    return data.value
      .filter((m) => {
        if (!m.from?.user) return false;
        if (myId && m.from.user.id === myId) return false;
        if (new Date(m.createdDateTime) <= options.since) return false;
        return true;
      })
      .map((m) => ({
        author: m.from?.user?.displayName ?? 'unknown',
        body: stripHtml(m.body.content),
        timestamp: new Date(m.createdDateTime),
        id: m.id,
      }));
  }

  getNotificationUrl(threadId: string): string | undefined {
    const chatId = this.resolvedChatId ?? threadId;
    return `https://teams.microsoft.com/l/chat/${encodeURIComponent(chatId)}`;
  }
}

// ─── Graph ID Validation ─────────────────────────────────────────────

/** Validate and encode a Graph API path segment. */
function validateGraphId(id: string, label: string): string {
  if (!/^[\w:@.\-]+$/.test(id)) {
    throw new Error(`Invalid ${label}: contains unsafe characters`);
  }
  return encodeURIComponent(id);
}

// ─── Formatting ──────────────────────────────────────────────────────

function formatTeamsMessage(title: string, body: string, author?: string): string {
  const authorLine = author ? `<em>Posted by ${escapeHtml(author)}</em><br/>` : '';
  return `<b>${escapeHtml(title)}</b><br/>${authorLine}<br/>${escapeHtml(body).replace(/\n/g, '<br/>')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

export { escapeHtml, stripHtml, formatTeamsMessage, parseTokens, base64url, validateGraphId };
