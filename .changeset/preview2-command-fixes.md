---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

2.0 preview command and migration fixes: `squad client list|add` lists configured host projections; the `agents/Rai` → `agents/rai` migration uses a two-step rename and `git mv` so the case change is recorded on Windows and macOS (templates now reference `agents/rai/`); the `undefined — previewing upgrade` header shows the project name; `squad update-check` flags caches older than 24h and shows the cache date; `squad_decide` writes to the active workstream inbox when one is resolvable and never truncates the summary slug below 60 characters; `squad doctor` reports `Mode: local` for a `teamRoot` that points at the same project and no longer triggers Node's DEP0190 warning (#2299, #2174).