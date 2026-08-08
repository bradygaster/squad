---
"@bradygaster/squad-cli": patch
---

Fix #1639: `squad watch`'s self-pull capability stashed uncommitted local changes before `git pull --ff-only`, but only popped the stash back if the pull succeeded — a thrown pull error (diverged history, no tracking branch, network failure) jumped past the pop and reported success anyway, leaving the user's local changes sitting in `git stash` with nothing in the round output saying so. Restructured so the stash-pop always runs regardless of pull outcome, and a stash that genuinely can't be restored now comes back as a failed capability result instead of a silent success.
