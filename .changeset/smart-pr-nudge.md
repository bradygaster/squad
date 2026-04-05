---
---

ci: add smart PR nudge for stale PRs

New workflow that runs on weekdays and posts actionable diagnoses on PRs
stale for 7+ days. Checks CI status, unresolved threads, missing reviews,
outdated branches, and draft status. Won't nudge the same PR twice per week.
