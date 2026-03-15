# Flight

## Core Context

Team: Apollo 13 (20 members). Test baseline: 3,931 tests. Tamir's active feature streams: remote-control, hierarchical-squad-inheritance, ralph-watch, project-type-detection, prevent-git-checkout-data-loss.

## Patterns

**Boundary review:** IRL content (external infrastructure, community implementations) vs Squad docs (features Squad ships). Litmus test: if Squad doesn't ship the code/config, it's IRL content.

**Adoption tracking architecture:** Three-tier opt-in system. .squad/ is team state only, not adoption data. Tier 1 (aggregate metrics in .github/adoption/), Tier 2 (opt-in registry), Tier 3 (public showcase when ≥5 projects opt in).

**Remote Squad access:** Three-phase rollout. Phase 1: GitHub Discussions bot with /squad command. Phase 2: GitHub Copilot Extension (fetches .squad/ via API). Phase 3: Slack/Teams bot.

**Distributed mesh integration:** Zero code changes to existing modules, zero CLI commands, mesh.json stays separate from squad.config.ts. Convention-first additive layer — invisible if unused.

**Sprint prioritization:** Rank by (1) bugs with active user impact, (2) quality/test gaps blocking GA release, (3) high-ROI features unblocking downstream work. Interleave categories to balance stability with velocity.
