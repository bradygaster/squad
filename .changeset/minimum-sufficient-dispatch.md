---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Replace the coordinator's eager fan-out doctrine with minimum-sufficient dispatch. `squad.agent.md` and `routing.md` now encode one primary agent by default, a second agent only for an independent concern or a required reviewer, a hard cap of 2 domain agents per request and 3 in flight, no speculative or anticipatory agents, sync-vs-background chosen from the actual dependency rather than a background default, and explicit stop conditions. Fast dispatch and true parallelism for provably independent work are preserved.
