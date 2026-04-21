---
'@bradygaster/squad-cli': patch
---

Passes repo root to LocalAgentSource instead of .squad/ dir, preventing a double-nested .squad/.squad/agents/ lookup. In remote mode, passes paths.teamDir (team repo root) so agents are discovered from the correct location.
