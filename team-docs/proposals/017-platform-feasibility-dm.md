# Proposal 017: Platform Feasibility — Direct Messaging Interface

**Status:** Deferred — Squad DM deferred to Horizon per Proposal 019  
**Authored by:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-09  
**Requested by:** bradygaster  
**Companion to:** (Keaton's DM experience proposal, when written)

---

## Summary

Brady wants to work with his Squad when he's not at his terminal — via direct messages, starting with Telegram. This document is the **platform feasibility analysis**: what's technically possible, what breaks, what alternatives exist, and what the recommended architecture is.

**TL;DR:** The Copilot SDK (`@github/copilot-sdk`) is the recommended execution backend. It provides the same agentic runtime that powers the CLI but can be embedded in any Node.js app — including a Telegram bot. Dev Tunnels handle local exposure. GitHub Actions is the backup execution environment. The hard problem isn't the messaging layer — it's replacing the `task` tool's agent spawning capability outside the CLI.

---

## 1. Copilot CLI Dependency Analysis

### What Squad Depends On Today

Squad's entire runtime is provided by the Copilot CLI. Every tool the coordinator and agents use is **injected by the CLI runtime**, not by Squad itself:

| Tool | Purpose | Available Outside CLI? |
|------|---------|----------------------|
| `task` (agent spawning) | Spawn background/sync sub-agents | ❌ CLI-only |
| `read_agent` / `list_agents` | Collect agent results | ❌ CLI-only |
| `powershell` / `write_powershell` | Execute commands | ❌ CLI-only (but trivially replaceable) |
| `grep` / `glob` | Search codebase | ❌ CLI-only (but trivially replaceable) |
| `view` / `edit` / `create` | File operations | ❌ CLI-only (but trivially replaceable) |
| `web_search` / `web_fetch` | Internet access | ❌ CLI-only |
| `github-mcp-server-*` | GitHub API access | ✅ Via MCP servers directly |
| `sql` | Session database | ❌ CLI-only (replaceable with any SQLite) |
| `report_intent` / `ask_user` | UI interaction | ❌ CLI-only (replaceable with chat messages) |

**The critical dependency is `task`.** Everything else is a tool implementation detail — `grep` is just ripgrep, `view` is just `fs.readFile`, `edit` is string replacement. We can reimplement those in an afternoon. But `task` is the **agent orchestration primitive** — it creates isolated LLM sessions with their own context windows, tool access, and execution environments. That's the hard part.

### What Happens When Brady Sends a Telegram Message

```
Brady (Telegram) → Bot → ??? → Squad Coordinator → task (spawn agents) → Agents do work → Results → Bot → Brady
```

The `???` is the entire problem. The coordinator needs:
1. An LLM to run its reasoning (model access)
2. Tools to work with (file ops, search, GitHub API)
3. The `task` tool to spawn sub-agents (each of which also needs 1 and 2)

---

## 2. The Agent Spawning Problem — Four Options

This is the HARD problem. Evaluated from most to least aligned with Squad's architecture.

### Option A: GitHub Copilot SDK as Execution Backend ⭐ RECOMMENDED

**What:** The Copilot SDK (`@github/copilot-sdk`, npm package, Technical Preview) exposes the same agentic runtime that powers the Copilot CLI. It handles model access, tool invocation, MCP server integration, authentication, and streaming. You create sessions, define tools, and let the SDK orchestrate.

```typescript
import { CopilotClient } from "@github/copilot-sdk";
const client = new CopilotClient();
await client.start();
const session = await client.createSession({ model: "gpt-5" });
const response = await session.sendAndWait({ prompt: coordinatorPrompt });
```

**Feasibility:**
- ✅ Same runtime as CLI — agent spawning semantics should be equivalent
- ✅ Node.js native — Squad is already Node.js
- ✅ GitHub authentication — aligns with Squad's GitHub-native identity
- ✅ Custom tool definitions — we implement `view`, `edit`, `grep`, etc. as tool handlers
- ✅ Multi-model support (GPT-5, Claude, etc.)
- ⚠️ Technical Preview — API may change
- ⚠️ Requires Copilot subscription (Brady already has one)
- ⚠️ `task` tool equivalence unclear — need to verify that the SDK supports spawning sub-sessions that mirror the CLI's `task` behavior
- ❓ Does the SDK support the `task` tool natively, or do we need to implement coordinator-spawns-agents as nested SDK sessions?

**The key question:** Can the SDK's session model replace `task`? If `session.sendAndWait()` supports tool definitions that include "spawn another session," we get full parity. If not, we implement agent spawning as: coordinator session → tool call "spawn_agent" → our code creates a new SDK session → runs the agent → returns results to coordinator. This is more work but fully feasible.

**Cost:** Copilot subscription (already covered). SDK usage may have rate limits in preview.

**Complexity:** Medium. ~200-400 lines for the SDK integration layer + tool implementations.

**Independence principle:** ✅ Strong alignment. We're using the Copilot runtime but not becoming a Copilot product. The SDK is infrastructure, not identity.

### Option B: LLM APIs Directly (Claude API / OpenAI API)

**What:** Use Anthropic's Claude API or OpenAI's API directly. Implement all tools ourselves. Agent spawning becomes: create a new API conversation, inject charter + context, define tools, run to completion.

**Feasibility:**
- ✅ Full control over everything
- ✅ No platform dependency for agent spawning — we implement it ourselves
- ✅ Multiple model providers (diversification)
- ❌ Must implement ALL tools ourselves (file ops, search, GitHub API, web search)
- ❌ Must implement agent spawning ourselves (nested API calls, tool routing, result collection)
- ❌ Must manage API keys, rate limits, costs
- ❌ No GitHub authentication integration
- ❌ Significant code to write and maintain (~1000+ lines for tool layer alone)
- ❌ Breaks independence principle — now Squad depends on specific LLM vendor APIs

**Cost:** API usage costs. Claude Sonnet at ~$3/M input, $15/M output. A full Squad session (coordinator + 5 agents) might cost $0.50-$2.00 per interaction. Adds up fast.

**Complexity:** High. Building a mini-Copilot-CLI is a project, not a feature.

**Independence principle:** ⚠️ Mixed. More control but more vendor coupling. Also, Brady's Copilot subscription already covers model access — paying separately for API calls is wasteful.

### Option C: GitHub Actions as Execution Environment

**What:** Each Telegram message triggers a GitHub Actions workflow. The workflow checks out the repo, installs Copilot CLI, runs the Squad coordinator with the message as input, commits results, and replies via Telegram.

```yaml
on:
  repository_dispatch:
    types: [squad-dm]
jobs:
  squad:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Squad
        run: |
          copilot --agent squad "${{ github.event.client_payload.message }}"
      - name: Commit changes
        run: git add . && git commit -m "Squad DM response" && git push
```

**Feasibility:**
- ✅ Full CLI environment — ALL tools available including `task`
- ✅ Repo is checked out — `.ai-team/` state is live
- ✅ Git operations native — commits, pushes, PRs
- ✅ No persistent infrastructure needed
- ✅ GitHub-native authentication
- ⚠️ Cold start latency: 30-60s before the workflow even starts
- ⚠️ Copilot CLI availability in Actions runners is unclear — may need manual installation
- ❌ Not conversational — each message is a separate workflow run with no conversation history
- ❌ No interactive back-and-forth — can't ask follow-up questions
- ❌ Rate limited — GitHub Actions minutes are finite
- ❌ Expensive for frequent use (Actions minutes aren't free at scale)
- ❌ Latency: 60-120s minimum for a response (workflow startup + agent work)

**Cost:** GitHub Actions minutes. Free tier: 2000 min/month. Each interaction: ~3-8 minutes. ~250-660 interactions/month on free tier.

**Complexity:** Low for setup, but the UX is poor. Every message is fire-and-forget.

**Independence principle:** ✅ Fully GitHub-native. But the latency makes it feel like email, not DM.

### Option D: Copilot Extensions API (MCP-based)

**What:** Register Squad as a Copilot Extension. Users invoke `@squad` in Copilot Chat (including mobile). Copilot sends messages to Squad's endpoint. Squad processes and responds via SSE.

**Feasibility:**
- ⚠️ **GitHub App-based extensions deprecated** — new registrations blocked Sept 2025, existing ones stop working Nov 2025
- ✅ VS Code extension-based and MCP server extensions remain supported
- ✅ Would make Squad available in Copilot Chat across all surfaces (desktop, web, mobile)
- ❌ Copilot Extensions don't have the `task` tool — they receive prompts and return text/SSE
- ❌ Squad's multi-agent orchestration doesn't fit the request/response extension model
- ❌ Extensions can't spawn sub-agents within Copilot's runtime
- ❌ Extensions can't access the local filesystem (they're server-side)
- ❌ Significant architectural mismatch — extensions are for single-purpose tools, not orchestrators

**Cost:** Free to register. But the architectural mismatch means we'd be building a different product.

**Complexity:** Very high for Squad's use case. Extensions are designed for "ask a question, get an answer," not "coordinate 5 agents working on your codebase."

**Independence principle:** ❌ This would make Squad a Copilot product, not a product that uses Copilot. Hard no per our team decision from 2026-02-07.

### Verdict: Option A (Copilot SDK), with Option C (GitHub Actions) as Fallback

**Option A** gives us the closest thing to CLI parity in an embeddable form. The SDK is designed for exactly this use case — "build an agent into any app." Squad's Telegram bot IS "any app."

**Option C** is the low-effort fallback if the SDK's Technical Preview isn't ready or the `task` equivalent doesn't exist yet. Higher latency but guaranteed tool availability.

**Options B and D** are wrong for different reasons: B reinvents the wheel at high cost, D forces Squad into an architectural model that doesn't fit.

---

## 3. Dev Tunnels vs. ngrok

Brady specifically requested Dev Tunnels over ngrok. Here's the full analysis.

### Why a Tunnel Is Needed

Telegram's webhook API requires an HTTPS endpoint. If the bot runs on Brady's machine (or any machine behind NAT), we need a tunnel to expose it.

### Dev Tunnels Overview

**What:** Microsoft's tunneling service, built into VS Code and available as a standalone CLI (`devtunnel`). Creates HTTPS endpoints that route to local ports.

**Installation:**
```powershell
winget install Microsoft.devtunnel
```

**Authentication:**
```bash
devtunnel user login -g    # GitHub account login
```

**Creating a persistent tunnel:**
```bash
devtunnel host -p 3000 --allow-anonymous --description "Squad DM bot"
# Output: https://<id>.devtunnels.ms
```

**Installing as a Windows service (persistent across reboots):**
```powershell
devtunnel service install --port 3000 --allow-anonymous
```

### Dev Tunnels vs. ngrok Comparison

| Feature | Dev Tunnels | ngrok |
|---------|-------------|-------|
| **Auth model** | GitHub account (already have) | Separate ngrok account |
| **Identity** | GitHub-native | Third-party |
| **Free tier** | Included with GitHub | Limited (1 agent, 1 domain) |
| **Persistent URLs** | Yes (named tunnels) | Paid feature |
| **Service mode** | `devtunnel service install` | Manual/third-party |
| **HTTPS** | Always | Always |
| **Custom domains** | Yes | Paid |
| **Privacy** | Microsoft/GitHub infra | Third-party infra |
| **CLI available** | `devtunnel` | `ngrok` |
| **Programmatic API** | Yes (Dev Tunnels SDK on GitHub) | Yes |

### Dev Tunnels Advantages for Squad

1. **GitHub-native identity.** `devtunnel user login -g` uses the same GitHub account that owns the repo. No separate credentials.
2. **No additional account.** Brady already has GitHub. ngrok requires a separate signup.
3. **Service mode.** `devtunnel service install` runs as a Windows service — survives reboots, no terminal needed. Perfect for a persistent bot.
4. **Aligns with Squad's GitHub-native philosophy.** Using Microsoft/GitHub infrastructure, not a third-party tunnel provider.
5. **SDK available.** `microsoft/dev-tunnels` on GitHub provides programmatic tunnel management — Squad could create/destroy tunnels automatically.

### Dev Tunnels Limitations

1. **Persistence isn't guaranteed forever.** Tunnels may expire after inactivity (documentation is vague on exact timeout). A keepalive/reconnect strategy is needed.
2. **Requires the `devtunnel` CLI installed.** One more dependency in the setup flow.
3. **Less battle-tested for bot hosting than ngrok.** ngrok has years of bot-hosting patterns documented.

### Recommendation

**Use Dev Tunnels.** The GitHub-native auth model, service mode, and zero-additional-account requirements align perfectly with Squad. For production, consider deploying to a cloud VM where tunnels aren't needed — but for Brady's "DM my squad from my phone" use case, Dev Tunnels on his dev machine is the right v0.1.

---

## 4. GitHub-Native Alternatives (Before Building a Bot)

Before we commit to building a Telegram bot, we should check whether existing GitHub surfaces could serve as a "DM" interface.

### 4a. GitHub Copilot Chat on Mobile

**What it offers:** Copilot Chat is available on GitHub Mobile. It supports `@agent` mentions for custom agents.

**Could it work?**
- ✅ Already exists — no build required
- ✅ Supports custom agents (`.github/agents/squad.agent.md`)
- ❌ **Does NOT have the `task` tool on mobile.** Mobile Copilot Chat has a limited tool set. No `powershell`, no `task`, no `read_agent`. Squad's core orchestration wouldn't work.
- ❌ No filesystem access — can't read `.ai-team/` state
- ❌ No repo context — agents can't see the codebase

**Verdict:** ❌ Not viable. Mobile Copilot Chat is for quick questions, not multi-agent orchestration.

### 4b. GitHub Actions + Issue Comments as "DM"

**What it offers:** Create a private repo. Post comments on a designated issue. Each comment triggers a workflow that runs Squad.

**Could it work?**
- ✅ Fully GitHub-native
- ✅ Works from any device with GitHub access (including mobile)
- ✅ Full CLI environment in the workflow (if Copilot CLI is available)
- ✅ Conversation history preserved in the issue thread
- ⚠️ Latency: 60-120s per response (workflow cold start + execution)
- ❌ Not a DM experience — it's commenting on an issue
- ❌ No push notifications (unless GitHub notification settings are configured)
- ❌ Copilot CLI availability on Actions runners is uncertain

**Verdict:** ⚠️ Viable as a fallback but the UX doesn't match "DM." It's more like an async command interface. Could be a good v0.0 prototype to validate the concept before building a real bot.

### 4c. Copilot Extensions as Bridge

**What it offers:** Register Squad as a Copilot Extension available in all Copilot Chat surfaces.

**Could it work?**
- ❌ GitHub App-based extensions deprecated (Sept/Nov 2025)
- ⚠️ VS Code extension + MCP server approach is still viable but scoped to VS Code
- ❌ Extensions can't spawn sub-agents or access local filesystem
- ❌ Architectural mismatch (covered in Section 2, Option D)

**Verdict:** ❌ Not viable for multi-agent orchestration. Extensions are single-purpose tools.

### 4d. GitHub Mobile + Copilot

**What it offers:** GitHub Mobile has Copilot Chat integration.

**Could it work?**
- Same limitations as 4a — limited tool set, no filesystem access, no `task` tool
- ❌ Not viable for the same reasons

**Verdict:** ❌ Same as 4a.

### Summary of GitHub-Native Alternatives

None of the existing GitHub surfaces provide the `task` tool or filesystem access that Squad requires. **We need to build something.** The question is: what's the thinnest possible thing we can build?

---

## 5. The `.ai-team/` State Problem

Squad's agent memory lives in git. A DM interface needs to read from and write to the repo.

### State Access Requirements

| Operation | Frequency | Examples |
|-----------|-----------|---------|
| **Read repo** | Every message | Charters, histories, decisions, routing, casting |
| **Write repo** | Most messages | New files, history updates, decision inbox |
| **Commit** | After agent work | "Squad DM: updated keaton's history" |
| **Push** | After commits | Sync back to remote |

### Two Architectures

#### Architecture 1: Local Repo (Dev Tunnel Approach)

```
Brady (Telegram) → Telegram API → Dev Tunnel → Bot (local) → Copilot SDK → Local Repo
```

- ✅ Repo is already checked out — instant access
- ✅ No clone/checkout overhead
- ✅ Changes visible in Brady's IDE immediately
- ✅ Full filesystem — `grep`, `glob`, `view` all work natively
- ❌ Requires Brady's machine to be running
- ❌ Dev Tunnel must stay alive
- ❌ Only works for one repo at a time (whichever is checked out)

#### Architecture 2: Cloud Repo (CI/Server Approach)

```
Brady (Telegram) → Telegram API → Server/Action → Clone Repo → Copilot SDK/CLI → Commit + Push
```

- ✅ Works from anywhere, always available
- ✅ No dependency on Brady's machine
- ❌ Clone overhead per interaction (~5-30s for large repos)
- ❌ Merge conflicts if Brady is also working locally
- ❌ Server costs (VM, Actions minutes)
- ❌ More complex git workflow (fetch, merge, push)

### Recommendation: Start with Architecture 1 (Local)

For Brady's stated use case — "keep working with my squad when I'm not at my terminal" — Architecture 1 is simpler and more natural. He has a machine running. The repo is checked out. Dev Tunnel exposes the bot. Messages flow directly to the local environment.

Architecture 2 is the scale play for when Squad DM is a product feature, not a personal tool.

---

## 6. Recommended Architecture: v0.1

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Brady's   │     │   Telegram   │     │   Dev Tunnel     │     │  Squad Bot   │
│   Phone     │────▶│   API        │────▶│   (devtunnels)   │────▶│  (local)     │
│  (Telegram) │     │              │     │                  │     │              │
└─────────────┘     └──────────────┘     └──────────────────┘     │  ┌────────┐  │
                                                                   │  │Copilot │  │
                                                                   │  │  SDK   │  │
                                                                   │  └───┬────┘  │
                                                                   │      │       │
                                                                   │  ┌───▼────┐  │
                                                                   │  │ Squad  │  │
                                                                   │  │Coord.  │  │
                                                                   │  └───┬────┘  │
                                                                   │      │       │
                                                                   │  ┌───▼────┐  │
                                                                   │  │Agents  │  │
                                                                   │  │(spawn) │  │
                                                                   │  └───┬────┘  │
                                                                   │      │       │
                                                                   │  ┌───▼────┐  │
                                                                   │  │ Local  │  │
                                                                   │  │ Repo   │  │
                                                                   │  └────────┘  │
                                                                   └──────────────┘
```

### Components

1. **Telegram Bot** (~50 lines Node.js)
   - Receives messages via webhook
   - Forwards to Squad coordinator via Copilot SDK
   - Sends responses back to Telegram
   - Library: `telegraf` or `node-telegram-bot-api`

2. **Copilot SDK Integration** (~200-400 lines)
   - Creates coordinator session with `squad.agent.md` as system prompt
   - Implements tool handlers: `view`, `edit`, `create`, `grep`, `glob`, `powershell`
   - Implements `task` equivalent: spawn new SDK sessions for sub-agents
   - Collects results, routes back to coordinator

3. **Dev Tunnel** (zero code)
   - `devtunnel host -p 3000 --allow-anonymous`
   - Or installed as service for persistence

4. **Local Repo Access** (zero code)
   - Bot runs in the repo directory
   - All file operations are native `fs` calls

### What We Need to Build

| Component | Lines | Deps | Risk |
|-----------|-------|------|------|
| Telegram bot wrapper | ~50 | `telegraf` | Low |
| Tool implementations | ~150 | `@github/copilot-sdk` | Medium |
| Agent spawning shim | ~200 | `@github/copilot-sdk` | **High** |
| Dev Tunnel setup script | ~20 | `devtunnel` CLI | Low |
| **Total** | **~420** | **2 npm + 1 CLI** | **Medium-High** |

### The Risk

The agent spawning shim is the only high-risk component. If the Copilot SDK supports nested sessions with tool definitions (i.e., we can spawn an "agent" that has its own tools and runs independently), this is straightforward. If not, we need to implement our own mini-orchestrator: create an API call per agent, inject tools, run to completion, collect results. This is doable but increases the line count to ~600-800 and adds complexity.

**Recommendation:** Before writing any code, spike the SDK to verify:
1. Can we create a session with custom tools?
2. Can a tool handler create another session? (This is the `task` equivalent)
3. What's the latency for a session.sendAndWait() call?

---

## 7. Cost and Complexity Matrix

| Approach | Build Cost | Infra Cost | Latency | UX Quality | Independence |
|----------|-----------|------------|---------|------------|--------------|
| **Copilot SDK + Telegram + Dev Tunnel** | Medium (~420 LOC) | $0 (Copilot sub) | 10-30s | ⭐⭐⭐⭐ | ✅ |
| LLM APIs + Telegram + Dev Tunnel | High (~1200 LOC) | $0.50-2/msg | 10-30s | ⭐⭐⭐⭐ | ⚠️ |
| GitHub Actions + Issue Comments | Low (~50 LOC) | Actions mins | 60-120s | ⭐⭐ | ✅ |
| Copilot Extension | Very High | $0 | 5-15s | ⭐⭐⭐ | ❌ |

---

## 8. Open Questions for Keaton

1. **Scope:** Is this a Brady-only personal tool, or a Squad product feature? This determines whether we optimize for one user's machine or for distributed deployment.

2. **Conversation persistence:** Should DM conversations be logged in `.ai-team/`? If so, where? (Propose: `.ai-team/dm-log/` with timestamped session files.)

3. **Multi-repo:** Brady said "my team(s)" — plural. Does the bot need to switch between repos? If so, the local architecture gets more complex (multiple checkouts, routing by repo).

4. **Notification direction:** Brady → Squad is clear. Should Squad → Brady also work? (e.g., "Scribe finished merging decisions" as a push notification.) This is easy with Telegram's `sendMessage` API.

5. **Auth:** Who can message the bot? Just Brady? Anyone with the bot's Telegram handle? For v0.1, hardcode Brady's Telegram user ID.

---

## 9. Phasing Recommendation

### v0.0: Proof of Concept (1 day)
- GitHub Actions + issue comment trigger
- Validate that Squad can run in CI and respond to messages
- No Telegram, no Dev Tunnel, no SDK
- Purpose: prove the concept works before investing in infrastructure

### v0.1: Brady's Personal Bot (2-3 days)
- Copilot SDK spike — verify agent spawning works
- Telegram bot with webhook
- Dev Tunnel for local exposure
- Single repo, single user, local execution
- `npx create-squad dm` to set up

### v0.2: Resilience (1-2 days)
- Dev Tunnel auto-reconnect
- Conversation logging to `.ai-team/dm-log/`
- Error handling and retry logic
- Push notifications (Squad → Brady)

### v0.3: Multi-repo + Cloud (3-5 days)
- Repo selection via Telegram commands (`/repo bradygaster/squad`)
- Cloud deployment option (Azure, Railway, etc.)
- Architecture 2 support (clone-based)
- Multiple provider support (Discord, Slack) if desired

---

## 10. What I Need to Verify

Before this proposal can move to implementation:

1. **Copilot SDK `task` equivalence.** Install `@github/copilot-sdk`, create a session, try to spawn a nested session from a tool handler. This is the go/no-go gate.

2. **Dev Tunnel persistence.** Run `devtunnel service install`, leave it for 24h, verify the tunnel is still alive and the URL is stable.

3. **Telegram webhook + Dev Tunnel.** Set up a minimal Telegram bot, point the webhook at a Dev Tunnel URL, verify messages flow end-to-end.

If gate 1 fails (SDK can't do nested sessions), fall back to Option C (GitHub Actions) for v0.1 and revisit when the SDK matures.

---

## Appendix A: Telegram Bot Setup (Reference)

```javascript
// Minimal Telegram bot with webhook (telegraf)
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('text', async (ctx) => {
  const message = ctx.message.text;
  const userId = ctx.from.id;
  
  // Auth check (Brady only in v0.1)
  if (userId !== parseInt(process.env.BRADY_TELEGRAM_ID)) {
    return ctx.reply("This squad doesn't know you.");
  }
  
  // Forward to Squad coordinator via Copilot SDK
  const response = await runSquadCoordinator(message);
  await ctx.reply(response);
});

// Webhook mode (not polling)
bot.launch({ webhook: { domain: process.env.TUNNEL_URL, port: 3000 } });
```

## Appendix B: Dev Tunnel Setup (Reference)

```powershell
# One-time setup
winget install Microsoft.devtunnel
devtunnel user login -g

# Start tunnel (interactive)
devtunnel host -p 3000 --allow-anonymous

# Install as service (persistent)
devtunnel service install --port 3000 --allow-anonymous

# Get tunnel URL
devtunnel list
```

## Appendix C: GitHub Actions Fallback (Reference)

```yaml
# .github/workflows/squad-dm.yml
name: Squad DM
on:
  issue_comment:
    types: [created]

jobs:
  squad:
    if: startsWith(github.event.comment.body, '/squad ')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Extract message
        id: msg
        run: echo "message=${BODY#/squad }" >> $GITHUB_OUTPUT
        env:
          BODY: ${{ github.event.comment.body }}
      - name: Run Squad (TBD - Copilot CLI in Actions)
        run: echo "Would run Squad with: ${{ steps.msg.outputs.message }}"
      - name: Reply
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🤖 Squad response: (TBD)'
            })
```
