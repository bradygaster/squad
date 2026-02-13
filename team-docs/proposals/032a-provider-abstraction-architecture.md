# Proposal 032a: Provider Abstraction Layer — Technical Architecture

**Author:** Fenster (Core Dev)  
**Date:** 2026-02-10  
**Status:** Draft  
**Requested by:** bradygaster — *"PLEASE try to 'abstract' anything that azure devops or gitlabs or some other git provider might offer."*  
**Companion to:** Proposal 032 Section 4 (Keaton's provider abstraction design)  
**Builds on:** 028a (Kujan's API capabilities assessment), 032 (GitHub-native proposals)

---

## 1. Current State

### What index.js Does Today

`index.js` is a **CLI installer** (~530 lines). It has five subcommands:

| Subcommand | Purpose |
|-----------|---------|
| `(default)` | Init — copies `squad.agent.md`, templates, creates `.ai-team/` directories |
| `upgrade` | Overwrites Squad-owned files, runs migrations |
| `export` | Serializes `.ai-team/` state to JSON |
| `import` | Restores `.ai-team/` from an export file |
| `help` | Usage text |

**Zero runtime operations.** It never runs during a conversation. It never talks to GitHub. It copies files and exits.

### Where Are the Git/GitHub Touchpoints?

There are **two layers** of GitHub coupling, and they live in different places:

**Layer 1: `index.js` (CLI installer) — Minimal coupling**

| Location | Coupling | Hardcoded? |
|----------|----------|------------|
| Line 34: `npx github:bradygaster/squad` | Usage text references GitHub install | Yes — cosmetic only |
| Line 331-338: Source file validation | Expects `.github/agents/squad.agent.md` | Yes — but this is Copilot CLI convention, not GitHub-the-platform |
| Lines 406-442: Agent file copy | Copies to `.github/agents/` | Yes — Copilot CLI convention |
| `.gitattributes` merge rules (L479-496) | Writes `merge=union` rules | Git-native, not GitHub-specific |

**Verdict:** `index.js` has near-zero GitHub-platform coupling. The `.github/agents/` path is a Copilot CLI convention that applies regardless of git provider. The install URL is cosmetic.

**Layer 2: `squad.agent.md` (Coordinator prompt) — Deep coupling**

This is where all the GitHub coupling lives:

| Section | Lines | Coupling |
|---------|-------|----------|
| GitHub Issues Mode | 1143-1267 | `gh` CLI commands hardcoded throughout |
| Issue Source config | 1174-1182 | Stored in `team.md`, GitHub-specific field names |
| Prerequisites check | 1149-1153 | `gh --version`, `gh auth status` |
| Branch/PR workflow | 1202-1267 | `gh pr create`, `gh pr merge`, `gh issue close` |
| Init Mode question | 97-98 | "Is there a GitHub repo..." |
| MCP tool references | 1153, 1184 | GitHub MCP server tool names |

**Verdict:** The coordinator prompt is deeply GitHub-specific. Every write operation uses `gh` CLI. Every read operation uses GitHub MCP tools or `gh` CLI. Provider names, command syntax, and platform concepts (Issues, PRs, Labels) are GitHub-native.

### What's Hardcoded (Summary)

1. **`gh` CLI commands** — ~15 distinct commands in `squad.agent.md`
2. **GitHub MCP tool names** — `github-mcp-server-*` referenced for reads
3. **GitHub-specific concepts** — Issues (vs. Work Items in ADO), PRs (vs. Merge Requests in GitLab)
4. **`gh auth` workflow** — authentication assumes `gh` CLI
5. **`.github/agents/` path** — Copilot CLI convention (not platform-specific, but worth noting)
6. **`squad:` label convention** — GitHub Labels (vs. ADO Tags, GitLab Labels with different API)

---

## 2. Provider Interface

### Design Principles

1. **Operations, not commands.** The interface defines what Squad needs to do, not how it does it.
2. **Lowest common denominator + extensions.** Every provider must support core operations. Platform-specific features (sub-issues, reactions) are optional capabilities.
3. **Sync, not async.** All operations are request-response. No webhooks or event streams in the interface — those are implementation details.
4. **Strings in, structured data out.** Inputs are primitives. Outputs are plain objects. No platform-specific types leak through.

### Core Operations

#### 2.1 Repository Metadata

```js
/**
 * Verify provider authentication and connectivity.
 * @returns {{ authenticated: boolean, user: string, scopes: string[] }}
 * @throws {ProviderAuthError} if CLI not installed or not authenticated
 */
async function checkAuth()

/**
 * Get repository metadata.
 * @param {string} repo - Repository identifier (e.g., "owner/repo")
 * @returns {{ name: string, owner: string, defaultBranch: string, visibility: string }}
 * @throws {ProviderNotFoundError} if repo doesn't exist or no access
 */
async function getRepo(repo)

/**
 * Detect the provider from the current git remote.
 * @returns {{ provider: 'github'|'ado'|'gitlab'|'generic', repo: string } | null}
 */
function detectProvider()
```

**Error cases:** CLI not installed, not authenticated, repo not found, network failure, insufficient permissions.

#### 2.2 Issue CRUD

```js
/**
 * Create an issue/work item.
 * @param {string} repo
 * @param {{ title: string, body: string, labels?: string[], assignees?: string[], milestone?: string }} options
 * @returns {{ number: number, url: string }}
 * @throws {ProviderError} on API failure, rate limit, or permission denied
 */
async function createIssue(repo, options)

/**
 * Get a single issue by number.
 * @param {string} repo
 * @param {number} number
 * @returns {{ number: number, title: string, body: string, state: string, labels: string[], author: string, url: string, createdAt: string, updatedAt: string }}
 * @throws {ProviderNotFoundError} if issue doesn't exist
 */
async function getIssue(repo, number)

/**
 * Update an issue.
 * @param {string} repo
 * @param {number} number
 * @param {{ title?: string, body?: string, state?: 'open'|'closed', addLabels?: string[], removeLabels?: string[], milestone?: string }} updates
 * @returns {{ number: number, url: string }}
 */
async function updateIssue(repo, number, updates)

/**
 * Close an issue.
 * @param {string} repo
 * @param {number} number
 * @param {{ reason?: string, comment?: string }} options
 * @returns {{ number: number, state: string }}
 */
async function closeIssue(repo, number, options)

/**
 * List issues with filters.
 * @param {string} repo
 * @param {{ state?: 'open'|'closed'|'all', labels?: string[], milestone?: string, limit?: number, assignee?: string }} filters
 * @returns {Array<{ number: number, title: string, state: string, labels: string[], url: string }>}
 */
async function listIssues(repo, filters)

/**
 * Search issues using provider-native query syntax.
 * @param {string} repo
 * @param {string} query - Free-text search query
 * @returns {Array<{ number: number, title: string, state: string, labels: string[], url: string }>}
 */
async function searchIssues(repo, query)
```

**Error cases:** Permission denied, rate limited (especially search — 30/min on GitHub), issue not found, validation errors (missing title), network failure.

**Platform divergences:**
- ADO: Issues are "Work Items" with types (Bug, User Story, Task). `createIssue` maps to `az boards work-item create --type "User Story"`. The `type` field is ADO-specific; the interface ignores it and defaults to the provider's most generic work item type.
- GitLab: Issues are "Issues" — maps cleanly. `glab issue create`.
- Generic: No issue tracker. Returns `ProviderUnsupportedError`.

#### 2.3 Comment CRUD

```js
/**
 * Add a comment to an issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} body - Markdown content
 * @returns {{ id: string, url: string }}
 */
async function createComment(repo, issueNumber, body)

/**
 * List comments on an issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {{ limit?: number }} options
 * @returns {Array<{ id: string, author: string, body: string, createdAt: string }>}
 */
async function listComments(repo, issueNumber, options)

/**
 * Get a single comment.
 * @param {string} repo
 * @param {string} commentId
 * @returns {{ id: string, author: string, body: string, createdAt: string }}
 */
async function getComment(repo, commentId)
```

**Platform divergences:**
- ADO: Comments are "Discussion" entries on work items. `az boards work-item update` with discussion field, or REST API. Comment IDs are different from GitHub's.
- GitLab: `glab issue note create`. Clean mapping.

#### 2.4 Label Management

```js
/**
 * Create a label (idempotent — update if exists).
 * @param {string} repo
 * @param {{ name: string, color?: string, description?: string }} options
 * @returns {{ name: string }}
 */
async function createLabel(repo, options)

/**
 * List all labels in the repo.
 * @param {string} repo
 * @returns {Array<{ name: string, color?: string, description?: string }>}
 */
async function listLabels(repo)

/**
 * Apply labels to an issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string[]} labels
 * @returns {{ number: number, labels: string[] }}
 */
async function applyLabels(repo, issueNumber, labels)

/**
 * Remove labels from an issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string[]} labels
 * @returns {{ number: number, labels: string[] }}
 */
async function removeLabels(repo, issueNumber, labels)
```

**Platform divergences:**
- ADO: No first-class labels. Tags are semicolon-delimited strings on work items. `createLabel` is a no-op (tags are created on first use). `listLabels` queries distinct tags across work items. Colors are not supported.
- GitLab: Labels are first-class. `glab label create`. Full parity with GitHub.

#### 2.5 PR / Merge Request Lifecycle

```js
/**
 * Create a pull request / merge request.
 * @param {string} repo
 * @param {{ title: string, body: string, head: string, base: string, labels?: string[] }} options
 * @returns {{ number: number, url: string }}
 */
async function createPR(repo, options)

/**
 * Get PR details.
 * @param {string} repo
 * @param {number} number
 * @returns {{ number: number, title: string, body: string, state: string, head: string, base: string, mergeable: boolean, url: string, author: string }}
 */
async function getPR(repo, number)

/**
 * Merge a PR.
 * @param {string} repo
 * @param {number} number
 * @param {{ strategy?: 'merge'|'squash'|'rebase', deleteBranch?: boolean }} options
 * @returns {{ merged: boolean, sha: string }}
 */
async function mergePR(repo, number, options)

/**
 * Close a PR without merging.
 * @param {string} repo
 * @param {number} number
 * @returns {{ number: number, state: string }}
 */
async function closePR(repo, number)

/**
 * List PRs.
 * @param {string} repo
 * @param {{ state?: 'open'|'closed'|'merged'|'all', base?: string, head?: string, limit?: number }} filters
 * @returns {Array<{ number: number, title: string, state: string, url: string }>}
 */
async function listPRs(repo, filters)

/**
 * Get PR review comments and status.
 * @param {string} repo
 * @param {number} number
 * @returns {{ reviews: Array<{ author: string, state: string, body: string }>, status: { state: string, checks: Array<{ name: string, status: string }> } }}
 */
async function getPRReviews(repo, number)
```

**Platform divergences:**
- ADO: PRs are "Pull Requests" — same concept, different CLI (`az repos pr create`). Merge strategies differ (ADO calls squash "squash", but options are set per-repo policy, not per-PR).
- GitLab: PRs are "Merge Requests" (`glab mr create`). Otherwise maps cleanly. `merged` state exists natively.
- Generic: PRs are not available. `createPR` returns `ProviderUnsupportedError`. Work is committed directly.

#### 2.6 Reaction Management (Optional Capability)

```js
/**
 * Add a reaction to an issue or comment.
 * @param {string} repo
 * @param {{ target: 'issue'|'comment', id: number|string, reaction: string }} options
 * @returns {{ id: string, reaction: string }}
 * @throws {ProviderUnsupportedError} if provider doesn't support reactions
 */
async function addReaction(repo, options)

/**
 * List reactions on an issue or comment.
 * @param {string} repo
 * @param {{ target: 'issue'|'comment', id: number|string }} options
 * @returns {Array<{ reaction: string, user: string }>}
 */
async function listReactions(repo, options)
```

**Platform divergences:**
- GitHub: Full reaction support via `gh api`.
- ADO: No reactions. `addReaction` → `ProviderUnsupportedError`.
- GitLab: Emoji reactions via `glab api`. Different emoji set.

#### 2.7 Milestone / Sprint Management (Optional Capability)

```js
/**
 * List milestones/sprints.
 * @param {string} repo
 * @returns {Array<{ id: string, title: string, state: string, dueDate?: string }>}
 */
async function listMilestones(repo)

/**
 * Assign an issue to a milestone/sprint.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} milestoneId
 * @returns {{ number: number, milestone: string }}
 */
async function assignMilestone(repo, issueNumber, milestoneId)
```

**Platform divergences:**
- GitHub: Milestones are first-class. `gh issue edit --milestone`.
- ADO: "Iterations" (sprints) are area paths, not milestones. Mapping is approximate.
- GitLab: Milestones are first-class. `glab issue update --milestone`.

#### 2.8 Capability Negotiation

Not all providers support all operations. The interface needs a way to declare what's available:

```js
/**
 * Get provider capabilities.
 * @returns {{
 *   issues: boolean,
 *   pullRequests: boolean,
 *   labels: boolean,
 *   labelColors: boolean,
 *   reactions: boolean,
 *   milestones: boolean,
 *   subIssues: boolean,
 *   search: boolean,
 *   webhooks: boolean
 * }}
 */
function getCapabilities()
```

This lets the coordinator adapt. If `reactions === false`, skip reaction-based approval detection. If `subIssues === false`, use body-text references instead. If `labels === false` (generic git), skip label-based status tracking entirely.

---

## 3. Provider Implementations

### 3.1 GitHub Provider (Day 1)

**Two channels** (validated by Kujan in 028a):

| Channel | Use | Available To |
|---------|-----|-------------|
| `gh` CLI | All write operations, fallback reads | Coordinator, `task`, `general-purpose` agents |
| GitHub MCP Server | Read operations (preferred when available) | Coordinator, `task`, `general-purpose` agents (NOT `explore`) |

**Runtime detection logic:**

```
1. Check if `gh` CLI is installed: `gh --version`
   → If missing: provider is DEGRADED. Inform user.
   
2. Check if `gh` is authenticated: `gh auth status`
   → If not authenticated: provider is DEGRADED. Inform user.

3. Check if GitHub MCP tools are available: test for `github-mcp-server-list_issues` in tool list
   → If available: prefer MCP for reads, `gh` CLI for writes
   → If unavailable: use `gh` CLI for everything

4. Check for `project` scope: `gh auth status` scopes output
   → If missing: project/milestone operations degraded (028a Gap 3)
```

**Command mapping:**

| Operation | Primary | Fallback |
|-----------|---------|----------|
| `createIssue` | `gh issue create --repo {repo} --title "{title}" --body "{body}" --label "{labels}" --json number,url` | — |
| `getIssue` | MCP `github-mcp-server-issue_read` (get) | `gh issue view {number} --repo {repo} --json number,title,body,state,labels,author,url,createdAt,updatedAt` |
| `listIssues` | MCP `github-mcp-server-list_issues` | `gh issue list --repo {repo} --state {state} --label "{labels}" --limit {limit} --json number,title,state,labels,url` |
| `searchIssues` | MCP `github-mcp-server-search_issues` | `gh issue list --repo {repo} --search "{query}" --json number,title,state,labels,url` |
| `createComment` | `gh issue comment {number} --repo {repo} --body "{body}"` | — |
| `listComments` | MCP `github-mcp-server-issue_read` (get_comments) | `gh issue view {number} --repo {repo} --comments --json comments` |
| `createPR` | `gh pr create --repo {repo} --title "{title}" --body "{body}" --head {head} --base {base}` | — |
| `getPR` | MCP `github-mcp-server-pull_request_read` (get) | `gh pr view {number} --repo {repo} --json ...` |
| `mergePR` | `gh pr merge {number} --repo {repo} --squash --delete-branch` | — |
| `createLabel` | `gh label create "{name}" --color "{color}" --description "{desc}" --force --repo {repo}` | — |
| `listLabels` | `gh label list --repo {repo} --json name,color,description` | — |

**Capabilities:**

```js
{
  issues: true,
  pullRequests: true,
  labels: true,
  labelColors: true,
  reactions: true,
  milestones: true,
  subIssues: true,       // GitHub supports sub-issues natively
  search: true,
  webhooks: true          // via GitHub Actions
}
```

### 3.2 Azure DevOps Provider (Day 2)

**CLI:** `az boards` (part of Azure CLI with `azure-devops` extension)

**What maps cleanly:**
- Work item CRUD → `az boards work-item create/update/show`
- PR lifecycle → `az repos pr create/update/show/complete`
- Queries → `az boards query --wiql "{WIQL}"`

**What diverges:**
- **No labels.** ADO uses "Tags" — semicolon-delimited strings, no colors, no API for tag management. `createLabel` becomes a no-op. `applyLabels` appends to the Tags field.
- **Work Item Types.** ADO requires a type (Bug, User Story, Task, Epic). The provider must default to "User Story" for `createIssue` and allow override.
- **Area Paths and Iterations.** ADO organizes by area paths (team/component) and iteration paths (sprint). These replace labels and milestones respectively but are structurally different.
- **Comments.** ADO work item comments use a discussion API, not a simple comment list. Comment IDs are revision-based.
- **Search.** ADO uses WIQL (Work Item Query Language), not free-text search. The provider must translate or expose WIQL directly.
- **Auth.** `az login` + `az devops configure --defaults organization=https://dev.azure.com/{org} project={project}`. No simple `az auth status` equivalent.

**Capabilities:**

```js
{
  issues: true,          // Work Items
  pullRequests: true,
  labels: false,         // Tags exist but no first-class label API
  labelColors: false,
  reactions: false,
  milestones: true,      // Iterations (approximate)
  subIssues: true,       // Parent/Child work item links
  search: true,          // WIQL
  webhooks: true         // Service Hooks
}
```

**Estimated mapping effort:** 12-16 hours. The main cost is WIQL translation and Tags-as-labels impedance mismatch.

### 3.3 GitLab Provider (Day 2)

**CLI:** `glab` (GitLab CLI)

**What maps cleanly:**
- Issue CRUD → `glab issue create/view/update/close/list`
- MR lifecycle → `glab mr create/view/merge/close/list`
- Labels → `glab label create/list`
- Comments → `glab issue note create/list`
- Milestones → `glab milestone list`, `glab issue update --milestone`

**What diverges:**
- **PRs are Merge Requests.** Terminology difference. API is equivalent.
- **Issue search.** `glab issue list --search` supports free-text. Less powerful than GitHub's search syntax.
- **Reactions.** GitLab has "award emoji" on issues/MRs. Different API surface.
- **Sub-issues.** GitLab doesn't have native sub-issues. Uses "related issues" and task lists in descriptions.

**Capabilities:**

```js
{
  issues: true,
  pullRequests: true,     // Merge Requests
  labels: true,
  labelColors: true,
  reactions: true,        // Award emoji
  milestones: true,
  subIssues: false,       // Related issues only
  search: true,           // Limited vs. GitHub
  webhooks: true
}
```

**Estimated mapping effort:** 8-12 hours. `glab` is very similar to `gh`. Lowest friction of the three providers.

### 3.4 Generic Git Provider (Fallback)

**CLI:** `git` only. No platform.

**What's available:**
- Branch creation, commits, pushes — all git-native operations work
- No issue tracker, no PRs, no labels

**What we do:**
- `createIssue` → `ProviderUnsupportedError` with message: "No issue tracker available. Consider connecting to GitHub, ADO, or GitLab."
- `createPR` → `ProviderUnsupportedError` with message: "No PR mechanism available. Push your branch and create a merge request manually."
- All read/write label/comment/reaction operations → `ProviderUnsupportedError`
- `detectProvider` returns `{ provider: 'generic', repo: null }`
- `getCapabilities` returns all `false`

**Fallback behavior:** When no provider is detected, Squad works in "local mode" — proposals are markdown files on disk (the current behavior). This is the graceful degradation path.

**Capabilities:**

```js
{
  issues: false,
  pullRequests: false,
  labels: false,
  labelColors: false,
  reactions: false,
  milestones: false,
  subIssues: false,
  search: false,
  webhooks: false
}
```

---

## 4. Configuration

### Where Does Provider Config Live?

**In `.ai-team/team.md`** — under a `## Platform` section. This is the right place because:

1. `team.md` is already the per-project configuration surface (Issue Source lives here today)
2. It's user-owned (never overwritten by `squad upgrade`)
3. It's agent-readable at runtime
4. It's portable via `squad export/import`

**Schema:**

```markdown
## Platform

| Field | Value |
|-------|-------|
| **Provider** | github |
| **Repository** | bradygaster/squad |
| **Connected** | 2026-02-10 |
| **CLI** | gh |
| **Auth** | verified |
```

This replaces the current `## Issue Source` section. The `## Platform` section is a superset — it covers issues, PRs, labels, and all provider operations.

### How Does `squad init` Set It Up?

**Auto-detection from git remote:**

```
1. Parse `git remote get-url origin`
2. Match against known patterns:
   - github.com/{owner}/{repo}     → provider: github
   - dev.azure.com/{org}/{project} → provider: ado
   - gitlab.com/{owner}/{repo}     → provider: gitlab
   - ssh://git@github.com:...      → provider: github (SSH variant)
   - *.visualstudio.com/...        → provider: ado (legacy URL)
   - Self-hosted GitLab instances  → provider: gitlab (if glab is configured)
   - No match                      → provider: generic
3. Display detection result:
   "✓ Detected GitHub remote: bradygaster/squad"
   or "No git platform detected — Squad will work in local mode."
```

This is **informational at init time**. The actual Platform config is written when the coordinator's Init Mode asks the user to connect. The init output just helps the user know what to expect.

### Can a Squad Switch Providers Mid-Project?

**Yes.** Update the `## Platform` section in `team.md`. The coordinator reads it every session. There's no migration needed because:

1. Issue numbers are not stored in Squad state (they're in the orchestration log, which is append-only)
2. Labels are re-created on the new platform (idempotent `createLabel`)
3. Open proposals on the old platform must be manually migrated (closed on old, re-created on new)

**Practical reality:** Provider switching is rare. The main use case is enterprise teams moving from ADO to GitHub or vice versa.

### Environment Variables for Auth

**No Squad-specific env vars.** Each provider's CLI handles its own auth:

| Provider | Auth Mechanism |
|----------|---------------|
| GitHub | `gh auth login` → stores token in `~/.config/gh/` |
| ADO | `az login` → stores token via Azure Identity |
| GitLab | `glab auth login` → stores token in `~/.config/glab-cli/` |
| Generic | N/A |

Squad doesn't manage credentials. It delegates to the platform CLI. If auth fails, Squad surfaces the provider's error message and suggests the auth command.

**CI/CD environments:** In GitHub Actions, `gh` is pre-authenticated via `GITHUB_TOKEN`. In ADO Pipelines, `az` can use service connections. Squad doesn't need to know — the CLI handles it.

---

## 5. Implementation Plan

### File Changes

| File | Change | Complexity |
|------|--------|------------|
| `squad.agent.md` | Replace hardcoded `gh` commands with provider-aware command templates; add `## Platform` config to Init Mode; replace `## Issue Source` with `## Platform` | HIGH — ~200 lines of prompt changes |
| `index.js` | Add git remote detection to init output (informational only, ~15 lines) | LOW |
| `.ai-team/team.md` | Runtime config — written by coordinator, not by CLI | N/A (no code change) |

### What's New (No New Files)

No new JavaScript files. No new modules. No `providers/` directory. The abstraction lives in the coordinator prompt.

**Why:** Keaton's 032 Section 4 is right — `index.js` is an installer, not a runtime. Adding a provider abstraction layer in JavaScript would require the coordinator to import and call JavaScript functions, which it can't do. The coordinator executes shell commands. The abstraction is at the command-template level.

### Can This Be Done Without Breaking Existing Functionality?

**Yes.** The changes are additive:

1. **Init:** Adding remote detection to the init output is purely informational. No behavior change.
2. **`squad.agent.md`:** The current `## Issue Source` section becomes `## Platform`. The `gh` commands in GitHub Issues Mode stay the same — they're just organized under a provider namespace. Day 1 behavior is identical.
3. **`upgrade`:** The upgraded `squad.agent.md` includes the new sections. No migration needed because `team.md` is user-owned and the coordinator gracefully handles missing `## Platform` (falls back to asking).
4. **`export/import`:** Unaffected — `team.md` is already exported as agent state.

### CLI Subcommand Integration

No new subcommands. Keaton explicitly deferred `squad propose "..."` (032 Section 6), and I agree. The provider abstraction is transparent to the CLI surface.

The only CLI-visible change is the init output:

```
Before:
  ✓ .github/agents/squad.agent.md (v0.2.0)
  ✓ .ai-team-templates/
  
After:
  ✓ .github/agents/squad.agent.md (v0.3.0)
  ✓ .ai-team-templates/
  ✓ Detected GitHub remote: bradygaster/squad
```

### Estimated Complexity Per Operation

| Operation Group | GitHub (Day 1) | ADO (Day 2) | GitLab (Day 2) |
|----------------|---------------|-------------|----------------|
| Issue CRUD | 2h (already done, reorganize) | 6h (WIQL, work item types) | 3h (very similar to gh) |
| Comment CRUD | 1h | 3h (discussion API) | 1h |
| Label management | 1h | 4h (Tags impedance) | 1h |
| PR lifecycle | 2h (already done, reorganize) | 4h (policy-based merge) | 2h |
| Reactions | 1h | 0h (unsupported) | 2h (award emoji) |
| Milestones | 1h | 3h (iterations) | 1h |
| Auth + detection | 1h | 3h | 2h |
| **Total** | **9h** | **23h** | **12h** |

Day 1 (GitHub) is mostly reorganization of existing commands. Day 2 providers are net-new work.

---

## 6. Prompt-Level vs Code-Level: The Call

**Keaton is right. Prompt-level abstraction is sufficient. We do NOT need code-level abstraction in `index.js`.**

Here's the justification:

### Why Prompt-Level Works

1. **The coordinator IS the runtime.** Squad's "engine" is an LLM interpreting `squad.agent.md`. Every git platform operation is a shell command the coordinator executes via `powershell` tool. The coordinator doesn't call JavaScript functions — it runs `gh issue create`. The abstraction layer is the prompt that tells it WHICH command to run.

2. **Command substitution is trivial for LLMs.** Replacing `gh issue create --title "X"` with `glab issue create --title "X"` is a string-template operation. The coordinator reads the provider from `team.md` and selects the corresponding command template from `squad.agent.md`. This is what LLMs do well.

3. **The alternative is worse.** A code-level abstraction would mean:
   - `index.js` grows from an installer to a runtime with a provider module system
   - The coordinator calls `squad provider createIssue "title" "body"` instead of `gh issue create`
   - We add a dependency on `index.js` being available at runtime (it's not — it runs once at install)
   - We need to handle stdout parsing, error normalization, and response formatting in JavaScript
   - We double the maintenance surface — every provider change touches both JS and prompt

4. **The coordinator already does this.** Line 1153 of `squad.agent.md`: "If the GitHub MCP server is configured, use that instead of `gh` CLI." This is runtime provider selection in the prompt. Extending it to "if provider is ADO, use `az boards` instead of `gh issue`" is the same pattern.

### When Code-Level Would Be Needed

If we ever need to:
- Run provider operations from `index.js` subcommands (e.g., `squad sync-issues`)
- Execute provider operations in CI/CD without an LLM
- Support complex multi-step operations that a single shell command can't handle (e.g., ADO work item linking requires multiple API calls)

None of these are on the roadmap. If they arrive, we can introduce a thin `lib/providers/` module. But we don't build it speculatively.

### The Architecture

```
squad.agent.md
├── ## Platform Config (reads from team.md)
│   └── Provider: github | ado | gitlab | generic
│
├── ## Provider Commands
│   ├── github:
│   │   ├── createIssue: gh issue create ...
│   │   ├── getIssue: gh issue view ... | MCP github-mcp-server-issue_read
│   │   ├── createComment: gh issue comment ...
│   │   ├── createPR: gh pr create ...
│   │   └── ...
│   │
│   ├── ado: (Day 2)
│   │   ├── createIssue: az boards work-item create ...
│   │   └── ...
│   │
│   ├── gitlab: (Day 2)
│   │   ├── createIssue: glab issue create ...
│   │   └── ...
│   │
│   └── generic: (fallback)
│       └── All operations: "Provider not available. Working in local mode."
│
├── ## Capability Check
│   └── Before using optional operations, check provider capabilities
│
└── ## Fallback Rules
    └── If any platform operation fails, fall back to filesystem equivalent
```

### What index.js Gets (Minimal)

The only code-level change is a ~15-line git remote detection in the init flow:

```js
// Detect git remote for provider hint (informational only)
try {
  const { execSync } = require('child_process');
  const remote = execSync('git remote get-url origin 2>&1', { encoding: 'utf8' }).trim();
  if (remote.includes('github.com')) {
    console.log(`${GREEN}✓${RESET} Detected GitHub remote: ${remote.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '')}`);
  } else if (remote.includes('dev.azure.com') || remote.includes('visualstudio.com')) {
    console.log(`${GREEN}✓${RESET} Detected Azure DevOps remote`);
  } else if (remote.includes('gitlab.com') || remote.includes('gitlab')) {
    console.log(`${GREEN}✓${RESET} Detected GitLab remote`);
  }
} catch {
  // No git remote or git not available — silent, not an error
}
```

That's it. The CLI stays an installer. The prompt stays the runtime.

---

## Trade-offs

### What we gain
- **Day 2 providers are additive.** Adding ADO or GitLab means adding command templates to `squad.agent.md`. No refactoring.
- **Zero runtime dependencies.** No provider libraries, no Node modules, no API clients.
- **Graceful degradation.** If a provider CLI isn't available, Squad falls back to local mode. No errors.
- **Capability negotiation.** The coordinator knows what each provider supports and adapts.

### What we lose
- **Type safety.** Prompt-level abstraction has no compile-time guarantees. A typo in a command template is a runtime error.
- **Testing.** We can't unit-test command templates. We test by running them. (This is already true for all coordinator behavior.)
- **Consistency enforcement.** Each provider's output format differs. The coordinator must parse different output shapes per provider.

### What we explicitly defer
- **JavaScript provider module system** — not needed unless CLI subcommands require provider operations
- **Webhook/event subscriptions** — out of scope for v0.3.0, provider-specific when it comes
- **OAuth/token management** — delegated to platform CLIs
- **Cross-provider issue migration** — manual for now

---

## Appendix: Provider Detection Heuristics

```
Remote URL pattern → Provider mapping:

github.com/{owner}/{repo}(.git)?           → github
git@github.com:{owner}/{repo}(.git)?       → github
ssh://git@github.com/{owner}/{repo}        → github

dev.azure.com/{org}/{project}/_git/{repo}  → ado
{org}@vs-ssh.visualstudio.com:v3/...       → ado
{org}.visualstudio.com/...                 → ado

gitlab.com/{owner}/{repo}(.git)?           → gitlab
git@gitlab.com:{owner}/{repo}(.git)?       → gitlab
{custom-domain} + glab configured          → gitlab

(anything else)                            → generic
```

The detection runs once at init time (informational) and once when the coordinator first reads `## Platform` from `team.md` (runtime). If `## Platform` has a provider set, detection is skipped.

---

## Review Requested

- **Keaton:** Does this technical architecture align with your Section 4 design? I've agreed with your prompt-level-only call and built the interface definitions as a contract even though the implementation is in the prompt.
- **Kujan:** Validate the GitHub provider command mapping against your 028a findings. Any gaps in the two-channel pattern (MCP read, gh write)?
- **Verbal:** The provider command templates will add ~100-150 lines to `squad.agent.md`. Context budget impact?
- **Hockney:** Can we test provider detection in the existing test suite? The `execSync` call for git remote detection needs a mock.

---

*This is the implementation companion to 032 Section 4. Day 1 is GitHub with prompt-level abstraction. Day 2 is additive. The CLI stays simple.*
