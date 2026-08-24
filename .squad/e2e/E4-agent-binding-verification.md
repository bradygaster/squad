# E4 — Agent-Binding Verification (#1784, #1812)

> **Author:** Sims (E2E Test Engineer)
> **Written:** 2026-08-21, from the E3 long-path rehearsal
> **Status:** ✅ **EXECUTED 2026-08-21 (n=1) — result recorded below. Amended 2026-08-21 (post-run) for #1811 and #1812; re-run required for n=2.**

## Amendment log

| Date | Change | Reason |
|---|---|---|
| 2026-08-21 (initial) | Executed, PASS at n=1, two qualifications recorded | see result below |
| 2026-08-21 (post-run) | Phase 2 extended by one command (`plan activate`); new Phase 3e roster-provenance gate; contamination-table growth note; Condition 0 dual-role justification; `squad-e2e-runbook.md` citations replaced with self-contained text; scope-limitation section updated | #1811, #1812 — the n=1 PASS was structurally silent on the `plan activate` roster-read defect, and Condition 0's timing guarantee was undocumented |
| 2026-08-21 (review followup) | Two caveats rewritten to correctly describe fail-closed routing (empty comment / anchor-mismatch → `A: FAIL` → INCONCLUSIVE for #1812, not "scores green"); gate 3e (B) hardened against `gh api` fetch failure and empty-set collapse (SetEquals(∅,∅) → True); Phase 3c roster fetch guarded the same way; verdict-interpretation table gained a `(A) PASS, (B) INCONCLUSIVE` row | PR #1819 review by Flight + Coordinator — the caveats overstated the risk, the code understated one |
| 2026-08-21 (review followup, 2nd pass) | Phase 0b fixture-freshness gate hardened: added third `UNREADABLE` state so double-`gh` failure no longer collapses into MATCH via `$null -eq $null`; Phase 0c post-condition updated to require both "all four MATCH" *and* "none UNREADABLE"; Phase 0d fix-presence check guarded (the `REM` sub-check inverts against an empty string — `.Contains(x)` returns False, which is the pass condition) | PR #1820 review by Coordinator — I claimed "exactly one 3c exposure and it's fixed" without enumerating; ten `2>$null` sites in file, the fixture-freshness gate was the higher-severity one I missed. Enumerated all ten before this pass |
| 2026-08-21 (P0 + rule sweep) | **Phase 3b was structurally incapable of scoring** — `gh` has no `--arg` flag; the flag was consumed by `--jq` and `gh` exited 1 with empty stdout every run. The pass condition "every `squad:{x}` must be a lowercased roster Name" is universally quantified and **vacuously true over the empty set**, so a broken query would have written the passing values into the two `# dispositive` schema fields (`squad_devrel_present` / `squad_reviewer_present`). Rewrote the query to interpolate `$E4_START` in PowerShell, added an `$E4_START`-empty precheck (otherwise `select(.createdAt > "")` matches every issue and drags all 8 pre-existing contaminated issues into the FAIL evidence), added an `$LASTEXITCODE` + zero-row guard printing `3b labels extract: INCONCLUSIVE`, added an operator instruction to confirm rows returned (the guard Phase 3a already has), and stated that INCONCLUSIVE must not be recorded as `false` on the two dispositive fields. **House rule swept:** every `gh … 2>$null` call site in E4 (9 code sites: L395, L396, L448, L570, L588, L625, L649, L703, L716 in `cbf90813`; the L574 grep hit is a prose reference to the pattern, not a call — Flight's "10 sites" count included it) and E1 (2 code sites: L143, L147) is now followed by an explicit `$LASTEXITCODE` assertion. Null-guards test the symptom; the exit code tests the cause. Applied to cleared sites too — "cleared" meant *empty is readable by eye*, not *failure is detectable* | PR #1820 second-pass review (post-merge) by Flight — L625 was cleared as listing/echo but the pass condition below it is universally quantified over the returned rows, so the `--arg t` bug turned Phase 3b into a silent fail-open. This is a third instance of the "vacuously true over empty set" hazard already fixed at Phase 0b (`$null -eq $null`) and 3e (B) (`SetEquals(∅,∅)`). Also: **Do NOT retract or annotate the n=1 executed verdict at L24-60** — that PASS scored a different instrument (Condition 2's `labeled`-timeline-events query, which returned 15 events), not this broken 3b query. The exposure is prospective; the fix is prospective |

> ⚠️ **The n=1 PASS below scored the procedure that stopped at `plan implementation`.** The
> amended procedure (Phase 2 now includes `plan activate`; Phase 3 now includes a
> roster-provenance gate) has **not yet been executed**. Any claim about #1812 requires a fresh
> live run against the amended procedure — do not cite the n=1 record as evidence of the
> provenance gate's behaviour.

---

## ✅ Executed — 2026-08-21 · verdict PASS (n=1)

Run against fixture `bradygaster/aspiregregator-squad-e2e` (⚠️ **retired** — deleted 2026-08-24;
name kept because this block records what actually ran), seed issue **#22**,
`$E4_START` = `2026-08-21T09:18:32Z`. **8 gates, 8 green, zero interventions, ~55 min.**

> ⚠️ **Every issue number, run ID, and roster name in this block belongs to the retired fixture.**
> They are historical readings, not re-run inputs. A re-run must re-derive all of them against the
> current `$FIXTURE` (Phase 0). Reusing them would score a new run against a deleted repo's evidence.

| # | Condition | Result |
|---|---|---|
| 0 | ≥1 issue created by `activate` (excl. seed #22) | ✅ 15 squad-authored (#23–#37) |
| 1 | `Agent` column = verbatim roster names | ✅ **11/11**, zero role-derived tokens |
| 2 | No `squad:lead`/`devrel`/`reviewer` in timeline `labeled` events | ✅ 15 events, all `squad` |
| 3 | Activation summary reports missing-label prerequisite gap | ✅ reported verbatim |

> 🛑 **Condition 0 does three jobs, not one — evaluate it first (#1811).** It is a **liveness
> floor**, a **seed-exclusion census**, and — the reason it must come first — the
> **premature-read guard**. The #1784 measurement is a `safe_outputs` effect: **job 5 of 6**
> in the gh-aw pipeline (`pre_activation`, `activation`, `agent`, `detection`, `safe_outputs`,
> `conclusion`). `agent ✅` lands *before* the label state is written. Reading at that moment
> fails **in both directions**: a label census returns a **false RED** (the three pre-existing
> `squad:lead/devrel/reviewer` labels look like a fresh reproduction), and a timeline `labeled`
> query returns a **vacuous GREEN** (empty event list). Switching instruments does not help —
> the hazard is temporal, not instrumental. Condition 0 catches both because a premature read
> yields zero Squad-authored issues → INCONCLUSIVE → stop before 1–3 are scored. **Wait for
> all six jobs, including `conclusion`; `agent ✅` is not sufficient.** Do not refactor Condition
> 0 into "just a liveness floor" and move it later — it looks harmless because the guard is
> silent when it works.

Same-fixture control: **E3 produced `lead, lead, devrel` on this exact column**; E4 produced
`McManus, Keaton, Fenster, Hockney…`. One prompt change (#1789) between them.

> 🛑 **Scope bound.** Green means *"the `Agent` column is clean on one artifact, n=1, salience
> path."* It does **not** mean #1784 is retired — see the two qualifications below.

### 🔴 Qualification 1 — the roster read at `activate` is still wrong

The activation summary claims it read `.squad/team.md` `## Members` → `Name` and got
`lead, reviewer, devrel, security, docs`. **That file's Name column is
`Keaton, McManus, Fenster, Hockney, Kint`**, and `devrel`/`security`/`docs` do not appear
anywhere in it. The cited set is the generic **uncast** Squad role vocabulary and matches no
single file's Name column.

Consequently `activate` declared the *correct* Agent values "non-roster", and advises the
operator to *"recast the team or update the implementation plan"* — i.e. **to break the one part
of the pipeline that is working.** That advice is the operationally dangerous part.

**The defect is stage-local to `activate`.** `plan validate` in the *same walk*, 23 minutes
earlier, read the *same* file/section/column correctly:

> **Roster set (`.squad/team.md` → `## Members` → `Name` column):** `Keaton`, `McManus`,
> `Fenster`, `Hockney`, `Kint` — and Check 10 verified all four Agent values verbatim.

So this is not a wrong path, not a hardcoded default, and not a shared component. A working
reference implementation exists one stage earlier; the fix is to make `activate` do what
`validate` already does.

| Phase | E3 (pre-#1789) | E4 (post-#1789) |
|---|---|---|
| `validate` | `Agent assignments valid (cast Names) ✅ (lead, lead, devrel)` — **no roster enumerated**, no Check 10 ⇒ **false accept by omission** | roster echoed **correctly**, Check 10 verbatim ⇒ **true accept** |
| `activate` | minted `squad:lead` ×3 + `squad:devrel` | roster read **wrong** ⇒ **false reject** |

**#1789 fixed the implementation-plan column *and* the `validate` gate — both confirmed — and
left the `activate` roster read untouched.** File that separately from #1784.

> ⚠️ **Corrected claim.** An earlier draft asserted that with `create-label` enabled this run
> would have minted `squad:lead` again. **That is refuted.** `activate` applies what the plan
> hands it; E4's plan contains no role token, so there is nothing to mint. `create-label` is
> required for the *correct* behaviour, not what suppressed the defect. Condition 2's green is
> still structural — the structure is the roster mismatch, not the missing permission.

### Qualification 2 — the fixture cannot express a correct owner label at all

Absence of `squad:keaton` is **expected and correct**: the lock has zero `create-label`
references. Closing #1784's user-visible symptom needs an `issues: write` + `create-label`
workflow permissions change, **not** a prompt change. Separate from the deferred deterministic
enforcement item.

### 🟢 Free result — #1787 sibling-epic dispatch, first live observation

`plan program` produced the 4-sibling-epic shape #1787 had never had a fixture for. After
`activate`: **all 15 issues parent to root #22; every epic has 0 sub-issues.** The hierarchy is
flat, so **refill necessarily draws from the root, not the parent epic.** Corroborated by the
summary's own gap note that `parent` is wired for epic→root only.

Full evidence: `squad-e4-20260821/E4-RESULT.md` (operator's machine, out of repo).

---

## Original pre-execution framing (retained)

---

## ⛔ Read this before anything else

**Superseded by the executed result above (2026-08-21).** Retained because the reasoning still
governs any *re-run*. The bar below is the bar that was met.

State at time of writing:

| Item | State |
|---|---|
| Issue **#1784** — Owner/Agent binding fix ineffective live | **OPEN** |
| PR **#1787** — refill dispatch slots from root, not parent epic | **OPEN / unmerged** |

> **Nobody may claim #1784 is verified until this procedure runs green.**
> A structural fix (reading the diff and agreeing it looks right) is **not** verification —
> #1759 was structurally correct and still failed live, which is exactly what #1784 reports.
> Only a live run against a refreshed fixture counts.

**Do not run this until Procedures' fix for #1784 has merged to `dev`.** Firing early produces
a misleading result and burns fixture state.

---

## Why this exists

E3 walked the full long planning path (8 productive runs, ~54 min). It surfaced one headline
defect: **`/squad plan activate` minted `squad:lead` ×3 and `squad:devrel` ×1 as owner labels
instead of cast names.**

**Root cause:** the prompt's *prohibitions* spell out the forbidden tokens concretely, and the
model copied them verbatim out of the parenthetical that forbids them.

| Site | Text |
|---|---|
| `workflows/squad.md:730` | "…never mint a role-derived label such as `` squad:lead `` or `` squad:reviewer ``" |
| `workflows/squad.md:913` | "…never a Role string (`` Lead ``, `` DevRel ``) or lowercased role…" |

The two tokens that leaked are the two tokens named in those prohibitions.

> **Update 2026-08-21 — this is no longer a relayed observation.** The artifact was read
> directly. See *Observed directly* below for the verbatim `Agent` column, the exact label
> counts, and three additional findings, one of which changes a check in Phase 3.

---

## ✅ Observed directly — 2026-08-21, run `32433493989`

**Verified against the artifact rather than relayed**, so no downstream claim rests on an
inference.

### `Agent` column, verbatim (`plan implementation`, run `32433493989`, seed issue #16)

| # | Title | Size | Depends On | **Agent** | Epic |
|---|-------|------|------------|-----------|------|
| 1 | Parse OPML into subscription records | S | — | **`lead`** | 1.1 |
| 2 | Import parsed feeds as subscriptions (dedupe + summary) | M | 1 | **`lead`** | 1.1 |
| 3 | OPML upload UI with results panel | M | 2 | **`devrel`** | 1.1 |

⇒ **`lead` ×2, `devrel` ×1** in the Agent column.

### Labels minted at `plan activate` (run `32435055598`)

| Issue | Label | Source |
|---|---|---|
| #18 Parse OPML… | `squad:lead` | Agent column task 1 |
| #19 Import parsed feeds… | `squad:lead` | Agent column task 2 |
| #20 OPML upload UI… | `squad:devrel` | Agent column task 3 |
| **#17 [Epic] OPML Upload & Import** | **`squad:lead`** | ⚠️ **not from the Agent column** |

⇒ **`squad:lead` ×3, `squad:devrel` ×1. The briefed count is confirmed exactly.**

### 🔴 Squad's own validation row is fooled too

The plan's self-check printed:

> `| Agent assignments valid (cast Names) | ✅ (lead, lead, devrel) |`

It asserted three role strings **are** cast Names. **Never treat Squad's validation pre-check
as evidence** — it passes on exactly the input it should reject.

### 🔴 Zero legitimate labels have EVER been minted

All five roster names checked: `squad:keaton`, `squad:mcmanus`, `squad:fenster`,
`squad:hockney`, `squad:kint` — **all ABSENT**. Every owner label that has ever existed in this
fixture is role-derived. The binding has never once worked.

### All three prohibition tokens have leaked — across runs

| Token | Named at | Seen |
|---|---|---|
| `squad:lead` | `:730` | E1 (#6, #7) **and** E3 (#17, #18, #19) |
| `squad:devrel` | `:913` (`DevRel`) | E1 (#8) **and** E3 (#20) |
| **`squad:reviewer`** | `:730` | **E1 only (#9)**, created 2026-08-19 — **not** minted by E3 |

The leaked set is exactly the set named in the two prohibitions — nothing outside it has ever
appeared. The root cause reproducing itself precisely.

---

## ⚠️ Scope — what E4 covers, and what it does NOT

**As amended, E4 verifies two things:**

1. **Task-level `Agent` binding at `plan implementation`** (#1784). Historical scope, unchanged.
2. **Roster provenance at `plan activate`** (#1812). Added post-#1811. The gate compares the
   activation summary's `"Roster set read from …"` line against the fixture's actual
   `.squad/team.md → ## Members → Name` column, as a set.

**E4 does NOT cover:**

- **`plan validate` / `plan accept …` / `implement` / merge / post-merge relay.** Those add
  ~27 min and are on E1's beat (the merge-continuation relay path), plus follow-on paths that
  are **not** unattended-safe (see the E4 Follow-on section for #1787 sibling-epic refill).
- **Rule D — epic closure after last leaf merges.** That is a formal gate on E1.
- **Every label surface downstream of `plan activate`.** E4 stops immediately after `plan
  activate` runs.

**Why the boundary is drawn at `plan activate`.** The two defects E4 is engineered to catch —
role-token leakage in the `Agent` column (#1784) and roster-provenance falsehood in the
activation summary (#1812) — both surface no later than the `plan activate` job's own
comment. Continuing past it does not improve E4's signal for either defect and does bring in
the autonomy blockers documented in the Follow-on section.

**Historical note (n=1 record only).** The original procedure stopped at `plan implementation`
and produced a PASS at n=1. That record is preserved because it is real evidence for its own
scope. It is **not** evidence for the amended procedure — the roster-provenance gate has
never been executed as a formal gate. Re-run required.

---

## ⚠️ Criterion — read and agree BEFORE running

**Stated in advance so the result cannot be rationalised after the fact.**

### The two leaked tokens are NOT equal evidence

This is the most important thing in this document. Verified against the roster of the **retired**
fixture (`.squad/team.md` in `bradygaster/aspiregregator-squad-e2e`, deleted 2026-08-24):

| Roster | Name | Role |
|---|---|---|
| | Keaton | **Lead** / Architect |
| | McManus | Backend Engineer (Orleans) |
| | Fenster | Frontend Engineer (Blazor) |
| | Hockney | Test Engineer |
| | Kint | DevOps / Platform Engineer |

String check on that file: `DevRel` → **False**. `devrel` → **False**.

> 🛑 **RE-DERIVE this table before any re-run — do not inherit it.**
> The current fixture (`octodemo/aspiregregator-squad-e2e`) is a *bare application repo*: it has no
> `.squad/` directory at all, so it has no roster until Squad is activated on it (Phase 0). Casting
> generates names, so the new roster will **not** be Keaton/McManus/Fenster/Hockney/Kint.
>
> The dispositive/ambiguous split below is **derived from roster contents, not fixed vocabulary**.
> The rule that survives is the *reasoning*, not the *tokens*:
>
> - A leaked token is **dispositive** when it appears nowhere in the fixture's roster (no Name, no
>   Role, no charter) — its only possible source is the prohibition text, so the model copied it.
> - A leaked token is **ambiguous** when the roster's own Role column contains that word, because
>   role-column derivation and prohibition-copying then produce the same string.
>
> So: re-read the new `.squad/team.md`, re-run the string checks, and re-classify each token. If the
> new cast happens to include a role containing "Lead", `squad:lead` stays ambiguous; if it does not,
> `squad:lead` *becomes* dispositive. Scoring a new run against the retired fixture's classification
> would assert a fact about a repo that no longer exists.

- **`squad:devrel` is dispositive.** "DevRel" appears **nowhere** in the fixture — not as a
  Name, not as a Role, not in any charter. Its **only** possible source is the prohibition text
  at `:913`. If it appears, the model copied it out of the prohibition. There is no other
  explanation.
- **`squad:reviewer` is also dispositive**, for the same reason — "Reviewer" is not a roster
  Role either. It is named at `:730`. *(Observed in E1 on issue #9; not minted by E3.)*
- **`squad:lead` is ambiguous.** Keaton's Role column literally reads "Lead / Architect". So
  `squad:lead` could be **role-column derivation** *or* prohibition-copying. It does not
  discriminate between the two failure modes.

**Measured baseline to compare against — what E3 actually produced (run `32433493989`):**

| | Agent column | Verdict if repeated |
|---|---|---|
| Task 1 | `lead` | ambiguous |
| Task 2 | `lead` | ambiguous |
| Task 3 | **`devrel`** | ❌ **dispositive FAIL** |

### ⇒ Verdict is three-way, not binary

| Verdict | Condition | Meaning |
|---|---|---|
| ✅ **PASS** | No `squad:devrel` / `squad:reviewer` **and** no `squad:lead` (or any other role-derived token). Every `Agent` value is a roster **Name** or `@copilot`. | Fix is effective. |
| ⚠️ **PARTIAL** | No `squad:devrel` / `squad:reviewer`, but `squad:lead` (or another role-column token) still appears. | Prohibition-copying **is fixed**. A second, distinct defect — role-column derivation — remains. **File it separately. Do not revert the fix.** |
| ❌ **FAIL** | `squad:devrel` or `squad:reviewer` appears in `Agent` values, or on an issue **newly created by this run**. | Prohibition-copying is **not** fixed. #1784 stands. |

> 🛑 **Why three-way matters:** a binary criterion scores PARTIAL as FAIL, which would argue for
> reverting a fix that genuinely worked. The `devrel`/`lead` asymmetry is the only thing that
> separates "the fix didn't work" from "the fix worked and there's a second bug." Do not
> collapse it.

### Accepted `Agent` values

**Valid:** `Keaton`, `McManus`, `Fenster`, `Hockney`, `Kint`, or `@copilot` (explicit fallback
per `:913` when no cast member fits).

**Invalid — any of these is a finding:** `Lead`, `DevRel`, `Reviewer`, `Architect`, `Backend`,
`Frontend`, `Test`, `DevOps`, `Platform`, or any lowercased/`squad:`-prefixed form thereof.

### 🛑 Known gap — this criterion detects wrong *vocabulary*, not wrong *assignment*

The `Agent`-column check asks whether every value **is** a roster name. It does **not** ask
whether the **right** roster name got the row. An infrastructure task bound to the Backend
engineer produces a fully verbatim column and scores green.

Role-appropriateness requires a **manual read of each task's text against its binding** and is
**not** established by this criterion. Phrase results accordingly:

> *"N/N bound to roster names; assignments role-appropriate on manual read"*

— with the second clause explicitly marked as a **human check the gate did not perform**.

> ⚠️ **Never let an absence carry the claim.** "Agent X appears zero times because there is no
> work of that kind" is circular unless you separately confirm no such task exists — the zero is
> otherwise both the evidence and the thing it explains. Two states produce an identical
> artifact: a genuine zero, and work of that kind misbound to someone else. **Lead with the
> positive bindings** — each is falsifiable by reading its own row — and record any zero only as
> *corroborated by manual confirmation that no task is of that shape*.

---

## Budget

**~31 minutes**, adapted from E3's measurement: E3's
`research → triage → plan program → plan implementation` sub-window ran 00:18:10 → 00:44:54 =
**26.7 min** (runs `32432129404` → `32433493989`), plus fixture refresh. **Add ~4 min for the
`plan activate` step** appended in this amendment; E4 (n=1) measured `plan activate` at
`~2m43s` (run `32471509974`, 2026-08-21 10:11:53Z → 10:14:36Z). Round up to ~4 min to cover
between-step gh-aw pickup latency.

Add ~12 min if you enter out of order — see *Ordering — mandatory, not stylistic* in Phase 2.

**E4 is unattended-safe.** All five commands are on the planning track, so E4 creates no
worker PR and therefore hits neither the `action_required` approval gate nor the `detection`
hang. E3 needed **zero** human interventions across 8 runs. The `plan activate` step mints
labels on the fixture; that is expected fixture state change, not an intervention.

---

## Phase 0 — Refresh the fixture

> ⚠️ **You will get a false result without this phase.** Four false negatives during E3 came
> from refresh mistakes, not from the code under test.

```powershell
$FIXTURE = "octodemo/aspiregregator-squad-e2e"
$SOURCE  = "bradygaster/squad"
$EVIDENCE = Join-Path ([Environment]::GetFolderPath('Desktop')) "squad-e4-$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Force -Path $EVIDENCE | Out-Null
```

> **Why octodemo.** Actions minutes for the `bradygaster` org were near exhaustion, so E-scenario
> runs bill to `octodemo` instead (owner decision, 2026-08-24). The pristine, **read-only** origin
> is `bradygaster/Aspiregregator` — copy it, never run against it, never modify it.

### 0-pre. Provision the fixture — required when it has no `.squad/`

> 🛑 **0a–0d below assume Squad is already installed in the fixture.** They *refresh* an activated
> fixture; they cannot create one. On 2026-08-24 every prior test repo was deleted, so the current
> fixture was recreated from `bradygaster/Aspiregregator` and is a **bare application repo**.

Assert the starting state before choosing a path — do not assume:

```powershell
gh api "repos/$FIXTURE/contents/.squad" --jq '.[].name' 2>$null
$squadExit = $LASTEXITCODE
# 0   -> activated; skip to 0a and refresh normally.
# !=0 -> 404 / absent; Squad has never been activated here. Run activation FIRST.
#        Do NOT interpret a 404 as "clean" and proceed: 0b would then report UNREADABLE
#        for all four files, which is the correct failure but wastes a cycle diagnosing it.
```

Until activation runs, the fixture has **no roster**, so E4's dispositive/ambiguous
classification has nothing to bind to. Re-derive it after activation
(see *The two leaked tokens are NOT equal evidence*).

Activation also requires repo secrets to be present, which are **not** copied from the origin
and cannot be recovered from the deleted fixture — they must be re-supplied by the operator.

### 0a. The four trap doors

**① There are TWO files named `squad.md`. Assert the byte size before concluding anything.**

| Path in fixture | Bytes | What it is |
|---|---|---|
| `.github/workflows/squad.md` | **~56,525** | ✅ the main prompt — **this is the one that matters** |
| `.github/workflows/shared/squad.md` | **~6,688** | ❌ a shared fragment — checking this gives false negatives |

During E3 I checked the 6.6 KB file and got four false negatives that looked exactly like proof
of staleness. **An order-of-magnitude size difference is the tell.**

**② Two independently stale surfaces.** `squad.lock.yml` (~150 KB) `{{#runtime-import}}`s four
files, resolved against **the fixture's own copies**, not `dev`:
`shared/squad.md`, `shared/squad-planning-ontology.md`, `shared/squad-planning-policy.md`, `squad.md`.
So the compiled lock **and** the committed source markdown are separately stale. Refresh both.

**③ `GH_AW_INFO_FRONTMATTER_SOURCE: .../@dev` is provenance metadata ONLY.** It records where
the workflow came from. It does **not** mean the fixture is current. **Never** treat it as
evidence of freshness.

**④ Do not trust `gh aw update`.** It has a 3-day cooldown that **silently skips** the source
pull, then compiles happily and exits 0. This is an instance of the silent-success pattern that
runs through this document: **a tool that returns success without doing the requested work is
worse than one that fails loudly**, because the operator has no signal to investigate. Fetch
via `gh api`, then `gh aw compile`.

### 0b. Establish the staleness baseline — compare, never hardcode

> 🛑 **Compare source against fixture at run time. Do NOT hardcode an expected byte size.**
> The fix for #1784 changes these sizes. A hardcoded expectation would itself become a
> silent-success trap — it would pass against the wrong content.

```powershell
$pairs = @(
  @{ src = "workflows/squad.md";                        dst = ".github/workflows/squad.md" },
  @{ src = "workflows/shared/squad.md";                 dst = ".github/workflows/shared/squad.md" },
  @{ src = "workflows/shared/squad-planning-ontology.md"; dst = ".github/workflows/shared/squad-planning-ontology.md" },
  @{ src = "workflows/shared/squad-planning-policy.md";   dst = ".github/workflows/shared/squad-planning-policy.md" }
)

foreach ($p in $pairs) {
    $s = gh api "repos/$SOURCE/contents/$($p.src)?ref=dev" --jq '.size' 2>$null
    $sExit = $LASTEXITCODE
    $d = gh api "repos/$FIXTURE/contents/$($p.dst)"        --jq '.size' 2>$null
    $dExit = $LASTEXITCODE
    # UNREADABLE if either gh call failed OR either side didn't return a size. Do
    # NOT collapse this into MATCH ($null -eq $null is $true — a double gh failure
    # would print MATCH and green-light the whole run on an unverified fixture)
    # and do NOT collapse into STALE either (STALE prescribes a refresh, which
    # will not fix a broken credential and burns a cycle before anyone notices).
    # Test the CAUSE (exit code) alongside the SYMPTOM (empty response): a null
    # guard alone cannot distinguish "gh crashed" from "gh returned nothing",
    # and only the first is fixable by re-authenticating.
    $state =
      if ($sExit -ne 0 -or $dExit -ne 0 -or
          [string]::IsNullOrWhiteSpace($s) -or [string]::IsNullOrWhiteSpace($d)) { "UNREADABLE" }
      elseif ($s -eq $d) { "MATCH" }
      else               { "STALE" }
    Write-Host ("{0,-52} src={1,-7} fixture={2,-7} {3}" -f $p.dst, $s, $d, $state)
}
```

**Known-stale baseline measured 2026-08-21 (pre-fix), for reference only:**

| File | `dev` | fixture | |
|---|---|---|---|
| `squad.md` (main) | 57,673 | 56,525 | STALE |
| `shared/squad.md` | 6,840 | 6,688 | STALE |
| `shared/squad-planning-ontology.md` | 16,839 | 16,420 | STALE |
| `shared/squad-planning-policy.md` | 4,676 | 4,538 | STALE |

All four were stale. Expect all four to read `MATCH` **after** a successful refresh — and
none to read `UNREADABLE`. `UNREADABLE` is a fetch failure, not a fixture problem: fix the
credential or network before refreshing (a refresh does not repair a broken `gh` auth, and
running one will burn a cycle before anyone notices the readings were never taken).

### 0c. Refresh both surfaces, then re-assert

Pull each source file from `dev` into the fixture, commit, then recompile the lock so the
runtime-imports resolve against the refreshed copies.

```powershell
# Re-run the 0b comparison loop. Required post-condition: all four report MATCH,
# AND none report UNREADABLE. "All four MATCH" alone is NOT sufficient — the loop
# must also assert the comparison was actually readable. A double gh failure prints
# MATCH otherwise (both sides $null; $null -eq $null is $true).
# If any reports STALE, the refresh did not take — stop and fix it.
# If any reports UNREADABLE, the fetch never happened — fix the credential/network,
# do NOT run the refresh (it will not help), then re-run this loop.
# Do NOT proceed on a STALE or UNREADABLE surface; every downstream result would be
# either meaningless (STALE) or unverified (UNREADABLE).
```

### 0d. Confirm the fix is actually present in the fixture

The byte comparison proves *currency*, not *content*. Assert the fix text directly:

```powershell
# PowerShell gotcha: -like "*$key*" treats BACKTICKS as escape characters and yields
# false negatives on prompt text (which is full of backticks). Use .Contains().
$b = (gh api "repos/$FIXTURE/contents/.github/workflows/squad.md?ref=main" --jq '.content' 2>$null) -join '' -replace '\s',''
$bExit = $LASTEXITCODE
if ($bExit -ne 0) {
    Write-Host "0d fix-presence: INCONCLUSIVE — gh api exited $bExit reading $FIXTURE/.github/workflows/squad.md; do NOT record the ADD/REM checks as False (they never ran). Fix auth/network before scoring."
} elseif ([string]::IsNullOrWhiteSpace($b)) {
    Write-Host "0d fix-presence: INCONCLUSIVE — gh api returned empty response for $FIXTURE/.github/workflows/squad.md (exit=0 but empty payload is a schema drift, not a match)"
} else {
    $txt = $null
    try { $txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }
    catch { Write-Host "0d fix-presence: INCONCLUSIVE — base64 decode failed ($($_.Exception.GetType().Name))" }
    if ($txt) {
        Write-Host "main squad.md length: $($txt.Length)"    # expect ~60,589 chars, NOT ~6.6 KB
        # #1789 REPLACED the old prohibition rather than appending to it, so assert BOTH directions.
        foreach ($k in 'Check 10','sole source of truth','Non-roster') {
          Write-Host ("ADD {0,-24} {1}" -f $k, $txt.Contains($k))          # all must be True
        }
        # NB: the REM check inverts against an empty string — .Contains(x) returns False,
        # and False is the pass condition. The IsNullOrWhiteSpace guard above prevents
        # that path from ever being reached; do not remove it.
        Write-Host ("REM {0,-24} {1}" -f 'never mint a role-derived', $txt.Contains('never mint a role-derived'))   # must be False
    }
}
```

> **Assert the removal, not only the addition.** A sync that appends without replacing leaves the
> file carrying *both* the old prohibition and the new `Check 10` machinery — two overlapping rules
> about the same thing, which is a plausible mechanism for the original disobedience. That is worse
> than either alone and it passes an addition-only check.

> ⚠️ **Assert against `squad.md`, NOT `squad.lock.yml`.** The lock does **not** inline the prompt
> body — it emits `GH_AW_PROMPT_CONTENT_0008: "{{#runtime-import .github/workflows/squad.md}}"`,
> resolved at runtime against the fixture's own committed copy. The markers **cannot** appear in
> the lock, so asserting there returns a guaranteed false FAIL. What the lock *does* carry is a
> `body_hash` in its first-line metadata; a changed `body_hash` is the proof that a recompile
> actually ingested the new source. Check the markers in the `.md` and the `body_hash` in the lock —
> each artifact for what it can actually represent.

**Status — this was performed on 2026-08-21 (fixture commit `1b11c5f`).** All five prompt sources
verified byte-identical to `dev` by blob SHA; recompiled with `gh aw compile --strict` v0.86.2,
exit 0; `body_hash` moved `98f0dbd7…` → `d0e504a2…` (squad) and `95183cda…` → `e4ddc844…` (worker).
Re-run the assertions above anyway before E4 — `dev` may have moved again.

---

## Phase 1 — Seed issue

### Primary requirement (#1784)

Any issue that produces a real implementation plan will exercise the `Agent` column. The
binding defect does not depend on tree shape.

### Secondary requirement (per EECOM) — shape for ≥2 sibling epics

EECOM shipped PR #1787 fixing sibling-epic dispatch refill (the worker refilled against the
completing task's **immediate parent epic** instead of the **root**, so in a
`Root → [Epic A, Epic B]` tree, Epic A draining never surfaced Epic B's work — slot idle, run
green, work stalled). He verified it **structurally, not live**, because no fixture has ever
had the required shape:

- **E1** — one epic. Cannot trigger it.
- **E3** — epic #17 → #18/#19/#20. One epic deep. Cannot trigger it.

**A third single-epic fixture would leave #1779 structurally unverifiable for the third run
running.** So: shape the seed so `plan program` **naturally** decomposes into **at least two
sibling epics** — two genuinely distinct workstreams, not one epic with more children.

Costs nothing to decide now; expensive to redo later.

### 🛑 Guard rail — do not bend the fixture

> **Do not over-engineer the seed chasing a specific decomposition.** If two epics don't fall
> out naturally, **say so** — record the actual shape produced and note what shape *would* be
> needed — rather than contorting the input until it yields the tree we want.
>
> **A fixture bent into shape doesn't prove much.** An honest one-epic result is a better
> outcome than a manufactured two-epic one.

### Recording the outcome

After `plan program` (Phase 2), record:

```
Epics produced : <n>
Shape          : Root #<n> → [ #<a>, #<b>, ... ]
≥2 siblings?   : yes / no
If no: what seed shape would have been needed —
```

> This is **observational only**. It has **no bearing on E4's pass/fail**, which is purely
> #1784. See the follow-on section.

---

## Phase 2 — Run the short path

**Run exactly these five commands, in this order, and stop.**

```
/squad research
/squad triage
/squad plan program
/squad plan implementation      ← the #1784 leak site
/squad plan activate            ← the #1812 provenance site; STOP HERE
```

> **Do not continue to `plan validate` / `plan accept …` / `implement`.** Those add ~27 min and
> verify nothing additional for E4 — the `Agent` column is emitted at `plan implementation`
> and the roster-provenance line is emitted at `plan activate`.

**The ordering is mandatory, not stylistic.** The long path enforces preconditions: `plan
program` on a fresh issue halts and tells you to run `triage` first; `triage` halts and demands
`research` first; `plan activate` refuses to run without `plan accept` in later revisions, but
at the time of writing runs directly after `plan implementation`. **Those halts are correct
behaviour, not bugs** — but they cost ~12 min if you trip them.

> ⚠️ **After each command, wait for all six pipeline jobs to complete** (`pre_activation`,
> `activation`, `agent`, `detection`, `safe_outputs`, `conclusion`). **`agent ✅` is not
> sufficient** — see the Condition 0 justification at the top of this document. A run where
> `conclusion` has not yet completed is a **premature-read hazard** on the very next command.

Capture the run ID after each command:

```powershell
gh run list --repo $FIXTURE --limit 1 `
    --json databaseId,name,conclusion,startedAt,updatedAt `
    --jq '.[] | [(.databaseId|tostring),.conclusion,.name] | join("  |  ")' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "run-list: INCONCLUSIVE — gh run list exited $LASTEXITCODE. The line above is silence, not 'no run'; re-run before capturing the run ID."
}
```

> PowerShell gotcha: piping `gh --json` into `ConvertFrom-Json` breaks on warning lines.
> Prefer `--jq` with `2>$null`, as above. **The `2>$null` swallows the failure message
> but not the failure signal** — every `gh … 2>$null` in this document is followed by
> an `$LASTEXITCODE` assertion. Do not remove either half of the pair.

---

## Phase 3 — Inspect (the actual verification)

### 3a. The `Agent` column — primary evidence

The implementation plan is posted as a comment on the seed issue. Extract it verbatim:

```powershell
$ISSUE = <seed issue number>

gh issue view $ISSUE --repo $FIXTURE --json comments `
    --jq '.comments[-1].body' 2>$null |
    Set-Content (Join-Path $EVIDENCE "plan-implementation-comment.md")
if ($LASTEXITCODE -ne 0) {
    Write-Host "plan-implementation-comment extract: INCONCLUSIVE — gh issue view exited $LASTEXITCODE. plan-implementation-comment.md may be empty or missing; DO NOT read the ``Agent`` column from a file that never rendered — the eyeball read below would report 'no forbidden tokens' against an empty file."
}

# Pull every Agent cell out of the plan's task table
$plan = [IO.File]::ReadAllText((Join-Path $EVIDENCE "plan-implementation-comment.md"))
Write-Host "`n=== Agent column values ==="
[regex]::Matches($plan, '(?m)^\|.*$') | ForEach-Object { $_.Value }
```

Read the `Agent` column by eye against the accepted-values list above. Do not automate the
judgement — a regex that "finds no forbidden tokens" in a plan that failed to render is a
silent-success trap. **Confirm the plan actually contains a task table first.**

> 🛑 **Ignore Squad's own "Validation Pre-check" table.** In E3 it printed
> `Agent assignments valid (cast Names) | ✅ (lead, lead, devrel)` — asserting three role
> strings *are* cast Names. **It passes on exactly the input it should reject.** Judge the
> `Agent` column yourself; never accept the self-check as the result.

### 3b. Minted labels — corroborating evidence

> 🛑 **DO NOT check repo-global label existence. It is a guaranteed false FAIL.**
>
> GitHub labels **persist once created**. `squad:lead`, `squad:devrel`, and `squad:reviewer`
> **already exist in the fixture** — minted by E1 on 2026-08-19 and E3 on 2026-08-21. They will
> still be there during E4 no matter how well the fix works. A check of the form
> "does `squad:devrel` exist in this repo?" returns **true forever** and would fail a perfect run.
>
> **Scope the check to the issues E4 itself created.**

```powershell
# Record this BEFORE running Phase 2 — it is the cutoff for "new" issues.
$E4_START = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# After Phase 2: labels on issues created by THIS run only.
#
# NB: `gh` has NO `--arg` flag — an earlier draft passed `--jq --arg t "$E4_START" '…'`
# which made `--jq` consume `--arg` as its expression and turned the rest into stray
# positionals. `gh` exited 1 with empty stdout every single run and `2>$null` swallowed
# it. The pass condition below ("every squad:{x} must be a lowercased roster Name") is
# universally quantified over the returned rows, so empty output is **vacuously true**
# — the same shape of hazard as `$null -eq $null` at Phase 0b and `SetEquals(∅,∅)` at
# gate 3e (B). A silently broken filter would have written the passing values into the
# two `# dispositive` verdict fields (squad_devrel_present / squad_reviewer_present)
# where `true` is the FAIL evidence. Interpolate $E4_START in PowerShell instead.
if ([string]::IsNullOrWhiteSpace($E4_START)) {
    Write-Host "3b labels extract: INCONCLUSIVE — `$E4_START not set. With an empty cutoff, ``select(.createdAt > `"`"`")`` matches every issue in the fixture and drags all pre-existing squad-labeled contamination (#6-9, #17-20 as of 2026-08-21) into the FAIL evidence. Record `$E4_START` BEFORE Phase 2 and re-run this cell. DO NOT record `false` on ``squad_devrel_present`` / ``squad_reviewer_present`` — the query never ran with a valid cutoff."
} else {
    $jq = ".[] | select(.createdAt > `"$E4_START`") | " +
          "[(.number|tostring), ([.labels[].name]|join(`",`")), (.title|.[0:50])] | " +
          "join(`"  |  `")"
    $rows = gh issue list --repo $FIXTURE --state all --limit 100 `
        --json number,title,labels,createdAt --jq $jq 2>$null
    $rowsExit = $LASTEXITCODE
    if ($rowsExit -ne 0) {
        Write-Host "3b labels extract: INCONCLUSIVE — gh issue list exited $rowsExit. DO NOT record ``false`` on ``squad_devrel_present`` / ``squad_reviewer_present`` — those fields are dispositive and the query never ran. Fix auth/network and re-check before scoring #1812."
    } elseif (-not $rows -or $rows.Count -eq 0) {
        # Zero rows with exit=0 is a real state, not an error state — but it is ALSO a
        # #1812 signal in its own right: Phase 2 should have minted labels at
        # `plan activate`. Score it as INCONCLUSIVE (not FAIL) so the operator investigates
        # whether Phase 2 actually ran, rather than letting the vacuously-true universal
        # quantifier below write `false` into the dispositive fields.
        Write-Host "3b labels extract: INCONCLUSIVE — zero rows returned with `$E4_START=$E4_START and gh exit=0. Either Phase 2 minted no labels at all (a #1812-adjacent signal — investigate before scoring), or the `$E4_START` cutoff excluded them (check the seed-issue creation timestamp). DO NOT record ``false`` on the dispositive fields."
    } else {
        $rows | ForEach-Object { Write-Host $_ }
        Write-Host "3b labels extract: returned $($rows.Count) row(s) — read them by eye against the accepted-values rule below."
    }
}
```

**Confirm the query actually returned rows.** If the block printed `INCONCLUSIVE`
above, do NOT proceed to score the two `squad_devrel_present` / `squad_reviewer_present`
fields — an unscored query is not a passing query, and the pass condition below is
universally quantified over the returned set (vacuously true over empty). This is the
same operator instruction Phase 3a carries for the `Agent` column; 3b needs it for the
same reason.

Every `squad:{x}` on a **newly created** issue must have `{x}` = a lowercased roster Name
(`keaton`, `mcmanus`, `fenster`, `hockney`, `kint`).

**Known pre-existing contamination — ignore these unless they appear on a NEW issue:**

| Label | Minted by | On issues |
|---|---|---|
| `squad:lead` | E1 + E3 | #6, #7, #17, #18, #19 |
| `squad:devrel` | E1 + E3 | #8, #20 |
| `squad:reviewer` | **E1 only** | #9 |

> ⚠️ **This table grows.** Every E4 run mints labels at `plan activate` (that step is now part
> of E4 as of the 2026-08-21 amendment). **After running E4, append the newly-minted labels to
> this table before the next run** — otherwise the second run's contamination filter is stale
> and either passes labels it should catch or catches labels it should ignore. If unsure,
> re-derive the table from the fixture: `gh label list --repo $FIXTURE` gives repo-global
> presence; scope by issue via the same `E4_START`-cutoff query used above.

### 3c. Roster cross-check

```powershell
$b = gh api "repos/$FIXTURE/contents/.squad/team.md" --jq '.content' 2>$null
$bExit = $LASTEXITCODE
if ($bExit -ne 0) {
    Write-Host "roster fetch: INCONCLUSIVE — gh api exited $bExit reading $FIXTURE/.squad/team.md; the `False` expectations below cannot be scored"
} elseif ([string]::IsNullOrWhiteSpace($b)) {
    Write-Host "roster fetch: INCONCLUSIVE — gh api returned empty response for $FIXTURE/.squad/team.md (exit=0 but empty payload)"
} else {
    $roster = $null
    try { $roster = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }
    catch { Write-Host "roster fetch: INCONCLUSIVE — team.md base64 decode failed" }
    if ($roster) {
        Write-Host "roster contains 'DevRel' : $($roster.Contains('DevRel'))"   # expect False
        Write-Host "roster contains 'devrel' : $($roster.Contains('devrel'))"   # expect False
    }
}
```

If either reads `True`, the roster changed since 2026-08-21 and **the `devrel`-is-dispositive
argument no longer holds** — re-derive the criterion before judging the run. If the fetch
prints INCONCLUSIVE, do not treat the two `False` values as absent: they were never read.
Fix the fetch and re-check before scoring.

### 3d. Safe-outputs

```powershell
gh aw logs squad --repo $FIXTURE --artifacts all --count 1 --output $EVIDENCE
```

### 3e. Roster-provenance gate at `plan activate` (#1812)

**This is the gate added in the 2026-08-21 amendment. It has never been executed as a formal
gate.** The n=1 PASS above scored the pre-amendment procedure that stopped at
`plan implementation`; that procedure was structurally silent on #1812.

**The claim under test.** The `plan activate` summary posts a line of the shape:

> *"Roster set read from `.squad/team.md` (`## Members` → `Name` column): `<items>`"*

**What #1812 measured (2026-08-21, run `32471509974`, seed #22):** the summary reported
`{lead, reviewer, devrel, security, docs}` while the fixture's actual `Name` column is
`{Keaton, McManus, Fenster, Hockney, Kint}`. Five-for-five mismatch, and the minted labels
were a strict subset of the *false* set — i.e. the code acted on the falsely-reported roster.
This is not a mere reporting bug; the false provenance is the tell for a hardcoded lookup.

**The gate is two-part. Both parts must pass.**

- **(A) Provenance line exists.** The activation summary must contain the line above.
  **Absence is a FAIL** — a summary that no longer makes the claim is a different bug we still
  want to catch (silent-success class: an activate that stopped reporting where it read from is
  indistinguishable from an activate that stopped reading anything).
- **(B) Reported set equals fixture set.** Normalize both sides: trim whitespace, lowercase,
  drop backticks and commas, treat as an unordered set. The reported set must equal the set
  extracted from the fixture's `.squad/team.md → ## Members → Name` column.

```powershell
# Grab the plan activate summary comment on the seed issue.
gh issue view $ISSUE --repo $FIXTURE --json comments `
    --jq '.comments[-1].body' 2>$null |
    Set-Content (Join-Path $EVIDENCE "plan-activate-comment.md")
if ($LASTEXITCODE -ne 0) {
    Write-Host "GATE 3e: INCONCLUSIVE — gh issue view (plan-activate-comment) exited $LASTEXITCODE. plan-activate-comment.md may be empty or missing; the (A) regex below would fail against an empty file and read as a genuine A-FAIL, which is the WRONG defect. Do not proceed to score #1812 until the fetch succeeds."
}

$summary = [IO.File]::ReadAllText((Join-Path $EVIDENCE "plan-activate-comment.md"))

# (A) presence — the exact phrasing may vary; anchor on the two invariants.
$claim = [regex]::Match($summary, '(?im)Roster set read from.*?team\.md.*?Name.*?:\s*(?<set>.+?)\r?\n')
if (-not $claim.Success) {
    Write-Host "GATE 3e (A): FAIL — no 'Roster set read from …' line in activation summary"
} else {
    Write-Host "GATE 3e (A): PASS — provenance line present"

    # (B) set-equality.
    $b = gh api "repos/$FIXTURE/contents/.squad/team.md" --jq '.content' 2>$null
    $bExit = $LASTEXITCODE
    $roster = $null
    if ($bExit -ne 0) {
        Write-Host "GATE 3e (B): INCONCLUSIVE — gh api exited $bExit reading $FIXTURE/.squad/team.md; investigate before scoring #1812"
    } elseif ([string]::IsNullOrWhiteSpace($b)) {
        Write-Host "GATE 3e (B): INCONCLUSIVE — gh api returned empty response for $FIXTURE/.squad/team.md (exit=0 but empty payload); investigate before scoring #1812"
    } else {
        try { $roster = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }
        catch { Write-Host "GATE 3e (B): INCONCLUSIVE — team.md base64 decode failed ($($_.Exception.GetType().Name)); investigate before scoring #1812" }
    }

    if ($roster) {
        # Extract the ## Members → Name column. Trim to that section only.
        $members = [regex]::Match($roster, '(?ms)^##\s*Members\s*\r?\n(?<body>.*?)(?=^##|\z)').Groups['body'].Value
        # Take the first non-header cell of each row; the Name column is convention position 1.
        $realNames = [regex]::Matches($members, '(?m)^\|\s*([^|`\s][^|]*?)\s*\|') |
                     ForEach-Object { $_.Groups[1].Value.Trim('` ').ToLower() } |
                     Where-Object { $_ -notin @('name','---',':---',':---:','---:') }

        $reportedRaw = $claim.Groups['set'].Value
        $reportedNames = ($reportedRaw -split '[,`]') |
                         ForEach-Object { $_.Trim('` ,').Trim().ToLower() } |
                         Where-Object { $_.Length -gt 0 }

        # An empty set on either side is an infrastructure failure, not a verdict.
        # SetEquals(∅, ∅) is True — do NOT let two failures cancel into a green.
        if ($realNames.Count -eq 0 -or $reportedNames.Count -eq 0) {
            Write-Host "GATE 3e (B): INCONCLUSIVE — parsed empty set (real=$($realNames.Count) reported=$($reportedNames.Count)); investigate before scoring #1812"
        } else {
            $real = [System.Collections.Generic.HashSet[string]]::new([string[]]$realNames)
            $reported = [System.Collections.Generic.HashSet[string]]::new([string[]]$reportedNames)
            $eq = $real.SetEquals($reported)
            Write-Host "GATE 3e (B): $(if ($eq) {'PASS'} else {'FAIL'}) — reported=[$($reportedNames -join ',')] real=[$($realNames -join ',')]"
        }
    }
}
```

**Verdict interpretation.**

- **Both (A) and (B) PASS** → the `plan activate` roster read is honest. #1812 is (this run,
  n=1) not reproduced.
- **(A) PASS, (B) FAIL** → **the #1812 defect is confirmed live**, and the false-provenance
  claim is the strongest evidence: the activate step *cited* the fixture's `team.md` and
  produced a set that isn't in it. Do not accept an argument that the mismatch is cosmetic —
  cite this section back.
- **(A) PASS, (B) INCONCLUSIVE** → infrastructure failure, not a verdict for #1812. The
  fixture roster couldn't be read or parsed to a non-empty set, so there is nothing to
  compare against. Do NOT score this run for #1812. Investigate the fetch/parse failure and
  re-run once resolved.
- **(A) FAIL** → separate silent-success bug filed against Procedures. Do not proceed to
  score this run for #1812 either way — you have no readable signal.

**Read this by eye too.** As with the `Agent` column, the automated set comparison is a
double-check, not the judgement. If the activate comment failed to render at all, the (A)
regex fails first, gate 3e prints `A: FAIL`, and the run scores **INCONCLUSIVE for #1812** —
that is the correct routing (fail-closed), but it silently costs you the ability to
distinguish "activate rendered a bad summary" from "activate didn't render a summary."
**Confirm the activate comment actually rendered a summary first**, so the recorded A-FAIL
captures the right defect and isn't mistaken for a #1812 signal.

> ⚠️ **This gate assumes the activation summary's phrasing is stable.** The regex anchors on
> `"Roster set read from"` and `"team.md"` and `"Name"`. If Procedures changes the phrasing,
> the (A) regex fails and gate 3e prints `A: FAIL` — the gate fails **closed** and the run
> scores **INCONCLUSIVE for #1812** rather than falsely PASSing. That routing is correct, but
> it costs a scored E4 run. **Update the anchors before re-running** so a Procedures rewording
> doesn't silently burn a run.

---

## Evidence to capture

| Artifact | Why |
|---|---|
| Run IDs + conclusions for all **five** commands | Reproducibility; timing against the ~31 min budget |
| `plan-implementation-comment.md` | **Primary #1784 evidence** — the `Agent` column verbatim |
| `plan-activate-comment.md` | **Primary #1812 evidence** — the roster-provenance line verbatim |
| Full `squad:*` label list | Corroborating evidence |
| Phase 0b comparison output (all four `MATCH`) | Proves the fixture was actually refreshed |
| Roster `DevRel`/`devrel` check output | Keeps the dispositive argument falsifiable |
| Gate 3e set-comparison output (reported vs real) | **Primary #1812 evidence** — falsifiable in text |
| `safeoutputs.jsonl` | Raw agent output |
| Epic-shape record from Phase 1 | Feeds the follow-on; **not** part of the verdict |

### Verdict record

```yaml
scenario: E4
purpose: "#1784 agent-binding verification + #1812 activate roster-provenance verification"
fix_prs:                                # PR numbers for the #1784 and #1812 fixes (may be same or distinct)
  "#1784": ""
  "#1812": ""
fixture_refreshed: true                 # all four surfaces MATCH in Phase 0b
runs: [ research, triage, plan_program, plan_implementation, plan_activate ]
run_ids: []

# #1784 gate — pre-existing (Conditions 1–3 in n=1 record)
agent_column_values: []
forbidden_tokens_found: []
squad_devrel_present: <true|false>      # dispositive
squad_reviewer_present: <true|false>    # dispositive
squad_lead_present:   <true|false>      # ambiguous — does not alone determine FAIL
new_issues_only: true                   # labels scoped to issues created by THIS run
verdict_1784: PASS|PARTIAL|FAIL

# #1812 gate — Phase 3e (new in the 2026-08-21 amendment)
gate_3e_a_provenance_line_present: <true|false>
gate_3e_b_roster_set_equal: <true|false>
gate_3e_reported_set: []                # verbatim as reported by activation summary
gate_3e_real_set: []                    # verbatim from fixture .squad/team.md ## Members Name column
verdict_1812: PASS|FAIL|INCONCLUSIVE    # INCONCLUSIVE if 3e(A) FAIL

# Combined
verdict: PASS|PARTIAL|FAIL              # PARTIAL if one gate PASS, the other FAIL
epics_produced: <n>                     # observational only
scope_note: "task-level Agent binding + plan-activate roster-provenance only; validate/accept/implement/Rule D not covered"
notes: ""
```

---

# Follow-on (SEPARATE) — #1779 / PR #1787 sibling-epic refill

> ⚠️ **This is NOT part of E4.** It has its own criterion, its own path, and its own risk
> profile. **E4's pass/fail is #1784 + #1812 combined (verdict schema in "Verdict record").**
> Do not let this dilute it, and do not report a combined verdict.

If Phase 1 produced ≥2 sibling epics, the resulting tree is *also* the shape needed to exercise
#1779 — a genuine efficiency win, since no fixture has had it yet. Reuse it **only after** E4
has returned its own verdict.

### Criterion (independent of E4's)

- ✅ **PASS** — after tasks under Epic A are exhausted, the worker **dispatches work from
  sibling Epic B** rather than exiting green with free slots.
- ❌ **FAIL** — worker completes its cycle, free slots exist, Epic B's tasks remain open and
  unstarted, no further dispatch.

Sketch: merge a leaf under Epic A, then confirm the worker surfaces Epic B's work.
The `#1779`-vs-`#1772` discriminator: #1779 produces tasks that were **never dispatched**;
#1772 produces dispatches that were **probe-only**. They can coexist; check both.

### 🛑 This follow-on is NOT unattended-safe

It requires the **implement path**, so unlike E4 it inherits **both** autonomy blockers:

1. **`action_required` approval gate.** Worker PRs are authored by `app/github-actions`, and
   GitHub parks bot-authored `pull_request` runs pending approval. This is the **bot-author
   rule** — **repo settings are already permissive; changing them will not help.**
   ```sh
   gh api -X POST "repos/{owner}/{repo}/actions/runs/{id}/approve"
   ```
2. **`detection` job hang.** Observed hanging **3+ hours** on `Install ripgrep` while
   `pre_activation`, `activation`, and `agent` all succeeded.
   ```sh
   gh api "repos/{o}/{r}/actions/jobs/{id}" --jq '.steps[] | select(.status != "completed")'
   ```
   A cancel can take hours to register.

**Schedule this for a window where a human is available to approve.** E4 itself remains
unattended-safe; this does not.

---

## Related

| Ref | |
|---|---|
| **#1784** | Owner/Agent binding fix (#1759) ineffective live — the original defect (CLOSED, but see #1812) |
| **#1812** | `plan activate` reads a hardcoded roster, not `.squad/team.md` — re-diagnoses #1784 (OPEN) |
| **#1811** | Condition 0 dual-role documentation — closed in-doc via the Condition 0 note above (OPEN) |
| **#1759** | The original binding fix — structurally correct, failed live |
| **#1779** | Sibling-epic refill boundary — follow-on only |
| **PR #1787** | Refill dispatch slots from the root, not the parent epic |
| **PR #1789** | Prompt-side agent-binding fix (validate + implementation-plan planner) |
