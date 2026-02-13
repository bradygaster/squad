# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Memory architecture (2026-02-07)
- **Drop-box pattern:** Agents write decisions to `.ai-team/decisions/inbox/{name}-{slug}.md` during parallel work. Scribe merges them into canonical `decisions.md` and deletes inbox files after merge. This prevents write conflicts.
- **File ownership:** `decisions.md` is Scribe-owned (merge authority). `history.md` per agent is append-only by owning agent; Scribe appends cross-agent `📌 Team update` notes. `log/` entries are write-once by Scribe.
- **Deduplication responsibility:** When branches merge or parallel agents produce overlapping decisions, Scribe consolidates them into single blocks with combined authorship and rationale.

### Silent success bug — Scribe vulnerability (2026-02-08)
- **Scribe was the most vulnerable agent to the P0 silent success bug.** Scribe does nothing but tool calls (file writes) with no user-facing text — exactly the pattern that triggers "no response" on the platform.
- **Mitigation applied:** `⚠️ RESPONSE ORDER` instruction added to Scribe spawn template requiring a TEXT summary after all tool calls. All four spawn templates in squad.agent.md now carry this fix.
- **Cascade failure identified:** If agents hit the silent success bug, coordinator sees "no work done" and skips Scribe spawn → inbox files accumulate → decisions.md goes stale → team diverges. Fix: inbox-driven Scribe spawn (check inbox for files, spawn Scribe regardless of agent response status).

### Commit conventions (2026-02-08)
- **Windows compatibility:** Do NOT use `git -C {path}` (unreliable with Windows paths). Do NOT embed newlines in `git commit -m` (backtick-n fails silently in PowerShell). Use `cd` + temp file + `git commit -F`.
- **Commit prefix:** `docs(ai-team):` for all `.ai-team/` changes.

### Inbox merge session (2026-02-08)
- Merged 12 orphaned inbox files into decisions.md
- Consolidated 3 overlapping decision groups into single entries
- Propagated cross-agent updates to all 6 agent history files
- Cascade fix (inbox-driven Scribe spawn) is now in decisions.md — this is the fix that prevents future inbox accumulation

📌 Team update (2026-02-08): Scribe cascade fix shipped by Verbal — inbox-driven spawn now in coordinator. Scribe spawns if inbox has files, regardless of agent response status. — decided by Verbal
📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster. V1 tests shipped by Hockney. P0 bug audit consolidated (Keaton/Fenster/Hockney). — decided by multiple
📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Waves replace sprints. Gates are binary. Squad DM deferred to Wave 4+. Supersedes Proposal 009 sprint structure. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — instant team-wide status as core value prop. Demo beat, DM connection, README placements defined. — decided by McManus
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — coordinator writes directive-type messages to decisions inbox as first action. No new infrastructure. — decided by Kujan

📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton

📌 Team update (2026-02-08): Proposal 023 — coordinator extracts all actionable items from messages, new backlog.md as third memory channel (intent), SQL rejected as primary store, proactive backlog surfacing as Phase 3 — decided by Verbal


📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal


📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal


📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal


📌 Team update (2026-02-09): Progressive history summarization added to Scribe responsibilities — when agent history.md exceeds ~3000 tokens, summarize entries older than 2 weeks into Core Context section. — decided by Verbal


📌 Team update (2026-02-09): Export + Import CLI shipped — squads are now fully portable via squad-export.json. Round-trip at 100% fidelity. History split is pattern-based. — decided by Fenster


📌 Team update (2026-02-09): Contribution blog policy consolidated — retroactive PR #1 blog (001c) added. All contributions get a blog post, late is OK. — decided by McManus


📌 Team update (2026-02-10): v0.3.0 sprint plan approved — Scribe merge is Wave 2 integration item. — decided by Keaton

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal
