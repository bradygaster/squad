# Session: 2026-02-20 — v0.4.2 Release & Memory Architecture Team Discussion

**Requested by:** Brady  
**Date:** 2026-02-20  
**Participants:** Keaton (Lead), Verbal (Prompt Engineer), Fenster (Core Dev), Coordinator (direct)

---

## Summary

Two parallel workstreams: (1) v0.4.2 release preparation, closing issues #93 and #94; (2) team architectural review of external memory architecture proposal.

---

## Workstream 1: v0.4.2 Release Preparation

### Coordinator Actions

- **Issue #93 (closed):** CLI vs VS Code command parity. Updated 6 documentation files to explicitly note `/agent` (CLI) vs `/agents` (VS Code).
  - Files: tour-first-session.md, scenarios/{existing-repo, mid-project, new-project, private-repos, troubleshooting}.md
  - Rationale: Issue reported confusion at critical first moment. Platform-aware language removes friction.

- **Issue #94 (closed):** Insider program cleanup. Synced insider branch from dev, removed forbidden content.

- **Version bump:** 0.4.2 in package.json
- **CHANGELOG updated:** Release notes for 0.4.2
- **Branches pushed:** main and insider

### Release Context

v0.4.2 completes documentation polish for #93. Insider branch now clean per #94. Ready for external deployment.

---

## Workstream 2: Memory Architecture Team Discussion

Brady attended a presentation on agent memory architecture (identity/memory/social layers with RAG hooks) and requested the team's analysis: What's worth adopting? What conflicts with Squad's existing design?

### Keaton (Lead) — Architectural Review

**Files:** `.ai-team/decisions/inbox/keaton-memory-architecture-review.md`

**Finding:** ~40% overlap with existing Squad, ~30% extension, ~30% genuinely new.

**Overlap:**
- identity/me.md = charter.md (already frozen, agent-immutable)
- episodic memory = orchestration-log (exists but dead — zero entries despite 20+ spawns)
- hooks = coordinator's spawn template (already manual pre/post hooks)

**Genuinely New:**
1. Social modeling (per-person interaction logs + strategic masks) — speculative, privacy questions
2. Explicit reflection loops (wisdom extraction) — not just "what happened" but "what pattern?"
3. RAG-based retrieval — assumes embedding API + vector store not available today

**Recommendation:** Cherry-pick, don't wholesale rewrite.

- **v0.5.0 (current):** Stay mechanical. Rename + consolidation only. Don't fold in memory restructure.
- **v0.6.0:** Cherry-pick wisdom.md (split history.md into events + patterns) + now.md (current state file). Low-risk, high-value.
- **v0.7.0+:** Evaluate social modeling + episodic memory + RAG with data, not theory. Needs privacy model + platform capabilities.
- **Never (unless rethought):** Formal pre/post hooks (coordinator already IS the hook system).

**Concerns Raised:**
1. Context window pressure — proposal adds 3K-8K tokens, but decisions.md is already 300KB (~75K tokens). Real blocker isn't new files, it's decisions.md unbounded growth.
2. Complexity budget — Squad's strength is simplicity (filesystem, zero npm deps). Proposal trades simplicity for structure. YAML parsing + JSONL + RAG = new maintenance surface.
3. Backward compatibility — two migrations in close succession (v0.5.0 rename + v0.6.0 restructure) is user friction. Stagger it.
4. Personality drift concern is real, but proposed me.md/wisdom.md stack over-engineers the fix. History.md bloat drowning charter signal is a compaction problem, not an architecture problem.
5. Social modeling (knowing per-person preferences, masks, strategic intent) raises privacy questions even on local filesystem. Needs opt-in and explicit Brady approval.
6. RAG platform dependency — Copilot platform doesn't expose embedding APIs today. Building RAG ourselves requires vector store dependency (massive shift from "prompts + filesystem"). This is a "when platform catches up" feature, not a "build it ourselves" feature.

**Verdict:** Directionally aligned (agents should evolve based on experience, not prompt accumulation) but implementation path matters. Filesystem memory + zero dependencies is Squad's advantage.

### Verbal (Prompt Engineer) — Prompt Architecture Analysis

**Files:** `.ai-team/decisions/inbox/verbal-memory-architecture-review.md`

**Finding:** Two genuinely good ideas buried under architecture astronautics.

**Good Ideas:**
1. **Wisdom/Episode split** — History.md mixes timeless wisdom ("Brady prefers X") with episodic events ("2026-02-09: Fixed bug"). Splitting lets us always load wisdom (small, high-value) and selectively load episodes (recent/task-relevant). This is legitimate context bloat fix.

2. **Active state file (inspired by now.md)** — Today agents have no working memory between sessions. They re-derive context from history.md every time. A lightweight state.md or focus.md per agent eliminates cold-start problem.

**Bad Ideas (explicitly rejected):**
1. **Hook formalization** — Proposal assumes pre/post hooks as formal system. Our spawn template is already dense (charter ~200-400 tokens, history ~12KB, decisions ~15KB, skills). "Pre-hooks" are just more text. "Post-hooks" are just instructions agents may not follow (silent success bug ~7-10%). Adding formal hook layer doesn't add capability, it adds abstraction debt.

2. **Social modeling** — mask.md ("persona strategy per person") is a trust violation. Squad agents have consistent voices defined by charters. That's a feature, not a limitation. know.md/them.md premature — we have one human member and decisions.md already captures preferences.

**Recommendation:** Steal wisdom/episode split + active state file, nothing else.

**What NOT to pursue:** Social modeling, hook formalization, YAML frontmatter, portable identity (squad-export.json already handles this).

### Fenster (Core Dev) — Implementation Feasibility

**Files:** `.ai-team/decisions/inbox/fenster-memory-architecture-review.md`

**Finding:** Mapped proposal to existing files. Flagged concrete Windows + JSONL blockers. Recommended MVP.

**File System Mapping:**

| Proposal Concept | Current Squad Equivalent | Gap |
|---|---|---|
| identity/me.md | charter.md | Full overlap |
| identity/now.md | None | Gap — no current focus file |
| identity/wisdom.md | history.md (Learnings section) | Partial — mixed signal-to-noise |
| memory/{slug}.md | skills/{name}/SKILL.md | Partial — skills are structured, broader |
| social/people/ | None | Gap |
| RAG hooks | None | Gap |

**Strong Recommendation:** Anything adopted goes under `.squad/`, not repo root.

- **Under `.squad/agents/{name}/`:** wisdom.md, now.md (per-agent)
- **Under `.squad/memory/`:** shared artifacts
- **NOT repo root:** `/identity/`, `/memory/`, `/social/` would pollute every consumer repo. Contradicts v0.5.0 consolidation decision (#101-#106). Upgrade path breaks — can't migrate root-level dirs safely.

**Context Window Budget:** Feasible.
- Current spawn: ~83,000 tokens
- Adding proposal files: +2,750-8,000 tokens
- Stays well under 200K budget
- **BUT:** decisions.md is already 300KB (~75K tokens by itself). Real blocker is decisions.md unbounded growth, not new memory files.

**JSONL on Windows — Three Concrete Blockers:**

1. **File locking:** Windows locks files during writes more aggressively than POSIX. Two agents append to same `.jsonl` simultaneously → one gets EBUSY/EPERM. Drop-box pattern (separate files per writer, Scribe merges) exists specifically to avoid this. JSONL shared logs regress on solved problem.

2. **Git merge:** JSONL is one object per line. Git's default merge treats as text. Concurrent appends to same file create merge conflicts on every parallel branch. `union` merge driver almost works but produces duplicates + doesn't guarantee valid JSON on conflict lines. No `.gitattributes` driver understands JSONL semantics.

3. **Line endings:** JSONL parsers sensitive to `\r\n` vs `\n`. Windows git with `core.autocrlf=true` (common default) injects `\r` into JSONL files. Every parser needs to handle, or `.gitattributes` rules required for `*.jsonl`.

**Verdict:** Use markdown + SEM format instead of JSONL. Already have structured format (SEM = squad-memory-format), handles concurrent writes (drop-box), merges cleanly in git (markdown), works on Windows.

**MVP Recommendation:** 9 hours of work.
- wisdom.md extraction (2 hrs) + spawn template update
- now.md creation (2 hrs) + spawn template update
- Scribe update (3 hrs): merge wisdom entries, prune to 100 lines
- Test coverage (2 hrs)

Ships v0.6.0 alongside `.squad/` migration.

---

## Team Consensus

**Ship wisdom.md + now.md in v0.6.0.** Defer social modeling, episodic memory, and RAG pending:
- Privacy model (social layer needs explicit Brady approval)
- Platform capabilities (RAG needs Copilot embedding APIs)
- Data validation (episodic memory only if orchestration-log actually generates data)

**Never** formalize pre/post hooks as separate system. Coordinator already IS the hook system.

---

## Context for Future Work

- **v0.5.0** (in progress): `.ai-team/ → .squad/` rename, consolidation, dual-path migration
- **v0.6.0** (planning): wisdom.md + now.md (from this review), implement in Scribe + spawn template
- **v0.7.0+** (future): Social modeling, episodic memory, RAG (pending constraints listed above)
- **decisions.md bloat:** Urgent fix — 300KB file eating 75K context tokens. Archive + prune strategy needed.

