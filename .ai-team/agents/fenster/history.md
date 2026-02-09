# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial architecture review (2026-02-07). Full entries in `history-archive.md`._

- **Squad is a markdown-as-runtime system** — the entire orchestration is a 32KB `.github/agents/squad.agent.md` file interpreted by the LLM. `index.js` is a minimal installer (~65 lines initially) that copies the coordinator manifest and templates.
- **File system is the IPC layer** — agents write decisions to `.ai-team/decisions/inbox/`, Scribe merges to canonical `decisions.md`. This drop-box pattern eliminates write conflicts during parallel spawns.
- **File ownership model is foundational** — Squad-owned files (squad.agent.md, templates) are safe to overwrite on upgrade. User-owned files (.ai-team/) are never touched. This classification drives the entire forwardability strategy.
- **Upgrade architecture uses version-keyed idempotent migrations** — version detection via frontmatter parsing, backup before overwrite, `process.argv[2]` subcommand routing with no external dependencies.
- **Windows path safety is non-negotiable** — all file operations use `path.join()`, no hardcoded separators, no symlinks, pure `fs` operations only.
- **Key file paths**: `squad.agent.md` (coordinator), `index.js` (installer), `.ai-team/casting/` (registry/history/policy JSONs), `.ai-team/decisions/inbox/` (drop-box), `templates/` (format guides).

### Session Summaries

- **Sprint Plan 009 — Feasibility Review (2026-02-09)** — 📌 Team update (2026-02-08): Fenster revised sprint estimates: forwardability 6h (not 4h), export/import 11-14h (not 6h). Recommends export Sprint 2, i
- **File System Integrity Audit (2026-02-09)**
- **Upgrade Subcommand Implementation (2026-02-09)** — 📌 Team update (2026-02-08): V1 test suite shipped by Hockney — 12 tests pass. Action: when require.main guard is added to index.js, update test/index.
- **GitHub-Only Distribution (2026-02-09)** — ## Team Updates
- **Error Handling Implementation (Sprint Task 1.1)**
- **Version Stamping Phase 1 (Sprint Task 1.4)** — 📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by 
- **PR #2 Integration (2026-02-09)** — 📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from bla
- **Smart Upgrade with Migration Registry (Sprint Task 2.2)**
- **Export CLI Implementation (Sprint Task 2.4)**
- **Import CLI Implementation (Sprint Task 3.1)** — 📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be s

## Recent Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Hockney expanded tests to 27 (7 suites), including coverage for fatal(), error handling, and validation. — decided by Hockney
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-08): Incoming queue architecture finalized — SQL hot layer + filesystem durable store, team backlog as third memory channel, agent cloning ready. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 architectural review completed — 3 must-fixes, 5 should-fixes. All must-fixes applied during integration. — decided by Keaton
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi
