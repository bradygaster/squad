---
---

ci: add comment spam protection and auto-lock stale issues

New CI workflow that filters malicious links and mass-mentions in comments,
scores newly opened issues for spam, and auto-locks closed issues/PRs
inactive for 30+ days.
