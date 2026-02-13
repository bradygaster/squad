# Proposal 023: Incoming Queue — Coordinator as Message Processor

**Author:** Verbal (Prompt Engineer)  
**Date:** 2026-02-09  
**Revised:** 2026-02-09  
**Status:** Revised Draft — Deferred to Horizon  
**Requested by:** bradygaster  
**Triggered by:** Brady — *"copilot itSELF has built-in 'todo list' capability, right? if so, maybe we just delegate to copilot to work in each prompt we send in whilst the team is working."*  
**Incorporates:** Kujan's platform assessment (`decisions/inbox/kujan-incoming-queue-assessment.md`), Brady's architecture direction (`decisions/inbox/copilot-directive-20260208T1933.md`)

---

## The Problem

The coordinator parses every message, routes it to agents, then blocks on `read_agent`. Anything it didn't route gets lost. A message like *"Let's use Tailwind. Fenster, refactor auth, and we should add rate limiting at some point"* contains a directive, a work request, and a backlog item — but only the work request gets routed. The other two vanish.

### Platform constraints (per Kujan's assessment)

| Constraint | Implication |
|-----------|-------------|
| SQL `todos` table is **session-scoped** — dies on terminal close | SQL alone can't store the backlog |
| Coordinator **blocks on `read_agent`** — can't process new input | No background message listener; extraction must happen before spawn |
| Spawned agents **can't query coordinator's SQL** | SQL is coordinator-only working memory |
| **Filesystem is the only durable, cross-session, agent-readable state** | Filesystem must be source of truth |
| Coordinator CAN do work in the **same turn** as spawning | Extraction adds zero turns — it broadens the existing parse |

The coordinator has full tool access (files, SQL, reads, classification) before agents start. We're using it as a telephone switchboard.

---

## The Idea

**Turn the coordinator into an incoming queue processor.** Before spawning agents, the coordinator extracts ALL actionable items from every message — work requests, directives, backlog items, questions, context clues — and captures each to the right store. Nothing gets lost.

### The Flow

```
User sends message
    │
    ▼
┌─────────────────────────────────────────┐
│  1. EXTRACT — Parse message into items  │
│     • Work requests (spawn-worthy)      │
│     • Directives (team memory)          │
│     • Backlog items (future work)       │
│     • Questions (may be instant-answer) │
│     • Context clues (implicit prefs)    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  2. CAPTURE — Write to stores           │
│     • SQL INSERT (immediate, queryable) │
│     • Filesystem flush (durable record) │
│     • Directives → decisions/inbox/     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  3. ACKNOWLEDGE — Show the user         │
│     what was captured + what's launching │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  4. SPAWN — Route work requests to      │
│     agents, including clones if needed  │
└─────────────────────────────────────────┘
```

### What changes vs. today

| Today | With incoming queue |
|-------|-------------------|
| Directive capture is a special case | Extraction is the default path for every message |
| One route per message | Multiple items extracted, each routed appropriately |
| "Add rate limiting" gets lost | Captured to backlog — persists across sessions |
| No structured backlog | Team has a queryable, persistent work list |
| One agent instance per identity | Same agent can run as multiple clones in worktrees |

---

## Architecture: SQL Hot Layer + Filesystem Durable Store

Brady's direction: *"could sql be used as a first layer and then it be written to disk as permanent record?"*

This eliminates the "multiple sources of truth" problem. **Filesystem always wins. SQL is a queryable cache.**

### Write path (every extraction)

```
1. SQL INSERT into `todos` table   ← immediate, queryable
2. Append to `.ai-team/backlog.md` ← permanent, git-tracked, agent-readable
```

Both writes happen in the same coordinator turn. SQL gives the coordinator structured queries (`SELECT * FROM todos WHERE status = 'pending'`). Filesystem gives durability, cross-session persistence, and agent visibility.

### Read path (session start — rehydration)

```
On first message of a new session:
1. Read `.ai-team/backlog.md` from disk
2. Parse items into SQL `todos` table
3. Coordinator now has fast queryable state for the session
```

If the user closes the terminal and reopens it, the SQL is empty but the filesystem has everything. Rehydration rebuilds the working set. **Session restart is a cache miss, not data loss.**

### Why this works

| Concern | Resolution |
|---------|-----------|
| SQL dies on terminal close | Filesystem has the durable copy |
| Filesystem is slow to query | SQL provides structured queries within a session |
| Two sources of truth | Filesystem ALWAYS wins — SQL is rebuilt from it |
| Agents can't read SQL | Agents read `backlog.md` at spawn time |
| Complex querying (dependencies, status) | SQL `todos` + `todo_deps` tables handle this |

---

## Design: Extraction — What Gets Parsed

The coordinator already does implicit classification (routing). Extraction makes it explicit and broader.

### Item taxonomy

| Type | Signal | Action | Example |
|------|--------|--------|---------|
| **Work request** | Imperative verbs, agent names | Spawn agent | "Fenster, refactor auth" |
| **Directive** | "Always/never/from now on" | Write to decisions/inbox | "We always use Tailwind" |
| **Backlog item** | Future tense, "at some point/eventually" | SQL INSERT + append backlog.md | "We should add rate limiting" |
| **Question** | Interrogative | Answer directly or spawn | "How does auth work?" |
| **Context clue** | Implicit preferences | Note in spawn context | "Keep it simple" |

### Multi-item extraction example

User: *"We're going with PostgreSQL. Fenster, set up the connection module. Hockney, we'll need migration tests. At some point we should add connection pooling."*

Coordinator extracts 4 items, captures each, acknowledges:

```
📌 Captured: PostgreSQL as database.
🔧 Fenster — setting up database connection module
🧪 Hockney — writing migration tests
📥 Backlog: "Add connection pooling" — saved for later.
```

Nothing lost. One message, four actionable items captured.

---

## Design: Team Backlog — The Killer Feature

Brady: *"my favorite part of the proposal is the team backlog. that's amazeballs."*

The backlog isn't a TODO list. It's the team's **persistent intent queue** — what the user wants, captured automatically, queryable instantly, durable forever.

### What makes it different from a TODO list

- **Auto-populated.** Items extracted from natural conversation, not manually entered.
- **Dual-layer storage.** SQL for fast queries within a session, filesystem for permanence across sessions.
- **Agent-readable.** Spawned agents see `backlog.md` in their INPUT ARTIFACTS when relevant.
- **Explicit adds work too.** "Add to backlog: investigate caching" → captured directly.
- **Third memory channel.** Decisions = what the team agreed. History = what agents learned. Backlog = what the user intends. Three channels > two.

### Backlog file format (`.ai-team/backlog.md`)

```markdown
# Team Backlog

## Open
- [ ] Add connection pooling (captured 2026-02-09, from Brady)
- [ ] Investigate WebSocket support (captured 2026-02-09, from Brady)

## Done
- [x] Refactor auth module (completed 2026-02-09, by Fenster)
```

### How agents interact with the backlog

1. **Coordinator writes** during extraction — SQL INSERT + filesystem append in the same turn.
2. **Agents read** `backlog.md` at spawn time when relevant.
3. **Agents mark items done** via `backlog/inbox/{agent}-done-{slug}.md` (drop-box pattern). Scribe reconciles.
4. **Agents add items** they discover during work: "Session store needs an index. Added to backlog."
5. **Coordinator surfaces** open items proactively every 3-5 messages: *"📥 3 open backlog items. Tackle 'connection pooling' next?"*

### Lifecycle

```
Captured → Open → [Assigned → In Progress → Done | Deferred]
```

Items start `Captured` (extracted from conversation). The coordinator auto-promotes clear items to `Open`. Ambiguous ones stay `Captured` for user confirmation.

### Proactive surfacing — the compound payoff

The coordinator checks the backlog after agent work completes. If a backlog item is now actionable (e.g., "connection pooling" is relevant because Fenster just finished the database module), it surfaces a suggestion — not an auto-spawn. This is the "feeling heard" behavior: the team remembers what you mentioned three sessions ago.

---

## Design: Agent Cloning — Multiple Instances, Same Identity

Brady: *"we already have worktree support. what's to stop us from spawning multiple copies of squad members?"*

Answer: nothing. **This is already possible with the current architecture.** We just don't do it yet.

### How it works

The coordinator spawns the same agent identity multiple times via `task`, each with a different assignment and worktree. Each clone reads the same `charter.md` and `history.md` (consistent identity), works in a separate worktree (no git conflicts), writes to separate inbox files (drop-box handles this), and runs in its own context window (isolated by the `task` tool).

### What changes in the coordinator

The current coordinator prompt says "1-2 agents per question." To enable cloning:

1. **Relax the spawn limit** when the backlog has parallelizable items for the same agent.
2. **Identity labeling** is optional — the drop-box pattern already disambiguates by file slug. The coordinator just spawns multiple background tasks for the same agent.
3. **Worktree assignment** — the coordinator tells each clone which branch or directory to work in, preventing file conflicts.

### Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Two clones edit the same file | Coordinator assigns non-overlapping file scopes per clone |
| History.md gets conflicting appends | Drop-box pattern — each clone writes to `history/inbox/` |
| Context budget — more spawns = more tokens | Clone only when backlog items are clearly parallelizable |
| User confusion ("which Fenster?") | Scribe's merge output attributes work by task, not by clone |

### What this unlocks

With cloning + backlog, the coordinator can drain multiple backlog items in a single turn. User sends one message, coordinator spawns Fenster×3 across worktrees, each tackling a different backlog item. The team scales horizontally.

---

## Interaction with Existing Patterns

**Directive Capture** becomes a special case of extraction — not a separate system. Directives are one item type the extractor identifies. The capture-to-inbox flow stays identical. No breaking change.

**Drop-Box Pattern** extends to the backlog. Coordinator writes `backlog.md` directly (safe — sole writer during extraction). Agents write to `backlog/inbox/` for additions or completions. Scribe merges. Same proven pattern.

**Feels-Heard Acknowledgment** gets richer. Extraction gives the coordinator more to confirm: captured directives, spawned agents, AND backlog items saved — all in the same acknowledgment block.

**Progressive Trust (Proposal 007)** pairs well. At high trust tiers, the coordinator handles backlog items directly — marking items done, re-prioritizing, answering "what's next?" without spawning.

---

## Risks

1. **Coordinator doing domain work.** Extraction creeps into evaluation (priority judgments, architectural opinions). *Mitigation:* Hard rule — coordinator EXTRACTS and CAPTURES, never EVALUATES.

2. **Added latency.** Extraction adds reasoning before spawning. *Mitigation:* Same LLM turn as routing — broadening the existing parse, not adding a step.

3. **Over-extraction.** Every sentence becomes a backlog item. *Mitigation:* Only actionable, project-relevant items. The taxonomy table provides clear signals. When in doubt, don't capture.

4. **Backlog noise.** Items accumulate that nobody acts on. *Mitigation:* Progressive summarization (same as history.md). Items without activity after N sessions get archived.

5. **SQL/filesystem sync drift.** SQL state diverges from filesystem. *Mitigation:* Filesystem always wins. SQL is rebuilt from filesystem on session start. Within a session, writes go to both atomically.

6. **Clone file conflicts.** Two Fenster clones edit the same file. *Mitigation:* Coordinator assigns non-overlapping file scopes. Worktree isolation prevents git conflicts.

7. **Scope creep into project management.** *Mitigation:* The backlog is a memory aid, not Jira. No priorities, estimates, or assignments unless explicitly added.

---

## What This Unlocks

1. **Nothing gets lost.** Every actionable mention persists — directives to decisions, work to agents, future intent to the backlog.

2. **Multi-item messages work naturally.** Users mix directives, requests, and musings in one paragraph. Extraction meets users where they are.

3. **Backlog enables proactive work.** "User mentioned connection pooling three sessions ago. Fenster just finished the database module." The coordinator connects dots across sessions.

4. **Horizontal scaling via clones.** The coordinator drains multiple backlog items in parallel — same agent, multiple worktrees, concurrent execution. Team throughput scales with the backlog.

5. **Session restart is painless.** Close the terminal, reopen it, and the backlog is still there. SQL rehydrates from the filesystem. No lost state, no manual re-entry.

6. **Three memory channels compound.** Decisions (agreements) + history (learnings) + backlog (intent). Intent is the most human channel — aspirational, not settled. It's what makes the team feel like it's thinking ahead.

---

## Implementation Sketch

### Phase 1: Extraction + dual-layer writes

Broaden "Directive Capture" in `squad.agent.md` to "Message Extraction." Add backlog capture + SQL INSERT to the flow. Create `backlog.md` on first capture. Add rehydration logic to coordinator session start.

**Estimated change:** ~40 lines in squad.agent.md. New file `.ai-team/backlog.md`.

### Phase 2: Backlog integration + Scribe merge

Define `backlog.md` format. Add `backlog/inbox/` drop-box. Update Scribe's charter to merge backlog inbox. Add backlog to agent INPUT ARTIFACTS for relevant spawns.

**Estimated change:** ~10 lines in Scribe spawn template. New directory `.ai-team/backlog/inbox/`.

### Phase 3: Agent cloning

Relax coordinator spawn limits for parallelizable backlog items. Add worktree assignment to spawn prompts. Test with Fenster×2 on non-overlapping tasks.

**Estimated change:** ~15 lines in routing/fan-out section of squad.agent.md.

### Phase 4: Proactive surfacing

After processing agent results, coordinator checks backlog for newly-actionable items. Surfaces 1-2 suggestions (not auto-spawns). Pairs with progressive trust tiers.

**Estimated change:** ~10 lines in "After Agent Work" section.

---

## Alternatives Considered

### A. SQL-only queue (rejected → evolved into hot layer)
Original rejection was correct — session-scoped storage can't be the backlog. But Brady's insight turns SQL into the fast-query layer with filesystem backing. SQL went from "rejected" to "cache tier." Good call.

### B. Filesystem-only (original recommendation → evolved)
The v1 proposal recommended filesystem-only with "a door open to hybrid." Brady kicked the door open. The hybrid approach (SQL hot + filesystem durable) is strictly better — same durability, faster queries, no new infrastructure.

### C. Separate "intake agent" (rejected)
Spawning a dedicated agent for extraction adds latency and complexity. The coordinator already parses every message. Broadening that parse is zero marginal cost.

### D. GitHub Issues integration (deferred)
Writing backlog items as GitHub Issues is appealing but adds external dependency. Worth exploring as an export target. The filesystem backlog can sync to Issues; the reverse is harder.

---

## Success Criteria

1. **No information loss.** A message with 3 distinct items results in 3 captures.
2. **No added latency.** Extraction in the same coordinator turn as routing.
3. **Backlog persists.** Items from session N are visible in session N+5.
4. **Rehydration works.** New session reads `backlog.md`, rebuilds SQL state.
5. **Cloning works.** Same agent spawned twice on non-overlapping tasks produces no conflicts.
6. **Proactive surfacing.** Coordinator occasionally reminds user of open backlog items.
7. **No scope creep.** Backlog stays a flat list, not a project management system.

---

## Review Requested

- **Keaton:** Architecture review — does the dual-layer (SQL + filesystem) hold up? Clone worktree isolation?
- **Kujan:** Platform review — rehydration on session start, SQL INSERT + file write in same turn, any gotchas?
- **Brady:** Does this match the vision? Is the team backlog + cloning the "feeling heard" you're after?
