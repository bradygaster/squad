# Proposal 017: Squad DM — Direct Messaging Interface for Squad Teams

**Status:** Deferred — Squad DM deferred to Horizon per Proposal 019  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-08  
**Requested by:** bradygaster

---

## Summary

Let users talk to their Squad from anywhere — phone, tablet, couch, commute — through messaging platforms they already use. Telegram first, then Slack, Discord, and beyond. The team's memory stays in git. The messaging layer is just a new front door.

This isn't "connect Squad to a chatbot." This is: Brady texts Keaton on Telegram, Keaton answers as Keaton, with full access to the project's `.ai-team/` state, decisions, and history. The intimacy of YOUR team, not a generic assistant. MOLTS proved the model — multi-channel AI that lives where you already chat. Squad DM brings that same energy, but with persistent team identity and git-backed memory.

---

## Problem

Today, Squad only works inside the Copilot CLI terminal. You need to be at your desk, in VS Code or a terminal, with `copilot` running. That's fine for deep work — but Brady (and every user like him) doesn't stop thinking about their project when they close their laptop.

**The friction points:**

1. **Location-locked.** Squad only exists inside a terminal session. No access from phone, tablet, or any device without Copilot CLI.
2. **Session-bound.** When you close the terminal, your Squad goes dark. No way to ask "what's the status of X?" without reopening everything.
3. **Single entry point.** The only way to interact with Squad is through the Copilot agent framework's `task` tool. There's no API, no webhook, no alternative interface.
4. **Async gap.** Software development is increasingly async. Brady might think of something at dinner, want to tell Fenster to handle it, and get a confirmation. Right now, that thought becomes a sticky note that gets lost.

**What Brady actually said:** *"I love working with y'all so much I need you to work up a proposal so I can work with you via some sort of direct messaging thing YES LIKE MOLTS but just my team(s)."*

The key phrase: "just my team(s)." Not a generic AI. Not ChatGPT in a Telegram wrapper. His Squad. Keaton, Verbal, McManus, Fenster, Hockney. The characters he knows, with the memory of how they've worked together.

### The MOLTS Reference

MOLTS (formerly Moltbot/Clawdbot, now OpenClaw) is an open-source, self-hosted personal AI assistant that lives inside your messaging platforms — WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and more. It's proactive (initiates tasks, sends reminders), persistent (remembers preferences and context), and local-first (runs on your own machine). It went viral because it proved that AI assistants are dramatically more useful when they meet you where you already chat, instead of forcing you into a new interface.

Brady's instinct is exactly right: Squad should work the same way. But Squad has something MOLTS doesn't — **team identity**. You're not chatting with "an AI." You're chatting with Keaton, who has opinions about your architecture, or Fenster, who remembers the bug you filed last week. That's the magic.

---

## Solution

### Architecture: Option D — Hybrid (Recommended)

After evaluating all four options, the hybrid approach wins because it maximizes flexibility while keeping the orchestration core simple.

#### Options Evaluated

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **A: Bot per platform** | Telegram bot, Slack bot, etc. Each has its own connection to a runner with repo access. | Simple per-platform. Platform-native UX. | Duplicated orchestration logic. Each bot reimplements routing, auth, state access. N platforms = N implementations. | ❌ Doesn't scale. |
| **B: Webhook relay** | Lightweight webhook receiver translates platform messages into Squad agent spawns. | Single orchestration layer. Platform adapters are thin. | Needs a running server to receive webhooks. Where does it run? | ⚠️ Right idea, needs a host. |
| **C: GitHub-native** | Use GitHub Issues, Discussions, or webhook flows as the messaging bridge. | Stays in GitHub ecosystem. No external services. Auth is built-in. | UX is terrible for casual messaging. Nobody wants to create a GitHub Issue to ask Keaton a question. Latency is high. Not real-time. | ❌ Wrong UX for the use case. |
| **D: Hybrid** | Multiple thin platform adapters → single orchestration backend → Copilot CLI or GitHub Actions for execution. | Best of all worlds. Add platforms cheaply. One execution engine. | More moving parts than a single bot. | ✅ Recommended. |

**Why GitHub-native (Option C) fails for DMs but succeeds as a fallback:** GitHub Issues/Discussions could serve as an *asynchronous* channel — "file an issue, Squad picks it up" — but it's not the conversational experience Brady wants. However, it's a great P2 addition as a "works without any setup" channel.

#### The Hybrid Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Telegram    │  │   Slack      │  │  Discord     │
│  Bot         │  │   Bot        │  │  Bot         │
│  (adapter)   │  │  (adapter)   │  │  (adapter)   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │                 │
         ┌──────▼──────────────────▼──────┐
         │     Squad DM Gateway           │
         │                                │
         │  - Message normalization       │
         │  - Auth / user verification    │
         │  - Agent routing (parse @name) │
         │  - Session management          │
         │  - Response formatting         │
         └──────────────┬─────────────────┘
                        │
         ┌──────────────▼─────────────────┐
         │     Execution Engine           │
         │                                │
         │  Option 1: Copilot CLI spawn   │
         │  Option 2: GitHub Actions      │
         │  Option 3: Direct LLM call     │
         │    with agent charter + context│
         └──────────────┬─────────────────┘
                        │
         ┌──────────────▼─────────────────┐
         │     Git-backed State           │
         │                                │
         │  .ai-team/agents/*/history.md  │
         │  .ai-team/decisions.md         │
         │  .ai-team/decisions/inbox/     │
         │  .ai-team/routing.md           │
         │  .ai-team/casting/registry.json│
         └────────────────────────────────┘
```

#### Component Breakdown

**1. Platform Adapters (thin)**

Each adapter handles exactly one concern: translating platform-specific messages into a normalized format and sending responses back. An adapter is ~100-200 lines. It knows nothing about Squad, agents, or git.

```typescript
interface NormalizedMessage {
  platform: "telegram" | "slack" | "discord";
  user_id: string;           // platform-specific user ID
  display_name: string;
  text: string;              // raw message text
  reply_to?: string;         // if replying to a previous message
  thread_id?: string;        // for threaded platforms (Slack)
  timestamp: string;
  platform_metadata: object; // platform-specific data for response routing
}

interface NormalizedResponse {
  text: string;
  agent_name: string;        // "Keaton", "Fenster", etc.
  attachments?: Attachment[]; // code blocks, file diffs, etc.
}
```

**2. Squad DM Gateway (the brain)**

This is the orchestration layer. It receives normalized messages and:

1. **Authenticates** the user (see Trust Model below).
2. **Routes** to the right agent. Parses `@Keaton`, `@Fenster`, or uses routing.md heuristics if no agent is mentioned.
3. **Builds context** by reading the repo's `.ai-team/` directory — the agent's charter, history, decisions.md, and relevant project state.
4. **Spawns execution** via the chosen execution engine.
5. **Formats and returns** the response through the originating platform adapter.

The gateway runs as a Node.js process on the user's machine (or a server with repo access). It needs:
- Read/write access to the git repo (for `.ai-team/` state)
- Network access to receive webhooks from platform adapters
- Credentials for the chosen execution engine

**3. Execution Engine (the hard problem)**

This is where Squad DM diverges from the terminal experience. In Copilot CLI, agents are spawned via the `task` tool — which provides a sandboxed environment with file access, shell access, and other tools. Squad DM can't assume that tool exists. Three execution strategies, used depending on the request type:

| Strategy | When to use | Capabilities | Limitations |
|----------|-------------|-------------|-------------|
| **Direct LLM** | Status queries, opinions, advice, reviews | Full agent personality, reads `.ai-team/` state, fast | No file writes, no shell access, no tool use |
| **Copilot CLI** | Code changes, file operations, complex tasks | Full tool access, same as terminal experience | Requires Copilot CLI installed on gateway host, slower |
| **GitHub Actions** | Async tasks, CI-triggered work, scheduled jobs | Runs in GitHub infrastructure, no local machine needed | Slowest, limited interactivity, costs Actions minutes |

**The tiered approach:**

```
User message → Gateway classifies intent:

  "Keaton, what's the status of export?"
  → QUERY tier → Direct LLM (fast, no tools needed)

  "Fenster, add error handling to the upgrade command"
  → TASK tier → Copilot CLI spawn (needs file access)

  "Hockney, run the full test suite and report"
  → CI tier → GitHub Actions dispatch (needs runner)
```

This maps directly to the tiered response modes from Proposal 007/009. Status queries don't need a full agent spawn. Code changes do.

### Dev Tunnels Integration

Brady specifically asked: if direct connections are needed, use **VS Code Dev Tunnels** instead of ngrok.

Dev Tunnels are relevant in two scenarios:

**Scenario 1: Gateway runs locally, needs webhook ingress.**

Telegram/Slack/Discord send webhooks to a URL. If the gateway runs on Brady's machine, that URL needs to reach localhost. Dev Tunnels provides this.

```bash
# Start the gateway
squad-dm start --port 3847

# In another terminal, expose it
devtunnel host -p 3847 --allow-anonymous
# → https://abc123.devtunnels.ms

# Configure Telegram bot webhook to point to:
# https://abc123.devtunnels.ms/webhook/telegram
```

**Why Dev Tunnels over ngrok:**
- **Microsoft ecosystem.** Auth via Microsoft/GitHub account (no separate ngrok account).
- **Free tier is generous.** Persistent URLs, multi-port, no bandwidth caps for dev use.
- **Enterprise-ready.** Org-level access controls via Entra ID. Matters when Squad goes to teams.
- **Already installed.** Many VS Code users already have it. `winget install Microsoft.devtunnel` for the rest.

**Scenario 2: Persistent tunnel for always-on DM access.**

```bash
# Create a named, persistent tunnel
devtunnel create --name squad-dm --ports 3847
devtunnel host --tunnel squad-dm
# → https://squad-dm-bradygaster.devtunnels.ms (stable URL)
```

This gives Brady a stable webhook URL he can set-and-forget in his Telegram bot config. The URL survives restarts (as long as the tunnel name is reused). For true always-on, the gateway + tunnel run as a system service or in a container.

**Scenario 3: No tunnel needed.**

If the gateway runs on a cloud VM, VPS, or GitHub Codespace with a public IP, Dev Tunnels aren't needed. The gateway just binds to `0.0.0.0:3847` and the platform webhooks hit it directly. This is the simplest production setup but requires infrastructure Brady might not want to manage for a personal tool.

---

## What "Working with Squad" Means in a DM Context

### Interaction Patterns

**Pattern 1: Status query (Direct LLM tier)**

```
Brady → Telegram:
  @Keaton what's the status of the export feature?

Keaton → Telegram:
  Export (Proposal 008) is approved but not yet in progress.
  Fenster estimated 11-14h for full implementation. Sprint plan
  (009) has it in Sprint 2, blocked on history split.

  The history split itself is ~1h of template work. Want me to
  prioritize it?
```

How it works: Gateway reads `decisions.md`, agent histories, and proposal files. Builds a context window with Keaton's charter + relevant project state. Direct LLM call with Keaton's personality. No tools needed.

**Pattern 2: Code task (Copilot CLI tier)**

```
Brady → Telegram:
  @Fenster add error handling to the upgrade command in index.js

Fenster → Telegram:
  On it. I'll wrap the file operations in try/catch and add
  user-friendly error messages for common failures.

  [5 minutes later]

Fenster → Telegram:
  ✅ Done. Committed to branch `fenster/upgrade-error-handling`:
  - Added try/catch around copyRecursive and fs operations
  - Specific error messages for ENOENT, EACCES, ENOSPC
  - Graceful exit with cleanup on failure
  
  3 files changed. Want me to open a PR?
```

How it works: Gateway spawns a Copilot CLI session with Fenster's charter as context. The CLI has full file access to the repo. Fenster works, commits, and the gateway relays the result back to Telegram.

**Pattern 3: Team-wide question (Coordinator routing)**

```
Brady → Telegram:
  What should we prioritize this week?

Squad → Telegram:
  Routing to Keaton (Lead) for prioritization...

Keaton → Telegram:
  Based on the sprint plan and current state:
  
  1. 🔴 P015 silent success fix (Sprint 1, Day 1 — trust before features)
  2. 🟡 Forwardability (Sprint 1 — upgrade path for existing users)
  3. 🟡 History split (Sprint 2 prerequisite)
  
  P015 is unblocked and zero-risk. Should I have Fenster start?
```

How it works: No `@agent` prefix → Gateway uses routing.md to determine who handles it. Prioritization questions route to Keaton.

**Pattern 4: Multi-agent coordination**

```
Brady → Telegram:
  I need a new proposal for webhook support. Keaton should
  architect it, Verbal should review the prompts.

Squad → Telegram:
  Spawning Keaton for architecture, will route to Verbal for
  prompt review after.

Keaton → Telegram:
  [Proposal draft...]
  
  Routing to Verbal for prompt review.

Verbal → Telegram:
  [Review comments...]
```

How it works: Gateway parses multi-agent intent, spawns sequentially with handoff (same as coordinator chaining in terminal mode). Each agent's response is relayed as it completes.

### What's Different from Terminal Mode

| Capability | Terminal (today) | DM (proposed) |
|-----------|-----------------|---------------|
| Agent spawning | `task` tool (Copilot CLI) | Gateway-managed (tiered) |
| File access | Full (local filesystem) | Via gateway host's filesystem |
| Tool use | All Copilot CLI tools | Copilot CLI tools (task tier only) |
| Interactivity | Real-time back-and-forth | Async message/response |
| Context window | 128K+ tokens | Same (depends on LLM provider) |
| Parallel fan-out | Multiple `task` calls | Sequential or queued (P1) |
| Coordinator | squad.agent.md in Copilot | Gateway reimplements routing |

**The key architectural difference:** In terminal mode, the coordinator (squad.agent.md) runs inside Copilot and uses the `task` tool to spawn agents. In DM mode, the Gateway IS the coordinator. It reads routing.md and agent charters, but the spawning mechanism is different — it either calls an LLM API directly or invokes Copilot CLI as a subprocess.

This means the coordinator logic currently embedded in `squad.agent.md` (~32KB) needs to be partially extracted into the Gateway. Not duplicated — extracted. The routing rules, agent selection heuristics, and parallel fan-out decisions should become a shared module that both `squad.agent.md` and the Gateway can reference.

---

## Trust and Security Model

### Authentication

**Who can message the Squad?**

Only authorized users. For MVP, this means Brady and nobody else.

```json
// .ai-team/dm-config.json
{
  "dm_version": "1.0",
  "authorized_users": [
    {
      "github_username": "bradygaster",
      "platforms": {
        "telegram": { "user_id": "123456789" },
        "slack": { "user_id": "U0XXXXXXX" }
      }
    }
  ],
  "gateway": {
    "port": 3847,
    "execution_tiers": {
      "query": "direct_llm",
      "task": "copilot_cli",
      "ci": "github_actions"
    }
  }
}
```

**Auth flow per platform:**

1. **Telegram:** Bot uses a secret token. First message triggers a verification flow: Gateway sends a challenge code to verify the Telegram user_id matches the config. One-time setup.
2. **Slack:** OAuth2 flow during bot installation. Slack user ID mapped to GitHub username in config.
3. **Discord:** Similar to Telegram. Bot token + user ID verification.

**Auth escalation for teams (P3):**

When multiple people share a Squad (org teams), auth maps platform identities to GitHub usernames. Permissions follow GitHub repo permissions — if you can push to the repo, you can message the Squad. Read-only contributors can query but not trigger tasks.

### Repo Access

The Gateway needs access to the git repository. Three models:

| Model | Security | Setup | Best for |
|-------|----------|-------|----------|
| **Local clone** | Highest — repo never leaves the machine | Gateway runs where the repo is | Solo developers (Brady) |
| **SSH key** | High — standard git auth | Gateway has deploy key for the repo | Small teams |
| **GitHub App** | Medium — token-scoped | Install GitHub App with repo access | Organizations |

For MVP, local clone. The Gateway runs on Brady's machine (or a machine where the repo is cloned). It reads `.ai-team/` directly from the filesystem. Writes (decision inbox, history appends) go to the local clone. Brady pushes when ready.

### Execution Security

- **Direct LLM tier:** Read-only access to `.ai-team/`. Cannot modify files. Safe.
- **Copilot CLI tier:** Full file access. Same security model as running Copilot locally. The Gateway spawns Copilot in the repo directory with the agent's charter. Changes are committed to a branch (never main directly).
- **GitHub Actions tier:** Runs in GitHub's infrastructure with the repo's configured permissions. Standard Actions security model.

**Rate limiting:** Gateway enforces per-user rate limits to prevent abuse if a bot token is leaked. Default: 30 messages/hour for queries, 10/hour for tasks.

### Secret Management

- Platform bot tokens stored in `.env` (gitignored) or system keychain.
- LLM API keys (for direct LLM tier) stored similarly.
- Dev Tunnel auth handled by `devtunnel user login` (cached credential, not stored in repo).
- `.ai-team/dm-config.json` is committed (contains user mappings, not secrets).

---

## Implementation Phases

### Phase 1: MVP — Telegram + Direct LLM (2-3 days)

**Goal:** Brady can text his Squad from Telegram and get real answers with full agent personality.

**Scope:**
- Telegram bot adapter (node-telegram-bot-api or grammy)
- Gateway with message normalization and agent routing
- Direct LLM execution only (queries, opinions, status — no code changes)
- Reads `.ai-team/` from local filesystem for context
- Single authorized user (Brady)
- Dev Tunnel for webhook ingress

**What it looks like:**

```bash
# Setup (one-time)
npx create-squad dm init --telegram
# Prompts for Telegram bot token (from @BotFather)
# Writes .ai-team/dm-config.json
# Writes .env with TELEGRAM_BOT_TOKEN and LLM_API_KEY

# Start
npx create-squad dm start
# → Gateway listening on port 3847
# → Telegram webhook configured via Dev Tunnel
# → Connected to repo: /path/to/project

# In Telegram:
# Brady: @Keaton what did we decide about forwardability?
# Keaton: [responds with full context from decisions.md]
```

**Implementation:**
- New file: `dm/gateway.js` — core orchestration (~300 lines)
- New file: `dm/adapters/telegram.js` — Telegram adapter (~150 lines)
- New file: `dm/context.js` — reads `.ai-team/` and builds agent context (~200 lines)
- New file: `dm/auth.js` — user verification (~100 lines)
- Modified: `index.js` — adds `dm` subcommand routing
- New: `.ai-team/dm-config.json` schema

**Not in Phase 1:** Code changes, file writes, Copilot CLI integration, multi-user, Slack/Discord.

**Why this is the right MVP:** It validates the core thesis — can Brady have a real conversation with his agents from his phone? If the personality feels right and the context is accurate, everything else is execution. If it doesn't feel like talking to Keaton, more features won't fix it.

### Phase 2: Code Execution + Multi-Platform (1-2 weeks)

**Goal:** Brady can request actual code changes from Telegram, and the same system works on Slack and Discord.

**Scope:**
- Copilot CLI execution tier (spawn Copilot with agent charter for file operations)
- GitHub Actions execution tier (dispatch workflows for CI tasks)
- Slack adapter
- Discord adapter
- Branch-based commits (never write to main from DM)
- Response threading (long task responses don't flood the chat)
- Message queuing (multiple messages don't clobber each other)

**Key challenge:** Copilot CLI spawning from the gateway. The gateway needs to:
1. Build a prompt that includes the agent's charter, relevant history, and the user's message.
2. Invoke `copilot` (or `gh copilot`) with that prompt in the repo directory.
3. Capture the output and relay it back to the platform.
4. Handle timeouts (some tasks take minutes).

```bash
# Conceptual: gateway spawns Copilot for a task
copilot --agent squad --message "Fenster, add error handling to upgrade" \
  --repo /path/to/project \
  --non-interactive
```

If Copilot CLI doesn't support non-interactive invocation (current limitation), the fallback is direct LLM API calls with tool definitions that mirror Copilot's tool set (file read/write, shell execution). This is more work but gives full control.

### Phase 3: Full Parity with Terminal Experience (2-4 weeks)

**Goal:** Everything you can do in the terminal, you can do from a DM. Plus things you can't do in the terminal.

**Scope:**
- Parallel agent fan-out from DM (multiple agents working simultaneously)
- Coordinator protocol (gateway fully implements squad.agent.md routing logic)
- Proposal workflow from DM ("write a proposal for X" → proposal created and committed)
- Review workflow from DM ("review Fenster's PR" → reviewer agent spawned)
- Proactive notifications (agent finishes background task → DM notification)
- Always-on mode (gateway as system service, persistent Dev Tunnel)
- Multi-repo support (one gateway, multiple Squad projects)
- Team access (multiple authorized users per Squad)

**New capabilities beyond terminal:**
- **Proactive DMs:** Agent completes a CI run → sends result to Telegram without being asked.
- **Scheduled check-ins:** "Every morning at 9am, Keaton summarizes what's in progress."
- **Cross-device handoff:** Start a conversation on phone, continue in terminal seamlessly.
- **Notification preferences:** "Only DM me for failures, not successes."

---

## Data Structures

### dm-config.json

```json
{
  "dm_version": "1.0",
  "squad_project": "bradygaster/squad",
  "gateway": {
    "port": 3847,
    "tunnel": {
      "provider": "devtunnel",
      "name": "squad-dm",
      "auto_start": true
    },
    "execution": {
      "query_tier": "direct_llm",
      "task_tier": "copilot_cli",
      "ci_tier": "github_actions"
    },
    "rate_limits": {
      "queries_per_hour": 30,
      "tasks_per_hour": 10
    }
  },
  "authorized_users": [
    {
      "github": "bradygaster",
      "telegram_id": "123456789"
    }
  ],
  "platforms": {
    "telegram": {
      "enabled": true,
      "bot_username": "SquadDMBot"
    }
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

### Message Flow Schema

```typescript
interface GatewayMessage {
  id: string;
  timestamp: string;
  source: NormalizedMessage;
  parsed: {
    target_agent: string | null;  // "@Keaton" → "keaton", null → coordinator routes
    intent: "query" | "task" | "ci";
    message_body: string;
  };
  execution: {
    tier: "direct_llm" | "copilot_cli" | "github_actions";
    context: AgentContext;
    status: "pending" | "executing" | "completed" | "failed";
    response?: NormalizedResponse;
    duration_ms?: number;
  };
  auth: {
    github_username: string;
    verified: boolean;
  };
}

interface AgentContext {
  agent_name: string;
  charter: string;           // from .ai-team/agents/{name}/charter.md
  history: string;           // from .ai-team/agents/{name}/history.md
  decisions: string;         // from .ai-team/decisions.md (truncated to recent)
  routing: string;           // from .ai-team/routing.md
  project_description: string;
}
```

---

## Trade-offs

**What we gain:**
- Squad becomes accessible from anywhere — phone, tablet, another computer, on the go
- The "MY team" feeling extends beyond the terminal. Chatting with Keaton on Telegram is more intimate than typing in a CLI
- Opens a fundamentally new interaction modality. DM-first users may never use the terminal at all
- Proactive notifications (P3) make Squad feel alive — it reaches out to you, not just responds
- Aligns with MOLTS/Moltbot momentum — multi-channel AI assistants are what users expect

**What we give up:**
- Complexity. The gateway is a new component to build and maintain. Platform adapters need updating when APIs change
- LLM costs. Direct LLM tier requires API keys and costs money per query. Copilot CLI tier uses existing Copilot subscription
- Security surface. A running gateway with platform bot tokens and repo access is a target. Must be locked down
- Partial parity. Phase 1 can only answer questions, not change code. Users will immediately want Phase 2

**What gets harder:**
- Coordinator logic duplication. `squad.agent.md` and the Gateway both need routing logic. Drift between them is a risk. Long-term, extract routing into a shared format
- Testing. DM interactions are harder to test than CLI interactions. Need mock platform adapters and recorded message flows
- Context window management. Reading all of `.ai-team/` for every message is expensive. Need smart truncation — recent decisions only, relevant history sections only
- State consistency. Gateway reads/writes to local git. If Brady also has Copilot open in the terminal, they might race on `.ai-team/` state. Need file-level locking or accept eventual consistency

---

## Alternatives Considered

### Alternative 1: GitHub Issues/Discussions as the only interface

**What:** Brady creates a GitHub Issue titled "Keaton: what's the status of export?" A GitHub Action picks it up, spawns the agent, posts the response as a comment.

**Why not for DM:** The UX is wrong. Creating an Issue is 10x more friction than sending a Telegram message. Issues are for tracking, not chatting. The latency (Actions spin-up) makes it feel dead.

**Why it's still valuable:** As a P2 fallback channel for teams that can't run a gateway. Zero infrastructure needed. Could be the "works everywhere" baseline while Telegram/Slack are the "works great" options.

### Alternative 2: Slack-only (skip Telegram)

**What:** Build exclusively for Slack, which has the richest bot API, threads, and enterprise adoption.

**Why not:** Brady specifically asked for Telegram. Slack is great for teams but overkill for a solo developer chatting with their Squad. Telegram is simpler (no workspace needed), has a better mobile experience, and the bot API is straightforward. Slack is the right P2 target.

### Alternative 3: Custom mobile app

**What:** Build a Squad DM iOS/Android app.

**Why not:** Massive scope increase. App store reviews, platform maintenance, push notifications, offline mode. A messaging bot achieves 90% of the value at 10% of the cost. Maybe v3 if Squad becomes a product company.

### Alternative 4: SMS/iMessage via Twilio

**What:** Text your Squad from any phone. No app install needed.

**Why not for P1:** Twilio costs money per message. SMS has length limits. No rich formatting (code blocks, diffs). But it's a compelling P3 add-on for true "any device" access.

### Alternative 5: Email interface

**What:** Email keaton@squad.bradygaster.dev, get a response.

**Why not:** Email is async and slow. The DM experience should feel conversational, not like filing a support ticket. But again — interesting P3 channel for organizations that live in email.

### Alternative 6: Run everything through GitHub Actions

**What:** No gateway at all. Platform webhooks trigger GitHub Actions directly. Actions run Copilot and post responses.

**Why not:** Actions have cold-start latency (15-45 seconds). For a "what's the status?" question, that's unacceptable. Actions minutes cost money. And you lose the local-first filesystem access that makes Squad's memory model work. Good for CI-tier tasks, wrong for conversational use.

---

## Success Criteria

1. **The Telegram test:** Brady texts "@Keaton what did we decide about forwardability?" from his phone and gets a response that sounds like Keaton, references the actual decision from decisions.md, and arrives within 10 seconds.

2. **Agent personality preservation:** Responses via DM are indistinguishable in voice and personality from responses in the terminal. Keaton is opinionated. Fenster is precise. McManus is polished. The platform doesn't dilute the character.

3. **Context accuracy:** DM responses reference real project state — actual proposals, actual decisions, actual history. No hallucinated project details.

4. **Auth lockdown:** Unauthorized Telegram users who discover the bot get no response. No project information leaks through the messaging platform.

5. **Dev Tunnel reliability:** Gateway starts, tunnel connects, webhook receives messages — all within 30 seconds of `squad-dm start`. Tunnel survives sleep/wake cycles on Brady's laptop.

6. **Phase 1 → Phase 2 upgrade path:** Adding Copilot CLI execution tier doesn't require rewriting the gateway. The tiered architecture is real, not aspirational.

---

## Open Questions

1. **LLM provider for Direct LLM tier:** Copilot CLI uses GitHub's model access. The gateway's direct LLM tier needs its own model access. Options: OpenAI API key, Azure OpenAI, Anthropic, or — ideally — GitHub Models (keeps it in ecosystem). Does GitHub Models have a programmatic API suitable for this?

2. **Copilot CLI non-interactive mode:** Can `copilot` / `gh copilot` be invoked programmatically with a message and return a response? If not, Phase 2 needs to either contribute that feature upstream or use direct LLM calls with custom tool definitions.

3. **Gateway hosting for always-on:** Phase 1 runs locally. For always-on DM access, the gateway needs to run somewhere persistent. Options: home server, VPS, GitHub Codespace (expensive for always-on), Docker container on a NAS. What's Brady's preferred hosting model?

4. **Multi-repo gateway:** Should one gateway serve multiple Squad projects? If Brady has 5 repos with Squads, does he run 5 gateways or 1 gateway that routes to the right repo? The DM UX would need a way to specify which project: "@Keaton [squad] what's the status?" vs separate Telegram bots per project.

5. **Message history:** Should DM conversations be persisted in `.ai-team/`? They're a form of project interaction that might contain decisions or preferences. But they could also be noise. Proposal: persist DM logs to `.ai-team/dm-log/` with same rotation policy as orchestration-log.

6. **Relationship to Proposal 008 (Portable Squads):** If a Squad is exported and imported into a new project, does the DM config travel? The bot token doesn't (it's a secret), but the gateway configuration and user mappings might. Should `dm-config.json` be in the export manifest?

---

**Review requested from:** Fenster (gateway implementation feasibility), Kujan (platform integration, Copilot CLI invocation), Verbal (agent personality preservation in DM context), McManus (DM UX and messaging), bradygaster (vision alignment — is this what you meant?)  
**Approved by:** [Pending]  
**Implemented:** [Pending]  
**Retrospective:** [Pending]
