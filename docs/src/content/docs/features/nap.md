# Nap — Context Hygiene

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to compress your .squad/ directory:**
```
Squad, run nap to clean up the context
```

**Try this to preview what would be cleaned:**
```
Squad nap --dry-run
```

Context hygiene — the `squad nap` command reduces `.squad/` directory size for LLM context windows by compressing histories, pruning logs, archiving decisions, and merging inboxes.

---

## Overview

Squad team state grows as you work: histories accumulate sections, logs fill up, decisions pile into inboxes. Over time, your `.squad/` directory can bloat to sizes that consume significant LLM context — context you'd rather use for reasoning about your code.

`squad nap` performs four cleanup actions to keep your team lean and efficient:

1. **History compression** — Shrinks histories that exceed 15 KB
2. **Log pruning** — Deletes logs older than 7 days
3. **Inbox cleanup** — Merges inbox decisions into the main file
4. **Decision archival** — Moves old decisions to an archive when the main file is too large

All actions are safe and reversible (archives are kept as `.md` files).

## Usage

```bash
squad nap [--deep] [--dry-run]
```

## Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview what would be cleaned without modifying files |
| `--deep` | Aggressive compression — keeps 3 recent history entries instead of 5 |

### Examples

Preview what `nap` would do:

```bash
squad nap --dry-run
```

Run standard cleanup:

```bash
squad nap
```

Run aggressive deep cleanup:

```bash
squad nap --deep
```

## Four Cleanup Actions

### 1. History compression

Files exceeding 15 KB trigger compression:

- **Preserves** — Always keeps the `## Core Context` section
- **Normal mode** — Keeps the last 5 sections, archives older ones to `history-archive.md`
- **Deep mode** — Keeps the last 3 sections, archives older ones

Example: An agent history of 45 KB with 12 sections:
- Compresses to ~8 KB (5 sections) → moved 7 older sections to `history-archive.md`
- Core Context stays intact

### 2. Log pruning

Deletes files older than 7 days from:

- `.squad/log/`
- `.squad/orchestration-log/`

Example: If your logs have entries from the last 30 days, `nap` removes anything older than 7 days.

### 3. Inbox cleanup

Merges all `.squad/decisions/inbox/*.md` files into `decisions.md`:

- Reads each inbox file
- Appends content to `decisions.md`
- Deletes the inbox file
- Result: One unified decisions file, no scattered inboxes

### 4. Decision archival

When `decisions.md` exceeds 20 KB:

- Finds entries older than 30 days
- Moves them to `decisions-archive.md`
- Keeps recent decisions in the main file for fast access

## Output

`squad nap` reports before/after sizes and actions taken:

```
🧘 Nap complete
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Context reduction:
   .squad/ shrunk from 412 KB → 156 KB (62% reduction)
   Est. token savings: ~640 tokens

✅ Actions completed:
   [COMPRESS] agents/alice/history.md (45 KB → 12 KB)
   [PRUNE] log/ (deleted 8 files, 47 KB)
   [MERGE] decisions/inbox/ (3 files merged)
   [ARCHIVE] decisions.md (moved 5 entries > 30d old)
```

Each action is tagged: `[COMPRESS]`, `[PRUNE]`, `[ARCHIVE]`, `[MERGE]`.

## Safety

`squad nap` creates a `.nap-journal` file to detect interrupted runs:

- If a previous `nap` was interrupted, the next run detects it
- Warns you and continues anyway (resumes cleanup)
- `.nap-journal` is deleted when `nap` completes successfully

This prevents partial states from accumulating if a cleanup is interrupted mid-way.

## Normal vs. Deep Mode

| Aspect | Normal | Deep |
|--------|--------|------|
| **History threshold** | Keep 5 sections | Keep 3 sections |
| **Archive trigger** | 15 KB | 15 KB |
| **Log age cutoff** | 7 days | 7 days |
| **Use case** | Regular maintenance | Before export or when context is tight |

**Recommendation:** Start with `squad nap --dry-run` to see what would be cleaned, then decide if you want `--deep`.

## When to Run

- When your LLM context window feels bloated
- Before exporting a team with `squad export`
- As regular maintenance (monthly or quarterly)
- Before a long session where you need max context for reasoning

## Examples

Dry-run to preview:

```bash
squad nap --dry-run
```

Standard cleanup:

```bash
squad nap
```

Aggressive cleanup before export:

```bash
squad nap --deep && squad export
```

## Sample Prompts

```
run nap to clean up the .squad directory
```

Executes standard cleanup and reports what was removed.

```
squad nap --dry-run
```

Shows what would be cleaned without making changes.

```
what's the size of .squad after cleanup?
```

Runs `nap --dry-run` and reports the projected savings.

```
aggressive cleanup — I need max context for this session
```

Runs `squad nap --deep` for maximum compression.
