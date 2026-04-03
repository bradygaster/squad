---
name: "rework-rate"
description: "Measure and interpret PR rework rate — the emerging 5th DORA metric"
license: "MIT"
allowed-tools: "squad rework"
metadata:
  domain: "metrics, code-review, quality"
  confidence: "high"
  source: "manual"
  compatibility: "GitHub Copilot CLI, VS Code Copilot Chat"
  triggers: [rework, dora, metrics, pull-request, review, quality, code-review]
  roles: [developer, tester, lead]
---

## Context

Rework Rate measures the percentage of code changes that require revision after initial review submission. It is considered the emerging 5th DORA metric alongside Deployment Frequency, Lead Time for Changes, Mean Time to Recovery, and Change Failure Rate.

Use this skill when:
- Measuring team code review efficiency
- Identifying patterns in PR revision cycles
- Coaching on PR quality and review practices
- Tracking AI-generated code retention rates
- Building engineering health dashboards

## Patterns

### Calculation

```
Rework Rate = (commits after first review) / (total commits) × 100

Sub-metrics:
  Review Cycles = number of changes-requested → push → approval loops
  Rejection Rate = PRs with ≥1 "changes requested" / total PRs × 100
  Rework Time = last approval timestamp - first changes-requested timestamp
```

### Healthy Ranges

| Metric | 🟢 Healthy | 🟡 Moderate | 🔴 Needs Attention |
|--------|-----------|------------|-------------------|
| Rework Rate | ≤15% | 15–30% | >30% |
| Review Cycles | ≤1.0 | 1.0–2.0 | >2.0 |
| Rejection Rate | ≤20% | 20–40% | >40% |

### Using the CLI

```bash
# Analyze last 30 days (default)
npx github:bradygaster/squad rework

# Custom period
npx github:bradygaster/squad rework --days 7 --limit 50

# Machine-readable output
npx github:bradygaster/squad rework --json
```

### Improvement Strategies

When rework rate is high:
1. **Smaller PRs** — Break large changes into focused, reviewable units
2. **Clear specs** — Write acceptance criteria before coding
3. **Pre-review checklist** — Self-review before requesting reviews
4. **Pair reviews** — Complex changes benefit from synchronous review
5. **Draft PRs** — Use draft status for early feedback on direction

## Examples

```javascript
// Ralph can use rework metrics in watch cycles:
// "📊 Weekly Rework Rate: 12% (healthy) — 3/25 PRs had changes requested"

// In squad ceremonies, rework trends inform retrospectives:
// "Rework rate dropped from 28% to 14% after adopting smaller PR sizes"
```

## Anti-Patterns

- **Using rework rate to blame individuals** — Use it for team coaching, not performance reviews
- **Optimizing for zero rework** — Some rework is healthy; it means reviews are catching issues
- **Ignoring context** — Large refactors naturally have higher rework; compare like with like
- **Measuring without acting** — Metrics without follow-up actions are waste
