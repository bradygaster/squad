# Fenster — History Archive

Archived entries from initial sessions. These entries were summarized into `## Core Context` in history.md.

---

## Archived: 2026-02-09 Session Entries

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


### Error Handling Implementation (Sprint Task 1.1)

- **`fatal()` helper pattern established** — centralized error output using RED ✗ prefix to stderr, then `process.exit(1)`. All fatal errors route through this single function for consistent formatting. Keeps error paths DRY.
- **`process.on('uncaughtException')` added** — catches anything that slips past explicit try/catch. Prints clean user-facing message, exits 1. No stack traces in production output.
- **Pre-flight validation before any writes** — source file existence (`squad.agent.md`, `templates/`) and destination writability (`fs.accessSync` with `W_OK`) are checked before any copy operations begin. Fail fast, fail clean.
- **`copyRecursive` wrapped in try/catch** — the recursive copy now catches at each level and reports which source path failed. Uses `path.relative()` for readable error messages.
- **Agent copy and directory creation wrapped** — both the upgrade and init paths for `squad.agent.md`, plus the `mkdirSync` calls for `.ai-team/` directories, have explicit error handling.
- **RED color constant added** (`\x1b[31m`) — consistent with existing ANSI constants (GREEN, DIM, BOLD, RESET).
- **File grew from 103 to 146 lines** — well under the 150-line ceiling. No restructuring, no new dependencies. All changes are additive wrapping of existing code.
- **All 12 existing tests pass** — zero regressions. Error handling is invisible to the happy path.


### Version Stamping Phase 1 (Sprint Task 1.4)

- **`engines` field added to package.json** — `"node": ">=22.0.0"` declares the Node 22+ requirement explicitly. This is needed because `node:test` (used by the test suite) is a Node 22+ feature. The engines field gives clear errors on older runtimes instead of cryptic module-not-found failures.
- **`--version` flag already correct** — `index.js` lines 13, 17-19 read `pkg.version` from `package.json` at runtime. Single source of truth, no duplication. No changes needed to index.js.
- **package.json is the version authority** — version (`0.1.0`), engine constraint (`>=22.0.0`), and the `--version` CLI flag all derive from package.json. No separate version file, no frontmatter, no build step. This aligns with Proposal 011's version detection strategy (package.json as primary source).
- **All 12 tests pass** after adding `engines` field. Zero test changes needed.
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney

📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan

📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal


📌 Team update (2026-02-08): Hockney expanded tests to 27 (7 suites), including coverage for fatal(), error handling, and validation. — decided by Hockney


📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal

📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal


📌 Team update (2026-02-08): Incoming queue architecture finalized — SQL hot layer + filesystem durable store, team backlog as third memory channel, agent cloning ready. — decided by Verbal


### PR #2 Integration (2026-02-09)

- Integrated PR #2 content (GitHub Issues, PRD Mode, Human Members) with Keaton/Verbal review fixes
- Must-fixes applied: gh CLI detection, worktree note, Init Mode questions moved post-setup, ceremony integration note, standard spawn template reference, Scribe/orchestration logging reference
- Init Mode: Added step 8 (post-setup input sources) after step 7, preserving existing steps 1-7 unchanged per Keaton's review
- Routing table: Added 3 new rows (Issues, PRD, Human) before the Multi-agent task catch-all
- Appended 3 new sections at end: GitHub Issues Mode (~130 lines), PRD Mode (~100 lines), Human Team Members (~95 lines)
- Total file growth: 981 → 1321 lines


📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 architectural review completed — 3 must-fixes, 5 should-fixes. All must-fixes applied during integration. — decided by Keaton
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal


### Smart Upgrade with Migration Registry (Sprint Task 2.2)

- **Version delta detection shipped.** `upgrade` now reads the installed version from squad.agent.md's YAML frontmatter (`version: "X.Y.Z"` regex), compares against pkg.version using a zero-dependency `compareSemver()`, and reports the delta: `"upgraded coordinator from 0.0.1 to 0.1.0"`. Legacy installs without a version header are treated as `0.0.0` and reported as `"from unknown"`.
- **"Already up to date" fast path.** When installed version matches pkg.version, upgrade prints `"Already up to date (v0.1.0)"` and exits 0. Still runs pending migrations on this path to handle interrupted prior upgrades.
- **Migration registry pattern established.** Array of `{ version, description, run(dest) }` objects. Migrations are filtered by `compareSemver(migration.version, oldVersion) > 0`, sorted by version, executed in order. Each migration is wrapped in try/catch — failures warn but don't abort. All migrations are idempotent (use `mkdirSync({ recursive: true })`).
- **First migration: `.ai-team/skills/` directory.** Keyed to version `0.2.0`. Creates the skills directory for Skills Phase 1 (item 2.3). Uses `recursive: true` so it's safe to run multiple times.
- **Old version captured before writes.** `readInstalledVersion()` is called before `copyFileSync` overwrites the agent file. The old version is hoisted to module scope so both the delta reporter and the migration runner can reference it.
- **Existing tests adapted.** Four upgrade tests now write an explicit old version (`0.0.1`) to squad.agent.md before running upgrade, so they exercise the actual upgrade path instead of hitting the new "already up to date" exit.
- **8 new tests added** — 4 for version delta detection (older version, same version, missing header, clean exit), 4 for migrations (skills creation, idempotency, skip-past-versions, interrupted-upgrade recovery). Total: 69 tests, all passing.
- **index.js grew from 146 to ~250 lines.** Still zero dependencies. All paths use `path.join()`. Windows safe.


### Export CLI Implementation (Sprint Task 2.4)

- **`export` subcommand shipped.** `npx github:bradygaster/squad export` produces `squad-export.json` — a portable JSON snapshot of the entire squad state. Reads casting files (registry, policy, history), agent directories (charter.md, history.md per agent), and skills (SKILL.md per skill directory). Missing files are gracefully skipped; missing squad (`team.md` absent) produces a clean fatal error.
- **`--out <path>` flag for custom output location.** Reads from `process.argv.indexOf('--out')` — no dependency needed. Defaults to `squad-export.json` in cwd. Uses `path.resolve()` for the custom path to handle both relative and absolute paths.
- **Export runs before source validation.** The export handler is placed after the help block but before the source file checks (`squad.agent.md`, `templates/` existence). Export reads from `.ai-team/` in cwd — it doesn't need the installer's source files. This means export works even from a standalone `index.js` copy.
- **Manifest schema is v1.0.** Fields: `version`, `exported_at` (ISO 8601), `squad_version` (from package.json), `casting` (object with registry/policy/history), `agents` (keyed by agent name, each with charter/history strings), `skills` (array of SKILL.md contents).
- **Warning message included.** After successful export, prints a caution about reviewing agent histories before sharing — they may contain project-specific information. This aligns with Proposal 008's decision that history needs manual curation in v1.
- **9 new tests added** — valid JSON output, casting state inclusion, agent charters and histories, skills inclusion, `--out` custom path, graceful failure without squad, success/warning messaging, missing casting files, help text mention. Total passing: 78 (74 pass, 4 pre-existing failures unrelated to export).
- **index.js grew from ~250 to ~320 lines.** Still zero dependencies. All paths use `path.join()`. Windows safe.


### Import CLI Implementation (Sprint Task 3.1)

- **`import` subcommand shipped.** `npx github:bradygaster/squad import <file> [--force]` imports a squad from a JSON export file. Validates version `1.0`, required fields (casting, agents, skills), creates full `.ai-team/` directory structure, writes casting state, agent charters/histories, and skills.
- **Collision detection with archival.** If `.ai-team/` exists without `--force`, import fails with a clear message. With `--force`, the existing squad is moved to `.ai-team-archive-{timestamp}/` (using `YYYYMMDD-HH-mm-ss` format — Windows-safe, no colons). The old squad is preserved, never deleted.
- **History split for portability.** Imported agent histories are split into Portable Knowledge (conventions, patterns, architecture) and Project Learnings (file paths, sprint plans, PR-specific context). Project learnings are preserved under a `## Project Learnings (from import — {source})` header. Pattern-based classification: section headers like "Key File Paths", "Sprint Plan", "PR #" are project-specific; "Runtime Architecture", "Windows Compatibility", "Learnings" are portable.
- **Import marker on every agent.** Each imported agent's history starts with `📌 Imported from {source} on {date}` to clearly identify the import origin and date.
- **Casting ceremony skipped.** Names, universe, and relationships arrive pre-populated from the export. No interactive ceremony needed — the team is ready to work.
- **Project-specific files reset.** `decisions.md` and `team.md` are created empty — these are project-specific and don't transfer. Standard directories (decisions/inbox, orchestration-log, log, skills) are created.
- **Skills imported by name.** Skill names are extracted from SKILL.md frontmatter `name` field and used as directory names. Falls back to `skill-{index}` if no name found.
- **11 new tests added** — valid import structure, collision detection (no --force), --force archival, round-trip (init → export → import), missing file, invalid JSON, wrong version, history split markers, success messaging, help text, missing argument. Total: 92 tests, all passing.
- **index.js grew from ~320 to ~480 lines.** Still zero dependencies. All paths use `path.join()`. Windows safe.


📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal


📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal


📌 Team update (2026-02-09): docs/ and CHANGELOG.md now included in release pipeline (KEEP_FILES, KEEP_DIRS, package.json files, .npmignore updated). Brady's directive. — decided by Kobayashi




## Archived: 2026-02-07 Foundational Entries

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
