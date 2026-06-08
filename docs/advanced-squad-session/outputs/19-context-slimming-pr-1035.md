# 1035: fix: context overflow sentinel and coordinator size reduction
State: MERGED
URL: https://github.com/bradygaster/squad/pull/1035
Head: obit91/obit91/1017-context-overflow-sentinel

## Summary

Fixes #1017 — Squad coordinator silently drops in long sessions due to context overflow.

### Problem

When sessions grow long, the ~95.8KB `squad.agent.md` coordinator can be silently dropped from context. The session degrades to vanilla Copilot with no safety rails and no warning.

### Solution

1. **Canary token sentinel** — Deterministic token at the end of `squad.agent.md`. The always-loaded `copilot-instructions.md` checks for this token and warns if missing.
2. **Coordinator slimming** — `squad.agent.md` reduced from 95.8KB to ~55KB (~42% smaller) by extracting to on-demand reference files:
   - `spawn-reference.md`, `after-agent-reference.md`, `model-selection-reference.md`, `ralph-reference.md`, `worktree-reference.md`, `client-compatibility-reference.md`

### Additional changes in this PR

**Build fix — npm workspace SDK resolution:**
The CLI dep was `@bradygaster/squad-sdk: >=0.9.0`. npm excludes prerelease versions from this range by default, so it installed a stale published v0.9.4 in `packages/squad-cli/node_modules/` instead of the workspace version. This hid `FSStorageProvider`, `SquadState`, and other recently-added exports, causing 100+ CLI type errors. Fixed by changing the dep to `>=0.9.0-0`, which includes prerelease versions; npm workspace resolution picks up the local package when the local version satisfies the range, and the range remains valid for published packages (`file:../squad-sdk` would break installs outside the monorepo).

**`spawn-reference.md` fix:**
Removed a dangling "see Mode Selection table above" reference. The file is a standalone reference document with no such table; replaced with a self-contained inline description.

**E2E skill overhaul (`skills/e2e-template-testing/SKILL.md`):**

_Foundation (synced to all 4 template locations):_
- **Fast-Fail Rules:** stop on build failure, never skip scenarios silently
- **PII Protection:** never post absolute paths with usernames in PR comments; use `~` notation for temp paths and `<repo-root>` for repo-internal paths
- **Anti-Skip rule:** SKIPPED requires explicit user request
- **Progress reporting:** agents post a live 6-step tracking comment on the PR and update it in-place after each step
- **Duration tracking:** each step records elapsed time; final verdict includes a Total row
- **Windows encoding fix:** `[Console]::OutputEncoding = UTF8` + direct pipe + `ConvertTo-Json -Compress` instead of `Set-Content` so emoji render correctly in PR comments on PowerShell 5.1
- **`--allow-all-tools` required for non-interactive mode:** `copilot --agent squad -p "..."` without `--allow-all-tools` silently blocks all tool calls when there is no interactive terminal. Documented fix, env var alternative, and sandbox/permission notes.

_Progressive verdicting (added after diagnosing verdict-stage hangs):_
- **Root cause:** AI backend connection drops after ~15 min of continuous agent execution; verdict stage always appeared to "hang" because it was last when the connection died
- **Fix:** PATCH the tracking comment after **each** scenario, not just at the end — if the connection drops mid-run, the last successful PATCH is already visible on the PR
- **Agent Run Time Budget table:** hard limits on how many `copilot --agent squad` sessions can be batched per agent run (max 1 heavy session per agent to stay under the ~15 min budget)
- **Two new Anti-Patterns:** "batching all verdicts to end" and "multiple copilot sessions in one agent"

_Build recovery (added after tsc-not-found failure):_
- If `tsc: not found`, run `npm install` first to reconcile `node_modules` with the lock file (caused by `git checkout HEAD -- package-lock.json` without reinstalling)

### Validation

- Template sync: `npx vitest run test/template-sync.test.ts` — 185/185 pass
- Build: `npm run build` — passes (SDK + CLI clean) after workspace fix
- Static checks: canary present at EOF, coordinator shrank from 98,133 bytes / 1,136 lines to 59,037 bytes / 616 lines; all 5 reference files exist across all 4 template locations; all coordinator links resolve
- **E2E Run 8 (full live validation — all scenarios green):**

| Scenario | Result | Notes |
|----------|--------|-------|
| Fast-fail: build + link + version | ✅ | `npm install` + `tsc` + `squad version` clean |
| Size regression | ✅ | −40,656 bytes, −520 lines vs `origin/dev` baseline |
| Canary check | ✅ | `SQUAD_COORDINATOR_CANARY_a8f3` present at EOF |
| Spawn-reference static checks | ✅ | 5/5 reference files, 5/5 coordinator links |
| Happy path (`copilot --agent squad`) | ✅ | `docs/mission-note.md` created with exact content, 5 handoff hits |

Closes #1017

---
_Done with ghcp_
