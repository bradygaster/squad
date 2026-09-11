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

## SCOPE

- Activate when auditing coordinator dispatch compliance or consuming captured DispatchGuard verdicts.
- Allowed targets: the runtime-owned ledger input, any caller-managed verdict file under
  `.squad/orchestration-log/`, and the documented hook contract that emits verdict JSON.
- Exclusions: product implementation, committing runtime audit files, or replaying stale verdicts as if they were live.

## Patterns

- Write the runtime-only ledger JSONL file at
  `.squad/orchestration-log/ledger-{SESSION_ID}.jsonl`. If an invoking flow wants a persistent
  verdict stream, it must capture the hook's stdout and append each emitted JSON verdict to
  `.squad/orchestration-log/verdicts-{SESSION_ID}.jsonl`; never commit either file.
- The coordinator/runtime owns creation and append-only updates to the input ledger. The caller
  must supply the current per-turn ledger input and track which turn is being audited; the hook
  does not discover or write that ledger. The audit hook consumes that caller-provided ledger
  input and emits a verdict; the repository does not create a verdict ledger on the hook's behalf.
  The invoking caller owns stdout capture and persistence of verdicts.
- Run the PowerShell audit hook on Windows and the Bash hook on Linux/macOS. Preserve their
  semantic parity and test both implementations against shared fixtures.
- The hook is invoked per turn and emits one JSON verdict object to stdout per invocation. Audit
  each unaudited ledger turn once, then stop when there are no new turns to audit or the hook
  reports an audit error.
- A work monitor consumes captured verdicts or live hook output; it does not rerun the audit.
  Surface `warn` without blocking, pause and alert on `block`, and treat `indeterminate`
  according to the active enforcement mode.
- A consumer must surface or log a verdict of `error` as an audit failure, must not treat it as
  compliance or a passing result, and must follow the active enforcement policy.
- If the hook reports `no_ledger`, distinguish "no input ledger was available" from compliance.
  Treat `indeterminate` as unknown under the active enforcement mode; never coerce either result
  to `pass`.
- After the caller writes a captured verdict, refetch the exact verdict file and verify the
  expected JSON line before handing it to a monitor. Stop on a mismatch.
- Use the hook’s JSON fields and exit-code contract from `.squad/hooks/README.md`; do not infer
  compliance from a human-readable summary or describe stdout capture as already wired up when it
  is still the caller's responsibility.

## STOP CONDITIONS

- Stop if the platform audit hook is unavailable or returns an audit error.
- Stop if the hook contract cannot be validated from `.squad/hooks/README.md`.
- Stop the monitored queue when a live verdict is `block` until a coordinator acknowledges it.
- Stop if the ledger owner or caller responsible for verdict persistence is unknown.

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
