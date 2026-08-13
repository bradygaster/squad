### 2026-03-26: Copilot git safety rules
**By:** RETRO (Security)
**What:** Added mandatory Git Safety section to copilot-instructions.md: prohibits staging the entire working tree with a bare-dot `git add` (i.e. `git add` followed by just `.`), requires feature branches and PRs, adds pre-push checklist, defines red-flag stop conditions.
**Why:** Incident #631 — @copilot used destructive staging on an incomplete working tree, deleting 361 files.
