# Mission Control — squad-sdk

> The programmable multi-agent runtime for GitHub Copilot.
> *"Failure is not an option."*

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Engagement | Status |
|------|------|---------|------------|--------|
| Flight | Lead | `.squad/agents/flight/charter.md` | Standing | ✅ Active |
| Procedures | Prompt Engineer | `.squad/agents/procedures/charter.md` | Standing | ✅ Active |
| EECOM | Core Dev | `.squad/agents/eecom/charter.md` | Standing | ✅ Active |
| FIDO | Quality Owner | `.squad/agents/fido/charter.md` | Standing | ✅ Active |
| PAO | DevRel | `.squad/agents/pao/charter.md` | Standing | ✅ Active |
| CAPCOM | SDK Expert | `.squad/agents/capcom/charter.md` | Standing | ✅ Active |
| CONTROL | TypeScript Engineer | `.squad/agents/control/charter.md` | Standing | ✅ Active |
| Surgeon | Release Manager | `.squad/agents/surgeon/charter.md` | Standing | ✅ Active |
| Booster | CI/CD Engineer | `.squad/agents/booster/charter.md` | Standing | ✅ Active |
| GNC | Node.js Runtime | `.squad/agents/gnc/charter.md` | Standing | ✅ Active |
| Network | Distribution | `.squad/agents/network/charter.md` | Standing | ✅ Active |
| RETRO | Security | `.squad/agents/retro/charter.md` | Standing | ✅ Active |
| INCO | CLI UX & Visual Design | `.squad/agents/inco/charter.md` | Standing | ✅ Active |
| GUIDO | VS Code Extension | `.squad/agents/guido/charter.md` | On-Demand | ✅ Active |
| Telemetry | Aspire & Observability | `.squad/agents/telemetry/charter.md` | Standing | ✅ Active |
| VOX | REPL & Interactive Shell | `.squad/agents/vox/charter.md` | Standing | ✅ Active |
| DSKY | TUI Engineer | `.squad/agents/dsky/charter.md` | Standing | ✅ Active |
| Sims | E2E Test Engineer | `.squad/agents/sims/charter.md` | Standing | ✅ Active |
| Handbook | SDK Usability | `.squad/agents/handbook/charter.md` | On-Demand | ✅ Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | Standing | 📋 Silent |
| Ralph | Work Monitor | `.squad/agents/ralph/charter.md` | Standing | 🔄 Monitor |

### Engagement

**Standing** — spawned when their work type or an owned module is in scope.
**On-Demand** — spawned only when explicitly named or when their trigger in
`.squad/routing.md` §Engagement Tiers fires. On-Demand is a *dispatch* setting, not a casting
status: charter, history, and registry status (`active`) are unchanged, and the tier is
reverted by editing one cell here plus one row in `routing.md`.

Every **Standing** member owns at least one real, currently-active repository path (see
`.squad/routing.md` §Module Ownership). The two **On-Demand** members own no module — that
absence of a code footprint is exactly the evidence that put them on-demand. No role was
retired or merged.

### Dispatch Limits

These bind the coordinator, not individual agents. Full rules in `.squad/routing.md`
§Routing Principles.

- **Default agents per dispatch:** 1 — the module's primary owner.
- **Max fan-out per dispatch:** 2 — more requires an explicit `"Team, ..."` from Brady, or a task spanning 3+ modules with different primaries.
- **Max agents in flight at once:** 3 (Scribe and Ralph excluded).
- **Max in-flight tasks per agent:** 1.
- **Implementers per module:** 1 — the primary. Secondary owners are advisory reviewers only, never co-dispatched to implement.
- **Tie-break order:** module table → work-type table → trailing 90-day path activity → Flight decides (final).

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

### Git Workflow

When working on issues, follow the Squad branching model:
- Branch from `dev` (not main): `git checkout dev && git pull && git checkout -b squad/{issue-number}-{slug}`
- Create PRs targeting `dev`: `gh pr create --base dev`
- Use branch naming convention: `squad/{issue-number}-{kebab-case-slug}`
- After merge, delete branch and switch back to dev

## Project Context

- **Owner:** Brady
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Description:** The programmable multi-agent runtime for GitHub Copilot — v1 replatform of Squad beta
- **Distribution:** npm (`npm install -g @bradygaster/squad-cli` for CLI, `npm install @bradygaster/squad-sdk` for SDK)
- **Universe:** Apollo 13 / NASA Mission Control
- **Created:** 2026-02-21
