---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

fix: monorepo subfolder support — never run git init (#939)

When `squad init` runs in a subfolder of a monorepo, place `.github/agents/squad.agent.md` at the git root and `.squad/` in the subfolder. Never run `git init`.
