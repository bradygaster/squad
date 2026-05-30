---
"@bradygaster/squad-cli": minor
---

`squad init` now offers to add @copilot as a team member (#1147). When run interactively it prompts "Add @copilot as an autonomous team member?"; answering yes adds the @copilot roster entry and `.github/copilot-instructions.md` inline. New `--copilot` / `--no-copilot` flags skip the prompt for non-interactive use, and non-interactive runs skip silently (unchanged behavior).
