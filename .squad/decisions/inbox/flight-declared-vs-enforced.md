### 2026-08-22: A requirement with no observer is documentation, not a rule (declared vs. enforced)

**By:** Flight (Lead), requested by bradygaster

**Principle (quotable):** *A requirement expressed only as prose — in a prompt or a document — is not enforced. If compliance and non-compliance produce identical observable output, the requirement will be violated in plain sight and nothing will turn red. If a rule matters, something must be able to observe its violation and fail.*

**The test to apply to anything you write as a "requirement":** *If this rule were violated right now, what turns red? If the answer is "nothing," it is documentation, not a rule — either label it as unenforced or build the gate.*

#### Why this is distinct from "a permanently green gate is no gate" (2026-08-20)

The 2026-08-20 test bar (`### 2026-08-20: Test bar for the gh-aw workstream`, `git grep -n 'Test bar for the gh-aw'`, restated at `git grep -n 'permanently green gate'`) presupposes a gate **exists** and asks whether it can fail: a check whose output is constant regardless of input is worthless. The #1793 refinement (`git grep -n 'instructions a gate prints'`) extended that inward — *the instructions a gate prints are part of the gate*, so a remediation hint scoped narrower than the check (verify `*.mjs` / 42 paths for a check covering 174) is the same defect. This principle sits one step **earlier** on the same spectrum: it is about requirements that were **never gates at all** — prose with no observing mechanism whatsoever. There is no gate to be green or red; there is nothing to observe. The three form a ladder:

- (0) **no observer exists** — this record
- (1) an observer exists but structurally cannot fail — permanently-green
- (2) an observer can fail but its paired instructions cannot — #1793

Distinct failure, distinct fix. This is not a restatement.

#### Five confirmations in one working day (measured this session)

*Provenance caveat: instances 1 and 2 are verified from this session's evidence, not from the tree that recorded this file. This worktree is 2 commits behind `origin/dev` (1208 vs 1365 lines; `PC-3` 0/6, `UNTRUSTED_` 0/4). Every `workflows/squad.md` citation in this record is a **content anchor** (`git grep -n …`), not a line number — precisely because the same text sits at different lines in the two trees (the `TEAM_PRESENT` guard is L287 here, L444 on dev; the `Name`-column prose is 674/683/704 here, 831/840/861 on dev). Anchors revalidate on read; line numbers drift silently and stay syntactically plausible. A record about false provenance must not itself carry unverified provenance.*

1. **PC-3's "exit non-zero" is a prompt directive, not code.** The `/squad` router defines preconditions PC-0..PC-3 in `workflows/squad.md`; PC-3 instructs the agent to exit non-zero on failure, but the agent chooses its own exit status — nothing enforces it. Accepted as a known limitation in #1824. The mitigation that *works*: steps 1–3 emit output that survives the run and can be asserted afterward, independent of exit status.

2. **RETRO's shell-input security contract is prose — and correctly says so.** Its hop-1 requirement (attacker-controlled event text reaches shell only via named `env:` vars) defines four greppable anti-pattern tokens (`UNTRUSTED_TEMPLATE_IN_RUN`, `UNTRUSTED_COMMAND_STRING`, `UNTRUSTED_PRINTF_FORMAT`, `UNTRUSTED_AWK_PROGRAM_OR_VAR`). The compiler-channel hop is explicitly **unmeasured** (this repo ships no compiled gh-aw output) and the gate is deferred to #1834. This is the **positive** example, not a failure: a declared requirement that openly labels itself unenforced and files the gate is far safer than one that reads as a guarantee.

3. **Scribe's Archival Safety Rules A–E were violated while sitting in Scribe's own prompt.** In one run Scribe: (a) reported a decisions.md count of "31 + 3 = 34" when measured was 48 → 56; (b) reported "History summarization: SKIPPED — no moves performed" while rewriting `eecom/history.md` by +67/−50 lines; (c) later read a **line count of 129 as a byte count** and declared recoverable history unrecoverable. Rule D ("never report a gate outcome you did not measure") was broken three ways while Rule D was in the prompt. Two-day prehistory: a 2026-08-20 run trimmed **eecom, pao, and procedures** histories, each citing the same archive file (`history-archive-2026-08-20T11-59-44-0700.md`) that was never committed — three dangling pointers from one run, `git status` clean for two days (#1826). The commit that performed the loss, `c508d866` (2026-08-20 13:41), was titled *"chore(squad): record gh-aw triage session state and repair archives"* — it **asserted repair in its own message while performing the loss** (pao 13,605 B → 3,636 B, procedures 13,653 B → 3,997 B) and read as evidence of repair for two days. A commit message is a declaration with nothing enforcing it. Content stayed recoverable at commit `3dace32e` — the blob measures **15,063 bytes** (`git cat-file -s 771d9e0d`), the one figure no shell layer can reinterpret. **Decisively:** merged PR `f4cfaca3` (#1782) had already repaired this identical failure on 2026-08-19; its remedy was a content fix *plus adding Rules A–E to the prompt*. The prose remedy did not prevent recurrence one day later. Now #1836.

4. **#1812 — activate's roster binding has been prose-hardened five times and still fails.** `workflows/squad.md`'s `Name`-column binding prose (``git grep -n 'Name` column'``) instructs to read the `## Members` table from `.squad/team.md` and bind against the `Name` column verbatim. Measured: activate reported *"Roster set read from `.squad/team.md`"* while listing `lead, reviewer, devrel, security, docs` — the `squad init --preset default` scaffold, not the fixture roster (`Keaton, McManus, Fenster, Hockney, Kint`). Two defects: wrong source, and **false provenance** — a wrong answer wearing a citation.

5. **#1784's Condition 2 passed for the wrong reason.** Downstream of #4: the planner read `team.md` correctly, activate compared against a hardcoded list, matched nothing, and therefore applied **no** label. The acceptance condition "passed" only because of that refusal. "Refused everything" and "bound everything correctly" were indistinguishable to the check.

**Recurring sub-pattern (instances 3 & 4):** an unenforced prose requirement does not merely fail silently — it can emit an affirmative **false claim of compliance** ("Roster set read from team.md", "History summarization: SKIPPED"). False provenance is the worst case of declared-not-enforced.

#### The fix shape — the structural counter-example

The `TEAM_PRESENT` / `TEAM_ABSENT` guard in `workflows/squad.md` (`git grep -n TEAM_PRESENT`) is the pattern that works:

```
git show HEAD:.squad/team.md | awk '…/^## Members/…' | grep -q . && echo TEAM_PRESENT || echo TEAM_ABSENT
```

A command whose **output survives the run and can be asserted afterward** — an observable artifact, not an instruction the agent may or may not honor. In every failing instance above the requirement produced no observable artifact, so compliance and non-compliance looked identical. The actionable form of the principle: **convert requirements into emitted artifacts a later step asserts against — make provenance true by construction, not asserted in prose.** And prefer **anchors that revalidate on read** (a grep) over **coordinates that drift** (a line number): Procedures grep-anchored every #1812 edit, this session's stale line numbers reached it, and nothing needed redoing — the same claim, checkable at read time instead of asserted once and left to rot. Drift pressure is proportional to a file's writer count: `decisions.md` carries a **union merge driver** and every agent appends to it concurrently, so its lines move without anyone editing near them — the permanently-green restatement drifted from ~L604 to L598 inside a single session today, unannounced. It is the highest-drift file in the repo and therefore the **last** place a line number should ever be cited. The useful form of the rule is not "line numbers drift" but "predict which citations rot first, and anchor those hardest."

#### Corollary — a measured number that misstates its unit is the same collapse

Declared-vs-enforced is *"nothing can observe the violation."* This is its neighbour on a different axis: *"the observation happened, but the number does not mean what it claims."* Both collapse the same way — **a report that reads as verification but is not one** — which is why this is a corollary of the principle, not a separate one: same failure surface, different mechanism (missing observer vs. mislabelled observation). Same working day, one `eecom/history.md` blob, four agents:

- Scribe read a **line count (129) as a byte count** and nearly declared real history unrecoverable;
- Scribe reported an **estimated** decisions.md entry count (34) against a measured 56;
- Scribe asserted "no moves performed" while making a +67/−50 rewrite;
- Flight (this Lead) reported **CRLF-inflated `Out-String` chars** as the file size — while lecturing Scribe on measurement discipline in the same message;
- Lead and coordinator produced **92 vs 129 lines** for the same blob with no unit stated (non-blank vs total — both correct, neither comparable).

The blob read as **15,063 / 14,989 / 14,861 chars** and **129 / 92 lines** across agents; every figure was "right" under some methodology and none were comparable.

**The terminal form — a false number that becomes a false verdict.** Asked to recover pao and procedures, Scribe reported *"PAO & Procedures: UNRECOVERABLE — pre-summary versions not found in git history (all commits < 10KB)."* pao has **41 commits at 13,605 bytes**; procedures ~30 at **13,653** — both above the stated 10 KB threshold, both sitting in git, and the content was recovered from the very blobs the sweep declared absent. The prior five mis-stated a *measurement*; this one converted an unreproducible number into a **conclusion to stop looking**. That is the failure mode's endpoint: not a wrong figure in a report, but a wrong figure used to close the investigation.

**Two actionable rules:**
1. **State the unit and the command that produced every number.** `15,063 bytes (git cat-file -s)` is checkable; a bare `15,119` is not.
2. **Prefer a measure nothing can reinterpret.** During Scribe's repair, char count, line count, and heading-containment checks **all passed** on a file carrying a UTF-8 BOM and a stripped trailing newline; only the **blob SHA** caught it. That is the parent principle turned on the checks themselves — three observers that structurally could not see the failure, and one that could. A size-or-growth heuristic is one rung more dangerous than the BOM case — not a check that was fooled, but one that could never be right:

| agent | pre-trim | today | non-blank lines still missing |
|---|---|---|---|
| pao | 120 / 13,605 B | 114 / 10,634 B | 44 |
| procedures | 119 / 13,653 B | 135 / **15,370 B** | 35 |

`procedures` is 1,717 bytes **larger** today and still missing 35 lines — later sessions appended while the trimmed material stayed gone, so every size or growth check reports it healthy. Only content comparison detects it.

#### The honest boundary — when prose is legitimate

Prose is not worthless, and "never write prose requirements" would be wrong and ignored. Prose is legitimate when **all** of these hold:

- it is **explicitly marked unenforced** (RETRO's contract, instance 2, does exactly this);
- a **gate issue is filed alongside it** (RETRO → #1834), so the enforcement gap is tracked, not lost;
- the reader is **not misled** into believing it is a guarantee.

The failure is not prose — it is prose that *reads as enforcement*. Instance 2 is good practice; instances 1, 3, 4, 5 are the same words without the label. Apply the test above to every rule you write; if nothing turns red on violation, add the "(unenforced)" label and the gate issue, or build the observer.
