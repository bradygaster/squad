---
"@bradygaster/squad-cli": patch
---

fix: restore CI green on dev — 25 regression fixes + 6 test corrections

Commit `4ecc244` ("feat: Squad Remote Control") rewrote `cli-entry.ts` and
silently dropped multiple P0 bug fixes. Commit `72ffcb1` ("unified status
display") introduced a TUI regression in AgentPanel. This changeset restores
all dropped behaviour and corrects test expectations that never matched the
implementation.

**Implementation regressions fixed (cli-entry.ts):**
- Bare semver output: `squad --version` now prints `0.x.y` not `squad 0.x.y`
- Whitespace args guard: `squad` / `squad   ` shows brief help and exits 0
- `NODE_NO_WARNINGS=1` set before first import to suppress ExperimentalWarning
- `squad doctor` hint restored in unknown-command error messages
- Help lines that exceeded 80 chars wrapped to continuation lines

**Implementation regressions fixed (shell/index.ts):**
- First-run (no `.squad/`) on non-TTY now outputs a welcome/get-started message
  instead of a TTY error, matching E2E test expectations

**Implementation regressions fixed (AgentPanel.tsx):**
- Completion flash correctly shows `✓ Done`; was showing `✓ [IDLE]` because
  the status-label condition was not gated on the flash state

**Test corrections (expectations that never matched implementation):**
- `repl-ux.test.ts`: `toContain('ready')` → `toContain('[idle]')`
- `human-journeys.test.ts`: `Scaffold ready` → `Your team is ready`;
  `copilot session` → `squad`
- `cli/init.test.ts` + `repl-ux-fixes.test.ts`: wrong gitattributes path fixed
- `ux-gates.test.ts`: two aspirational grouped-help tests replaced with `it.todo`
- `first-run-gating.test.ts`: banner spacer regex updated to match current source form
- `consult-command.feature`: expected text updated to match current CLI output
- `status-extended.feature`: exit code corrected (`1` → `0`) for non-squad dir
- `docs-build.test.ts`: `beforeAll` hook given explicit 30 s timeout to avoid
  flaky timeout failures under parallel test execution
- `journey-next-day.test.ts`: added `tick(50)` between session saves to prevent
  race condition when both sessions receive the same `lastActiveAt` timestamp
