---
name: dispatchguard
description: Audit coordinator dispatch compliance and handle emitted verdicts safely
domain: squad-internals, orchestration
confidence: high
source: implemented dispatch-audit hooks, orchestration-log schema, and routing rules
---

## Context

Use this skill for the DispatchGuard producer and consumer roles. The coordinator records a
per-turn ledger; the audit hooks evaluate it and emit one JSON verdict to stdout per invocation;
an invoking flow may capture those verdicts for a work monitor. The mechanism observes dispatch
compliance and does not replace normal routing.

## Scope

- Activate when auditing coordinator dispatch compliance or consuming captured DispatchGuard verdicts.
- Allowed targets: the runtime-only ledger file, any caller-managed verdict file under `.squad/orchestration-log/`, and the documented hook contract that produces the verdict JSON.
- Exclusions: product implementation, committing runtime audit files, or replaying stale verdicts as if they were live.

## Patterns

- Write the runtime-only ledger JSONL file at
  `.squad/orchestration-log/ledger-{SESSION_ID}.jsonl`. If an invoking flow wants a persistent
  verdict stream, it must capture the hook's stdout and append each emitted JSON verdict to
  `.squad/orchestration-log/verdicts-{SESSION_ID}.jsonl`; never commit either file.
- Run the PowerShell audit hook on Windows and the Bash hook on Linux/macOS. Preserve their
  semantic parity and test both implementations against shared fixtures.
- The hook is invoked per turn and emits one JSON verdict object to stdout per invocation. Audit
  each unaudited ledger turn once, then stop when there are no new turns to audit or the hook
  reports an audit error.
- A work monitor consumes captured verdicts or live hook output; it does not rerun the audit.
  Surface `warn` without blocking, pause and alert on `block`, and treat `indeterminate`
  according to the active enforcement mode.
- Use the hook’s JSON fields and exit-code contract from `.squad/hooks/README.md`; do not infer
  compliance from a human-readable summary or describe stdout capture as already wired up when it
  is still the caller's responsibility.

## Stop conditions

- Stop if the platform audit hook is unavailable or returns an audit error.
- Stop if the hook contract cannot be validated from `.squad/hooks/README.md`.
- Stop the monitored queue when a live verdict is `block` until a coordinator acknowledges it.

## Examples

`.squad/templates/orchestration-log.md` defines the ledger schema. `.squad/hooks/README.md`
defines platform selection, verdict fields, the per-invocation stdout contract, and parity-test
commands.

Recommended persistence pattern: after each hook run, the caller appends that stdout JSON object
to `.squad/orchestration-log/verdicts-{SESSION_ID}.jsonl` before handing the captured stream to
Ralph or another monitor. No repository-provided wrapper performs that append today.

## Anti-Patterns

- Committing runtime ledger or verdict files
- Treating an audit error as a passing verdict
- Rerunning the audit from the consumer loop
- Continuing a blocked work queue before coordinator acknowledgement
- Claiming verdict persistence is automatic when the current caller is not capturing stdout
