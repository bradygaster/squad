# Squad Team

> Descriptive specialist cast for the Squad monorepo.

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Dispatches work, enforces ownership, handoffs, and reviewer gates. |

## Members

The casting registry contains 18 active specialists:

| Name | Role | Charter | Status |
|------|------|---------|--------|
| architect | Lead Architect | `.squad/agents/architect/charter.md` | ✅ Active |
| agent-orchestration-dev | Agent Orchestration Engineer | `.squad/agents/agent-orchestration-dev/charter.md` | ✅ Active |
| typescript-api-contract-designer | TypeScript API Contract Designer | `.squad/agents/typescript-api-contract-designer/charter.md` | ✅ Active |
| sdk-runtime-dev | SDK Runtime Engineer | `.squad/agents/sdk-runtime-dev/charter.md` | ✅ Active |
| plugin-platform-dev | Plugin Platform Engineer | `.squad/agents/plugin-platform-dev/charter.md` | ✅ Active |
| cli-dev | CLI Engineer | `.squad/agents/cli-dev/charter.md` | ✅ Active |
| terminal-ux-dev | Terminal UX Engineer | `.squad/agents/terminal-ux-dev/charter.md` | ✅ Active |
| state-storage-dev | State & Storage Engineer | `.squad/agents/state-storage-dev/charter.md` | ✅ Active |
| git-specialist | Git Specialist | `.squad/agents/git-specialist/charter.md` | ✅ Active |
| github-integration-dev | GitHub Integration Engineer | `.squad/agents/github-integration-dev/charter.md` | ✅ Active |
| agentic-workflows-dev | Agentic Workflows Engineer | `.squad/agents/agentic-workflows-dev/charter.md` | ✅ Active |
| observability-dev | Observability Engineer | `.squad/agents/observability-dev/charter.md` | ✅ Active |
| dotnet-agent-framework-dev | .NET Agent Framework Engineer | `.squad/agents/dotnet-agent-framework-dev/charter.md` | ✅ Active |
| unit-contract-tester | Unit & Contract Tester | `.squad/agents/unit-contract-tester/charter.md` | ✅ Active |
| integration-e2e-tester | Integration & E2E Tester | `.squad/agents/integration-e2e-tester/charter.md` | ✅ Active |
| security-reviewer | Security Reviewer | `.squad/agents/security-reviewer/charter.md` | ✅ Active |
| release-engineer | Release Engineer | `.squad/agents/release-engineer/charter.md` | ✅ Active |
| docs-devrel | Documentation & DevRel Engineer | `.squad/agents/docs-devrel/charter.md` | ✅ Active |

## Built-in Support Agents

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Scribe | Durable Decision Merger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | `.squad/agents/ralph/charter.md` | 🔄 Monitor |
| Rai | RAI Reviewer | `.squad/agents/rai/charter.md` | 🛡️ RAI |
| Fact Checker | Devil's Advocate & Verification Agent | `.squad/agents/fact-checker/charter.md` | 🔍 Verifier |

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

## Operating Contract

- The 18 lowercase kebab-case entries above are active specialists in the descriptive casting registry.
- Scribe, Ralph, Rai, and Fact Checker are mandatory support identities, not specialist registry entries or routing destinations.
- Squad is the coordinator. `@copilot` remains the general coding agent and is not a specialist.
- Team ownership and review gates are defined in `.squad/governance.md`.
- Repository-wide merge requirements remain in `.github/PR_REQUIREMENTS.md`.

## Project Context

- **Project:** `@bradygaster/squad`
- **Cast mode:** Descriptive
- **Created:** 2026-09-12
