---
'@bradygaster/squad-sdk': minor
---

Add `GitRefClaimProvider` as `@bradygaster/squad-sdk/ralph/claims-git`: a distributed `WorkClaimProvider` (ADR 002) that stores each claim as a JSON record in an empty-tree commit at `refs/squad/claims/<sha1(work key)>` on a shared remote and decides every race with `git push --force-with-lease` compare-and-swap. Acquire, renew (fast-forward, epoch + 1), expiry takeover with skew margin, and release (CAS delete) never touch the working tree or index. The remote, ref namespace (including the `refs/heads/squad-claims/` fallback), clock, and git transport are configurable; the default transport spawns `git` with argument arrays and no shell.
