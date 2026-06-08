# 1022: docs: add e2e template testing skill and CONTRIBUTING.md guide
State: MERGED
URL: https://github.com/bradygaster/squad/pull/1022
Head: bradygaster/tamirdresher/e2e-template-testing-skill

## What

Adds a skill and contributing guide section for validating template changes end-to-end.

### Problem

Changes to coordinator and agent templates (\.squad-templates/squad.agent.md\, \scribe-charter.md\, etc.) can't be validated by unit tests — they're prompts interpreted by an LLM at runtime. We discovered this gap during state-backend development (PR #1004), where we ran 12 manual E2E tests to validate template changes.

### Solution

1. **Skill file** (\.squad-templates/skills/e2e-template-testing/SKILL.md\) — Full workflow: build locally → create test repo → init squad → run sessions → verify git state → record verdict. Includes test matrix template, evidence collection format, tips, and anti-patterns.

2. **CONTRIBUTING.md section** — Quick-start version with pointer to the full skill.

### Files changed

- \.squad-templates/skills/e2e-template-testing/SKILL.md\ — new skill (canonical)
- \	emplates/skills/e2e-template-testing/SKILL.md\ — synced copy
- \packages/squad-cli/templates/skills/e2e-template-testing/SKILL.md\ — synced copy
- \packages/squad-sdk/templates/skills/e2e-template-testing/SKILL.md\ — synced copy
- \CONTRIBUTING.md\ — new section: Testing Template Changes (End-to-End)

### Testing

- \
pm run build\ ✅
- \
px vitest run test/builtin-skills.test.ts\ — 5/5 passed ✅
- \
px vitest run test/template-sync.test.ts\ — 149/149 passed ✅
- Template sync verified via \
ode scripts/sync-templates.mjs\ ✅
