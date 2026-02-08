### 2026-02-09: Background agent timeout best practices documented
**By:** Kujan
**What:** Created `docs/platform/background-agent-timeouts.md` — a best practices doc covering the `read_agent` default timeout problem (30s default vs 45-120s real work), the response order issue (agents ending on tool calls), and the file-verification detection pattern. Key numbers: 30s default timeout, 45-120s real agent work time, 300s safe ceiling.
**Why:** Brady's "OHHHHH damn girl" moment — the 30s default was causing ~40% of agents to appear failed when they were still working. This doc captures what we learned the hard way so future builders (and future us) don't repeat it. Complements Proposal 015 mitigations already applied to `squad.agent.md`.
