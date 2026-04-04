---
"@bradygaster/squad-cli": minor
---

feat(cli): Add `squad loop` command — prompt-driven continuous work loop

New `squad loop` command reads a `loop.md` file and runs it as a continuous work loop.
No GitHub issues required — the prompt is the work driver. Includes `--init` to scaffold
a boilerplate loop file, frontmatter validation, and composable capability flags.
