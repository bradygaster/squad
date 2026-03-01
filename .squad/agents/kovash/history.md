# Kovash — History

## Project Context

- **Project:** Squad — the programmable multi-agent runtime for GitHub Copilot
- **Owner:** Brady
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **My focus:** REPL shell in `packages/squad-cli/src/cli/shell/`

## Core Context

**REPL Streaming & Diagnostics (Feb 23–24):** Fixed empty-response streaming bug (root cause: `dispatchToCoordinator` fire-and-forget, fixed with `awaitStreamedResponse()` using `sendAndWait()` with 120s timeout). Fixed `deltaContent` SDK event key priority. Added OTel REPL wiring with resilience (try/catch gRPC failures). Added SQUAD_DEBUG logging infrastructure and .env file parser (no dotenv dep). Added VS Code launch.json OTEL_EXPORTER_OTLP_ENDPOINT config. UX overhaul: ThinkingIndicator with elapsed time + phase transitions, AgentPanel animations, MessageStream duration + wider rules, InputPrompt spinner. Comprehensive REPL audit filed 7 issues (#418, #425, #428, #430, #432, #433, #434). Fixed SDK connection dead air (#420/#425) with early activity hints + setImmediate. Fixed input buffering race (#428) with pendingInputRef queue. Fixed ghost retry messaging (#432) with clearer attempt counts. Fixed timeout progress (#418) with periodic "Still working..." hints. Verified coordinator streaming already correct (#430). All 157+ tests passing.

## Learnings

### P0 Screen Corruption Fix (2026-03-01)
- **Root cause:** Three contributing factors — (1) `<Static>` keys used bare index (`sm-${i}`) so Ink couldn't distinguish items across session boundaries, (2) no terminal clear on shell start left old scrollback visible, (3) session restore via `/resume` added messages on top of existing state without clearing first.
- **Fix:** Added `process.stdout.write('\x1b[2J\x1b[H')` before `render()` call in index.ts. Changed Static keys to session-scoped (`${sessionId}-${i}`) using `useMemo(() => Date.now().toString(36), [])`. Added `clearMessages()` to ShellApi that resets both `messages` and `archivedMessages`. Called `clearMessages()` + terminal clear in `onRestoreSession()` before restoring messages. Also fixed `/clear` command to clear `archivedMessages` too.
- **Key insight:** Ink's `<Static>` component tracks items by key. If keys collide across sessions (e.g., restored session reuses `sm-0`, `sm-1`...), Ink silently drops or overlaps items. Session-scoped keys make each render pass unique.
- **Brady's directive respected:** Full scrollback preserved — content flows naturally into the terminal scroll buffer via `<Static>`. No vertical compaction.

### SDK & Shell Architecture
- `CopilotSessionAdapter` maps `sendMessage()` → `inner.send()`, event names via EVENT_MAP.
- Shell modules: index.ts (entry), coordinator.ts, router.ts, spawn.ts, sessions.ts, render.ts, stream-bridge.ts, lifecycle.ts, memory.ts, terminal.ts, autocomplete.ts, commands.ts, types.ts
- Ink components: App.tsx, AgentPanel.tsx, MessageStream.tsx, InputPrompt.tsx
- SDK event mapping: `message_delta` → `assistant.message_delta`, `turn_end` → `assistant.turn_end`, `idle` → `session.idle`
- `sendAndWait` is optional on `SquadSession` interface (`sendAndWait?`) but always implemented in `CopilotSessionAdapter`
- `message_delta` events carry content in `deltaContent` key (priority: `deltaContent` > `delta` > `content`)
- SDK `_dispatchEvent` dispatches typed handlers first, then wildcard handlers; both swallow errors silently
- `awaitStreamedResponse()` returns full response content from `sendAndWait` result as fallback if delta accumulation empty
- Pattern: `dev:link` / `dev:unlink` scripts for local npm link workflow

### 📌 Team update (2026-03-01T02:04:00Z): Screenshot review session 2 — Terminal lifecycle and state messaging P0s
- **Status:** Completed — Joined Keaton, Marquez, Cheritto, Waingro in parallel review of 15 REPL screenshots from human testing.
- **Finding:** P0 blocker in screenshots 008-010/015 — screen buffer corruption
  - Root cause: Static key collisions in terminal state management
  - Missing terminal clear between renders
  - No alt screen buffer implementation
  - Blocks REPL stability; requires terminal lifecycle refactor
- **Cross-team alignment:**
  - Cheritto confirmed overlapping UI frames in 015 (likely our bug, not terminal transparency)
  - Keaton flagged contradictory state messaging alongside the buffer corruption — likely related state management issues
- **Next:** Coordinate with Cheritto (TUI Engineer) on terminal lifecycle redesign. High priority P0.
- **Session log:** `.squad/log/2026-03-01T02-04-00Z-screenshot-review-2.md`

### Recent Work Examples (#437, #440, #441, #442)

---

📌 Team update (2026-02-23T09:25Z): Streaming diagnostics infrastructure complete — SQUAD_DEBUG logging added, .env setup, OTel REPL wiring, version bump to 0.8.5.1. Hockney identified root cause of silent ghost response (empty sendAndWait + empty deltas). Saul fixed OTel protocol to gRPC. — decided by Scribe
- **PR #437 (SDK CONNECTION):** Immediate activity hints before createSession() blocks, setImmediate for render tick, "Connecting to SDK..." → "Routing..." transitions
- **PR #440 (INPUT BUFFERING + TIMEOUT PROGRESS):** Concurrent pendingInputRef queue for race conditions, periodic "Still working..." every 30s via setActivityHint()
- **PR #441 (GHOST RETRY):** Clearer messaging with (attempt N/totalAttempts) format, changed "No response" → "Empty response detected"
- **PR #442 (COORDINATOR STREAMING):** Verified wiring is correct, added diagnostic logging for session creation + listener lifecycle

---

📌 Team update (2026-02-24T07:20:00Z): Wave D Batch 1 work filed (#488–#493). Cheritto: #488–#490 (UX precision — status display, keyboard hints, error recovery). Kovash: #491–#492 (hardening — message history cap, per-agent streaming). Fortier: #493 (streamBuffer cleanup on error). See .squad/decisions.md for details. — decided by Keaton

📌 Team update (2026-02-24T08:12:21Z): Wave D Batch 1 COMPLETE — all 3 PRs merged to main, 2930 tests passing (+18 new). Kovash: #497 shipped Error Recovery Guidance. — decided by Scribe

- **2026-02-24 UX OVERHAUL:** Overhauled all 4 Ink components for "never feel dead" UX per Brady's request. ThinkingIndicator now shows elapsed time (updated every second), phase transitions (Connecting→Routing→Streaming), and color cycling (cyan→yellow→magenta). AgentPanel has PulsingDot animation on active agents, per-agent elapsed time, count summary, and dotted separator. MessageStream shows response duration timestamps, wider horizontal rules (50 chars), system messages with ◇ icon, user messages in full cyan. InputPrompt has integrated spinner during processing (◆ squad ⠸>), placeholder hint when empty. App header shows team count + active count, keyboard shortcuts, fallback tagline for no-squad. All changes confined to `components/` — no external API changes. Build clean, 157/157 tests pass.
- **2026-02-24 REPL AUDIT:** Conducted comprehensive REPL experience audit per Brady's directive. Filed 7 GitHub issues (#418, #425, #428, #430, #432, #433, #434) covering critical friction points: (1) 10-minute timeout too aggressive for complex operations, (2) 3-5 second cold SDK connection dead air on first message, (3) input buffering drops control keys during processing, (4) coordinator streaming invisible to user (not wired to MessageStream), (5) ghost response retry exhausts 40+ minutes before showing warnings, (6) zero E2E integration tests for user flows, (7) no way to cancel long-running operations without exiting shell. All issues have exact code locations, reproduction steps, root cause analysis, and proposed fixes. Key findings: TIMEOUTS.SESSION_RESPONSE_MS=600_000 (10min) is hardcoded in constants.ts, SDK connection happens lazily in createSession (not pre-warmed), InputPrompt bufferRef only captures printable chars (ignores backspace/arrows), coordinator not registered in SessionRegistry so roleMap lookup fails, withGhostRetry auto-retries 3x without user consent, test suite has 106 component tests but zero full user flow tests, Ctrl+C exits shell (should cancel operation first), SDK already exposes session.abort() but shell never calls it.
- **2026-02-24 FIX #420/#425 — SDK CONNECTION FEEDBACK:** Fixed cold SDK connection dead air (issue #420/#425). Root cause: `createSession()` blocked for 2-7s on first message with zero user feedback. Solution: Set activity hint ('Connecting to SDK...' or 'Connecting to <agent>...') BEFORE `createSession()` call, use `setImmediate` to give React a render tick before blocking, then update hint to 'Routing...' or 'thinking...' after connection completes. Changed both `dispatchToCoordinator` (line 327-338) and `dispatchToAgent` (line 234-258) in `packages/squad-cli/src/cli/shell/index.ts`. ThinkingIndicator now displays immediately. All 106 REPL UX tests + 41 streaming tests pass. PR #437 created.
- **2026-02-24 INPUT BUFFERING FIX (#428/#401):** The ref-based buffer from #381 handles keystrokes during disabled state, but fast typing during disabled→enabled transition could race with React's useEffect. Added `pendingInputRef` queue to catch characters arriving during the transition window before effect restoration fires. When useInput fires during disabled→enabled (before wasDisabledRef updates), characters queue up. The useEffect then drains both bufferRef and pendingInputRef together. Handles paste events (rapid character arrival) and concurrent renders. All 106 repl-ux.test.ts tests pass. PR #440.
- **2026-02-24 FIX #432 (ghost retry warnings):** Fixed ghost response retry feedback to show warnings EARLIER and with clearer messaging. Issue: retry count was confusing (showed "after 3 attempts" when actually made 4 total). Root cause: `maxRetries=3` means "3 additional retries after initial" but messaging didn't clarify. Fix: Changed `onRetry` callback in `ghostRetry()` to show `(attempt ${attempt + 1}/${maxRetries + 1})` — e.g., "Empty response detected. Retrying... (attempt 2/4)" clearly shows 2nd attempt out of 4 total. Final error now says "after 4 attempts" (accurate). Message also changed from "No response received" to "Empty response detected" for clarity. Users now see immediate feedback on first ghost detection with clear total attempt count. PR #441.
- **2026-02-25 ISSUE #418 — Timeout progress indicator:** Added periodic progress feedback to `awaitStreamedResponse()` in `packages/squad-cli/src/cli/shell/index.ts`. Problem: 10-minute `sendAndWait` timeout left users staring at silent spinner during long operations — no way to know if system hung or working. Solution: After 30 seconds, displays "Still working... (Xm Ys elapsed)" via `setActivityHint()`, updates every 30 seconds. Wired into existing ThinkingIndicator component. Timers properly cleaned up in finally block. Commit 859feaf on branch `fix/issue-418`. PR #440 (combined with #428 input buffering and #432 retry warnings).
- **2026-02-24 INPUT BUFFERING FIX (#428/#401):** The ref-based buffer from #381 handles keystrokes during disabled state, but fast typing during disabled→enabled transition could race with React's useEffect. Added `pendingInputRef` queue to catch characters arriving during the transition window before effect restoration fires. When useInput fires during disabled→enabled (before wasDisabledRef updates), characters queue up. The useEffect then drains both bufferRef and pendingInputRef together. Handles paste events (rapid character arrival) and concurrent renders. All 106 repl-ux.test.ts tests pass. PR #440.
- **2026-02-25 ISSUE #430 — Coordinator streaming verification:** Investigated coordinator `message_delta` event wiring in `dispatchToCoordinator`. Found that wiring is **already correct** — identical pattern to `dispatchToAgent`: (1) session created with `streaming: true`, (2) `message_delta` listener registered BEFORE `awaitStreamedResponse`, (3) `CopilotSessionAdapter` maps `'message_delta'` → `'assistant.message_delta'` correctly. All 41 streaming tests pass. Added diagnostic enhancements: session creation logging (sessionId, capabilities), listener lifecycle logging, fallback path logging, and architecture documentation in function comments. No functional changes. Commit 1f2df7d on branch `fix/issue-430`. PR #442.
- **2026-02-25 ISSUE #491 — Message history cap with archival:** Added configurable message history cap to prevent unbounded memory growth in long REPL sessions. Lowered `DEFAULT_LIMITS.maxMessages` from 1000 to 200 in `memory.ts`. Added `trimWithArchival()` method to `MemoryManager` that returns `{ kept, archived }` — both the retained messages and the overflow. In `App.tsx`, created `appendMessages()` callback that wraps every `setMessages` call through `trimWithArchival()`, moving excess messages to `archivedMessages` React state. Added optional `maxMessages` prop to `AppProps` for per-instance configuration. All 25 stress tests pass, 227/240 REPL/comprehensive tests pass (13 pre-existing failures unrelated to this change). PR #496.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### Issue #606 — Conflicting prompt styles
- **Root cause:** `getHintText()` in InputPrompt.tsx showed "Type @agent or /help" as a placeholder for the first 5 messages, duplicating the same guidance already shown in the App.tsx header banner (`Just type what you need — Squad routes it - @Agent to direct - /help - Ctrl+C exit`). Two competing prompt elements created visual noise.
- **Fix:** Collapsed three hint tiers to two. Removed the first tier that duplicated header content. Now: messageCount < 10 shows "Tab completes · ↑↓ history", messageCount >= 10 shows "/status · /clear · /export". The header banner is the single source of truth for @agent and /help guidance.
- **Pattern:** Prompt placeholders should provide complementary info, never duplicate guidance shown elsewhere on screen. Header = persistent reference, placeholder = progressive discovery of new features.
- **Tests:** Updated 4 test assertions in repl-ux.test.ts. All 110 REPL UX tests pass.

- **PR #538 (CTRL+C CANCEL + CONFIGURABLE TIMEOUT):** Fixed #500 and #502 together. Ctrl+C during streaming now sets `processing = false` immediately alongside `onCancel()`, so the InputPrompt re-enables instantly instead of staying locked. Added `SQUAD_REPL_TIMEOUT` env var (seconds) and `--timeout` CLI flag — computed as `replTimeoutMs` in `runShell()`, with precedence: env var → `TIMEOUTS.SESSION_RESPONSE_MS` → 600s default. The existing `handleCancel` in index.ts (session abort + stream buffer clear) was already correct; the missing piece was the UI state reset in App.tsx. Help text updated. All 2925 tests pass.

### Issue #625 — Redundant 'squad init' messaging in first-run experience
- **Root cause:** Two separate UI elements in App.tsx both told users to run `squad init` when no roster exists: the banner (line ~300) and the `firstRunElement` (line ~321). Duplicate guidance adds visual noise and confuses the hierarchy of where to look.
- **Fix:** (1) Changed `firstRunElement` empty-roster branch from showing `"Run 'squad init' to set up your team."` to returning `null` — the banner already covers this case. (2) Reworded banner text to prioritize the in-shell path: `"Type /init to set up your team, or exit and run 'squad init'"` (was exit-first). The `rosterAgents.length > 0` branch ("Your squad is assembled") is untouched.
- **Pattern:** Single source of truth for guidance — banner owns the "no roster" messaging, `firstRunElement` owns the "roster exists" first-run onboarding. No duplication across UI layers.

### Multi-line paste fix in InputPrompt
- **Root cause:** `useInput` fires per-character. On first `\n` in a paste, `key.return` triggered immediate `onSubmit` + `setValue('')`, then `setProcessing(true)` disabled the input. Remaining paste characters hit the disabled branch where `key.return` was ignored entirely, stripping all newlines and garbling lines together.
- **Fix (two parts):**
  1. **Enabled state — paste detection via debounce:** Instead of submitting immediately on `key.return`, a 10ms debounce timer starts. If more input arrives before the timer fires, it's a paste — newline is preserved in `valueRef` and accumulation continues. If the timer fires without more input, it's a real Enter — submit the accumulated value. Added `valueRef` to track real-time value synchronously (React state `value` is stale in closures).
  2. **Disabled state — newline preservation:** Changed `key.return` from being ignored to appending `\n` to `bufferRef`, so pasted text arriving during processing retains its line structure.
- **Key insight:** Ink's `useInput` delivers paste characters synchronously within a single event loop tick, so a 10ms debounce cleanly separates paste (characters arrive in <1ms) from real Enter (next input arrives after human reaction time). The 10ms delay is imperceptible for normal typing.
- **All value mutation paths** (backspace, history nav, tab completion, regular input) now sync `valueRef` alongside React state to keep the ref as source of truth for the debounced submit.
📌 Team update (2026-03-01T05:57:23): Nap feature complete — dual sync/async export pattern, 38 comprehensive tests, all 3229 tests pass. Issue #635 closed, PR #636 merged. — decided by Fenster, Hockney

### Issue #640 P1 UX fixes — Init flow usability (2026-03-01)
- **Context:** Keaton identified P1 improvements for init flow in `docs/proposals/reliable-init-flow.md` after Snake009 test showed users stuck at empty REPL with no guidance. Working on branch `squad/640-auto-cast-polish`.
- **Issue 1: Make `/init` actually useful** — Command was a no-op that just printed "type what you want to build." Now:
  - `/init "Build a snake game"` takes inline prompt and triggers casting via `triggerInitCast` signal in `CommandResult`
  - App.tsx handles the signal asynchronously (respects ESM sync constraint — `executeCommand` is synchronous, can't call async functions directly)
  - `/init` with no args shows usage guidance
  - Pattern mirrors other async command flows (like `/nap`) — command returns signal, caller handles async work
- **Issue 2: Improve empty-roster banner** — Changed from generic "Send a message to get started" to explicit "Describe what you're building to cast your team." Users now understand their first message will assemble the team.
- **Key constraint:** REPL `executeCommand` function is SYNCHRONOUS. ESM forbids `require()` and Promises won't resolve inline. Solution: return `triggerInitCast` signal in `CommandResult`, let App.tsx handle async dispatch.
- **Files:** `commands.ts` (added `triggerInitCast` to CommandResult, updated handleInit), `App.tsx` (handle triggerInitCast signal, updated banner text)
- **Build:** TypeScript compiles cleanly. Commit 044ec20 on branch `squad/640-auto-cast-polish`.
- **Pattern learned:** When a slash command needs to trigger async work, return a signal object in CommandResult. The caller (App.tsx handleSubmit) checks for signals and dispatches appropriately. Keeps command handler synchronous while enabling async workflows.

### Init auto-cast spinner fix (processing state)
- **Root cause:** `handleInitCast` called via `setTimeout` in the `onReady` auto-cast path bypassed `handleSubmit` in App.tsx, so `setProcessing(true)` was never called. The `activityHint` was set to "Casting your team..." but `ThinkingIndicator` requires `processing=true` to render, so spinner was invisible.
- **Fix:** Exposed `setProcessing` on `ShellApi` interface (App.tsx). Called `shellApi?.setProcessing(true)` at the top of `handleInitCast` and `shellApi?.setProcessing(false)` in the `finally` block and the `pendingCastConfirmation` early return. All exit paths covered: success → finally clears, error → finally clears, confirmation prompt → early return clears.
- **Key insight:** Any code path that bypasses `handleSubmit` (which owns `setProcessing(true)`) must manage processing state itself. The auto-cast setTimeout path and `/init` command's `triggerInitCast` path were both affected — `/init` was already handled in App.tsx line 208, but `handleInitCast` itself wasn't.
- **Pattern:** When adding new async dispatch paths to the shell, always ensure `setProcessing(true/false)` brackets the async work. The `ShellApi.setProcessing` method now makes this possible from index.ts without coupling to React state.


