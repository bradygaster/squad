### 2026-02-16: Guard workflow push trigger added

**By:** Kobayashi  
**What:** Added `push` trigger to `.github/workflows/squad-main-guard.yml` to catch direct pushes to main and preview branches, not just PRs. Previously the guard only had `pull_request` trigger, allowing direct pushes to bypass validation. Also updated error message to mention `.ai-team-templates/` alongside `.ai-team/` and `team-docs/` as forbidden paths.  
**Why:** The guard's validation logic already handles both `pull_request` and `push` events (checks `context.eventName`), but the workflow trigger was incomplete. Without the push trigger, a maintainer could accidentally `git push origin main` with forbidden files and the guard would not run. The push trigger closes this gap. The error message update ensures users see all three protected path patterns (`.ai-team/`, `.ai-team-templates/`, `team-docs/`) in the failure message, matching what the validation actually blocks.
