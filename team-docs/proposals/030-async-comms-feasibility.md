# Proposal 030: Async Squad Communication — Updated Feasibility Assessment

**Status:** Active  
**Authored by:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-10  
**Requested by:** bradygaster  
**Supersedes:** Proposal 017 (Platform Feasibility — Direct Messaging Interface), which is now STALE  
**Companion to:** Proposal 017 (Keaton's DM architecture), Proposal 017 (Verbal's experience design)

---

## Summary

Brady has un-deferred async squad communication. It's now the top priority for 0.3.0. He wants to talk to his squads from his phone, per repo. This proposal re-evaluates the feasibility landscape, rates every connector Brady mentioned, introduces the CCA angle that didn't exist when I wrote Proposal 017, and recommends an MVP scope that's actually shippable.

**TL;DR:** The fastest path to "async comms in 0.3.0" isn't building a Telegram bot. It's two moves in parallel: **(1) CCA-as-squad-member** — Copilot Coding Agent reads `squad.agent.md`, works under Squad governance via GitHub Issues, giving Brady GitHub-native async communication today with zero new infrastructure, and **(2) a thin Telegram bridge** using the Copilot SDK for richer conversational async when Brady's on his phone. CCA is the floor. Telegram is the ceiling. Ship both, but CCA first because it's nearly free.

---

## 1. What Changed Since Proposal 017

My original 017 was written on 2026-02-09. Here's what's different:

| Dimension | Proposal 017 (Feb 9) | Now (Feb 10) |
|-----------|----------------------|--------------|
| **Priority** | Deferred to Horizon / v1.0 | TOP PRIORITY for 0.3.0 |
| **Copilot SDK** | Technical Preview, unverified | Technical Preview, confirmed: multi-turn, custom tools, model selection, streaming — all working |
| **CCA** | Not considered | Brady explicitly wants CCA to adopt the repo's Squad |
| **GitHub Issues integration** | Dismissed as "wrong UX" | Already shipping in 0.3.0 (sprint item 5.9) — one-way push to Issues is in scope |
| **Per-repo channels** | Mentioned as future need | Hard requirement — one channel per repo |
| **Scope** | "Build a Telegram bot with full agent spawning" | "What's the SMALLEST thing that gives me async comms?" |
| **Connectors** | Telegram only | Telegram, Teams, Discord, Slack, GitHub Discussions all on the table |

The biggest change is CCA. When I wrote 017, we weren't thinking about Copilot Coding Agent as a squad member. Now Brady wants exactly that — and it creates an async communication channel through GitHub's own surfaces that didn't exist in my original analysis.

---

## 2. Connector Evaluation — Five Platforms Rated

Rating scale: **Feasibility** (can we build it?), **Per-Repo Fit** (one channel per repo?), **Mobile UX** (can Brady use it from his phone?), **Build Cost** (how much work?), **Ecosystem Fit** (does it align with Squad's GitHub-native philosophy?).

### 2a. Telegram

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Feasibility** | ⭐⭐⭐⭐⭐ | BotFather → token → webhook. 50 lines to receive messages. Proven by MOLTS. |
| **Per-Repo** | ⭐⭐⭐ | Telegram groups can serve as per-repo channels. Bot joins group, messages tagged with repo context. Or one bot with `/repo` command to switch. Not native per-repo — requires convention. |
| **Mobile UX** | ⭐⭐⭐⭐⭐ | Best-in-class mobile messaging. Fast, lightweight, push notifications work perfectly. |
| **Build Cost** | ⭐⭐⭐⭐ | ~50 LOC for the adapter. `telegraf` or `node-telegram-bot-api`. Well-documented. |
| **Ecosystem Fit** | ⭐⭐⭐ | Third-party platform. No GitHub integration. Auth is separate (Telegram user IDs). |

**Verdict:** Best pure-messaging option. Fast to prototype, great mobile UX. Per-repo requires workarounds (groups or commands). My recommendation from 017 stands — Telegram is the right first external connector.

**Per-repo pattern:** Create a Telegram group per repo. Bot joins each group. Group name = repo name. Messages in that group route to that repo's Squad. Brady's phone shows: "squad/squad", "squad/other-project", etc. Manageable for 3-5 repos. Gets awkward at 20.

### 2b. Microsoft Teams

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Feasibility** | ⭐⭐⭐ | Teams bot registration via Azure Bot Service. More ceremony than Telegram. Requires Azure AD app, bot registration, manifest. |
| **Per-Repo** | ⭐⭐⭐⭐⭐ | **Best per-repo story.** Teams channels within a Team map perfectly to repos. Create a Team "My Squads", channels for each repo. Bot posts in the right channel. This is Teams' native paradigm. |
| **Mobile UX** | ⭐⭐⭐⭐ | Good mobile app. Push notifications work. Slightly heavier than Telegram (enterprise UI). |
| **Build Cost** | ⭐⭐ | ~200-400 LOC for the adapter. Azure Bot Framework SDK. Manifest, app registration, approval workflow. More moving parts than Telegram. |
| **Ecosystem Fit** | ⭐⭐⭐⭐ | Microsoft ecosystem. Aligns with Dev Tunnels, Azure, GitHub (all Microsoft). Brady said "ideal." |

**Verdict:** Brady said Teams is "ideal, especially per-repo channels" and he's right — the channel-per-repo model is native to Teams. But the build cost is 3-5x Telegram. Registration, Azure AD, bot manifests, approval flows. Not an MVP play unless Brady already has the Teams infrastructure and wants to invest in the setup.

**Per-repo pattern:** One Teams Team (e.g., "Brady's Squads"). One channel per repo. Bot posts to the correct channel based on repo context. Native threading within channels. This is the cleanest per-repo story of any platform.

### 2c. Discord

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Feasibility** | ⭐⭐⭐⭐⭐ | Discord Developer Portal → bot → token. Similar simplicity to Telegram. `discord.js` is mature. |
| **Per-Repo** | ⭐⭐⭐⭐ | Discord servers with channels per repo. Very similar to Teams model but lighter weight. One server, multiple channels. |
| **Mobile UX** | ⭐⭐⭐⭐ | Good mobile app. Push notifications. Slightly gaming-oriented UI but perfectly functional. |
| **Build Cost** | ⭐⭐⭐⭐ | ~80-120 LOC for the adapter. `discord.js` library. Bot setup is straightforward. |
| **Ecosystem Fit** | ⭐⭐⭐ | Popular with developers. No GitHub integration. Third-party. |

**Verdict:** Sleeper pick. Discord's server-and-channels model is a natural fit for per-repo organization. Build cost is close to Telegram. The dev community lives on Discord. If Squad becomes a community product, Discord is where the users already are. Not the v0.1 pick, but a strong v0.2 add.

**Per-repo pattern:** One Discord server. Text channels named after repos: `#squad`, `#other-project`. Bot routes messages based on channel. Clean, native, no workarounds needed.

### 2d. Slack

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Feasibility** | ⭐⭐⭐ | Slack API is powerful but complex. Bot registration, OAuth, scopes, Events API. Enterprise features add friction. |
| **Per-Repo** | ⭐⭐⭐⭐ | Slack channels per repo — same model as Discord/Teams. Enterprise Grid supports multi-workspace. |
| **Mobile UX** | ⭐⭐⭐⭐ | Good mobile app. Most developers already have it installed. |
| **Build Cost** | ⭐⭐ | ~200-300 LOC. `@slack/bolt` framework. OAuth dance, token management, event subscriptions. The most bureaucratic API of the five. |
| **Ecosystem Fit** | ⭐⭐⭐ | Enterprise standard, but third-party. Slack's GitHub integration exists but is separate from what we'd build. |

**Verdict:** Enterprise-grade but overengineered for a personal async tool. The OAuth flow alone is more work than the entire Telegram bot. Matters when Squad has enterprise customers. Not the MVP play. Defer to 0.4.0+.

**Per-repo pattern:** Same as Discord/Teams — channels per repo. Slack's API makes this clean but the setup cost is high.

### 2e. GitHub Discussions

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Feasibility** | ⭐⭐⭐⭐ | Already exists. GitHub API supports creating/reading discussions. `gh` CLI has limited support; GraphQL API is the primary interface. |
| **Per-Repo** | ⭐⭐⭐⭐⭐ | **Inherently per-repo.** Discussions ARE per-repo. No mapping needed. Each repo has its own Discussions tab. |
| **Mobile UX** | ⭐⭐ | GitHub Mobile supports Discussions but the UX is browser-like, not messaging-like. No push notifications for new comments (unless watching). Feels like a forum, not a chat. |
| **Ecosystem Fit** | ⭐⭐⭐⭐⭐ | 100% GitHub-native. No external accounts. No bot registrations. Auth is GitHub auth. |
| **Build Cost** | ⭐⭐⭐ | ~100-150 LOC. Needs GitHub Actions webhook or API polling to detect new comments. Response posted as comment. |

**Verdict:** The most GitHub-native option. Per-repo is free. But the UX is not "messaging" — it's a forum. Brady wants to text his squad from his phone. Opening GitHub, navigating to Discussions, posting a comment, and waiting for a reply is not that experience. However, Discussions could be a LOW-EFFORT fallback channel: "Works without any setup. Not great UX, but always available."

**Per-repo pattern:** Native — each repo has its own Discussions. Create a "Squad Chat" category. New discussion = new topic. Comments = conversation. Zero mapping required.

### Connector Ranking

| Rank | Platform | Best For | Ship When |
|------|----------|----------|-----------|
| 1 | **CCA + GitHub Issues** | Zero-build async (see §3) | 0.3.0 (nearly free) |
| 2 | **Telegram** | First rich messaging connector | 0.3.0 (MVP) |
| 3 | **Discord** | Community/dev-friendly per-repo | 0.4.0 |
| 4 | **GitHub Discussions** | Zero-setup fallback | 0.3.0 (if time permits) |
| 5 | **Teams** | Enterprise per-repo (Brady's ideal) | 0.4.0+ |
| 6 | **Slack** | Enterprise | 0.5.0+ |

---

## 3. The CCA Angle — This Is the Breakthrough

This section didn't exist in Proposal 017. It changes the entire strategy.

### What CCA Does Today

Copilot Coding Agent (CCA) is GitHub's autonomous coding agent. Here's the flow:

1. A GitHub Issue is created with clear requirements
2. Issue is assigned to `@copilot`
3. CCA checks out the repo, reads any `.github/agents/*.agent.md` files for guidance
4. CCA works in a sandboxed GitHub Actions environment on a `copilot/*` branch
5. CCA opens a draft PR with the solution
6. Humans review, comment, iterate, merge

**The key insight:** CCA already reads `squad.agent.md` from `.github/agents/`. Our Squad coordinator prompt IS the CCA guidance file. They're the same file.

### How CCA Becomes a Squad Member

Here's what happens if we explicitly optimize `squad.agent.md` for CCA consumption:

```
1. Brady creates a GitHub Issue: "Add error handling to the export command"
2. Brady assigns the issue to @copilot
3. CCA clones the repo, reads .github/agents/squad.agent.md
4. squad.agent.md tells CCA: "You are working under Squad governance. 
   Read .ai-team/team.md for team structure. Read .ai-team/decisions.md 
   for established decisions. Follow the casting and conventions."
5. CCA works within Squad's constraints — respects decisions, follows 
   conventions, produces Squad-compatible artifacts
6. CCA opens a draft PR
7. Brady reviews from his phone (GitHub Mobile)
8. Brady comments: "Looks good, but add the retry logic Fenster mentioned 
   in Proposal 017"
9. CCA reads the comment, iterates
10. Brady merges from his phone
```

**This IS async squad communication.** Brady assigned work to his squad from his phone. The squad (via CCA) did the work. Brady reviewed from his phone. Results were committed. Squad state can be updated. All through GitHub's native surfaces.

### What CCA Can and Cannot Do as a Squad Member

| Can Do | Cannot Do |
|--------|-----------|
| Read `squad.agent.md` and follow governance | Spawn multiple sub-agents (no `task` tool) |
| Read `.ai-team/` state (decisions, charters, histories) | Write to `.ai-team/` during work (sandbox limitations) |
| Follow established conventions and decisions | Have Squad agent personalities (CCA is CCA, not Keaton) |
| Create PRs with Squad-compatible code | Run the Squad coordinator's multi-agent orchestration |
| Respond to PR comments iteratively | Push notifications to messaging apps |
| Work async on `copilot/*` branches | Conversational back-and-forth (it's PR-based, not chat) |

### The Honest Assessment

CCA-as-squad-member is NOT full "DM your squad from your phone." It's:
- ✅ Async work assignment from any device
- ✅ Code output governed by Squad conventions
- ✅ Review and iteration via GitHub Mobile
- ❌ NOT conversational — you can't "chat" with Keaton via Issues
- ❌ NOT multi-agent — CCA operates as a single agent, not as Keaton + Fenster + Hockney in parallel
- ❌ NOT personality-preserving — CCA doesn't become Fenster, it reads Fenster's conventions
- ❌ NOT proactive — CCA responds to assignments, doesn't push notifications

**But here's why it matters:** It's FREE. No infrastructure. No bot. No tunnel. No SDK integration. Just prompt engineering in `squad.agent.md` to make CCA aware of Squad governance. That's 2-4 hours of work, and Brady can assign issues to his Squad from his phone TODAY.

### CCA + GitHub Issues = Async Channel v0

Think of it this way:

| Traditional Squad (CLI) | CCA-as-Squad-Member |
|--------------------------|---------------------|
| "Fenster, add error handling" (typed in terminal) | Issue: "Add error handling" (created on phone) |
| Fenster spawned as sub-agent | Issue assigned to @copilot |
| Fenster writes code, commits | CCA writes code, opens PR |
| Brady sees result in terminal | Brady sees PR on GitHub Mobile |
| Conversational, real-time | Async, PR-based |

It's not the same experience. But it's async communication with your squad through GitHub's own surfaces. And it ships in 0.3.0 with minimal effort.

---

## 4. Execution Backend Update — Copilot SDK Status

### What I Said in Proposal 017

> The Copilot SDK (`@github/copilot-sdk`) is the recommended execution backend. It provides the same agentic runtime that powers the CLI but can be embedded in any Node.js app.

### What I Know Now (Feb 10)

The SDK has matured since I wrote 017. Confirmed capabilities:

| Capability | Status | Evidence |
|------------|--------|----------|
| **Multi-turn conversations** | ✅ Confirmed | Session history maintained per session |
| **Custom tool definitions** | ✅ Confirmed | Register tool handlers; SDK invokes them during reasoning |
| **Model selection per session** | ✅ Confirmed | `createSession({ model: "gpt-5" })` — any supported model |
| **Real-time streaming** | ✅ Confirmed | Incremental response events |
| **Session lifecycle control** | ✅ Confirmed | Create, send, destroy — full programmatic control |
| **MCP server support** | ✅ Confirmed | Default or custom MCP backends |
| **GitHub auth** | ✅ Confirmed | Native GitHub login flow, token-based auth |
| **Nested sessions (task equivalent)** | ⚠️ UNVERIFIED | The critical question. Can a tool handler spawn another session? SDK architecture suggests yes (it's just another API call), but nobody has documented this pattern. |

### Is the SDK Still the Right Call?

**Yes, but with a caveat.** The SDK is the right execution backend for the Telegram/Discord/Teams bridge — when we build the conversational connector. But the nested session question (can we implement `task` as "spawn another SDK session?") remains my top verification gate.

**New option I didn't have in 017:** The SDK now supports multi-language (Node.js, Python, Go, .NET). We stay on Node.js (Squad's stack), but the Python SDK means we could prototype faster in certain scenarios.

**Updated recommendation:**

1. **CCA + GitHub Issues** → No SDK needed. Ships now.
2. **Telegram bridge** → SDK is the execution backend. Spike the nested session pattern first.
3. **GitHub Actions fallback** → Still valid if SDK nested sessions don't work. Higher latency but guaranteed tool availability.

The SDK recommendation from 017 holds. The execution order changes: CCA first (free), then SDK-backed Telegram (medium effort), then Actions fallback (if SDK fails).

---

## 5. MVP Scope — What Ships in 0.3.0

Brady asked: "What's the SMALLEST thing that gives me async comms?"

Here's my answer, in two tiers:

### Tier 1: CCA-as-Squad-Member (2-4 hours, prompt engineering only)

**What ships:**
- `squad.agent.md` updated with CCA guidance section
- When CCA picks up an issue, it reads Squad governance: decisions, conventions, team structure
- CCA works within Squad's constraints, produces Squad-compatible output
- Brady assigns issues from GitHub Mobile, reviews PRs from GitHub Mobile
- Zero new infrastructure, zero new dependencies

**What this gives Brady:**
- Assign work to his squad from his phone ✅
- Work governed by Squad decisions ✅
- Results as PRs he can review from anywhere ✅
- Per-repo (GitHub Issues are inherently per-repo) ✅

**What this DOESN'T give Brady:**
- Conversational chat ❌
- Multi-agent responses ❌
- Agent personalities ❌
- Proactive push notifications ❌
- "Text my squad" feeling ❌

**Effort:** 2-4 hours. Prompt engineering in `squad.agent.md` + documentation.

### Tier 2: Telegram Bridge MVP (8-16 hours, new code)

**What ships:**
- Thin Node.js bridge: Telegram webhook → Copilot SDK → Squad coordinator → response → Telegram
- Single Telegram bot via BotFather
- Polling mode (no Dev Tunnel needed for v0.1)
- DM mode flag so agents respond in summary format
- Single-repo (hardcoded repo path)
- Brady-only auth (hardcoded Telegram user ID)

**What this gives Brady (on top of Tier 1):**
- Text his squad from Telegram ✅
- Conversational back-and-forth ✅
- Agent personalities in responses ✅
- Multi-agent responses ✅
- Mobile messaging UX ✅

**What this DOESN'T give Brady:**
- Per-repo channels (single repo in v0.1) ❌
- Proactive push notifications ❌
- Always-on (requires bridge running) ❌
- Teams/Discord/Slack ❌

**Effort:** 8-16 hours. SDK integration spike (4-6h) + Telegram adapter (2-4h) + DM mode prompt (2-4h) + testing (2-4h).

**Dependencies:**
- Copilot SDK `@github/copilot-sdk` verified for nested sessions
- `telegraf` npm package
- Brady's Copilot subscription
- BotFather token (5 minutes to create)

### What I'm Recommending for 0.3.0

**Ship both tiers, in order:**

1. **Tier 1 first** (CCA-as-squad-member). This is 2-4 hours of prompt engineering. No code changes to `index.js`. It lands within the existing 0.3.0 sprint scope and gives Brady async comms TODAY via GitHub Issues + Mobile.

2. **Tier 2 if time permits** (Telegram bridge). This is new code, new dependency (`@github/copilot-sdk`, `telegraf`), new surface area. It's the richer experience but it's also 8-16 hours of work that didn't exist in the 0.3.0 sprint plan.

If we can't ship Tier 2 in 0.3.0, it becomes the FIRST item in 0.4.0 — not deferred to Horizon. Brady's un-deferral means this stays hot.

---

## 6. Per-Repo Chat — How It Works Across Platforms

Brady specifically wants one channel per repo. Here's how each platform handles it:

### GitHub Issues + CCA (Tier 1)

Per-repo is **native**. Issues belong to repos. Nothing to map. Brady opens the repo on GitHub Mobile, creates an issue, assigns to @copilot. Done.

### Telegram (Tier 2, single-repo MVP)

**v0.1:** Single bot, single repo. The bot is hardcoded to one repo path.

**v0.2 per-repo evolution:** Two options:

| Approach | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Groups** | One Telegram group per repo. Bot joins each. Group → repo mapping in config. | Native Telegram UX. Easy to set up. | Requires creating groups. Gets messy at 10+ repos. |
| **Commands** | Single bot, `/repo bradygaster/squad` to switch context. | One chat window. Simple. | Must remember to switch. No visual separation. |

**Recommendation:** Groups for v0.2. Clean separation, push notifications per repo, and it mirrors Brady's "one channel per repo" request literally.

### Teams (0.4.0+)

**Best per-repo story.** One Team ("My Squads"), one channel per repo. Bot routes messages based on channel. This is Teams' native paradigm. If Brady invests in the Teams setup, this is the cleanest long-term solution.

### Discord (0.4.0+)

One server, text channels per repo. Very similar to Teams but lighter setup. `#squad`, `#other-project`. Bot routes by channel name.

### Slack (0.5.0+)

Same channels-per-repo model. Higher setup cost (OAuth, workspace config) but identical pattern.

---

## 7. The Combined Architecture — CCA + Connectors

Here's how all the pieces fit together:

```
                    ┌──────────────────────────────────────────────┐
                    │         ASYNC COMMUNICATION LAYER            │
                    │                                              │
  ┌──────────┐     │  ┌─────────────────────────────────────────┐ │
  │ GitHub   │     │  │  TIER 1: CCA-as-Squad-Member            │ │
  │ Issues   │────▶│  │  • Assign @copilot on any issue         │ │
  │ (Mobile) │     │  │  • CCA reads squad.agent.md             │ │
  │          │◀────│  │  • Works under Squad governance          │ │
  └──────────┘     │  │  • Opens PR → Brady reviews on mobile   │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                              │
  ┌──────────┐     │  ┌─────────────────────────────────────────┐ │
  │ Telegram │     │  │  TIER 2: Conversational Bridge          │ │
  │ (Phone)  │────▶│  │  • Telegram webhook → Copilot SDK       │ │
  │          │◀────│  │  • Squad coordinator spawns agents       │ │
  └──────────┘     │  │  • DM-mode responses → Telegram reply   │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                              │
  ┌──────────┐     │  ┌─────────────────────────────────────────┐ │
  │ Discord/ │     │  │  TIER 3: Multi-Platform (0.4.0)         │ │
  │ Teams/   │────▶│  │  • Platform adapters (thin)              │ │
  │ Slack    │     │  │  • Squad DM Gateway (shared)             │ │
  │          │◀────│  │  • Per-repo channel routing              │ │
  └──────────┘     │  └─────────────────────────────────────────┘ │
                    │                                              │
                    │              ALL TIERS SHARE:                │
                    │         .ai-team/ (git-backed state)         │
                    │         decisions.md, histories, charters    │
                    └──────────────────────────────────────────────┘
```

**Key insight:** Tier 1 and Tier 2 are not competing strategies. They're complementary:
- **CCA** handles async work assignment (issue → code → PR)
- **Telegram** handles async conversation (question → multi-agent discussion → decision)
- **GitHub Issues** is the command interface; **Telegram** is the chat interface

Brady uses CCA when he wants work done. Brady uses Telegram when he wants to think out loud with his team.

---

## 8. Sprint Impact Assessment

### Current 0.3.0 Sprint (from Proposal 027)

The sprint is 31-43 hours across two waves. Adding async comms:

| Addition | Hours | Impact on Sprint | Risk |
|----------|-------|-----------------|------|
| **Tier 1: CCA guidance in squad.agent.md** | 2-4h | Minimal — prompt engineering, fits in Wave 2 alongside 5.9 (GitHub Issues) | Low |
| **Tier 2: Telegram bridge MVP** | 8-16h | Significant — new code surface, new deps, new testing | Medium-High |

### My Recommendation

**Add Tier 1 to 0.3.0 Wave 2.** It's 2-4 hours, no code changes, and it directly supports sprint item 5.9 (GitHub-Native Planning). CCA reading Squad governance is a natural extension of "Squad works through GitHub surfaces."

**Spike Tier 2 in parallel, ship if ready.** The SDK spike (4-6h) is the go/no-go gate. If nested sessions work, the rest of Tier 2 follows quickly. If not, defer Tier 2 to 0.4.0 and ship CCA-only async in 0.3.0.

---

## 9. Open Risks and Verification Gates

| Gate | Question | How to Verify | Impact if Fails |
|------|----------|---------------|-----------------|
| **SDK nested sessions** | Can a Copilot SDK tool handler spawn another SDK session? | Install `@github/copilot-sdk`, write a 20-line spike | Tier 2 falls back to GitHub Actions execution (higher latency) |
| **CCA reads .ai-team/** | Does CCA actually read files beyond `.github/agents/`? | Assign a test issue to @copilot on a repo with `.ai-team/` | If no, CCA guidance is limited to `squad.agent.md` alone (still useful, less contextual) |
| **CCA respects agent.md instructions** | Does CCA follow Squad governance instructions in `squad.agent.md`? | Test with a specific instruction ("always add JSDoc") and verify compliance | If weak compliance, CCA-as-squad-member is aspirational, not practical |
| **Telegram long-polling reliability** | Does `telegraf` polling work reliably for hours/days? | Run the bridge for 48h, send messages at random intervals | If unreliable, need webhook mode + Dev Tunnel from day 1 |

**Recommendation:** Run gates 1-3 as a 1-day spike before committing hours to either tier. I can do gates 2-3 myself (they're platform assessment work). Gate 1 needs a dev (Fenster) to install the SDK and write the spike.

---

## 10. What's Aspirational vs. What We Can Actually Build

Let me be direct about what's real and what's a dream.

### Actually Buildable in 0.3.0

- ✅ CCA reads `squad.agent.md` and follows Squad governance
- ✅ Brady assigns issues to @copilot from his phone
- ✅ CCA opens PRs governed by Squad decisions
- ✅ Telegram bot receives messages and forwards to Squad (if SDK spike passes)
- ✅ DM-mode output formatting (prompt engineering)

### Buildable in 0.4.0 (if 0.3.0 foundations land)

- ✅ Per-repo Telegram groups
- ✅ Discord adapter
- ✅ Proactive push notifications (CI failure → Telegram)
- ✅ Conversation persistence in `.ai-team/dm-log/`
- ✅ Dev Tunnel webhook mode (replace polling)
- ✅ Teams adapter (if Brady invests in Azure setup)

### Aspirational (Horizon)

- 🔮 Full multi-agent orchestration via Telegram (coordinator spawns 5 agents, all respond in thread)
- 🔮 Cross-platform continuity (start in Telegram, continue in Teams)
- 🔮 CCA runs as a SPECIFIC squad member (CCA as Fenster, not CCA-following-Fenster's-conventions)
- 🔮 Proactive daily standup messages (cron-triggered, all agents report)
- 🔮 Agent-to-agent debate in messaging threads
- 🔮 Voice message processing (Telegram voice → transcription → Squad)

### Honest Limitation

The experience Verbal designed in her 017 companion proposal — the 11pm couch moment, multi-agent debates in Telegram threads, proactive standups — is real and achievable. But not in 0.3.0. That's a 0.4.0-0.5.0 experience. What we ship in 0.3.0 is the foundation: CCA governance (async work) + thin Telegram bridge (async chat). The magic comes when we layer Verbal's experience design on top.

---

## 11. Decision Recommendations

1. **Ship CCA-as-squad-member in 0.3.0 Wave 2.** Add a `## CCA Guidance` section to `squad.agent.md`. 2-4 hours. Zero risk.

2. **Spike the Copilot SDK nested sessions.** 1-day effort. This is the go/no-go gate for Telegram. Assign to Fenster or me.

3. **If SDK spike passes, ship Telegram bridge MVP in 0.3.0.** Polling mode, single repo, Brady-only auth. 8-16 hours additional.

4. **If SDK spike fails, defer Telegram to 0.4.0 and use GitHub Actions as execution fallback.** Higher latency (~60-120s per response vs. ~10-30s with SDK) but functional.

5. **Teams connector deferred to 0.4.0+.** Brady said "ideal" but the setup cost is 3-5x Telegram. Ship Telegram first, validate the pattern, then build the Teams adapter on the same gateway architecture.

6. **Discord before Teams.** If Squad is for indie devs (and it is, today), Discord reaches more users than Teams. Teams becomes the play when Squad goes enterprise.

7. **Per-repo via Telegram groups in 0.4.0.** Single-repo MVP in 0.3.0 is fine. Per-repo groups is a clean v0.2 upgrade.

---

## Appendix A: CCA Guidance Section for squad.agent.md (Draft)

```markdown
## CCA (Copilot Coding Agent) Guidance

When running as the Copilot Coding Agent (assigned via GitHub Issues):

1. **Read Squad governance.** Before starting work:
   - Read `.ai-team/decisions.md` for established team decisions
   - Read `.ai-team/team.md` for team structure and conventions
   - Respect all decisions marked as active

2. **Follow Squad conventions.** This project uses:
   - Proposal-first workflow for significant changes
   - Drop-box pattern for concurrent writes (`.ai-team/decisions/inbox/`)
   - Filesystem-backed agent memory in `.ai-team/`

3. **Work within scope.** Address only what the issue describes. 
   If the issue is ambiguous, comment asking for clarification 
   rather than guessing.

4. **Update Squad state.** If your work affects team decisions:
   - Write decision updates to `.ai-team/decisions/inbox/cca-{slug}.md`
   - Follow the decision format in existing entries

5. **Quality standards.** Run `npm test` before opening a PR. 
   CI must pass. Follow existing code patterns.
```

## Appendix B: Copilot SDK Spike Script (For Verification)

```javascript
// spike-sdk-nested.js — Verify nested session support
const { CopilotClient } = require("@github/copilot-sdk");

async function main() {
  const client = new CopilotClient();
  await client.start();

  // Outer session (coordinator)
  const coordinator = await client.createSession({
    model: "claude-sonnet-4",
    tools: [{
      name: "spawn_agent",
      description: "Spawn a sub-agent",
      handler: async (params) => {
        // Inner session (agent) — THIS IS THE CRITICAL TEST
        const agent = await client.createSession({
          model: "claude-haiku-4.5",
        });
        const result = await agent.sendAndWait({
          prompt: params.task,
        });
        await agent.destroy();
        return result;
      }
    }]
  });

  const response = await coordinator.sendAndWait({
    prompt: "Use spawn_agent to ask: what is 2+2?"
  });

  console.log("Result:", response);
  await client.stop();
}

main().catch(console.error);
```

If this spike returns a result from the inner session, the SDK supports nested sessions and Tier 2 is a go.

---

**This is Kujan's honest assessment. CCA is the free play. Telegram is the real play. Ship both. CCA first.**
