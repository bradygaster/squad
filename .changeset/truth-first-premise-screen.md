---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

Preserve the SDK's default evidence-scoped review for outgoing assistant responses.

SquadClient buffers outgoing text and reviews each exact draft against retrieved tool-result provenance before delivery. A single corrected draft may be reviewed once; if validation cannot complete, the unreviewed draft is withheld and an honest handoff is returned. Raw text/reasoning deltas are suppressed, while tool and usage events remain observable. This covers SquadClient create/resume paths, not raw Copilot SDK clients or native host delivery, and is an evidence-scoped review rather than a guarantee of factual truth.
