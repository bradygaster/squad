---
"@bradygaster/squad-cli": minor
---

feat: add squad-commands skill for in-chat command discovery

Adds a categorized menu skill (`skills/squad-commands/SKILL.md`) that the
coordinator reads when the user asks "squad commands", "help", or "what can
squad do". Also adds a routing row and greeting tip in squad.agent.md, and
registers the template in TEMPLATE_MANIFEST with overwriteOnUpgrade=true.

Also fixes pre-existing CI failures: adds Commit step to scribe-charter.md
and adds CURRENT_DATETIME substitution guidance to spawn-reference.md.
