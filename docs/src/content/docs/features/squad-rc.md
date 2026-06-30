# squad rc
> **Full remote control of GitHub Copilot from any device.** ACP passthrough mode for complete Copilot CLI access via secure tunnel.
---
## What It Does
`squad rc` (remote control) exposes GitHub Copilot CLI over a secure WebSocket tunnel, letting you chat with Copilot from your phone, tablet, or any browser. Unlike `squad start` (which mirrors terminal output), `squad rc` uses **ACP passthrough** — raw JSON-RPC communication directly with Copilot's Agent Communication Protocol. You get full Copilot capabilities, not just terminal visibility.
```bash
squad rc --tunnel
# → QR code appears
# → Scan with phone
# → Chat with Copilot in browser (full capabilities)
```
---
## How It Differs from `squad start`
| Feature                  | `squad rc`                          | `squad start`                    |
|--------------------------|-------------------------------------|----------------------------------|
| **Mode**                 | ACP passthrough (JSON-RPC)          | PTY mirror (terminal streaming)  |
| **Protocol**             | Agent Communication Protocol (ACP)  | xterm.js terminal emulation      |
| **Access**               | Full Copilot capabilities           | Terminal output only             |
| **Use Case**             | Remote Copilot control              | Demo/pair on terminal sessions   |
| **Input**                | Chat messages → Copilot stdin       | Keyboard input → PTY             |
| **Output**               | Copilot responses → WebSocket       | Terminal ANSI → WebSocket        |
| **Mobile Optimized**     | Yes (PWA, QR code, chat UI)         | Yes (xterm.js, keyboard overlay) |
| **Startup Time**         | ~15-20s (MCP server loading)        | Immediate                        |
| **Team Roster**          | Loaded from `.squad/team.md`        | Not applicable                   |
**When to use `squad rc`:** You want to control Copilot remotely (ask questions, run commands, access full agent capabilities).
**When to use `squad start`:** You want to mirror a terminal session to your phone (demos, pairing, watching long-running processes).
> 💡 **Looking for terminal mirroring?** Use `squad start` for PTY-based terminal streaming, or stay on this page for full remote Copilot control.
---
## Prerequisites
### Required
- **GitHub Copilot CLI** — Install with:
  ```bash
  npm install -g @github/copilot
  ```
  Verify with: `copilot --version` (v0.0.420+ recommended)
- **devtunnel CLI** (for `--tunnel` mode)
  ```bash
  # Windows
  winget install Microsoft.devtunnel
  # macOS
  brew install devtunnel
  # Linux
  # Download from https://aka.ms/devtunnels/download
  ```
### Setup
1. **Authenticate devtunnel**
   ```bash
   devtunnel user login
   ```
   Sign in with your Microsoft or GitHub account.
2. **Verify Copilot CLI**
   ```bash
   copilot --version
   ```
   Should return `0.0.420` or higher.
---
## Quick Start
**Local testing (no tunnel):**
```bash
squad rc
# → Prints: Bridge running on port 3000
# → Open http://localhost:3000
```
**Remote access (with tunnel):**
```bash
squad rc --tunnel
# → Creates devtunnel
# → Shows QR code
# → Scan with phone or copy URL
```
**Custom port:**
```bash
squad rc --port 8080
```
**Different directory:**
```bash
squad rc --path ~/my-project --tunnel
```
---
## All Flags & Options
| Flag                | Description                                      | Default              |
|---------------------|--------------------------------------------------|----------------------|
| `--tunnel`          | Create a devtunnel for remote access             | `false` (local only) |
| `--port <n>`        | HTTP server port                                 | `0` (random)         |
| `--path <dir>`      | Working directory for Copilot                    | Current directory    |
**Example:**
```bash
# Local access on port 5000
squad rc --port 5000
# Remote tunnel from specific project
squad rc --tunnel --path ~/repos/my-app
```
---
## How It Works
### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│ Remote Browser (PWA)                                        │
│  • QR code scan                                             │
│  • Chat UI                                                  │
│  • Keyboard shortcuts                                       │
│  • Replay buffer                                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ WebSocket (session token auth)
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ RemoteBridge (squad-sdk)                                    │
│  • HTTP server (serves PWA)                                 │
│  • WebSocket server (broadcasts messages)                   │
│  • Session token + ticket auth                              │
│  • Rate limiting (30 req/min per IP)                        │
│  • Connection limits (5 per IP)                             │
│  • CSP headers                                              │
│  • Audit logging                                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ ACP passthrough (raw JSON-RPC)
                   │ • Client message → Copilot stdin
                   │ • Copilot stdout → Broadcast to clients
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Copilot CLI (--acp mode)                                    │
│  • Spawned as child process                                 │
│  • stdio: ['pipe', 'pipe', 'pipe']                          │
│  • MCP servers load (~15-20s warmup)                        │
│  • Processes ACP JSON-RPC messages                          │
└─────────────────────────────────────────────────────────────┘
                   │
                   │ File system, Git, tools
                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Your Repository                                             │
│  • Copilot reads .squad/team.md (optional)                  │
│  • Full file system access in working directory             │
└─────────────────────────────────────────────────────────────┘
```
### Message Flow
**Outbound (Remote → Copilot):**
1. User types message in browser
2. WebSocket sends JSON payload: `{ type: 'prompt', text: '...' }`
3. RemoteBridge writes to Copilot stdin: `<ACP JSON-RPC message>\n`
4. Copilot processes request
**Inbound (Copilot → Remote):**
1. Copilot writes JSON-RPC to stdout
2. RemoteBridge reads line from Copilot stdout
3. RemoteBridge broadcasts to all WebSocket clients
4. Browser renders Copilot response
### Team Roster Loading
If `.squad/team.md` exists, `squad rc` parses the Active members table:
```markdown
| Name      | Role          | Status |
|-----------|---------------|--------|
| Fenster   | Core Dev      | Active |
| Edie      | TypeScript    | Active |
```
Agents appear in the `/agents` command and are available for direct messages (`@Fenster ...`).
### Connection Monitoring
Every 5 seconds, the bridge logs connected client count:
```
● 2 client(s) connected
```
---
## Security Model
`squad rc` implements 7 layers of security:
### 1. Session Token Authentication
- **What:** UUID session token generated on bridge startup
- **Where:** `RemoteBridge` constructor (line 47 in `bridge.ts`)
- **How:** All API routes check `Authorization: Bearer <token>` header or `?token=<token>` query param
- **Enforcement:** Line 123-128 in `bridge.ts`
### 2. One-Time Ticket System
- **What:** Exchange session token for single-use WebSocket ticket
- **Where:** `/api/auth/ticket` endpoint (line 112-120 in `bridge.ts`)
- **Why:** Session token can't be observed in WebSocket URL logs
- **TTL:** 60 seconds, consumed on first use
- **Cleanup:** Expired tickets garbage-collected every 30s (line 51-56 in `bridge.ts`)
### 3. Rate Limiting
- **HTTP:** 30 requests/minute per IP (line 97-107 in `bridge.ts`)
- **WebSocket:** 20 messages/minute per connection (enforced in `handleMessage`)
- **Penalty:** 429 Too Many Requests (HTTP) or connection close (WebSocket)
### 4. Secret Redaction
- **What:** Environment variable patterns redacted from messages
- **Patterns:** `API_KEY=*`, `TOKEN=*`, `PASSWORD=*`, `SECRET=*`
- **Applied:** Before broadcast to clients (message content sanitized)
### 5. Connection Limits
- **Per IP:** 5 concurrent WebSocket connections
- **Global:** Enforced via `ipConnections` map in `RemoteBridge`
- **Rejection:** Connection denied in `verifyClient` callback
### 6. Content Security Policy Headers
- **Headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=31536000`, `Cache-Control: no-store`
- **Where:** Line 156-161 in `rc.ts` (static file handler)
- **Effect:** Prevents clickjacking, MIME sniffing, referrer leaks
### 7. Devtunnel Private Auth
- **What:** Tunnel is private by default (only your MS/GitHub account can connect)
- **Where:** `devtunnel create` command (line 47-58 in `rc-tunnel.ts`)
- **Labels:** Tunnel tagged with `squad`, `repo`, `branch`, `machine` labels
- **Expiry:** 24 hours (line 48 in `rc-tunnel.ts`)
### Session Expiry
- **TTL:** 4 hours from bridge startup
- **Check:** Every 60 seconds (line 60-67 in `bridge.ts`)
- **Enforcement:** New connections rejected, existing connections closed
---
## Built-in Commands
Type these in the PWA chat:
### `/status`
Shows current bridge state:
```
Squad RC | Repo: squad-pr | Branch: main | Agents: 5 | Copilot: passthrough | Connections: 2
```
### `/agents`
Lists all agents from `.squad/team.md`:
```
Team Roster:
• Fenster (Core Dev)
• Edie (TypeScript Engineer)
• McManus (DevRel)
• Rabin (Distribution)
• Keaton (PM)
```
### `@agentName <message>`
Direct message to a specific agent:
```
@Edie Can you review the TypeScript types in src/index.ts?
```
Routed to the named agent if supported by your squad configuration.
---
## Mobile Experience
### QR Code
When `--tunnel` is enabled, a QR code is printed to the terminal. Scan with your phone's camera to open the remote control URL instantly.
### Keyboard Shortcuts
- **Enter:** Send message
- **Shift+Enter:** New line in message
- **Cmd/Ctrl+K:** Clear chat history (client-side)
- **Cmd/Ctrl+R:** Reconnect WebSocket
### Replay Buffer
All messages are stored in the bridge's replay buffer (default: 500 messages). New connections automatically receive full conversation history on connect.
### Progressive Web App (PWA)
The remote UI is a PWA with:
- **Offline support:** Service worker caches UI assets
- **Install prompt:** Add to Home Screen on iOS/Android
- **Responsive layout:** Mobile-first design, adapts to desktop
---
## Audit Logging
### Log Location
```
~/.cli-tunnel/audit/squad-audit-<timestamp>.jsonl
```
### What's Logged
- WebSocket connections/disconnections
- All prompts (user input)
- All agent responses
- Tool calls
- Permission requests
- Errors
### Log Format
JSONL (JSON Lines) — one event per line:
```json
{"timestamp":"2026-03-13T10:15:00Z","type":"connection","clientId":"abc123","ip":"192.168.1.5"}
{"timestamp":"2026-03-13T10:15:10Z","type":"prompt","clientId":"abc123","text":"What's the latest commit?"}
{"timestamp":"2026-03-13T10:15:12Z","type":"response","agentName":"Copilot","content":"The latest commit is..."}
```
### Accessing Logs
```bash
# View live logs
tail -f ~/.cli-tunnel/audit/squad-audit-*.jsonl
# Search for prompts
grep '"type":"prompt"' ~/.cli-tunnel/audit/squad-audit-*.jsonl | jq .
```
---
## Troubleshooting
### `Copilot not available` error
**Symptom:**
```
⚠ Copilot not available: spawn copilot ENOENT
```
**Cause:** Copilot CLI not installed or not in PATH.
**Fix:**
```bash
npm install -g @github/copilot
```
---
### `devtunnel CLI not found`
**Symptom:**
```
⚠ devtunnel CLI not found. Install with:
  winget install Microsoft.devtunnel
```
**Cause:** `devtunnel` binary not in PATH.
**Fix:**
- **Windows:** `winget install Microsoft.devtunnel`
- **macOS:** `brew install devtunnel`
- **Linux:** Download from https://aka.ms/devtunnels/download
---
### `Tunnel failed: devtunnel host exited with code 1`
**Symptom:**
```
⚠ Tunnel failed: devtunnel host exited with code 1
  Running in local-only mode.
```
**Cause:** Not authenticated with devtunnel.
**Fix:**
```bash
devtunnel user login
```
Sign in with your Microsoft or GitHub account, then retry.
---
### WebSocket connection refused
**Symptom:** Browser console shows `WebSocket connection to 'wss://...' failed: Error during WebSocket handshake`
**Cause:** Session token mismatch or session expired.
**Fix:**
1. **Refresh the QR code:** Stop `squad rc` (Ctrl+C) and restart
2. **Check expiry:** Sessions expire after 4 hours. Restart the bridge.
3. **Verify token:** Ensure you're using the URL from the QR code exactly as printed.
---
### Copilot responses are slow or not appearing
**Symptom:** You send a message but see no response for 20+ seconds.
**Cause:** Copilot's MCP servers are still loading (first 15-20s after `squad rc` starts).
**Expected behavior:**
```
Spawning copilot --acp (MCP servers loading ~15-20s)...
✓ Copilot ACP passthrough active
```
**Fix:** Wait ~20 seconds after seeing the "Spawning copilot" message. Copilot is loading its Model Context Protocol servers (GitHub, Bing, etc.) and won't respond until ready.
---
### `[Copilot passthrough not active] Echo: ...`
**Symptom:** Responses are prefixed with `[Copilot passthrough not active]`.
**Cause:** Copilot CLI failed to spawn (binary missing, unsupported OS, or crashed).
**Fix:**
1. Verify Copilot CLI: `copilot --version`
2. Check logs for "Spawning copilot" errors
3. On Windows, ensure `copilot.exe` is at `C:\ProgramData\global-npm\node_modules\@github\copilot\node_modules\@github\copilot-win32-x64\copilot.exe` (line 185-189 in `rc.ts` for hardcoded fallback)
---
### Port already in use
**Symptom:**
```
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```
**Cause:** Another process is using the default port.
**Fix:**
```bash
squad rc --port 0  # Auto-assign free port
# OR
squad rc --port 8080  # Specific port
```
---
### Can't connect from mobile (tunnel URL works on desktop)
**Symptom:** Desktop browser connects fine, mobile shows "Connection refused" or "Unauthorized".
**Cause 1:** Tunnel auth requires same Microsoft/GitHub account on mobile.
**Fix:** Sign in to your MS/GitHub account in your mobile browser, then open the tunnel URL.
**Cause 2:** Tunnel expired (24-hour TTL).
**Fix:** Restart `squad rc --tunnel` to create a new tunnel.
---
## See Also
- `squad start` — PTY mirror mode for terminal streaming (see the CLI reference for command details)
- [CLI Reference](../reference/cli.md) — All squad commands
- [Remote Control Protocol](https://github.com/bradygaster/squad/blob/main/packages/squad-sdk/src/remote/protocol.ts) — Wire protocol types
- [RemoteBridge SDK](https://github.com/bradygaster/squad/blob/main/packages/squad-sdk/src/remote/bridge.ts) — Server implementation
- [devtunnel documentation](https://aka.ms/devtunnels) — Tunnel setup and auth
