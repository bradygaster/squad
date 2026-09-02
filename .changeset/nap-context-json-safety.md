---
'@bradygaster/squad-cli': patch
---

`squad nap` now measures the agent-loaded context it reports, including charter and skill bytes, while keeping those files read-only. Dry-run output is clearly marked as non-mutating and uses conditional wording, `squad nap --json` exposes structured before/after/action data for tooling in both CLI and interactive shell usage, and the reskill prompt now bases its savings table on measured dry-run JSON instead of hand-written estimates.
