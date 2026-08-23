### 2026-08-22: Roster provenance is certified by an emitting command (Team Guard Step TG-2), not by prose
**Date:** 2026-08-22
**Raised by:** Procedures
**Status:** Decided
**Issue:** #1812 (re-diagnoses #1784)

#### Context

`/squad plan activate` on fixture `aspiregregator-squad-e2e` (run `32471509974`) printed a
provenance sentence claiming it read the roster from `.squad/team.md` `## Members` → `Name`
column, and reported `lead, reviewer, devrel, security, docs`. The fixture's real cast is
`Keaton, McManus, Fenster, Hockney, Kint`. The five reported names are exactly the
`squad init --preset default` scaffold in
`packages/squad-sdk/src/presets/builtin/default/preset.json`. Two defects:

1. Activate bound against the hardcoded preset roster, not the repository's committed cast.
2. It **claimed provenance it did not have** — a wrong answer wearing a citation.

Downstream: at E4 the planner read `team.md` correctly and emitted the real names; activate
compared them against the hardcoded list, matched none, and applied **no** `squad:{agent}`
label. #1784's Condition 2 "passed" only because activate refused everything. **Refusal and
correct binding are indistinguishable from the outside** — the through-line of this workstream.

`workflows/squad.md` had already been hardened with bold, repeated prose instructing the agent
to read `## Members` from *this repository's* `team.md`, take the `Name` column verbatim, and
treat no other column as valid. That text was present; the defect happened anyway. A *declared*
requirement is not an *enforced* one.

#### Decision

Add **Team Guard Step TG-2 — Certify the Roster Set**: a bash block modeled on the existing
TG-1 line-444 `TEAM_PRESENT`/`TEAM_ABSENT` guard. It reads the **git-committed HEAD** revision
of `.squad/team.md` (`git show HEAD:.squad/team.md` — working-tree preset scaffolds are
invisible), finds the `Name` column of the `## Members` table **by header** (not by position),
and emits one lowercased `ROSTER_MEMBER: {name}` per data row — or a single
`ROSTER_UNREADABLE: {reason}` naming why (`absent from HEAD`, `no ## Members section`,
`no Name column in ## Members table`, `## Members has no data rows`).

Every downstream site that mints a `squad:{name}` label or binds an `Owner`/`Agent` value binds
**only** to TG-2's stdout. Because the summary can only reproduce `ROSTER_MEMBER:` lines the
command actually produced, **the provenance claim becomes true by construction**. On
`ROSTER_UNREADABLE:` the binder halts with the named reason — never a provenance sentence for a
read that did not happen, never a silent preset fallback.

#### Why structural, not more prose

The prose fix is the exact move that already failed here repeatedly, and is the anti-pattern
this workstream is clearing. TG-2's stdout is an **observable artifact of the run** that a test
can assert against; a prose directive's compliance cannot be observed. This is the same
distinction as TG-1's `TEAM_PRESENT`/`TEAM_ABSENT` — a requirement vs. a rule. Modeling on
PC-3 was explicitly rejected: PC-3's "exit non-zero on failure" is itself an unenforced prompt
directive (accepted limitation, #1824). TG-2 sits in the Team Guard family because the problem
**is** file provenance, not command-string normalization; modeling it on PC-* would have
manufactured a parallel structure rather than reusing the right one.

#### Why header-driven column detection, not `$2`

An earlier draft extracted a fixed column position. That silently binds the wrong data if a repo
authors `## Members` as `| Role | Name |` — it would emit the Role column, reproducing the exact
#1812 anti-pattern with a *true-looking* provenance claim. TG-2 instead scans the header row for
the cell whose trimmed text is `Name` and extracts that column; a table with no `Name` column
yields `ROSTER_UNREADABLE: no Name column in ## Members table` rather than a confident wrong
answer. (Mutation M2 proves this: pinning the column to position 2 reddens the header-order case,
naming the leaked `ROSTER_MEMBER: lead` / `reviewer`.)

#### Enforcement boundary — emission enforced, consumption directive (the good kind of unenforced)

TG-2 makes **emission** shell-enforced and assertable: the new test extracts the block and runs
it against real committed-HEAD git repos, proving the certified set is correct in isolation.
**Consumption** — the model actually binding only to `ROSTER_MEMBER:` lines — remains a prompt
directive. Nothing can compel the model to read its own emitted set. This is the *good* kind of
unenforced: like RETRO's hop-1 contract, the limitation labels itself. The defect was never an
unenforced directive; it was prose that read as a guarantee. This sentence stays in the record so
the boundary is named, not silent.

#### Postcondition `applied_labels ⊆ emitted_roster_members` is NOT reachable — named boundary

A machine-checked postcondition (a shell step asserting every applied `squad:{name}` label is a
subset of the emitted roster, failing loudly and naming the offending label) would close
acceptance 2a's second half by machine rather than by reviewer. It is **not reachable** under
gh-aw safe-outputs: the agent job runs read-only and writes `create-issue` requests to
`/tmp/gh-aw/safeoutputs/outputs.jsonl`; a **separate executor job** (with `issues: write`) applies
labels afterward. TG-2's stdout lives in the agent's bash sandbox and is not promotable to a
cross-job artifact the executor consumes; the only agent→executor channel is the model-filled
safe-output, which reintroduces the very model-memory trust the postcondition was meant to remove.
So emission is assertable in-run; consumption cannot be asserted at label-application time in this
architecture. Recorded as a boundary, not a silence — if safe-outputs later exposes the applied
set to a same-job shell step, this postcondition becomes worth its bytes and closes 2a fully.

#### CRLF / CR-strip could not be measured on this substrate — named boundary

TG-2's extraction carries `{sub(/\r$/,"")}` to normalize CRLF-authored `team.md` on Linux
runners. Mutation M8 (removing that strip) **could not be reddened** on the Windows git-bash test
host: `git show HEAD:.squad/team.md` there emits LF (git-for-windows normalizes CR out before awk
sees it, despite `core.autocrlf false`), and for regular GitHub tables the trailing pipe already
quarantines any CR into a post-pipe field that is never read. Two empirical probes (with/without
strip, on trailing-pipe and Name-last-no-trailing-pipe CRLF fixtures) produced identical clean
output. The strip is **retained as defense-in-depth** (correct and load-bearing on Linux runners
for irregular tables); its load-bearing behavior is **reasoned for Linux, not measured on
Windows**. The dedicated CRLF test was rewritten to assert the end-to-end parse invariant (clean
lowercased cast from a CRLF file) — which *is* reddenable (mutations M1/M4 flip it, naming the
offending `ROSTER_MEMBER:` output) — and no longer claims to prove the strip in isolation.

#### Prose removed — enumerated, each checked against `test/gh-aw-*`

The verbose per-site roster prose was superseded by TG-2 emission + short binders that point at
the certified set. Removed / compressed blocks: the plan `Owner/Agent binding rule` sub-steps
(a–d) → one binder paragraph; the plan `Owner` re-check reminder → one pointer; the accept
`squad:{owner}` minting paragraph → TG-2-bound sentence; the impl `Agent binding rule` working-
notes paragraph → TG-2-bound sentence; the impl `Agent` re-check reminder → one pointer; the
Check 10 four-step block → TG-2-bound restatement. Every test-pinned substring was verified to
survive: `Owner/Agent binding rule` (plan), `Agent binding rule` + `appears verbatim in the
`Name` column` (impl), `Name` column (all binders), the Check 10 `Never report a value as a
valid roster name unless …` sentence, and the no-backticked-role-token invariant across all five
skill blocks. All four existing gh-aw suites + the new one pass (172 passed / 13 skipped), which
confirms no pinned assertion was dropped. No prose was removed that a `test/gh-aw-*` test asserts
on.

#### Caller enumeration (FIDO requirement)

Every roster/owner/agent site across `workflows/` was enumerated:

**Minting / binding — all bound to TG-2's certified set:**
- `squad.md` accept `squad:{owner}` mint (§ "For each work item, create-issue")
- `squad.md` activate Label Pre-flight gate `squad:{agent}` (runs TG-2, false-provenance
  defenses, ≥1-label completeness rule) — governs the epic/task label declarations that follow it
- `squad.md` plan `Owner/Agent binding rule`
- `squad.md` impl `Agent binding rule` + its validation check
- `squad.md` Check 10 roster validation

**Pure consumers — NOT #1812 vectors (no independent roster derivation):**
- `squad-implement-worker.md` "Route work to the member named by the `squad:{member}` label" —
  consumes an already-certified label; reads `team.md` only for that member's charter/routing.
- `shared/squad.md` `squad init` cast-preservation guard (#1657) — existence check via
  `grep -q '^[|]'`, no name extraction for labels; aligned with the anti-preset-clobber intent.

No second minting path shares the defect. No compiled `.lock.yml` artifacts are committed
(gh-aw compiles at deploy time), so no regeneration is required.

#### Risk

Consumption remains model-trusted (see boundary above). If a future gh-aw version exposes the
applied-label set to a same-job shell step, add the subset postcondition to machine-check
acceptance 2a's second half. Until then, the ≥1-label completeness rule (activate must apply at
least one `squad:{agent}` label, else fail) is the guard that keeps "refused everything" from
masquerading as "bound correctly" — the failure mode that gave #1784 its false pass.
