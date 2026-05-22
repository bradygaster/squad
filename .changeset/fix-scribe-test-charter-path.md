---
"@bradygaster/squad-cli": patch
---

fix(ci): update scribe-template test to read from scribe-charter.md

PR #1035 moved the Scribe section from `.squad-templates/squad.agent.md` into a standalone `.squad-templates/scribe-charter.md` but the CI test was not updated. This caused the `test` CI job to fail with "Could not locate Scribe task block in template".

Updated `test/ci/scribe-template.test.ts` to read from `scribe-charter.md` with new anchors and rewritten assertions matching the charter's actual numbered-step structure.
