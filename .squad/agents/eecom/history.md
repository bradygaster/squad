# EECOM

> Environmental, Electrical, and Consumables Manager

## Core Context

CLI entry point (`cli-entry.ts`) is the central router for 30+ commands. `safeTimestamp()` utility provides Windows-safe filenames (colons → hyphens). CastingEngine augments LLM casting with curated names — augment, not replace. `npm pack` produces complete installable tarball (~275KB). ESM module patch required for Node 24+ strict mode (@github/copilot-sdk@0.1.32 missing .js extension).

## Recent Learnings

### Template Brady contamination fix (#977) (2026-05-01)
Replaced all hardcoded "Brady" in template examples with generic `{user}`/`{name}` placeholders. Canonical sources: `.squad-templates/squad.agent.md` and `.copilot/skills/init-mode/SKILL.md`. Template sync only covers `.squad-templates/`; init-mode SKILL.md package copies required manual edits. Key distinction: only files copied to user repos were changed; Brady references in project docs are legitimate content.

### PR #942 rebase — cherry-pick from insider-based fork branch (2026-04-12)
When cherry-picking from an insider-based branch to dev, expect modify/delete conflicts for files that only exist on insider. Always verify the base assumptions of each change — imports referencing insider-only modules must be dropped or adapted. Opened #963 as clean replacement, closed #942.

### archiveDecisions() count-based fallback (#626) (2025-07-24)
Added count-based fallback when all `###` entries are <30 days old but file is >20KB. Separates recent entries into dated vs undated, sorts dated by age, keeps entries under threshold budget. **Rule:** Undated entries are always preserved (foundational directives). When a function has an early-return optimization, always consider whether the condition that triggered it can still be true when the early-return fires.

### node:sqlite Hard-Fail Fix (#502) (2026-03-21)
Replaced soft-warn with synchronous version check + `process.exit(1)` for Node <22.5.0. Added `checkNodeVersion()` to `squad doctor`. Corrected `engines.node` to `>=22.5.0` in all package.json files. **Pattern:** Always confirm `git branch` before editing files — edits don't follow you to a new branch.

### Personal Squad Init via npx (#576) (2026-03-23)
`init --global` now calls `ensurePersonalSquadDir()` after global init. Added idempotent `ensurePersonalSquadDir()` to SDK resolution.ts. `resolveGlobalSquadPath()` returns the container; `ensurePersonalSquadDir()` creates the `personal-squad/` subdirectory the rest of the system looks for.

## Historical Learnings Summary (condensed)

- **Loop command (#767):** For interactive/long-running child processes, always attach `.on('data')` listeners for real-time output. When using `node:fs` mocked in tests, use `vi.importActual<typeof import('node:fs')>('node:fs')` in `beforeAll` to get real filesystem access. teamRoot must derive from `detectSquadDir().path` not `workTreeRoot` in worktree scenarios.
- **Init scaffolding (no-remote, casting files) (#579):** Three execFileSync calls for git remote needed `stdio: ['pipe','pipe','pipe']` to suppress stderr. Init flow creates .squad/casting/ but never populated it — added scaffolding block. Pattern: execFileSync inside try/catch still leaks stderr without piped stdio.
- **CLI Version Subcommand:** `cmd === 'version'` added to existing `--version`/`-v` condition in cli-entry.ts. No separate command file needed for trivial inline handlers.
- **Privacy scrub messaging + EPERM + gitignore parent coverage (#549):** `ensureGitattributes` catches EPERM/EACCES, returns [] with console.warn. `ensureGitignore` skips entries with parent already covered. Footer shows "Privacy scrub applied" vs "Preserves user state" based on whether scrub ran.
- **Economy Mode (#500):** Layer 3 modifier only — never downgrades Layers 0-2 (user intent). `ECONOMY_MODEL_MAP` + `applyEconomyMode()` + CLI `squad economy on|off` + `--economy` flag. 34 tests.
- **Rate Limit UX (#464):** `rateLimitGuidance()` + `.squad/rate-limit-status.json` + `checkRateLimitStatus()` in doctor. Import `RateLimitError` from `@bradygaster/squad-sdk/adapter/errors` (subpath export, not main barrel).
- **CastingEngine CLI Integration (#342):** CastingEngine.castTeam() was never called in CLI flow. `augmentWithCastingEngine()` in cast.ts replaces LLM names with engine characters for recognized universes. Import from `@bradygaster/squad-sdk/casting` (not main barrel). 9 AgentRole enum values, not 6.
- **Cross-platform filename & config fixes (#348, #356):** Use centralized `safeTimestamp()` everywhere. Removed machine-specific `teamRoot` from config.json (computed at runtime via `git rev-parse`).
- **PR #427 cross-fork rebase:** When rebasing with git worktrees, always create a dedicated worktree for complex operations. In rebase context, "ours" = upstream, "theirs" = your branch. Use `git worktree list` to diagnose unexpected branch switching.
- **SDK Init Flow Deep Dive:** Critical gap: squad.config.ts never updated after auto-cast. CastingEngine exists but is never called. Roadmap: sync utility → Ralph fixes → CastingEngine integration → hire/remove commands.
- **Adoption Tracking Tier 1:** Moved `.squad/adoption/` → `.github/adoption/`. Aggregate metrics only — never publish individual repo lists without opt-in.
- **PR #483 (platform-adapter timeout):** `{ ...EXEC_OPTS, timeout: 3_000 }` pattern for external CLI calls that might hang. Existing catch block with fallback handles timeout errors.
- **PR #480 (history race condition):** Three-layer defense: async mutex, atomic file operations (write-then-rename), 14 tests.
- **PR #486 (SIGINT handling):** Two layers: parent SIGINT handler + child process cleanup (kill children, close handles, flush buffers). 22 tests.