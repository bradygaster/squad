---
name: "directive-capture"
description: "Auto-detect user directives and capture them to the decisions inbox"
domain: "team-memory"
confidence: "high"
source: "manual"
---

## Context

Users often embed standing directives inside regular conversations — statements like "always use TypeScript strict mode" or "we don't use Redux anymore." These are team decisions, not work requests. Without capture, they get lost in chat history and are never applied consistently.

This skill teaches the coordinator (and any agent) to recognize directives, acknowledge them, and persist them to the decisions inbox so Scribe can merge them into the team's `decisions.md`.

## Directive Detection

### What Is a Directive?

A **directive** is a standing instruction that should apply to all future work. It expresses a preference, constraint, ban, or policy — not a one-time task.

### Signal Words and Patterns

Recognize these patterns as directive indicators:

| Pattern | Example |
|---|---|
| "always ..." | "Always use TypeScript strict mode" |
| "never ..." | "Never use `any` type" |
| "from now on ..." | "From now on, run tests before every PR" |
| "we don't ..." | "We don't use Redux anymore" |
| "going forward ..." | "Going forward, all APIs need OpenAPI specs" |
| "prefer X over Y" | "Prefer Vitest over Jest" |
| "stop doing ..." | "Stop using default exports" |
| "make sure to always ..." | "Make sure to always add JSDoc comments" |
| "the rule is ..." | "The rule is: no PRs without tests" |
| "don't ever ..." | "Don't ever commit .env files" |

### What Is NOT a Directive

These are work requests, questions, or agent-directed tasks — do not capture them:

- **Work requests:** "Fix the login bug", "Build a dashboard", "Add unit tests for auth"
- **Questions:** "How does the router work?", "What test framework do we use?"
- **Agent-directed tasks:** "Scribe, update the changelog", "@data review this PR"
- **One-time instructions:** "Use port 3001 for this test" (contextual, not standing)

### Edge Case: Mixed Messages

A message can contain BOTH a directive and a work request:

> "Fix the login bug. And from now on, always validate tokens on the server side."

In this case: capture the directive, then route the work request normally.

## Capture Pattern

### File Location

Write captured directives to the decisions inbox:

```
.squad/decisions/inbox/{agent}-directive-{timestamp}.md
```

Where:
- `{agent}` — the agent that detected the directive (e.g., `picard`, `data`)
- `{timestamp}` — ISO-like timestamp for uniqueness (e.g., `20250101-143022`)

### File Format

```markdown
# Directive Capture

- **When:** {ISO 8601 timestamp}
- **Who:** {person who stated the directive}
- **What:** "{verbatim quote of the directive}"
- **Why:** {context if available, or "Stated as team policy"}
- **Status:** pending-review

## Raw Context

> {the full message that contained the directive, for Scribe's reference}
```

### Merge Flow

1. Agent detects directive -> writes to `.squad/decisions/inbox/`
2. Scribe periodically merges inbox -> `decisions.md`
3. Scribe deduplicates against existing decisions
4. Inbox file is deleted after successful merge

## Coordinator Prompt Enhancement

Add this paragraph to the coordinator's system prompt (`squad.agent.md` or loaded as a skill):

```
DIRECTIVE DETECTION — Before routing any user message, check: is this a standing
directive? Look for signal words: "always", "never", "from now on", "we don't",
"going forward", "prefer X over Y", "stop doing", "don't ever". If the message
contains a directive, capture it to .squad/decisions/inbox/{agent}-directive-{timestamp}.md
with the format: timestamp, who said it, verbatim quote, and context. Acknowledge
with "📌 Captured: {one-line summary}". If the message ALSO contains a work request,
capture the directive first, then route the work request normally. Do NOT capture
one-time contextual instructions, questions, or task assignments as directives.
```

## Examples

### Example 1: Pure Directive

**Input:** "Always use TypeScript strict mode"

**Action:**
1. Detect signal word: "Always"
2. Write to `.squad/decisions/inbox/picard-directive-20250115-091500.md`
3. Respond: "📌 Captured: Use TypeScript strict mode (always)."

### Example 2: Negative Directive

**Input:** "We don't use Redux anymore"

**Action:**
1. Detect signal phrase: "We don't"
2. Write to `.squad/decisions/inbox/picard-directive-20250115-091530.md`
3. Respond: "📌 Captured: Redux is deprecated — do not use."

### Example 3: Process Directive

**Input:** "From now on, run tests before every PR"

**Action:**
1. Detect signal phrase: "From now on"
2. Write to `.squad/decisions/inbox/picard-directive-20250115-091600.md`
3. Respond: "📌 Captured: Run tests before every PR (mandatory)."

### Example 4: NOT a Directive

**Input:** "Fix the login bug"

**Action:** Route as a work request. No directive capture.

### Example 5: Mixed Message

**Input:** "Fix the login bug. And from now on, always validate tokens on the server side."

**Action:**
1. Detect directive: "from now on, always validate tokens on the server side"
2. Capture to inbox
3. Respond: "📌 Captured: Always validate tokens server-side."
4. Route "Fix the login bug" as a work request

## Anti-Patterns

- **Capturing one-time instructions** — "Use port 3001 for this test" is contextual, not a standing rule.
- **Capturing questions** — "Should we use Vitest?" is a question, not a decision.
- **Silently capturing** — Always acknowledge with the 📌 emoji so the user knows it was recorded.
- **Overwriting decisions.md directly** — Always write to the inbox. Scribe owns the merge.
- **Capturing agent-to-agent instructions** — Only capture directives from humans (the user).
