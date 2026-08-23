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
## 📌 Team update — 2026-08-22T19:42:25-07:00

Three-turn review of PR #1832 (issue #1824). 

**Pass 1 — APPROVE WITH NITS:** Reproduced all claims (mutation 1 & 2 load-bearing, injection-safe via env, acceptance test holds). Nits: HTML comment parsing, greedy last-token, 102 skip figure.

**Pass 2 — MERGE AFTER FIXES:** Adjudicated automated reviewer findings. Finding 2 BLOCKING: bare workflow_dispatch commands regress to loud failure (untested path). Finding 1 NON-BLOCKING but security-critical: assignment step left to LLM discretion. Finding 3 NON-BLOCKING real defect.

**Pass 3 — APPROVE:** Re-reviewed EECOM rework (commit 6e7628c5). PC-0 normalization fixes BLOCKING regression; all 6 dispatch modes resolve; mutations red-and-naming; CI green. PC-0 NR==1 leading-newline latent nit (unreachable via real producers, noted for follow-up).

**Pattern:** Test incomplete in isolation (dispatch path missed). Reviewer's domain context caught it. New coverage added in revision.

PR merged; issue closed.

## 📌 Team update — 2026-08-22T21:20:17-07:00

**Adversarial review of PR #1837 (Closes #1812, roster false-provenance).** VERDICT: APPROVE WITH NITS.

Confirmed all 7 mutations RED and naming input. Verified M8 (CR-strip) genuinely unreddable on Windows git-bash: CR lands in post-last-pipe field ($4), never read. Verified postcondition `applied_labels ⊆ emitted_roster_members` not shell-assertable: agent job has `issues: read`; labels applied by separate executor job via safe-output — confirmed from actual frontmatter L28–32, not reasoning. Both honesty claims verified by measurement.

Found **one real non-blocking gap at L1117**: Step 3 validator still named `.squad/team.md` while binder (L1111) and Check 10 both TG-2-bound. Adjudicated non-blocking (Check 10 is the authoritative gate); recommended merge as-is with tracked follow-up. Fixed by Procedures in `ab8649e3`.

Reusable technique: always verify architectural claims against actual file contents, not memory or reasoning. Proved `issues: read` from frontmatter bytes, not inferred from context.