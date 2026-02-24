# UX Gap Catalog — Marquez
Generated: 2026-02-24

## Current Status
- **Date:** 2026-02-24, 04:30 UTC
- **Team Context:** Batch 1 PRs (#444, #445) + Cheritto (#407, #405, #404) + Fenster (#431, #429) + Kovash (#434, #433) + Wainsgro (#403, #397, #387) + Others
- **Scope:** Shell components (App, MessageStream, AgentPanel, InputPrompt, ThinkingIndicator) + lifecycle + commands

---

## Gaps Already Tracked (open issues, not being fixed yet)

| Issue | Title | Status | Squad | Priority | Notes |
|-------|-------|--------|-------|----------|-------|
| #434 | REPL: No way to cancel long-running agent operations | open | kovash | P0 | Ctrl+C exits shell, not operation. Need operation-level cancel. |
| #433 | REPL: No end-to-end integration tests for user flows | open | kovash | P1 | Zero E2E tests simulating user→SDK→render. Component tests insufficient. |
| #431 | UX: Empty/whitespace args show abbreviated prompt | open | hockney | P2 | `squad ` shows `sq>` instead of `◆ squad>`. Confusing on first run. |
| #429 | UX: Version command format is inconsistent | open | hockney | P2 | `--version` outputs semver, `version` outputs semver, but /version in shell outputs plain. |
| #426 | Two different taglines — pick one and stick | open | hockney | P1 | Line 55: "Add an AI agent team", Line 71: "Team of AI agents". Brand inconsistent. |
| #410 | test: ErrorBoundary component not exported | open | hockney | P2 | ErrorBoundary.tsx exists but not exported from index.ts. Can't unit test. |
| #409 | test: tab autocomplete not implemented in REPL | open | hockney | P1 | createCompleter export exists in autocomplete.ts but Tab key wired in InputPrompt (line 117) with no feedback when match found. |
| #403 | Speed: stub commands pollute experience | open | waingro | P0 | `triage`, `loop`, `hire` are stubs with "(full implementation pending)". Remove or ship. |
| #398 | Human journey: I came back the next day | open | breedan | P1 | User returns to REPL → no session history. Messages vanish on exit. |
| #397 | Speed: first message after shell launch hiccup | open | waingro | P1 | Cold SDK connection (3-5s) shows no status. User thinks shell is broken. |
| #396 | Human journey: I'm a power user now | open | breedan | P1 | Power users want: session export, command history across sessions, config file. |
| #394 | Human journey: I want to talk to a specific agent | open | breedan | P1 | @Agent routing works but feels undiscoverable. Needs better prompt hints. |
| #387 | Speed: squad init ceremony wastes 2+ seconds | open | waingro | P2 | Typewriter animation on subsequent init runs blocks input unnecessarily. |
| #386 | Human journey: Something went wrong | open | breedan | P1 | Error messages lack context. User sees "SDK not connected" with no next steps. |
| #385 | Human journey: I'm waiting and getting anxious | open | breedan | P1 | Long response times show generic spinner. Need activity hints throughout pipeline. |
| #384 | Human journey: My first conversation | open | breedan | P1 | New user lands, doesn't know what to type. First-run prompt is weak. |
| #363 | Squad utilize unsafe characters for files | open | unassigned | P1 | Team names with spaces/special chars create broken paths. |
| #342 | Improve division of work logic | open | unassigned | P1 | Coordinator routing decision logic is opaque. No explain why agent X was chosen. |
| #324 | 1.2 Dogfood CLI with real repos | open | unassigned | P0 | Haven't tested against real projects. Only test fixtures. |

**Subtotal: 19 tracked issues**

---

## NEW Gaps (not in any issue)

### 1. Agent Panel Compact Mode Completion Flash Missing
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:60-99`
- **Priority:** P2 (affects <30% of users on narrow terminals)
- **What:** The `completionFlash` animation (showing "✓ Done" when agent finishes) only renders in normal/wide mode (line 132). Users on compact terminals (≤60 cols) never see completion confirmation.
- **Fix:** Render completion flash in compact branch. Move flash render outside the mode check. Consider abbreviating to just "✓" in compact mode.

### 2. Header Roster Line Wrapping Breaks Agent Names
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:188-192`
- **Priority:** P2 (affects 5-10% of users with narrow terminals)
- **What:** The header roster uses a single `<Text wrap="wrap">` node with string concatenation (`${a.emoji} ${a.name}${i < ... ? ' · ' : ''}`). If terminal wraps, names break mid-agent (e.g., `🏗️ Keaton · 💬` on line 1, `Riley · 🔧 Devon` on line 2). Should use `<Box flexWrap="wrap">` with individual agent nodes like AgentPanel does.
- **Fix:** Refactor header roster to use `<Box flexWrap="wrap">` with per-agent `<Box>` children. Keep each agent name atomic.

### 3. System vs User Message Prefix Too Visually Similar
- **Where:** `packages/squad-cli/src/cli/shell/components/MessageStream.tsx:101, 106`
- **Priority:** P1 (causes cognitive load in fast-scrolling conversations)
- **What:** User messages use `❯` (right-pointing angle), system messages use `▸` (right-pointing triangle). At a glance, especially in dim color, these are hard to distinguish. The history shows this as a known gap (P1-2).
- **Fix:** Use more visually distinct prefixes. Options: `❯` for user, `ℹ` for system; or `❯` for user, `!` for system. Test on 60-col narrow terminal.

### 3a. System Message Not Using Emoji Convention
- **Where:** `packages/squad-cli/src/cli/shell/components/MessageStream.tsx:104-108`
- **Priority:** P2 (polish issue)
- **What:** Agent messages use emoji + name (e.g., `🏗️ Keaton:`), but system messages use `▸ system:` (no emoji). Inconsistent visual language.
- **Fix:** Either (a) add a system emoji (e.g., `⚙️ system:`), or (b) change prefix to match hierarchy (`◆ system:` to match brand mark).

### 4. Activity Hints Truncated Without Clear Indication
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:150-152`
- **Priority:** P2 (affects <5% of users)
- **What:** Activity hints (e.g., "Keaton is reading file...") are truncated to `maxHintLen` with `…` appended. But users don't know what the full text was. No tooltip/hover explanation. In a 80-col terminal with multiple agents, the hint becomes unreadable.
- **Fix:** Instead of truncating, cycle between activity hints (show first 60 chars for 1s, then next part). Or use a marquee effect. Or show full hint only for the most recent agent.

### 5. Exit Message Is Underwhelming
- **Where:** `packages/squad-cli/src/cli/shell/index.ts` (exact line tbd — shell exit handler)
- **Priority:** P2 (polish issue)
- **What:** When user exits shell, they see `👋 Squad out.` (plain console.log) after a rich, color-coded, animated experience. No summary of session (messages sent, agents used, time elapsed). Claude CLI shows a brief session recap on exit.
- **Fix:** Generate exit summary: "You had 12 messages with Keaton and Riley over 8 minutes. Great work!" Include agent list and message count.

### 6. /clear Command Has No Confirmation Or Feedback
- **Where:** `packages/squad-cli/src/cli/shell/commands.ts:84-86`
- **Priority:** P2 (UX polish, prevents accidental loss)
- **What:** `/clear` clears the terminal with `\x1Bc` ANSI escape. No "are you sure?" prompt, no "messages preserved in /history" feedback. Users can accidentally nuke 30 minutes of conversation history.
- **Fix:** Add confirmation: `/clear` → "Clear history? (y/n)" or change to `/clear history` explicitly. Show "History cleared. Messages saved in /history." after clearing.

### 7. Input Buffering During Processing Is Silent
- **Where:** `packages/squad-cli/src/cli/shell/components/InputPrompt.tsx:59-80`
- **Priority:** P2 (affects user confidence)
- **What:** When agent is processing, InputPrompt buffers keystrokes silently. User types "hello" during processing, nothing appears on screen, then when agent finishes the input magically restores. This feels broken to users who think their typing was lost.
- **Fix:** Show a subtle "✎ buffering input..." hint in the disabled prompt state. Or show typed characters in a dim color even when disabled.

### 8. Welcome Banner First-Run Hint Uses Arbitrary Agent Name
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:169-170, 209`
- **Priority:** P1 (confuses users on first run)
- **What:** The first-run hint uses `leadAgent = welcome?.agents[0]?.name ?? 'Keaton'`. If the first agent isn't the "best starter agent", this misdirects users. If team.md has 5 agents but first is "DataAnalyst", hint suggests `@DataAnalyst what should we build first?` which feels backwards.
- **Fix:** Add a `.squad/welcome.md` field `starterAgent: "Keaton"` or use role-based selection (prefer `coordinator` or `task` role). Make hint dynamic: show agent's charter in dimColor.

### 9. ThinkingIndicator Default Label Not Accounting For All Phases
- **Where:** `packages/squad-cli/src/cli/shell/components/ThinkingIndicator.tsx:22, 94-100`
- **Priority:** P1 (causes "is it broken?" anxiety in certain flows)
- **What:** Default label is "Routing to agent..." which is correct for cold SDK connection. But once SDK is warm and user sends a message that requires coordinator thinking (route + dispatch), the label is wrong (it's thinking, not routing). Consider: `@Agent command` → agent is thinking about response → label shows "Routing to agent..." (misleading).
- **Fix:** Change default to "Processing..." (more general) OR detect context and show "Coordinator thinking..." vs "Agent thinking..." vs "Routing...". Requires passing more context to ThinkingIndicator.

### 10. Agent Status Labels Inconsistent Across Views
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:80, 148` + `packages/squad-cli/src/cli/shell/commands.ts:148`
- **Priority:** P1 (creates cognitive load, known issue from history)
- **What:** AgentPanel compact mode shows `streaming`/`working` (lowercase, line 80). AgentPanel normal mode shows `▶ Active` (single label, line 124). Commands.ts `/agents` shows `[WORK]`/`[STREAM]`/`[ERR]`/`[IDLE]` (brackets, uppercase, line 148). Three different vocabularies for same data.
- **Fix:** Unified status: everywhere use lowercase `working`/`streaming`/`error`/`idle` OR use the `[WORK]`/`[STREAM]` brackets everywhere. Pick one and document in DESIGN_DECISIONS.

### 11. /agents and AgentPanel Show Different Data
- **Where:** `packages/squad-cli/src/cli/shell/commands.ts:142-150` vs `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx`
- **Priority:** P1 (known issue from history)
- **What:** AgentPanel shows live roster with pulsing dots, color, elapsed time, activity hints. `/agents` returns a flat text list with `[WORK]`/`[IDLE]` brackets. Same underlying data, completely different presentation. Confuses users: they see `● Active` at the top, but `/agents` says `[STREAM] Riley`.
- **Fix:** Align `/agents` output with AgentPanel rendering. Use same emoji + color + status language. Could even render AgentPanel component output through ShellRenderer if possible.

### 12. `quit` vs `/quit` Asymmetry (Already fixed in #444?)
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:40` vs `packages/squad-cli/src/cli/shell/commands.ts:39-41`
- **Priority:** P2 (minor UX friction)
- **What:** PR #444 added `quit` to EXIT_WORDS, so this might be fixed. Verify: `quit` and `q` bare words should exit (alongside `exit`). Check if `q` alone works.
- **Fix:** Ensure EXIT_WORDS contains `['exit', 'quit', 'q']`. Add test: `shell.type('q')` → exits.

### 13. Separator Consistency (Already fixed in #444?)
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:96, 166` vs `packages/squad-cli/src/cli/shell/components/MessageStream.tsx:97`
- **Priority:** P2 (visual polish)
- **What:** PR #444 should have replaced hardcoded `'─'.repeat(sepWidth)` with boxChars-aware rendering. Verify: are separators using box-drawing chars for Windows Terminal and ASCII fallback for dumb terminals?
- **Fix:** If not already done, use `getBoxChars()` from terminal.ts. Character should be `.h` (horizontal).

### 14. Message Duration Calculation Confusing
- **Where:** `packages/squad-cli/src/cli/shell/components/MessageStream.tsx:70-80, 92-93`
- **Priority:** P2 (rarely noticed but confusing when visible)
- **What:** Duration shows time from previous user message to agent response. Example: User sends message at 10:00, agent responds at 10:03 → shows `(3s)`. But if user sends two messages in quick succession, duration calculation walks backward and might show time from the *first* user message, not the immediate predecessor. Misleading for multi-turn conversations.
- **Fix:** Clarify: duration should always be from the *most recent* user message to the agent response. Current code does this (line 73-77) but could be clearer. Add comment. Or show `(3s from @User)` to disambiguate.

### 15. Message Fade-In Timing Not Adjustable
- **Where:** `packages/squad-cli/src/cli/shell/useAnimation.ts` (exact line tbd — useMessageFade hook)
- **Priority:** P3 (minor polish)
- **What:** New messages fade in over 200ms. This is hardcoded and not configurable. On slow terminals or high-latency connections, the fade might complete before the message is fully rendered, looking like a flicker.
- **Fix:** Export fade duration as configurable constant. Document in DESIGN_DECISIONS.

### 16. Placeholder Text Doesn't Mention Slash Commands
- **Where:** `packages/squad-cli/src/cli/shell/components/InputPrompt.tsx:154-156`
- **Priority:** P2 (first-time user education)
- **What:** Empty prompt shows hint `Type anything or @agent...` (normal) or `@agent...` (compact). Doesn't mention slash commands exist. New user types `/h` hoping for help, gets stuck wondering if they did it right.
- **Fix:** Change hint to: `Type / for commands or @agent...` (normal) / `/cmds` (compact). Or cycle hints every 30 seconds: `/help · @agent · Ask naturally`.

### 17. No Visible Indication of Team.md Issues
- **Where:** `packages/squad-cli/src/cli/shell/lifecycle.ts:86-89`
- **Priority:** P1 (affects team discovery reliability)
- **What:** If team.md parsing fails silently, user sees "No agents active" with no explanation. The `parseTeamManifest` function (line 82) might return empty array without error feedback.
- **Fix:** If no agents discovered, show warning: "⚠️  No agents found in team.md. Run 'squad doctor' or 'squad init' to fix."

### 18. No Feedback During Cold SDK Connection
- **Where:** `packages/squad-cli/src/cli/shell/index.ts` (cold connection phase)
- **Priority:** P0 (critical user anxiety)
- **What:** When user sends first message, SDK initializes (3-5s). No feedback. ThinkingIndicator shows "Routing to agent..." but no "Connecting..." phase. Users think shell is broken.
- **Fix:** Show "Connecting to GitHub Copilot..." before "Routing to agent...". Requires wiring SDK connection events to setActivityHint.

### 19. Keyboard Hints Too Generic
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:202`
- **Priority:** P2 (UX education)
- **What:** Header shows `'Just type - @Agent to direct - /help - Ctrl+C exit'` regardless of context. After first message, user knows @Agent works. But they don't know Tab completes, ↑/↓ navigate history, /status shows team status.
- **Fix:** Adaptive hints. First run: emphasize @Agent. After 5 messages: show `/status`, `/history`. Show different hints every minute (cycle through 3-4 variants).

### 20. Agent Elapsed Time Only Shows For Active Agents
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:146-157`
- **Priority:** P3 (minor polish)
- **What:** Elapsed time display (e.g., "Keaton (streaming, 3s)") only shows for active agents. But users might want to know how long the *last* agent took. No historical performance info.
- **Fix:** Show last completed time in dimColor: "Keaton (idle, last: 5s)". Or only for compact mode to save space.

### 21. No Indication of Concurrent Agent Operations
- **Where:** `packages/squad-cli/src/cli/shell/components/AgentPanel.tsx:143-159`
- **Priority:** P2 (affects multi-agent dispatch understanding)
- **What:** When coordinator dispatches to 3 agents in parallel, AgentPanel shows all 3 as active. But user doesn't know they're running in parallel vs sequentially. No visual grouping.
- **Fix:** Add subtle grouping: "🔄 Parallel dispatch:" header, then list agents below. Or show "3 agents working" with count badge.

### 22. Missing Error Recovery Guidance
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:136-142`
- **Priority:** P1 (happens when SDK fails)
- **What:** If SDK disconnects, App shows "SDK not connected. Check your setup." No next step. User doesn't know: run `squad doctor`? Restart shell? Check internet?
- **Fix:** Change to: "SDK disconnected. Try 'squad doctor' or check your internet connection. Restart shell to reconnect."

### 23. Welcome Banner Agent List Font Size Inconsistency
- **Where:** `packages/squad-cli/src/cli/shell/components/App.tsx:188-193`
- **Priority:** P3 (minor visual polish)
- **What:** Header shows agent names without emoji prefix in normal mode (line 190 just shows `a.name`), but AgentPanel shows `emoji + name`. In compact mode, header doesn't show agent list at all (line 196). Inconsistent visual vocabulary.
- **Fix:** Header roster should include emoji: `${a.emoji} ${a.name}` on line 190.

### 24. No Ctrl+A or Ctrl+U Support in InputPrompt
- **Where:** `packages/squad-cli/src/cli/shell/components/InputPrompt.tsx:59-128`
- **Priority:** P3 (power user feature)
- **What:** Standard terminal shortcuts (Ctrl+A = start of line, Ctrl+U = delete line, Ctrl+K = delete to end) are not implemented. Only handles backspace, arrow keys, history.
- **Fix:** Add Ctrl+A, Ctrl+U, Ctrl+K, Ctrl+D (delete char). Document as "Editor shortcuts" in /help.

### 25. Agent Activity Feed Not Clearing Stale Hints
- **Where:** `packages/squad-cli/src/cli/shell/components/MessageStream.tsx:135-142`
- **Priority:** P2 (clutter in long sessions)
- **What:** Agent activity feed shows real-time hints (e.g., "Keaton is reading file..."). But if agent activity hint is never cleared by SDK, it sticks around indefinitely. After 100 messages, user still sees old activity hints.
- **Fix:** Add timeout: if activity hint not updated for 30s, auto-clear it. Or show only the last N active agents.

---

## Summary

**Total gaps identified:** 25 (including known issues + new gaps)
- **P0 (Critical):** 3 gaps (#434 cancel, #403 stubs, #418 cold SDK feedback)
- **P1 (Significant):** 9 gaps (status inconsistency, /agents mismatch, system prefix, welcome hint, thinking label, team.md feedback, keyboard hints, error recovery, concurrent ops)
- **P2 (Polish):** 11 gaps (compact completion flash, header wrapping, exit message, /clear confirm, input buffering, separator consistency, duration calc, placeholder text, elapsed time, agent list emojis, activity feed cleanup)
- **P3 (Nice-to-have):** 2 gaps (fade timing, Ctrl shortcuts)

**Already being addressed in PRs:**
- #444 fixes: #400, #389, #417, #391 (4 gaps)
- #445 fixes: #402 (1 gap, routing discoverability)
- Cheritto's PR fixes: #407, #405, #404 (3 gaps)
- Fenster's PR fixes: #431, #429 (2 gaps)
- Kovash's PRs fixes: #434, #433 (2 gaps)
- Wainsgro's PRs fixes: #403, #397, #387 (3 gaps)

**Remaining open gaps not yet filed:** 7 new issues recommended for next wave.
