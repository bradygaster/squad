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

📌 Team update (2026-02-13): VS Code runSubagent spawning — platform parity and adaptation strategy (consolidated). runSubagent viable with platform detection and custom .agent.md files. Spawn patterns all map 1:1; model selection is the gap; recommendation: prompt-level platform detection, no abstraction layer. Unblocks #32-35. — decided by Keaton, Strausz, Kujan
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


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — per-agent model selection, team backlog, Demo 1. — decided by Keaton

📌 Team update (2026-02-13): SSH workaround documentation pattern merged to decisions.md — inline README workarounds + troubleshooting.md guide, no code workarounds. — decided by Fenster


📌 Team update (2026-02-10): Marketing site architecture consolidated — Jekyll on GitHub Pages, docs/ is source root, blog from team-docs/blog/, no content reproduction. McManus (content) + Fenster (infrastructure) for Phase 1. — decided by bradygaster, Keaton, McManus
📌 Team update (2026-02-10): GitHub Issues/PR integration must not break CLI conversations — CLI is primary surface, GitHub integration is additive only. — decided by bradygaster


📌 Team update (2026-02-10): 0.3.0 priorities: async comms > GitHub-native > CCA adoption — decided by bradygaster

📌 Team update (2026-02-10): Clean branch config at init time — filter squad state from designated branches — decided by bradygaster

📌 Team update (2026-02-10): `squad:` label convention standardized for GitHub Issues — decided by Keaton, McManus


📌 Team update (2026-02-10): Async comms strategy decided — two-tier MVP: CCA-as-squad-member (2-4h, prompt-only) + Telegram bridge (8-16h, conditional on SDK spike). CCA is the floor. — decided by Kujan

## Learnings

- **Provider abstraction belongs at the prompt level, not in index.js.** The coordinator is a prompt that executes shell commands. A JavaScript provider module would require index.js to be a runtime (it's an installer) and would double the maintenance surface. Command templates in squad.agent.md are the correct abstraction layer.
- **index.js has near-zero GitHub-platform coupling.** The `.github/agents/` path is a Copilot CLI convention, not GitHub-the-platform. The only GitHub-specific code is the `npx github:bradygaster/squad` usage string (cosmetic). All real platform coupling is in squad.agent.md.
- **Capability negotiation is critical for multi-provider support.** ADO has no labels (uses Tags), no reactions, and requires work item types. GitLab has no sub-issues. The provider interface must declare what's available so the coordinator can adapt.
- **Two-channel pattern (MCP read, gh CLI write) is GitHub-specific, not universal.** Future providers will likely be CLI-only. The MCP fallback logic should be inside the GitHub provider, not in the generic interface.
- **Git remote URL parsing covers 95% of provider detection.** `github.com` → GitHub, `dev.azure.com`/`visualstudio.com` → ADO, `gitlab.com` → GitLab. Self-hosted instances need CLI-based detection (is `glab` configured?). Generic is the fallback.
- **ADO is the hardest provider.** WIQL for search, Tags for labels, Iterations for milestones, Work Item Types for issues — every concept has an impedance mismatch. GitLab is the easiest (glab mirrors gh closely). Estimate: ADO 23h, GitLab 12h, GitHub reorganization 9h.


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan

📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): Discord is the v0.3.0 MVP messaging connector. Gateway must be platform-agnostic with zero GitHub-specific imports. — decided by Keaton

- **UTF-8 emoji mojibake in test file.** `test/index.test.js` had 8 instances of garbled emoji strings (e.g. `≡ƒæñ` instead of `👤`, `≡ƒôî` instead of `📌`, `≡ƒñû` instead of `🤖`, `≡ƒƒó`/`≡ƒƒí`/`≡ƒö┤` instead of `🟢`/`🟡`/`🔴`). Root cause: file was likely saved or transferred through a system that re-encoded UTF-8 multibyte sequences as Latin-1/CP1252. Fixed all 8 instances to use real Unicode codepoints matching what `index.js` and `squad.agent.md` produce. All 118 tests pass.

- **Universe allowlist expansion (issue #21).** Added Adventure Time (community request from Gabe) plus 10 new universes to the allowlist in both `.github/agents/squad.agent.md` and `.ai-team/casting/policy.json`. New universes: Futurama, Seinfeld, The Office, Cowboy Bebop, Fullmetal Alchemist, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune. Selection rationale: filled genre gaps (sitcom, anime, animation, workplace comedy, hard sci-fi, sports/comedy). Total universes went from 20 → 31. Constraints added for The Office (avoid Michael Scott at scale) and Dune (combine book/film, avoid Paul unless required). Closed issue #21.


📌 Team update (2026-02-12): Universe expansion complete — 11 new universes (Adventure Time, Futurama, Seinfeld, The Office, Cowboy Bebop, Fullmetal Alchemist, Stranger Things, The Expanse, Arcane, Ted Lasso, Dune) added to casting allowlist. Issue #21 closed. — decided by Fenster

- **SSH agent / npm spinner hang documented (issue #30).** `npx github:bradygaster/squad` resolves via `git+ssh://`. When no SSH agent is running, git prompts for a passphrase but npm's progress spinner overwrites the TTY prompt, making it look frozen. This is an npm bug, not ours. Documented workarounds in README (Install section note + Known Limitations bullet) and created `docs/scenarios/troubleshooting.md` with problem→cause→fix format covering SSH hang, gh auth, Node version, agent visibility, upgrade cache, and Windows paths. The troubleshooting doc pattern is reusable for future community-reported issues.

- **Label automation for go: and release: namespaces.** Created `squad-label-enforce.yml` workflow to enforce mutual exclusivity on `go:*` (triage verdict) and `release:*` (version target) labels. When a new label is applied, conflicting labels in the same namespace are auto-removed and a comment is posted (only if a change was made). Special cases: applying `go:yes` auto-adds `release:backlog` if no release target exists; applying `go:no` removes all release labels. Updated `sync-squad-labels.yml` to sync 3 go: labels (go:yes, go:no, go:needs-research) and 5 release: labels (release:v0.4.0, v0.5.0, v0.6.0, v1.0.0, release:backlog). Updated `squad-triage.yml` to apply `go:needs-research` as default verdict after triage assigns a squad member. Updated `squad-heartbeat.yml` to add two new checks: issues missing go: labels and go:yes issues missing release: labels. This implements "agentic DevOps" — labels drive automation, automation enforces label integrity.
📌 Team update (2026-02-13): Agent Progress Updates — Milestone Signals + Coordinator Polling mechanism. 30s polling loop extracts [MILESTONE] markers from agent output. No agent code changes. Backward compatible. Unlocks notifications + Squad DM integration. — decided by Keaton
📌 Team update (2026-02-14): VS Code Model & Background Parity — Phase 1 (v0.4.0): accept session model, use runSubagent. Phase 2 (v0.5.0): generate model-tier agent files. runSubagent lacks model param; use prompt-level detection in squad.agent.md. — decided by Kujan
📌 Team update (2026-02-15): VS Code File Discovery — Works with zero code changes. Instruction-level abstraction naturally cross-platform. Constraints: single-root workspaces only, workspace trust required, tool approval UX on first write. — decided by Strausz

- **GitHub Projects V2 — Phase 1 validation complete (WI-1 + WI-2, Issue #6).** All `gh project *` CLI commands validated live against bradygaster/squad. Created test board, discovered field IDs, added issue #6, moved between all status columns (Todo→In Progress→Done), archived, linked to repo, deleted. Key findings: (1) Zero dependencies confirmed — no GraphQL client needed, `gh project` wraps everything. (2) `project` scope already present on token. (3) 4-step field discovery pipeline works — field IDs are project-specific but stable. (4) `item-add` is idempotent. (5) `item-edit` requires 4 opaque IDs (project, item, field, option) — most complex command. (6) Windows works via PowerShell `ConvertFrom-Json` instead of `jq`. Created SKILL.md at `.ai-team/skills/github-projects-v2-commands/SKILL.md` and implementation proposal at `team-docs/proposals/006a-project-board-implementation.md`. Provider abstraction documented: GitHub (implemented), ADO/GitLab (stubbed). Phase 1 gate passed — Phase 2 unblocked. Posted findings to issue #6.

📌 Team update (2026-02-15): Projects V2 Phase 1 validated — `gh project *` CLI commands work for all board operations. SKILL.md + implementation proposal shipped. Phase 2 (coordinator prompts + label sync workflow) unblocked. — decided by Fenster


📌 Team update (2026-02-13): Projects V2 Phase 1 validation complete — all gh project * commands validated live, no npm dependencies needed. Unblocks WI-3 (board init), WI-4 (label-to-board sync), WI-5 (board query). — decided by Fenster
