### 2026-02-19: CLI vs VS Code Command Parity

**By:** McManus

**What:** Documentation now explicitly mentions both `/agent` (Copilot CLI, singular) and `/agents` (VS Code, plural) wherever users are directed to launch Squad. Updated 6 documentation files across scenarios and guides.

**Why:** Issue #93 reported confusion — users on the CLI see `/agent` but all docs say `/agents`. This creates friction at the critical first moment ("I can't find the command"). The fix is simple: be platform-aware. When instructing users to launch Squad, say "Type `/agent` (CLI) or `/agents` (VS Code)." This removes ambiguity and respects the fact that we ship on two platforms with different affordances.

**Files changed:**
- `docs/tour-first-session.md` — first-session walkthrough (critical UX)
- `docs/scenarios/existing-repo.md` — adding Squad mid-project  
- `docs/scenarios/mid-project.md` — onboarding late-stage projects
- `docs/scenarios/new-project.md` — new project setup (also critical)
- `docs/scenarios/private-repos.md` — private repo guidance
- `docs/scenarios/troubleshooting.md` — problem statement for agent discovery

**Platform context:** README.md and index.js already had correct dual-platform language (looks like this was partially addressed in HEAD). The fix ensures consistency across all scenarios and guides.

**Decision:** Explicit platform notation is clearer than implicit. We say "CLI" and "VS Code" in parentheses to make it unmissable. No need for fancy UI—just honest writing.
