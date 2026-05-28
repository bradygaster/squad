---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat(export): v008 quality-first viability gate

- Add viability pre-flight check that assesses whether a squad can produce a valuable coordinator export within the character budget
- Configurable character limit (default 30K, adjustable via `--char-limit`)
- Honest refusal messaging with `--force` escape hatch for squads that are too complex
- Fix roster parsing to filter out category headers, placeholder rows, and non-member entries
- Distill dispatch rules for large rule sets (>20 rules) by grouping routes to same target
- Thresholds scale with configured character limit
