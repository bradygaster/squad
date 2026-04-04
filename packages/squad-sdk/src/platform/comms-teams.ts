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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { exec } from 'node:child_process';
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

function saveTokens(tokens: StoredTokens): void {
  if (!existsSync(SQUAD_DIR)) {
    mkdirSync(SQUAD_DIR, { recursive: true });
  }
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

// ─── Graph Helpers ───────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Chat.ReadWrite ChatMessage.Send ChatMessage.Read User.Read offline_access';

async function graphFetch(
  url: string,
  accessToken: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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
  const cmd =
    platform() === 'win32' ? `start "" "${url}"`
    : platform() === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => { /* fire-and-forget */ });
}

/** Base64-URL encode (no padding). */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startBrowserAuthFlow(tenantId: string, clientId: string): Promise<StoredTokens> {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  return new Promise<StoredTokens>((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost`);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Authentication failed</h1><p>${error}</p></body></html>`);
        cleanup();
        reject(new Error(`Browser auth denied: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code');
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

// ─── Adapter ─────────────────────────────────────────────────────────

export class TeamsCommunicationAdapter implements CommunicationAdapter {
  readonly channel: CommunicationChannel = 'teams-webhook';

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

    // "me" mode — find or create a self-chat
    if (!upn || upn === 'me') {
      const chatsRes = (await graphFetch(
        `${GRAPH_BASE}/me/chats?$filter=chatType eq 'oneOnOne'&$top=10`,
        accessToken,
      )) as { value: Array<{ id: string }> };

      if (chatsRes.value.length > 0) {
        this.resolvedChatId = chatsRes.value[0]!.id;
        return this.resolvedChatId;
      }

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
          ],
        },
      })) as { id: string };
      this.resolvedChatId = chatRes.id;
      return this.resolvedChatId;
    }

    // Create 1:1 chat with recipient UPN
    const chatRes = (await graphFetch(`${GRAPH_BASE}/chats`, accessToken, {
      method: 'POST',
      body: {
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${upn}')`,
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
      const url = `${GRAPH_BASE}/teams/${this.config.teamId}/channels/${this.config.channelId}/messages`;
      const msg = (await graphFetch(url, accessToken, {
        method: 'POST',
        body: {
          body: {
            contentType: 'html',
            content: formatTeamsMessage(options.title, options.body, options.author),
          },
        },
      })) as { id: string };

      return {
        id: msg.id,
        url: `https://teams.microsoft.com/l/channel/${this.config.channelId}`,
      };
    }

    // 1:1 chat mode
    const chatId = await this.ensureChat(accessToken);
    const url = `${GRAPH_BASE}/chats/${chatId}/messages`;
    const msg = (await graphFetch(url, accessToken, {
      method: 'POST',
      body: {
        body: {
          contentType: 'html',
          content: formatTeamsMessage(options.title, options.body, options.author),
        },
      },
    })) as { id: string };

    return {
      id: msg.id,
      url: this.getNotificationUrl(chatId),
    };
  }

  async pollForReplies(options: {
    threadId: string;
    since: Date;
  }): Promise<CommunicationReply[]> {
    const accessToken = await this.ensureAuthenticated();
    const chatId = this.resolvedChatId ?? options.threadId;

    const sinceIso = options.since.toISOString();
    const url = `${GRAPH_BASE}/chats/${chatId}/messages?$filter=createdDateTime gt ${sinceIso}&$top=50&$orderby=createdDateTime asc`;

    let data: { value: Array<{ id: string; body: { content: string }; from: { user: { displayName: string; id: string } } | null; createdDateTime: string }> };
    try {
      data = (await graphFetch(url, accessToken)) as typeof data;
    } catch {
      return [];
    }

    let myId: string | null = null;
    try {
      const me = (await graphFetch(`${GRAPH_BASE}/me`, accessToken)) as { id: string };
      myId = me.id;
    } catch { /* ignore */ }

    return data.value
      .filter((m) => {
        if (!m.from?.user) return false;
        if (myId && m.from.user.id === myId) return false;
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

// ─── Formatting ──────────────────────────────────────────────────────

function formatTeamsMessage(title: string, body: string, author?: string): string {
  const authorLine = author ? `<em>Posted by ${escapeHtml(author)}</em><br/>` : '';
  return `<b>${escapeHtml(title)}</b><br/>${authorLine}<br/>${escapeHtml(body).replace(/\n/g, '<br/>')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}
