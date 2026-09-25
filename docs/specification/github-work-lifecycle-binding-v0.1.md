# Squad GitHub Work Lifecycle Binding v0.1

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Binding identifier:** `squad-work-github/v0.1`

**Maturity:** Experimental normative provider binding

**Depends on:** `squad-interop/v0.1`, `squad-work-lifecycle/v0.1`,
`squad-governance-review/v0.1`

## 1. Scope and non-goals

This binding maps portable work resources and transitions to GitHub issues,
labels, assignees, branches or worktrees, pull requests, checks, reviews,
merge, and closure. It does not standardize GitHub UI wording, GraphQL versus
REST versus CLI transport, repository merge policy, or organization rulesets.

## 2. Resource mapping

- `work-item` maps to an issue.
- accountable route maps to exactly one `squad:{member-id}` label; human
  assignees are provider authorization or notification, not portable ownership.
- `workspace` maps to a branch and optional local worktree.
- `change` maps to a pull request.
- `check` maps to a required status check or check run.
- `review` maps to review decision plus governance evidence.
- `integration` maps to the pull request merge commit or squash/rebase result.
- `closure` maps to issue closed state with an explicit reason.

## 3. Labels and references

The binding reserves `squad` and `squad:{member-id}`. Implementations MUST
ensure required labels exist before relying on them. Issue, pull request,
commit, branch, and check references MUST include repository identity.

Temporary safe-output references MAY be used during one transaction but MUST
resolve before the operation is considered successful.

## 4. State mapping

Open without accountable label is `untriaged`; labeled without workspace is
`assigned`; claimed branch is `in-progress`; open pull request is
`needs-review`; `CHANGES_REQUESTED` is `changes-requested`; failing required
checks is `checks-failed`; current-revision approval plus passing required
checks is `ready`; merged is `integrated`; issue closure after merge is `done`.

Draft pull requests remain `in-progress` unless an extension declares them
reviewable. A closed unmerged pull request is not integrated.

## 5. Review and merge authority

GitHub review state alone does not prove reviewer independence or lockout; the
governance evidence record supplies that proof. Branch protection, rulesets,
actor permissions, and merge queue policy remain GitHub authority and MUST be
checked at execution time.

## 6. Idempotency and concurrency

Mutation keys SHOULD be stored in issue or pull request evidence. Creation
retries MUST search exact recorded mappings before creating another resource.
Updates use current issue or pull request revision evidence when available.
Merge retries MUST recognize an already merged pull request as the original
successful result.

## 7. Failure semantics

Missing labels, inaccessible repositories, rate limits, secondary limits,
ruleset denial, stale head SHA, merge conflicts, unresolved temporary
references, partial issue creation, and webhook reordering are distinct
failures. A binding MUST NOT silently treat label creation or authentication
failure as success.

## 8. Versioning, extensions, security, and privacy

This draft assumes GitHub REST API version `2022-11-28`, GraphQL schema behavior
observed on 2026-09-25, and `gh` operations that map to those APIs. A conforming
binding MUST publish its exact supported API versions and observation date.
An unavailable version returns `unsupported-provider-version`; a changed field,
enum, mutation, or ruleset behavior returns `provider-drift` and fails closed
for mutation until revalidated.

GitHub API versions and this binding version are independent. Namespaced labels
and evidence fields round-trip. Issue bodies and comments are untrusted input.
Tokens, authorization scopes, private check logs, and secret values MUST NOT be
copied into portable records.

## 9. Language-neutral example

```json
{
  "profile": "squad-work-github/v0.1",
  "workItem": "github:bradygaster/squad#2069",
  "change": "github:bradygaster/squad!2074",
  "head": "71634fde",
  "state": "needs-review"
}
```

## 10. Conformance

Binding tests MUST cover label provisioning, assignment, draft and ready pull
requests, stale-head review, check failure, changes requested, lockout evidence,
merge conflict, already-merged retry, closure, and reordered webhook events.
