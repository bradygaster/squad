---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Harden Squad Bootstrap provenance by requiring the exact default branch ref and
allowing trusted install commits to remain valid only while they are identical
to or ancestors of the live default branch tip.
