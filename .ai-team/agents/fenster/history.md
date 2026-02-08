# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Runtime Architecture
- **No traditional runtime exists** — the entire orchestration system is a 32KB markdown file (`.github/agents/squad.agent.md`) that GitHub Copilot reads and executes via LLM interpretation
- **Installer is minimal by design** (`index.js`, 65 lines) — copies agent manifest, creates directory structure, copies templates to `.ai-team-templates/`
- **Execution model**: Squad (coordinator) spawns agents via GitHub Copilot CLI's `task` tool with `agent_type: "general-purpose"`, each gets isolated context
- **File system as IPC** — agents write to `.ai-team/decisions/inbox/{name}-{slug}.md`, Scribe merges asynchronously to `decisions.md`
- **Context budget**: Coordinator uses 1.5%, mature agent (12 weeks) uses 4.4%, leaving 94% for actual work

### Critical Paths Requiring Code
- **Casting engine**: Universe selection algorithm (scoring by size fit, shape fit, resonance, LRU) should be deterministic Node.js code, not LLM judgment
- **Inbox collision detection**: Need timestamp suffixes or UUIDs in decision inbox filenames to prevent overwrites when agents pick same slug
- **Orchestration logging**: Spec requires "single batched write" but doesn't specify format — need concrete implementation for `.ai-team/orchestration-log/`
- **Casting overflow**: 3-tier strategy (diegetic expansion, thematic promotion, structural mirroring) needs character lookup tables per universe to prevent hallucination
- **Migration detection**: Need version stamp in `team.md` to detect pre-casting repos and stale installs

### Windows Compatibility Concerns
- Path resolution: Agents must run `git rev-parse --show-toplevel` before resolving `.ai-team/` paths (spec acknowledges this, but no enforcement)
- Installer uses `path.join()` correctly for cross-platform path separators
- Need testing for file locking behavior during concurrent inbox writes on Windows

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stay independent, optimize around Copilot — Squad will not become a Copilot SDK product. Filesystem-backed memory preserved as killer feature. — decided by Kujan
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): Baseline testing needed — zero automated tests today; `tap` framework + integration tests required before broader adoption. — decided by Hockney
📌 Team update (2026-02-08): DevRel polish identified — six onboarding gaps to close: install output, sample-prompts linking, "Why Squad?" section, casting elevation, troubleshooting, demo video. — decided by McManus
📌 Team update (2026-02-08): Agent experience evolution proposed — adaptive spawn prompts, reviewer protocol with guidance, proactive coordinator chaining. — decided by Verbal
📌 Team update (2026-02-08): Portable Squads architecture decided — history split (Portable Knowledge vs Project Learnings), JSON manifest export, no merge in v1. — decided by Keaton
📌 Team update (2026-02-08): Tiered response modes proposed — Direct/Lightweight/Standard/Full spawn tiers to reduce late-session latency. Context caching + conditional Scribe spawning as P0 fixes. — decided by Kujan + Verbal
📌 Team update (2026-02-08): Portable squads platform feasibility confirmed — pure CLI/filesystem, ~80 lines in index.js, .squad JSON format, no merge in v0.1. — decided by Kujan
📌 Team update (2026-02-08): Portable squads memory architecture — preferences.md (portable) split from history.md (project-local), squad-profile.md for team identity, import skips casting ceremony. — decided by Verbal

### Key File Paths
- `.github/agents/squad.agent.md` — authoritative governance (32KB spec, source of truth)
- `index.js` — installer entrypoint (65 lines, copies manifest + templates)
- `.ai-team/casting/registry.json` — persistent agent-to-name mappings
- `.ai-team/casting/history.json` — universe usage history, assignment snapshots
- `.ai-team/casting/policy.json` — universe allowlist, capacity limits
- `.ai-team/decisions/inbox/` — drop-box for parallel decision writes (merged by Scribe)
- `templates/` — copied to `.ai-team-templates/` as format guides

### Forwardability and Upgrade Architecture
- **The skip-if-exists pattern blocks upgrades** — `index.js` line 30 checks `fs.existsSync(agentDest)` and skips, which means users on v0.1.0 never receive coordinator improvements. This is the core forwardability problem.
- **File ownership model is the foundation** — every file must be classified as Squad-owned (safe to overwrite), user-owned (never touch), or additive-only (create if missing). Getting this classification wrong means either breaking user state or failing to upgrade.
- **squad.agent.md is stateless by design** — the coordinator reads it fresh every session with no cached state. This means overwriting it IS the upgrade. No running state migration needed for coordinator changes, only for `.ai-team/` files.
- **Version detection needs three strategies** — `.squad-version` metadata file (primary), frontmatter parsing (secondary), presence detection (fallback for v0.1.0 pre-versioning installs). Defensive detection is critical because we can't control what state users will be in.
- **Migrations must be idempotent** — users will run `upgrade` multiple times, migrations will encounter partially-migrated state, and failures must not corrupt data. Every migration checks if its work is already done before doing it.
- **Argument routing stays minimal** — `process.argv[2]` positional subcommands (upgrade/export/import/help/version) with no dependency on yargs or commander. Aligns with Proposal 008's export/import pattern. `index.js` stays under 150 lines.
- **Windows path safety is non-negotiable** — all file operations use `path.join()`. No hardcoded separators. No symlinks. No shell commands in migrations. Pure `fs` operations only.
- **Backup before overwrite, always** — `squad.agent.md.v{old}.bak` preserves user customizations. Critical failures (backup or overwrite) abort. Non-critical failures (migrations, new dirs) warn and continue.

📌 Proposal written: `docs/proposals/011-forwardability-and-upgrade-path.md` — complete upgrade system design with migration framework, version detection, error handling, and full index.js sketch.
📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. — decided by Keaton
📌 Team update (2026-02-08): Skills system designed — skills.md per agent for transferable domain expertise, distinct from preferences and history. Six skill types, confidence lifecycle, skill-aware routing. — decided by Verbal
📌 Team update (2026-02-08): Skills platform feasibility confirmed — skills in spawn prompts, store_memory rejected, file paths are frozen API contracts, defensive forwardability via existence checks. — decided by Kujan
📌 Team update (2026-02-08): v1 test strategy decided — node:test + node:assert (zero deps), 9 test categories, 6 blocking quality gates, 90% line coverage. index.js refactoring recommended. — decided by Hockney
📌 Team update (2026-02-08): v1 messaging and launch planned — "Throw MY squad at it" tagline, two-project demo arc, 7-day launch sequence, GitHub Discussions first. — decided by McManus
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan

### Sprint Plan 009 — Feasibility Review (2026-02-09)

- **Sprint 1 forwardability estimate is low.** Plan says ~4 hours for index.js changes. Actual scope (version detection with 3 fallback strategies, backup-before-overwrite, migration framework plumbing, error handling) is ~6 hours. My Proposal 011 sketch at ~140 lines is the right baseline — the plan's simplified pseudocode misses backup, version metadata, and error recovery.
- **Init should NOT always overwrite squad.agent.md.** Plan proposes removing skip-if-exists from init. Wrong — init runs in CI, in scripts, in onboarding. Silent overwrite on re-run is clobbering, not forwardability. Init should skip and hint at `create-squad upgrade`. Upgrade is the explicit overwrite path.
- **Sprint 2 export/import at 6 hours is unrealistic.** History heuristic extraction (separating portable knowledge from project learnings in flat history files) is undefined work — no regex, no LLM per v1 constraints. Manifest validation, Windows path safety in archive names, conflict detection with partial `.ai-team/` state all add up. Revised: 11-14 hours. Recommendation: export in Sprint 2, import deferred to Sprint 3.
- **Proposal 015 (silent success bug) is not sequenced in the plan at all.** This is a critical gap. ~40% response loss means the sprint itself is unreliable — agents doing sprint work will lose responses. Ship as Sprint 0 (~1 hour, zero risk, all prompt changes). Trust is P0.
- **History split can start Day 1.** Plan says Sprint 2 blocks on Sprint 1 (forwardability prerequisite). True for shipping to users, false for development. Prompt changes can be developed in parallel; only the final squad.agent.md merge requires upgrade to work. Same for README drafting.
- **Export depends on skills format being frozen.** If skills.md format changes while export is being built, export breaks. Need at least 1 day gap between skills finalization and export development start.
- **Import archive naming needs Windows safety.** `.ai-team-archive-{timestamp}/` with ISO 8601 colons won't work as directory names on Windows. Must use `YYYYMMDD-HHmmss` format.
- **Recommended total timeline: 12 days** (vs plan's 10) with Sprint 0 added and import moved to Sprint 3. High confidence vs medium confidence.


📌 Team update (2026-02-08): Fenster revised sprint estimates: forwardability 6h (not 4h), export/import 11-14h (not 6h). Recommends export Sprint 2, import Sprint 3 -- decided by Fenster

📌 Team update (2026-02-08): Testing must start Sprint 1, not Sprint 3. Hockney will pair with Fenster: implement + test together -- decided by Hockney

📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton

📌 Team update (2026-02-08): Skills system adopts Agent Skills standard (SKILL.md format) in .ai-team/skills/. MCP tool dependencies declared in metadata.mcp-tools -- decided by Verbal

### File System Integrity Audit (2026-02-09)

- **Scribe agent missing history.md** — `.ai-team/agents/scribe/` has `charter.md` but NO `history.md`. Every other agent (keaton, verbal, mcmanus, fenster, hockney, kujan) has both files. Scribe is listed in `team.md` as 📋 Silent. Missing history.md means Scribe cannot receive 📌 team updates like other agents.
- **Scribe missing from casting registry** — `.ai-team/casting/registry.json` lists 6 agents (keaton, verbal, mcmanus, fenster, hockney, kujan) but Scribe is absent. Also absent from `history.json` snapshot. This is likely intentional (Scribe is infrastructure, not a cast character) but it creates an inconsistency with `team.md` which lists 7 members.
- **Orphaned inbox file** — `.ai-team/decisions/inbox/kujan-timeout-doc.md` exists and has NOT been merged into `decisions.md`. Scribe should have picked this up. Content: Kujan documenting background agent timeout best practices (2026-02-09). This is a live bug — the drop-box pattern failed to complete.
- **decisions.md has mixed line endings** — 806 CRLF lines + 21 LF-only lines. The LF lines are `---` separators at lines 313, 526, 725, 779, 801 — all at section boundaries. Root cause: `merge=union` in `.gitattributes` merges content from branches with different line endings. Not corruption, but could cause diff noise.
- **All 6 agent history.md files lack trailing newlines** — POSIX convention expects trailing newline. Not a bug per se, but git diff and some tools produce cleaner output with them. Every history.md has this.
- **Orchestration log directory is empty** — `.ai-team/orchestration-log/` has zero files. Spec (Scribe charter) shows this should contain per-spawn entries like `2026-02-07T23-18-keaton.md`. After 3+ sessions of work, zero entries is abnormal. Either orchestration logging was never implemented or Scribe never wrote to it.
- **Runtime files are clean** — `index.js` passes syntax check, `package.json` parses as valid JSON, `.github/agents/squad.agent.md` exists (35KB). No corruption detected.
- **Casting files are clean** — All three JSON files (`policy.json`, `registry.json`, `history.json`) parse without errors. Schema looks correct.
- **Log files exist and are well-formed** — 4 session logs in `.ai-team/log/`, all with proper date-prefixed naming and markdown structure.

### Upgrade Subcommand Implementation (2026-02-09)

- **Forwardability gap fixed.** Shipped `upgrade` subcommand per Proposal 011's file ownership model. `npx create-squad upgrade` now overwrites Squad-owned files (squad.agent.md, .ai-team-templates/) unconditionally while never touching .ai-team/ (user-owned state). Default init behavior unchanged — still skips if exists.
- **Added --help and --version flags.** Version reads from package.json at runtime — single source of truth, no duplication. Help output documents the upgrade path so existing users discover it.
- **Skip message now hints at upgrade.** Changed "skipping" to "skipping (run 'upgrade' to update)" so pre-P015 users see the upgrade path on every init.
- **index.js grew from 65 to 103 lines.** Stayed well under the 150-line ceiling from Proposal 011. No dependencies added. All paths use path.join() — Windows safe.
- **Backup-before-overwrite deferred.**Proposal 011 specifies `squad.agent.md.v{old}.bak` before overwriting. Not implemented in this pass — the coordinator spec is Squad-owned and stateless, so overwrite is safe. Backup matters more when we add version detection and migration framework.

📌 Team update (2026-02-08): V1 test suite shipped by Hockney — 12 tests pass. Action: when require.main guard is added to index.js, update test/index.test.js to import copyRecursive directly. — decided by Hockney
📌 Team update (2026-02-08): P0 bug audit consolidated (Keaton/Fenster/Hockney). Drop-box pipeline was broken, 12 inbox files accumulated. Inbox-driven Scribe spawn now in place. Orchestration log still dead — implement or remove. — decided by Keaton, Fenster, Hockney

📌 Team update (2026-02-09): DM platform feasibility analyzed — Copilot SDK as execution backend, Dev Tunnels, ~420 LOC, 3 gate spikes before implementation. — decided by Kujan
📌 Team update (2026-02-09): Squad DM experience design proposed — single bot, summary+link output, proactive messaging, DM mode flag, cross-channel memory. — decided by Verbal
📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Wave 1: error handling in index.js, version stamping. Wave 2: smart upgrade, export, skills Phase 1. Wave 3: import, full portability. Squad DM deferred to Wave 4+. — decided by Keaton
📌 Team update (2026-02-09): "Where are we?" elevated to messaging beat (Proposal 014a) — instant team-wide status as core value prop. — decided by McManus
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan


📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

### GitHub-Only Distribution (2026-02-09)

- **No npm publish, ever.** Squad is distributed exclusively via `npx github:bradygaster/squad`. Brady explicitly rejected npm publishing. The `name` and `bin` fields in package.json remain because `npx github:` reads them to find the entrypoint — they're plumbing, not branding.
- **Help text updated.** Changed `create-squad` → `squad` in help banner and `npx @bradygaster/create-squad` → `npx github:bradygaster/squad` in usage line. Two lines changed in index.js, zero test changes needed. All 12 tests pass.
- **package.json intentionally NOT changed.** The `name: "@bradygaster/create-squad"` stays — npx github distribution reads it but users never see it. Changing it risks breaking the bin resolution chain.

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.

2026-02-09: Branch strategy — squadify renamed to dev, main is product-only (no .ai-team/), release workflow (.github/workflows/release.yml) uses filtered-copy from dev→main.

2026-02-09: Tone governance established — SFW, kind, dry humor, no AI-flowery talk. 25 proposals audited (status fields updated). Tone audit: 16 edits across 8 files. Blog post #2 shipped.

### Version Stamping Phase 1 (Sprint Task 1.4)

- **`engines` field added to package.json** — `"node": ">=22.0.0"` declares the Node 22+ requirement explicitly. This is needed because `node:test` (used by the test suite) is a Node 22+ feature. The engines field gives clear errors on older runtimes instead of cryptic module-not-found failures.
- **`--version` flag already correct** — `index.js` lines 13, 17-19 read `pkg.version` from `package.json` at runtime. Single source of truth, no duplication. No changes needed to index.js.
- **package.json is the version authority** — version (`0.1.0`), engine constraint (`>=22.0.0`), and the `--version` CLI flag all derive from package.json. No separate version file, no frontmatter, no build step. This aligns with Proposal 011's version detection strategy (package.json as primary source).
- **All 12 tests pass** after adding `engines` field. Zero test changes needed.