### 2026-02-20T19:22: User directive — Q14 Offline mode for unreachable sources
**By:** Brady (via Copilot)
**What:** If a remote agent/skill source is unreachable at startup: (1) If a cached version exists, use cached + warn the user. (2) If NO cached version exists, fail gracefully with a kind, friendly error message. Never hard-fail the entire startup. Never silently degrade.
**Why:** User directive — captured during open questions iteration. Consistent with aggressive caching strategy (Q10) — cache-first means most unreachable cases are covered. The "kind error" philosophy matches Squad's personality.
