# E4 — Agent-Binding Verification (#1784)

> **Author:** Sims (E2E Test Engineer)
> **Written:** 2026-08-21, from the E3 long-path rehearsal
> **Status:** ✅ **EXECUTED 2026-08-21 — result recorded below.**

---

## ✅ Executed — 2026-08-21 · verdict PASS (n=1)

Run against fixture `bradygaster/aspiregregator-squad-e2e`, seed issue **#22**,
`$E4_START` = `2026-08-21T09:18:32Z`. **8 gates, 8 green, zero interventions, ~55 min.**

| # | Condition | Result |
|---|---|---|
| 0 | ≥1 issue created by `activate` (excl. seed #22) | ✅ 15 squad-authored (#23–#37) |
| 1 | `Agent` column = verbatim roster names | ✅ **11/11**, zero role-derived tokens |
| 2 | No `squad:lead`/`devrel`/`reviewer` in timeline `labeled` events | ✅ 15 events, all `squad` |
| 3 | Activation summary reports missing-label prerequisite gap | ✅ reported verbatim |

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

## ⚠️ Scope limitation — what E4 does NOT cover

**E4 verifies the task-level `Agent` binding only.**

Epic **#17** received `squad:lead`, but the `plan program` artifact (run `32433011339`) contains
**no owner or agent assignment whatsoever** — verified by direct read. The epic's owner is
therefore minted at **`plan activate`**, which is **downstream of where E4 stops**.

⇒ **A green E4 does not mean "no owner label leaks anywhere."** It means *"the `Agent` column at
`plan implementation` is clean."* Epic-level owner minting is a **separate, unverified surface**
requiring its own check on a full-path run.

E4's scope remains correct and sufficient for its purpose — `devrel` appears **in the Agent
column**, so the dispositive signal is present where E4 looks. But do not overstate the result
when reporting it.

**The leak originates in the `Agent` column at `plan implementation`** (`:913`), and propagates
into minted labels at `plan activate` (`:730`). That's why this procedure stops at
`plan implementation` — it catches the defect at its source rather than at its symptom, which
is what makes a ~27 min run sufficient instead of a ~54 min one.

---

## ⚠️ Criterion — read and agree BEFORE running

**Stated in advance so the result cannot be rationalised after the fact.**

### The two leaked tokens are NOT equal evidence

This is the most important thing in this document. Verified against the fixture roster
(`.squad/team.md` in `bradygaster/aspiregregator-squad-e2e`):

| Roster | Name | Role |
|---|---|---|
| | Keaton | **Lead** / Architect |
| | McManus | Backend Engineer (Orleans) |
| | Fenster | Frontend Engineer (Blazor) |
| | Hockney | Test Engineer |
| | Kint | DevOps / Platform Engineer |

String check on that file: `DevRel` → **False**. `devrel` → **False**.

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

**~27 minutes**, derived from E3 rather than estimated: E3's
`research → triage → plan program → plan implementation` sub-window ran 00:18:10 → 00:44:54 =
**26.7 min** (runs `32432129404` → `32433493989`), plus fixture refresh.

Add ~12 min if you enter out of order — see *Required entry sequence* in the runbook.

**E4 is unattended-safe.** It stays entirely on the planning path, so it creates no worker PR
and therefore hits neither the `action_required` approval gate nor the `detection` hang.
E3 needed **zero** human interventions across 8 runs.

---

## Phase 0 — Refresh the fixture

> ⚠️ **You will get a false result without this phase.** Four false negatives during E3 came
> from refresh mistakes, not from the code under test.

```powershell
$FIXTURE = "bradygaster/aspiregregator-squad-e2e"
$SOURCE  = "bradygaster/squad"
$EVIDENCE = Join-Path ([Environment]::GetFolderPath('Desktop')) "squad-e4-$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Force -Path $EVIDENCE | Out-Null
```

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

**④ Do not trust `gh aw update`.** It has a 3-day cooldown that silently skips the source pull,
then compiles happily and exits 0 (runbook gotcha #1 — an instance of the silent-success
pattern, gotcha #10). Fetch via `gh api`, then `gh aw compile`.

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
    $d = gh api "repos/$FIXTURE/contents/$($p.dst)"        --jq '.size' 2>$null
    $state = if ($s -eq $d) { "MATCH" } else { "STALE" }
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

All four were stale. Expect all four to read `MATCH` **after** a successful refresh.

### 0c. Refresh both surfaces, then re-assert

Pull each source file from `dev` into the fixture, commit, then recompile the lock so the
runtime-imports resolve against the refreshed copies.

```powershell
# Re-run the 0b comparison loop. Required post-condition: all four report MATCH.
# If any still reports STALE, the refresh did not take — stop and fix it.
# Do NOT proceed on a STALE surface; every downstream result would be meaningless.
```

### 0d. Confirm the fix is actually present in the fixture

The byte comparison proves *currency*, not *content*. Assert the fix text directly:

```powershell
# PowerShell gotcha: -like "*$key*" treats BACKTICKS as escape characters and yields
# false negatives on prompt text (which is full of backticks). Use .Contains().
$b = (gh api "repos/$FIXTURE/contents/.github/workflows/squad.md?ref=main" --jq '.content' 2>$null) -join '' -replace '\s',''
$txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))
Write-Host "main squad.md length: $($txt.Length)"    # expect ~60,589 chars, NOT ~6.6 KB

# #1789 REPLACED the old prohibition rather than appending to it, so assert BOTH directions.
foreach ($k in 'Check 10','sole source of truth','Non-roster') {
  Write-Host ("ADD {0,-24} {1}" -f $k, $txt.Contains($k))          # all must be True
}
Write-Host ("REM {0,-24} {1}" -f 'never mint a role-derived', $txt.Contains('never mint a role-derived'))   # must be False
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

**Run exactly these four commands, in this order, and stop.**

```
/squad research
/squad triage
/squad plan program
/squad plan implementation      ← the leak site; STOP HERE
```

> **Do not continue to `plan validate` / `accept` / `activate`.** Those add ~27 min and
> verify nothing additional for #1784 — the `Agent` column is already emitted at
> `plan implementation`.

**The ordering is mandatory, not stylistic.** The long path enforces preconditions: `plan
program` on a fresh issue halts and tells you to run `triage` first; `triage` halts and demands
`research` first. **Those halts are correct behaviour, not bugs** — but they cost ~12 min if
you trip them.

Capture the run ID after each command:

```powershell
gh run list --repo $FIXTURE --limit 1 `
    --json databaseId,name,conclusion,startedAt,updatedAt `
    --jq '.[] | [(.databaseId|tostring),.conclusion,.name] | join("  |  ")' 2>$null
```

> PowerShell gotcha: piping `gh --json` into `ConvertFrom-Json` breaks on warning lines.
> Prefer `--jq` with `2>$null`, as above.

---

## Phase 3 — Inspect (the actual verification)

### 3a. The `Agent` column — primary evidence

The implementation plan is posted as a comment on the seed issue. Extract it verbatim:

```powershell
$ISSUE = <seed issue number>

gh issue view $ISSUE --repo $FIXTURE --json comments `
    --jq '.comments[-1].body' 2>$null |
    Set-Content (Join-Path $EVIDENCE "plan-implementation-comment.md")

# Pull every Agent cell out of the plan's task table
$plan = [IO.File]::ReadAllText((Join-Path $EVIDENCE "plan-implementation-comment.md"))
Write-Host "`n=== Agent column values ==="
[regex]::Matches($plan, '(?m)^\|.*$') | ForEach-Object { $_.Value }
```

Read the `Agent` column by eye against the accepted-values list above. Do not automate the
judgement — a regex that "finds no forbidden tokens" in a plan that failed to render is a
silent-success trap (gotcha #10). **Confirm the plan actually contains a task table first.**

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
gh issue list --repo $FIXTURE --state all --limit 100 `
    --json number,title,labels,createdAt `
    --jq --arg t "$E4_START" '.[] | select(.createdAt > $t) |
         [(.number|tostring), ([.labels[].name]|join(",")), (.title|.[0:50])] | join("  |  ")' 2>$null
```

Every `squad:{x}` on a **newly created** issue must have `{x}` = a lowercased roster Name
(`keaton`, `mcmanus`, `fenster`, `hockney`, `kint`).

**Known pre-existing contamination — ignore these unless they appear on a NEW issue:**

| Label | Minted by | On issues |
|---|---|---|
| `squad:lead` | E1 + E3 | #6, #7, #17, #18, #19 |
| `squad:devrel` | E1 + E3 | #8, #20 |
| `squad:reviewer` | **E1 only** | #9 |

> Note: at `plan implementation` the plan is only *proposed* — labels are minted later, at
> `plan activate`. So E4 may legitimately create **no new labelled issues at all**. That is
> expected, and it means the label check is **weak corroboration only**.
> **The `Agent` column is authoritative for E4.** If labels look clean but the `Agent` column
> is dirty, that is a **FAIL** — the leak simply hasn't propagated yet.

### 3c. Roster cross-check

```powershell
$b = gh api "repos/$FIXTURE/contents/.squad/team.md" --jq '.content' 2>$null
$roster = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))
Write-Host "roster contains 'DevRel' : $($roster.Contains('DevRel'))"   # expect False
Write-Host "roster contains 'devrel' : $($roster.Contains('devrel'))"   # expect False
```

If either reads `True`, the roster changed since 2026-08-21 and **the `devrel`-is-dispositive
argument no longer holds** — re-derive the criterion before judging the run.

### 3d. Safe-outputs

```powershell
gh aw logs squad --repo $FIXTURE --artifacts all --count 1 --output $EVIDENCE
```

---

## Evidence to capture

| Artifact | Why |
|---|---|
| Run IDs + conclusions for all 4 commands | Reproducibility; timing against the ~27 min budget |
| `plan-implementation-comment.md` | **Primary evidence** — the `Agent` column verbatim |
| Full `squad:*` label list | Corroborating evidence |
| Phase 0b comparison output (all four `MATCH`) | Proves the fixture was actually refreshed |
| Roster `DevRel`/`devrel` check output | Keeps the dispositive argument falsifiable |
| `safeoutputs.jsonl` | Raw agent output |
| Epic-shape record from Phase 1 | Feeds the follow-on; **not** part of the verdict |

### Verdict record

```yaml
scenario: E4
purpose: "#1784 agent-binding verification"
fix_pr: <PR number for the #1784 fix>
fixture_refreshed: true          # all four surfaces MATCH in Phase 0b
runs: [ research, triage, plan_program, plan_implementation ]
run_ids: []
agent_column_values: []
forbidden_tokens_found: []
squad_devrel_present: <true|false>    # dispositive
squad_reviewer_present: <true|false>  # dispositive
squad_lead_present:   <true|false>    # ambiguous — does not alone determine FAIL
new_issues_only: true                 # labels scoped to issues created by THIS run
verdict: PASS|PARTIAL|FAIL
epics_produced: <n>                   # observational only
scope_note: "task-level Agent binding only; epic-level owner minting not covered"
notes: ""
```

---

# Follow-on (SEPARATE) — #1779 / PR #1787 sibling-epic refill

> ⚠️ **This is NOT part of E4.** It has its own criterion, its own path, and its own risk
> profile. **E4's pass/fail is purely #1784.** Do not let this dilute it, and do not report a
> combined verdict.

If Phase 1 produced ≥2 sibling epics, the resulting tree is *also* the shape needed to exercise
#1779 — a genuine efficiency win, since no fixture has had it yet. Reuse it **only after** E4
has returned its own verdict.

### Criterion (independent of E4's)

- ✅ **PASS** — after tasks under Epic A are exhausted, the worker **dispatches work from
  sibling Epic B** rather than exiting green with free slots.
- ❌ **FAIL** — worker completes its cycle, free slots exist, Epic B's tasks remain open and
  unstarted, no further dispatch.

Sketch: merge a leaf under Epic A, then confirm the worker surfaces Epic B's work.
Cross-reference the `#1779` decision rule and the `#1772`-vs-`#1779` discriminator in the
runbook — #1779 produces tasks that were **never dispatched**; #1772 produces dispatches that
were **probe-only**. They can coexist; check both.

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
| **#1784** | Owner/Agent binding fix (#1759) ineffective live — the defect under test |
| **#1759** | The original binding fix — structurally correct, failed live |
| **#1779** | Sibling-epic refill boundary — follow-on only |
| **PR #1787** | Refill dispatch slots from the root, not the parent epic |
| `squad-e2e-runbook.md` | Long-path budget, entry sequence, unattended-path table, gotchas #1–#10 |
