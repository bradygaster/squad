---
"@bradygaster/squad-cli": patch
---

Fix #1314: ship `ralph-instructions.md` template for `squad watch --execute`

The `.squad/ralph-instructions.md` escape hatch used by `squad watch --execute`
had no canonical template, no documentation, and was never created by `squad init`
or `squad upgrade`. This left users who discovered the code path inventing their
own format with no contract or safety guidance.

This patch promotes the escape hatch to a documented feature:

- Adds `packages/squad-cli/templates/ralph-instructions.md` — a comment-documented
  stub that explains the override format, trust implications, and the stable contract
  (what CAN vs CANNOT be customized via this file).
- Registers it in `TEMPLATE_MANIFEST` as a user-owned entry
  (`overwriteOnUpgrade: false`) so `squad init` and `squad upgrade` install it
  without clobbering user customizations. The destination path
  (`ralph-instructions.md` under `.squad/`) exactly matches the `existsSync` lookup
  in `execute.ts`.
- Adds three regression tests in `init-upgrade-parity.test.ts`: install on init,
  non-overwrite on upgrade (preservation), and install-when-missing on upgrade.
- Adds one new test in `watch-capabilities.test.ts` asserting the `existsSync`
  path includes the correct `.squad/ralph-instructions.md` segment derived from
  `teamRoot`.

Closes #1314
