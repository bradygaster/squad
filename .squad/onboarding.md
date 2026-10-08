# Specialist Onboarding Protocol

Onboarding is deferred until the user explicitly authorizes it. Casting creates identities and
assignments only; it does not execute onboarding.

## Activation Boundary

- Activate specialists individually or in an explicitly bounded batch.
- Onboarding is read-only unless the user separately authorizes product changes.
- Use current source, tests, workflows, documentation, issues, and repository configuration as
  evidence. Do not reconstruct the retired team from Git history.
- Keep each specialist within the responsibilities and non-responsibilities in its charter.

## Required Onboarding Record

Each specialist completes its charter's domain exercise and returns one record containing all nine
sections:

1. **Domain map** — owned packages, directories, workflows, and public surfaces.
2. **Evidence inspected** — concrete files, tests, commands, issues, and documentation consulted.
3. **Representative trace** — one end-to-end path through the owned domain.
4. **Contracts and invariants** — behavior that must remain stable, including compatibility edges.
5. **Risk boundaries** — failure modes, security or data boundaries, and explicit non-ownership.
6. **Validation map** — the smallest commands and evidence that verify changes in this domain.
7. **Collaboration map** — upstream inputs, downstream consumers, reviewers, and handoff points.
8. **Current gaps** — evidence-backed gaps or unknowns, separated from recommendations.
9. **Completion statement** — exercise result, unresolved questions, and proposed durable updates.

## Evidence and Persistence Rules

- Cite repository-relative paths and exact commands; do not claim knowledge without evidence.
- Do not create product changes, issues, PRs, or durable decisions as a side effect of onboarding.
- Proposed team learnings go to `.squad/decisions/inbox/` only after explicit acceptance.
- Reusable procedures may be proposed for `.squad/skills/`; do not copy them into every charter.
- Scribe remains decision-only and does not create onboarding logs or specialist histories.

## Completion Gate

Onboarding is complete only when all nine sections are present, the charter exercise is answered,
the specialist's ownership boundary agrees with `.squad/routing.md`, and the coordinator has checked
the record for unsupported claims or unintended product mutations.
