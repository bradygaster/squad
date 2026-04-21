---
'@bradygaster/squad-sdk': patch
'@bradygaster/squad-cli': patch
---

Auto-ignore identity secrets on `squad init` and `squad upgrade`. `.squad/identity/keys/` (GitHub App private PEMs), `.squad/identity/apps/` (per-role installation metadata), `.squad/identity/config.json`, and per-role token caches matching `.squad-*-token` / `.squad-*-token.json` (e.g. `.squad-hermes-token` holding `ghs_*` installation tokens) are now appended to `.gitignore` so they cannot be accidentally committed.
