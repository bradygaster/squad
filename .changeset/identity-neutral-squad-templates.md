---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Make shipped Squad templates, build inputs, CI policy, and issue-routing
automation independent of the repository's current team state so teams can be
re-cast without changing package artifacts or required checks. Product-owned
skills now have one exact canonical set, while live-team tests and stale
cast-specific configuration are removed.
