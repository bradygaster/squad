---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

Align coordinator and Fact Checker templates on bounded evidence checks, clear uncertainty, and selective review activation.

SquadClient now buffers outgoing text by default and automatically reviews substantive drafts in a separate tool-disabled session. Reviews bind the exact draft and retrieved tool-result provenance; at most one correction is reviewed before a bounded, honest handoff. Correction guidance asks the reviewer to retain the user's objective and authorized independent continuations, distinguish factual claims from scoped uncertainty, and keep classifications compact while removing unsupported claims or unauthorized adjacent actions. It also distinguishes a proof target or identifier in a label from an evidenced result or current fact. This changes sendMessage to await validated completion, suppresses raw text/reasoning deltas, and makes getMessages return locally delivered replies rather than the unreviewed transcript. Tool/usage events remain observable. This covers SquadClient create/resume paths, not raw Copilot SDK clients or native host delivery, and is an evidence-scoped review rather than a guarantee of factual truth.
