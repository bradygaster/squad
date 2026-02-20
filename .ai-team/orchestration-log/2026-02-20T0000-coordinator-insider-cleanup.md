# Orchestration Log: Coordinator (Copilot) — Insider Cleanup & Branch Policy

**Agent:** Coordinator (Copilot)  
**Mode:** direct (earlier in session)  
**Task:** Clean insider branch content, create branch content policy, update guard workflow

## Files Read

- `.github/workflows/squad-main-guard.yml` (current guard configuration)
- insider branch file listing (164 forbidden files identified)
- Guard workflow logic and blocking rules
- Proposed branch content policy

## Files Produced

- `.ai-team/decisions/inbox/copilot-branch-content-policy.md` — Formalized branch content rules
- `.ai-team/decisions/inbox/copilot-directive-20260220-squad-consolidation.md` — Brady's consolidation directive captured

## Outcome

✅ **Complete**

- **Insider cleanup:** Removed 164 forbidden files from insider branch (`.ai-team/`, `team-docs/`, `docs/proposals/`)
- **Guard workflow:** Updated to block `docs/proposals/` (in addition to `.ai-team/`, `.ai-team-templates/`, `team-docs/`)
- **Branch content policy:** Documented in 3 sections:
  - ✅ Allowed on all protected branches (public files: templates, docs, workflows, tests, etc.)
  - ❌ Forbidden on protected branches (team state: .ai-team/, team-docs/, proposals)
  - 🔀 Branch-specific extras (insider branch allows insider-specific workflow)
- **Creation checklist:** Documented procedure for future branch creation from dev

## Impact

Established formal content governance for protected branches. Insider branch now clean and compliant. Guard workflow enforces policy automatically. This prevents future leakage of team state to public branches.
