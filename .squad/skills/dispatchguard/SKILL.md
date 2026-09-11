---
name: dispatchguard
description: Audit coordinator dispatch compliance and consume the resulting verdict stream safely
domain: squad-internals, orchestration
confidence: high
source: implemented dispatch-audit hooks, orchestration-log schema, and routing rules
---

## Context

Use this skill for the DispatchGuard producer and consumer roles. The coordinator records a
per-turn ledger; the audit hooks evaluate it; the work monitor consumes verdicts. The mechanism
observes dispatch compliance and does not replace normal routing.

## Scope

- Activate when auditing coordinator dispatch compliance or consuming the resulting verdict stream.
- Allowed targets: runtime-only ledger and verdict files under `.squad/orchestration-log/` plus the documented hook contract that produces them.
- Exclusions: product implementation, committing runtime audit files, or replaying stale verdicts as if they were live.

## Patterns

- Write runtime-only ledger and verdict JSONL files at
  `.squad/orchestration-log/ledger-{SESSION_ID}.jsonl` and
  `.squad/orchestration-log/verdicts-{SESSION_ID}.jsonl`; never commit them.
- Run the PowerShell audit hook on Windows and the Bash hook on Linux/macOS. Preserve their
  semantic parity and test both implementations against shared fixtures.
- Audit each unaudited ledger turn and append one verdict per turn. Stop when there are no new
  turns to audit or the hook reports an audit error.
- A work monitor consumes verdicts; it does not rerun the audit. Surface `warn` without blocking,
  pause and alert on `block`, and treat `indeterminate` according to the active enforcement mode.
- Use the hook’s JSON fields and exit-code contract from `.squad/hooks/README.md`; do not infer
  compliance from a human-readable summary.

## Stop conditions

- Stop if the platform audit hook is unavailable or returns an audit error.
- Stop if the hook contract cannot be validated from `.squad/hooks/README.md`.
- Stop the monitored queue when a live verdict is `block` until a coordinator acknowledges it.

## Examples

`.squad/templates/orchestration-log.md` defines the ledger schema. `.squad/hooks/README.md`
defines platform selection, verdict fields, and parity-test commands.

## Anti-Patterns

- Committing runtime ledger or verdict files
- Treating an audit error as a passing verdict
- Rerunning the audit from the consumer loop
- Continuing a blocked work queue before coordinator acknowledgement
