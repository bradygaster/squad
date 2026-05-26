---
"@bradygaster/squad-cli": minor
---

feat: session init update check with extensible session-init reference

Adds a Session Init block to squad.agent.md that runs Step 1 (Update Check)
at session start. When a newer @bradygaster/squad-cli version exists for the
user's channel (latest/insider/preview), appends a notice to the greeting.
Respects SQUAD_NO_UPDATE_CHECK=1 kill switch.

Adds `.squad-templates/session-init-reference.md` with the full update-check
procedure (channel detection, hybrid cache strategy, greeting format) and
registers it in TEMPLATE_MANIFEST so `squad upgrade` keeps it current.

Also adds squad-version-check SKILL.md to .copilot/skills with internals
knowledge about version stamping and the npm registry probe mechanism.

Also fixes pre-existing CI failures: adds Commit step to scribe-charter.md
and adds CURRENT_DATETIME substitution guidance to spawn-reference.md.
