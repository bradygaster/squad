# Fido history

Summarized by Scribe on 2026-08-22T18:25:00-07:00 because this history exceeded 15KB.
Full pre-summary history appended to `.squad/agents/fido/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed signals

- FIDO owns quality gate authority: distinguish regressions from pre-existing failures, verify assertions cover the actual artifact set, and keep EXPECTED_* arrays synchronized with filesystem reality unless tests dynamically discover content.
- `gh aw compile --strict` became a real CI gate for #1732 only after CI installed `github/gh-aw`; skipped tool-dependent tests are not gates.
- Post-#1777 dispatch health is structural: two dispatch_workflow entries can be expected when one is an empty probe and one is well-formed; classify well-formed vs malformed rather than asserting raw count.
- Community PR reviews repeatedly found scoped package-name mistakes in changesets and monorepo file-placement mistakes; treat both as common contributor risks.
- For docs/live `.squad/` tests, assert behavior and structure rather than specific agent names; rosters change.

## 2026-08-22 — #1831 review reusable techniques

FIDO independently reviewed and reproduced PR #1831 for #1793, approving with nits. Reusable quality techniques preserved:

- Mutation testing found that a truncating filename parser still returned `fail` and still counted `1 of 1` — so a status-only assertion would have passed it clean while reporting a filename that does not exist. Assert that a check *names* the offending artifact, not merely that it fails.
- CI structurally cannot verify a working-tree condition, because CI always starts from a fresh checkout. Such proofs require a local adversarial repro.