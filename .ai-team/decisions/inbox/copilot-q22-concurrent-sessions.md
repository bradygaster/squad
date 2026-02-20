### 2026-02-20: Q22 — Concurrent sessions / CopilotClient sharing
**By:** Brady (via Copilot)
**What:** Study SDK samples for concurrent session patterns — they exist. Default to single shared CopilotClient (option 1) if the samples support it. Don't over-design upfront — let the implementation surface the real constraints.
**Why:** User decision — pragmatic deferral. The current subprocess model may make this moot. SDK samples are the authoritative reference for what works.
