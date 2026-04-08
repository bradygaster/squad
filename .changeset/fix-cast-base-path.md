---
'@bradygaster/squad-cli': patch
---

Fix cast command passing wrong base path to LocalAgentSource — used repo root (cwd) instead of .squad/ dir to prevent double-nested .squad/.squad/agents/ lookup
