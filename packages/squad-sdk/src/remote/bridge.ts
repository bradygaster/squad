/**
 * Squad Remote Control — RemoteBridge
 *
 * WebSocket server that bridges Squad's EventBus to remote PWA clients.
 * Maintains message history, broadcasts events, handles incoming commands.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync, execFileSync } from 'node:child_process';
import {
  RC_PROTOCOL_VERSION,
  serializeEvent,
  parseCommand,
  type RCMessage,
  type RCServerEvent,
  type RCAgent,
  type RCClientCommand,
} from './protocol.js';
import type { RemoteBridgeConfig, RemoteConnection, ConnectionState } from './types.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

export class RemoteBridge {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, { ws: WebSocket; info: RemoteConnection }>();
  private messages: RCMessage[] = [];
  private agents: RCAgent[] = [];
  private state: ConnectionState = 'stopped';
  private messageIdCounter = 0;
  private staticHandler?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  private acpEventLog: string[] = []; // Records all ACP events for replay
  private wsRateLimit = new Map<WebSocket, { count: number; resetTime: number }>();
  private ipConnections = new Map<string, number>();
  private httpRateLimits = new Map<string, { count: number; resetAt: number }>();
  private sessionToken: string = randomUUID();
  private tickets = new Map<string, { expires: number }>(); // F-02: one-time WS tickets
  private readonly SESSION_TTL = 4 * 60 * 60 * 1000; // F-18: 4-hour session TTL
  private readonly sessionCreatedAt = Date.now();
  // TODO: audit log directory was previously created with mode 0o700; StorageProvider does not support directory permissions
  private auditLogDir: string = path.join(os.homedir(), '.cli-tunnel', 'audit');
  private auditLogPath: string = path.join(this.auditLogDir, `squad-audit-${Date.now()}.jsonl`);

  constructor(private config: RemoteBridgeConfig, private storage: StorageProvider = new FSStorageProvider()) {
    // #30: Ticket GC — clean expired tickets every 30s
    setInterval(() => {
      const now = Date.now();
      for (const [id, t] of this.tickets) {
        if (t.expires < now) this.tickets.delete(id);
      }
    }, 30000);
    // #10: Session TTL enforcement — periodically close expired connections
    setInterval(() => {
      if (Date.now() - this.sessionCreatedAt > this.SESSION_TTL) {
        for (const [id, { ws }] of this.connections) {
          ws.close(1000, 'Session expired');
          this.connections.delete(id);
        }
      }
    }, 60000);
  }

  /** Set a handler to serve static PWA files */
  setStaticHandler(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): void {
    this.staticHandler = handler;
  }

  /** Get the session token for WebSocket authentication */
  getSessionToken(): string {
    return this.sessionToken;
  }

  /** Get the audit log file path */
  getAuditLogPath(): string {
    return this.auditLogPath;
  }

  /** Get the session expiry timestamp */
  getSessionExpiry(): number {
    return this.sessionCreatedAt + this.SESSION_TTL;
  }

  /** Start the HTTP + WebSocket server */
  async start(): Promise<number> {
    if (this.state === 'running') return this.getPort();

    this.state = 'starting';

    this.server = http.createServer((req, res) => {
      // Rate limiting: 30 requests/minute per IP
      const clientIp = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      let rl = this.httpRateLimits.get(clientIp);
      if (!rl || now > rl.resetAt) {
        rl = { count: 0, resetAt: now + 60000 };
        this.httpRateLimits.set(clientIp, rl);
      }
      if (++rl.count > 30) {
        res.writeHead(429, { 'Content-Type': 'text/plain' });
        res.end('Too Many Requests');
        return;
      }

      // F-18: Session expiry check for API routes
      if (req.url?.startsWith('/api/') && Date.now() - this.sessionCreatedAt > this.SESSION_TTL) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session expired' }));
        return;
      }

      // F-02: Ticket endpoint — exchange session token for one-time WS ticket
      if (req.url === '/api/auth/ticket' && req.method === 'POST') {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth !== this.sessionToken) { res.writeHead(401); res.end(); return; }
        const ticket = randomUUID();
        this.tickets.set(ticket, { expires: Date.now() + 60000 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ticket, expires: Date.now() + 60000 }));
        return;
      }

      // F-01: Session token check for all API routes
      if (req.url?.startsWith('/api/')) {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        const authToken = req.headers.authorization?.replace('Bearer ', '') || reqUrl.searchParams.get('token');
        if (authToken !== this.sessionToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      // Sessions API — runs devtunnel list
      if (req.url === '/api/sessions' && req.method === 'GET') {
        this.handleSessionsAPI(res);
        return;
      }

      // Delete session API
      if (req.url?.startsWith('/api/sessions/') && req.method === 'DELETE') {
        const tunnelId = req.url.replace('/api/sessions/', '');
        this.handleDeleteSession(tunnelId, res);
        return;
      }

      if (this.staticHandler) {
        this.staticHandler(req, res);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
        res.end('Squad Remote Control Bridge');
      }
    });

    this.wss = new WebSocketServer({
      server: this.server,
      maxPayload: 1048576,
      verifyClient: (info: { req: http.IncomingMessage }) => {
        // F-18: Session expiry
        if (Date.now() - this.sessionCreatedAt > this.SESSION_TTL) return false;
        const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
        // #28: Origin validation — reject cross-origin before auth
        const origin = info.req.headers.origin;
        if (origin) {
          try {
            const originUrl = new URL(origin);
            const host = originUrl.hostname;
            if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.devtunnels.ms')) {
              return false;
            }
          } catch { return false; }
        }
        // F-02: Accept one-time ticket
        const ticket = url.searchParams.get('ticket');
        if (ticket && this.tickets.has(ticket)) {
          const t = this.tickets.get(ticket)!;
          this.tickets.delete(ticket); // Single use
          return t.expires > Date.now();
        }
        // Backward compat: accept token
        if (url.searchParams.get('token') !== this.sessionToken) return false;
        return true;
      },
    });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, '127.0.0.1', () => {
        this.state = 'running';
        resolve(this.getPort());
      });
      this.server!.on('error', (err) => {
        this.state = 'error';
        reject(err);
      });
    });
  }

  /** Stop the server and clean up */
  async stop(): Promise<void> {
    this.state = 'stopped';

    for (const [, { ws }] of this.connections) {
      ws.close(1000, 'Bridge shutting down');
    }
    this.connections.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  /** Get the actual port the server is listening on */
  getPort(): number {
    const addr = this.server?.address();
    if (addr && typeof addr === 'object') return addr.port;
    return this.config.port;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnections(): RemoteConnection[] {
    return Array.from(this.connections.values()).map((c) => c.info);
  }

  // ─── Message History ───────────────────────────────────────

  /** Add a message to history and broadcast to clients */
  addMessage(role: 'user' | 'agent' | 'system', content: string, agentName?: string): RCMessage {
    const msg: RCMessage = {
      id: `msg-${++this.messageIdCounter}`,
      role,
      agentName,
      content,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(msg);
    if (this.messages.length > this.config.maxHistory) {
      this.messages = this.messages.slice(-this.config.maxHistory);
    }

    this.broadcast({ type: 'complete', message: msg });
    return msg;
  }

  getMessageHistory(): RCMessage[] {
    return [...this.messages];
  }

  // ─── Streaming ─────────────────────────────────────────────

  /** Send a streaming delta to all clients */
  sendDelta(sessionId: string, agentName: string, content: string): void {
    this.broadcast({ type: 'delta', sessionId, agentName, content });
  }

  // ─── Agent Roster ──────────────────────────────────────────

  /** Update the agent roster and broadcast */
  updateAgents(agents: RCAgent[]): void {
    this.agents = agents;
    this.broadcast({ type: 'agents', agents });
  }

  /** Update a single agent's status */
  updateAgentStatus(name: string, status: RCAgent['status']): void {
    const agent = this.agents.find((a) => a.name === name);
    if (agent) {
      agent.status = status;
      this.broadcast({ type: 'agents', agents: this.agents });
    }
  }

  // ─── Tool Calls & Permissions ──────────────────────────────

  sendToolCall(agentName: string, tool: string, args: Record<string, unknown>, status: 'running' | 'completed' | 'error'): void {
    this.broadcast({ type: 'tool_call', agentName, tool, args, status });
  }

  sendPermissionRequest(id: string, agentName: string, tool: string, args: Record<string, unknown>, description: string): void {
    this.broadcast({ type: 'permission', id, agentName, tool, args, description });
  }

  // ─── Usage ─────────────────────────────────────────────────

  sendUsage(model: string, inputTokens: number, outputTokens: number, cost: number): void {
    this.broadcast({ type: 'usage', model, inputTokens, outputTokens, cost });
  }

  // ─── Error ─────────────────────────────────────────────────

  sendError(message: string, agentName?: string): void {
    this.broadcast({ type: 'error', message, agentName });
  }

  // ─── Sessions API ───────────────────────────────────────────

  private handleSessionsAPI(res: http.ServerResponse): void {
    try {
      const output = execFileSync('devtunnel', ['list', '--labels', 'squad', '--json'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const data = JSON.parse(output);
      const sessions = (data.tunnels || []).map((t: any) => {
        const labels = t.labels || [];
        const id = t.tunnelId?.replace(/\.\w+$/, '') || t.tunnelId;
        const cluster = t.tunnelId?.split('.').pop() || 'euw';
        // Labels format: [squad, repo-name, branch-name, machine-hostname, port-NNNN]
        const portLabel = labels.find((l: string) => l.startsWith('port-'));
        const port = portLabel ? parseInt(portLabel.replace('port-', ''), 10) : 3456;
        return {
          id,
          tunnelId: t.tunnelId,
          repo: labels[1] || 'unknown',
          branch: (labels[2] || 'unknown').replace(/_/g, '/'),
          machine: labels[3] || 'unknown',
          online: (t.hostConnections || 0) > 0,
          port,
          expiration: t.tunnelExpiration,
          url: `https://${id}-${port}.${cluster}.devtunnels.ms`,
        };
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; connect-src 'self' ws://localhost:* wss://*.devtunnels.ms; img-src 'self' data:; font-src 'self' https://cdn.jsdelivr.net",
      });
      res.end(JSON.stringify({ sessions }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ sessions: [], error: (err as Error).message }));
    }
  }

  private handleDeleteSession(tunnelId: string, res: http.ServerResponse): void {
    try {
      const cleanId = tunnelId.replace(/\.\w+$/, '');
      if (!/^[a-zA-Z0-9._-]+$/.test(cleanId)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify({ deleted: false, error: 'Invalid tunnel ID' }));
        return;
      }
      execFileSync('devtunnel', ['delete', cleanId, '--force'], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify({ deleted: true, tunnelId: cleanId }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify({ deleted: false, error: (err as Error).message }));
    }
  }

  /** Strip ANSI escape codes and Unicode invisible characters */
  private stripInvisible(text: string): string {
    return text
      // ESC CSI sequences
      .replace(/\x1b\[[0-9;?<>=!]*[A-Za-z@]/g, '')
      // ESC OSC sequences
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
      // C1 control codes
      .replace(/[\x80-\x9F]/g, '')
      // Zero-width characters
      .replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g, '')
      // Braille blank
      .replace(/[\u2800]/g, '')
      // Combining marks
      .replace(/[\u0300-\u036F]/g, '');
  }

  /** Redact secrets from text before replay */
  private redactSecrets(text: string): string {
    // Strip invisible chars and normalize before pattern matching
    const cleaned = this.stripInvisible(text).normalize('NFKC');
    return cleaned
      .replace(/(?:token|secret|key|password|credential|authorization|api_key|private_key|access_key)[\s:="']+\S{8,}/gi, '[REDACTED]')
      .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED-OPENAI]')
      .replace(/ghp_[A-Za-z0-9]{36,}/g, '[REDACTED-GITHUB]')
      .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED-AWS]')
      .replace(/DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;]+;EndpointSuffix=[^\s"']*/gi, '[REDACTED-AZURE-CONN]')
      .replace(/(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, '[REDACTED-DB-URL]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, '[REDACTED-BEARER]')
      // JWT tokens
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED-JWT]')
      // Slack tokens
      .replace(/xox[bpras]-[a-zA-Z0-9-]{10,}/g, '[REDACTED-SLACK]')
      // npm tokens
      .replace(/npm_[a-zA-Z0-9]{20,}/g, '[REDACTED-NPM]')
      // PEM private keys
      .replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED-PEM]')
      // GitLab personal access tokens
      .replace(/glpat-[a-zA-Z0-9_-]{20,}/g, '[REDACTED-GITLAB]')
      // HashiCorp Vault tokens
      .replace(/hvs\.[a-zA-Z0-9_-]{20,}/g, '[REDACTED-VAULT]')
      // GitHub fine-grained PATs
      .replace(/github_pat_[a-zA-Z0-9_]{20,}/g, '[REDACTED-GITHUB-FG]')
      // Databricks tokens
      .replace(/dapi[a-f0-9]{32}/g, '[REDACTED-DATABRICKS]')
      // HuggingFace tokens
      .replace(/hf_[a-zA-Z]{34}/g, '[REDACTED-HUGGINGFACE]')
      // Credentials in URLs
      .replace(/https?:\/\/[^:]+:[^@]+@[^\s"']+/g, '[REDACTED-CRED-URL]');
  }

  // ─── Passthrough (ACP dumb pipe) ────────────────────────────

  private passthroughWrite: ((msg: string) => void) | null = null;

  /** Set a passthrough pipe — raw WebSocket messages go to this writer,
   *  and call passthroughFromAgent() to send agent responses back */
  setPassthrough(writer: (msg: string) => void): void {
    this.passthroughWrite = writer;
  }

  /** Forward a raw message from the agent (copilot stdout) to all clients + record */
  passthroughFromAgent(line: string): void {
    // Record for replay to late-joining clients (only if enabled)
    if (this.config.enableReplay) {
      this.acpEventLog.push(line);
      // Cap at 2000 events
      if (this.acpEventLog.length > 2000) {
        this.acpEventLog = this.acpEventLog.slice(-2000);
      }
    }

    for (const [, { ws }] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(line);
      }
    }
  }

  // ─── Internal ──────────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    // F-10: Connection cap
    if (this.connections.size >= 5) {
      ws.close(1013, 'Max connections reached');
      return;
    }
    // Per-IP connection limit (max 2)
    const clientIp = req.socket.remoteAddress || 'unknown';
    const ipCount = this.ipConnections.get(clientIp) || 0;
    if (ipCount >= 2) {
      ws.close(1013, 'Per-IP connection limit reached');
      return;
    }
    this.ipConnections.set(clientIp, ipCount + 1);

    const connId = randomUUID();
    const info: RemoteConnection = {
      id: connId,
      connectedAt: new Date(),
      remoteAddress: req.socket.remoteAddress || 'unknown',
    };
    this.connections.set(connId, { ws, info });

    // Ping/pong heartbeat (120s interval)
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        clearInterval(pingInterval);
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();
    }, 120000);

    // Replay recorded ACP events to late-joining client (with secrets redacted)
    if (this.config.enableReplay && this.passthroughWrite && this.acpEventLog.length > 0) {
      for (const event of this.acpEventLog) {
        this.send(ws, { type: '_replay', data: this.redactSecrets(event) } as any);
      }
      this.send(ws, { type: '_replay_done' } as any);
    } else {
      // Non-passthrough mode: send our protocol state
      this.send(ws, {
        type: 'status',
        version: RC_PROTOCOL_VERSION,
        repo: this.config.repo,
        branch: this.config.branch,
        machine: this.config.machine,
        squadDir: this.config.squadDir,
        connectedAt: new Date().toISOString(),
      });
      this.send(ws, { type: 'history', messages: this.messages });
      this.send(ws, { type: 'agents', agents: this.agents });
    }

    // Handle incoming messages
    ws.on('message', (data) => {
      // Rate limiting: 100 messages per second
      const now = Date.now();
      let rate = this.wsRateLimit.get(ws);
      if (!rate || now > rate.resetTime) {
        rate = { count: 0, resetTime: now + 1000 };
        this.wsRateLimit.set(ws, rate);
      }
      if (++rate.count > 100) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      const raw = data.toString();

      // If passthrough is set, forward raw JSON-RPC to copilot
      if (this.passthroughWrite) {
        // Record user messages for replay too (only if enabled)
        if (this.config.enableReplay) {
          this.acpEventLog.push('__USER__' + raw);
        }

        // CRITICAL-4: Audit log remote PTY input
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'pty_input') {
            void this.storage.append(this.auditLogPath, JSON.stringify({ ts: new Date().toISOString(), addr: info.remoteAddress, type: 'pty_input', data: this.redactSecrets(JSON.stringify(parsed.data)) }) + '\n').catch((err) => console.error('Audit log error:', err.message));
          }

          // CRITICAL-5: ACP JSON-RPC method allowlist
          const ALLOWED_ACP_METHODS = new Set([
            'initialize', 'session/new', 'session/prompt', 'session/cancel', 'session/load',
          ]);
          if (parsed.method && !ALLOWED_ACP_METHODS.has(parsed.method)) {
            // Not an allowed method and not a response — drop it
            if (parsed.result === undefined && parsed.error === undefined) {
              return;
            }
          }
        } catch {
          // Log non-JSON input
          void this.storage.append(this.auditLogPath, JSON.stringify({ ts: new Date().toISOString(), addr: info.remoteAddress, type: 'raw', data: raw }) + '\n').catch((err) => console.error('Audit log error:', err.message));
        }

        // Intercept session/new to inject correct cwd
        try {
          const msg = JSON.parse(raw);
          if (msg.method === 'session/new' && msg.params) {
            msg.params.cwd = this.config.squadDir
              ? this.config.squadDir.replace(/[/\\]\.(?:squad|ai-team)$/, '')
              : process.cwd();
            this.passthroughWrite(JSON.stringify(msg));
            return;
          }
        } catch {
          // Only log, do NOT write raw input to PTY
          return;
        }
        this.passthroughWrite(raw);
        return;
      }

      // Otherwise use our protocol
      const cmd = parseCommand(raw);
      if (cmd) this.handleClientCommand(cmd);
    });

    ws.on('close', () => {
      this.connections.delete(connId);
      this.wsRateLimit.delete(ws);
      clearInterval(pingInterval);
      const count = this.ipConnections.get(clientIp) || 1;
      if (count <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, count - 1);
    });

    ws.on('error', () => {
      this.connections.delete(connId);
      this.wsRateLimit.delete(ws);
      clearInterval(pingInterval);
      const count = this.ipConnections.get(clientIp) || 1;
      if (count <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, count - 1);
    });
  }

  private handleClientCommand(cmd: RCClientCommand): void {
    switch (cmd.type) {
      case 'prompt':
        this.config.onPrompt?.(cmd.text);
        break;
      case 'direct':
        this.config.onDirectMessage?.(cmd.agentName, cmd.text);
        break;
      case 'command':
        this.config.onCommand?.(cmd.name, cmd.args);
        break;
      case 'permission_response':
        this.config.onPermissionResponse?.(cmd.id, cmd.approved);
        break;
      case 'ping':
        // Broadcast pong to all (sender will get it too)
        this.broadcast({ type: 'pong', timestamp: new Date().toISOString() });
        break;
    }
  }

  private broadcast(event: RCServerEvent): void {
    const data = serializeEvent(event);
    for (const [, { ws }] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, event: RCServerEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeEvent(event));
    }
  }
}
