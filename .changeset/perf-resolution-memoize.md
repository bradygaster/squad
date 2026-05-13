---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

perf(resolution): memoize squad-dir lookups; deduplicate squads.json reads to reduce filesystem I/O on repeated resolution calls
