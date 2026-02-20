### 2026-02-20T20:14: User directive — Q20 SDK pinning strategy
**By:** Brady (via Copilot)
**What:** Pin exact SDK version in package.json during Technical Preview (v0.1.x). Manual upgrade via `squad upgrade --sdk`. No auto-update, no floating ranges. Relax pinning (~ or ^) when SDK reaches stable (v1.0+).
**Why:** User directive — captured during open questions iteration. Technical Preview means even patches could break. Exact pinning gives full control over when breaking changes land.
