---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

`squad health` no longer reports markdown table headers, separator rows or `{placeholder}` cells as unknown routing agents, accepts built-in support agents (Scribe, Ralph, Rai, Fact Checker) as routing targets, parses legacy charters with a UTF-8 BOM or a one-line `**Role:** … | **Expertise:** …` identity, reports charters without an identity block as a warning with a hint instead of a failure, and warns when a built-in agent directory has no `team.md` row. `squad upgrade` adds missing built-in rows to the roster idempotently (#2298, #2234, #1785).