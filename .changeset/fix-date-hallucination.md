---
'@bradygaster/squad-sdk': patch
---

Fix date hallucination in spawned agents by injecting current ISO timestamp into prompts. Replace hardcoded 2025 dates in scribe-charter templates with dynamic placeholders.