---
"@bradygaster/squad-cli": patch
---

fix(coordinator): resolve externalized state, teamRoot, stale work, and cleanup loops

Fixes 4 P1 coordinator bugs where squad.agent.md would incorrectly enter Init Mode
in satellite/externalized repos (#1116, #1127), agents would work on stale/closed items
(#1125), and spawned agents would loop infinitely in post-work cleanup (#1067).
