# Windows Test Baseline

**Author:** EECOM (Core Dev)
**Measured:** 2026-08-21
**Baseline commit:** `369bba8f` (`dev` tip at time of measurement)
**Host:** Windows, Node via vitest 4.1.10, non-Windows-Terminal console
**Checkout topology:** git **worktree** (`C:\src\copilot-worktrees\squad\...`, main checkout `C:\src\squad`)

> **Why this document exists.** Three times this workstream has been bitten by
> *reports nothing → mistaken for passing*. `check-changeset-drift.test.ts` ran
> **0 of 8 tests** for a month while everyone read it as environment noise. This
> baseline removes the ambiguity: it states exactly what red is expected, and
> separates suites that **failed assertions** from suites that **never ran**.

---

## 1. The number

**⚠️ SUPERSEDED — read §"the count is not stable run-to-run" below before using this
number.** The figure below was a single measurement presented as a constant. It is
not one. Three later runs at the same commit gave 9, 8 and 7. **Treat the failing
*set* as the signal, not the total.** A single-number baseline would have sent the
first anomaly tomorrow on an hour-long phantom chase.

**On Windows at commit `369bba8f`, in a git worktree, on a non-Windows-Terminal console:**

```
Test Files   9 failed | 264 passed | 1 skipped (274)
Tests       15 failed | 7431 passed | 42 skipped | 47 todo
```

**Anything beyond that is new.**

Linux CI on the same tree is **fully green — 274/274 files passed** (run `32461944794`).
Every failure below is therefore Windows-and/or-topology specific *by construction*.

### The number moves for three reasons — know which one you hit

The single-number baseline is a lie unless you also state the environment. Three
independent modifiers change the count *without any code changing*:

| Modifier | Effect | Verified |
| --- | --- | --- |
| Running in **Windows Terminal** (`WT_SESSION` set) | `repl-ux.test.ts` **passes** → **8 failed**, 14 tests failed | ✅ measured both ways |
| Running in a **plain clone** instead of a worktree | `acceptance.test.ts` init failure disappears → one fewer | ⚠️ mechanism proven, not re-run in a plain clone |
| **#1790 merged AND working tree renormalized** | 3 suites go green → **6 failed** | ✅ measured (see §4) |

If you see a count other than 9, **check these three before declaring a regression.**

### ⚠️ CORRECTION — the count is not stable run-to-run

Added after three additional full runs. **The failing *set* varies between identical
runs on the same commit.** Measured:

| Run | Files failed | Set |
| --- | --- | --- |
| Baseline (§1) | **9** | incl. `promote-insider-tag`, `patch-esm-imports` |
| With #1794 fix applied | **8** | `scheduler` gone (fixed); `template-sync` + `consumer-imports` **appeared** |
| Control, #1794 stashed | **7** | `template-sync`, `consumer-imports`, `promote-insider-tag`, `patch-esm-imports` all absent |

`template-sync`, `consumer-imports`, `promote-insider-tag` and `patch-esm-imports`
move in and out between runs. **All of them pass in isolation** (340 passed when the
first two are run alone).

So the honest baseline for tomorrow is a **range conditioned on tree state**, not a
number:

> **On an un-renormalized tree: expect 7–9 failed files.**
> **On a renormalized tree against merged `dev`: expect 7 files / 10 tests** (→ **6**
> once #1802 merges).
> **Anything ≥ 10, or any file outside the known set below, is new.**
> Treat the *set* as the signal, not the count.

Known-to-move set (re-run before believing a delta here): `template-sync`,
`consumer-imports`, `promote-insider-tag`, `patch-esm-imports`.

EOL-dependent — **fail only on an un-renormalized tree**, and are *not* noise:
`check-changeset-drift`, `mjs-shebang-loadable`. See the red block below.

Stable set: `cli-packaging-smoke`, `plugin-extensibility`, `repl-ux`, `acceptance`,
`cli/watch-capabilities`, `init-scaffolding` (the #1796 guard, see §7)
(+ `scheduler` until #1802 merges).

**`template-sync` — retracted prediction, and it is NOT fixed.**

⚠️ **An earlier revision of this document predicted #1798 would stabilise
`template-sync`. That prediction was wrong. It is retracted.**

Flight ran the full suite with #1798 applied and `template-sync` still failed, with a
mechanism unrelated to the writer #1798 removed:

```
FAIL  test/template-sync.test.ts > dynamic template enumeration (all synced files)
Error: Command failed: node scripts/sync-templates.mjs
Error: EBUSY: resource busy or locked, open
  'packages\squad-sdk\templates\skills\nap\SKILL.md'
  at copyFile (scripts/sync-templates.mjs:76:3)
```

**I then confirmed it independently against merged `dev`** (#1798 is merged —
`TEST_ROOT` is `tmpdir()` on `dev`). `template-sync` failed on one full run and
**passed** on the next, with no code change between them. So it is not a branch
artifact and not deterministic: the writer #1798 removed is gone and the flake remains.

The confirmed mechanism is `template-sync.test.ts`'s **own** `beforeAll`, which shells
out to `scripts/sync-templates.mjs`. That script writes **65 files into the live
working tree** — verified locally, `📋 Synced 65 file(s) from .squad-templates/` —
while 273 other test files run in parallel workers, and collides with `EBUSY` on
whichever template another suite happens to hold open. **The suite is its own
counterparty.**

The #1796 byte-compare race is retained as a *possible second* contributor, but as a
**hypothesis with its evidence, not a closed case**. Two independent races in one
suite is entirely consistent with a suite that writes 65 files into a shared tree.

> **Do not read this as "fixed."** `template-sync` remains in the moving set.

This correction is worded carefully on purpose. The original `beforeAll` comment in
that file *diagnosed a race, named the wrong counterparty, and closed the case* — and
that is precisely why the bug survived. A correction that repeats the shape of the
thing it corrects is worth nothing.

The other three movers remain **UNKNOWN** — likely parallel-worker interaction, not
verified. Filed as #1803.

This is the most operationally important line in the document: **a flaky suite is
indistinguishable from a real regression at 9am.** Do not chase a single-file delta
inside the known-to-move set; re-run first.

### 🔴 READ THIS FIRST TOMORROW — the #1788 guard fails on an un-renormalized tree

Measured on merged `dev` (post-#1790, post-#1798), in this existing worktree:

```
FAIL test/scripts/mjs-shebang-loadable.test.ts  (18 tests | 13 failed)
FAIL test/scripts/check-changeset-drift.test.ts [ load error — 0 tests ]
```

**This is #1793 manifesting, and it will look exactly like "the #1788 fix is broken."
It is not.** Booster's guard landed and is working correctly — it is *supposed* to go
red on a tree whose `.mjs` files are still CRLF. Verified state on disk:

```
git ls-files --eol scripts/check-changeset-drift.mjs
  i/lf  w/crlf  attr/text eol=lf     ← attribute merged, working tree still CRLF
  113 CRLF pairs in the first 4KB
```

**Controlled proof — one variable flipped, nothing else:**

| | Before renormalize | After forced re-checkout |
| --- | --- | --- |
| `mjs-shebang-loadable` | **13 failed** / 5 passed | **18 passed** |
| `check-changeset-drift` | **load error, 0 tests** | **8 passed** |

26 tests recovered by changing only the bytes on disk. `w/crlf` → `w/lf`.

**Remediation (do this before the first run tomorrow):**

```powershell
git ls-files -- '*.mjs' | % { Remove-Item -LiteralPath $_ -Force }
git checkout -- .
git ls-files --eol scripts/check-changeset-drift.mjs   # must show w/lf
```

A plain `git checkout --` on an unmodified file is a **no-op** and does nothing; the
file must be deleted first to force re-checkout. This is the single most likely
source of a false alarm tomorrow morning.

### Post-renormalize numbers on merged `dev`

Same tree, immediately after the renormalize above:

```
Test Files   7 failed | 269 passed | 1 skipped (277)
Tests       10 failed | 7508 passed
```

So against **merged `dev`, renormalized**: expect **7 failed files / 10 failed tests**.
`#1802` will remove `scheduler`'s 4 → expect **6 files** once it merges.

---

## 2. Load failures vs assertion failures — read this first

These two look nearly identical in vitest output and are completely different in consequence.

| Class | What it means | Coverage |
| --- | --- | --- |
| **Assertion failure** | The suite loaded, ran its tests, some assertions were false | Real |
| **LOAD FAILURE** | The suite **never ran a single test**. `Tests: no tests` | **Silently zero** |

**At `369bba8f` there are 2 load failures and 1 partial-load failure — 3 suites in
the #1788 family, not 1.** Two of them were previously unknown.

| Suite | Tests it *should* run | Tests it actually ran |
| --- | --- | --- |
| `test/scripts/check-changeset-drift.test.ts` | 8 | **0** |
| `test/promote-insider-tag.test.ts` | 15 | **0** |
| `test/cli/patch-esm-imports.test.ts` | 6 | 6 loaded, but **3 die with the same `SyntaxError`** |

That is **23 tests of enforcement with zero effective coverage on Windows**, plus 5
more failing from the same root cause.

---

## 3. Triage table

| # | Test file | Failure mode | Pre-existing? | Windows-only? | Mechanism | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `test/scripts/check-changeset-drift.test.ts` | **LOAD FAILURE — 0 of 8 tests**, `SyntaxError: Invalid or unexpected token` | Yes | Yes | CRLF shebang in imported `scripts/check-changeset-drift.mjs`; Vite's shebang stripping doesn't survive `\r`, leaving a bare `#` as first token | **real-defect** — filed as #1788, fix open as #1790 |
| 2 | `test/promote-insider-tag.test.ts` | **LOAD FAILURE — 0 of 15 tests**, same `SyntaxError` | Yes | Yes | Identical to #1, via `scripts/promote-insider-tag.mjs` | **real-defect** — *previously unknown*; covered by #1790's fix + guard test |
| 3 | `test/cli/patch-esm-imports.test.ts` | 5 of 6 fail; **3 with `SyntaxError`**, 2 with `expected false to be true` | Yes | Yes | Identical to #1, via `packages/squad-cli/scripts/patch-esm-imports.mjs` | **real-defect** — *previously unknown, and previously mislabeled as "ESM patching noise"* |
| 4 | `test/scheduler.test.ts` | 4 assertion failures (`success` false, `code` undefined, `stderr` empty) | Yes | Manifestation only | `LocalPollingProvider.execute` does `entry.task.ref.trim().split(/\s+/)` — **no quote handling**. Test ref embeds `process.execPath` = `C:\Program Files\nodejs\node.exe`; the space splits the command, spawn ENOENTs | **real-defect** — genuine cross-platform argv bug, *not* "scheduler timing" |
| 5 | `test/cli-packaging-smoke.test.ts` | 1 assertion: `squad --version` returns `''` with exit 0 | Yes | Yes | 2000 ms `execFileSync` timeout exceeded on Windows cold start. Harness catch-block maps `err.killed`/`SIGTERM` to **`exitCode: 0`**, so a hang is indistinguishable from success | **real-defect** — harness converts hangs into passes |
| 6 | `test/plugin-extensibility.test.ts` | `EPERM: operation not permitted, symlink` — throws in test *setup* | Yes | Yes | Windows requires Developer Mode/elevation to create symlinks | **expected-noise** — but see caveat below |
| 7 | `test/repl-ux.test.ts` | 1 assertion: expected `──────────`, got ASCII `------` | Yes | **Terminal-dependent, not OS-dependent** | `terminal.ts:84` — `supportsUnicode: plat !== 'win32' \|\| Boolean(process.env['WT_SESSION'])`. Production is behaving **correctly**; the test hardcodes the Unicode glyph | **expected-noise** (test-side platform assumption) |
| 8 | `test/cli/watch-capabilities.test.ts` | 1 assertion: expected `StringContaining ".squad/ralph-instructions.md"`, got `"\some\repo\.squad\ralph-instructions.md"` | Yes | Yes | Production builds the path with `path.join` (correct on Windows); the test asserts a POSIX-separator substring | **expected-noise** (test-side) |
| 9a | `test/acceptance/acceptance.test.ts` › *Init in existing project* | Expected `Squad initialized`, got `⚠ Git worktree detected / Main checkout: C:\src\squad` | Yes | **NO — worktree-only** | `init.ts:208` worktree guard fires because `.git` is a **file** (worktree) and the main checkout already has `.squad/`. Git topology, not OS | **expected-noise in a worktree** — would not reproduce in a plain clone |
| 9b | `test/acceptance/acceptance.test.ts` › *Consult blocked in squadified project* | Expected `No personal squad found`, got `This project already has a .squad/ directory…` | Yes | **Unknown** | `setupConsultMode` throws a different error than the feature file expects. Ruled out: `~/.squad` does **not** exist here, so the obvious "developer has a personal squad" explanation is **wrong**. Ordering difference between `SquadifiedProjectError` and `PersonalSquadNotFoundError` not isolated | **UNKNOWN** — see §6 |

### Caveat on #6 (`plugin-extensibility`)

The mechanism is a genuine OS limitation, so the verdict is *expected-noise*. But
the consequence is not benign: the test is named **"rejects symlinked plugin source
files before install writes state"** — a **security guard** — and it throws during
*setup*, so the guard is **never exercised on Windows**. Same "silently zero
coverage" family as #1788, different cause. It should `skip` explicitly with a
stated reason rather than error, so it is visibly-unverified instead of
indistinguishable-from-broken.

---

## 4. #1790 will not fix your working tree — proven

`.gitattributes` governs **checkout**, not files already on disk. Merging #1790
adds `*.mjs text eol=lf`, but git does **not** rewrite existing working-tree files
whose index content is unchanged.

Measured here by temporarily applying #1790's `.gitattributes` line:

```
i/lf    w/crlf  attr/text eol=lf      packages/squad-cli/scripts/patch-esm-imports.mjs
i/lf    w/crlf  attr/text eol=lf      scripts/promote-insider-tag.mjs

Test Files  1 failed (1)
     Tests  no tests            <-- still zero. Attribute applied, disk still CRLF.
```

`core.autocrlf = true`, index is already LF, so the attribute alone changes nothing
on disk. #1790 renormalizes only the 9 `.mjs` files that were stored **CRLF in the
index**; the 3 suites above are not among them.

**After pulling #1790, force a re-checkout of the `.mjs` files** or the three suites
stay red and it will look like the fix failed:

```powershell
# targeted
Remove-Item scripts\promote-insider-tag.mjs, scripts\check-changeset-drift.mjs, packages\squad-cli\scripts\patch-esm-imports.mjs -Force
git checkout -- scripts/promote-insider-tag.mjs scripts/check-changeset-drift.mjs packages/squad-cli/scripts/patch-esm-imports.mjs

# or repo-wide
git rm --cached -r . ; git reset --hard
```

Verified result:

```
i/lf    w/lf    attr/text eol=lf      packages/squad-cli/scripts/patch-esm-imports.mjs
i/lf    w/lf    attr/text eol=lf      scripts/promote-insider-tag.mjs

Test Files  2 passed (2)
     Tests  21 passed (21)
```

**Verify with `git ls-files --eol '*.mjs'` — you want `w/lf`, not `w/crlf`.**

#1790's guard test (`test/scripts/mjs-shebang-loadable.test.ts`) scans **every**
tracked shebanged `.mjs` and reads raw bytes, so it will cover #2 and #3 as well as
#1. That design is correct and needs no change.

---

## 5. Controlled proofs

Every mechanism above marked *real-defect* was proven by flipping one variable and
re-running — not by reading code.

| Claim | Experiment | Result |
| --- | --- | --- |
| #1/#2 are CRLF, not "environment" | Convert both `.mjs` to LF, re-run | `0 tests` → **23 passed (2 files)** |
| #3 is the *same* bug, not "ESM patching" | Convert `patch-esm-imports.mjs` to LF, re-run | **5 failed → 6 passed** |
| #7 is terminal-, not OS-dependent | Set `WT_SESSION`, re-run | **110 passed (0 failed)** |
| #1790 alone doesn't repair a checkout | Apply the attribute, re-run without re-checkout | still **`no tests`** |
| Re-checkout is the missing step | Delete + `git checkout --`, re-run | **21 passed** |

Raw full-run output archived at
`~/.copilot/session-state/a70ee969-.../files/full-test-run.txt`.

---

## 6. Unknowns — stated plainly

An unknown reported as expected-noise is exactly how #1788 survived a month.
**One item is unresolved:**

**9b — `acceptance.test.ts` › "Consult blocked in squadified project".**
The feature file expects `No personal squad found`; the CLI emits the *squadified*
error instead. Linux CI is green, so the error ordering differs by environment. The
obvious explanation (a personal squad at `~/.squad` short-circuiting the check) is
**disproven** — `C:\Users\bradyg\.squad` does not exist. I did not isolate the real
cause.

Recommended controlled experiment: run
`npx vitest run test/acceptance/acceptance.test.ts` in (a) a plain clone on Windows
and (b) this worktree, with `SQUAD_HOME`/`HOME` pinned identically, and diff which
branch of `setupConsultMode` throws. Until then this is **unknown**, not noise.

**Also not fully isolated:** 9a is classified worktree-only from mechanism
(`init.ts:208` reads `.git`-as-file, which is platform-independent) plus green Linux
CI. It was **not** re-run in a plain Windows clone. Confidence high, proof partial.

---

## 7. Working-tree side effects of `npm test`

Running the suite **mutates tracked files**. Check `git status --short` after every
run and restore before committing. These are **two different bugs** with different
mechanisms, owners and risk levels — do not treat them as one.

| File | Mutation | Mechanism | Risk | Owner |
| --- | --- | --- | --- | --- |
| `.github/agents/squad.agent.md` | Version stamp rewritten `0.0.0-source` → `0.13.0` | **Content change.** Init walks up to the real git root and `stampVersion()` rewrites the tracked file | 🔴 **High** — a broad `git add` commits a spurious version bump | #1796 — **PARTIALLY fixed, see below** |
| `test/__snapshots__/parser-contracts.test.ts.snap` | Working copy flips CRLF → LF | **Pure EOL, zero content lines.** File is `i/lf w/crlf`; vitest writes LF. The #1793 CRLF class | 🟡 Cosmetic — no content risk | folded into **#1790** |
| `docs/pagefind.yml`, `samples/**/*.sh`, `templates/**/*.ps1` | CRLF ↔ LF churn | **Pure EOL** — confirmed via `git diff --ignore-cr-at-eol` returning empty | 🟡 Cosmetic — but noisy; never stage | #1793 class |

### ⚠️ #1796 is NOT fully fixed — verified on merged `dev`

PR #1798 removed **one** writer (`init-scaffolding.test.ts`'s in-repo sandbox). The
mutation still happens. Measured on merged `dev`, after a full `npm test`:

```
git status --short
 M .github/agents/squad.agent.md

git diff -- .github/agents/squad.agent.md
-<!-- version: 0.0.0-source -->
+<!-- version: 0.13.0 -->
-- **Version:** 0.0.0-source (see HTML comment above ...
+- **Version:** 0.13.0 (see HTML comment above ...
```

**The guard I added in #1798 is the detector, and it is correctly red:**

```
FAIL test/init-scaffolding.test.ts > repository working tree is not mutated
     by this suite (#1796) > tracked squad.agent.md files are byte-unchanged
```

Decisive discriminator: that guard **passes in isolation** (`26 passed`) and **fails
in the full suite**. So the remaining writer is a *different suite* running in a
parallel worker — not `init-scaffolding` itself.

**The pattern is far wider than one file.** At least **16** suites build their sandbox
inside the repo via `join(process.cwd(), ...)` — `cli/cast`, `cli-global`,
`dual-root-resolver`, `effective-squad-dir`, `cli/doctor`, `memory-governance`,
`memory-providers`, `personal-squad`, `presets`, `resolution`, `cli/remote-mode`,
`cli/state-mcp`, `real-cli-ab`, `init`, `sharing`, `state-backend`. Any of them that
runs `init`/`upgrade` in a sandbox lacking its own `.git` will walk up to the real
repository and stamp it. #1798 fixed one instance of a recurring pattern.

**Filed as #1807.** Not closed by #1798.

> **Practical rule for tomorrow: after any `npm test`, run `git status --short` and
> restore `.github/agents/squad.agent.md` before staging anything. Never `git add -A`.**

Note both suites **pass while doing it**. A fully green suite silently mutating
tracked source is the seventh instance of the silent-success class tonight.

The `.snap` fix (`*.snap text eol=lf`) is deliberately **not** in #1798: per §4 the
attribute repairs no existing checkout, so shipping it separately would strand a
second file needing a second remediation. Folded into #1790 it rides the same
renormalize.

`npm run build` additionally rewrites to `-build.N` versions:
`package.json`, `package-lock.json`, both `packages/*/package.json`, and both
`packages/*/templates/skills/release-process/SKILL.md`. **Never commit any of these.**

---

## 8. Reconciliation with Procedures' independent run

Procedures independently measured **9 failing files, all pre-existing** on his #1784
branch. My count on clean `369bba8f` is also **9**. The counts agree — **no evidence
of flakiness at the file level**, which is itself a useful result for tomorrow.

His categorization does **not** survive verification:

| His category | Actual |
| --- | --- |
| "ESM patching" | `patch-esm-imports.test.ts` is the **#1788 CRLF bug**, third instance — not an ESM-patching quirk |
| "scheduler timing" | Not timing. `LocalPollingProvider` splits a command string on whitespace with **no quote handling**; any path with a space is unrunnable |
| "Windows path separators" | Accurate for `watch-capabilities` only |

Two of three category labels were wrong, and both wrong ones concealed real defects.
That is the #1788 failure shape repeating: **a plausible grouping is not a diagnosis.**

---

## 9. Filed issues

One issue per defect — deliberately not batched.

| Table row | Finding | Issue |
| --- | --- | --- |
| §4 | #1790 doesn't repair existing working trees; needs a forced re-checkout | **#1793** |
| 4 | `LocalPollingProvider` splits `task.ref` on whitespace without quote handling | **#1794** |
| 5 | Packaging-smoke harness maps timeouts to `exitCode: 0`, masking hangs | **#1795** |
| §7 | `npm test` mutates tracked files | **#1796** |

**Not filed — already owned:** rows 1, 2, 3 all resolve to #1788 / #1790. Rows 2 and 3
were previously unknown instances, but #1790's global `*.mjs text eol=lf` rule and its
byte-level guard test (`test/scripts/mjs-shebang-loadable.test.ts`, which scans *every*
tracked shebanged `.mjs`) cover them without modification. Filing separate issues would
be duplicates. **The residual that #1790 does not cover is #1793.**

**Not filed — correctly classified as noise:** rows 6, 7, 8, 9a.
Row 6 carries a recommendation (make the symlink test `skip` explicitly rather than
error, so an unverifiable security guard is visibly-unverified) but the mechanism is a
genuine OS limitation, not a defect in our code.

**Not filed — unknown:** row 9b. See §6. It gets an issue once the cause is isolated;
filing an issue that says "something differs by environment" would be noise.

---

## 10. How to use this tomorrow

1. Record the commit you are testing. This baseline is only valid for `369bba8f`.
2. Note your console (`$env:WT_SESSION`) and topology (worktree vs clone).
3. Expect **9 failed / 264 passed / 1 skipped**, adjusted by the modifiers in §1.
4. **Grep the output for `no tests` and `Tests  no tests` first.** A suite that
   loads zero tests is a dead gate, not a passing gate.
5. Any failure not in §3 is new. Treat it as a regression until proven otherwise.
