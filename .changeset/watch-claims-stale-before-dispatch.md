---
'@bradygaster/squad-cli': patch
---

`squad watch` work claims (ADR-002): never dispatch on a claim that went stale while the rest of the batch was being acquired. Claims are acquired one issue at a time, so a slow or unreachable remote could carry an early claim past its renew deadline (`expiresAt - skewMarginMs`) — or past the point where another watcher may take it over — before the agent started, and the agent briefly worked an issue another watcher held until its first renewal fenced it. `execute` and `fleet-dispatch` now renew such claims before dispatch and skip the issue when the renewal is fenced (counted as `fenced`) or fails (counted as `lost`).
