<!-- squad-program-v1 -->
## Program Plan

### Initiatives

#### Initiative 1: Orleans Architecture Completion

- **Goal:** Complete the distributed state management layer so all grains are production-ready with persistent storage, proper error handling, and scheduled processing.
- **Epics:**
  - Epic 1.1: Grain Implementation Completion — Implement the four remaining grain stubs with full business logic
  - Epic 1.2: Persistence Layer — Configure Azure Table Storage and migrate grain state from in-memory
  - Epic 1.3: API-to-Grain Rewiring — Route all API controller data access through Orleans grains

#### Initiative 2: Platform Modernization

- **Goal:** Upgrade the runtime platform to .NET 9 with current Aspire and Orleans packages, enabling modern framework features and long-term support.
- **Epics:**
  - Epic 2.1: .NET 9 & Package Upgrades — Upgrade TFMs, Orleans serialization model, and all NuGet dependencies
  - Epic 2.2: Aspire Modernization — Adopt Aspire 9.x builder API and wire service discovery

#### Initiative 3: Telemetry & Quality

- **Goal:** Establish production-grade observability and a test safety net that enables confident ongoing development.
- **Epics:**
  - Epic 3.1: Observability Stack — Add OpenTelemetry tracing, structured logging, and health checks
  - Epic 3.2: Test Coverage Foundation — Add contract tests, grain tests, and integration tests

### Milestone Map

| Milestone | Epics | Target |
|-----------|-------|--------|
| M1: Foundation & Safety Net | Epic 3.2, Epic 1.1 | Week 1-2 |
| M2: Platform & Persistence | Epic 2.1, Epic 2.2, Epic 1.2 | Week 3-4 |
| M3: Integration & Observability | Epic 1.3, Epic 3.1 | Week 5-6 |

### User Stories

| Epic | Story | Acceptance Criteria |
|------|-------|---------------------|
| Epic 1.1 | As a content consumer, I can see aggregated feed results from all configured sources | Feed aggregation grain returns merged results from all registered feeds |
| Epic 1.1 | As an operator, I can rely on scheduled feed polling without manual triggers | Reminder grain activates on schedule and triggers aggregation cycle |
| Epic 1.2 | As an operator, grain state survives silo restarts without data loss | All grain state persisted to Azure Table Storage; verified by restart test |
| Epic 1.3 | As an API consumer, I get the same response shape from existing endpoints | All `/api/*` endpoints return identical contracts; verified by contract tests |
| Epic 2.1 | As a developer, the application builds and runs on .NET 9 | `dotnet build` succeeds on net9.0; all existing tests pass |
| Epic 2.2 | As a developer, services discover each other via Aspire without hardcoded URLs | No hardcoded service URLs in configuration; all resolved via Aspire service discovery |
| Epic 3.1 | As an operator, I can see distributed traces for request flows through grains | Aspire dashboard shows end-to-end traces for API→Grain call chains |
| Epic 3.1 | As an operator, health check endpoint reports status of all external dependencies | `/health` returns degraded/unhealthy when RSS feeds or APIs are unreachable |
| Epic 3.2 | As a developer, I have confidence that API changes don't break existing consumers | Contract test suite fails if any response shape changes |
| Epic 3.2 | As a developer, I can test grain logic in isolation | TestCluster-based grain tests execute without external dependencies |

### Dependencies

- Epic 1.2 depends on Epic 1.1 (grains must be implemented before persistence is meaningful)
- Epic 1.3 depends on Epic 1.1 (API rewiring needs complete grain implementations)
- Epic 1.3 depends on Epic 3.2 (contract tests must exist before rewiring to catch regressions)
- Epic 2.2 depends on Epic 2.1 (Aspire 9.x requires .NET 9 TFM)
- Epic 3.1 depends on Epic 2.1 (OpenTelemetry 9.x packages require .NET 9)

### Scope Boundary

- **In scope:**
  - All backend grain, API, persistence, and telemetry work
  - Test infrastructure for backend components
  - Aspire AppHost orchestration updates
  - Service discovery wiring
  - Data migration path from in-memory to Azure Table Storage

- **Out of scope:**
  - Blazor WASM frontend changes (deferred per triage)
  - CI/CD pipeline restructuring
  - Cosmos DB evaluation (decision resolved: Azure Table Storage selected)
  - Performance optimization beyond the 10% regression constraint
  - Multi-region deployment topology
