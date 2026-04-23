# Mission Control — squad-sdk

> The programmable multi-agent runtime for GitHub Copilot.
> *"Failure is not an option."*

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Flight | Lead | `.squad/agents/flight/charter.md` | ✅ Active |
| Procedures | Prompt Engineer | `.squad/agents/procedures/charter.md` | ✅ Active |
| EECOM | Core Dev | `.squad/agents/eecom/charter.md` | ✅ Active |
| FIDO | Quality Owner | `.squad/agents/fido/charter.md` | ✅ Active |
| PAO | DevRel | `.squad/agents/pao/charter.md` | ✅ Active |
| CAPCOM | SDK Expert | `.squad/agents/capcom/charter.md` | ✅ Active |
| CONTROL | TypeScript Engineer | `.squad/agents/control/charter.md` | ✅ Active |
| Surgeon | Release Manager | `.squad/agents/surgeon/charter.md` | ✅ Active |
| Booster | CI/CD Engineer | `.squad/agents/booster/charter.md` | ✅ Active |
| GNC | Node.js Runtime | `.squad/agents/gnc/charter.md` | ✅ Active |
| Network | Distribution | `.squad/agents/network/charter.md` | ✅ Active |
| RETRO | Security | `.squad/agents/retro/charter.md` | ✅ Active |
| INCO | CLI UX & Visual Design | `.squad/agents/inco/charter.md` | ✅ Active |
| GUIDO | VS Code Extension | `.squad/agents/guido/charter.md` | ✅ Active |
| Telemetry | Aspire & Observability | `.squad/agents/telemetry/charter.md` | ✅ Active |
| VOX | REPL & Interactive Shell | `.squad/agents/vox/charter.md` | ✅ Active |
| DSKY | TUI Engineer | `.squad/agents/dsky/charter.md` | ✅ Active |
| Sims | E2E Test Engineer | `.squad/agents/sims/charter.md` | ✅ Active |
| Handbook | SDK Usability | `.squad/agents/handbook/charter.md` | ✅ Active |
| SPAN | Skill Curator | `.squad/agents/span/charter.md` | ✅ Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |

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
