---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix `squad init` re-run on an existing project leaving the `squad.agent.md` first-response greeting (`` `Squad v...` ``) stamped with a stale version even though the HTML comment marker and Identity `Version:` line were correctly refreshed. The greeting regex previously only matched the unresolved `{version}` placeholder, so once a real version had been stamped once, later re-stamps could no longer update it. Both `stampVersion` (squad-cli) and `stampVersionInContent` (squad-sdk) now also match an already-resolved valid SemVer literal, while leaving unrelated backticked `Squad v...` text untouched, making all three version locations safely and idempotently updatable on every re-init or upgrade.
