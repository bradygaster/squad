# Session: v0.3.0 GitHub-Native Design
**Date:** 2026-02-10
**Requested by:** bradygaster

## Summary

Brady declared v0.3.0 is ONE feature: all Squad planning moves to GitHub Issues. Four agents designed the complete system.

## Who Worked

| Agent | Work Product | Summary |
|-------|-------------|---------|
| **Keaton** | Proposal 032 (core design + sections 11-13) | Designed proposals-as-issues system. Added migration plan (42 proposals, 3 waves), Actions automation layer (7 workflows), and working-in-the-open policy (public artifacts, private team state). |
| **Fenster** | Proposal 032a (provider abstraction) | Designed prompt-level provider abstraction architecture. `## Platform` replaces `## Issue Source` in team.md. Capability negotiation per provider. Day 1 = GitHub only. No JavaScript abstraction — coordinator handles via command templates. |
| **Kujan** | Proposal 032b (Actions automation) + Proposal 031 (CCA E2E test) | Designed 7 GitHub Actions workflows as opt-in templates. Phase 1 ships 3 standalone workflows; Phase 2 adds CCA dispatch after governance validation. Also wrote CCA E2E test design (Proposal 031). Discovered that CCA governance must be self-contained in squad.agent.md since .ai-team/ is gitignored. |
| **Verbal** | Proposal 032c (label taxonomy) | Designed complete label taxonomy: 39 labels, 7 namespaces, formal state machine with defined transitions. Full migration mapping for all 44 existing proposals. Labels are the API surface shared by Actions, CCA, and humans. |

## Key Decisions

1. v0.3.0 is ONE feature — proposals become GitHub Issues (all other items deferred)
2. Provider abstraction is prompt-level command templates, not JavaScript interfaces
3. Octomember agent deferred — coordinator handles git platform ops directly
4. Agent comments use signature blocks, not bot accounts
5. Actions ship as opt-in templates in `templates/workflows/`
6. Labels drive the entire workflow — 39 labels across 7 namespaces
7. CCA governance must be self-contained in squad.agent.md (can't read .ai-team/)
8. Working in the open: collaborative artifacts public, team state private
9. Migration uses three-wave approach (active → shipped → superseded/deferred)
10. Microsoft Teams is preferred async comms platform

## Directives Captured

- All planning moves to GitHub — no more markdown proposal files
- Labels must reflect REAL state (no fake/placeholder states)
- v0.3.0 sole feature: proposals as GitHub Issues
- Microsoft Teams preference for async comms
