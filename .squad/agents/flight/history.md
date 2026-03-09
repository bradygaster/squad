# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Learnings

**Updated now.md to reflect post-v0.8.24 state:** Apollo 13 team, 3931 tests, Tamir's active branches across 5 feature streams (remote-control, hierarchical-squad-inheritance, ralph-watch, project-type-detection, prevent-git-checkout-data-loss).

**Updated wisdom.md with 4 patterns + 2 anti-patterns from recent work:** Test name-agnosticism for team rebirths, dynamic filesystem discovery for evolving content, cli-entry.ts unwired command bug pattern, bump-build.mjs version mutation timing, invalid semver formats, git reset data loss.

**Adoption monitoring strategy (2026-03-09):** Designed 3-tier system for tracking Squad adoption. Key decisions: (1) Tier 1 uses free GitHub API + npm API + GitHub Actions for daily reports — ships this week, zero cost. (2) Tier 2 is manual social monitoring (X/Twitter/LinkedIn) because API access costs $200+/month or is partner-only — 15min/week is cheaper. (3) Tier 3 (enterprise tools like Brandwatch) only justified at 10x current scale. Report format includes actionable metrics (issues needing response, PRs needing review) not just vanity numbers. GitHub MCP server already available for code search. Ralph could extend to auto-flag new adopters. API constraints: GitHub 5k req/hour authenticated, npm unlimited, X/Twitter search requires $200/month Enterprise tier, LinkedIn API restricted to partners. Implementation path: scripts/adoption-monitor.ts + .github/workflows/adoption-report.yml → writes to adoption-reports/{date}.md or GitHub Discussions. Estimated 6 hours (Flight + Network). Pragmatic over perfect — 80% coverage at zero cost.
