# Proposal 030a: Connector Recommendation Update — Discord, GitHub Integrations, and Platform Lock-in

**Status:** Active  
**Authored by:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-10  
**Requested by:** bradygaster (via team discussion)  
**Companion to:** Proposal 030 (Async Comms Feasibility)

---

## Summary

Brady wants Discord over Telegram, wants to know what GitHub's built-in integrations buy us for free, and is worried about platform lock-in if we lean on GitHub-specific connectors. This document answers five specific questions with concrete LOC estimates, library recommendations, and architecture constraints.

**TL;DR:** Discord over Telegram is the right call. Build cost is nearly identical (~80-120 LOC vs. ~50 LOC for the adapter layer), Discord's channel model is a better per-repo fit, and it aligns with Brady's preference. GitHub's built-in integrations (Teams app, Copilot Extensions, webhooks) give us notifications for free but NOT programmable messaging — they don't replace building a bot. The lock-in risk is real but manageable: the Squad DM Gateway architecture from 017/030 already isolates platform-specific code behind the `NormalizedMessage` interface, and Fenster's provider abstraction (032a) gives us the pattern for keeping the door open to ADO/GitLab. My updated 0.3.0 recommendation: **CCA + GitHub Issues (Tier 1, unchanged) → Discord bridge MVP (Tier 2, replacing Telegram)**.

---

## 1. Discord vs. Telegram: Technical Comparison

### The Numbers

| Dimension | Telegram | Discord | Delta |
|-----------|----------|---------|-------|
| **Adapter LOC** | ~50 (telegraf) | ~80-120 (discord.js) | +30-70 lines |
| **Bot setup ceremony** | BotFather → token → done (2 min) | Developer Portal → app → bot → token → server invite (5 min) | +3 min |
| **Library maturity** | `telegraf` — 16K stars, stable | `discord.js` — 25K stars, stable | Discord wins |
| **Webhook support** | Native (set webhook URL) | Native (Interactions endpoint) | Parity |
| **Long-polling fallback** | Native (`bot.launch()`) | Native (Gateway API, which is the default) | Parity |
| **Per-repo model** | Groups (workaround, ~awkward at 10+ repos) | Channels within a server (native, scales to 500) | **Discord wins** |
| **Mobile UX** | ⭐⭐⭐⭐⭐ (lightweight, fast push) | ⭐⭐⭐⭐ (good, slightly heavier UI) | Telegram edge |
| **Dev community presence** | Moderate | **Dominant** (most OSS projects use Discord) | Discord wins |
| **Message formatting** | Markdown (limited), HTML | Full Markdown, embeds, threads, reactions | Discord wins |
| **Threading** | Reply chains (basic) | Forum channels + threads (rich) | **Discord wins** |
| **Auth model** | Telegram user IDs (separate identity) | Discord user IDs (separate identity) | Parity |
| **Rate limits** | 30 msg/sec global, 1 msg/sec per chat | 50 req/10sec per bot | Comparable |

### Why the LOC Difference Is Negligible

Telegram's adapter is ~50 lines because `telegraf` wraps the webhook lifecycle and message parsing in a very thin API:

```javascript
// Telegram — ~50 lines
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.on('text', async (ctx) => {
  const response = await runSquadCoordinator(ctx.message.text);
  await ctx.reply(response);
});
bot.launch();
```

Discord's adapter is ~80-120 lines because `discord.js` requires explicit Gateway connection management and the message event model is slightly more verbose:

```javascript
// Discord — ~80-120 lines
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  // Channel name → repo routing
  const repo = resolveRepo(message.channel.name);
  const response = await runSquadCoordinator(message.content, repo);
  await message.reply(response);
});

client.login(process.env.DISCORD_TOKEN);
```

The extra ~30-70 lines come from:
1. Intent declaration (3 lines) — Discord requires explicit intent flags
2. Bot-self-message filtering (1 line) — Telegram handles this internally
3. Channel-to-repo routing (10-20 lines) — this is a FEATURE, not overhead; it gives us native per-repo
4. Embed formatting for rich responses (20-30 lines) — optional but Discord embeds look significantly better than plain text
5. Ready event handler + error handling (5-10 lines)

**The 30-70 extra lines buy us a BETTER per-repo story.** This is not overhead — it's value.

### Per-Repo: Discord Wins Decisively

This is the clincher. In my 030, I rated Telegram ⭐⭐⭐ for per-repo and Discord ⭐⭐⭐⭐. Here's why that one-star gap matters more than the mobile UX gap:

**Telegram per-repo:** Create separate Telegram groups. Bot joins each. Group name is a convention, not enforced. Brady manages 3-5 groups manually. At 10+ repos, it's a mess. No native "server" concept to group them.

**Discord per-repo:** One server. Text channels named `#squad`, `#other-project`, `#experiments`. Bot reads `message.channel.name`, routes to the right repo. Adding a new repo = creating a new channel (30 seconds). Brady sees all repos in one sidebar. Scales to 500 channels per server.

```javascript
// Discord per-repo routing — trivial
function resolveRepo(channelName) {
  // Channel #squad → repo bradygaster/squad
  // Channel #other-project → repo bradygaster/other-project
  const config = JSON.parse(fs.readFileSync('.ai-team/dm-config.json'));
  return config.channel_map[channelName] || null;
}
```

Telegram would require either groups (N bot instances, N webhook endpoints) or a `/repo` command (cognitive overhead, easy to forget). Discord's channel model IS the per-repo model.

### Does Brady's Preference Change My Recommendation?

**Yes. My recommendation changes from Telegram-first to Discord-first.**

The 030 ranked Telegram #2 (after CCA) primarily because of:
1. Build cost — slightly lower
2. MOLTS precedent — proven by the project Brady referenced
3. Mobile UX — marginally better

But Brady's explicit preference for Discord, combined with Discord's superior per-repo model and threading, outweighs those advantages. The build cost delta is ~30-70 lines — less than an hour of work. MOLTS precedent is irrelevant if the project owner prefers a different platform. Mobile UX difference is minor (both have good push notifications).

**Updated ranking for Tier 2 external connector: Discord replaces Telegram as the first connector.**

---

## 2. GitHub's Messaging Integrations — What's Free

Brady asked whether GitHub's built-in integrations can give us messaging capabilities without building a custom bot. Let me evaluate each one.

### 2a. GitHub for Microsoft Teams App

**What it is:** A first-party Microsoft app that connects GitHub repos to Teams channels. Install from the Teams app store, authenticate with GitHub, subscribe channels to repos.

**What it actually does:**
- ✅ Subscribes a Teams channel to GitHub events (push, PR, issue, deployment, etc.)
- ✅ Sends formatted cards to Teams when events fire
- ✅ Allows `@github` commands in Teams to create issues, close PRs, etc.
- ✅ Link previews for GitHub URLs in Teams messages

**What it does NOT do:**
- ❌ **No programmable messaging FROM repos.** You can't send arbitrary messages from a GitHub Action or API call to a Teams channel via this integration. It's event-driven, not API-driven.
- ❌ **No custom bot behavior.** The integration is the `@github` bot, not YOUR bot. You can't make it respond as Keaton or route to Squad agents.
- ❌ **No inbound message processing.** Teams messages don't flow BACK to GitHub in a programmable way. The `@github` commands are hardcoded (create issue, close PR, etc.).
- ❌ **No webhook endpoint we can target.** The GitHub-for-Teams integration doesn't expose an incoming webhook URL that Squad could post to.

**Verdict:** The GitHub-for-Teams app gives Brady **notifications** — "PR opened on squad repo" shows up in his Teams channel. That's useful as a complementary signal. But it is NOT a messaging bridge. It cannot replace building a custom Teams bot. We can't make it speak as Squad agents, we can't process inbound messages through it, and we can't programmatically send messages to it.

**What IS useful:** If Brady has the GitHub-for-Teams app installed, he already gets notifications in Teams. We could document this as a "zero-build Teams notification layer" — you get push notifications for issues/PRs that CCA creates. Pair that with CCA-as-squad-member (Tier 1 from 030), and Brady gets: create issue on phone → CCA processes → PR opened → Teams notification appears. That's a lightweight async loop, no custom bot required.

### 2b. Copilot Extensions as Messaging Bridge

**What they are:** Custom agents registered with GitHub that respond to `@agent` mentions in Copilot Chat.

**Could one act as a Squad messaging bridge?**
- ❌ **GitHub App-based extensions deprecated.** New registrations blocked Sept 2025, existing ones stop working Nov 2025.
- ⚠️ VS Code extension-based and MCP server extensions still work, but are scoped to VS Code/Copilot Chat — not Teams or Discord.
- ❌ **Architectural mismatch.** Extensions are request/response. Squad needs multi-agent orchestration with `task` spawning. Extensions can't spawn sub-agents or access the local filesystem. (I covered this in detail in 030 §2, Option D, and 017-platform-feasibility §4c.)
- ❌ **Not a messaging platform bridge.** Extensions live IN Copilot Chat. They don't bridge TO external messaging platforms. A Copilot Extension can't send a message to Discord or Teams.

**Verdict:** ❌ Not viable. Copilot Extensions are for extending Copilot Chat, not for bridging to external messaging platforms. They also can't do multi-agent orchestration. This is the wrong tool for the job.

### 2c. GitHub Webhooks + Actions → Notifications to Discord/Teams

**This is where we get something useful for free.**

GitHub natively supports repository webhooks. GitHub Actions can be triggered by any repo event. Both can push to external services.

**Pattern 1: GitHub Webhook → Discord (zero code)**

Discord has a native "GitHub" integration in Server Settings → Integrations. But more powerfully, Discord channels support **incoming webhooks** — a URL you POST to, and the message appears in the channel.

```yaml
# .github/workflows/squad-notify-discord.yml
name: Notify Discord
on:
  issues:
    types: [opened, closed]
  pull_request:
    types: [opened, merged]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Discord Notification
        uses: sarisia/actions-status-discord@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
          title: "${{ github.event_name }}: ${{ github.event.issue.title || github.event.pull_request.title }}"
          description: "${{ github.event.issue.body || github.event.pull_request.body }}"
```

**What this gives us:** One-way notifications from GitHub → Discord. When CCA opens a PR, Discord gets a message. When an issue is created, Discord gets a message. Zero custom bot code.

**What this does NOT give us:** Inbound messages. Brady can't type in Discord and have it reach Squad. This is notification-only, not conversational.

**Pattern 2: GitHub Webhook → Teams Incoming Webhook**

Teams channels also support incoming webhooks (via Workflows/Power Automate or the legacy Incoming Webhook connector).

```yaml
# Same pattern, different target
- name: Teams Notification
  uses: aliencube/microsoft-teams-actions@v0.8.0
  with:
    webhook_uri: ${{ secrets.TEAMS_WEBHOOK_URL }}
    title: "Squad: ${{ github.event.issue.title }}"
```

**What this gives us:** Same as Discord — one-way notifications.

**Pattern 3: The Hybrid Free Tier**

Combine CCA (Tier 1) + GitHub Actions notifications:

```
Brady creates issue on phone → CCA picks it up → CCA opens PR →
GitHub Action fires → Discord/Teams webhook → Brady gets notification
```

This gives Brady a **full async loop without any custom bot:**
1. Input: GitHub Issues (Mobile)
2. Processing: CCA (zero infrastructure)
3. Output: PR + notification via webhook to Discord/Teams

**Estimated cost to set up: 1 workflow file (~20 lines YAML), 1 Discord webhook URL, 30 minutes total.**

This isn't "DM your squad." But it IS "assign work and get notified when it's done" — which covers maybe 60% of Brady's async use case.

### Summary: What's Free vs. What Requires Custom Code

| Capability | Free via GitHub Integrations | Requires Custom Bot |
|-----------|------------------------------|---------------------|
| Notifications (GitHub → Discord/Teams) | ✅ Webhooks + Actions | — |
| Event cards in Teams | ✅ GitHub-for-Teams app | — |
| Inbound messages (Discord/Teams → Squad) | ❌ | ✅ Custom bot |
| Agent-personalized responses | ❌ | ✅ Custom bot |
| Per-repo conversational routing | ❌ | ✅ Custom bot |
| Multi-agent orchestration from chat | ❌ | ✅ Custom bot + SDK |
| Proactive push FROM Squad | ❌ (only event-driven) | ✅ Custom bot |

**Bottom line:** GitHub integrations give us the notification layer for free. The conversational layer — which is the core of Squad DM — requires custom code. No shortcut.

---

## 3. Platform Lock-in Risk

Brady asked: if we lean heavily on GitHub-specific integrations (Copilot Extensions, GitHub-Teams connector, CCA), does that close the door on Azure DevOps or GitLab?

### Where the Lock-in Risk Lives

**Layer 1: Execution backend (Copilot SDK)**
- Risk: **Medium.** The Copilot SDK requires a GitHub Copilot subscription. If a user is on ADO or GitLab, they may or may not have Copilot.
- Mitigation: The SDK spike (030 Appendix B) is a verification gate, not a permanent commitment. If we architect the execution backend behind an interface, we can swap Copilot SDK for direct LLM API calls (Claude, OpenAI) for non-GitHub users. This is exactly what 030 §2 Option B describes — higher cost (~1200 LOC vs. ~400), but fully provider-independent.

**Layer 2: CCA-as-squad-member**
- Risk: **High, but contained.** CCA is GitHub-only. It will never work on ADO or GitLab. Period.
- Mitigation: CCA is Tier 1 — the free play for GitHub users. It's not the architecture. The conversational bridge (Tier 2) is the architecture, and that's platform-independent. ADO/GitLab users skip Tier 1 and go straight to Tier 2 (Discord/Teams bridge with direct LLM backend).

**Layer 3: Messaging connectors (Discord, Teams, Telegram)**
- Risk: **Zero.** These are third-party platforms. Nothing about using `discord.js` locks us into GitHub. A Discord bot works identically whether the backing repo is on GitHub, ADO, or GitLab.

**Layer 4: `.ai-team/` state access**
- Risk: **Zero.** Squad state lives in git. Git works everywhere. The `.ai-team/` directory, decisions.md, histories, charters — all filesystem-backed. No platform dependency.

**Layer 5: GitHub MCP tools and `gh` CLI**
- Risk: **High in coordinator prompt, zero in connector layer.** The coordinator prompt (`squad.agent.md`) is deeply GitHub-specific (I documented this in 032a §1). But the messaging connector layer doesn't touch GitHub APIs — it talks to the Squad DM Gateway, which talks to the execution backend, which talks to the repo. Fenster's provider abstraction (032a) handles the platform-specific operations behind a clean interface.

### Architecture for Keeping the Door Open

The architecture from Keaton's 017 (the hybrid gateway) already isolates platform concerns:

```
┌─────────────┐
│  Discord    │ ← Platform-specific adapter (~80-120 LOC)
│  (adapter)  │    Uses discord.js. Speaks NormalizedMessage.
└──────┬──────┘
       │
┌──────▼──────┐
│  Squad DM   │ ← Platform-agnostic. Routes messages, manages sessions.
│  Gateway    │    No GitHub, no ADO, no GitLab knowledge.
└──────┬──────┘
       │
┌──────▼──────┐
│  Execution  │ ← Swappable backend:
│  Backend    │    • Copilot SDK (GitHub users)
└──────┬──────┘    • Direct LLM API (non-GitHub users)
       │           • GitHub Actions fallback (GitHub users)
┌──────▼──────┐
│  Provider   │ ← Fenster's 032a interface:
│  Abstraction│    • GitHub: gh CLI + MCP tools
└──────┬──────┘    • ADO: az CLI
       │           • GitLab: glab CLI
┌──────▼──────┐
│  Git Repo   │ ← .ai-team/ state. Pure git. Works everywhere.
│  (.ai-team/)│
└─────────────┘
```

**Key architectural principle: The messaging layer (adapters + gateway) MUST NOT import or reference anything GitHub-specific.** No `gh` commands, no GitHub MCP tools, no Copilot Extensions. Those belong in the execution backend and provider abstraction layers, which are behind interfaces that can be swapped.

### Concrete Guidelines

1. **DO:** Use `discord.js` directly. It has zero GitHub coupling.
2. **DO:** Put repo operations behind Fenster's provider interface (032a). `createIssue()`, not `gh issue create`.
3. **DO:** Make the execution backend a pluggable interface: `runCoordinator(message, repoPath)` that can be backed by Copilot SDK OR direct LLM calls.
4. **DON'T:** Use Copilot Extensions as the messaging architecture. They're GitHub-only and don't support multi-agent orchestration.
5. **DON'T:** Hardcode CCA as the only async path. CCA is a GitHub bonus, not the core architecture.
6. **DON'T:** Use the GitHub-for-Teams app as a Teams messaging strategy. It's notifications-only and GitHub-specific.

### Lock-in Assessment by Proposed Feature

| Feature | GitHub Lock-in | ADO/GitLab Compatible | Notes |
|---------|---------------|----------------------|-------|
| CCA + GitHub Issues (Tier 1) | ⚠️ GitHub-only | ❌ | Acceptable — it's a bonus for GitHub users, not the architecture |
| Discord bridge (Tier 2) | ✅ None | ✅ | discord.js has zero platform coupling |
| Teams bridge (future) | ✅ None | ✅ | Azure Bot Framework is platform-independent |
| Copilot SDK execution | ⚠️ Requires Copilot sub | ⚠️ Possible* | *ADO users may have Copilot; GitLab users likely don't |
| Direct LLM execution | ✅ None | ✅ | Fallback for non-Copilot users |
| Provider abstraction (032a) | ✅ None | ✅ by design | The entire point of 032a |
| `.ai-team/` state | ✅ None | ✅ | Pure filesystem + git |

**Bottom line for Brady:** Choosing Discord as MVP connector introduces ZERO lock-in. The risk lives in the execution backend (Copilot SDK), and that's mitigable by making it swappable. CCA is GitHub-only but it's additive, not foundational. The door to ADO/GitLab stays open.

---

## 4. Teams Connector: Is There a Lighter Path?

### What My 030 Said

Teams rated ⭐⭐ on build cost: ~200-400 LOC. Azure AD app registration, bot manifest, Azure Bot Service, approval workflow. 3-5x the effort of Telegram (now Discord).

### Can GitHub-for-Teams Be a Shortcut?

**No.** As analyzed in §2a above, the GitHub-for-Teams app is notification-only. It can't:
- Receive arbitrary inbound messages for Squad processing
- Send arbitrary outbound messages as Squad agents
- Be extended or customized programmatically

It's a closed integration. We can't piggyback on it for conversational messaging.

### Is There a Lighter-Weight Teams Path?

Yes — **two options**, both lighter than full Azure Bot Service:

**Option A: Teams Incoming Webhook + GitHub Actions (notification-only)**

Cost: ~20 lines YAML, 0 custom code.

This is the free notification layer from §2c. Brady gets Teams notifications when CCA opens PRs or issues change. Not conversational, but pairs well with CCA Tier 1.

```
Effort: 30 minutes setup
LOC: 0 custom code (just a workflow file)
Gives: One-way notifications
Doesn't give: Inbound messaging, agent responses
```

**Option B: Teams Bot via Bot Framework SDK (lighter than full Azure Bot Service)**

The `botbuilder` npm package from Microsoft doesn't actually require Azure Bot Service for development. You can run a Teams bot locally with:

1. A Teams app manifest (JSON file, ~30 lines)
2. The `botbuilder` SDK (~150-200 LOC for the adapter)
3. Dev Tunnel for local exposure (same as Discord/Telegram)
4. A free Azure Bot registration (required for Teams, but it's free tier)

```javascript
// Teams adapter — lighter path (~150-200 LOC)
const { TeamsActivityHandler, TurnContext } = require('botbuilder');

class SquadTeamsBot extends TeamsActivityHandler {
  async onMessage(context, next) {
    const text = context.activity.text;
    const channelName = context.activity.channelData?.channel?.name;
    const repo = resolveRepo(channelName);
    const response = await runSquadCoordinator(text, repo);
    await context.sendActivity(response);
    await next();
  }
}
```

The Azure Bot registration is free and takes ~10 minutes. The manifest is boilerplate. The hard part is sideloading the app in Teams (requires admin consent in many orgs) — but for Brady's personal Teams, this isn't a blocker.

```
Effort: 4-6 hours (vs. 8-16h for full Azure Bot Service)
LOC: ~150-200 custom code
Deps: botbuilder (npm), Azure Bot registration (free)
Gives: Full conversational messaging, per-repo channels
Blocker: Teams admin consent for app sideloading
```

**Option C: Power Automate / Workflows as bridge (very experimental)**

Teams now has "Workflows" (successor to Connectors) that can trigger on channel messages and POST to webhooks. In theory:

```
Teams message → Workflow trigger → POST to Dev Tunnel → Squad Gateway → response → Workflow → post back to Teams
```

This would avoid building a Teams bot entirely. But:
- ⚠️ Workflows are limited in what data they pass (message text, basic metadata)
- ⚠️ Posting back requires a separate webhook step
- ⚠️ Latency adds up (two HTTP hops through Power Automate)
- ⚠️ Power Automate has its own rate limits and licensing
- ❌ Not well-documented for this use case

**I don't recommend this.** It's fragile and adds a dependency on Power Automate licensing.

### Teams Recommendation

For 0.3.0: **Use Option A (webhook notifications).** Zero code, pairs with CCA. Brady gets notified in Teams when things happen.

For 0.4.0+: **Use Option B (Bot Framework SDK, lighter path).** ~150-200 LOC, free Azure Bot registration, reuses the same Squad DM Gateway that Discord uses. Per-repo via Teams channels is the best per-repo story of any platform.

Do NOT use the GitHub-for-Teams app as a substitute for a custom bot. It's not programmable.

---

## 5. Updated Connector Recommendation for v0.3.0 MVP

### What Changed from 030

| Dimension | 030 Recommendation | Updated Recommendation | Why |
|-----------|--------------------|-----------------------|-----|
| **Tier 2 connector** | Telegram | **Discord** | Brady's preference, better per-repo model, comparable build cost |
| **Tier 2 priority** | "if time permits" | "if time permits" (unchanged) | CCA is still Tier 1. Discord is still Tier 2. |
| **Teams timeline** | 0.4.0+ | 0.4.0+ (unchanged) | But we add free notification webhooks in 0.3.0 |
| **Free notification layer** | Not in 030 | **Add GitHub Actions → Discord webhook in 0.3.0** | 20 lines YAML, complements CCA |

### Updated Connector Ranking

| Rank | Platform | What It Does | Ship When | Effort |
|------|----------|-------------|-----------|--------|
| 1 | **CCA + GitHub Issues** | Zero-build async work assignment | 0.3.0 (Tier 1) | 2-4h (prompt engineering) |
| 1b | **GitHub Actions → Discord webhook** | One-way notifications, complements Tier 1 | 0.3.0 | 30 min (1 workflow file) |
| 2 | **Discord bridge** | Conversational async messaging, per-repo channels | 0.3.0 if time / 0.4.0 | 8-16h |
| 3 | **GitHub Actions → Teams webhook** | One-way notifications for Teams users | 0.4.0 | 30 min |
| 4 | **Teams bot (Bot Framework)** | Conversational, per-repo channels | 0.4.0+ | 4-6h (adapter only) |
| 5 | **Telegram** | Alternative messaging connector | 0.5.0+ (community demand) | 4-8h |
| 6 | **Slack** | Enterprise messaging | 0.5.0+ | 8-12h |

### What I'm Recommending for 0.3.0

**Ship these, in order:**

1. **CCA-as-squad-member** (Tier 1, from 030). 2-4 hours. Prompt engineering only. This is unchanged.

2. **GitHub Actions → Discord webhook notification** (Tier 1b, new). 30 minutes. One workflow YAML file. When CCA opens a PR or an issue changes state, a notification appears in Brady's Discord channel. This bridges the gap between "CCA did work" and "Brady knows about it" without building a bot.

3. **Discord bridge MVP** (Tier 2, replacing Telegram from 030). 8-16 hours. Copilot SDK backend, `discord.js` adapter, single-server, channel-per-repo. Brady-only auth via Discord user ID.

### Library Recommendations

| Component | Library | Version | NPM Weekly Downloads |
|-----------|---------|---------|---------------------|
| Discord adapter | `discord.js` | ^14.x | ~500K |
| Execution backend | `@github/copilot-sdk` | Technical Preview | N/A |
| Notifications | `sarisia/actions-status-discord` (GitHub Action) | v1 | N/A |

### The Architecture for 0.3.0

```
┌─────────────────────────────────────────────────────┐
│                    TIER 1                             │
│                                                       │
│  GitHub Issues (Mobile) → CCA → PR → GitHub Actions   │
│                                        │               │
│                                        ▼               │
│                               Discord Webhook          │
│                               (notification only)      │
│                                                         │
│  Effort: 2-4h prompt eng + 30 min webhook setup        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    TIER 2 (if time)                    │
│                                                       │
│  Discord (conversational) → Squad DM Gateway           │
│       │                         │                      │
│       │    NormalizedMessage     │                      │
│       ▼                         ▼                      │
│  discord.js adapter      Copilot SDK execution         │
│  (~80-120 LOC)           (~200-400 LOC)                │
│       │                         │                      │
│       │                         ▼                      │
│       │                    Local Repo                   │
│       │                    (.ai-team/)                  │
│       │                                                │
│  Effort: 8-16h                                         │
└─────────────────────────────────────────────────────────┘
```

### Why My Recommendation Changed

Three reasons:

1. **Brady's explicit preference.** He said Discord, not Telegram. When the build cost delta is <1 hour and the project owner has a clear preference, follow it.

2. **Per-repo model.** Discord's server+channels architecture maps 1:1 to Brady's "one channel per repo" requirement. Telegram requires workarounds (groups or commands). This was already visible in my 030 ratings (Telegram ⭐⭐⭐ vs. Discord ⭐⭐⭐⭐ on per-repo), but I underweighted it because I was optimizing for build cost. Brady's preference corrects that.

3. **Community alignment.** If Squad grows beyond Brady, the developer community lives on Discord, not Telegram. Building Discord-first means the community connector is also the MVP connector. One stone, two birds.

### What I'm NOT Changing

- **CCA as Tier 1.** It's still free, still zero-infrastructure, still the fastest path to async comms. Nothing about Discord preference changes this.
- **Copilot SDK as execution backend.** The SDK spike is still the go/no-go gate for Tier 2. This is independent of which messaging platform we target.
- **Dev Tunnels over ngrok.** For webhook mode (if we move past polling), Dev Tunnels remains the right choice.
- **Provider abstraction alignment.** The connector layer stays platform-agnostic per Fenster's 032a architecture.

---

## Appendix A: Discord Bot Setup Reference

```bash
# 1. Create Discord Application
# → https://discord.com/developers/applications
# → New Application → "Squad" → Bot tab → Reset Token → copy

# 2. Enable Privileged Intents
# → Bot tab → Message Content Intent → Enable

# 3. Generate Invite URL
# → OAuth2 → URL Generator → Scopes: bot → Permissions: Send Messages, Read Messages
# → Copy URL → Open in browser → Select server

# 4. Set environment variables
export DISCORD_TOKEN="your-bot-token"
export AUTHORIZED_USER_ID="brady's-discord-id"
```

## Appendix B: Discord Notification Workflow (GitHub Actions)

```yaml
# .github/workflows/squad-discord-notify.yml
name: Squad Discord Notifications
on:
  issues:
    types: [opened, closed, assigned]
  pull_request:
    types: [opened, merged, closed]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Discord
        env:
          WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          EVENT: ${{ github.event_name }}
          TITLE: ${{ github.event.issue.title || github.event.pull_request.title }}
          URL: ${{ github.event.issue.html_url || github.event.pull_request.html_url }}
          ACTOR: ${{ github.actor }}
          ACTION: ${{ github.event.action }}
        run: |
          curl -H "Content-Type: application/json" \
            -d "{\"embeds\":[{\"title\":\"[$EVENT $ACTION] $TITLE\",\"url\":\"$URL\",\"description\":\"by $ACTOR\",\"color\":5814783}]}" \
            "$WEBHOOK_URL"
```

## Appendix C: Comparison Matrix — All Six Connectors

| | CCA+Issues | Discord | Telegram | Teams (webhook) | Teams (bot) | Slack |
|---|---|---|---|---|---|---|
| **Adapter LOC** | 0 | 80-120 | 50 | 0 (YAML) | 150-200 | 200-300 |
| **Per-repo** | Native | Channels ⭐⭐⭐⭐ | Groups ⭐⭐⭐ | N/A | Channels ⭐⭐⭐⭐⭐ | Channels ⭐⭐⭐⭐ |
| **Conversational** | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Mobile UX** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **GitHub lock-in** | ⚠️ Yes | None | None | ⚠️ Webhook source | None | None |
| **ADO/GitLab safe** | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Setup time** | 2-4h | 8-16h | 4-8h | 30 min | 4-6h | 8-12h |
| **External deps** | None | discord.js | telegraf | None | botbuilder | @slack/bolt |
| **Brady preference** | ✅ | ✅ Preferred | ❌ Not wanted | ✅ Wanted later | ✅ Wanted later | Not mentioned |

---

**This is Kujan's updated assessment. Discord replaces Telegram. The free notification layer (Actions webhooks) bridges the gap. Lock-in risk is manageable. CCA is still first. Ship it.**
