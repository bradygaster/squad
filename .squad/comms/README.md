# PAO External Communications

> Phase 1: Manual-trigger, draft-only mode with human review gate.

## Directory Structure

- `audit/` — Runtime-only audit trail for every draft-review-post action (not committed to git; keep `audit/.gitkeep`)
- `review-state.db` — SQLite-based single-reviewer lease and draft state (created at runtime)
- `templates/` — Response templates for common scenarios
- `tests/` — Comms workflow and review-state coverage

## Workflow

1. Human manually triggers PAO to scan issues and discussions for unanswered items
2. PAO drafts responses using humanizer skill
3. PAO presents review table with confidence flags
4. Human reviews, approves/edits/skips each draft
5. Human posts approved responses
6. Every action is logged to runtime-only `audit/`

## Safety

- `banana` — freezes all pending drafts (safe word)
- Phase 1 is manual-trigger only
- All responses require explicit human approval
- Audit trail is append-only and runtime-only
- SQLite lease prevents concurrent review race conditions
