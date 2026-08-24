---
'@bradygaster/squad-sdk': patch
---

Refuse consult mode when git's `info/exclude` resolves outside the project

`setupConsultMode` hides `.squad/` by appending to git's `info/exclude`, but resolved that
path with `git rev-parse --git-path info/exclude`, which answers for whichever repository
*encloses* the directory. From a linked worktree, or from a directory that is not itself a
repository root, the write landed on another checkout's exclude file — hiding `.squad/`
across the main checkout and every sibling worktree. Because `info/exclude` is untracked
and per-clone, nothing in the repo could undo it.

`setupConsultMode` now verifies the exclude belongs to a repository rooted at
`projectRoot` and refuses otherwise, pointing the caller at the main checkout. A new
`isExcludeOwnedBy()` export performs that containment check.

Writing to a worktree-local exclude is not an alternative: git keeps no per-worktree
`info/exclude`, and a file placed at `.git/worktrees/<id>/info/exclude` is never read.
