# Routing Rules — Mission Control

> **One primary owner. One advisory reviewer. Spawn the minimum sufficient set.**
> Ownership below is derived from trailing 180-day commit activity against real
> repository paths, cross-checked with each agent's `## What I Own` charter section.

## Work Type → Agent

| Work Type | Agent | Examples |
|-----------|-------|---------|
| Core runtime | EECOM 🔧 | CopilotClient, adapter, casting, tools module, spawn orchestration |
| Prompt architecture | Procedures 🧠 | Agent charters, spawn templates, coordinator logic, roles/presets catalog |
| Type system | CONTROL 👩‍💻 | Discriminated unions, generics, tsconfig, strict mode, declaration files, builders |
| SDK integration | CAPCOM 🕵️ | @github/copilot-sdk usage, CopilotSession lifecycle, platform/comms connectors |
| Runtime performance | GNC ⚡ | Streaming, async iterators, session state, storage, memory, event loop health |
| Tests & quality | FIDO 🧪 | Test coverage, Vitest, edge cases, quality gates, adversarial testing, PR blocking |
| Docs & messaging | PAO 📣 | README, docs site, API docs, getting-started, demos, tone review |
| Architecture & review | Flight 🏗️ | Product direction, architectural decisions, code review, scope/trade-offs |
| Distribution | Network 📦 | npm packaging, esbuild config, CLI bootstrap core, upstream resolution, marketplace |
| Release management | Surgeon 🚢 | Semantic versioning, GitHub Releases, changelogs, dev→main merges, release gating |
| CI/CD & publish pipeline | Booster ⚙️ | GitHub Actions workflows, publish.yml, automated validation gates |
| Security & PII | RETRO 🔒 | Hook design (file-write guards, PII filters), security review, secret management |
| CLI UX & visual design | INCO 🎨 | Interaction design, copy, spacing, affordances, UX gates, remote-control UI, brand |
| Aspire & observability | Telemetry 🔭 | OTel bridge/metrics, Aspire dashboard command, OTLP integration, span design |
| VS Code integration | GUIDO 🔌 | VS Code Extension API, runSubagent compatibility, editor↔terminal parity |
| REPL & shell | VOX 🖥️ | Interactive shell, session dispatch, streaming pipeline, remote-control bridge |
| TUI implementation | DSKY 🖥️ | Terminal components, layout, input handling, focus management, rendering perf |
| Terminal E2E tests | Sims 🧪 | node-pty harness, Gherkin features, frame snapshots, UX gate test suite |
| SDK usability | Handbook 📖 | JSDoc, LLM discoverability, API surface clarity, migration guides |

## Module Ownership

**Primary** is the single accountable owner: they make the change and are answerable for it.
**Secondary** is an *advisory reviewer only* — consulted for design input and review, never
co-assigned to implement. A module has exactly one primary. Never spawn both for the same task.

| Module | Primary | Secondary |
|--------|---------|-----------|
| `packages/squad-cli/src/cli/commands/` | EECOM 🔧 | INCO 🎨 |
| `packages/squad-cli/src/cli/core/` | Network 📦 | EECOM 🔧 |
| `packages/squad-cli/src/cli/shell/` | VOX 🖥️ | DSKY 🖥️ |
| `packages/squad-cli/src/cli/shell/components/` | DSKY 🖥️ | VOX 🖥️ |
| `packages/squad-cli/src/cli/templates/` | Procedures 🧠 | Network 📦 |
| `packages/squad-cli/src/remote-ui/` | INCO 🎨 | VOX 🖥️ |
| `packages/squad-sdk/src/adapter/` | EECOM 🔧 | CAPCOM 🕵️ |
| `packages/squad-sdk/src/agents/` | Procedures 🧠 | EECOM 🔧 |
| `packages/squad-sdk/src/build/` | CONTROL 👩‍💻 | Network 📦 |
| `packages/squad-sdk/src/builders/` | CONTROL 👩‍💻 | Handbook 📖 |
| `packages/squad-sdk/src/casting/` | EECOM 🔧 | Procedures 🧠 |
| `packages/squad-sdk/src/client/` | CAPCOM 🕵️ | EECOM 🔧 |
| `packages/squad-sdk/src/config/` | CONTROL 👩‍💻 | EECOM 🔧 |
| `packages/squad-sdk/src/coordinator/` | Procedures 🧠 | Flight 🏗️ |
| `packages/squad-sdk/src/hooks/` | RETRO 🔒 | EECOM 🔧 |
| `packages/squad-sdk/src/marketplace/` | Network 📦 | EECOM 🔧 |
| `packages/squad-sdk/src/memory/` | GNC ⚡ | RETRO 🔒 |
| `packages/squad-sdk/src/platform/` | CAPCOM 🕵️ | EECOM 🔧 |
| `packages/squad-sdk/src/presets/` | Procedures 🧠 | EECOM 🔧 |
| `packages/squad-sdk/src/ralph/` | EECOM 🔧 | Procedures 🧠 |
| `packages/squad-sdk/src/remote/` | VOX 🖥️ | GNC ⚡ |
| `packages/squad-sdk/src/roles/` | Procedures 🧠 | CONTROL 👩‍💻 |
| `packages/squad-sdk/src/runtime/` | GNC ⚡ | EECOM 🔧 |
| `packages/squad-sdk/src/runtime/otel*` | Telemetry 🔭 | GNC ⚡ |
| `packages/squad-sdk/src/sharing/` | Network 📦 | EECOM 🔧 |
| `packages/squad-sdk/src/skills/` | Procedures 🧠 | PAO 📣 |
| `packages/squad-sdk/src/state/` | GNC ⚡ | CONTROL 👩‍💻 |
| `packages/squad-sdk/src/storage/` | GNC ⚡ | CONTROL 👩‍💻 |
| `packages/squad-sdk/src/streams/` | GNC ⚡ | VOX 🖥️ |
| `packages/squad-sdk/src/tools/` | EECOM 🔧 | CAPCOM 🕵️ |
| `packages/squad-sdk/src/upstream/` | Network 📦 | Surgeon 🚢 |
| `packages/squad-sdk/src/utils/` | CONTROL 👩‍💻 | EECOM 🔧 |
| `packages/squad-sdk/src/index.ts` | CONTROL 👩‍💻 | Flight 🏗️ |
| `packages/squad-cli/src/cli/commands/aspire.ts` | Telemetry 🔭 | EECOM 🔧 |
| `test/` | FIDO 🧪 | EECOM 🔧 |
| `test/acceptance/` | Sims 🧪 | FIDO 🧪 |
| `docs/` | PAO 📣 | Handbook 📖 |
| `.changeset/` | Surgeon 🚢 | Booster ⚙️ |
| `.github/workflows/` | Booster ⚙️ | FIDO 🧪 |
| `.squad/` | Flight 🏗️ | Procedures 🧠 |
| `packages/squad-cli/src/` | Network 📦 | EECOM 🔧 |
| `packages/squad-sdk/src/` | CONTROL 👩‍💻 | EECOM 🔧 |

**More specific path wins.** `packages/squad-sdk/src/runtime/otel*` beats
`packages/squad-sdk/src/runtime/`; `packages/squad-cli/src/cli/shell/components/` beats
`packages/squad-cli/src/cli/shell/`.

**The last two rows are catch-alls.** They are the least specific entries and exist so that
no path is ever unowned — any file not matched by a more specific row (loose top-level files
such as `cli-entry.ts`, `resolution.ts`, `state-backend.ts`, or a newly added directory)
routes to that package's fallback owner. Adding a specific row always overrides the fallback;
if a fallback owner is picking up a directory repeatedly, that is the signal to give the
directory its own row.

## Engagement Tiers

| Tier | Meaning | Members |
|------|---------|---------|
| **Standing** | Spawned when their work type or owned module is in scope. | All members not listed below. |
| **On-Demand** | Spawned only when explicitly named, or when their stated trigger fires. | Handbook 📖, GUIDO 🔌 |

**Evidence:** Handbook and GUIDO are the only two members that own no module in the table
above, and the only two with zero commits against `.squad/agents/{name}/` in the trailing
90 days (last activity: March 2026). Their domains — SDK doc quality and VS Code parity —
are real but episodic, and each overlaps a standing owner (PAO for docs, VOX/EECOM for
dispatch). On-demand preserves both roles intact rather than forcing a merge on thin evidence.

**On-demand triggers (objective):**

- **Handbook 📖** — a PR changes the public API surface (`packages/squad-sdk/src/index.ts`
  or any exported signature in `builders/`, `roles/`, `presets/`), or introduces a breaking change
  requiring a migration guide.
- **GUIDO 🔌** — a PR touches VS Code extension code, `runSubagent` compatibility, or a bug
  reproduces in the editor but not the terminal.

On-demand is a *dispatch* setting, not a status change. Both remain `active` in the casting
registry with intact charters and history. Reverse by moving the row back to Standing.

## Routing Principles

1. **Minimum sufficient dispatch.** Spawn the fewest agents that can complete the task.
   Default is **one agent** — the module's primary owner. Do not spawn anticipatory or
   "could usefully start" work.
2. **Default fan-out cap: 2.** A single dispatch spawns at most 2 domain agents (plus Scribe).
   Exceeding 2 requires an explicit `"Team, ..."` request from Brady, or a task that provably
   spans 3+ modules with different primaries — name the modules when you do it.
3. **Work-in-progress cap: 3.** At most 3 domain agents may be in flight at once, and at most
   1 in-flight task per agent. If the cap is reached, queue the work and say so. Scribe
   (background) and Ralph (monitor) do not count against the cap.
4. **One primary, one reviewer.** The primary owner implements. The secondary is advisory:
   consulted for review, never co-dispatched to implement the same change. If a task needs
   the secondary's hands, reassign the primary — do not run both.
5. **Quick facts → coordinator answers directly.** Don't spawn for trivial questions,
   file lookups, or status.
6. **Two agents could handle it → tie-break, in order:**
   1. Module ownership table (most specific matching path wins).
   2. Work Type table.
   3. Trailing 90-day activity in the affected paths — the more recently active owner takes it.
   4. Flight decides. Flight's call is final and is recorded in the dispatch note.
   No task waits on an unresolved tie; apply the rules in order and move.
7. **Stop conditions — end the dispatch and report instead of spawning more:**
   - The acceptance criteria in the originating request are met.
   - Two consecutive agent turns produce no new file changes.
   - The same file has been edited by 2+ different agents in one wave (ownership conflict —
     escalate to Flight, do not add a third).
   - The change set exceeds 20 files or shows deletions nobody requested.
   - An agent reports blocked, or a required input is missing.
   - The WIP cap in §3 is reached.
8. **Doc-impact check → PAO, after merge-readiness, not during implementation.**
   Batch doc review into one PAO pass per PR rather than per commit.
9. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
   Scribe's **DispatchGuard** audit mode is opt-in, not automatic: spawn it only when someone
   asks for a dispatch-compliance audit and a ledger exists under
   `.squad/orchestration-log/dispatchguard/`. There is no standing session-start bootstrap.
10. **Ralph consumes DispatchGuard verdicts when they exist.** If a DispatchGuard audit has run,
    Ralph's work-monitor loop reads
    `.squad/orchestration-log/dispatchguard/verdicts-{SESSION_ID}.jsonl` and alerts the
    coordinator on `warn`/`block` verdicts. No verdicts file means nothing to consume — Ralph
    does not spawn an audit to create one.
