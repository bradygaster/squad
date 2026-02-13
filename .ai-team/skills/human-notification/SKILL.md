---
name: "human-notification"
description: "Teaches agents when and how to notify humans via external channels (Teams, iMessage, etc.) when immediate input is required. Use this skill when work is blocked, an unrecoverable error occurs, a strategic decision is needed, or work is complete and ready for review."
domain: "team-communication"
confidence: "high"
source: "manual"
tools:
  - name: "send_teams_message"
    description: "Send a message to a Microsoft Teams channel using Adaptive Card format"
    when: "When Microsoft Teams MCP server is configured"
  - name: "send_imessage"
    description: "Send an iMessage to a recipient (Mac only)"
    when: "When iMessage MCP server is configured and running on macOS"
  - name: "post_webhook"
    description: "POST JSON payload to a webhook URL"
    when: "When generic webhook MCP server is configured"
---

# Human Notification Skill

## Context

This skill teaches agents WHEN to notify humans via external channels (Microsoft Teams, iMessage, Discord, generic webhooks) and HOW to compose rich, agent-branded notifications that feel like messages from remote coworkers.

**Use this skill when:**
- Work is blocked and cannot proceed without human input (decision, clarification, approval)
- An unrecoverable error occurs that requires human intervention (auth failure, permission denied, API outage)
- A strategic decision is needed between multiple valid alternatives
- (Optional) Work is complete and ready for human review

**Core principle:** Notifications are for URGENT issues that require immediate human attention. Do not notify for routine progress updates or problems that can be resolved by another agent.

## Notification Trigger Taxonomy

### 1. BLOCKED 🚫

**When to trigger:**
- Work cannot proceed without human input
- Another agent or external dependency is blocking progress
- A human team member was assigned work and needs to act

**Examples:**
- "Use REST or GraphQL for the API? This affects the entire backend architecture."
- "Cannot deploy to production without AWS credentials."
- "Design approval needed before implementing components."

**Notification structure:**
```
🚫 BLOCKED — {Your Name} needs {human's} input

{Brief explanation of what's blocked and why}

Action needed: {What the human should do}
{Optional: Link to GitHub issue, PR, or proposal}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

### 2. ERROR ⚠️

**When to trigger:**
- Unrecoverable error that prevents work from continuing
- Authentication or permission failures
- Missing required environment variables, credentials, or configuration
- External service outages or API failures

**Examples:**
- "All tests failing due to missing DATABASE_URL environment variable."
- "GitHub Actions workflow failing on authentication — check GITHUB_TOKEN permissions."
- "Cannot push to main branch — branch protection rules require PR."

**Notification structure:**
```
⚠️ ERROR — {Your Name} encountered a problem

{Error description — what happened}

{What might fix it or what the human should investigate}
{Optional: Link to logs, error output, or failed workflow}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

### 3. DECISION 🤔

**When to trigger:**
- A choice between multiple valid alternatives affects strategy, architecture, or user experience
- There's no objectively "correct" answer — it requires human judgment or preference
- The decision has downstream implications for other work

**Examples:**
- "Store user sessions in Redis (faster, adds dependency) or PostgreSQL (reuses infrastructure)?"
- "Dark mode — user preference toggle or system preference detection?"
- "Rate limiting — per-user or per-IP? This affects API design and security."

**Notification structure:**
```
🤔 DECISION — {Your Name} needs {human's} choice

{Brief framing of the decision}

Options:
1. {Option A — brief description and trade-offs}
2. {Option B — brief description and trade-offs}
{Optional: Additional options}

{Optional: Your recommendation if you have one}
{Optional: Link to proposal or discussion}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

### 4. COMPLETE ✅ (Opt-In Only)

**When to trigger:**
- Work is complete and ready for human review
- This trigger is OFF by default — only send if explicitly requested or configured

**Examples:**
- "Test suite is passing — all 47 tests green. Ready to merge PR #23."
- "User authentication API shipped and deployed to staging."
- "Architecture proposal written and posted to issue #89."

**Notification structure:**
```
✅ COMPLETE — {Your Name} finished work

{What was completed}

{What the human should do next — review, merge, deploy, approve}
{Link to PR, issue, or deployed artifact}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

## Tool Detection Pattern

Before sending a notification, detect which notification tools are available:

```
1. Check available tools in your context
2. If `send_teams_message` exists → use Teams format (Adaptive Card JSON)
3. Else if `send_imessage` exists → use iMessage format (plain text)
4. Else if `post_webhook` exists → use webhook format (JSON payload)
5. Else → log that notification would have been sent and continue gracefully
```

**Graceful degradation:** If no notification tools are available, log the notification attempt and continue working. Do NOT crash or halt. Notifications are an enhancement, not a requirement.

## Platform-Specific Message Formats

### Microsoft Teams (Adaptive Card)

Use `send_teams_message` with an Adaptive Card JSON payload:

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "{Your Name} needs input",
  "themeColor": "D93F0B",
  "sections": [{
    "activityTitle": "{Icon} {Type} — {Your Name} {action}",
    "activitySubtitle": "Squad · {repo}",
    "text": "{Message body — 1-3 sentences}",
    "facts": [
      {"name": "Agent:", "value": "{Your Name} {Your Emoji} ({Your Role})"},
      {"name": "Type:", "value": "{BLOCKED|ERROR|DECISION|COMPLETE}"}
    ]
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Details",
    "targets": [{"os": "default", "uri": "{link to GitHub issue/PR}"}]
  }]
}
```

**Color coding:**
- BLOCKED: `"D93F0B"` (red-orange)
- ERROR: `"FF0000"` (red)
- DECISION: `"1D76DB"` (blue)
- COMPLETE: `"0E8A16"` (green)

### iMessage (Plain Text)

Use `send_imessage` with plain text (no rich formatting):

```
{Icon} {Type} — {Your Name} {action}

{Message body — 1-3 sentences}

Action: {What the human should do}
{Optional: Link}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

**Example:**
```
🚫 BLOCKED — Keaton needs your input

Use REST or GraphQL for the new API? This affects backend architecture.

Action: Review proposal at https://github.com/owner/repo/issues/89

— Keaton 🏗️ (Lead) · Squad · squad/squad
```

### Generic Webhook (JSON Payload)

Use `post_webhook` with a structured JSON payload:

```json
{
  "agent": "{Your Name}",
  "emoji": "{Your Emoji}",
  "role": "{Your Role}",
  "type": "{BLOCKED|ERROR|DECISION|COMPLETE}",
  "icon": "{🚫|⚠️|🤔|✅}",
  "message": "{Message body}",
  "action": "{What the human should do}",
  "link": "{URL to GitHub artifact}",
  "repo": "{owner/repo}",
  "timestamp": "{ISO-8601 timestamp}"
}
```

The consumer's webhook endpoint receives this JSON and routes it to their chosen platform (Slack, Discord, SMS, push notifications, etc.).

## Examples

### Example 1: BLOCKED notification (Teams)

**Scenario:** Keaton (Lead) needs Brady to decide between REST and GraphQL for the API.

**Tool call:**
```
send_teams_message({
  "@type": "MessageCard",
  "summary": "Keaton needs your input",
  "themeColor": "D93F0B",
  "sections": [{
    "activityTitle": "🚫 BLOCKED — Keaton needs your input",
    "activitySubtitle": "Squad · squad/squad",
    "text": "Use REST or GraphQL for the new API? This decision affects the entire backend architecture and client integration patterns.",
    "facts": [
      {"name": "Agent:", "value": "Keaton 🏗️ (Lead)"},
      {"name": "Type:", "value": "BLOCKED"}
    ]
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "View Proposal",
    "targets": [{"os": "default", "uri": "https://github.com/squad/squad/issues/89"}]
  }]
})
```

**Result:** Brady's phone vibrates. He sees the Teams notification, reads the context, clicks "View Proposal," and makes a decision.

### Example 2: ERROR notification (iMessage)

**Scenario:** McManus (Backend Dev) hits a missing environment variable error during deployment.

**Tool call:**
```
send_imessage({
  recipient: "brady@example.com",
  message: "⚠️ ERROR — McManus encountered a problem\n\nDeployment to production failed: DATABASE_URL environment variable is not set.\n\nPlease add DATABASE_URL to the production environment configuration or verify deployment secrets.\n\n— McManus 🔧 (Backend Dev) · Squad · squad/squad"
})
```

**Result:** Brady receives an iMessage, sees the error, and adds the missing environment variable.

### Example 3: DECISION notification (Webhook)

**Scenario:** Verbal (Frontend Dev) needs Brady to choose between a dark mode toggle or system preference detection.

**Tool call:**
```
post_webhook({
  url: "https://brady-notifications.example.com/squad",
  payload: {
    "agent": "Verbal",
    "emoji": "⚛️",
    "role": "Frontend Dev",
    "type": "DECISION",
    "icon": "🤔",
    "message": "Dark mode implementation — should we use a user preference toggle (more control, requires UI) or system preference detection (automatic, less customization)?",
    "action": "Choose approach",
    "link": "https://github.com/squad/squad/issues/72",
    "repo": "squad/squad",
    "timestamp": "2026-02-11T10:45:00Z"
  }
})
```

**Result:** Brady's custom webhook backend routes the notification to his preferred channel (Discord, SMS, etc.), and he responds with his choice.

### Example 4: COMPLETE notification (Teams, opt-in)

**Scenario:** Fenster (Tester) finished the test suite, and Brady has enabled COMPLETE notifications for this repo.

**Tool call:**
```
send_teams_message({
  "@type": "MessageCard",
  "summary": "Fenster finished work",
  "themeColor": "0E8A16",
  "sections": [{
    "activityTitle": "✅ COMPLETE — Fenster finished work",
    "activitySubtitle": "Squad · squad/squad",
    "text": "Test suite is passing — all 47 tests green. Code coverage is at 92%. Ready to merge PR #23.",
    "facts": [
      {"name": "Agent:", "value": "Fenster 🧪 (Tester)"},
      {"name": "Type:", "value": "COMPLETE"}
    ]
  }],
  "potentialAction": [{
    "@type": "OpenUri",
    "name": "Merge PR",
    "targets": [{"os": "default", "uri": "https://github.com/squad/squad/pull/23"}]
  }]
})
```

**Result:** Brady sees the completion notification, reviews the PR, and merges.

## Anti-Patterns

**DO NOT notify for:**
- Routine progress updates ("Started working on X", "Finished step 1 of 5")
- Problems that can be resolved by spawning another agent ("I don't know the answer, but McManus might")
- Redundant notifications (if already blocked on the same issue, don't re-notify unless the situation changes)
- Low-priority issues that can wait until the next sync session

**DO NOT spam:**
- If you've already sent a notification about a specific blocker, DO NOT send another until the blocker is resolved or changes
- Use judgment: if the human is in an active session with you, prefer in-terminal responses over external notifications

**DO NOT assume delivery:**
- If the notification tool call fails, log the failure and continue gracefully
- The coordinator will still prompt the human via the terminal as a fallback

**DO NOT send sensitive data:**
- Notifications may pass through third-party services (Teams, iMessage, webhooks)
- Do NOT include credentials, secrets, or sensitive user data in notification messages
- Link to GitHub artifacts instead of embedding raw data

## Integration with Human Team Members

When work routes to a human team member (not an AI agent), send a BLOCKED notification on their behalf:

```
🚫 BLOCKED — {Your Name} assigned work to {Human}

Task: {Brief task summary}

{Human} needs to {action required}.

Link: {GitHub issue or context}

— {Your Name} {Your Emoji} ({Your Role}) · Squad · {repo}
```

**Example:**
```
🚫 BLOCKED — Keaton assigned work to Sarah

Task: Design review for homepage redesign

Sarah needs to approve the visual direction before components can be implemented.

Link: https://github.com/squad/squad/issues/42

— Keaton 🏗️ (Lead) · Squad · squad/squad
```

## Logging Notification Attempts

Every notification attempt (success or failure) should be logged to `.ai-team/notifications/log.jsonl` (append-only):

```json
{"timestamp": "2026-02-11T10:30:00Z", "agent": "Keaton", "type": "BLOCKED", "message": "Use REST or GraphQL...", "tool": "send_teams_message", "status": "success"}
{"timestamp": "2026-02-11T10:45:00Z", "agent": "McManus", "type": "ERROR", "message": "DATABASE_URL missing", "tool": "send_imessage", "status": "failed", "error": "Recipient not configured"}
```

This log is useful for:
- Debugging notification delivery issues
- Retrospectives (how often are agents blocked?)
- Auditing (when did the human receive the ping?)

## Configuration (Optional)

Squad does not require configuration to use this skill, but consumers can add optional settings to `.ai-team/team.md` under a `[notifications]` section:

```markdown
## Notifications

- **Enabled:** true
- **Complete notifications:** false (opt-in)
- **Ralph escalation:** false (opt-in — Ralph sends notifications for stale work)
- **Log file:** `.ai-team/notifications/log.jsonl`
```

If no configuration exists, assume notifications are enabled with COMPLETE and Ralph escalation OFF.

## Testing This Skill

To verify this skill works:

1. **Configure an MCP server** (Teams, iMessage, or webhook) in your Copilot environment
2. **Spawn an agent** and trigger a blocker: "Keaton, design the API but ask me before choosing REST or GraphQL"
3. **Verify notification arrival:** Check your Teams channel, iMessage, or webhook endpoint
4. **Test graceful degradation:** Disable the MCP server, trigger a blocker, verify the agent logs the notification attempt and continues

## Summary

This skill enables agents to feel like remote coworkers — they ping you when they need you. Notifications are urgent, agent-branded, action-oriented, and platform-agnostic. Squad teaches the pattern; the consumer brings the delivery mechanism.

**Key takeaway:** Notify when work stops without human input. Compose messages that let humans triage from their phone. Degrade gracefully when no notification tools exist.
