---
"@bradygaster/squad-cli": patch
---

Add AW coordinator team context to `squad.agent.md` — injected on `squad cast`/recast/retire and `squad upgrade`. New `agent-context.ts` module derives specialist roles, routing hints, and capability boundaries from `team.md` and `routing.md`. All untrusted text is sanitized to prevent Markdown injection. Fixes #1608.
