---
---

ci: scope boundary enforcement for repo-health PRs

New CI check that fails repo-health PRs if they modify product source
code under packages/*/src/. Enforces separation between infrastructure
and product changes.
