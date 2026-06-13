---
name: "cross-squad-communication"
description: "Protocol for sending queries, delegating tasks, and sharing context between independent Squad instances across different repositories"
domain: "multi-repo coordination"
confidence: "medium"
source: "Ported from tamirdresher/squad-skills (plugins/cross-squad-communication, validated against two production squad instances). Companion to the registry-aware cross-squad skill — this one teaches the actual communication protocols once a peer is discovered."
---

## Context

When multiple repositories each have their own Squad (AI team), they need to exchange information: knowledge queries, PR reviews, task delegation, and dependency analysis. Each squad has its own agents, MCP tools, and issue tracker — there is no shared runtime.

> **Companion skill — read first:** `cross-squad/SKILL.md` covers **discovery** of peer squads via `squad registry add/list/remove`. This skill picks up after a peer is known and covers the **communication protocols** themselves (sync CLI, async git, issue-based). The two are designed to be used together.

**When this skill applies:**
- A squad agent needs information from another squad-enabled repo
- A task needs to be delegated to another squad
- Cross-repo dependency analysis is needed
- PR review requests span repo boundaries

**Key constraint:** Each squad has its own runtime, MCP tools, and issue tracker. Cross-squad communication can be **synchronous** (via CLI session targeting the other repo) or **asynchronous** (file-based or issue-based). The coordinator decides which approach fits.

---

## Patterns

### Decision Tree: Choosing the Right Pattern

```
Is the target repo cloned locally?
├─ NO → Use Pattern 3 (Issue-Based) or Pattern 2 (Git-Based Async)
└─ YES
    ├─ Is this a quick query / knowledge lookup?
    │   └─ YES → Use Pattern 0 (Synchronous CLI) — fastest
    ├─ Does the work need to persist as artifacts?
    │   └─ YES → Use Pattern 2 (Git-Based Async)
    ├─ Is it a long-running analysis or multi-cycle task?
    │   └─ YES → Use Pattern 2 (Git-Based Async)
    └─ Is the target squad's Ralph running?
        ├─ YES → Pattern 2 or 3 (async processing available)
        └─ NO → Pattern 0 (Synchronous CLI) or Pattern 1 (Read-Only)
```

---

### Pattern 0: Synchronous CLI Session (Fastest for Interactive Queries)

For quick knowledge queries, decision lookups, or short analyses — spawn a Copilot CLI session with the working directory set to the target squad's repo. This lets you send a prompt and get a response within the same session, using the target repo's full context.

This is the same technique used by `ralph-watch.ps1`: write the prompt to a temp file, then invoke the CLI with that file as input. The key insight is that setting the working directory to the target repo gives the CLI session access to that squad's `.squad/` metadata, codebase, and conventions.

**Protocol:**
1. Write prompt to a temp file (avoids argument-splitting issues, as learned in `ralph-watch.ps1`)
2. Invoke CLI with `-p` pointing to the prompt file and `--working-directory` set to the target repo
3. Receive response in the same session

**Invocation:**
```powershell
# Spawn a Copilot CLI session targeting another squad's repo
$targetRepo = "C:\repos\platform-squad-repo"
$promptFile = New-TemporaryFile
@"
You are working in a Squad-enabled repository.
Read .squad/team.md and .squad/decisions.md first.

[CROSS-SQUAD REQUEST]
From: research-squad
Request Type: knowledge_query
Query: What is the current architecture of the platform? What services does it expose?
Response Format: Brief structured summary
"@ | Out-File $promptFile -Encoding utf8

# Option A: ghcs with prompt file
ghcs -p $promptFile -- --working-directory $targetRepo

# Option B: Start-Process for non-blocking (ralph-watch.ps1 style)
Start-Process pwsh -ArgumentList "-NoProfile -Command `"cd '$targetRepo'; ghcs -p '$promptFile'`"" -Wait

# Option C: Pipe directly
"What is the platform architecture?" | ghcs -- --working-directory $targetRepo
```

**When to use synchronous vs async:**

| Scenario | Pattern | Why |
|----------|---------|-----|
| Quick knowledge query | Synchronous CLI (Pattern 0) | Fast answer, no overhead |
| "What did you decide about X?" | Synchronous CLI (Pattern 0) | Read decisions.md via the target squad's context |
| PR review request | Either (Pattern 0 or 2/3) | Sync for quick feedback, async for thorough review |
| Task delegation (do work in their repo) | Async (Pattern 2 or 3) | Work needs to persist beyond the session |
| Long-running analysis | Async (Pattern 2) | May take multiple cycles |
| Target repo not locally cloned | Async (Pattern 3) | Can't set working directory to a remote repo |

**The coordinator decides which pattern to use based on:**
1. Is the target repo cloned locally? → If yes, sync CLI is available
2. Is this a quick query or a long task? → Quick = sync, long = async
3. Does the work need to persist? → If yes, use async (creates artifacts)
4. Is the target squad's Ralph running? → Needed for async processing

**Requirements:**
- Target repo must be cloned locally (for `--working-directory`)
- Prompt file avoids argument-splitting bugs (see `ralph-watch.ps1` lines 2166-2184)

**Response quality:** ⭐⭐⭐⭐⭐ — the CLI session has full context of the target repo, including code, squad metadata, and MCP tools.

### Liveness Protocol for Pattern 0

The synchronous CLI session requires monitoring to avoid false timeouts. With 7+ MCP servers initializing and `.squad/` metadata being read, startup can take 30-60 seconds. A hard timeout kills valid sessions before they complete. Instead, monitor the agency session's activity log directory.

**Health Check Approach:**

Instead of a fixed wall-clock timeout, monitor the agency session log directory for activity:

```powershell
# The agency CLI creates a session log directory
# e.g., ~/.agency/logs/session_20260325_071211_57824
$logDir = Get-ChildItem "$env:USERPROFILE\.agency\logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$lastSize = 0
$stallCount = 0

while ($proc -and -not $proc.HasExited) {
    Start-Sleep -Seconds 15
    $currentSize = (Get-ChildItem $logDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    
    if ($currentSize -eq $lastSize) {
        $stallCount++
        if ($stallCount -ge 4) { # 60s with no progress
            Write-Warning "Session stalled — no log activity for 60s"
            break
        }
    } else {
        $stallCount = 0
        $lastSize = $currentSize
    }
}
```

**Progress Indicators (What Counts as "Alive"):**

- New files appearing in the session log directory (e.g., `transcript.log`, `mcp-server-logs/`)
- Log file size increasing (indicates active processing)
- New or modified `.squad/` files in the target repo (e.g., `decisions/inbox.md`, `identity/history.md`)
- Process still running and consuming non-idle CPU time

**Stall Detection (When to Intervene):**

- **No log activity for 60s** → Issue a warning; session may be slow but not hung
- **No log activity for 120s** → Likely stuck; consider terminating and checking logs
- **Process exited with non-zero exit code** → Failed; examine `transcript.log` and `stderr` for errors
- **MCP server connection timeout** → Session blocked waiting for an MCP server response

**Recovery Actions When Stalled:**

1. **Check for user input waiting:** Inspect logs for prompts or dialogs (shouldn't happen with `--autopilot`)
2. **Check MCP server health:** Review `mcp-server-logs/` for connection errors or timeouts
3. **Retry with `--no-mcp` flag:** For lightweight queries that don't require MCP tools
   ```powershell
   # Retry without MCP servers — faster startup, limited capability
   ghcs -p $promptFile -- --working-directory $targetRepo --no-mcp
   ```
4. **Increase timeout threshold:** If MCP server initialization is consistently slow (>90s), raise threshold before declaring stall

---

### Pattern 1: Read-Only Knowledge Query (No CLI Needed)

For questions about another squad's architecture, decisions, or current state — read their `.squad/` metadata directly.

**Protocol:**
1. Read target repo's `.squad/team.md` → get stack, members, issue source
2. Read `.squad/decisions.md` → get architectural decisions
3. Read `.squad/routing.md` → understand who handles what
4. Read `.squad/identity/now.md` → get current focus
5. Scan code structure if needed (csproj files, directory layout)

**Requirements:**
- Target repo must be cloned locally or accessible via git
- No authentication needed beyond git read access

**Example:**
```powershell
# Query another squad's architecture
$targetRepo = "C:\repos\platform-squad-repo"
Get-Content "$targetRepo\.squad\team.md"
Get-Content "$targetRepo\.squad\decisions.md"
Get-Content "$targetRepo\.squad\identity\now.md"
```

**Response quality:** ⭐⭐⭐⭐ — excellent for structural/architectural questions.

---

### Pattern 2: Async Task Request (Git-Based)

For work that needs the target squad to execute (PR reviews, issue analysis, code changes).

**Protocol:**
1. Create request file in YOUR repo: `.squad/cross-squad/requests/{timestamp}-{target}-{id}.yaml`
2. Commit and push
3. Target squad's Ralph detects on next cycle
4. Target squad processes and writes response to their `.squad/cross-squad/responses/`
5. Your Ralph picks up the response

**Request File Format:**
```yaml
id: req-2026-06-13-001
source_squad: research-squad
source_repo: your-org/research-squad-repo
target_squad: platform-squad
target_repo: your-org/platform-squad-repo
request_type: knowledge_query | pr_review | task_delegation | dependency_check
priority: high | normal | low
created_at: 2026-06-13T10:00:00Z
query: "What is the current architecture of the platform?"
routing_hint: "lead"  # optional — which agent should handle this
status: pending
```

**Response File Format:**
```yaml
id: req-2026-06-13-001
responding_squad: platform-squad
responding_agent: lead
responded_at: 2026-06-13T10:15:00Z
status: completed | partial | rejected
response: |
  The platform architecture consists of...
artifacts: []  # optional file paths
```

---

### Pattern 3: Issue-Based Delegation (For GitHub-Hosted Repos)

For repos on GitHub, use issues with labels as the message bus.

**Protocol:**
1. Create issue in target repo with label `squad:cross-squad`
2. Include source squad identifier and routing hint in issue body
3. Target squad's Ralph picks up and routes to appropriate agent
4. Response posted as issue comment
5. Issue closed when complete

**Example:**
```bash
gh issue create \
  --repo your-org/platform-squad-repo \
  --title "[Cross-Squad] Architecture query from research-squad" \
  --body "Source: research-squad\nQuery: What services does the platform expose?\nRouting: lead" \
  --label "squad:cross-squad"
```

**Limitation:** Only works for repos on GitHub. Other platforms (Azure DevOps, GitLab, etc.) need different approach.

---

### Pattern 4: Cross-Repo Dependency Scan

For discovering how two repos relate to each other.

**Protocol:**
1. Search both repos for mutual references:
   ```powershell
   Select-String -Path (Get-ChildItem $repoA -Recurse -Include "*.md","*.cs","*.json","*.csproj") `
     -Pattern $repoB_name
   Select-String -Path (Get-ChildItem $repoB -Recurse -Include "*.md","*.cs","*.json","*.csproj") `
     -Pattern $repoA_name
   ```
2. Check shared NuGet packages / npm packages
3. Check shared ADO project or GitHub org
4. Document relationship type: code dependency, operational coupling, shared infra

---

## Discovery Protocol

Before sending any cross-squad request, verify the target:

```
1. Does .squad/team.md exist?           → Squad is installed
2. What is the issue_source?            → GitHub Issues | ADO | Planner
3. What agents are active?              → Check member status column
4. What is the routing table?           → Read routing.md
5. What is the current focus?           → Read identity/now.md
6. Is Ralph running?                    → Check for recent commits by Ralph
```

If `.squad/team.md` doesn't exist, the repo is not squad-enabled. Fall back to standard human communication.

---

## Platform Compatibility Matrix

| Source Issue Tracker | Target Issue Tracker | Mechanism |
|---------------------|---------------------|-----------|
| GitHub Issues | GitHub Issues | Issue-based (Pattern 3) |
| GitHub Issues | ADO Work Items | Git-based (Pattern 2) |
| GitHub Issues | Planner | Git-based (Pattern 2) |
| ADO Work Items | GitHub Issues | Issue-based (Pattern 3) via `gh` CLI |
| ADO Work Items | ADO Work Items | ADO cross-project work items |
| Any | Any | Git-based (Pattern 2) — universal fallback |

---

## Examples

### Example 1: research-squad queries platform-squad architecture

```powershell
# Step 1: Read metadata (Pattern 1)
$target = "C:\repos\platform-squad-repo"
$team = Get-Content "$target\.squad\team.md" -Raw
$decisions = Get-Content "$target\.squad\decisions.md" -Raw

# Step 2: Extract answer from metadata
# team.md reveals tech stack and member roles
# decisions.md reveals architectural choices

# Step 3: If deeper analysis needed, create async request (Pattern 2)
```

### Example 2: Request PR review from another squad

```yaml
# .squad/cross-squad/requests/2026-06-13-platform-squad-pr-review.yaml
id: pr-review-001
source_squad: research-squad
target_squad: platform-squad
request_type: pr_review
priority: normal
query: "Review PR #54 — package version fix. Check for correctness."
routing_hint: "lead"
status: pending
```

---

## Anti-Patterns

### ⚠️ Know when synchronous CLI is NOT the right choice
```powershell
# WRONG — don't use sync CLI for long-running tasks that need artifacts
ghcs -p $promptFile -- --working-directory $targetRepo
# If the task creates files, PRs, or takes multiple cycles → use async (Pattern 2 or 3)

# WRONG — don't use sync CLI when the target repo isn't cloned locally
ghcs -- --working-directory "C:\not\cloned\yet"
# If the repo isn't available locally → use issue-based delegation (Pattern 3)
```
Synchronous CLI sessions (Pattern 0) are valid for quick queries and knowledge lookups. Use async patterns for work that needs to persist or where the target repo isn't available locally.

### ❌ Don't assume shared MCP tools
Each squad has its own MCP server instances. You cannot invoke another squad's ADO tools or GitHub tools from your session.

### ❌ Don't skip the discovery step
Always read `team.md` first. The target squad may use a different issue tracker, have different agents, or be in a different state than expected.

### ❌ Don't send requests to squads without Ralph
If the target squad doesn't have Ralph (Work Monitor) running, async requests will never be processed. Check for recent Ralph activity first.

### ❌ Don't mix up repo platforms
Different repos may use GitHub Issues vs Azure DevOps Work Items vs Jira. Check `team.md` / repository metadata for the right tooling before sending requests.

---

## Validation Status

Originally designed and validated against two production squad instances (a GitHub-hosted platform squad with ~10 agents and an Azure DevOps-hosted automation squad with ~4 agents). The protocols are platform-agnostic; the examples in this document use generic names so you can substitute your own repos.

| Scenario | Result |
|----------|--------|
| Knowledge query (read-only) | ✅ Works via Pattern 1 |
| Step handler discovery | ✅ Works via file scan |
| PR review (basic) | ⚠️ Partial — git log only, no API |
| Backlog enumeration | ⚠️ Partial — depends on issue platform |
| Dependency analysis | ✅ Works via cross-reference scan |
| CLI invocation (sync) + Liveness Protocol | ✅ Works — session launches successfully; log monitoring prevents false timeouts |

**Confidence: MEDIUM** — Synchronous CLI pattern (Pattern 0) validated end-to-end. Liveness protocol provides operational robustness against slow MCP initialization. Git-based async (Pattern 2) and issue-based (Pattern 3) untested end-to-end. Production readiness requires Ralph integration on both sides.
