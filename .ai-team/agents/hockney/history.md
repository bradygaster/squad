# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial assessment (2026-02-07). Full entries in `history-archive.md`._

- **Squad is an npx CLI** that copies `squad.agent.md` (coordinator) and `templates/` into user repos, plus pre-creates `.ai-team/` directory structure (inbox, orchestration-log, casting).
- **Started with zero test coverage** — no test files, no framework, no CI. Key risk areas identified: symlinks, filesystem errors, incomplete installs, cross-platform paths, ANSI in non-TTY.
- **Test strategy evolved** from `tap` to `node:test` + `node:assert` (zero dependencies) — integration-heavy (80% integration, 20% unit), spawn `index.js` in isolated temp dirs.
- **Three non-negotiable tests**: init happy path, init idempotency, export/import round-trip. If any fail, don't ship.

### Session Summaries

- **V1 Test Strategy (2026-02-08)** — **What I Did:**
- **Test Prioritization Review (2026-02-09)** — **What I Did:**
- **P0 Silent Success Bug Hunt (2026-02-09)** — **Audit scope:** All 4 session logs, all 7 agent histories, orchestration log, decisions inbox, squad.agent.md mitigations, git commit history. Full c
- **V1 Test Suite Shipped (2026-02-09)** — **What I Did:**
- **CI Pipeline Shipped (Sprint Task 1.3)** — **What I Did:**
- **Test Coverage Expansion (Sprint Task 1.2)** — **What I Did:**
- **PR #2 Prompt Validation Tests (Wave 2)** — **What I Did:**
- **npm Pack Dry-Run Audit (v0.2.0 Release Gate)** — **What I Did:**
- **Re-verification After docs/CHANGELOG Addition (v0.2.0)** — **Context:** Brady requested inclusion of `docs/` and `CHANGELOG.md` in the release pipeline. Changes were made to `package.json` (files field), `.npm

## Recent Updates

📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan
📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton
📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
📌 Team update (2026-02-08): Release ritual — state integrity canary is a hard release gate. Tests + state canary + npx verify are automated gates. All must pass before release ships. — decided by Keaton
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — per-agent model selection, team backlog, Demo 1. — decided by Keaton
