---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add fact-checker as a built-in agent role (#789)

- New `fact-checker` role in the engineering role catalog (emoji: 🔍, category: quality)
- Charter template at `templates/fact-checker-charter.md` with verification methodology
- Added to `AGENT_TEMPLATES` for init scaffolding
- Template manifest entry for init/upgrade distribution
- Routing patterns: fact-check, verify, validate, audit, double-check, hallucination, devil's advocate
