# Squad GitHub Work Lifecycle Binding v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Binding identifier:** `squad-work-github/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** GitHub adapters exist, but the repository has no
versioned sanitized transcript corpus for deterministic provider mapping.

**Known deviations:** API-version evidence, composite state, CAS tokens,
multi-label handling, partial failure, and drift records are not emitted
uniformly.

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

The binding reserves `squad` and `squad:{member-id}`. Implementations must
ensure required labels exist before relying on them. Issue, pull request,
commit, branch, and check references must include repository identity.

Temporary safe-output references may be used during one transaction but must
resolve before the operation is considered successful.

## 4. State mapping precedence and composition

Bindings evaluate one provider snapshot and retain every observed condition,
then select one portable state by this precedence:

1. merged change -> `integrated`, or `done` when the linked issue has an
   explicit post-merge closure disposition;
2. authorized cancellation or closed unmerged change -> `cancelled`;
3. active dependency, authority, merge-conflict, or provider blocker ->
   `blocked`;
4. current-revision blocking review -> `changes-requested`;
5. failed or cancelled required check -> `checks-failed`;
6. current-revision independent approval plus passing required checks ->
   `ready`;
7. non-draft open pull request -> `needs-review`;
8. draft pull request or claimed workspace -> `in-progress`;
9. exactly one accountable owner label -> `assigned`;
10. otherwise -> `untriaged`.

Thus an open pull request with changes requested, failing checks, and a
dependency blocker maps to `blocked`, while the review and check conditions
remain in evidence for deterministic recovery. Clearing the blocker recomputes
the snapshot and yields `changes-requested` before `checks-failed`.

Multiple distinct `squad:{member-id}` labels are an ownership conflict, not
first-label-wins behavior. Duplicate copies of the same label collapse to one
condition. Draft pull requests remain `in-progress`. A closed unmerged pull
request is `cancelled`, never `integrated`.

## 5. Review and merge authority

GitHub review state alone does not prove reviewer independence or lockout; the
governance evidence record supplies that proof. Branch protection, rulesets,
actor permissions, and merge queue policy remain GitHub authority and must be
checked at execution time.

## 6. Revision tokens, idempotency, and stale writes

The portable observation token is the digest of a canonical provider snapshot
containing repository node ID, issue node ID and `updated_at`, pull-request node
ID and `updated_at`, head SHA, base SHA, review-decision snapshot, required-check
snapshot, owner-label set, dependency-blocker set, and ruleset observation.
Transport ETags may optimize reads but do not replace this token.

Every mutation supplies the expected snapshot digest and an idempotency key.
Immediately before mutation, the binding re-reads all fields used by the
operation. A digest mismatch returns `conflict` with the fresh snapshot and no
further mutation. A stale head SHA specifically returns `stale-revision`.
Creation retries search the exact recorded mapping before creating a resource.
Merge retries recognize an already merged pull request as the original result.
The same idempotency key with a different request digest is invalid.

## 7. Rate limits, partial failure, and provider drift

Missing labels, inaccessible repositories, rate limits, secondary limits,
ruleset denial, stale head SHA, merge conflicts, unresolved temporary
references, partial issue creation, and webhook reordering are distinct
failures. A binding does not silently treat label creation or authentication
failure as success.

Rate-limit evidence records the limit class, observed status and headers,
provider request ID, retry-after or reset time, and whether any mutation
occurred. Automatic retry is allowed only for an idempotent operation within
the declared retry budget. Secondary-limit responses without a safe retry time
remain blocked.

A multi-step operation records each attempted provider mutation and its result.
If a later step fails, the result is `partial-failure` with completed
references, uncompensated effects, and an exact resume boundary. It is never
reported as success. Compensation is a new authorized operation.

Unknown enum values, removed fields, changed ruleset behavior, or a snapshot
that cannot be represented produce `provider-drift`. Read-only diagnostic
display may continue, but mutations fail closed until the binding's supported
provider range is revalidated.

## 8. Versioned provider assumptions and references

This draft assumes GitHub REST API version `2022-11-28`. GraphQL field names and
`gh` transport behavior are informative provider observations only; they are
not normative evidence for this non-claimable binding. A future executable
binding is expected to publish exact supported API versions and observation
dates. An unavailable version is expected to return
`unsupported-provider-version`; a changed field, enum, mutation, or ruleset
behavior is expected to return `provider-drift` and fail closed for mutation
until revalidated.

The GraphQL field observation was reproduced on 2026-09-25 with this schema
introspection query:

```graphql
query SquadBindingSchemaObservation {
  issue: __type(name: "Issue") {
    fields { name }
  }
  pullRequest: __type(name: "PullRequest") {
    fields { name }
  }
}
```

The relevant field catalogs are
[GitHub GraphQL `Issue`](https://docs.github.com/en/graphql/reference/objects#issue)
and
[GitHub GraphQL `PullRequest`](https://docs.github.com/en/graphql/reference/objects#pullrequest).
This observation establishes reproducibility of field discovery only; it does
not establish snapshot atomicity, transition semantics, or conformance.

GitHub API versions and this binding version are independent. Namespaced labels
and evidence fields round-trip. Issue bodies and comments are untrusted input.
Tokens, authorization scopes, private check logs, and secret values must not be
copied into portable records.

Normative provider assumptions for a future binding are the version-header
contract in
[GitHub REST API versioning, "Specifying an API version"](https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2022-11-28#specifying-an-api-version)
and the documented pull-request review states in
[REST Pull Request Reviews, "Create a review"](https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#create-a-review-for-a-pull-request).
The webhook retry and ordering discussion in
[GitHub Webhooks, "Best practices for using webhooks"](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
is informative because delivery policy is not itself a portable state
transition.

## 9. Language-neutral example

```json
{
  "profile": "squad-work-github/v0.1",
  "workItem": "github:bradygaster/squad#2069",
  "change": "github:bradygaster/squad!2078",
  "head": "c03ba950",
  "state": "needs-review"
}
```

## 10. Promotion criteria

Publish a provider-binding manifest with deterministic sanitized transcripts
for label provisioning, zero/one/multiple owner labels, draft and ready pull
requests, simultaneous blocker/review/check conditions, exact snapshot tokens,
stale writes, check recovery, lockout evidence, merge conflict, already-merged
retry, closure, primary and secondary rate limits, partial failure, drift, and
reordered webhook events. Transcript fixtures must omit credentials, private
logs, authorization headers, and personal data.
