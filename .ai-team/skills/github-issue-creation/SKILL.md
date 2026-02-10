# SKILL: GitHub Issue Creation for Squad

**Confidence:** high
**Source:** spboyer/slidemaker reference implementation (9 issues), Proposal 028
**Last validated:** 2026-02-10

## When to Use

When creating GitHub Issues from Squad planning artifacts (PRD decomposition, backlog items, proposals).

## Label Convention

Every squad-managed issue gets exactly two labels:
1. `squad` — base label (always present)
2. `squad:{agent-name}` — routing label matching the assigned agent (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`)

Create labels with `gh label create` if they don't exist:
```bash
gh label create "squad" --description "Squad-managed issue" --color "FBCA04"
gh label create "squad:verbal" --description "Assigned to Verbal (Frontend Dev)" --color "1D76DB"
gh label create "squad:mcmanus" --description "Assigned to McManus (Backend Dev)" --color "0E8A16"
gh label create "squad:fenster" --description "Assigned to Fenster (Tester)" --color "D93F0B"
```

## Issue Body Template

```markdown
## User Story
**As a** {persona}, **I want** {capability}, **so that** {benefit}.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

## Notes
- Squad member: {Name} ({Role})
- Primary work: {file paths the agent should touch}
- Dependencies: {"No dependencies — can start immediately" OR "Depends on #N"}
```

## Key Rules

- Acceptance criteria MUST use checkboxes (`- [ ]`) — they define "done"
- Agent metadata (Squad member, Primary work) MUST be in a Notes section
- Dependencies noted inline in the body, not via GitHub sub-issues (Phase 1)
- Use `gh issue create --label squad --label squad:{agent} --title "..." --body "..."` for creation
