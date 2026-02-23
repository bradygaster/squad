# Decision: Accessibility Hardening (#339)

**Author:** Nate (Accessibility & Ergonomics Reviewer)
**Date:** 2025-07-18
**Status:** Implemented
**Issue:** #339

## Context

Prior audit (#328) found CONDITIONAL PASS: NO_COLOR env var was not respected, ANSI codes emitted unconditionally, and several error messages lacked remediation hints. Color was partially used as sole status indicator.

## Decision

Implement full NO_COLOR/TERM=dumb compliance using a shared `isNoColor()` utility in terminal.ts. All components conditionally omit color props and replace animations with static text alternatives. Created `docs/accessibility.md` as the contributor reference.

## Changes

1. **terminal.ts** — Added `isNoColor()` function and `noColor` field to TerminalCapabilities. `supportsColor` now also factors in NO_COLOR.
2. **AgentPanel.tsx** — PulsingDot becomes static `●`. Active label: `[Active]` text. Error label: `[Error] ✖` text. Status line colors gated.
3. **ThinkingIndicator.tsx** — Spinner becomes static `...`. Color cycling disabled. `⏳` emoji prefix added for text-only identification.
4. **InputPrompt.tsx** — Spinner becomes `[working...]`. Cursor uses bold instead of color. All color props gated.
5. **MessageStream.tsx** — User/agent/streaming text colors all gated on `isNoColor()`.
6. **App.tsx** — Welcome banner border color gated.
7. **docs/accessibility.md** — Full guidelines doc with keyboard shortcuts, NO_COLOR matrix, contrast rules, error requirements.

## Risks

- NO_COLOR detection is process-level (reads env at call time), not reactive. If env changes mid-session, restart required. Acceptable for CLI use.
- 4 pre-existing test failures in repl-ux.test.ts (unrelated to this change — test expectations don't match component text from prior copy polish).
