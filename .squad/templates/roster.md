# Team Roster

> {One-line project description}

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| {Name} | {Role} | `.squad/agents/{name}/charter.md` | ✅ Active |
| {Name} | {Role} | `.squad/agents/{name}/charter.md` | ✅ Active |
| {Name} | {Role} | `.squad/agents/{name}/charter.md` | ✅ Active |
| {Name} | {Role} | `.squad/agents/{name}/charter.md` | ✅ Active |

## Built-in Support Agents

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Scribe | Durable Decision Merger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | `.squad/agents/ralph/charter.md` | 🔄 Monitor |
| Rai | RAI Reviewer | `.squad/agents/rai/charter.md` | 🛡️ RAI |
| Fact Checker | Verification Agent | `.squad/agents/fact-checker/charter.md` | 🔍 Verifier |

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

## Project Context

- **Owner:** {user name}
- **Stack:** {languages, frameworks, tools}
- **Description:** {what the project does, in one sentence}
- **Created:** {timestamp}

## Operating Contract

- Team ownership, review selection, revision, and escalation follow `.squad/governance.md`.
- Repository-wide merge requirements remain in `.github/PR_REQUIREMENTS.md`.
- Specialist onboarding remains deferred until explicitly authorized and follows `.squad/onboarding.md`.
