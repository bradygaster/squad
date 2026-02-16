### 2026-02-16: Release Process Hardening — Guard and Gitignore Audit

**By:** Kobayashi (Git & Release Engineer)  
**Context:** Brady noticed `.ai-team-templates/` in `.gitignore` after preview branch cleanup  

**What:** Three findings from preview branch audit:

1. **Preview branch verified CLEAN** — Zero .ai-team/ files, zero team-docs/ files after coordinator cleanup. Distribution-ready.

2. **Guard workflow incomplete** — Currently triggers on `pull_request` only. Missing `push` trigger means direct pushes to main/preview bypass validation. Should trigger on BOTH PR and push events to catch all paths into protected branches.

3. **`.gitignore` entry incorrect** — Line 22 blocks `.ai-team-templates/` as "internal, not distributed". This is wrong:
   - Squad's actual templates live in `templates/` (tracked, shipped via package.json "files")
   - `.ai-team-templates/` is runtime artifact: `index.js` copies `templates/` → `.ai-team-templates/` in user projects during install
   - Entry added in commit 7909935 (2026-02-08) mistakenly classifying it as "internal planning"
   - Causes Squad's own repo to ignore dogfooding artifacts and tells users to ignore Squad-owned files that should be committed (makes upgrades invisible in git)

**Recommended fixes:**

```yaml
# Fix 1: Add push trigger to guard workflow
on:
  push:
    branches: [main, preview]
  pull_request:
    branches: [main, preview]
    types: [opened, synchronize, reopened]
```

```gitignore
# Fix 2: Remove from .gitignore (line 21-22)
# Delete these lines:
# Squad Squad templates (internal, not distributed)
# .ai-team-templates/
```

**Why:** Guard is defense-in-depth (package.json "files" is primary gate), but direct pushes create incident risk. The `.gitignore` entry serves no purpose — Squad's templates are already tracked in `templates/`. Users should commit Squad-owned files for upgrade visibility.

**Risk:** Low-medium. Distribution safety confirmed (nothing ships unless in package.json "files"). Guard fixes prevent coordinator manual-push incidents from repeating.
