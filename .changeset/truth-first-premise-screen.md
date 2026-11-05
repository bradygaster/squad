---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

Align coordinator and Fact Checker templates on bounded evidence checks, clear uncertainty, and selective review activation.

SquadClient now buffers outgoing text by default and automatically reviews substantive drafts in a separate tool-disabled session. Reviews bind the exact draft and retrieved tool-result provenance; at most one correction is reviewed before a bounded, honest handoff. This changes sendMessage to await validated completion, suppresses raw text/reasoning deltas, and makes getMessages return locally delivered replies rather than the unreviewed transcript. Tool/usage events remain observable. This covers SquadClient create/resume paths, not raw Copilot SDK clients or native host delivery, and is an evidence-scoped review rather than a guarantee of factual truth.
