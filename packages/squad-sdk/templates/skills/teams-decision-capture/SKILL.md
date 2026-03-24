---
name: "teams-decision-capture"
description: "Capture durable team decisions from configured Teams channels into generalized decision inbox files"
domain: "prompt-architecture, decision-intelligence, teams-monitoring"
confidence: "low"
source: "manual (Procedures skill design from Flight's workload management proposal)"
tools:
  - name: "workiq-ask_work_iq"
    description: "Ask Microsoft 365 Copilot for a synthesized summary of recent Teams discussion"
    when: "Use first for the configured channel to identify decisions, conventions, repeated questions, workarounds, and policy changes from the last 24 hours"
  - name: "office-mcp-teams_channel"
    description: "Read Teams channel metadata and messages directly"
    when: "Use after the WorkIQ pass when you need precise verification that a decision, workaround, dissent, or convention change actually appeared in the configured channel"
  - name: "office-mcp-search"
    description: "Search related Microsoft 365 documents, emails, or meetings"
    when: "Use when a thread references files, email, or meetings that clarify the rationale, follow-up, or durable pattern before writing the inbox decision file"
---

## Context

`teams-decision-capture` turns ephemeral Teams channel discussion into durable, auditable decision intake for Squad.

Use it when:

- a configured Teams channel likely contains a team decision, policy statement, workflow change, workaround, or repeated question worth preserving
- an operator says `squad decisions capture` or `capture Teams decisions`
- Ralph runs the daily digest cycle and needs a compact queue of merge-ready decision notes for Scribe

This skill does **not** archive chat. It extracts the reusable pattern and writes generalized markdown files to:

```text
.squad/decisions/inbox/
```

Reuse the existing local config pattern from `doc-intelligence`:

- load `.squad/doc-intelligence.local.json`
- reuse the configured `sources.teams[]` entries already maintained for internal monitoring
- do not add a second local config file for this skill
- treat `.squad/skills/doc-intelligence/config.template.json` as the checked-in contract for the Teams source shape

This skill complements `doc-intelligence`.

- `doc-intelligence` detects documentation gaps and follow-up work
- `teams-decision-capture` preserves the generalized decision that created the gap or changed the rule

## Patterns

### 1. Retrieval Loop

1. Load `.squad/doc-intelligence.local.json` and resolve the enabled Teams sources plus routing metadata.
2. Run a **WorkIQ summary pass** for the last 24 hours. Ask specifically for decisions, rationale, dissent, repeated questions, workarounds, policy changes, and convention changes. Ignore social chatter, standup updates, and staffing discussion.
3. Use `office-mcp-teams_channel` only when precise verification is needed — for example, to confirm that a workaround was framed as temporary, that dissent existed, or that a convention change was explicitly agreed.
4. Use `office-mcp-search` when the thread points at a document, email, or meeting that contains the rationale or next step needed to generalize the decision safely.
5. Dedupe overlapping signals so one durable decision produces one inbox file.

### 2. Promotion Heuristic

Promote a signal when it reflects one or more of these:

- **Decision points** — what was decided, why, dissent, and next steps
- **Recurring questions** — the same question asked 2+ times, which makes it a FAQ candidate
- **Workarounds** — temporary fixes that should become a documented pattern or migration note
- **Policy statements** — new team rules, guardrails, or process changes
- **Convention changes** — naming changes, workflow changes, or new tool adoption

Do **not** promote:

- raw transcripts or message-by-message summaries
- social chatter or standup updates
- one-off individual preferences with no team impact
- private staffing or personnel discussion

### 3. Confidentiality Filter

Apply the same confidentiality test used by `doc-intelligence`.

- Never quote internal chat verbatim.
- Replace names and raw message text with a generalized summary of the pattern.
- If the evidence cannot be described without exposing private conversation, do not emit a decision file.
- Source references should identify the channel and time window in generalized terms, not raw transcript content.

### 4. Output Contract

Each captured decision becomes a file at:

```text
.squad/decisions/inbox/{source}-{brief-slug}.md
```

Use this structure for every emitted file:

```markdown
# Decision Intake — {short title}

**Captured from:** {generalized Teams source}
**Date:** {YYYY-MM-DD}
**Review route:** Procedures | PAO | Flight

## Decision point
{what was decided}

## Rationale
{why the team chose it}

## Dissent
{material disagreement, trade-off, or "None noted"}

## Next steps
- {action item}
- {action item}

## Source reference
Generalized summary of the channel and time window. Do not include raw quotes, raw message links, or private transcript text.
```

### 5. Routing Pattern

Default review ownership is split by durable impact:

- **Procedures** — prompt contracts, charters, coordinator logic, skills, respawn prompts, and other agent-behavior rules
- **PAO** — messaging, FAQ follow-up, contributor-facing wording, and process explanations that should become docs or guidance
- **Flight** — architecture decisions, repo-boundary changes, or system-shape consequences that need architectural review

If a captured decision creates a documentation gap, hand the follow-up documentation work to `doc-intelligence` rather than duplicating that analysis here.

### 6. Ralph Integration

Ralph can run this skill as part of the daily digest cycle:

1. Load `.squad/doc-intelligence.local.json`
2. Scan configured Teams sources for the last 24 hours
3. Apply the retrieval loop and confidentiality filter
4. Write only high-signal inbox files
5. Stay quiet when no durable decisions were found

## Examples

### Example 1: Prompt contract change

A Teams discussion settles a new handoff rule for agent review routing.

**Result:**
- Write `.squad/decisions/inbox/{source}-agent-review-routing.md`
- Summarize the new rule, rationale, any dissent, and next steps without quoting the chat
- Route review to **Procedures** because it changes prompt contracts

### Example 2: Repeated onboarding question

Two people ask the same channel how a naming convention should be applied, and the team converges on one answer.

**Result:**
- Write `.squad/decisions/inbox/{source}-naming-convention.md`
- Capture the convention as a team decision and flag it as a FAQ candidate
- Route follow-up wording/docs to **PAO** and let `doc-intelligence` handle the doc-gap suggestion

### Example 3: Temporary workaround with architecture impact

A channel agrees on a stopgap workflow while a broader platform change is still under review.

**Result:**
- Write `.squad/decisions/inbox/{source}-temporary-workaround.md`
- Record the workaround as temporary, note the trade-off, and list the trigger for revisiting it
- Route review to **Flight** if the workaround changes architecture expectations

## Anti-Patterns

- ❌ Creating a new local config file instead of reusing `.squad/doc-intelligence.local.json`
- ❌ Leading with raw Office message reads before a WorkIQ summary pass when a high-level signal check would do
- ❌ Copying internal chat text verbatim into inbox files, PRs, or decision logs
- ❌ Treating every recent thread as a decision worth preserving
- ❌ Logging standups, social chatter, or staffing discussion as durable team decisions
- ❌ Mixing documentation-gap analysis into this skill instead of handing that follow-up to `doc-intelligence`
- ❌ Forgetting to capture dissent or next steps when they materially affect the decision
