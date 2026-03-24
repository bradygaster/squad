---
name: "tiered-history"
description: "Split agent history.md into hot (always-loaded) and cold (on-demand) layers to reduce context window usage by 50-75% at spawn time. Use when agent history files grow large or agent startup feels slow."
domain: "performance"
confidence: "high"
source: "earned"
---

## Context

Agent `history.md` files grow unbounded as squads accumulate work. In a mature deployment, agents commonly reach 40–70KB of history — consuming 10,000–18,000 tokens at every spawn. This wastes context window budget on stale work reports that are rarely needed.

The tiered-history skill formalizes a **hot/cold split** pattern:

- **Hot layer** (`history.md`): Recent, high-signal entries. Always loaded at spawn. Target: ≤12KB.
- **Cold layer** (`history-worklog.md`): Older work reports and session notes. Loaded on-demand when the task references past work.

This pattern was field-tested across 16 agents over 200+ squad orchestration rounds. Measured token savings: ~50–75% for agents with large history files.

## Hot/Cold Pattern

### Hot Layer (always loaded at spawn)

Contains:
- `## Core Context` section — agent role, key constraints, standing decisions
- `## Learnings` entries tagged with currently-open issue numbers
- All entries from the current quarter that are less than 30 days old
- A `## See Also` pointer: `"Full history in history-worklog.md"`

### Cold Layer (`history-worklog.md`)

Contains:
- Unstructured work reports (session notes, "closed issue #NNN" entries)
- `## Learnings` entries older than 30 days with no open-issue tags
- Archived quarterly content

### When to Read Cold

Agents should read `history-worklog.md` only when:
- Assigned an issue that references archived work
- Encountering a pattern they cannot resolve from hot context
- Another agent's decision explicitly cross-references past work

## Agent Spawn Instruction

Add this to each agent's charter (e.g., `.squad/agents/AGENT.md`):

```markdown
## History Reading Protocol

Read `history.md` at spawn (hot layer — always). Read `history-worklog.md` only when your
task references past work, a pattern is unfamiliar, or another agent's decision points to
archived context.
```

## Scribe Maintenance Rules

Add this to `scribe-charter.md` under an `## Archival Duty` section:

```markdown
## Archival Duty

**Trigger:** When an agent's `history.md` exceeds 15KB or 20 entries.

**Procedure:**
1. Identify the oldest unstructured work reports (session notes, issue-closed entries).
2. Move them to `history-worklog.md` (create if it doesn't exist).
3. Keep `## Core Context` and `## Learnings` entries tagged with open issues in the hot file.
4. Add a `## See Also` line at the top of `history.md`:
   `> Full worklog in history-worklog.md`
5. Agents <10KB: exempt — no split needed.
```

## Tagging Entries for Relevance Retrieval

The key insight is **issue-number tagging** rather than "last N entries." When Scribe writes Learnings entries, include the issue number:

```markdown
### Issue #NNN — what was learned
- Finding from the work
- Pattern to reuse
```

This enables relevance-based cold retrieval: agents working on issue #NNN automatically know to check the cold layer for that issue, rather than loading everything.

## `routing.md` Addition

Add a `## Context Loading Conventions` section to `.squad/routing.md`:

```markdown
## Context Loading Conventions

| Layer | File | When to Read |
|-------|------|-------------|
| Hot | `history.md` | Always — at spawn |
| Cold | `history-worklog.md` | Only when task references past work |
| Season | `history-YYYY-QN.md` | Only for cross-quarter deep dives |

Agents default to hot only. Cold and season are pull-on-demand.
```

## Addressing Known Risks

### Entry format inconsistency
Not all agents use the same history structure. Use issue-number tags (not positional "last N") — they work regardless of whether history is date-based, issue-based, or chronological. Any entry with `### Issue #NNN` is retrievable.

### Unknown unknowns
The `## See Also` pointer ensures agents know cold context exists. Without it, agents may not realize relevant history exists in the worklog.

### Redundancy with quarterly rotation
This is **not** a second archival layer. It's an intra-quarter optimization. Quarterly rotation (`history-YYYY-QN.md`) continues unchanged. The worklog is the overflow within the current quarter, not an alternative archive.

## Anti-Patterns

- ❌ Moving `## Core Context` to cold — this section should always be hot
- ❌ Splitting files for agents <10KB — not worth the maintenance overhead
- ❌ Creating more than two layers — hot + cold is the maximum useful distinction
- ❌ Omitting the `## See Also` pointer — agents won't know cold context exists
- ❌ Moving Learnings entries tagged to open issues to cold — they're still active

## Example Split

Before (history.md — 45KB):

```
## Core Context
[role definition, 3KB]

## Learnings
### Issue #123 — rate limiting pattern
[relevant, open issue]

### Issue #89 — deployment fix (closed Q1)
[stale, 2KB work report]

[...40 more similar entries...]
```

After split:

**history.md (12KB — hot):**
```
> Full worklog in history-worklog.md

## Core Context
[role definition, 3KB]

## Learnings
### Issue #123 — rate limiting pattern
[kept — open issue]
```

**history-worklog.md (33KB — cold):**
```
### Issue #89 — deployment fix (closed Q1)
[moved here]
[...40 older entries...]
```
