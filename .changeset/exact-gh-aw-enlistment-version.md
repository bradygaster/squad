---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Make public Squad gh-aw enlistment prove exact compiler version `v0.89.22`,
cleanly reinstall the pinned extension on mismatch, and stop before generating
repository artifacts when the supported version cannot be verified.
