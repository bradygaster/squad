# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Learnings

**Updated now.md to reflect post-v0.8.24 state:** Apollo 13 team, 3931 tests, Tamir's active branches across 5 feature streams (remote-control, hierarchical-squad-inheritance, ralph-watch, project-type-detection, prevent-git-checkout-data-loss).

**Updated wisdom.md with 4 patterns + 2 anti-patterns from recent work:** Test name-agnosticism for team rebirths, dynamic filesystem discovery for evolving content, cli-entry.ts unwired command bug pattern, bump-build.mjs version mutation timing, invalid semver formats, git reset data loss.

**Distributed Mesh integration architecture guidance:** Analyzed Andi's distributed-mesh extension (git-as-transport, 3-zone model, sync scripts, SKILL.md). Mapped integration into Squad: skill files in templates/skills/, scripts in scripts/mesh/, docs in features/distributed-mesh.md. Clarified relationships — sharing/export-import is snapshot-based (complementary), multi-squad.ts is local resolution (orthogonal), streams are label partitioning within repos (composable), remote/bridge is human-to-agent PWA control (mesh replaces agent-to-agent use cases). Decision: Zero code changes to existing modules, zero CLI commands, mesh.json stays separate from squad.config.ts. Mesh integrates as convention-first additive layer — invisible if unused, composes cleanly when needed. The 125:1 ratio (30 lines of script vs. 3,756 lines of deleted federation code) holds. Architecture validated by 3-model consensus remains intact.
