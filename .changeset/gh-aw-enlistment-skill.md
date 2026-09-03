---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Add the `gh-aw-enlistment` skill: an operationalized, safety-gated guide for enlisting a repository into Squad via GitHub Agentic Workflows (`gh aw`). It walks the supported install → strict-compile → validate → bootstrap-PR path, enforces an explicit safe-update allowlist (only the documented Squad secrets and `squad-init` action), keeps the default workflow token read-only, stages only documented surfaces, and never auto-merges.
