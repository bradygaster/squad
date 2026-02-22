# Squad Team — squad-sdk

> The programmable multi-agent runtime for GitHub Copilot.

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | `.squad/agents/keaton/charter.md` | ✅ Active |
| Verbal | Prompt Engineer | `.squad/agents/verbal/charter.md` | ✅ Active |
| Fenster | Core Dev | `.squad/agents/fenster/charter.md` | ✅ Active |
| Hockney | Tester | `.squad/agents/hockney/charter.md` | ✅ Active |
| McManus | DevRel | `.squad/agents/mcmanus/charter.md` | ✅ Active |
| Kujan | SDK Expert | `.squad/agents/kujan/charter.md` | ✅ Active |
| Edie | TypeScript Engineer | `.squad/agents/edie/charter.md` | ✅ Active |
| Kobayashi | Git & Release | `.squad/agents/kobayashi/charter.md` | ✅ Active |
| Fortier | Node.js Runtime | `.squad/agents/fortier/charter.md` | ✅ Active |
| Rabin | Distribution | `.squad/agents/rabin/charter.md` | ✅ Active |
| Baer | Security | `.squad/agents/baer/charter.md` | ✅ Active |
| Redfoot | Graphic Designer | `.squad/agents/redfoot/charter.md` | ✅ Active |
| Strausz | VS Code Extension | `.squad/agents/strausz/charter.md` | ✅ Active |
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

## Project Context

- **Owner:** Brady
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Description:** The programmable multi-agent runtime for GitHub Copilot — v1 replatform of Squad beta
- **Distribution:** npm (`npm install -g @bradygaster/squad-cli` for CLI, `npm install @bradygaster/squad-sdk` for SDK)
- **Created:** 2026-02-21

## Issue Source

- **Repository:** bradygaster/squad
- **Connected:** 2026-02-21
