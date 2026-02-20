### 2026-02-20T20:11: User directive — Q19 SDK-free init
**By:** Brady (via Copilot)
**What:** `squad init` stays SDK-free by default (scaffolding only). Add a `--include-sdk` flag for users who want the full SDK included at init time. SDK loads only when `squad orchestrate` runs. Keeps the scaffolding path fast and lightweight.
**Why:** User directive — captured during open questions iteration. Aligns with lean ~5MB target (Q18). Init is one-time; don't penalize it with SDK weight.
