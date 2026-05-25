---
'@bradygaster/squad-cli': patch
---

Fix Windows spawn EINVAL in watch capabilities by adding `shell: true` to `execFile()` calls in monitor-teams, monitor-email, retro, and decision-hygiene capabilities. Add Copilot CLI preflight check to `squad doctor` and monitor capabilities so missing `gh copilot` extension is flagged early. Improve team hire confirmation UX to show member names inline with the prompt. (closes #920, closes #880, closes #1107)
