---
"@bradygaster/squad-sdk": patch
---

Make orphan-backed state appends compare-and-swap against the exact ref snapshot used to build each appended value, preserving concurrent audit entries.
