---
'@bradygaster/squad-sdk': patch
'@bradygaster/squad-cli': patch
---

Harden ADR-002 work claims after security review. Lease timing is bounded (30 s ≤ `ttlMs` ≤ 24 h, `skewMarginMs` ≤ 1 h, `ttlMs` > 2 × `skewMarginMs`) so the renew timer can never spin; `squad watch` rejects other values at startup and refuses to run work under them. Claim records with an impossible epoch or time, a non-empty tree, several parents, or a body over 64 KiB are taken over as expired with a warning naming the ref, and git output read from claim refs is capped. Claim commits use a fixed `squad-claims <squad-claims@invalid>` identity and a UTC date, and a hostname-derived `machineId` is published as a salted pseudonym. Fenced agents are killed with their whole POSIX process group, never after they have exited, and a `.squad/config.json` that does not parse now stops `squad watch` instead of silently disabling claims.
