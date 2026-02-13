# Proposal 034: Squad Pings You — Notification Architecture

**Author:** Keaton (Lead)  
**Date:** 2026-02-11  
**Status:** Draft  
**Requested by:** bradygaster — *"It needs to feel like I'm not in the team room, they are, and they need me so they pinged me."*  
**Builds on:** Proposal 012 (Skills + MCP), 017/030/030a (async comms analysis), 032a (provider abstraction)

---

## 1. Vision

Brady's on his phone. His squad hits a wall — a decision they can't make, an error they can't fix, a blocked dependency only he can unblock. They need him NOW.

Today, Squad pauses and tells Brady in the terminal: *"Keaton needs your input."* That works if Brady's at his desk. It fails everywhere else.

**This proposal makes Squad agents feel like remote coworkers.** When they need you, they ping you. A notification appears on your phone via Teams or iMessage. You see who pinged (Keaton 🏗️), why they pinged (blocked on auth architecture decision), and enough context to respond or defer intelligently.

The notification isn't a dump of terminal output. It's rich, agent-branded, action-oriented communication. It feels like your squad is in the team room — just not physically.

### The Core Constraint

**Squad ships ZERO notification infrastructure.** This is an MCP integration pattern. The consumer brings their own notification MCP server (Teams, iMessage, Discord, generic webhook). Squad teaches agents WHEN and HOW to ping, but doesn't implement the ping.

This preserves Squad's zero-dependency architecture while enabling rich, platform-agnostic notifications for any consumer who wires up an MCP server.

---

## 2. Architecture Overview

### Three Layers

```
┌─────────────────────────────────────────────────────┐
│ LAYER 1: Notification Skill                        │
│ Teaches agents: when to ping, how to compose       │
│ Location: .ai-team/skills/human-notification/      │
│ Format: Standard SKILL.md                           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ LAYER 2: MCP Tool Abstraction                      │
│ Squad agents call whatever notification tools exist │
│ No hardcoded tool names — skill teaches pattern    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ LAYER 3: Consumer's MCP Server (user-configured)   │
│ Examples: Teams, iMessage, Discord, webhook        │
│ Consumer wires this in .vscode/mcp.json            │
└─────────────────────────────────────────────────────┘
```

### What Squad Provides

1. **A notification skill** at `.ai-team/skills/human-notification/SKILL.md`
2. **Documentation** for configuring common MCP servers (Teams, iMessage, Discord)
3. **Nothing else** — no dependencies, no notification code in Squad core

### What the Consumer Provides

1. **An MCP server** that exposes notification tools (e.g., `send_teams_message`, `send_imessage`, `post_webhook`)
2. **MCP configuration** in their Copilot environment (`.vscode/mcp.json`, VS Code settings, etc.)
3. **Credentials** for their chosen platform (Teams webhook URL, iMessage permissions, etc.)

---

## 3. The Notification Skill

### Location

`.ai-team/skills/human-notification/SKILL.md`

### Skill Metadata

```yaml
---
name: "human-notification"
description: "Teaches agents when and how to notify humans via external channels (Teams, iMessage, etc.) when immediate input is required."
domain: "team-communication"
confidence: "high"
source: "manual"
tools:
  - name: "send_teams_message"
    description: "Send a message to a Microsoft Teams channel"
    when: "When Teams MCP server is available"
  - name: "send_imessage"
    description: "Send an iMessage to a recipient"
    when: "When iMessage MCP server is available (Mac only)"
  - name: "post_webhook"
    description: "POST JSON to a webhook URL"
    when: "When generic webhook MCP server is available"
---
```

### Skill Content (Summary — Full version in deliverable)

The skill teaches agents:

1. **When to notify** — Four triggers:
   - **Blocked:** Work cannot proceed without human input (decision, clarification, approval)
   - **Error:** Unrecoverable error requiring human intervention (auth failure, API outage, permission denied)
   - **Decision:** Choice between valid alternatives that affects strategy or user experience
   - **Complete:** Work is done and ready for human review (optional, configurable)

2. **How to compose notifications** — Agent-branded messages with:
   - **Who:** Agent name + emoji (Keaton 🏗️)
   - **Why:** Notification type badge (🚫 BLOCKED, ⚠️ ERROR, 🤔 DECISION, ✅ COMPLETE)
   - **Context:** Brief explanation (1-2 sentences)
   - **Action:** What the human should do next (optional)
   - **Link:** URL to relevant artifact (GitHub issue, PR, file) if applicable

3. **Tool detection pattern** — How to discover which notification tools are available:
   ```
   Check available tools:
   - If send_teams_message exists → use Teams format
   - Else if send_imessage exists → use iMessage format
   - Else if post_webhook exists → use webhook format with platform-agnostic JSON
   - Else → log that notification would have been sent (graceful degradation)
   ```

4. **Example notification formats** for each platform (Teams card JSON, iMessage plain text, webhook payload)

### Skill Anti-Patterns

- Don't notify for routine progress updates ("started X", "finished Y") unless completion notification is explicitly requested
- Don't notify if the blocker is resolvable by another agent
- Don't spam — if already blocked on same issue, don't re-notify unless situation changes
- Don't assume notification delivery — log notification attempt and continue gracefully if tool fails

---

## 4. Notification Trigger Taxonomy

### 4.1 BLOCKED

**Trigger:** Work cannot proceed without human input.

**Examples:**
- "Keaton needs your decision: Use REST or GraphQL for the new API? This affects the entire backend architecture."
- "McManus is blocked: Cannot deploy to production without AWS credentials. Please provide credentials or grant access."
- "Verbal waiting on design approval: The homepage redesign is ready for review at PR #42."

**Notification content:**
```
🚫 BLOCKED — {Agent} needs your input

{Brief explanation of what's blocked and why}

Action needed: {What the human should do}
{Optional: Link to artifact}
```

### 4.2 ERROR

**Trigger:** Unrecoverable error that requires human intervention.

**Examples:**
- "⚠️ Fenster hit an error: All tests failing due to missing DATABASE_URL environment variable. Setup required."
- "⚠️ McManus error: GitHub Actions workflow failing on authentication. Check GITHUB_TOKEN permissions."
- "⚠️ Keaton error: Cannot push to main branch — branch protection rules require PR. Please adjust settings or confirm workflow."

**Notification content:**
```
⚠️ ERROR — {Agent} encountered a problem

{Error description — what happened}

{What might fix it or what the human should investigate}
{Optional: Link to logs/output}
```

### 4.3 DECISION

**Trigger:** Choice between multiple valid alternatives that affects strategy, architecture, or user experience.

**Examples:**
- "🤔 Keaton decision needed: Store user sessions in Redis or PostgreSQL? Trade-offs: Redis is faster but adds a dependency. PostgreSQL reuses existing infrastructure."
- "🤔 Verbal decision needed: Dark mode — user preference toggle or system preference detection? Both are standard patterns."
- "🤔 McManus decision needed: Rate limiting — per-user or per-IP? This affects API design and security posture."

**Notification content:**
```
🤔 DECISION — {Agent} needs your choice

{Brief framing of the decision}

Options:
1. {Option A — brief description}
2. {Option B — brief description}
{Optional: Option C, D, etc.}

{Optional: Agent's recommendation if they have one}
{Optional: Link to proposal or discussion}
```

### 4.4 COMPLETE (Optional)

**Trigger:** Work is done and ready for human review. This trigger is OFF by default — users opt in via team configuration if they want completion notifications.

**Examples:**
- "✅ Fenster complete: Test suite is passing. All 47 tests green. Ready to merge PR #23."
- "✅ McManus complete: User authentication API shipped. Deployed to staging at https://staging.example.com/api/auth."
- "✅ Keaton complete: Architecture proposal written and posted to issue #89. Ready for your review."

**Notification content:**
```
✅ COMPLETE — {Agent} finished work

{What was completed}

{What the human should do next — review, merge, deploy, approve}
{Link to artifact}
```

---

## 5. Consumer Setup Patterns

### 5.1 Microsoft Teams (Primary Path)

**Why Teams:** Brady said Teams is "ideal, especially per-repo channels." The channel-per-repo model is native to Teams. Microsoft ships official MCP support. Most enterprise devs already have Teams installed on their phones.

**Setup:**

1. **Create a Team and channels:**
   - Team: "My Squads"
   - Channels: One per repo (e.g., `#squad`, `#other-project`)

2. **Set up Incoming Webhooks:**
   - In each channel: Connectors → Incoming Webhook
   - Name: "Squad Notifications"
   - Copy webhook URL

3. **Install Microsoft Teams MCP server:**
   ```bash
   npm install -g @microsoft/teams.mcp
   ```

4. **Configure MCP in `.vscode/mcp.json`:**
   ```json
   {
     "mcpServers": {
       "teams": {
         "command": "teams-mcp",
         "args": [],
         "env": {
           "TEAMS_WEBHOOK_URL": "https://outlook.office.com/webhook/..."
         }
       }
     }
   }
   ```

5. **Squad notification skill detects `send_teams_message` tool and sends Adaptive Card JSON:**
   ```json
   {
     "@type": "MessageCard",
     "summary": "Keaton needs your input",
     "themeColor": "D93F0B",
     "sections": [{
       "activityTitle": "🚫 BLOCKED — Keaton needs your input",
       "activitySubtitle": "Squad · squad/squad",
       "text": "Use REST or GraphQL for the new API? This affects backend architecture.",
       "facts": [
         {"name": "Agent:", "value": "Keaton 🏗️ (Lead)"},
         {"name": "Reason:", "value": "Architecture decision required"}
       ]
     }],
     "potentialAction": [{
       "@type": "OpenUri",
       "name": "View Proposal",
       "targets": [{"os": "default", "uri": "https://github.com/owner/repo/issues/89"}]
     }]
   }
   ```

**Result:** Notification appears in Teams channel. Brady's phone vibrates. He sees the message, clicks "View Proposal," responds from phone or waits until he's at desk.

**Per-repo routing:** Each repo's Squad instance is configured with its own webhook URL (or a single MCP server that routes based on repo context). Notifications go to the right channel automatically.

### 5.2 iMessage (Mac-Only Path)

**Why iMessage:** Native to macOS/iOS. Zero account setup. Instant delivery. Perfect for solo devs or small teams who live in Apple's ecosystem.

**Limitations:**
- **Mac-only:** Requires macOS with Messages.app running
- **Cannot run headless:** No CI or server deployments
- **Recipient must have an Apple ID or phone number**

**Setup:**

1. **Install iMessage MCP server:**
   ```bash
   npm install -g imessage-mcp
   # Or use CLI tool:
   brew install steipete/tap/imsg
   ```

2. **Grant automation permissions:**
   - System Preferences → Security & Privacy → Automation
   - Allow Terminal (or VS Code) to control Messages

3. **Configure MCP in `.vscode/mcp.json`:**
   ```json
   {
     "mcpServers": {
       "imessage": {
         "command": "imessage-mcp",
         "args": ["--recipient", "brady@example.com"]
       }
     }
   }
   ```

4. **Squad notification skill detects `send_imessage` tool and sends plain text:**
   ```
   🚫 BLOCKED — Keaton needs your input

   Use REST or GraphQL for the new API? This affects backend architecture.

   Action: Review proposal at https://github.com/owner/repo/issues/89

   — Keaton 🏗️ (Lead) · Squad · squad/squad
   ```

**Result:** iMessage appears on Brady's phone, Mac, iPad (Apple ecosystem sync). He responds via iMessage or switches to GitHub.

**Per-repo routing:** Each repo's Squad instance sends to the same iMessage recipient. The message body includes repo context. Not as clean as Teams channels but works for small teams.

### 5.3 Discord (Developer-Friendly Path)

**Why Discord:** Server-and-channels model fits per-repo organization. Developer community lives on Discord. Lightweight mobile app. Easy bot setup.

**Setup:**

1. **Create Discord server and channels:**
   - Server: "My Squads"
   - Text channels: `#squad`, `#other-project`

2. **Create bot:**
   - Discord Developer Portal → New Application → Bot
   - Copy bot token
   - Invite bot to server with "Send Messages" permission

3. **Install Discord MCP server (if available) or use generic webhook:**
   ```bash
   npm install -g discord-mcp
   # Or use Discord Incoming Webhooks
   ```

4. **Configure MCP:**
   ```json
   {
     "mcpServers": {
       "discord": {
         "command": "discord-mcp",
         "args": [],
         "env": {
           "DISCORD_BOT_TOKEN": "...",
           "DISCORD_CHANNEL_ID": "123456789"
         }
       }
     }
   }
   ```

5. **Notification format:** Embed with color-coded severity (red for ERROR, orange for BLOCKED, blue for DECISION, green for COMPLETE).

**Result:** Discord mobile notification. Brady sees which channel (repo) pinged him. Responds in Discord or switches to GitHub.

### 5.4 Generic Webhook (Universal Fallback)

**Why Webhook:** Works with any platform that accepts HTTP POST (Slack, PagerDuty, Zapier, custom backends). Most flexible, least opinionated.

**Setup:**

1. **Expose a webhook endpoint** (or use a service like Zapier, IFTTT, n8n):
   ```
   POST https://your-server.com/squad-notifications
   ```

2. **Install generic webhook MCP server:**
   ```bash
   npm install -g mcp-notifications
   ```

3. **Configure MCP:**
   ```json
   {
     "mcpServers": {
       "webhook": {
         "command": "mcp-notifications",
         "args": ["--webhook-url", "https://your-server.com/squad-notifications"]
       }
     }
   }
   ```

4. **Notification payload (JSON):**
   ```json
   {
     "agent": "Keaton",
     "emoji": "🏗️",
     "role": "Lead",
     "type": "BLOCKED",
     "icon": "🚫",
     "message": "Use REST or GraphQL for the new API? This affects backend architecture.",
     "action": "Review proposal",
     "link": "https://github.com/owner/repo/issues/89",
     "repo": "squad/squad",
     "timestamp": "2026-02-11T10:30:00Z"
   }
   ```

5. **Consumer's webhook handler routes to Teams, Slack, SMS, push notifications, etc.**

**Result:** Platform-agnostic. The consumer controls the delivery mechanism. Squad just POSTs JSON and moves on.

---

## 6. Integration with Existing Squad Features

### 6.1 Human Team Members

**Current behavior:** When work routes to a human team member, Squad pauses and tells the user: *"{Human} needs to act on this."* The user relays the task outside Squad, then reports back.

**With notifications:** When a human team member is the target, the assigned agent sends a notification:
- Type: BLOCKED (work cannot proceed without human input)
- Content: "{Agent} assigned work to {Human}: {task summary}. Please review and respond."
- Link: If the work is tracked in a GitHub issue, link to it. Otherwise, include enough context for the human to understand.

The stale reminder pattern (already implemented) still applies — if the human hasn't responded after a configurable delay, Squad reminds the user to follow up. But now the initial notification goes out automatically.

**Example:**
```
🚫 BLOCKED — Keaton assigned work to Sarah

Task: Design review for homepage redesign

Sarah needs to approve the visual direction before Verbal can implement components.

Link: https://github.com/squad/squad/issues/42

— Keaton 🏗️ (Lead) · Squad · squad/squad
```

### 6.2 Ralph (Work Queue Monitor)

**Current behavior:** Ralph monitors the work queue and nudges when work goes stale. He's a background process that runs in the repo and surfaces blockers.

**With notifications:** Ralph can escalate stale work via notifications:
- Type: BLOCKED (if an agent is stuck on a task for >N hours)
- Type: ERROR (if the queue has unaddressed failures)
- Content: "Ralph detected: {Issue} has been open for 3 days with no activity. Assigned to {Agent}. Possible blocker?"

Ralph's escalation threshold is configurable per repo. Default: OFF (Ralph logs but doesn't notify). Opt-in for high-priority repos where stale work is a problem.

### 6.3 Coordinator Handoffs

**Current behavior:** The coordinator spawns agents and waits for their output. If an agent hits a blocker and returns, the coordinator prompts the user for input.

**With notifications:** When an agent returns with a blocker, the coordinator:
1. Receives the agent's output (including notification attempt)
2. Logs the blocker in session context
3. Prompts user: *"{Agent} is blocked on {issue}. They sent a notification. Want to unblock them now or defer?"*

The notification goes out BEFORE the coordinator prompts. This ensures Brady gets the ping even if he's not watching the terminal.

---

## 7. Trade-offs and Alternatives

### Trade-off 1: No Auto-Configuration

**What we're NOT doing:** Squad does not auto-install or auto-configure MCP servers. The consumer must wire up the MCP server themselves.

**Why:** This preserves Squad's zero-dependency architecture. MCP servers have platform-specific dependencies (Azure credentials for Teams, macOS for iMessage, etc.). Squad can't and shouldn't manage these.

**Cost:** Consumers must read documentation and configure MCP manually. This is a setup burden.

**Mitigation:** Provide clear, copy-paste-ready setup guides for Teams (primary), iMessage (secondary), and generic webhook (fallback). Make the 80% case (Teams for enterprise devs) as easy as possible.

### Trade-off 2: Graceful Degradation When No MCP Server Exists

**What happens if the consumer doesn't configure an MCP server?**

The notification skill detects no available notification tools and logs:
```
[INFO] Would have sent notification: 🚫 BLOCKED — Keaton needs your input
[INFO] No notification MCP server configured. See docs/notifications.md for setup.
```

The agent continues working. The coordinator still prompts the user. Squad doesn't break — it just doesn't notify.

**Why:** Notifications are an enhancement, not a requirement. Squad must work without them.

### Trade-off 3: Single Notification Channel vs. Per-Agent Channels

**Option A (chosen):** All notifications from a repo go to ONE channel/recipient configured per repo.

**Option B (rejected):** Each agent could have their own notification channel (e.g., Keaton pings one Teams channel, McManus pings another).

**Why A:** Per-agent channels fragment the notification stream. Brady doesn't want to monitor 5 channels per repo. He wants ONE place to see all squad activity. The agent name + emoji in the notification content provides enough context to triage.

**Exception:** If a consumer wants per-agent routing, they can configure their webhook backend to route based on the agent field in the JSON payload. The skill doesn't enforce this — it's consumer discretion.

### Alternative 1: In-Repo Notification Log

**Considered:** Write notifications to `.ai-team/notifications/` as files, push to GitHub, and let the consumer poll or sync.

**Rejected:** This is too slow for "instant" notifications. Brady wants his phone to vibrate NOW, not on the next git pull. File-based logs are useful for auditing but not for real-time alerts.

**Compromise:** Agents can ALSO log notifications to `.ai-team/notifications/` for audit trail. But the primary delivery mechanism is MCP tools → real-time channels.

### Alternative 2: Email Notifications

**Considered:** Use an SMTP MCP server to send email notifications.

**Rejected:** Email is too slow and too noisy for real-time team communication. It's fine for summaries or daily digests but wrong for "I'm blocked right now" notifications.

**Exception:** A weekly summary email (generated by Ralph or Scribe) summarizing squad activity is a good future feature. But it's not a replacement for instant notifications.

---

## 8. Documentation Requirements

### 8.1 Consumer-Facing Docs

**New file:** `docs/notifications.md`

Sections:
1. **Overview:** What notifications are, why they're useful, how they work
2. **Setup by Platform:**
   - Microsoft Teams (step-by-step with screenshots)
   - iMessage (Mac-only setup)
   - Discord (bot creation and channel setup)
   - Generic Webhook (custom integrations)
3. **Notification Triggers:** When agents notify (BLOCKED, ERROR, DECISION, COMPLETE)
4. **Configuration Options:**
   - Per-repo webhook URLs (for Teams/Discord)
   - Completion notifications (opt-in)
   - Ralph escalation (opt-in)
5. **Troubleshooting:**
   - "I'm not receiving notifications" → check MCP config, test with `gh` CLI, verify webhook URL
   - "Notifications are too noisy" → disable COMPLETE trigger, adjust Ralph thresholds
6. **Examples:** Sample notification messages for each trigger type

### 8.2 Agent-Facing Skill

**Already covered:** The skill at `.ai-team/skills/human-notification/SKILL.md` is the agent-facing documentation. Agents read it during spawn and learn the notification pattern.

No additional agent docs needed — the skill is self-contained.

---

## 9. Sprint Plan

### Phase 1: Skill and Core Pattern (0.5 squad-days)

**Deliverables:**
- `.ai-team/skills/human-notification/SKILL.md` written and tested
- Skill teaches trigger taxonomy, composition pattern, tool detection, platform formats
- Notification skill is opt-in (agents only activate it when they detect a notification-worthy event)

**Testing:** Manually spawn agents with a configured MCP server, trigger each notification type, verify messages arrive with correct formatting.

**Owner:** Keaton (skill authoring) + Verbal (documentation structure)

### Phase 2: Teams MCP Setup Guide (0.3 squad-days)

**Deliverables:**
- `docs/notifications.md` with Teams-specific setup guide
- Copy-paste-ready MCP config examples
- Webhook setup walkthrough (with screenshots if possible)
- Sample notification messages

**Testing:** Follow the guide on a clean repo, verify notifications arrive in Teams.

**Owner:** Verbal (docs) + McManus (MCP config validation)

### Phase 3: iMessage and Webhook Guides (0.3 squad-days)

**Deliverables:**
- Add iMessage section to `docs/notifications.md`
- Add generic webhook section with JSON payload spec
- Document graceful degradation behavior (no MCP server configured)

**Testing:** Verify iMessage works on macOS. Verify webhook payload matches spec.

**Owner:** Verbal (docs) + Fenster (cross-platform testing)

### Phase 4: Human Team Members Integration (0.4 squad-days)

**Deliverables:**
- Update coordinator prompt to trigger notifications when work routes to a human
- Test: Add a human team member, assign them work, verify notification is sent
- Update `docs/features/human-team-members.md` with notification behavior

**Testing:** Spawn coordinator, route work to human, verify notification content.

**Owner:** Keaton (coordinator prompt updates) + Fenster (testing)

### Phase 5: Ralph Integration (Optional — 0.3 squad-days)

**Deliverables:**
- Ralph detects stale work and sends notification (opt-in via `team.md` config)
- Add `ralph.escalate_via_notification: true` config option
- Test: Let work go stale, verify Ralph sends notification after threshold

**Testing:** Create a stale work scenario (open issue with no activity for N hours), verify Ralph escalation.

**Owner:** McManus (Ralph integration) + Fenster (testing)

**Note:** This phase is optional for v1. Ralph already logs stale work — notification is an enhancement.

### Total Estimate: 1.8 squad-days (core) + 0.3 squad-days (Ralph optional)

**Target version:** 0.3.0 (alongside GitHub-native proposals)

---

## 10. Success Criteria

### Launch Criteria (Must Have for 0.3.0)

1. ✅ Notification skill exists at `.ai-team/skills/human-notification/SKILL.md`
2. ✅ Skill teaches all four trigger types (BLOCKED, ERROR, DECISION, COMPLETE)
3. ✅ Skill includes platform-specific message formats (Teams, iMessage, webhook)
4. ✅ `docs/notifications.md` exists with Teams and iMessage setup guides
5. ✅ Agents gracefully degrade when no MCP server is configured (log instead of crash)
6. ✅ At least ONE real-world test: Brady configures Teams, receives a notification from his squad

### Post-Launch Validation (Within 2 Weeks)

1. ✅ Brady uses notifications in production on at least ONE repo
2. ✅ At least ONE community member (not Brady) sets up notifications and reports success
3. ✅ Zero false positives (agents don't spam with inappropriate notifications)
4. ✅ Notification content is actionable (Brady can triage from his phone without opening a laptop)

### Future Enhancements (Post-0.3.0)

- **Discord support:** Add Discord to primary docs (currently in "Secondary Path" tier)
- **Slack support:** Enterprise customers may want Slack — defer until demand is clear
- **Notification preferences:** Per-agent notification settings (e.g., "only notify for Keaton's blockers")
- **Digest mode:** Daily/weekly summary email instead of real-time pings (for low-urgency repos)
- **Two-way communication:** Reply to notifications via Teams/iMessage and have Squad ingest the response (requires connector architecture, not just MCP tools)

---

## 11. Why This Approach Wins

### 1. Zero Squad Maintenance Burden

Squad ships a skill and documentation. The consumer owns the MCP server, credentials, and delivery mechanism. When Teams changes their API, the MCP server maintainer updates the server — not Squad.

### 2. Future-Proof

New platforms (Slack, Mattermost, Signal) require ZERO changes to Squad. The consumer installs the right MCP server, and the notification skill detects the tools. Squad never hardens against a specific platform.

### 3. Preserves Squad's Philosophy

Filesystem-authoritative. Zero dependencies. Git-native. Notifications are an ENHANCEMENT, not a requirement. Squad works perfectly without them.

### 4. Feels Like a Team

Brady's vision — "they are in the team room, they need me, they ping me" — is exactly what this delivers. The agent name, emoji, and tone make it clear WHO is pinging and WHY. It's not a system alert. It's Keaton saying "I need you."

---

## 12. Open Questions

1. **Should COMPLETE notifications be opt-in or opt-out?**
   - Recommendation: Opt-in. Default is OFF. Completion notifications can be noisy. Let consumers enable them if they want the visibility.

2. **What's the retry policy if a notification fails?**
   - Recommendation: Log failure and continue. Don't retry automatically (risk of spam). If the MCP tool returns an error, log it and let the coordinator prompt the user as usual.

3. **Should Ralph's escalation notifications have a separate trigger type (STALE) or use BLOCKED?**
   - Recommendation: Use BLOCKED with a "Ralph detected" prefix. It's semantically the same (work is blocked due to inaction).

4. **Do we need a notification history file (`.ai-team/notifications/log.jsonl`) for auditing?**
   - Recommendation: YES. Append-only log of all notifications sent (timestamp, agent, type, recipient, delivery status). Useful for debugging and retrospectives.

---

## Appendix A: Notification Skill (Full Specification)

See `.ai-team/skills/human-notification/SKILL.md` for the complete skill definition.

---

## Appendix B: MCP Server Recommendations

### Official / Widely Used
- **Microsoft Teams:** `@microsoft/teams.mcp` (npm) or https://github.com/microsoft/IF-MCP-Server-for-Microsoft-Teams
- **iMessage:** `imessage-mcp` (npm) or `imsg` CLI (https://github.com/steipete/imsg)
- **Generic Webhook:** `mcp-notifications` (https://github.com/zudsniper/mcp-notifications)

### Community / Third-Party
- **Discord:** `discord-mcp` (check npmjs.com or mcpmarket.com)
- **Slack:** Use `mcp-notifications` with Slack webhook URL

### Custom
- Consumers can write their own MCP server using the Copilot SDK. The server just needs to expose a tool with a signature like:
  ```typescript
  async function send_notification(payload: {
    agent: string,
    type: string,
    message: string,
    link?: string
  }): Promise<{ success: boolean }>
  ```

---

**Status:** Ready for review. Requesting approval from bradygaster.
