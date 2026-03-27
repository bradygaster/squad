# Decision archival

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad's shared decision log (`decisions.md`) grows with every session. Left unchecked, it consumes agent context windows and slows down every interaction. Decision archival keeps the log lean by moving stale entries to an archive file — automatically, before every Scribe merge.

---

## The problem

Every agent reads `decisions.md` at the start of every session. As the file grows, agents spend more context budget on old sprint artifacts, completed analysis docs, and one-time planning fragments instead of current, actionable decisions.

Without intervention, `decisions.md` can exceed 50 KB in active projects — that's roughly 12,500 tokens of context consumed before an agent even starts working.

---

## How HARD GATE archival works

The Scribe agent enforces a **HARD GATE** on `decisions.md` size. "Hard gate" means this step is mandatory — it runs before every inbox merge and cannot be skipped or deferred.

The workflow order is:

1. **PRE-CHECK** — Measure `decisions.md` size and count inbox files
2. **ARCHIVE (HARD GATE)** — Run two-tier archival if thresholds are exceeded
3. **INBOX MERGE** — Merge new decisions from the inbox into `decisions.md`

By archiving *before* merging, the file never grows unbounded — even when multiple agents write decisions in the same session.

---

## Two-tier thresholds

Archival uses two tiers that escalate based on file size:

| Tier | Trigger | Action | Effect |
|------|---------|--------|--------|
| **Tier 1 (30-day)** | `decisions.md` ≥ 20 KB | Archive entries older than 30 days | Removes stale decisions while keeping recent context |
| **Tier 2 (7-day)** | `decisions.md` ≥ 50 KB after Tier 1 | Archive entries older than 7 days | Aggressive cleanup for runaway growth |

Both tiers run in sequence. If Tier 1 brings the file under 50 KB, Tier 2 is skipped.

### Count-based fallback

When no entries exceed the age limit but the file still exceeds the 20 KB threshold, the archival engine falls back to **count-based archival** — it removes the oldest dated entries until the remaining content fits within the size budget. Undated entries (typically foundational directives) are always preserved.

---

## Heading-aware archival

Decision entries in `decisions.md` use the format:

```markdown
### YYYY-MM-DD: Topic
**By:** Agent Name
**What:** Description of the decision
**Why:** Rationale
```

The archival engine parses `###` headings to identify entry boundaries. Each entry is treated as an atomic unit — archival never splits an entry mid-content. Entries without a parseable date in the heading are treated as undated and always kept.

### Invariant

The archival process guarantees:

```
entries_before = entries_kept + entries_archived
```

No decision data is ever silently dropped. Every archived entry is appended to `.squad/decisions-archive.md`.

---

## Where archived decisions go

Archived entries move to `.squad/decisions-archive.md`. This file is preserved for reference but is **not loaded into agent context**. Agents read only the lean, current `decisions.md`.

```
.squad/
├── decisions.md              # Active decisions (agents read this)
├── decisions-archive.md      # Archived decisions (reference only)
└── decisions/
    └── inbox/                # New decisions waiting to be merged
```

---

## The `archiveDecisions()` contract

The SDK exposes `archiveDecisions()` in the nap module (`packages/squad-cli/src/cli/core/nap.ts`). Key behaviors:

| Behavior | Detail |
|----------|--------|
| **Threshold** | File must exceed 20 KB (`DECISION_THRESHOLD`) before any archival runs |
| **Age-based first** | Entries older than 30 days (`DECISION_MAX_AGE_DAYS`) are archived first |
| **Count-based fallback** | If no entries are old enough, the oldest dated entries are removed to fit the budget |
| **Undated entries preserved** | Entries without `YYYY-MM-DD` in the heading are never archived |
| **Dry run support** | Pass `dryRun: true` to calculate actions without writing to disk |
| **Return value** | Returns `null` if no archival is needed; otherwise returns a `NapAction` with bytes saved |
| **Atomic writes** | Archive content is appended to `decisions-archive.md`, then `decisions.md` is rewritten — no data loss invariant |

---

## Health reports

After archival runs, the Scribe emits a **HEALTH REPORT** to the session log (`.squad/log/`). The report includes:

- `decisions.md` size before and after archival
- Number of inbox files processed
- Number of history files summarized

This gives you visibility into how the team's shared memory is managed across sessions.

---

## Practical example

Here's what happens as `decisions.md` grows over the life of a project:

| Project stage | File size | What happens |
|---------------|-----------|--------------|
| Early development | 5 KB | No archival — file is under threshold |
| Active sprint | 22 KB | **Tier 1** fires: entries older than 30 days move to archive |
| Heavy decision period | 55 KB after Tier 1 | **Tier 2** fires: entries older than 7 days move to archive |
| All entries are recent | 25 KB, nothing older than 30 days | **Count-based fallback**: oldest dated entries archived until file fits under 20 KB |
| Only foundational directives | 18 KB of undated entries | No archival — undated entries are always preserved |

---

## Related pages

- [Memory system](/features/memory) — How Squad's three memory layers work
- [Context hygiene](/features/context-hygiene) — User-facing commands for managing context growth (`squad nap`, `squad reskill`)
- [Memory & Knowledge](/concepts/memory-and-knowledge) — Conceptual overview of how memory compounds over time
