# Session: 2026-02-18 v0.4.2 Insider Program Scoping

**Requested by:** bradygaster

## Summary

Scoped v0.4.2 release (Insider Program) vs. v0.5.0 backlog. Keaton analyzed all open v0.5.0 issues; only #93 (docs) and new #94 (insider infrastructure) are v0.4.2 candidates. All other work stays in v0.5.0.

## What Happened

1. **Keaton** analyzed v0.5.0 issues (#69 rename, #76 GHE refactor, #62 CI/CD hardening, #86 CCA research, #87 GHE research). Decision: only #93 and #94 move to v0.4.2; everything else stays v0.5.0.

2. **Kobayashi** produced v0.4.2 Insider Program TL;DR:
   - Branch strategy (insider/* branches)
   - CI/CD changes (matrix testing)
   - CLI updates (help text, version bumps)
   - Docs updates (insider guide)
   - Community setup (docs/announcements, GitHub discussions)
   - Effort: ~3–4 hours total

3. **Created resources:**
   - Issue #94 (Insider Program infrastructure) — Kobayashi owner
   - Relabeled #93 to `release:v0.4.2`
   - Created label `release:v0.4.2`
   - Added #93 and #94 to project board

4. **Previous session work:**
   - Moved `team-docs/proposals/` contents to `docs/proposals/`
   - Deleted empty `team-docs/` directory

## Decisions

- v0.4.2 scope: #93 (docs) + #94 (insider infrastructure)
- v0.5.0 contains: #69, #76, #62, #86, #87, all other features
- Insider Program is testing infrastructure for v0.5.0 work

## Key Outcomes

- Clear separation of v0.4.2 vs v0.5.0 scope
- v0.4.2 unblocks early insider testing without coupling to v0.5.0 breaking changes
- #94 tracked as primary v0.4.2 work; #93 is secondary docs fix

---

**Signed:** Session logged by Scribe  
**Date:** 2026-02-18
