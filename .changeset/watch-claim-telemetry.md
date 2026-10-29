---
'@bradygaster/squad-cli': patch
---

`squad watch` work-claim telemetry (ADR-002). With an excluding claim provider (`git-ref`), each round report adds a compact line such as `🔒 Claims (git-ref): won 2 · contended 1 · released 2 (completed 2)` when any claim counter is non-zero: acquired, contended (held elsewhere), unavailable, fenced, lost (not renewed before expiry), released by outcome (completed / cancelled / abandoned), and implausible-record takeovers. `squad watch --health` shows the totals since startup from the watch PID file, and the counters are emitted as OpenTelemetry counters `squad.watch.claims.*` (attributes `claim.provider`, `claim.outcome`) when `OTEL_EXPORTER_OTLP_ENDPOINT` or `SQUAD_TELEMETRY=1` is set. No issue numbers, hostnames, or actors are recorded. With `none`, watch output is unchanged.
