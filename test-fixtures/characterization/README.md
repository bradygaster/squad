# Characterization test fixtures

All files in this directory are **hand-authored synthetic content**, safe for a
public repository. No real secrets, no real PII, no real customer data, no
snapshot of any user `.squad` state.

## Provenance

- `spawn-context-baseline.json`
  - Purpose: pins the byte-exact JSON output of
    `runMemoryValueBenchmark()` on the default fixture, so future changes to
    context assembly, the fixture, or the benchmark itself produce a visible
    diff.
  - Generated once by invoking `runMemoryValueBenchmark()` and serializing the
    result with `JSON.stringify(report, null, 2) + '\n'`, then committed after
    human review.
  - Regenerate by running the same invocation. Any diff must be reviewed
    intentionally and referenced in the PR description.

- `history-shadow/`
  - Reserved for any small golden snippets that the history-shadow
    characterization test needs to compare against. Only committed if the
    corresponding test uses them.

## Rules

- Never commit content sourced from a user private repo.
- Never commit content sourced from any real audit log, real memory store, or
  real conversation.
- Never introduce real credentials, real tokens, or real personal identifiers.
  Use obviously synthetic values (for example `ghp_ABCDEFGHIJKLMNOPQR12`,
  `hunter2extra`, `123-45-6789`) whose only role is to exercise the
  classification rules.
