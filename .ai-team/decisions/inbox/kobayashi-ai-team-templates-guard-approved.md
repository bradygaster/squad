### 2026-02-16: `.ai-team-templates/` Guard Protection — APPROVED

**By:** Kobayashi (Git & Release Engineer)  
**Context:** Coordinator implemented changes to protect `.ai-team-templates/` after first audit  
**Requested by:** Brady — "yes they should be tracked, they should never hit main"  

**What:** Verified two changes to protect `.ai-team-templates/` runtime artifacts:

1. **Removed from `.gitignore`** — `.ai-team-templates/` entry deleted from lines 21-22. Now tracked in git on dev branches.

2. **Added to guard workflow** — `squad-main-guard.yml` now blocks `.ai-team-templates/**` from main/preview:
   ```javascript
   // .ai-team-templates/** — Squad's own templates, stay on dev
   if (f === '.ai-team-templates' || f.startsWith('.ai-team-templates/')) return true;
   ```

**Verification:**

✅ **Aligns with Brady's requirement** — `.ai-team-templates/` will be tracked on dev branches but blocked from main/preview  
✅ **Guard logic correct** — Same enforcement as `.ai-team/` (zero exceptions)  
✅ **Distribution safety maintained** — `.npmignore` excludes it (line 8), package.json "files" array doesn't include it  
✅ **Three-layer defense intact** — package.json (primary), .npmignore (secondary), guard workflow (tertiary)  

**Gap identified:**

- Documentation incomplete: neither `docs/scenarios/release-process.md` nor `CONTRIBUTING.md` mention `.ai-team-templates/` in guard workflow sections or protected files tables
- Guard workflow `push` trigger still missing (from first audit) — separate issue

**Why:** `.ai-team-templates/` is runtime artifact created by `index.js` during install (copies `templates/` → `.ai-team-templates/`). Should be visible in git for upgrade tracking but must never reach production branches. Changes implement correct enforcement.

**Verdict:** APPROVED. Changes are correct and functional. Documentation gap is minor and doesn't affect enforcement.
