---
'@bradygaster/squad-sdk': minor
---

Add the work claim contract from ADR 002 as `@bradygaster/squad-sdk/ralph/claims`: `WorkClaimProvider` (with declared `guarantees`), `WorkKey` and canonical `workKeyToString`, `ExecutorIdentity` with `resolveExecutorIdentity` (`SQUAD_MACHINE_ID` > capabilities machine > `SQUAD_POD_ID` > hostname, one `instanceId` per process), `NoopClaimProvider` (no exclusion, today's behavior), and `InMemoryClaimProvider` (single-process leases, epochs, expiry takeover, and handle fencing). `getPodId()` now accepts an optional `env` argument.
