---
'@bradygaster/squad-cli': patch
---

Add markdown-aware skill security scanner (Phase 1) to security-review.mjs. Scans .copilot/skills and .squad/skills markdown files for embedded credentials, download-and-execute patterns, and privilege escalation commands. Includes fenced code block suppression, inline code span suppression, and placeholder token detection. Zero false positives on existing 35 skill files.
