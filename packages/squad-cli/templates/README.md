# `.squad/templates/` — What Lives Here and Why

This directory is **read at runtime** by the Squad coordinator and agents. Do not delete files
from it — doing so breaks coordinator behavior that depends on lazy-loading these references.

If you want to customize coordinator behavior, edit the relevant file here. On `squad upgrade`,
files marked squad-owned are overwritten; user-customizable overrides are preserved.

---

## File Categories

### Coordinator on-demand references
Loaded lazily by the coordinator when a matching situation arises (e.g. when running a
ceremony, spawning with worktree isolation, or building the session init checklist). The
coordinator's system prompt says "On-demand reference: Read `.squad/templates/<file>`" for each
of these — they are NOT loaded on every turn.

| File | Read by | Situation |
|------|---------|-----------|
| `after-agent-reference.md` | Coordinator | Collecting results after agent work |
| `casting-reference.md` | Coordinator | Init Mode or adding/recasting team members |
| `ceremony-reference.md` | Coordinator | Running team ceremonies |
| `client-compatibility-reference.md` | Coordinator | CLI / VS Code / App platform differences |
| `constraint-tracking.md` | Coordinator | Tracking budget constraints in a session |
| `copilot-agent.md` | Coordinator | Adding @copilot as a team member |
| `human-members.md` | Coordinator | Adding a human to the team roster |
| `issue-lifecycle.md` | Coordinator | GitHub Issues Mode — issue → PR → merge flow |
| `mcp-config.md` | Coordinator | MCP server integration details |
| `model-selection-reference.md` | Coordinator | Per-agent model and reasoning-effort selection |
| `multi-agent-format.md` | Coordinator | Assembling multi-agent artifact output |
| `orchestration-log.md` | Scribe | Writing per-agent orchestration log entries |
| `plugin-marketplace.md` | Coordinator | Plugin marketplace discovery and install flow |
| `prd-intake.md` | Coordinator | PRD Mode — ingesting a spec for decomposition |
| `ralph-reference.md` | Coordinator | Ralph work-monitor lifecycle and board format |
| `raw-agent-output.md` | Coordinator | Raw agent output appendix format |
| `session-init-reference.md` | Coordinator | Procedures run at every session start |
| `spawn-reference.md` | Coordinator | Full agent spawn template and Ghost Protocol |
| `worktree-reference.md` | Coordinator | Worktree strategies, lifecycle, and pre-spawn setup |

### Agent bootstrap templates
Used **once** by `squad init` or when `squad upgrade` / coordinator code creates a new agent.
After the agent's own files are seeded, these templates are not read again at runtime.

| File | Used to seed |
|------|-------------|
| `charter.md` | New agent `charter.md` when a team member is added |
| `copilot-instructions.md` | `.github/copilot-instructions.md` for the repo |
| `fact-checker-charter.md` | `agents/fact-checker/charter.md` |
| `fact-checker-policy.md` | `agents/fact-checker/policy.md` (Fact Checker methodology) |
| `history.md` | New agent `history.md` when a team member is added |
| `rai-charter.md` | `agents/Rai/charter.md` |
| `rai-policy.md` | `agents/Rai/policy.md` (RAI check taxonomy) |
| `roster.md` | Roster entry format guidance for `team.md` |
| `run-output.md` | Standard run output format for agent responses |
| `scribe-charter.md` | `agents/scribe/charter.md` |
| `skill.md` | Skeleton for new skill files under `.github/skills/` |

---

## Invariant

Nothing should be added to `.squad/templates/` without also being registered in the CLI's
`TEMPLATE_MANIFEST` (`packages/squad-cli/src/cli/core/templates.ts`) as **either**:

1. A **runtime input** (coordinator reads it by path) — include the reader and situation in
   the on-demand table above.
2. A **bootstrap template** (used once to seed a generated file) — include the target in the
   bootstrap table above.

If a file in this directory is neither, it is a stale copy and safe to remove. See #1436 for
the cleanup tracker.

---

## Historical note — `workflows/` and `skills/` subtrees

Earlier Squad versions copied `.github/workflows/` and `.github/skills/` content into
`.squad/templates/workflows/` and `.squad/templates/skills/` as well. Those copies were never
read at runtime — they were stale duplicates. The `TEMPLATE_MANIFEST` now routes workflows
directly to `.github/workflows/` and skills directly to `.github/skills/`. If your project
still has these subdirectories under `.squad/templates/`, they are safe to delete. See #1436.
