---
author: Data
date: 2026-08-13
status: decided
references:
  - "PR #1699"
  - "PR #1698 (v0.12.0 dev -> main promotion, unblocked by this)"
  - "PR #1415 (tools: ['*'] fix, verified already on dev)"
---

# Decision: restore shared ancestry between dev and main via merge, dev-wins conflict policy

## Context

`dev` and `main` had unrelated git histories. `dev`'s root commit (`4c5772c5`, a
dependabot bump dated 2026-07-13) shares no ancestor with `main`'s root
(`f4830e48`, 1722 commits). `dev` itself has 196 commits. `git merge-base
upstream/dev upstream/main` returned nothing and `git merge-tree` refused
outright. This made the v0.12.0 promotion PR (#1698, `dev` -> `main`) flatly
unmergeable, with no way to review a normal diff. The v0.11.0 promotion
(2026-06-29) predates the July 13 reset, which is why it worked and why
#1698 was the first to hit this wall.

## Decision

Merge `upstream/main` into `dev` with `--allow-unrelated-histories`, resolving
every one of the 275 conflicts in `dev`'s favor, on a new branch
`squad/restore-main-ancestry`, landed via PR #1699 into `dev`.

Rejected alternative: rebasing `dev` onto `main`. `dev` carries a
`non_fast_forward` ruleset that blocks the force-push a rebase requires, and a
rebase would rewrite all 196 commits on `dev`, invalidating every PR currently
open against it. A merge is additive only and needs no force-push.

## Why dev-wins conflict resolution is safe

All 275 conflicts were `add/add` (identical path on both branches, no common
base to 3-way merge from). Resolved every one with `git checkout --ours` (dev's
content). This is safe because the only `main`-only code fix that mattered,
#1415 (`tools: ['*']` in `.github/agents/squad.agent.md`), was verified already
present on `dev` before starting the merge, so dev-wins loses zero code.
Verified the resolution was a true no-op against dev's pre-merge tree: diffing
all 275 resolved files plus the 48 removed changesets plus the 6 auto-merged
files against dev's HEAD showed only 18 real changes total, exactly the
files deliberately kept (see below). Confirmed unchanged post-merge:
`package.json` / `packages/squad-cli/package.json` / `packages/squad-sdk/package.json`
(all `0.12.0`), `CHANGELOG.md` (`## [0.12.0] - 2026-08-12` intact),
`test/gh-aw-quality.test.ts` (#1697 fix intact), `workflows/squad.md` and
`workflows/squad-implement-worker.md` (#1682 feature intact).

## What was restored (kept from main, lost in the July 13 reset)

7 docs pages:
- docs/src/content/blog/015-wave-2-the-repl-moment.md
- docs/src/content/blog/032-v010-stabilisation-insider.md
- docs/src/content/blog/033-swe-bench-lite-results.md
- docs/src/content/docs/features/remote-control.md
- docs/src/content/docs/get-started/choosing-your-path.md
- docs/src/content/docs/guide/personal-squad.md
- docs/src/content/docs/guide/shell.md

5 decision records:
- .squad/decisions/inbox/booster-ci-deletion-guard.md
- .squad/decisions/inbox/booster-release-skill-v094.md
- .squad/decisions/inbox/flight-versioning-policy.md
- .squad/decisions/inbox/procedures-fix-coordinator-inline-dispatch-gate.md
- .squad/decisions/inbox/retro-copilot-git-safety.md

Plus 6 files that auto-merged cleanly via a genuine 3-way merge (not a
conflict), appending older history from main onto dev's existing content with
no loss on either side: `.squad/agents/{eecom,fido,flight,pao,procedures}/history.md`
and `.squad/decisions.md`.

## What was dropped

48 `.changeset/*.md` files that arrived from `main`. These are spent: their
content is already consumed into `CHANGELOG.md`'s `[0.12.0]` entry, and
re-adding them risked tripping the Changeset Drift check. `.changeset/` after
this merge contains exactly what `dev` had before: `README.md`,
`config.json`, `max-reasoning-effort.md`.

## Validation

Static/diff verification was thorough (see above). Dynamic validation
(`npm run build`, `npx vitest run`) could **not** be executed in this sandbox:
the corporate npm proxy does not mirror `eslint-plugin-n@18.3.0` (its cache
tops out at 18.2.2) and there is no direct route to the public npm registry
from this environment. Confirmed unrelated to the merge:
`package-lock.json`'s staged content is byte-identical to dev's pre-merge
HEAD, and this exact dependency/version was already in dev's lockfile before
any of this work. CI (which has full registry access) is the source of truth
for build/test validation on PR #1699.

## Outcome

`git merge-base <this-branch> upstream/main` now succeeds, confirming `dev`
has a real common ancestor with `main` again. This unblocks PR #1698 and
prevents the same failure on future promotions, provided the new release-process
skill gate (verify `git merge-base dev main` before starting release-prep) is
followed going forward.
