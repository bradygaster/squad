---
'@bradygaster/squad-cli': patch
---

Replace hardcoded state artifact lists with dynamic directory scanning in externalize/internalize, preventing silent orphaning when new `.squad/` artifacts are added.
