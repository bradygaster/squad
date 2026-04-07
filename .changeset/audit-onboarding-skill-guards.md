---
'@bradygaster/squad-cli': patch
---

Add defensive guards from architecture audit: (1) verify roster is populated after team creation before dispatching to coordinator, preventing empty-roster dispatch loops; (2) warn when `squad upgrade` overwrites customized built-in skills
