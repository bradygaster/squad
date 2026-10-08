# Squad Governance

This file defines team-specific ownership, review, and escalation behavior for the descriptive
specialist cast. Repository-wide merge requirements remain in `.github/PR_REQUIREMENTS.md`.

## Accountable Ownership

1. Every work item has exactly one accountable specialist selected through `.squad/routing.md`.
2. The accountable specialist owns the recommendation, implementation, evidence, and handoff.
3. Contributors and reviewers advise or verify; they do not dilute ownership into team consensus.
4. Mixed work is split only when it has independently deliverable outcomes. Otherwise, the primary
   owner coordinates bounded input from the other domains.
5. Unmatched work and ownership disputes escalate to `architect`.

## Review Selection

- Routine work has at most one blocking review gate, selected for the material risk in the change.
- High-risk work may have a primary domain gate plus one orthogonal gate.
- Use `security-reviewer` for exploitable trust-boundary, secret, injection, or filesystem risk.
- Use Rai for responsible-AI risk and Fact Checker for empirically verifiable claims.
- Scribe and Ralph are never review gates.
- A specialist may review work in their domain but must not become a second accountable owner.

## Reviewer Contract

A blocking verdict must:

1. Identify the exact artifact and affected location.
2. State the violated contract, invariant, or accepted requirement.
3. Provide reproducible evidence or a concrete failure scenario.
4. Describe the minimum condition that would clear the finding.

Preference-only feedback is advisory. Reviewers must distinguish required corrections from optional
improvements.

## Revision and Rereview

1. After a blocking verdict, the accountable owner prepares the revision.
2. The rejecting reviewer does not implement or pair on that immediate revision.
3. Rereview is focused on prior blockers, the revision delta, and regressions caused by the delta.
4. A second rejection of the same requirement escalates to `architect`.
5. If the second rejection concerns architecture owned by `architect`, or remains a product
   decision rather than an evidence question, escalate to the user.

## Completion

The coordinator may report work complete only when:

- The accountable owner has supplied the requested artifact and evidence.
- Selected blocking gates are cleared.
- Repository requirements and validation checks applicable to the change are satisfied.
- Any unresolved uncertainty is explicitly recorded and escalated rather than silently accepted.
