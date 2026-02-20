---
name: decision-management
domain: workflow
confidence: 0.9
agents: [scribe]
description: Decision lifecycle management — archive old decisions to keep decisions.md lean
triggers:
  - "scribe session"
  - "archive decisions"
  - "decisions too long"
  - "decisions.md too large"
---

# Decision Lifecycle Management

Scribe owns `decisions.md` health. This skill runs automatically as part of every Scribe session to keep the file lean and readable.

## Why This Matters

Every agent reads `decisions.md` at spawn time. An oversized file (>400 lines) adds thousands of tokens to every agent's context window, causing context overflow failures ("network interrupted → model not available"). Archival is not optional — it is structural maintenance.

## Archival Criteria

Archive a decision block when ALL of the following are true:

1. The decision's date is **older than 30 days** from today
2. The decision is **not** marked `status: permanent`
3. The decision is **not** an active policy with no superseding decision

When in doubt, **keep in the main file**. Archival is a performance optimization, not a purge.

## What Never Gets Archived

- Decisions marked `status: permanent`
- Active security policies with no completion date
- Architectural constraints that all agents must respect on every session
- Decisions flagged `keep: active`

## Archive File Naming

```
.ai-team/decisions/archive/{YYYY-QX}.md
```

Where `QX` is the fiscal quarter of the **decision date**:
- Q1 = January–March
- Q2 = April–June
- Q3 = July–September
- Q4 = October–December

Example: A decision dated 2026-02-15 goes to `decisions/archive/2026-Q1.md`.

## How to Archive

### Step 1 — Read and parse decisions.md

Read `.ai-team/decisions.md`. Parse into decision blocks — each block starts with `### YYYY-MM-DD:` (top-level decision) or a `---` separator marking the end of the previous block.

### Step 2 — Identify archivable blocks

For each top-level decision block (starts with `### YYYY-MM-DD:`):
- Parse the date from the heading
- Check for `status: permanent` anywhere in the block
- Check age: if older than 30 days AND not permanent → candidate for archival

### Step 3 — Write to archive file

For each archivable block:
1. Determine the target archive file: `decisions/archive/{YYYY-QX}.md`
2. If the archive file doesn't exist, create it with this header:
   ```markdown
   # Archived Decisions — {YYYY} Q{X}

   > Archived from `decisions.md` on {archive date}. These decisions are preserved for historical context.
   > See `decisions/archive/README.md` for navigation help.

   ---
   ```
3. Append the full block content to the archive file, preceded by:
   ```
   [Archived: {today's date}]
   ```
4. Append a blank line and `---` separator after the block

### Step 4 — Update decisions.md

After archiving all eligible blocks:

1. Remove the archived blocks from decisions.md
2. Add or update this notice at the top of the file (below the `# Team Decisions` heading):
   ```
   > Historical decisions archived in `decisions/archive/`. Recent 30 days and permanent decisions stay here.
   ```
3. If the file is now empty except the header, add a placeholder:
   ```
   *No recent decisions. See `decisions/archive/` for historical context.*
   ```

### Step 5 — Report

After archival, report:
- How many blocks were archived
- Which archive file(s) they went to
- Line count before and after
- Any blocks kept and why (permanent, recent, in-doubt)

## Condensed Summary Option

When archiving large sections (>200 lines), optionally add a **condensed summary entry** to decisions.md instead of leaving it empty. A condensed summary:
- Is 5–20 lines
- Captures the key decision/policy outcome only (not the full analysis)
- Links to the archive file for full context
- Uses format:
  ```markdown
  ### {date}: {topic} — Summary (archived)
  **Full details:** `decisions/archive/{YYYY-QX}.md`
  **Key outcome:** {1–3 sentences}
  **Status:** {active policy / completed / superseded}
  ```

This preserves policy awareness without bloating context windows.

## Target Size

- **Green:** decisions.md under 400 lines
- **Yellow:** 400–600 lines (schedule archival soon)
- **Red:** over 600 lines (archive immediately on next Scribe session)

## Example Workflow

```
Scribe session triggered.
1. Read decisions.md — 847 lines [RED]
2. Found 3 decision blocks older than 30 days, none marked permanent
3. Archived to decisions/archive/2026-Q1.md (blocks from Feb 2026)
4. Wrote condensed summaries for 2 policy decisions
5. decisions.md now 124 lines [GREEN]
6. Committed .ai-team/ changes
Report: Archived 3 blocks (1,247 lines) → decisions/archive/2026-Q1.md. New line count: 124.
```
