---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Align the shipped reviewer-protocol and Ralph dispatch behavior with minimum-sufficient dispatch.

The coordinator template's embedded Reviewer Rejection Protocol no longer mandates lockout on every rejection or a third-agent revision cycle. It now encodes the current authority: lockout applies only to substantive rejections; nits (<5 changed LOC, non-blocking, no logic/security/API change) are fixed in the same PR with no lockout; review is capped at two passes; Pass-2 disagreement routes to a single Flight arbitration; deadlock is only reachable after arbitration. The shipped `reviewer-protocol` skill templates were stale mirrors of the retired rule and now match the authoritative skill.

`squad watch --execute` and the shipped `ralph-instructions.md` no longer tell Ralph to spawn an agent for every actionable issue. Ralph now works the highest-priority actionable items within the team's dispatch caps — max 2 active domain agents per request, max 3 tasks in flight, max 1 in-flight task per agent, no speculative work — and queues the rest. Ralph itself remains exempt from the caps; the domain agents it spawns are not.

Published docs on parallel execution and the reviewer protocol were rewritten from eager fan-out to minimum-sufficient dispatch, preserving genuine parallelism for provably independent work.
