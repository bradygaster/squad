<!-- squad-implementation-v1 -->
## Implementation Plan

### Tasks

| # | Title | Epic | Size | Depends On | Agent |
|---|-------|------|------|------------|-------|
| 1 | Add API contract tests for all existing endpoints | Epic 3.2 | M | — | fido |
| 2 | Add Orleans TestCluster infrastructure and grain test harness | Epic 3.2 | M | — | fido |
| 3 | Implement FeedAggregatorGrain with feed merging logic | Epic 1.1 | M | 2 | eecom |
| 4 | Implement ContentIndexGrain with search indexing | Epic 1.1 | M | 2 | eecom |
| 5 | Implement IReminderGrain with scheduled polling | Epic 1.1 | M | 2 | eecom |
| 6 | Complete AnalyticsGrain with state persistence logic | Epic 1.1 | S | 2 | eecom |
| 7 | Upgrade TFMs to net9.0 and update Directory.Build.props | Epic 2.1 | S | — | control |
| 8 | Migrate Orleans 7.x → 9.x serialization model | Epic 2.1 | M | 7 | control |
| 9 | Upgrade Aspire to 9.x and adopt DistributedApplication builder | Epic 2.2 | M | 8 | eecom |
| 10 | Wire Aspire service discovery replacing hardcoded URLs | Epic 2.2 | S | 9 | eecom |
| 11 | Configure Azure Table Storage grain persistence provider | Epic 1.2 | M | 3, 4, 5, 6 | eecom |
| 12 | Rewire API controllers to call Orleans grains | Epic 1.3 | L | 1, 11 | eecom |
| 13 | Add OpenTelemetry tracing and structured logging | Epic 3.1 | M | 8 | eecom |
| 14 | Add health checks for RSS feeds, GitHub API, and YouTube API | Epic 3.1 | S | 9 | fido |

**Sizing key:** XS (<1h) · S (1–3h) · M (3–8h) · L (1–2d) · XL (2–5d)

### Rollout Order

1. **Phase 1 — Foundation (no dependencies):** Tasks 1, 2, 7
2. **Phase 2 — Grain Implementation:** Tasks 3, 4, 5, 6, 8
3. **Phase 3 — Platform & Persistence:** Tasks 9, 10, 11
4. **Phase 4 — Integration & Observability:** Tasks 12, 13, 14

### Risk Register

| Risk | Mitigation | Impact |
|------|------------|--------|
| Orleans 9.x serialization migration may break grain state deserialization | Write migration tests with serialized v7 state fixtures; validate round-trip | High — data loss if state can't deserialize |
| API rewiring (Task 12) is the largest task and touches all controllers | Contract tests (Task 1) run in CI; break early if contracts violated | Medium — regression risk |
| Azure Table Storage performance for high-cardinality grain keys | Benchmark with realistic grain count (10K+); partition key strategy review | Low — fallback to Cosmos DB if needed |
| .NET 9 breaking changes beyond Orleans serialization | Run full test suite after TFM upgrade before proceeding | Medium — blocks downstream tasks |

### GitHub Mapping

- **Issues:** One per task row (14 issues total)
- **Dependencies:** GitHub sub-issue relationships mirroring "Depends On" column
- **Milestones:**
  - `M1: Foundation & Safety Net` → Tasks 1, 2, 3, 4, 5, 6, 7
  - `M2: Platform & Persistence` → Tasks 8, 9, 10, 11
  - `M3: Integration & Observability` → Tasks 12, 13, 14
- **Labels:** `size:S`, `size:M`, `size:L` + `squad` + `squad:{agent}` _(label mode — see README for size_representation note)_
