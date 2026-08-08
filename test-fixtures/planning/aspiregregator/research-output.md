<!-- squad-research-v1 -->
## Research Findings

### Summary

The Aspiregregator codebase has a solid ASP.NET Core foundation with a partially-implemented Orleans layer. The grain stubs are architecturally sound but incomplete — they lack persistence configuration, reminder registration, and proper error handling. The .NET 9 upgrade path is straightforward with one breaking change in the Orleans serialization model. Telemetry infrastructure is minimal (console logging only).

### Sources

| # | Source | Type | Key Insight |
|---|--------|------|-------------|
| 1 | `src/Aspiregregator.AppHost/Program.cs` | Code | Aspire orchestration exists but uses legacy `AddProject` without service discovery |
| 2 | `src/Aspiregregator.Grains/FeedAggregatorGrain.cs` | Code | Grain interface defined, implementation is a stub returning empty collections |
| 3 | `src/Aspiregregator.Grains/ContributorGrain.cs` | Code | Partially implemented; state class exists but no persistence provider configured |
| 4 | `src/Aspiregregator.Api/Controllers/FeedsController.cs` | Code | REST API bypasses Orleans entirely, queries PostgreSQL directly |
| 5 | `src/Aspiregregator.Api/appsettings.json` | Config | No OpenTelemetry configuration; logging is console-only |
| 6 | `Directory.Build.props` | Config | Targets `net8.0`; Orleans packages at 7.2.x (need 9.x for .NET 9) |
| 7 | `.github/workflows/ci.yml` | CI/CD | Build + unit tests only; no integration test stage |
| 8 | `src/Aspiregregator.Contracts/IFeedAggregatorGrain.cs` | Code | Grain interfaces well-defined; 6 grains total, 2 fully implemented |
| 9 | `src/Aspiregregator.Api/Program.cs` | Code | No health checks registered; no distributed tracing pipeline |
| 10 | `tests/Aspiregregator.Tests/` | Tests | 23 unit tests, all passing; no grain tests or integration tests |

### Findings

#### Finding 1: Orleans Grain Implementation Gap

Four of six grain interfaces have stub or incomplete implementations:
- `IFeedAggregatorGrain` — stub (returns empty)
- `IContentIndexGrain` — stub (no-op)
- `IReminderGrain` — interface only, no implementation class
- `IAnalyticsGrain` — partial (tracks counts but doesn't persist)

The two complete grains (`IContributorGrain`, `IFeedSubscriptionGrain`) use `[MemoryGrainStorage]` which is not suitable for production.

#### Finding 2: Database Access Pattern Mismatch

The API controllers bypass Orleans entirely and query PostgreSQL via Entity Framework Core. This creates a dual data access pattern where grains and controllers can have inconsistent views of the data. The intended architecture has the API layer calling grains, which own data access.

#### Finding 3: .NET 9 Migration Complexity

The upgrade requires:
- `net8.0` → `net9.0` TFM change (mechanical)
- Orleans 7.x → 9.x (breaking: new serialization attributes `[GenerateSerializer]` replaces `[Serializable]`)
- Aspire 8.x → 9.x (new `DistributedApplication` builder API)
- 14 NuGet packages with major version bumps

The Orleans serialization change affects all grain state classes (8 files).

#### Finding 4: Telemetry Gap

No OpenTelemetry SDK is referenced. Logging uses `ILogger` with no structured format. There is no distributed tracing, no metrics collection, and no health check infrastructure. The Aspire dashboard would show the app but with no telemetry data.

#### Finding 5: Service Discovery Not Utilized

The AppHost registers services but uses hardcoded URLs in `appsettings.json` for inter-service communication. Aspire's built-in service discovery (`builder.AddServiceReference()`) is not used, meaning the app won't benefit from Aspire's DNS-based resolution in container environments.

#### Finding 6: Test Coverage Insufficient for Safe Refactoring

The 23 existing unit tests cover controller logic only. There are no:
- Orleans grain tests (using `TestCluster`)
- Integration tests for the aggregation pipeline
- Contract tests for API backward compatibility
- Performance baseline tests

This makes the modernization risky without adding test coverage first.

### Open Questions

- Is Azure Table Storage the confirmed persistence choice, or should Cosmos DB be considered given the document-oriented grain state?
- Should the Blazor WASM frontend be upgraded simultaneously, or treated as a separate initiative?
- What is the acceptable downtime window for the data migration from in-memory to persistent storage?

### Recommendations

- Establish API contract tests before making any changes (safety net for backward compatibility constraint)
- Complete Orleans grain implementations before the .NET 9 upgrade to reduce concurrent change risk
- Adopt a vertical-slice approach: complete one grain end-to-end (persistence, telemetry, tests) then replicate pattern
- Wire service discovery early — it simplifies the remaining integration work
- Defer Blazor WASM frontend changes to a separate initiative (no coupling to backend modernization)
