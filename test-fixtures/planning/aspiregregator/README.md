# Aspiregregator Planning Fixture

## Purpose

This directory contains a complete end-to-end regression fixture for the Squad planning lifecycle, derived from the real Aspiregregator modernization exercise (bradygaster/Aspiregregator#8).

The Aspiregregator is a .NET Aspire community content aggregator application. The modernization scenario involves completing the Orleans architecture, platform upgrades, and telemetry improvements — a medium-complexity project that exercises all planning phases.

## Fixture Contents

| File | Planning Phase | `squad_artifact` |
|------|---------------|------------------|
| `intent.md` | Intent (issue body) | — |
| `research-output.md` | Research | `research` |
| `triage-output.md` | Triage | `triage` |
| `program-plan-output.md` | Program Plan | `program` |
| `implementation-plan-output.md` | Implementation Plan | `implementation` |
| `validation-output.md` | Validation | `validation` |
| `acceptance-outputs.md` | Scope + Impl + Activation | Three structured artifacts |
| `lifecycle-state.md` | Lifecycle State | `lifecycle-state` |
| `assertions.md` | Test Assertions | — |

## How to Use for Regression Testing

### Manual Validation

1. Compare each output file against the schema in `workflows/shared/planning-ontology.md`
2. Verify every `Structured data:` JSON block has `schema_version: "1"`, `origin_issue: 8`, `phases: []`, and the expected `squad_artifact`
3. Confirm traceability: every task → epic → initiative → triage item

### Automated Validation

Use `assertions.md` as a machine-checkable spec. A test harness should:

1. Parse each fixture file's gh-aw `Structured data:` fenced JSON
2. Validate internal structure matches the ontology schema
3. Cross-reference items across phases (traceability)
4. Verify dependency graph is a valid DAG
5. Confirm policy compliance (default profile)

### Scenario Parameters

- **Policy profile:** `default`
- **Size representation:** `label` (demonstrates the `size_representation: label` mode; the default policy is `size_representation: body` which embeds sizing in the issue body instead of labels)
- **Complexity:** Medium (3 milestones, 6 epics, 14 tasks)
- **Domain:** .NET Aspire / Orleans / ASP.NET Core
- **Planning path:** Full lifecycle (not fast-path)

## Origin

Captured from the planning exercise on `bradygaster/Aspiregregator#8`, then normalized to match the v1 ontology schemas. Sensitive implementation details have been genericized while preserving realistic structure and scale.
