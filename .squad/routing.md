# Routing Rules — Mission Control

## Work Type → Agent

| Work Type | Agent | Examples |
|-----------|-------|---------|
| Core runtime | EECOM 🔧 | CopilotClient, adapter, session pool, tools module, spawn orchestration |
| Prompt architecture | Procedures 🧠 | Agent charters, spawn templates, coordinator logic, response tier selection |
| Type system | CONTROL 👩‍💻 | Discriminated unions, generics, tsconfig, strict mode enforcement, declaration files |
| SDK integration | CAPCOM 🕵️ | @github/copilot-sdk usage, CopilotSession lifecycle, event handling, platform patterns |
| Runtime performance | GNC ⚡ | Streaming, event loop health, session management, async iterators, memory profiling |
| Tests & quality | FIDO 🧪 | Test coverage, Vitest, edge cases, CI/CD, quality gates, adversarial testing, PR blocking |
| Docs & messaging | PAO 📣 | README, API docs, getting-started, demos, tone review, contributor recognition |
| Architecture & review | Flight 🏗️ | Product direction, architectural decisions, code review, scope/trade-offs |
| Distribution | Network 📦 | npm packaging, esbuild config, global install, marketplace prep |
| Release management | Surgeon 🚢 | Semantic versioning, GitHub Releases, changelogs, dev→main merges, release gating |
| CI/CD & publish pipeline | Booster ⚙️ | GitHub Actions, publish.yml, automated validation gates, workflow monitoring |
| Security & PII | RETRO 🔒 | Hook design (file-write guards, PII filters), security review, compliance, secret management |
| CLI UX & visual design | INCO 🎨 | Interaction design, copy, spacing, affordances, UX gates, logo, brand, design system |
| Aspire & observability | Telemetry 🔭 | Aspire dashboard, OTLP integration, Playwright E2E, Docker telemetry |
| VS Code integration | GUIDO 🔌 | VS Code Extension API, runSubagent compatibility, editor integration |
| REPL & shell | VOX 🖥️ | Interactive shell, session dispatch, streaming pipeline, event wiring |
| TUI implementation | DSKY 🖥️ | Terminal components, layout, input handling, focus management, rendering perf |
| Terminal E2E tests | Sims 🧪 | node-pty harness, Gherkin features, frame snapshots, UX gate test suite |
| SDK usability | Handbook 📖 | JSDoc, LLM discoverability, API surface clarity, legacy cleanup, migration guides |

## Module Ownership

| Module | Primary | Secondary |
|--------|---------|-----------|
| `src/adapter/` | EECOM 🔧 | CAPCOM 🕵️ |
| `src/agents/` | Procedures 🧠 | EECOM 🔧 |
| `src/build/` | CONTROL 👩‍💻 | Network 📦 |
| `src/casting/` | EECOM 🔧 | Procedures 🧠 |
| `src/cli/` | EECOM 🔧 | Network 📦 |
| `src/client/` | CAPCOM 🕵️ | EECOM 🔧 |
| `src/config/` | CONTROL 👩‍💻 | EECOM 🔧 |
| `src/coordinator/` | Procedures 🧠 | Flight 🏗️ |
| `src/hooks/` | RETRO 🔒 | EECOM 🔧 |
| `src/marketplace/` | Network 📦 | EECOM 🔧 |
| `src/ralph/` | EECOM 🔧 | — |
| `src/runtime/` | GNC ⚡ | EECOM 🔧 |
| `src/sharing/` | EECOM 🔧 | Network 📦 |
| `src/skills/` | Procedures 🧠 | — |
| `src/tools/` | EECOM 🔧 | CAPCOM 🕵️ |
| `src/cli/shell/` | VOX 🖥️ | DSKY 🖥️ |
| `src/cli/shell/components/` | DSKY 🖥️ | VOX 🖥️ |
| `tests/acceptance/` | Sims 🧪 | FIDO 🧪 |
| `src/index.ts` | CONTROL 👩‍💻 | Flight 🏗️ |

## Routing Principles

1. **Eager by default** — spawn agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn for trivial questions.
4. **Two agents could handle it** → pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream.** Feature being built? Spawn tester for test cases from requirements simultaneously.
7. **Doc-impact check → PAO.** Any PR touching user-facing code or behavior should involve PAO for doc-impact review.
8. **Restraint after dispatch.** Once agents are running, the Coordinator waits. Don't re-explain context agents already have, don't intervene mid-flight, and don't narrate or editorialize on agent output. Present results directly and let agents speak for themselves.
