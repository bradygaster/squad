# Decision: Copy Polish — Human, Fun, Action-Oriented (Issue #338)

**Date:** 2026-02-24  
**Author:** McManus (DevRel)  
**Status:** Complete  
**Related Issue:** #338  
**Related PR:** #358  

## Problem
User-facing CLI messages were corporate, passive, and didn't guide users to their next action. Messages like "No squad directory found in repository tree or global path" were too long and technical. Help text included redundant verbose examples. Status output was overly structured.

## Decision
Rewrite every user-facing message in the CLI to be:
1. **Human** — Conversational tone, no corporate speak, no formal "Squad" overuse
2. **Fun** — Playful where appropriate (e.g., "Hmm, /foobar?" vs "Unknown command"), warm but not silly
3. **Action-oriented** — Every message guides users to their next step

## Changes Implemented

### cli-entry.ts (Help Text & Errors)
- Help subtitle: "Add an AI agent team..." → "Team of AI agents at your fingertips"
- Command descriptions simplified and action-focused:
  - init: "Initialize Squad" → "Create .squad/ in this repo"
  - upgrade: "Update Squad-owned files..." → "Update Squad files to latest"
  - triage: "Scan for work and categorize..." → "Scan issues and categorize"
  - loop: "Continuous work loop (Ralph mode)" → "Non-stop work loop (Ralph mode)"
  - hire: "Team creation wizard" → "Build a new team"
  - link: "Link project to remote team root" → "Connect to a remote team"
  - aspire: "Launch Aspire dashboard" → "Open Aspire dashboard"
  - doctor: "Validate squad setup" → "Check your setup"
- Error messages shortened: "Run: squad import <file>" (vs "Usage: squad import...")
- Triage message: removed "Squad" prefix from output
- Status output restructured:
  - "Active squad: repo" → "Here: repo (in .squad/)"
  - "Registered agents" label → "Size:"
  - Removed verbose "Reason:" explanations
- Final error hint: "Hint: Run 'squad doctor'..." → "Tip: Run 'squad doctor' for help..."

### commands.ts (Slash Commands)
- /help: Reduced 16 lines to 6. Removed "Available commands" header, cut verbose examples.
- /status: "Squad Status" → "Your Team:". Relabeled fields:
  - "Team root" → "Root"
  - "Registered agents" → "Size"
  - "Active" → "Active now"
  - "Messages" → "In conversation"
- /history: "Recent messages (10)" → "Last 10 messages:"
- /agents: "No agents registered" → "No team members yet"
- Unknown commands: "Unknown command: /X. Type /help for available commands." → "Hmm, /X? Type /help for commands."

### AgentPanel.tsx
- Empty state: "Type a message to start, or run /help for commands" → "Send a message to start. /help for commands."
- Removed " · all idle" status label (redundant when no agents are active)

### InputPrompt.tsx
- Placeholder hint: "@agent-name" → "@agent" (shorter)

### App.tsx
- Setup hint: "set up your team" → "get started" (more approachable)
- Condensed instructions: 2 lines → 1 line: "↑↓ history · @Agent to direct · /help · Ctrl+C exit"
- SDK error: "SDK not connected — agent routing unavailable" → "SDK not connected. Check your setup." (actionable)

### Tests
- Updated 9 assertions in cli-shell-comprehensive.test.ts to match new copy
- Updated 2 assertions in ux-gates.test.ts to match new copy
- All 125 tests pass

## Rationale
1. **Human tone** makes the CLI feel approachable and conversational
2. **Action-oriented** messages reduce user friction ("Run squad init to get started" vs "No squad found")
3. **Shorter** messages respect user attention; verbose help text encourages skimming
4. **Playful errors** ("Hmm, /X?") build personality without sacrificing clarity
5. **Consistency** across all components ensures a unified voice

## Examples of Good Rewrites
| Before | After | Why |
|--------|-------|-----|
| "No squad directory found in repository tree or global path" | "No team found. Run `squad init` to get started." | Actionable, human, short |
| "Error: Invalid configuration" | "Couldn't read your config. Run `squad doctor` to check it." | Sympathetic, helpful, specific |
| "Registered agents: 0" | "Size: 0" | Shorter, less technical |
| "Unknown command: /foobar. Type /help for available commands." | "Hmm, /foobar? Type /help for commands." | Conversational, warm, same info |

## Non-Breaking
- All changes are to user-facing output only
- No API changes, no code structure changes
- Fully backward-compatible—existing scripts/automation unaffected

## Deployment
- Ready to merge and deploy
- No documentation updates needed (copy IS the docs)
- Test suite validates UX quality gates (line width, remediation hints, command presence)

## Notes
- Followed existing Squad tone ceiling: no hype, no hand-waving, professional warmth
- Validated against ux-gates (width ≤80 chars, error hints, command presence)
- All help text tested for terminal overflow and readability
