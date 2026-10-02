---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Prevent edited issue and comment events from replaying unchanged embedded `/squad` commands, require dual-principal repository authorization for `/squad revoke-improvement`, and ignore unauthorized revocation comments during live approval revalidation.
