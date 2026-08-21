# E4 — Agent-Binding Verification (#1784)

> **Author:** Sims (E2E Test Engineer)
> **Written:** 2026-08-21, from the E3 long-path rehearsal
> **Status:** ⛔ **NOT YET EXECUTED — this is a post-merge procedure.**

---

## ⛔ Read this before anything else

**This procedure has not been run. #1784 is NOT verified.**

State confirmed at time of writing:

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
- **`squad:lead` is ambiguous.** Keaton's Role column literally reads "Lead / Architect". So
  `squad:lead` could be **role-column derivation** *or* prohibition-copying. It does not
  discriminate between the two failure modes.

### ⇒ Verdict is three-way, not binary

| Verdict | Condition | Meaning |
|---|---|---|
| ✅ **PASS** | No `squad:devrel` **and** no `squad:lead` (or any other role-derived token). Every `Agent` value is a roster **Name** or `@copilot`. | Fix is effective. |
| ⚠️ **PARTIAL** | No `squad:devrel`, but `squad:lead` (or another role-column token) still appears. | Prohibition-copying **is fixed**. A second, distinct defect — role-column derivation — remains. **File it separately. Do not revert the fix.** |
| ❌ **FAIL** | `squad:devrel` appears anywhere in `Agent` values or minted labels. | Prohibition-copying is **not** fixed. #1784 stands. |

> 🛑 **Why three-way matters:** a binary criterion scores PARTIAL as FAIL, which would argue for
> reverting a fix that genuinely worked. The `devrel`/`lead` asymmetry is the only thing that
> separates "the fix didn't work" from "the fix worked and there's a second bug." Do not
> collapse it.

### Accepted `Agent` values

**Valid:** `Keaton`, `McManus`, `Fenster`, `Hockney`, `Kint`, or `@copilot` (explicit fallback
per `:913` when no cast member fits).

**Invalid — any of these is a finding:** `Lead`, `DevRel`, `Reviewer`, `Architect`, `Backend`,
`Frontend`, `Test`, `DevOps`, `Platform`, or any lowercased/`squad:`-prefixed form thereof.

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
$b = gh api "repos/$FIXTURE/contents/.github/workflows/squad.md" --jq '.content' 2>$null
$txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))
Write-Host "main squad.md length: $($txt.Length)"    # sanity: ~56 KB, NOT ~6.6 KB

# Confirm the OLD concrete-token prohibition is gone (whatever Procedures replaced it with,
# the literal forbidden tokens should no longer appear verbatim in the prohibition).
Write-Host "contains literal 'DevRel' : $($txt.Contains('DevRel'))"
Write-Host "contains literal 'squad:lead' : $($txt.Contains('squad:lead'))"
```

> Interpretation: if the fix works by **removing the concrete tokens** from the prohibition,
> both should read `False`. If Procedures chose a different strategy (e.g. restructuring the
> instruction while keeping examples), these may still read `True` — that is not itself a
> failure. **Read the actual fix in the PR before interpreting this check.** The authoritative
> criterion remains the live output in Phase 3, not the prompt text.

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

### 3b. Minted labels — corroborating evidence

```powershell
Write-Host "`n=== All squad: labels in fixture ==="
gh label list --repo $FIXTURE --limit 200 --json name `
    --jq '.[] | select(.name | startswith("squad:")) | .name' 2>$null
```

Compare against the roster. **Every `squad:{x}` must have `{x}` = a lowercased roster Name**
(`keaton`, `mcmanus`, `fenster`, `hockney`, `kint`).

> Note: at `plan implementation` the plan is proposed but labels are typically minted later,
> at `plan activate`. A clean label list here is **weaker** evidence than a clean `Agent`
> column. **The `Agent` column is authoritative for E4.** If the label list is clean but the
> `Agent` column is dirty, that is a **FAIL** — the leak just hasn't propagated yet.

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
squad_lead_present:   <true|false>    # ambiguous — does not alone determine FAIL
verdict: PASS|PARTIAL|FAIL
epics_produced: <n>                   # observational only
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
