---
name: "daily-squad-report"
description: "Generate a cumulative squad ecosystem usage report — squad-only commits, issues, and PRs across all squadified repos"
domain: "community-analysis"
confidence: "high"
source: "earned"
trigger: "give me the daily report of squad usage"
tools:
  - name: "gh"
    description: "GitHub CLI — primary tool for querying repos, issues, PRs, and commits"
    when: "All data collection"
  - name: "github-mcp-server-search_code"
    description: "GitHub code search API for discovering squadified repos"
    when: "Initial repo discovery phase"
---

## Context

This skill produces the **daily squad usage report** — a single flat table showing squad-specific activity across every squadified repository in the ecosystem. "Squad-specific" means:

- **Squad Commits** — commits on `squad/*` or `copilot/*` branches (counted via PR commit totals)
- **Squad Issues** — issues labeled `squad`
- **Squad PRs** — pull requests from `squad/*` or `copilot/*` head branches

The report is cumulative (lifetime totals, not per-day deltas). Run it periodically to track growth. Future versions may add daily deltas.

## Trigger

When the user says **"give me the daily report of squad usage"** (or similar intent), execute this skill.

## Output

### 1. On-screen table

Display a single markdown table with these exact columns, sorted by Owner then Repo:

```
| Owner | Repo | Age | Squad Commits | Squad Issues | Squad PRs | Description |
```

Include a **TOTALS** row at the bottom:

```
| **TOTALS** | **{N} repos · {M} owners** | | **{sum}** | **{sum}** | **{sum}** | |
```

### 2. Saved files

After displaying the table, save two files in the repo root:

- `daily_squad_report_{TIMESTAMP}.md` — the full markdown table
- `daily_squad_report_{TIMESTAMP}.csv` — CSV with headers matching the table columns

**Timestamp format:** `YYYYMMDD-HHmmss` UTC (e.g., `20260222-091500`)

These files accumulate over time for trend analysis. Do NOT delete previous reports.

### 3. Gitignore

Add `daily_squad_report_*` to `.gitignore` if not already present — these are local artifacts, not committed.

## Execution Steps

### Phase 1: Discover repos

Use the `squadified-repo-discovery` skill to find all squadified repositories. The fingerprint is `.github/agents/squad.agent.md`.

**Known owner list** (scan all repos for each — catches private repos):
```
Ansteorra, bradygaster, carlfranklin, cirvine-MSFT, csharpfritz,
danielscholl-osdu, elbruno, fboucher, FritzAndFriends, isaacrlevin,
jsturtevant, lewing, londospark, lucabol, mcollier, mlinnen,
mpaulosky, quartznet, robpitcher, shelwig, spboyer
```

Update this list as new owners are discovered.

### Phase 2: Collect metadata per repo

For each discovered repo, collect in parallel where possible:

#### Age
```bash
gh api "repos/{owner}/{repo}" --jq '.created_at'
```
Calculate human-readable age: `{N}yr {M}mo`, `{N}mo`, or `{N}d`.

#### Description
```bash
gh api "repos/{owner}/{repo}" --jq '.description // ""'
```

#### Squad Issues (labeled `squad`)
```bash
gh issue list -R {owner}/{repo} --state all --label squad --json number --jq 'length'
```

#### Squad PRs (from squad/* or copilot/* branches)
```bash
gh pr list -R {owner}/{repo} --state all --limit 200 --json headRefName \
  | jq '[.[] | select(.headRefName | test("^(squad|copilot)/"))] | length'
```

#### Squad Commits (commits on squad/copilot PRs)

This is the most expensive query. For each repo:

1. List all PRs from squad/copilot branches:
```bash
gh pr list -R {owner}/{repo} --state all --limit 200 --json number,headRefName
```

2. Filter to PRs where `headRefName` matches `^(squad|copilot)/`

3. For each matching PR, count commits:
```bash
gh api "repos/{owner}/{repo}/pulls/{number}/commits?per_page=100" --jq 'length'
```

4. Sum all commit counts = Squad Commits for that repo.

**Optimization:** If a repo had 0 Squad PRs, skip the commit counting — squad commits = 0.

**Rate limiting:** With ~50+ repos and potentially hundreds of PRs, this phase takes 5-10 minutes. Use `initial_wait: 600` for the data collection command.

### Phase 3: Assemble and display

1. Sort rows by Owner (case-insensitive), then Repo
2. Calculate totals: sum of Squad Commits, Squad Issues, Squad PRs; count of unique repos and owners
3. Display the table on screen
4. Generate timestamp: `Get-Date -Format "yyyyMMdd-HHmmss"` (UTC)
5. Save `daily_squad_report_{TIMESTAMP}.md` with the table
6. Save `daily_squad_report_{TIMESTAMP}.csv` with headers and data
7. Ensure `daily_squad_report_*` is in `.gitignore`

## CSV Format

```csv
Owner,Repo,Age,Squad Commits,Squad Issues,Squad PRs,Description
Ansteorra,KMP,2yr 10mo,0,0,0,Kingdom Management Platform
...
TOTALS,53 repos · 21 owners,,2921,234,682,
```

## Example Table (from 2026-02-22 scan)

| Owner | Repo | Age | Squad Commits | Squad Issues | Squad PRs | Description |
|---|---|---|---|---|---|---|
| Ansteorra | KMP | 2yr 10mo | 0 | 0 | 0 | Kingdom Management Platform |
| bradygaster | beacon-faith | 4d | 60 | 30 | 27 | Scripture-grounded chatbot |
| bradygaster | squad | 16d | 368 | 8 | 32 | Squad: AI agent teams for any project |
| bradygaster | squad-pr | 1d | 77 | 30 | 42 | Squad — agentic teams for any project |
| cirvine-MSFT | editless | 6d | 764 | 22 | 128 | Plan, delegate, and review AI team work |
| spboyer | waza | 21d | 430 | 16 | 131 | Evaluation framework for Agent Skills |
| ... | ... | ... | ... | ... | ... | ... |
| **TOTALS** | **53 repos · 21 owners** | | **2,921** | **234** | **682** | |

## Notes

- **Squad Commits** are counted via PR commit counts, not branch commit counts. This is because squad/* branches are often deleted after merge, making branch-based counting unreliable.
- Repos with 0 across all three squad metrics still appear in the table — they have the scaffolding but no squad branch activity yet.
- The known owner list should be updated when new adopters are discovered during the discovery phase.
- This skill depends on `squadified-repo-discovery` for Phase 1. Run discovery first, then collect metrics.
