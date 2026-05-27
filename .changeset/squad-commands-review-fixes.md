---
'@bradygaster/squad': patch
'@bradygaster/squad-sdk': patch
---

Fix squad-commands skill routing and configuration for Copilot integration

- **templates.ts**: Correct destination path for squad-commands SKILL.md from `skills/squad-commands/SKILL.md` to `../.copilot/skills/squad-commands/SKILL.md` to match other built-in skills
- **init.ts**: Add `'squad-commands'` to MANIFEST_SKILL_NAMES array to include the skill in project initialization
- **squad-commands SKILL.md**: Convert triggers from YAML list to inline array format and remove generic triggers ("help", "how do I") that conflict with other skills; retain: "squad commands", "what can squad do", "show me squad options", "slash commands"
- **Template sync**: Regenerate all mirrors via sync-templates.mjs to propagate routing updates to .copilot and .squad templates
