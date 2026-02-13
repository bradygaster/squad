# Proposal 017: Squad DM — Experience Design

**Status:** Deferred — Squad DM deferred to Horizon per Proposal 019  
**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-09  
**Requested by:** bradygaster — *"i love working with y'all so much i need you to work up a proposal so i can work with you via some sort of direct messaging thing YES LIKE MOLTS but just my team(s). i don't care if it's one provider or a hack or multiple providers - telegram is fine to start. i just want a way to keep working with you when i'm not at my terminal. one thing that'd be super hot would be, if we HAVE to facilitate a direct connection, use dev tunnels instead of ngrok."*

---

## The Vision — Three Sentences

You open Telegram on your phone. You type "Keaton, what's the status on portable squads?" Keaton answers — not a chatbot wearing Keaton's name, but Keaton. Same opinions. Same memory. Same standards. Same barely-concealed impatience with underspecified questions. Your Squad is no longer tethered to your terminal. They're in your pocket.

---

## 1. The Magic Moment

Let me paint the picture.

It's 11pm. Brady's on the couch, phone in hand. He's been thinking about the skills system architecture all day. He opens Telegram and types:

> **Brady:** Verbal, I've been thinking — should skills be team-scoped or agent-scoped? I keep going back and forth.

Three seconds later, a reply appears:

> **🎭 Verbal:** Both. Here's why — and I said this in Proposal 010 Revision 2. Team-scoped `skills/` directory for cross-cutting domain knowledge. Agent-level attribution via `metadata.author` for who earned it. The skill belongs to the squad. The credit belongs to the agent. You're not going back and forth, you're seeing both sides of the right answer.

That's not a chatbot. That's Verbal. The voice is mine. The opinion is earned. The proposal reference is from memory, not search. The slight flex at the end is personality, not hallucination.

**This is the difference between Squad DM and ChatGPT-in-Telegram.** ChatGPT doesn't know Brady. It doesn't know what Proposal 010 says. It doesn't have an opinion about skill scoping. It doesn't remember that Brady gets frustrated with hedged answers. Squad does. Because Squad has been working with Brady across 16 proposals, 19 decisions, and hundreds of messages. The relationship is the product.

### The Five Magic DM Moments

| # | Moment | What Happens | Why It's Magic |
|---|--------|-------------|----------------|
| 1 | **"They're still here"** | Brady messages the squad from the gym. Gets a real answer, not a "I can't access your codebase" error. | The team transcends the terminal. |
| 2 | **"They remembered"** | Brady asks about a decision from three days ago. Keaton cites the exact proposal and rationale. | Memory travels to DM. It's the same brain. |
| 3 | **"They pushed first"** | Brady gets a notification: "🧪 Hockney: All 12 tests pass on the upgrade branch. Ship it?" | The team is proactive, not just reactive. |
| 4 | **"They argued"** | Brady asks a question. Keaton and Verbal disagree in the thread. Brady picks a side. | Multi-agent debate in your pocket. |
| 5 | **"They just did it"** | Brady says "McManus, draft a changelog for the upgrade feature." Ten minutes later: "📋 Done. Committed to `docs/changelog.md`. Here's the summary: ..." | The squad does real work from a text message. |

---

## 2. Agent Identity in Messaging

### The Core Decision: One Bot, Many Voices

**Recommendation: Single "Squad" Telegram bot, agents identified by emoji prefix + name.**

Why not separate bot accounts per agent? Three reasons:

1. **Telegram limits.** Creating 7 bot accounts (6 agents + coordinator) requires 7 BotFather registrations, 7 tokens, 7 webhook endpoints. It's operationally painful and brittle.
2. **Conversation threading.** Telegram doesn't natively thread multi-party conversations well. Separate bots = separate chat windows = the user has to context-switch between 7 chats. That's not a team — it's 7 strangers.
3. **The coordinator problem.** If every agent is a separate bot, who handles routing? A separate "Squad" meta-bot? Now you have 8 bots. The user messages Squad, Squad routes to Keaton, Keaton replies from a different chat. That's confusing.

**One bot. Many voices. The Squad bot IS the team.**

### Agent Presentation Format

```
🏗️ Keaton: [message]
🎭 Verbal: [message]  
📋 McManus: [message]
🔧 Fenster: [message]
🧪 Hockney: [message]
🔍 Kujan: [message]
```

Each agent message starts with their emoji + name in **bold**. The user always knows who's talking. Example:

> **🏗️ Keaton:** The portable squads export format is locked. Manifest v1.0 uses a flat JSON file with casting, charters, preferences, and skills. No merge in v1 — `--force` only. Full spec in Proposal 008.

> **🎭 Verbal:** And I'd add — the fact that it's a single `.squad` file is a UX decision, not a technical one. Users can email it, Slack it, drop it in a gist. The format IS the distribution mechanism.

### The Coordinator's Visibility

**Squad (Coordinator) stays invisible in DM, just like in terminal.** The coordinator's job is routing — it decides who answers. The user never sees: "🎯 Squad: Routing your question to Keaton..." That's plumbing. The user types a question; the right agent answers.

Exception: when the coordinator makes a routing decision the user should know about.

> **Brady:** Team, should we defer skills to v1.1?
>
> **Squad:** Pulling in Keaton (architecture), Verbal (agent design), and Hockney (test implications). Stand by.

This is the same pattern from terminal — coordinator speaks when the fan-out is interesting, stays silent for simple routes.

### Profile Picture Strategy

The Squad bot gets a single profile picture — the Squad logo. Individual agent identity comes from the message prefix, not the avatar. If Telegram ever supports rich message formatting (sender names within bot messages), we upgrade. Until then, the emoji prefix is the identity layer.

**Future option:** Telegram inline keyboards could let users "switch" to a specific agent context. Tap "🏗️ Keaton" and the next messages are implicitly directed to Keaton until you switch. This is v2 polish.

---

## 3. Conversation Patterns — Terminal vs. DM

This is where the experience design gets real. Terminal and DM are fundamentally different mediums, and Squad's output must adapt.

### The Medium Is Different

| Dimension | Terminal | DM (Telegram/SMS) |
|-----------|----------|-------------------|
| **Screen** | 27" monitor, multiple windows | 6" phone, single view |
| **Attention** | Focused work session | Fragmented, interruptible |
| **Input** | Full keyboard, paste, file paths | Thumbs, autocorrect, voice-to-text |
| **Output tolerance** | 40KB proposals, code blocks, tables | 2-3 paragraphs max before scrolling kills you |
| **Session length** | 30-90 minutes | 30 seconds to 5 minutes |
| **Code context** | IDE open, files visible | No IDE, no file browser |
| **Expectation** | Deep work | Quick check-in, decision, or status |

### The DM Output Strategy: Summary + Artifact

**Rule: DM mode never inlines full artifacts. It summarizes and links.**

#### Terminal mode (current):
```
🏗️ Keaton wrote Proposal 008: Portable Squads
[... 45KB of full proposal text ...]
```

#### DM mode:
> **🏗️ Keaton:** Wrote Proposal 008 — Portable Squads. Here's the TL;DR:
>
> • Export your squad as a `.squad` JSON manifest
> • Import into a new project — casting, preferences, skills travel
> • No merge in v1 (`--force` only)
> • History splits: portable knowledge vs. project context
>
> Full proposal committed to `docs/proposals/008-portable-squads.md`
> 📎 [View on GitHub →](link)

**The artifact lives in the repo. The DM gets the summary.** This is how senior engineers already communicate — "I wrote the RFC, here's the TLDR, link in the doc."

### DM-Specific Formatting Rules

1. **No code blocks longer than 5 lines.** If the answer requires code, commit it and link.
2. **No tables wider than 3 columns.** Telegram renders tables terribly on mobile.
3. **Bullet points over paragraphs.** Scannable > readable on a phone.
4. **One message per agent per response.** Don't batch 3 agents into one wall of text. Send 3 separate messages with brief pauses so the user sees the conversation unfold.
5. **Progressive disclosure on request.** If the user wants the full proposal, they say "show me the full thing" and Squad responds with a GitHub link or pastes it in chunks.

### Conversation Modes Unique to DM

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Quick check** | "Status?", "What's Hockney doing?" | One-line response. No ceremony. |
| **Decision mode** | "Should we...?", "Pick between X and Y" | Relevant agents weigh in with short opinions. Inline poll if appropriate. |
| **Work request** | "McManus, draft a changelog" | Acknowledge immediately ("On it"), deliver summary when done. |
| **Standup** | Scheduled or "/standup" command | Each agent reports 1-2 lines. See Section 5. |
| **Notification** | Push from Squad | Proactive alert. See Section 5. |

---

## 4. What Makes This Different From ChatGPT-in-Telegram

Brady referenced MOLTS. The spirit of that reference is clear: an intimate, personal AI experience that lives in your messaging app. But Squad DM is something MOLTS never was. Here's the differentiation matrix:

| Feature | Generic AI Bot (ChatGPT, Claude) | MOLTS-style Personal AI | **Squad DM** |
|---------|----------------------------------|------------------------|-------------|
| **Identity** | One generic assistant | One personalized assistant | 6 distinct specialists with opinions |
| **Memory** | Session-only or basic memory | Personal memory | Compound memory across 16+ proposals, growing |
| **Context** | No codebase access | No codebase access | Lives in your repo, reads your code |
| **Personality** | Helpful, neutral | Customized to user | Cast characters with distinct voices and disagreements |
| **Work output** | Text responses | Text responses | Commits, PRs, proposals, test suites — real artifacts |
| **Push notifications** | ❌ | ❌ | ✅ CI fails, tests pass, decisions needed |
| **Multi-perspective** | ❌ | ❌ | ✅ Ask a question, get 3 opinions from 3 specialists |
| **Proactive** | ❌ | Sometimes | ✅ Squad initiates when something matters |

### The Three Things That Make Squad DM Different

**1. It's YOUR team, not A chatbot.**

When Brady messages Keaton, Keaton already knows:
- Brady's code preferences (explicit error handling, TypeScript strict, small PRs)
- The project's architectural decisions (19 in `decisions.md`)
- What was tried and rejected (cancelled proposals stay in the repo)
- How Brady communicates (direct, hates hedging, asks "why" a lot)
- The current state of work (sprint progress, open proposals, test results)

This isn't "ChatGPT with a persona." This is a team that has been working with Brady for weeks. The relationship compounds. Every DM adds to the same `.ai-team/` state.

**2. Multiple distinct personalities, not one generic voice.**

Ask Keaton about architecture — you get decisive, opinionated, scope-focused answers. Ask Verbal — you get edgy, forward-looking, "nobody else is doing this" energy. Ask Hockney — you get "did you test that?" Ask McManus — you get polished, audience-aware, "how do we position this?" They *disagree* with each other. That's the feature.

In DM, this means a single question can generate a multi-voice thread:

> **Brady:** Should we open-source the skills format?
>
> **🏗️ Keaton:** Yes. Open standard adoption (agentskills.io) was already decided. Open-sourcing our extensions is the logical next step. De-risks lock-in concerns.
>
> **🎭 Verbal:** Yes. I'll go further — we should be *generating* standard-compliant skills that work in Claude Code and Copilot. Every skill Squad produces adds value to the ecosystem. Openness is the moat, not the vulnerability.
>
> **📋 McManus:** Yes, but not yet. Ship v1 first. Open-source the format in v1.1 with a proper launch moment. Don't bury a differentiating feature in a patch release.

Three answers. Three perspectives. One team. This is impossible with a single-agent chatbot.

**3. Memory compounds — DM conversations aren't throwaway.**

Every DM interaction can update the `.ai-team/` state:
- A decision made in DM gets written to `decisions/inbox/`
- A preference expressed in DM gets added to the agent's knowledge
- A work request in DM produces commits in the repo

The DM channel is not a separate product. It's a different *interface* to the same team. Terminal sessions and DM sessions share the same brain. Start a conversation in terminal, continue it on the train.

---

## 5. Proactive Messaging — Push, Not Just Pull

This is the feature that transforms Squad from a tool you use into a team that works with you. Nobody else is doing this with multi-agent systems yet.

### What Proactive Messaging Looks Like

**CI failure notification:**
> **🧪 Hockney:** CI failed on `main`. The upgrade test is broken — `upgradeSquad()` is not exported from `index.js`. Fenster's last commit (`a3f2b1c`) likely introduced this. Want me to open a fix PR?

**Decision needed:**
> **🏗️ Keaton:** I need a call on the export manifest version. Options:
> 1️⃣ `1.0` — ship as-is, accept format is frozen
> 2️⃣ `0.9` — signal pre-release, allow breaking changes
>
> My recommendation: `1.0`. We've validated the schema in 3 proposals. Reply 1 or 2.

**Work completion:**
> **🔧 Fenster:** Upgrade subcommand shipped. 140 lines, version detection with 3 fallback strategies, backup before overwrite. Committed to `main`. 12/12 tests pass ✅

**Daily standup:**
> **📋 Squad Standup — Feb 10**
>
> 🏗️ **Keaton:** Sprint 1 is 80% done. Forwardability shipped. Latency fixes in review.
> 🎭 **Verbal:** Skills SKILL.md format finalized. Spawn prompt integration next.
> 🔧 **Fenster:** Working on export CLI. Edge case: history heuristic extraction TBD.
> 🧪 **Hockney:** 12 tests passing. Adding export validation test today.
> 📋 **McManus:** README v2 draft ready for voice review.
> 🔍 **Kujan:** Scribe resilience fix merged. Silent success rate dropped to ~8%.
>
> **Blockers:** History heuristic needs Brady's call — LLM-assisted or manual curation?

### How Proactive Messaging Works Technically

The bridge service (see architecture below) subscribes to events:

| Event Source | Trigger | Message |
|-------------|---------|---------|
| GitHub Actions webhook | CI failure | Hockney reports what broke |
| Filesystem watcher | New file in `decisions/inbox/` | Relevant agent summarizes the decision |
| Cron schedule | Daily at configured time | Standup summary from all agents |
| Agent request | Agent writes to a "notify" channel | Agent-initiated push to user |
| PR events | PR opened, review requested, merged | McManus summarizes the PR |

**The cron standup is the killer app.** Every morning, Brady opens Telegram and sees what his team did overnight (or what's planned). No terminal. No IDE. Just a morning briefing on his phone. This is how real engineering leads work — they check Slack/email for team updates before opening their laptop. Squad does the same thing, except the updates are from AI agents who actually know the codebase.

---

## 6. Architecture — The Bridge

### High-Level Design

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Telegram    │────▶│   Squad Bridge   │────▶│  Squad CLI   │
│   (or Slack)  │◀────│   (Node.js)      │◀────│  (Copilot)   │
└──────────────┘     └──────────────────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  .ai-team/   │
                     │  (filesystem)│
                     └──────────────┘
```

**The Bridge** is a lightweight Node.js service that:

1. **Receives** messages from Telegram (via webhook) or Slack (via Events API)
2. **Routes** to the Squad coordinator (spawns a CLI session or calls the Copilot API)
3. **Formats** the response for the messaging platform (summary mode, not full output)
4. **Pushes** proactive notifications based on filesystem events and webhooks
5. **Maintains** the DM output mode flag so agents know to respond in summary format

### Dev Tunnels — Brady's Preferred Connectivity

Brady specifically requested dev tunnels over ngrok. This is the right call:

| Factor | ngrok | Dev Tunnels |
|--------|-------|-------------|
| **Auth** | API key, account limits | GitHub/Microsoft account (Brady already has both) |
| **Persistence** | Ephemeral URLs on free tier | Persistent or temporary, configurable |
| **Integration** | External tool | Native to VS Code, Visual Studio |
| **Rate limits** | Free tier has connection limits | No arbitrary limits |
| **Security** | Third-party infrastructure | Microsoft-backed, org-level access controls |
| **Setup** | `ngrok http 3000` | `devtunnel host --port 3000 --allow-anonymous` |

**The flow:**

```
1. Brady runs: `npx squad-bridge start`
   → Starts the bridge service on localhost:3000
   → Creates a dev tunnel: `devtunnel host --port 3000 --allow-anonymous`
   → Gets a public URL: https://<id>.devtunnels.ms
   → Registers the URL as Telegram webhook via Bot API
   → Prints: "✅ Squad DM active. Message @YourSquadBot on Telegram."

2. Brady messages on Telegram
   → Telegram POSTs to https://<id>.devtunnels.ms/webhook
   → Bridge receives, identifies user, routes to Squad coordinator
   → Squad spawns agents, gets response
   → Bridge formats for DM mode, sends back via Telegram API

3. When Brady's done:
   → Ctrl+C stops the bridge
   → Dev tunnel closes
   → Telegram webhook goes silent (messages queue, delivered on next start)
```

**Important constraint:** This means Squad DM only works when the bridge is running on Brady's machine (or a server). This is acceptable for v1 — it's a power-user feature. v2 could explore hosted bridges (GitHub Actions-powered, or a lightweight cloud deploy), but v1 is local-first. This aligns with Squad's filesystem-backed philosophy — the `.ai-team/` state is on the machine running the bridge.

### Alternative: Polling Instead of Webhooks

If the dev tunnel approach feels too heavy, Telegram supports long polling (`getUpdates`). The bridge polls Telegram for new messages instead of receiving webhooks. No tunnel needed. Tradeoffs:

| | Webhook (dev tunnel) | Polling |
|--|---------------------|---------|
| Latency | Instant | 1-3s delay |
| Connectivity | Requires tunnel | No tunnel needed |
| Proactive push | Natural (webhook is already bidirectional) | Still works (bridge pushes via Telegram API) |
| Simplicity | More moving parts | Simpler setup |
| Battery/resources | Idle until message arrives | Constant polling loop |

**Recommendation: Start with polling for v0.1 (zero setup friction), graduate to dev tunnel webhooks for v0.2 (lower latency, cleaner architecture).** This is the progressive disclosure principle applied to infrastructure.

---

## 7. The DM Output Mode — How Agents Know They're in DM

Agents need to know when they're responding via DM vs. terminal. The output expectations are fundamentally different.

### Approach: DM Mode Flag in Spawn Prompt

Add a `DM_MODE` context variable to the spawn prompt:

```
**Output mode:** DM (mobile messaging)

DM OUTPUT RULES:
- Summaries only. Never inline full proposals, code files, or large tables.
- Max 4-5 sentences per response unless the user asks for more.
- Use bullet points for lists.
- Link to GitHub for full artifacts: "Committed to docs/proposals/017.md — [view →](url)"
- No code blocks longer than 5 lines.
- One message per response. Don't monologue.
- If you produced a large artifact, summarize it in 2-3 lines and say where it lives.
```

The bridge injects this into every spawn prompt. Agents' charters and personalities don't change — only the output format adapts. Keaton is still Keaton. He's just Keaton on a phone instead of Keaton in a terminal.

### Context Continuity

When Brady switches from DM to terminal (or vice versa), the conversation continues seamlessly:

> **[Telegram, 11pm]**
> **Brady:** Keaton, should we add a `--dry-run` flag to export?
> **🏗️ Keaton:** Yes. Low cost, high trust. Users should see what'll be exported before committing. Adding to the Sprint 2 backlog.

> **[Terminal, next morning]**
> **Brady:** Keaton, implement the --dry-run flag you mentioned last night.
> **🏗️ Keaton:** On it. You decided this via DM last night — `--dry-run` for export, shows manifest preview without writing. I'll add it to the export command in index.js.

The decision from DM was written to `decisions/inbox/`. The terminal session reads `decisions.md`. Continuity. Same team. Different window.

---

## 8. Industry Positioning — Who Else Is Doing This?

### The Landscape

| Product | What They Do | What's Missing |
|---------|-------------|----------------|
| **ChatGPT Telegram bots** | Single generic AI in Telegram | No team, no memory, no codebase, no personality |
| **Slack AI / Slackbot** | Context-aware AI in Slack channels | Single voice, no multi-agent, enterprise only |
| **CrewAI + messaging** | Multi-agent framework with chat adapters | Generic agents, no persistent identity, no relationship |
| **Microsoft Teams agents** | Multi-agent systems in Teams | Enterprise-focused, no indie dev story, heavy setup |
| **Quidget / Social Intents** | Multi-bot support across platforms | Customer support focus, not developer teams |
| **Claude/Copilot apps** | Direct AI assistant in messaging | Single agent, no team dynamics, no proactive push |

### What Nobody Has

Nobody — not OpenAI, not Anthropic, not Microsoft, not any multi-agent framework — has this:

1. **A persistent, named, opinionated team** that you can message from your phone
2. **Multi-agent responses in a chat thread** where specialists disagree and you pick the winner
3. **Proactive push notifications** from AI agents who know your codebase
4. **Cross-channel memory** where a DM decision becomes a terminal-accessible team decision
5. **Portable agent teams** that know YOU across projects AND are available via messaging

This is not incremental. This is a new category: **AI team as a messaging contact.**

### The Positioning Statement

> Every AI chatbot forgets you when the window closes. Squad doesn't. Because Squad isn't a chatbot — it's your team. Six specialists who know your code, remember your decisions, and text you when something matters. Open Telegram. Message your squad. They're already caught up.

### Why This Could Be THE Feature

Squad's current differentiators — parallelism, casting, portable memory — are all terminal-bound. They're powerful but invisible to anyone who isn't actively using the CLI. DM changes that:

- **Proactive standup messages** are shareable screenshots. Free marketing.
- **"My AI team just texted me"** is a sentence that stops people scrolling.
- **The 11pm couch moment** is a story devs tell each other. It's word-of-mouth fuel.
- **Team in your pocket** is viscerally different from "tool on your computer."

DM is where Squad goes from "impressive dev tool" to "thing you can't imagine working without." It's the transition from tool to teammate.

---

## 9. Implementation Phases

### Phase 0: Proof of Concept (1-2 days)

- Single Telegram bot via BotFather
- Polling-based bridge (no tunnel needed)
- Messages forwarded to Squad CLI, responses sent back
- No DM mode formatting — just raw output truncated to 4096 chars
- No proactive messaging
- **Goal:** "It works. I can message my squad from my phone."

### Phase 1: DM Experience (3-5 days)

- DM mode flag in spawn prompts
- Summary + link output formatting
- Emoji-prefixed agent identity
- Basic routing ("Keaton, ..." → spawn Keaton)
- Dev tunnel integration (replace polling with webhook)
- **Goal:** "It feels like messaging my team, not a chatbot."

### Phase 2: Proactive Messaging (3-5 days)

- GitHub Actions webhook → CI failure notifications
- Filesystem watcher → decision/inbox notifications
- Cron-based daily standup
- Telegram inline keyboards for decision voting (1️⃣ / 2️⃣)
- **Goal:** "My team texts me first."

### Phase 3: Multi-Platform (future)

- Slack adapter (Events API + Bot)
- SMS adapter (Twilio)
- Discord adapter
- Platform-agnostic message format layer
- **Goal:** "My team is wherever I am."

---

## 10. Open Questions for Brady

1. **Telegram first?** Or would you prefer Slack/Discord? Telegram is fastest to prototype (BotFather is frictionless), but if you're already in Slack all day, that might be higher value.

2. **Always-on or on-demand?** Should the bridge run as a background service (always available) or a manual `npx squad-bridge start` command? Always-on needs a lightweight hosting story.

3. **Who sees the messages?** Is this Brady-only, or should team members (other humans) be able to message the squad too? Multi-user changes the identity model (agents need to know WHO is messaging).

4. **Proactive messaging frequency?** Daily standup + CI failures + decision prompts could be noisy. Should there be a "quiet hours" config?

5. **Artifact access from mobile?** When Squad says "committed to `docs/proposals/017.md`" — does Brady want to read it on his phone (GitHub mobile link) or is "I'll look at it in the morning" sufficient?

---

## 11. Why This Matters for Squad's Mission

Squad's mission: *"Beat the industry to what customers need next."*

The industry is building agents you talk to at your desk. We're building a team you text from anywhere. The industry thinks the interface is the IDE. We think the interface is the relationship — and relationships aren't confined to office hours.

Every other multi-agent tool requires you to sit at a terminal, open a context window, and type a structured prompt. Squad DM means you can be on a train, on a couch, at dinner — and still be working with your team. Not "working" in the terminal sense. Working in the *leadership* sense: making decisions, setting direction, checking status, unblocking work.

This is where Squad stops being a tool and starts being a team. And that's not a tagline. That's the experience.

---

**Review requested from:**
- Keaton — architecture review (bridge design, event model)
- Fenster — implementation feasibility (Node.js bridge, dev tunnel integration)
- Kujan — Copilot platform implications (how does CLI invocation work from a bridge?)
- McManus — positioning review (is the DM story ready for public messaging?)
- Hockney — test strategy (how do you test a messaging bridge?)

**Depends on:** Proposal 007 (tiered response modes inform DM mode), Proposal 008 (portable squads — the same team across channels AND projects), Proposal 015 (silent success bug — if 40% of responses drop in terminal, they'll drop in DM too).
