---
"@bradygaster/squad-cli": minor
"@bradygaster/squad-sdk": minor
---

Squad coordinator now scans all 5 project skill directories: Copilot CLI's 3
official project paths — `.github/skills/`, `.claude/skills/`, `.agents/skills/`
(per https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
— plus Squad's existing conventions `.squad/skills/` and `.copilot/skills/`.
Precedence: `.squad/skills/` > `.copilot/skills/` > `.github/skills/` >
`.claude/skills/` > `.agents/skills/` (dedup by directory name). Personal
paths (`~/.copilot/skills/`, `~/.agents/skills/`) are deliberately excluded
from explicit routing — Copilot CLI injects them ambiently. This closes a gap
where skills placed in `.github/skills/` (a common location alongside other
`.github/` tooling) were loaded by Copilot CLI but invisible to Squad's
coordinator-attached skill-aware routing.
