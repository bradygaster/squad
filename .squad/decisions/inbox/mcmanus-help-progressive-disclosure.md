# Help text: Progressive disclosure over overwhelming defaults

**When:** 2026-02-25
**Context:** Issues #419 and #424. `/help` was showing 9 lines—overwhelming for new users in a terminal shell.
**Decision:** Split help into default (4 lines essentials) and `/help full` (complete reference).

## Rationale

- **Cognitive load:** First-time users benefit from seeing the 3-5 most essential commands, not everything at once.
- **Self-serve:** Users who want details ask for them explicitly (`/help full`). This respects the user's agency.
- **Scannability:** 4 lines fit on one screen; 9 lines require scrolling or visual searching.
- **Consistency:** Matches CLI patterns like `git help` (intro) vs `git help --all` (everything).

## What changed

- Default `/help`: 4 lines (commands on 2 lines, callout to full help)
- `/help full`: 9 lines (everything, previous behavior)
- Terminal-width detection still applies to both

## Tone implications

- The callout "Type /help full for complete docs" is **not** a forced upsell. It's a quiet pointer.
- No marketing language ("discover more details!", "unlock advanced commands"). Just "if you need it, it's there."
- This pattern can apply to other shell commands later (e.g., `/status` vs `/status detailed`).

## Files changed

- `packages/squad-cli/src/cli/shell/commands.ts` — `handleHelp()` function

## PR

https://github.com/bradygaster/squad-pr/pull/438
