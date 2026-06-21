---
"@bradygaster/squad-sdk": patch
---

Fix: strip surrounding quotes from routing.md example phrases in `parseRoutingMarkdown`

`parseRoutingMarkdown` split the Examples cell on commas but never stripped the surrounding quotes, so a quoted example like `"unit tests"` was stored verbatim (quotes included). When `compileRoutingRules` / `matchRoute` later tokenized it, the quote characters glued onto the boundary words (`"unit`, `tests"`), producing regex patterns that could never match — so routing tables that used quoted examples silently routed every message to the fallback agent.

Leading/trailing quotes (`"`, `'`, `` ` ``) are now stripped from each example, so quoted and unquoted examples behave identically. Adds regression tests covering both the parse step and end-to-end `matchRoute`.
