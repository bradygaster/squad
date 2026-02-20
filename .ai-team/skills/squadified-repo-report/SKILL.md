---
name: "squadified-repo-report"
description: "Build an impact report from discovered squadified repositories — adoption metrics, activity signals, and community insights"
domain: "community-analysis"
confidence: "medium"
source: "earned"
tools:
  - name: "github-mcp-server-search_code"
    description: "Search for Squad-specific files within repos"
    when: "Checking for .ai-team/ files, casting registry, decisions"
  - name: "github-mcp-server-get_file_contents"
    description: "Read files from remote repos"
    when: "Reading team.md, registry.json, decisions.md from each repo"
  - name: "github-mcp-server-list_issues"
    description: "List issues in a repo"
    when: "Counting issues for activity metrics"
  - name: "github-mcp-server-list_pull_requests"
    description: "List PRs in a repo"
    when: "Counting PRs for activity metrics"
  - name: "github-mcp-server-list_commits"
    description: "List commits in a repo"
    when: "Counting commits and checking activity recency"
  - name: "gh api"
    description: "Direct GitHub API for metrics not available via MCP"
    when: "Getting contributor counts, repo metadata, branch info"
---

## Context

After discovering squadified repos (see `squadified-repo-discovery` skill), this skill produces a comprehensive impact report. The report quantifies Squad's real-world adoption and the value it's delivering across the community.

This report is used for:
- Tracking adoption growth over time
- Demonstrating Squad's impact to stakeholders
- Identifying patterns in how teams use Squad
- Celebrating community achievements

## Patterns

### Data Collection Per Repo

For each discovered repo, gather these data points:

#### Core Metrics (from GitHub API)

```bash
# Issues (total, open, closed)
gh issue list --repo {owner/repo} --state all --json number --limit 1000 | jq length
gh issue list --repo {owner/repo} --state open --json number --limit 1000 | jq length
gh issue list --repo {owner/repo} --state closed --json number --limit 1000 | jq length

# Pull Requests (total, open, closed/merged)
gh pr list --repo {owner/repo} --state all --json number --limit 1000 | jq length
gh pr list --repo {owner/repo} --state open --json number --limit 1000 | jq length
gh pr list --repo {owner/repo} --state closed --json number --limit 1000 | jq length

# Commits (recent activity)
gh api repos/{owner/repo}/commits --jq length
# Or: github-mcp-server-list_commits for paginated access

# Stars, forks, watchers
gh api repos/{owner/repo} --jq '{stars: .stargazers_count, forks: .forks_count, watchers: .watchers_count}'

# Contributors
gh api repos/{owner/repo}/contributors --jq length

# Languages
gh api repos/{owner/repo}/languages
```

#### Squad-Specific Metrics (from file contents)

Read these files when accessible (may be blocked by guard workflow on main):

```
# Team composition
.ai-team/team.md → roster size, member roles, universe used
.ai-team/casting/registry.json → universe name, agent count, casting dates

# Decision density
.ai-team/decisions.md → count decision blocks (### headings)

# Session activity
.ai-team/log/ → count session log files

# Skills earned
.ai-team/skills/ → count SKILL.md files
```

For repos where `.ai-team/` is blocked from the default branch, try:
1. Check the `dev` branch: `gh api repos/{owner/repo}/contents/.ai-team/team.md?ref=dev`
2. Check `squad/*` branches for activity signals
3. Fall back to proxy signals: commit messages with `docs(ai-team):` prefix, branch names starting with `squad/`

#### Proxy Signals (when .ai-team/ is not visible)

```bash
# Squad-related commits (Scribe commit pattern)
gh api "repos/{owner/repo}/commits?per_page=100" --jq '[.[] | select(.commit.message | startswith("docs(ai-team)"))] | length'

# Squad branches (active issue work)
gh api repos/{owner/repo}/branches --jq '[.[] | select(.name | startswith("squad/"))] | length'

# Squad labels
gh label list --repo {owner/repo} --json name --jq '[.[] | select(.name | startswith("squad"))] | length'
```

### Activity Classification

Classify each repo into tiers based on observable signals:

| Tier | Signal | Description |
|------|--------|-------------|
| **🟢 Fully Squadified** | team.md + decisions + active commits + issues/PRs | Active daily use with full Squad lifecycle |
| **🟡 Squadified** | team.md + some decisions or sessions | Squad installed and used, moderate activity |
| **🟠 Minimal** | squad.agent.md exists, little other activity | Installed but lightly used or just getting started |
| **🔴 Inactive** | squad.agent.md exists, no recent commits | Installed but dormant |

### Token & Request Estimation

Estimate Copilot premium request usage based on observable signals:

```
Per session estimate:
- Coordinator overhead: ~2-4K tokens per message
- Single agent spawn: ~15-20K tokens (prompt + response)
- Multi-agent fan-out (3-4 agents): ~50-80K tokens
- Full ceremony: ~80-120K tokens
- Typical session: 2-5 agent spawns

Per premium request:
- Each `task` tool call = 1 premium request
- Scribe fires on nearly every session = 1 additional request
- Typical session: 3-6 premium requests

Estimation from proxy signals:
- Each Scribe commit ≈ 1 session ≈ 3-6 premium requests
- Each decision block ≈ 1 agent spawn ≈ 1 premium request
- Each squad/ branch ≈ 1 issue lifecycle ≈ 5-10 premium requests
```

### Human Hours Saved Estimation

Conservative model based on task type:

| Task Type | Signal | Hours Saved per Instance |
|-----------|--------|--------------------------|
| Issue triage + routing | squad labels | 0.25 - 0.5 hrs |
| Implementation (PR created) | merged PRs | 2 - 8 hrs |
| Code review | review comments on PRs | 0.5 - 1 hr |
| Decision documentation | decision blocks | 0.25 - 0.5 hrs |
| Architecture planning | ceremony logs | 1 - 3 hrs |
| Test creation | test files in PRs | 1 - 3 hrs |

### Report Structure

Output the report as a markdown file with this structure:

```markdown
# Squadified Repos Report — {date}

## Executive Summary
{2-3 sentences: total repos, owners, growth since last scan}

## By the Numbers
| Metric | Value |
|--------|-------|
| Total repos | {N} |
| Unique owners | {N} |
| Public / Private | {N} / {N} |
| Total issues | {N} |
| Total PRs | {N} |
| Total commits | {N} |
| Estimated human hours saved | {N} |

## Adoption Overview
{Table: owner, repo, visibility, tier, issues, PRs, commits, stars}

## Activity by Owner
{Grouped summary per owner}

## What Squad Built
{Generalized problem categories, not per-repo descriptions}
{Group repos by domain: distributed systems, developer tooling, creative projects, etc.}

## Casting Universes
{Table of universes used across all repos}

## Estimated Token & Request Usage
{Per-repo and aggregate estimates}

## Growth Since Last Scan
{Comparison to prior scan if available}

## Methodology
{How data was collected, caveats, limitations}
```

### Tone Guidelines

- Professional but warm — celebrating what the community built
- Not a sales pitch, not dry
- Transparent about estimation uncertainty (use ranges, not point estimates)
- Self-contained: someone unfamiliar with Squad can understand the report
- Reframe specific repos into generalized use cases (don't position demo apps as production evidence)

### Storing Scan Results

After each scan, store the repo list and key metrics for comparison:

```
.ai-team/skills/squadified-repo-discovery/last-scan.json:
{
  "scan_date": "ISO-8601",
  "total_repos": N,
  "repos": [
    { "owner": "...", "repo": "...", "visibility": "public|private", "tier": "..." }
  ]
}
```

This enables growth-over-time tracking in future scans.

## Examples

### Quick Scan (list only)

Use the discovery skill to find repos, then present a simple table:
```
| # | Owner/Repo | Visibility | Tier |
|---|------------|------------|------|
| 1 | quartznet/quartznet | Public | 🟢 Fully Squadified |
```

### Full Report

Run discovery → collect metrics per repo → classify tiers → estimate tokens → compile report markdown.

## Anti-Patterns

- **Don't run all API calls in parallel.** Rate limits will kill you. Batch by owner, space requests.
- **Don't treat `.ai-team/` absence as "not squadified."** Guard workflow blocks it from main. Check the agent file first.
- **Don't position demo/sample repos as production evidence.** Call out their actual use case (e.g., demo script → sample app generation).
- **Don't present point estimates for tokens/hours.** Always use ranges — these are speculations, not measurements.
- **Don't inflate numbers.** If a repo has squad.agent.md but no other activity, classify it honestly as Minimal or Inactive.
- **Don't forget private repos.** They're often the most interesting (production use, not just experiments).
