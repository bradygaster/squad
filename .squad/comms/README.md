# PAO External Communications

> Phase 1: Draft-only mode with human review gate.

## Directory Structure

- `audit/` — Audit trail for every draft-review-post action
- `review-state.db` — SQLite-based atomic locking for concurrent review sessions (created at runtime)
- `templates/` — Response templates for common scenarios

## Workflow

1. PAO scans issues and discussions for unanswered items
2. PAO drafts responses using humanizer skill
3. PAO presents review table with confidence flags
4. Human reviews, approves/edits/skips each draft
5. Human posts approved responses
6. Every action logged to `audit/`

## Safety

- `pao halt` — freezes all pending drafts
- All responses require explicit human approval
- Audit trail is append-only
- SQLite locking prevents concurrent review race conditions
