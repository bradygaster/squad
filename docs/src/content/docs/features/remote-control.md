# Squad Remote Control

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Control Copilot CLI from your phone via a secure WebSocket tunnel. Perfect for demos, pairing on mobile, or monitoring runs from anywhere.

```bash
squad start --tunnel
# Shows QR code → scan with phone → terminal appears in browser
```

---

## What It Does

`squad start` spawns Copilot CLI in a pseudo-terminal (PTY) and mirrors output to your phone in real-time via:

1. **PTY** — Copilot runs in a full interactive terminal
2. **WebSocket server** — Terminal I/O streams live via WebSocket
3. **devtunnel** — Secure public URL with authentication (optional)
4. **Phone browser** — xterm.js terminal renders on your phone

Architecture diagram:

```
[Copilot CLI in PTY] 
    ↓ (terminal output/input)
[WebSocket Server]
    ↓ (bidirectional)
[devtunnel] (optional, provides public URL)
    ↓ (HTTPS + private auth)
[Phone Browser (xterm.js)]
    ↓ (mobile keyboard shortcuts, replay buffer)
[Your Phone]
```

---

## Prerequisites

### Required

- **devtunnel CLI** (for `--tunnel` mode)
  ```bash
  # Windows (winget)
  winget install Microsoft.devtunnel

  # macOS (Homebrew)
  brew install devtunnel

  # Or via GitHub releases
  # https://github.com/microsoft/devtunnel/releases
  ```

- **devtunnel authentication** (required before first use)
  ```bash
  devtunnel user login
  # Browser opens → authenticate → success
  ```

### Optional

- **Node.js 18+** (for CLI)
- **Modern browser** on phone (iOS Safari, Chrome, Firefox)

---

## Usage Examples

### Basic: Local PTY Terminal

No tunnel, no phone access — just run Copilot in a PTY:

```bash
squad start
# Output: Started PTY terminal (PID: 12345)
#         Copilot running locally
```

### With Phone Access (devtunnel + QR)

Create a tunnel, show QR code, let your phone scan and connect:

```bash
squad start --tunnel
# Output: Started devtunnel session
#         Session ID: abc123xyz
#         QR Code: [████████████████]
#         URL: https://abc123xyz-dev.devtunnels.ms
#         
#         Tap or scan QR on your phone → terminal appears
```

Scan the QR code with your phone camera. Opens browser → terminal renders with xterm.js.

### Custom Port

Specify the WebSocket server port:

```bash
squad start --port 3456
# Output: WebSocket listening on localhost:3456
#         Access via: ws://localhost:3456
```

### Custom Command

Run a different shell or program instead of copilot:

```bash
squad start --tunnel --command powershell
squad start --tunnel --command "python"
squad start --tunnel --command "bash -i"
```

### Pass Copilot Flags Through

All flags after `--tunnel` pass to copilot:

```bash
squad start --tunnel --yolo
squad start --tunnel --model gpt-4
squad start --tunnel --no-config
```

---

## Security Model

Remote access has **7 layers** of security:

### 1. **devtunnel Private Auth**
- URL requires `Authorization` header (devtunnel access token)
- Tunnel is private by default — no public discovery

### 2. **Session Token (UUID, 4-hour TTL)**
- Each session gets a unique token, valid for 4 hours
- Token embedded in QR code or shown as connection string
- Expires automatically

### 3. **Ticket-Based WebSocket Auth**
- First request exchanges session token for single-use ticket
- Ticket valid 60 seconds, single use only
- Prevents token replay attacks

### 4. **HTTP Rate Limiting**
- 30 requests per minute per IP address
- Blocks brute-force connection attempts
- Rate limit resets hourly

### 5. **Environment Variable Blocklist**
- 27 common secret patterns redacted from output
- Blocks: `PASSWORD`, `TOKEN`, `SECRET`, `KEY`, `AWS_`, `GITHUB_`, `API_KEY`, etc.
- ANSI escape sequences cannot bypass redaction

### 6. **Secret Redaction (27 Patterns + ANSI Bypass Prevention)**
- Secrets matching patterns replaced with `[REDACTED]`
- ANSI codes cannot hide redaction logic
- Example: `Password=mysecret123` → `Password=[REDACTED]`

### 7. **Connection Limits**
- **Global:** Max 5 concurrent phone connections per session
- **Per IP:** Max 2 concurrent connections per IP address
- Excess connections rejected with 429 (Too Many Requests)

---

## Mobile Keyboard

When your phone connects, a key bar appears below the terminal:

| Key | Action |
|-----|--------|
| **↑** / **↓** | Scroll history / scroll terminal output |
| **←** / **→** | Move cursor left / right |
| **Tab** | Insert tab character (or autocomplete if supported) |
| **Enter** | Send command / newline |
| **Esc** | Send Escape key (menu mode, cancel) |
| **Ctrl+C** | Send interrupt signal (SIGINT) — kills running command |
| **Space** | Insert space |
| **⌫** | Backspace / delete |

---

## Replay Buffer

When a new phone joins the session:

1. **Terminal history is replayed** — joins don't see a blank screen
2. **Replay window** — last 1000 lines of terminal output
3. **Scrollback included** — can scroll to see previous commands

This means late-joiners see context, not blank canvas.

---

## Session Dashboard

List and manage active devtunnel sessions:

```bash
squad start --list-sessions
# Output:
# Session 1: abc123xyz (2 phones connected, 1h 23m running)
# Session 2: def456uvw (0 phones, 2m running)
# Session 3: ghi789rst (1 phone, idle)
```

Kill a session:

```bash
squad start --kill-session abc123xyz
# Output: Session closed. Remaining: 2
```

---

## Architecture Notes

### PTY-Only Mode

Remote Control runs in **PTY-only mode** — no Copilot ACP (Agent Control Protocol) messages flow through the WebSocket. The terminal is a **mirror**, not a command channel:

- Terminal I/O (text, control codes) ↔ WebSocket
- ACP protocol stays local to the Copilot process
- No agent instructions flow through the tunnel

This design keeps the tunnel stateless and reduces surface area.

---

## Audit Logging

All connections, authentication, and security events are logged:

```bash
~/.cli-tunnel/audit/squad-audit-2025-01-15.jsonl
```

Each line is a JSON object:

```json
{
  "timestamp": "2025-01-15T10:23:45.123Z",
  "event": "connection",
  "session_id": "abc123xyz",
  "phone_ip": "203.0.113.42",
  "status": "authenticated"
}
```

Events logged:
- `connection` — Phone connected
- `disconnection` — Phone disconnected
- `auth_failure` — Token/ticket validation failed
- `rate_limit` — Rate limit exceeded
- `redaction` — Secret pattern matched and redacted
- `command` — Command executed (summary, no args)

Rotate daily, keep 30 days by default.

---

## Troubleshooting

### "devtunnel not found"

Install devtunnel:

```bash
winget install Microsoft.devtunnel
```

Or check `PATH`:

```bash
where devtunnel
# Should show path to executable
```

### "Not authenticated to devtunnel"

Log in:

```bash
devtunnel user login
```

### Phone doesn't connect (QR code error)

1. Check QR code isn't expired (valid for 5 minutes)
2. Verify phone is on same network or has internet
3. Try manual URL instead of QR:
   ```bash
   # Copy URL from terminal and paste in phone browser
   https://abc123xyz-dev.devtunnels.ms
   ```

### Terminal freezes

This is typically Copilot waiting for input. Type a command or press Enter:

```
squad >  [CURSOR BLINKING]
```

Press Enter to see the prompt.

### Audit logs missing

Ensure `~/.cli-tunnel/` directory exists:

```bash
mkdir -p ~/.cli-tunnel/audit
```

Logs are created on first event.

---

## See Also

- [CLI Reference](../reference/cli.md) — All commands
- [Getting Started](../get-started/installation.md) — Squad setup
- [VS Code Integration](./vscode.md) — Remote Control in VS Code
