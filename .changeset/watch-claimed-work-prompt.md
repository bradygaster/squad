---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

When `squad watch` runs with an exclusive claim provider (for example `--claims git-ref`), the `execute` and `fleet-dispatch` prompts now tell the agent that the listed issues are claimed for it: work only on those issues, do not pick up, self-assign, or take over other issues, and stop on an issue it cannot complete (the watcher releases the claim when the session ends). With `--claims none` (the default) the prompts are unchanged. The `ralph-instructions.md` template gains a matching "Claimed Work" section stating that claims are authoritative and assignees and labels are informational mirrors (ADR-002). Existing `.squad/ralph-instructions.md` files are user-owned and are not changed by `squad upgrade`.
