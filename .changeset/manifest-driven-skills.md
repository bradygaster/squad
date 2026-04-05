---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

fix: use TEMPLATE_MANIFEST to drive skill installation instead of wholesale directory copy

Both sdkInitSquad() and syncAllSkills() previously copied the entire templates/skills/
directory, ignoring the curated 8-skill subset declared in TEMPLATE_MANIFEST.
This meant all 37+ template skills shipped on every init/upgrade, and
overwriteOnUpgrade was never consulted.

Now both code paths iterate TEMPLATE_MANIFEST entries:
- init (SDK): only the 8 manifest skills are copied on first init
- upgrade (CLI): syncAllSkills() reads manifest entries, respects overwriteOnUpgrade

Fixes #833
