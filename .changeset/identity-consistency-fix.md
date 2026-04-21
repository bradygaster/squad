---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

fix(identity): cover all gh write commands and map reviewer roles to lead tier

- Template GIT IDENTITY block now uses session-level `export GH_TOKEN` pattern
  so every `gh` write command (review, comment, merge, edit, issue comment)
  uses the bot identity instead of falling through to the authenticated user.
- Added `code review`, `reviewer`, `watchdog` patterns to role-slug resolution
  so compound roles like "Code Reviewer & Watchdog" route to the lead tier.
- Fixes the inconsistency seen on kickstart PRs #986/#989/#990 where reviewer
  agents posted as the user instead of their bot identity.
