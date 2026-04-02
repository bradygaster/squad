---
"@bradygaster/squad-cli": patch
---

fix(nap): account for separator newlines in decision archival budget

The budget calculation in archiveDecisions() did not account for the newline
separators added during content reassembly. This caused the final recentContent
to exceed DECISION_THRESHOLD even after archival. Fix adds reassemblyOverhead
and per-entry separator bytes to the budget calculation.

Closes #123