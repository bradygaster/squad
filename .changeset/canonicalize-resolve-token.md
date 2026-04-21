---
'@bradygaster/squad-cli': patch
---

Canonicalize `resolve-token.mjs`: single source at `packages/squad-cli/scripts/resolve-token.source.mjs`, new `sync:resolve-token` generator propagates to the four template copies, and a CI guard fails PRs if the copies drift. Internal refactor — no runtime behavior change.
