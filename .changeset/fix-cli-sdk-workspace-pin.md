---
"@bradygaster/squad-cli": patch
---

Pin CLI dependency on squad-sdk to workspace:* so prerelease builds link the local SDK instead of pulling a stale published copy (fixes build/runtime crash). Closes #1405.
