# Modernize Aspiregregator — Orleans Completion & Platform Upgrades

## Overview

The Aspiregregator is a community content aggregator built on .NET Aspire that collects blog posts, videos, and community contributions from the .NET ecosystem. The application currently runs on .NET 8 with a partially-implemented Orleans grain architecture and needs modernization to complete the distributed state management layer, upgrade to .NET 9, and improve observability.

## Goals

### 1. Complete Orleans Architecture
The Orleans grain implementation is roughly 60% complete. Several grains exist as stubs, the reminder system is not wired up, and the grain persistence layer uses in-memory storage instead of the intended Azure Table Storage backend. Complete the grain architecture so the application can run as a distributed cluster.

### 2. Platform Modernization
- Upgrade from .NET 8 to .NET 9
- Migrate from `Microsoft.Extensions.Hosting` to the .NET Aspire AppHost model
- Replace the legacy `HttpClient` polling with Aspire-native service discovery
- Update all NuGet dependencies to latest stable versions

### 3. Telemetry & Observability Improvements
- Add structured logging with semantic conventions
- Implement distributed tracing across Orleans grain calls
- Add health checks for all external dependencies (RSS feeds, GitHub API, YouTube API)
- Create an Aspire dashboard configuration for monitoring grain activation patterns

## Constraints

- **Backward compatibility:** Existing API contracts (`/api/feeds`, `/api/posts`, `/api/contributors`) must not change shape or behavior
- **Data preservation:** Existing feed subscription data must be migratable (provide a migration path)
- **Deployment continuity:** The application must remain deployable to Azure Container Apps throughout the modernization (no big-bang cutover)
- **Performance:** Feed aggregation latency must not regress beyond 10% of current baseline

## Current Architecture (High-Level)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Blazor WASM   │────▶│   ASP.NET Core   │────▶│  Orleans Silo   │
│   (Frontend)    │     │   (API Gateway)  │     │  (Partial)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────┐         ┌──────────────────┐
                        │  PostgreSQL  │         │  In-Memory Store │
                        │  (Posts DB)  │         │  (Grain State)   │
                        └──────────────┘         └──────────────────┘
```

## Success Criteria

- [ ] All Orleans grains fully implemented with Azure Table Storage persistence
- [ ] Application runs on .NET 9 with Aspire AppHost orchestration
- [ ] Distributed tracing visible in Aspire dashboard for grain-to-grain calls
- [ ] All existing API endpoints pass backward-compatibility contract tests
- [ ] Health check endpoints report status for all external dependencies
- [ ] Feed aggregation p95 latency within 10% of pre-modernization baseline
