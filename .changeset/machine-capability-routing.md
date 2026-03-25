---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat: Machine capability discovery and `needs:*` label-based issue routing

Added capability filtering to Ralph's watch command. Issues with `needs:*` labels
(e.g., `needs:gpu`, `needs:browser`) are only processed by Ralph instances whose
machine has those capabilities declared in `machine-capabilities.json`.

This enables multi-machine Squad deployments where different machines handle
different types of work based on their available tooling.

Closes #514