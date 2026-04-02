### 2026-03-26: CI deletion guard and source tree canary
**By:** Booster (CI/CD)
**What:** Added two safety checks to squad-ci.yml: (1) source tree canary verifying critical files exist, (2) large deletion guard failing PRs that delete >50 files without 'large-deletion-approved' label. Branch protection on dev requested (may need manual setup).
**Why:** Incident #631 — @copilot deleted 361 files on dev with no CI gate catching it.
