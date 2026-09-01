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
| `copilot-instructions.md` | `.github/copilot-instructions.md` for the repo || `fact-checker-charter.md` | `agents/fact-checker/charter.md` |
| `fact-checker-policy.md` | `agents/fact-checker/policy.md` (Fact Checker methodology) |
| `history.md` | New agent `history.md` when a team member is added |
| `rai-charter.md` | `agents/Rai/charter.md` |
| `rai-policy.md` | `agents/Rai/policy.md` (RAI check taxonomy) |
| `roster.md` | Roster entry format guidance for `team.md` |
| `run-output.md` | Standard run output format for agent responses |
| `scribe-charter.md` | `agents/scribe/charter.md` |
| `skill.md` | Skeleton for new skill files under `.github/skills/` |

`README.md` — this file — is the one top-level entry in neither table above. It is not a
runtime input and seeds nothing; it ships as this directory's own documentation, arriving in
a project through the same recursive copy, and is registered in `TEMPLATE_MANIFEST` so
`squad upgrade` keeps it current. Classified here rather than left unlisted, since the
Invariant below requires every top-level file to be accounted for.

### Subtrees

`squad init` copies this directory **recursively**, so every subtree below ships into
`.squad/templates/` in a new project. None of them are stale, and none should be deleted
wholesale — each has a distinct consumer.

| Subtree | Kind | Consumer |
|---------|------|----------|
| `casting/` | Runtime input | Custom-universe character lists, read during Init Mode casting when a user names a universe that has no built-in list. See `casting-reference.md` for the casting algorithm. Deleting it removes those name pools. |
| `identity/` | Bootstrap template | Seeds `.squad/identity/now.md` and `wisdom.md`. Registered in `TEMPLATE_MANIFEST` under `identity/`. |
| `scripts/` | User copy-source | Documented for users to copy from — `cp -r .squad/templates/scripts/notes/ scripts/notes/` (see the state-backends doc). |
| `skills/` | Bootstrap template | Source for skills the `TEMPLATE_MANIFEST` installs **to `.github/skills/`** (destinations are `../.github/skills/...`). The installed copy under `.github/skills/` is what agents load. |
| `workflows/` | User copy-source | Documented for users to copy from — `cp .squad/templates/workflows/*.yml .github/workflows/` (see the CI/CD integration doc). |

---

## Invariant

Anything added to the **top level** of `.squad/templates/` should be classified as **either**:

1. A **runtime input** (coordinator reads it by path) — include the reader and situation in
   the on-demand table above.
2. A **bootstrap template** (used once to seed a generated file) — include the target in the
   bootstrap table above.

New top-level files should also be registered in the CLI's `TEMPLATE_MANIFEST`
(`packages/squad-cli/src/cli/core/templates.ts`) so `squad upgrade` can maintain them.

**Absence from these tables means unclassified, not stale.** Do not treat it as license to
delete. The tables above are not yet a complete inventory of what ships here, and several
top-level files are consumed in ways neither table records — `notes-protocol.md`, for
example, is not in either table and is not manifest-registered, yet the state-backends doc
tells users to `cp .squad/templates/notes-protocol.md .squad/notes-protocol.md`. Removing a
file requires positive evidence that nothing reads or copies it; classify first, and only
then remove. See #1436 for the cleanup tracker.

This rule does **not** extend to the subtrees above: each is accounted for in the subtree
table, and absence from the two top-level tables does not make a subtree stale. New subtrees
must be added to the subtree table.

---

## Historical note — `skills/` subtree

Earlier Squad versions copied `.github/skills/` content into `.squad/templates/skills/` and
agents were expected to load it from there. That is no longer how it works: the
`TEMPLATE_MANIFEST` installs skills **to `.github/skills/`**, and that installed copy is the
one agents load. The `skills/` subtree here remains the *source* for that install, so it must
not be deleted from this directory. See #1436.
