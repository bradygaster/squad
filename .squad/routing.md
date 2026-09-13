# Work Routing

Dispatch ownership only. Team review gates and rejection mechanics live in
`.squad/governance.md`; repository-wide merge requirements remain in
`.github/PR_REQUIREMENTS.md`.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Cross-package architecture and unmatched work | architect | Compatibility strategy, Squad v2, adjudication |
| Agent orchestration | agent-orchestration-dev | Coordinator, casting, routing, prompts, spawns, handoffs |
| Public TypeScript contracts | typescript-api-contract-designer | Exports, schemas, declarations, API compatibility |
| SDK runtime | sdk-runtime-dev | Clients, sessions, events, streams, tools, cancellation, concurrency |
| Plugin platform | plugin-platform-dev | Plugins, marketplaces, manifests, sharing, upstreams, adapters |
| CLI behavior | cli-dev | Commands, parsing, init, upgrade, migrations, templates, bootstrap |
| Terminal experience | terminal-ux-dev | Ink, REPL, input, focus, rendering, accessibility |
| State and storage | state-storage-dev | Backends, memory, serialization, migrations, recovery, archival integrity |
| Local Git operations | git-specialist | Refs, worktrees, staging, merges, ignores, repository recovery |
| GitHub integration | github-integration-dev | APIs, CLI auth, issues, labels, PRs, remote coordination |
| Agentic workflows | agentic-workflows-dev | gh-aw sources, compilation, permissions, safe outputs, workflow contracts |
| Observability | observability-dev | OpenTelemetry, logs, metrics, traces, health, cost and usage |
| .NET agent framework | dotnet-agent-framework-dev | Squad.Agents.AI, multi-targeting, NuGet contracts |
| Unit and contract testing | unit-contract-tester | Vitest, deterministic integration, schemas, parsers, mutation quality |
| Integration and E2E testing | integration-e2e-tester | CLI journeys, Gherkin, Playwright, hosted workflow evidence |
| Security review | security-reviewer | Threat models, trust boundaries, secrets, injection, filesystem review |
| Release engineering | release-engineer | Builds, manifests, changesets, CI, npm/NuGet/binary publication |
| Documentation and DevRel | docs-devrel | README, guides, examples, migrations, API docs, website, release communication |

## Dispatch Rules

1. Every work item has exactly one primary specialist from the table.
2. Route mixed work by its main deliverable; split only when deliverables have different owners.
3. Route unmatched work and ownership disputes to `architect`.
4. `squad:{id}` labels must use an active specialist ID from the casting registry.
5. Squad coordinates. Scribe, Ralph, Rai, Fact Checker, and `@copilot` are never routing destinations.
