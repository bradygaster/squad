---
'@bradygaster/squad-sdk': patch
---

Fix history-shadow section parsing: replace the invalid `\Z` regex anchor so terminal sections are found (no duplicate `## References` header) and a blank line is kept before the next section.
