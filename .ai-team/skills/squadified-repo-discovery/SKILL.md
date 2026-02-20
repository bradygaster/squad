---
name: "squadified-repo-discovery"
description: "Find all repositories using Squad (bradygaster/squad) across GitHub — public and private"
domain: "community-analysis"
confidence: "medium"
source: "earned"
tools:
  - name: "github-mcp-server-search_code"
    description: "GitHub code search API — searches file contents across repos"
    when: "Primary discovery method for public repos"
  - name: "gh search code"
    description: "GitHub CLI code search — includes private repos the user has access to"
    when: "Discovers private repos not visible to API search"
  - name: "gh api"
    description: "Direct GitHub API calls to check specific repos"
    when: "Verify individual repos, check non-default branches"
---

## Context

Squad leaves a reliable fingerprint in every repo it's installed in: `.github/agents/squad.agent.md`. This file is committed to the repo (unlike `.ai-team/` which is often gitignored or blocked from main by the guard workflow). Searching for this file is the most reliable way to find squadified repositories.

This skill is used to produce a comprehensive list of all squadified repos for impact reporting, community tracking, and adoption metrics. Run it periodically ("on a reggie") to track growth.

## Patterns

### Primary Search: squad.agent.md (highest signal)

The most reliable fingerprint. Every squadified repo has this file.

**Via GitHub MCP (public repos only):**
```
github-mcp-server-search_code:
  query: 'path:.github/agents "squad.agent.md"'
  perPage: 100
```

**Via gh CLI (public + private repos the authenticated user can access):**
```bash
gh search code "squad.agent.md" --filename squad.agent.md --json repository --limit 100
```

The gh CLI search is critical — it surfaces private repos that the MCP search cannot see. Always run both.

### Secondary Searches: Additional Fingerprints

These catch repos where `squad.agent.md` might be on a non-default branch:

```
# .ai-team/ directory committed to a visible branch
github-mcp-server-search_code:
  query: 'path:.ai-team/team.md "## Members"'

# Casting registry (confirms full Squad setup, not just agent file)
github-mcp-server-search_code:
  query: 'path:.ai-team/casting/registry.json "persistent_name"'

# Squad workflows
github-mcp-server-search_code:
  query: 'path:.github/workflows/squad-main-guard.yml'

# .gitattributes merge driver (Squad-specific pattern)
github-mcp-server-search_code:
  query: 'path:.gitattributes ".ai-team/decisions.md merge=union"'
```

### Private Repo Deep Scan

For known owners/orgs, enumerate their repos and check individually:

```bash
# List all private repos for an owner
gh repo list {owner} --json name,isPrivate --limit 100 --jq '.[] | select(.isPrivate==true) | .name'

# Check each for squad.agent.md
gh api repos/{owner}/{repo}/contents/.github/agents/squad.agent.md --jq '.name' 2>&1
```

This is necessary because:
- Private repos may not appear in code search results
- Some repos have `.ai-team/` gitignored but still have the agent file
- The guard workflow blocks `.ai-team/` from main/preview, but `.github/agents/` is always committed

### Known Owner List

Maintain and grow this list. These are confirmed Squad adopters to deep-scan:

```
bradygaster, csharpfritz, FritzAndFriends, spboyer, elbruno,
mpaulosky, fboucher, quartznet, carlfranklin, lucabol,
Ansteorra, londospark, lewing, shelwig, danielscholl-osdu, mlinnen
```

### Result Deduplication

Both search methods may return duplicates. Deduplicate by `owner/repo` (case-insensitive). Track:
- `owner/repo`
- `isPrivate` (boolean)
- `isFork` (boolean — exclude forks from primary counts)
- Discovery method (MCP search, gh CLI search, deep scan)

### Verification Step

For repos found only via secondary searches (not `squad.agent.md`), verify with a direct API check:

```bash
gh api repos/{owner}/{repo}/contents/.github/agents/squad.agent.md --jq '.name'
```

If this returns 404, the repo may have Squad on a non-default branch only. Note this in the results.

### Rate Limit Management

GitHub code search has aggressive rate limits (~10 requests/minute for authenticated users). Strategy:
1. Run the primary `squad.agent.md` search first (highest value)
2. Run secondary searches only if primary returns < expected results
3. Space searches 40+ seconds apart if rate-limited
4. Use `gh` CLI as fallback — different rate limit pool than MCP

## Examples

### Full Discovery Run

```
1. MCP search: path:.github/agents "squad.agent.md" → 24 public repos
2. gh CLI search: squad.agent.md --filename → 32 repos (public + private)
3. Deep scan known owners' private repos → 2 additional private repos
4. Deduplicate → 33 unique repos
5. Verify stragglers → 31 confirmed squadified
6. Compile final list with owner, visibility, fork status
```

### Output Format

Present results as a table grouped by owner:

```
| Owner | Repo | Visibility | Notes |
|-------|------|------------|-------|
| bradygaster | squad | Public | Source repo |
| bradygaster | AspireSquad | Public | .NET Aspire |
| bradygaster | Influence | Private | — |
| ... | ... | ... | ... |
```

Include summary counts:
- Total repos
- Public vs. private
- Unique owners/orgs
- New since last scan (if prior scan data exists)

## Anti-Patterns

- **Don't search only for `.ai-team/` files.** The guard workflow blocks these from main. You'll miss most repos.
- **Don't skip the gh CLI search.** MCP search only sees public repos. Private repos are invisible without it.
- **Don't search by repo description.** Many projects use "squad" in their name/description but aren't using bradygaster/squad. The agent file is the only reliable fingerprint.
- **Don't assume one search catches everything.** GitHub code search indexes branches inconsistently. Run multiple queries and deduplicate.
- **Don't forget rate limits.** Space searches apart. The 403 error is silent — you'll get empty results, not an error, if you're rate-limited on MCP.
