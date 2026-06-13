---
'@bradygaster/squad-sdk': patch
'@bradygaster/squad-cli': patch
---

Prevent agent file collision: init, upgrade, and consult-mode now skip writing squad.agent.md when an exported coordinator (squad.md) already exists in .github/agents/
