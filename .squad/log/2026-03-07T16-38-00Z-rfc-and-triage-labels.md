# Session Log: RFC and Triage Labels

**Date:** 2026-03-07  
**Time:** 16:38:00Z  
**Agents:** Keaton (Lead), McManus (DevRel)  
**Topic:** Actions→CLI RFC publication + comprehensive issue triage

## Summary

Parallel agent work: Keaton filed Actions→CLI migration RFC (#252); McManus applied triage labels to all 23 open issues.

## Keaton: RFC #252 Filed

- Problem: Squad's 15 GitHub Actions workflows consume API quota and surprise users
- Solution: Migrate 5 squad-specific workflows (12 min/mo) to CLI commands, keep 9 CI/CD workflows (215 min/mo, load-bearing)
- Model: Tiered adoption (Tier 1: zero-actions default, Tier 2: opt-in, Tier 3: enterprise)
- Timeline: v0.8.22 (CLI + deprecation), v0.8.23 (cleanup tools), v0.9.0 (remove workflows)
- Principle: "Zero surprise automation" — users control Squad, Squad doesn't control users
- Implementation: Blocked until community feedback period closes

## McManus: Triage Complete

- Labeled all 23 open issues with squad/release/status/type/priority labels
- Created 25 missing labels across 5 categories
- Closed #194 (completed), #231 (duplicate)
- v0.8.22 scope: 10 issues; v0.8.23+ backlog: 11 issues

## Decisions Merged

- Keaton's RFC decision moved to `.squad/decisions.md`

## Cross-Agent Updates

- Keaton's history: RFC filing noted
- McManus's history: Triage completion noted
