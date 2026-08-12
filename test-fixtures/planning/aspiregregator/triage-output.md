## Triage Disposition

### Work Items (→ planning)

| # | Item | Source | Rationale |
|---|------|--------|-----------|
| 1 | Complete FeedAggregatorGrain implementation | Finding 1 | Core functionality gap; grain is the primary aggregation entry point |
| 2 | Complete ContentIndexGrain implementation | Finding 1 | Required for search and content discovery features |
| 3 | Implement IReminderGrain | Finding 1 | Needed for scheduled feed polling (Orleans reminder system) |
| 4 | Complete AnalyticsGrain with persistence | Finding 1 | Tracks usage metrics; currently loses state on silo restart |
| 5 | Configure Azure Table Storage grain persistence | Finding 1 | All grains need production-grade persistence |
| 6 | Rewire API controllers to call Orleans grains | Finding 2 | Eliminates dual data access pattern; grains become source of truth |
| 7 | Upgrade to .NET 9 and update TFMs | Finding 3 | Platform modernization goal |
| 8 | Upgrade Orleans 7.x → 9.x with serialization migration | Finding 3 | Required for .NET 9 compatibility |
| 9 | Upgrade Aspire to 9.x and adopt new builder API | Finding 3 | Required for modern Aspire features |
| 10 | Add OpenTelemetry SDK and configure tracing | Finding 4 | Telemetry goal; enables Aspire dashboard visibility |
| 11 | Add structured logging with semantic conventions | Finding 4 | Telemetry goal; improves operational debugging |
| 12 | Add health checks for external dependencies | Finding 4 | Operational readiness; required by success criteria |
| 13 | Wire Aspire service discovery | Finding 5 | Eliminates hardcoded URLs; enables container deployment |
| 14 | Add API contract tests for backward compatibility | Finding 6, Recommendation | Safety net for the backward compatibility constraint |
| 15 | Add Orleans grain unit tests using TestCluster | Finding 6 | Required to safely complete grain implementations |
| 16 | Add integration tests for aggregation pipeline | Finding 6 | Validates end-to-end flow through grains |

### Decisions Needed (→ decision gate)

| # | Decision | Context | Options |
|---|----------|---------|---------|
| 1 | Grain persistence backend | Azure Table Storage vs. Cosmos DB for grain state | A) Azure Table Storage (simpler, cheaper) B) Cosmos DB (better for document state, more scalable) |
| 2 | Frontend coupling | Whether to include Blazor WASM upgrades in this initiative | A) Include frontend upgrade B) Defer to separate initiative |

### Excluded (→ out of scope)

| # | Item | Reason |
|---|------|--------|
| 1 | Blazor WASM frontend modernization | Research recommends deferring to separate initiative; no backend coupling |
| 2 | Cosmos DB migration (beyond grain state) | PostgreSQL serves the posts DB well; no driver to change |
| 3 | CI/CD pipeline overhaul | Existing pipeline works; improvements are separate concern |

### Triage Summary

- **Work items:** 16
- **Decisions pending:** 2
- **Excluded:** 3

Structured data:
```json
{
  "squad_artifact": "triage",
  "schema_version": "1",
  "origin_issue": 8,
  "phases": []
}
```
