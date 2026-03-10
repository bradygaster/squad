# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Learnings

**Updated now.md to reflect post-v0.8.24 state:** Apollo 13 team, 3931 tests, Tamir's active branches across 5 feature streams (remote-control, hierarchical-squad-inheritance, ralph-watch, project-type-detection, prevent-git-checkout-data-loss).

**Updated wisdom.md with 4 patterns + 2 anti-patterns from recent work:** Test name-agnosticism for team rebirths, dynamic filesystem discovery for evolving content, cli-entry.ts unwired command bug pattern, bump-build.mjs version mutation timing, invalid semver formats, git reset data loss.

📌 **Team update (2026-03-10T12-55-49Z):** Adoption tracking architecture finalized. Three-tier system approved: Tier 1 (aggregate-only, `.github/adoption/`) shipping with PR #326; Tier 2 (opt-in registry) designed for next PR; Tier 3 (public showcase) launches when ≥5 projects opt in. Append-only file governance rule enforced to prevent data loss. Microsoft ampersand style guide adopted for all user-facing documentation.

### PR #331 Review — Boundary Review Pattern Reinforced (2026-03-10)
Approved PR #331 ("docs: scenario and feature guides from blog analysis") for merge. PAO's boundary review (remove external infrastructure docs, reframe platform features to clarify scope, keep Squad behavior/config docs) was executed correctly. Key decisions: (1) ralph-operations.md and proactive-communication.md deleted — both document infrastructure around Squad, not Squad itself; (2) issue-templates.md reframed to clarify "GitHub feature configured for Squad" not "Squad feature"; (3) reviewer-protocol.md Trust Levels section kept — documents user choice spectrum within Squad's existing review system. Litmus test pattern: if Squad doesn't ship the code/config, it's IRL content. Docs-test sync maintained. Pattern reinforced as reusable boundary review heuristic for future doc PRs.

**Adoption tracking architecture — three-tier opt-in system:** `.squad/` is for team state only, not adoption data (boundary pattern). Move tracking to `.github/adoption/`. Never list individual repos without owner consent — aggregate metrics only until opt-in exists. Tier 1 (ship now) = aggregate monitoring. Tier 2 (design next) = opt-in registry in `.github/adoption/registry.json`. Tier 3 (launch later) = public showcase once ≥5 projects opt in. Monitoring infra (GitHub Action + script) is solid — keep it. Privacy-first architecture: code search results are public data, but individual listings require consent.
