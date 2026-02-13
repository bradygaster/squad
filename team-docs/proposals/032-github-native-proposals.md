# Proposal 032: GitHub-Native Proposals — v0.3.0 Feature Design

**Author:** Keaton (Lead)  
**Date:** 2026-02-10  
**Status:** Draft  
**Requested by:** bradygaster — *"i want to be able to say 'i'd like a proposal for ____' and instead of it being a file on disk it's an issue."*  
**Supersedes:** Proposal 028 Phase 1 scope (one-way push). This proposal IS v0.3.0.  
**Builds on:** Proposal 028 (GitHub-native planning), 028a (API capabilities), 030 (async comms/CCA), 031 (CCA E2E test design)  
**Reference:** [spboyer/slidemaker](https://github.com/spboyer/slidemaker) — real-world validation of `squad:` label convention

---

## 1. Vision

Today, proposals are markdown files on feature branches. They work — they're fast, durable, git-tracked, and agent-readable. But they're invisible. Brady can't read a proposal on his phone. Shayne can't comment without checking out a branch. Discussion happens in terminal sessions that evaporate.

**This proposal kills the markdown-file proposal.** Proposals become GitHub Issues. The issue is the proposal. Not a mirror. Not a sync target. The issue IS it.

What this unlocks:

1. **Proposals have URLs.** Brady texts a link to Shayne. Done.
2. **Discussion has a home.** Comment threads replace ephemeral CLI sessions. Agents post analysis as comments. Humans reply. The conversation persists.
3. **Consensus is visible.** Reactions, approval comments, label transitions — all auditable, all API-queryable.
4. **The proposal lifecycle is GitHub's issue lifecycle.** Open → discussion → approved → implemented → closed. Labels and milestones replace status strings in markdown headers.
5. **Normal git practices apply naturally.** An approved proposal spawns a branch, becomes a PR, gets reviewed, and merges. GitHub already built this workflow — we stop reinventing it.
6. **Agents and humans collaborate in the same surface.** No context switching. No "the agent wrote this file but I need to read it in my editor." The issue is the shared workspace.

Proposal 028 designed GitHub as a "dashboard" — a projection of filesystem state. Brady's v0.3.0 directive flips that. **GitHub Issues are the source of truth for proposals.** The filesystem remains authoritative for team state (decisions, history, skills, charters), but proposals live where collaboration happens: on GitHub.

This is a strategic shift, not a tactical one. Squad stops being a tool that happens to push things to GitHub and becomes a tool that IS GitHub-native for its most visible workflow. The filesystem-authoritative principle (028, Option A) holds for everything except proposals. Proposals are collaborative artifacts — they deserve a collaborative surface.

---

## 2. The Proposal Lifecycle (Issue-Native)

### Step 1: User Requests a Proposal

The user says something like:
- *"I'd like a proposal for dark mode support"*
- *"Can the team write up a proposal for WebSocket integration?"*
- *"Propose a caching layer"*

The coordinator detects proposal intent (same pattern matching as current routing — "proposal for X", "write a proposal about X", "I'd like a proposal for X").

### Step 2: Coordinator Creates the Issue

The coordinator — not an individual agent — creates the GitHub Issue. This is a coordinator responsibility because it's an orchestration action, not domain work.

```bash
gh issue create \
  --repo {owner/repo} \
  --title "Proposal: {title}" \
  --body "{initial body — see template below}" \
  --label "squad,proposal,status:draft" \
  --assignee ""
```

The issue body uses a standard template:

```markdown
## Proposal: {title}

**Requested by:** {user name}  
**Date:** {ISO date}  
**Status:** Draft

---

## Problem
{Why this matters — to be filled by the assigned agent}

## Solution
{What we'd build — to be filled by the assigned agent}

## Trade-offs
{What we gain, what we lose}

## Alternatives Considered
{What else we looked at}

## Implementation
{How we'd build it}

---

*This proposal was created by Squad. Team members will analyze and comment below.*
```

The coordinator stores the issue number in session context and announces:

```
📋 Created proposal issue #{number}: "{title}"
   Routing to {agent} for initial analysis.
```

### Step 3: Agent Analysis as Comments

The coordinator routes the proposal to the appropriate agent (Lead for architecture, domain expert for domain-specific proposals). The agent is spawned with the issue context.

The agent's output is posted as a **comment** on the issue — not as an edit to the issue body. This preserves the initial request and builds a conversation.

```bash
gh issue comment {number} --repo {owner/repo} --body "{agent analysis}"
```

The comment includes the agent's analysis: problem framing, proposed solution, trade-offs, alternatives. The agent signs the comment with their name:

```markdown
## Analysis — {Agent Name} ({Role})

{Full analysis content}

---
*— {Agent Name}, {Role}*
```

### Step 4: Team Discussion via Comments

Once the initial analysis is posted, other team members can be spawned to comment:
- The coordinator can proactively spawn additional agents for review ("Let me get Fenster's take on testability")
- The user can direct review ("Verbal, what do you think about this proposal?")
- Humans comment directly on the issue from GitHub's UI

Each agent comment follows the same signature pattern. The issue's comment thread becomes the design discussion.

### Step 5: Consensus and Approval

Approval is explicit, not inferred. The flow:

1. **Agent readiness:** When agents have posted their analysis and no objections remain, the coordinator (or the Lead agent) posts a comment: `"✅ This proposal is ready for review. @{owner} — approve, request changes, or discuss."`
2. **Human approval:** The repo owner (Brady) comments with approval language ("approved", "ship it", "LGTM", "go") or applies a label (`status:approved`).
3. **Coordinator action:** When the coordinator detects approval (via label change or approval comment), it:
   - Updates the issue labels: remove `status:draft`, add `status:approved`
   - Posts a comment: `"📌 Proposal approved. Decomposing into work items."`
   - Triggers work decomposition (Step 6)

**Why not reactions?** Reactions (👍/👎) are too ambiguous for approval. A 👍 from an agent means "I've reviewed this" but doesn't carry the authority of owner approval. Labels are the canonical status mechanism. Comments are the approval gesture.

**What about rejection?** If the owner says "no", "rejected", "not now", or applies `status:rejected`:
- Labels update: remove `status:draft`, add `status:rejected`
- Issue is closed with comment: `"❌ Proposal rejected. Reason: {owner's comment}"`
- The issue stays closed as a learning artifact (same as cancelled proposals today)

### Step 6: Approved Proposal → Work Items

An approved proposal becomes work. The coordinator spawns the Lead to decompose the proposal into concrete work items, each becoming a sub-issue or a linked issue:

```bash
# For each work item:
gh issue create \
  --repo {owner/repo} \
  --title "{work item title}" \
  --body "{user story format with acceptance criteria}" \
  --label "squad,squad:{agent-name}" \
  --milestone "{sprint}"
```

Each work item issue references the parent proposal: `"Part of proposal #{proposal-number}"`. The proposal issue gets a checklist comment tracking all child work items:

```markdown
## Work Items

- [ ] #{item-1} — {title} (assigned: {agent})
- [ ] #{item-2} — {title} (assigned: {agent})
- [ ] #{item-3} — {title} (assigned: {agent})
```

### Step 7: Normal Git Flow

From here, it's the existing GitHub Issues Mode flow (already in `squad.agent.md`):
- Agent picks up a work item issue
- Creates branch: `squad/{issue-number}-{slug}`
- Does the work
- Opens a PR: `Closes #{issue-number}`
- Review → merge
- Issue closes automatically

When all work item issues are closed, the coordinator closes the parent proposal issue with a completion comment.

---

## 3. The "Octomember" Concept

Brady suggested every squad might get an "octomember" — a dedicated agent for git platform operations, like Scribe is for memory.

### My call: Don't build this yet.

Here's why. Scribe exists because memory management is a cross-cutting concern that every agent spawn touches. Every agent produces decisions, logs, history updates. Without Scribe, every agent would need memory-management instructions, bloating every spawn prompt.

Git platform operations are different. They're **event-driven and coordinator-mediated**, not cross-cutting. The coordinator creates issues. The coordinator posts comments. The coordinator updates labels. These are orchestration actions — they belong in the coordinator, not in a separate agent.

An Octomember would add:
- Another spawn per operation (latency)
- Context overhead (~4% per agent, per our budget analysis)
- A new coordination surface between coordinator and Octomember
- Complexity in deciding what's "coordinator work" vs. "Octomember work"

For **zero** benefit that the coordinator can't provide directly. The coordinator already has `gh` CLI access. It already has MCP tools. It already mediates all agent interactions.

### When an Octomember makes sense

If we get to a point where:
- Multiple agents need to independently perform git operations in the same session
- The coordinator's prompt is so bloated with GitHub instructions that it crowds out orchestration logic
- We need platform-specific logic that's complex enough to warrant its own charter

Then we revisit. Today, the coordinator handles this. It's simpler, faster, and keeps the agent count down.

### Name, if we build it later

From The Usual Suspects universe: **Redfoot** — the fence who connects the crew to the outside world. The intermediary between the team and the platform. Redfoot doesn't plan the heist; Redfoot makes the connections that let the heist happen.

---

## 4. Provider Abstraction Layer

Brady explicitly asked for this: *"PLEASE try to 'abstract' anything that azure devops or gitlabs or some other git provider might offer."*

### Operations to Abstract

Every operation Squad needs from a git platform, grouped by domain:

**Issue lifecycle:**
| Operation | GitHub (Day 1) | ADO (Day 2) | GitLab (Day 2) |
|-----------|---------------|-------------|----------------|
| `createIssue(title, body, labels)` | `gh issue create` | `az boards work-item create` | `glab issue create` |
| `commentOnIssue(number, body)` | `gh issue comment` | `az boards work-item update` (discussion) | `glab issue note` |
| `updateIssueLabels(number, add, remove)` | `gh issue edit --add-label/--remove-label` | `az boards work-item update --fields Tags=` | `glab issue update --label` |
| `closeIssue(number, reason)` | `gh issue close` | `az boards work-item update --state Closed` | `glab issue close` |
| `listIssues(filters)` | `gh issue list` / MCP `list_issues` | `az boards query` | `glab issue list` |
| `getIssue(number)` | `gh issue view` / MCP `issue_read` | `az boards work-item show` | `glab issue view` |
| `getIssueComments(number)` | MCP `issue_read` (get_comments) | `az boards work-item show --expand Relations` | `glab issue note list` |
| `searchIssues(query)` | MCP `search_issues` | `az boards query --wiql` | `glab issue list --search` |

**PR lifecycle:**
| Operation | GitHub | ADO | GitLab |
|-----------|--------|-----|--------|
| `createPR(title, body, head, base)` | `gh pr create` | `az repos pr create` | `glab mr create` |
| `mergePR(number)` | `gh pr merge` | `az repos pr update --status completed` | `glab mr merge` |
| `getPRStatus(number)` | MCP `pull_request_read` | `az repos pr show` | `glab mr view` |

**Label management:**
| Operation | GitHub | ADO | GitLab |
|-----------|--------|-----|--------|
| `createLabel(name, color, desc)` | `gh label create` | Tags (no colors) | `glab label create` |
| `listLabels()` | `gh label list` | `az boards query` (Tags field) | `glab label list` |

### Interface Design

The provider is a configuration object in `.ai-team/team.md` and a set of shell commands the coordinator executes. We do NOT build a JavaScript abstraction layer. Why:

1. Squad's coordinator is a prompt, not a runtime. It executes shell commands. The abstraction is at the command-template level, not the code level.
2. `index.js` is a CLI installer, not a runtime engine. Adding provider abstractions to it would be a fundamental misarchitecture.
3. The coordinator already adapts commands based on context (MCP vs. `gh` CLI for reads). Extending this pattern to provider commands is natural.

**Provider configuration in `team.md`:**

```markdown
## Platform

| Field | Value |
|-------|-------|
| **Provider** | github |
| **Repository** | {owner/repo} |
| **Connected** | {date} |
| **CLI** | gh |
```

**Provider command templates in the coordinator prompt:**

The coordinator prompt includes a provider-specific command section. Day 1, it's all GitHub. When we add a second provider, we add a conditional block:

```
If provider is "github":
  Create issue: gh issue create --repo {repo} --title "{title}" --body "{body}" --label "{labels}"
  Comment: gh issue comment {number} --repo {repo} --body "{body}"
  Close: gh issue close {number} --repo {repo}
  ...

If provider is "ado":
  Create issue: az boards work-item create --type "User Story" --title "{title}" --description "{body}" ...
  ...
```

This is ugly. It's also correct for the current architecture. The coordinator is a prompt. Prompts don't import modules. They template commands.

### Where this lives

- **Provider detection:** `squad.agent.md` — the coordinator reads `team.md` to determine the provider.
- **Command templates:** `squad.agent.md` — in the proposal lifecycle section.
- **Provider configuration:** Set during `squad init` or when the user first says "connect to {owner/repo}". Stored in `team.md`.
- **NOT in `index.js`:** The CLI doesn't need to know about providers. It copies files. The coordinator uses the provider at runtime.

### Day 1 scope

GitHub only. Provider field defaults to `github`. The abstraction exists in the design (command templates are provider-namespaced) but no second provider ships. The value of the abstraction is that when ADO or GitLab support is needed, we add command templates and a detection heuristic — we don't refactor the architecture.

---

## 5. Changes to squad.agent.md

The coordinator prompt needs significant additions and one structural change.

### New Section: Proposal Mode (Issue-Native)

Add a new section between GitHub Issues Mode and PRD Mode. This section defines:

1. **Proposal triggers** — intent patterns that indicate a user wants a proposal
2. **Issue creation template** — the standard issue body format
3. **Agent-as-commenter flow** — how agents post analysis to issues
4. **Approval detection** — how the coordinator recognizes approval/rejection
5. **Work decomposition trigger** — what happens on approval
6. **Provider command templates** — GitHub commands for all proposal operations

### Modified Section: GitHub Issues Mode

The existing section handles *external* issues (work items from a repo). The new Proposal Mode handles *internal* proposals (created by Squad). These are parallel but distinct:

- **GitHub Issues Mode:** "Here are issues that exist. Work them." (reactive, inbound)
- **Proposal Mode:** "Create a proposal as an issue. Discuss it. Approve it. Decompose it. Work it." (proactive, outbound)

The Issue → PR → Merge lifecycle in GitHub Issues Mode is reused by Proposal Mode after work decomposition. No duplication — Proposal Mode decomposes, then hands individual work items to the existing Issues Mode flow.

### Modified Section: Init Mode

Add a new post-setup question:

```
"Is there a GitHub repo for this project? (owner/repo, or skip)"
```

If provided, store in `team.md` under `## Platform` with `Provider: github`. This replaces the current `## Issue Source` section (which was specific to GitHub Issues Mode). The Platform section is broader — it covers proposals, issues, and PRs.

### Modified Section: Routing

Add proposal intent to the routing table:

```
| "I'd like a proposal for X" / "propose X" / "write a proposal" | Follow Proposal Mode |
```

### Sections That Do NOT Change

- **Casting** — unaffected
- **Design Review** — still used for PR review, orthogonal to proposals
- **Constraints** — unaffected
- **Source of Truth Hierarchy** — filesystem remains authoritative for everything except proposals

### Estimated Prompt Growth

Proposal Mode section: ~150-200 lines. Provider command templates: ~30-40 lines. Routing table additions: ~5 lines. Init Mode additions: ~10 lines.

Total: ~200-250 lines added to a ~1400-line prompt. ~15% growth. Within budget — the coordinator is at ~1.5% context overhead currently, and this keeps it under 2%.

---

## 6. Changes to index.js (CLI)

### My call: Minimal changes to index.js.

Brady's vision is about the coordinator prompt and the runtime workflow. The CLI (`index.js`) is an installer — it copies files and sets up the `.ai-team/` directory. The proposal lifecycle is a coordinator behavior, not a CLI behavior.

### What changes

**Init flow — platform detection:**

During `squad init`, after copying files, detect if the current directory is a git repo connected to a remote:

```javascript
// Detect GitHub remote
const remote = execSync('git remote get-url origin 2>/dev/null', { encoding: 'utf8' }).trim();
```

If a remote is detected, note it in the init output:

```
✓ Detected GitHub remote: bradygaster/squad
  Squad will use GitHub Issues for proposals. Tell Squad "connect to bradygaster/squad" to activate.
```

This is informational only — the actual connection happens in the coordinator's Init Mode or when the user explicitly connects.

**No new subcommands.** Brady suggested `squad propose "..."` — I'm deferring this. The proposal flow starts in a Copilot CLI conversation: "I'd like a proposal for X." Adding a CLI entry point would mean the CLI needs to authenticate with GitHub, create issues, and understand the proposal template. That's coordinator logic, not installer logic. The CLI stays simple.

If we want a CLI shortcut later, it's a one-liner wrapper that opens Copilot with a pre-filled prompt — not a standalone command that talks to the GitHub API.

**No auth configuration in CLI.** Auth is handled by `gh auth login`, which users already have if they're using GitHub. Squad doesn't manage credentials.

### What doesn't change

- `export` / `import` — unaffected (proposals are on GitHub, not in `.ai-team/`)
- `upgrade` — unaffected (copies the updated `squad.agent.md` which contains the new Proposal Mode)
- File structure — no new files created by the CLI

---

## 7. Comment-as-Conversation Design

This is the richest part. Agents commenting on issues as design discussion.

### How Agents Post Comments

When the coordinator spawns an agent for proposal analysis, the agent's output is posted as an issue comment. The coordinator (not the agent) posts the comment, because:
1. The agent is spawned via `task` tool and returns its output to the coordinator
2. The coordinator has the issue number and repo context
3. Centralizing comment posting keeps the `gh` CLI calls in one place

The coordinator takes the agent's response and runs:

```bash
gh issue comment {number} --repo {owner/repo} --body "{agent output formatted as markdown}"
```

### Distinguishing Agent Voices

Each agent comment is signed with a distinctive header and footer:

```markdown
---

### 🏗️ Keaton (Lead)

{analysis content}

---
*Posted by Squad — Keaton (Lead)*
```

The emoji + name + role header makes it instantly scannable. The footer confirms it's an AI comment. Humans reading the issue see a clear conversation between named participants.

**Why not GitHub bot accounts?** Bot accounts require app registration, OAuth flows, and per-installation tokens. Far too much infrastructure for v0.3.0. All comments post from the authenticated user's `gh` CLI session. The signature block makes authorship clear without needing separate accounts.

**Why not @mentions between agents?** Agents don't have GitHub accounts to @mention. The coordinator mediates all agent interaction. If Keaton's analysis needs Fenster's input, the coordinator spawns Fenster — it doesn't post a comment saying "@fenster what do you think?" Agents respond to the coordinator, not to each other on GitHub.

### How the Coordinator Tracks Agent Input

The coordinator maintains a checklist in the issue comments:

```markdown
## Review Status

- [x] Keaton (Lead) — posted analysis
- [x] Verbal (Prompt Engineer) — posted analysis
- [ ] Fenster (Core Dev) — pending
- [ ] Hockney (Tester) — pending
```

This comment is updated as agents post their analysis. When all relevant agents have commented, the coordinator posts the "ready for review" prompt.

### Human vs. AI Comment Identification

Every agent comment includes the footer: `*Posted by Squad — {Name} ({Role})*`. Human comments don't have this footer. That's the distinction. Simple, reliable, no infrastructure.

Future enhancement: if Squad ever gets GitHub App status, agent comments could come from a `squad-bot` account, making the distinction automatic via GitHub's "bot" badge. That's not v0.3.0.

### Comment Threading Strategy

GitHub Issue comments are flat (not threaded). This is fine. The conversation reads top-to-bottom:

1. **Issue body** — the proposal request
2. **Agent analysis** — posted by coordinator on behalf of the routed agent
3. **Human feedback** — Brady comments with questions or direction
4. **Agent responses** — coordinator spawns agents to address specific feedback, posts their responses
5. **Additional reviews** — other agents weigh in
6. **Approval** — owner approves or rejects

This is a natural conversation flow. Threading would actually hurt readability for this use case — you want to see the full evolution of the proposal, not fragmented sub-conversations.

---

## 8. Work Decomposition

### How an Approved Proposal Becomes Work

When a proposal is approved (label `status:approved` applied), the coordinator:

1. **Spawns the Lead** to decompose the proposal into work items
2. **Creates one issue per work item** with:
   - Title: `{work item title}`
   - Body: User story format (validated by slidemaker — see 028 Reference Implementation)
   - Labels: `squad`, `squad:{agent-name}`, milestone label
   - Reference to parent: `"Part of proposal #{proposal-number}"`
3. **Posts a tracking comment** on the parent proposal issue with the work item checklist

### Issue Structure

Work items use the slidemaker-validated format:

```markdown
## User Story
**As a** {persona}, **I want** {capability}, **so that** {benefit}.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Notes
- **Squad member:** {Name} ({Role})
- **Primary work:** {file paths}
- **Dependencies:** {list or "None — can start immediately"}
- **Parent proposal:** #{proposal-number}
```

### Sub-Issues vs. Linked Issues

GitHub supports sub-issues natively (verified in 028a — `get_sub_issues` method exists). Use sub-issues when available:

```bash
gh issue create --repo {owner/repo} --title "{title}" --body "{body}" --label "squad,squad:{agent}" --parent-issue {proposal-number}
```

If sub-issues aren't available (older repos or API limitations), fall back to linked references in the body text. The coordinator checks sub-issue support and adapts.

### Integration with Existing GitHub Issues Mode

Work item issues are handled by the existing GitHub Issues Mode in `squad.agent.md`. The flow is:

```
Proposal (issue) → Approved → Work items (sub-issues) → GitHub Issues Mode picks them up
                                                         → Agent branches, implements, PRs
                                                         → Review, merge, close
                                                         → Parent proposal closes when all children close
```

No new workflow needed for the work-item-to-implementation phase. It's already built.

### Sprint / Milestone Assignment

If a milestone exists for the current sprint (e.g., `v0.3.0`), work items are assigned to it:

```bash
gh issue edit {number} --repo {owner/repo} --milestone "v0.3.0"
```

Milestone creation is manual (Brady creates sprints) or automated during sprint planning ceremonies. Not in scope for this proposal.

---

## 9. Implementation Plan

### Phase 1: Minimal Viable Flow (v0.3.0 — THE DELIVERABLE)

**Scope:** Proposal → Issue → Agent comments → Human approval → Close

**What ships:**
1. Coordinator detects proposal intent and creates a GitHub Issue
2. Coordinator routes to appropriate agent, posts analysis as issue comment
3. Agent comments are signed with name/role
4. Coordinator detects approval (label change or approval comment from owner)
5. On approval, coordinator posts a summary comment and closes with `status:approved`
6. On rejection, coordinator closes with `status:rejected`
7. Provider configuration stored in `team.md` under `## Platform`
8. Init Mode asks for repo connection
9. Routing table updated with proposal intent

**What doesn't ship:**
- Work decomposition into sub-issues (agents can do this manually if asked)
- Automated work-item-to-branch-to-PR lifecycle (already exists in Issues Mode — just not auto-triggered)
- Provider abstraction (GitHub only — but command templates are organized for future extraction)
- Review status tracking comment (nice-to-have, not essential)
- Octomember agent

**Effort:** 6-10 hours of prompt engineering. Zero code changes to `index.js`. All changes in `squad.agent.md`.

**Risk:** Low. This is prompt engineering using proven tools (`gh` CLI, MCP). The slidemaker reference implementation validates the core patterns. If anything breaks, Squad falls back to the current markdown-file flow.

### Phase 2: Full Lifecycle (v0.4.0)

**Scope:** Approved proposal → Work items → Branches → PRs → Merge → Proposal closes

**What ships:**
1. Lead agent decomposes approved proposals into work item sub-issues
2. Tracking checklist on parent proposal
3. Auto-trigger: when all work items close, parent proposal closes
4. Pull-back: human comments on proposals are read by agents on next session
5. Review status tracking (which agents have weighed in)

**Effort:** 8-12 hours

### Phase 3: Provider Abstraction (v0.5.0+)

**Scope:** Support ADO and GitLab as proposal platforms

**What ships:**
1. Provider detection (GitHub remote → github, ADO remote → ado, GitLab remote → gitlab)
2. Command templates for ADO and GitLab in the coordinator prompt
3. Provider-specific label/tag handling (ADO uses Tags not Labels, GitLab uses Labels but with different API)
4. Documentation for configuring each provider

**Effort:** 12-16 hours per provider (research + prompt engineering + testing)

**Why defer:** No demand signal for non-GitHub providers yet. Abstracting now would be speculative engineering. The architecture supports it — command templates are already provider-namespaced. When the demand comes, the work is additive, not a refactor.

---

## 10. Prior Art

### Proposal 028 — GitHub-Native Team Planning

028 designed the full vision: filesystem-authoritative, GitHub-as-dashboard, one-way-push Phase 1. Brady's v0.3.0 directive goes further: proposals aren't pushed TO GitHub, they're BORN on GitHub. 028's architecture for backlog sync, project boards, and reconciliation is still valid and can layer on top of this proposal later. 032 takes 028's Phase 1 and evolves it from "push proposals to issues" to "proposals ARE issues."

### Proposal 028a — API Capabilities Assessment

Kujan's assessment confirms everything we need is available:
- Issue creation: `gh issue create` ✅
- Issue comments: `gh issue comment` ✅
- Label management: `gh label create`, `gh issue edit --add-label` ✅
- Issue reading: MCP tools for read, `gh` CLI for write ✅
- Rate limits: 5,000/hour core, negligible impact ✅

The two-channel pattern (MCP for read, `gh` CLI for write) applies directly.

### spboyer/slidemaker — Real-World Validation

Shayne's slidemaker project validated:
- The `squad:` label convention (9 issues, 3 agents, clean filtering)
- User story format with acceptance criteria (consistent, parseable)
- Agent metadata injection in issue bodies (self-routing)
- PRD → Issues decomposition pipeline (end-to-end)

Every pattern in this proposal builds on slidemaker's proof.

### Proposal 031 — CCA E2E Test Design

031 establishes that CCA reads `squad.agent.md` and can work under Squad governance. When proposals become issues, CCA can be assigned proposal work items — pick up an issue, branch, implement, PR. The CCA E2E test patterns validate that this pipeline works. Issue-native proposals make CCA integration cleaner: CCA already works from issues, so proposals-as-issues is CCA-native by default.

### Proposal 030 — Async Comms Feasibility

030 identified CCA-as-squad-member as the "floor" for async communication. Issue-native proposals reinforce this: the issue comment thread IS an async conversation between agents and humans. Proposal 032 delivers a form of async comms without any bridge infrastructure — the GitHub issue is the channel.

### Existing GitHub Issues Mode in squad.agent.md

The current GitHub Issues Mode handles inbound issues: "pull issues from {repo}, work them." Proposal 032 adds outbound issue creation: "create a proposal as an issue." The work-item implementation phase reuses Issues Mode's branch → PR → merge lifecycle directly. No duplication.

---

## Trade-offs

### What we gain
- Proposals are visible, collaborative, URL-addressable
- Discussion persists across sessions
- Normal git flow applies naturally
- CCA integration becomes trivial (issues are CCA's native input)
- External contributors can participate in proposals
- Brady can review proposals from his phone

### What we lose
- **Offline proposal creation.** Creating a proposal requires `gh` CLI and network access. Mitigation: if GitHub is unavailable, fall back to markdown file creation and post a note: "Created proposal as local file — will push to GitHub when connected."
- **Proposal 028's filesystem-authoritative principle for proposals.** We're making GitHub the source of truth for proposals. This is intentional — proposals are collaborative artifacts, and collaboration happens on GitHub. Team state (decisions, history, skills) remains filesystem-authoritative.
- **Speed.** Creating a GitHub Issue is ~2-3 seconds slower than writing a markdown file. Acceptable for a proposal workflow that runs once per feature, not once per minute.
- **Git history of proposal evolution.** Markdown proposals had full git history. Issue proposals have comment history instead. Different, not worse — comment history is actually richer (threaded discussion, reactions, timestamps per comment).

### What we explicitly defer
- **Octomember agent** — coordinator handles all git platform operations for now
- **Provider abstraction implementation** — design exists, only GitHub ships
- **Project board integration** — labels and milestones are sufficient for v0.3.0
- **Bidirectional sync for non-proposal artifacts** — decisions, history, skills stay filesystem-only
- **CLI subcommand for proposals** — proposals are created via conversation, not CLI flags
- **Bot accounts for agent comments** — signature blocks are sufficient

---

## Success Criteria

### Phase 1 (v0.3.0)
1. User says "I'd like a proposal for X" → a GitHub Issue is created with correct labels and template
2. An agent's analysis appears as a signed comment on the issue
3. When Brady comments "approved" or applies `status:approved`, the coordinator detects it and closes the proposal
4. If `gh` CLI is unavailable, Squad falls back to markdown file proposal (no errors, no degradation)
5. All proposal-related commands use `gh` CLI (no MCP write dependency)

### Phase 2 (v0.4.0)
6. Approved proposals decompose into sub-issue work items
7. Work items follow the slidemaker-validated user story format
8. Parent proposal closes when all child work items close
9. Human comments on proposals are visible to agents on next session

---

## Review Requested

- **Brady:** Is this the v0.3.0 you envisioned? Does "proposals ARE issues" match your intent, or do you still want filesystem copies?
- **Verbal:** Prompt engineering assessment. How much coordinator instruction does Phase 1 require? Does it fit in the context budget? What's the trigger pattern design?
- **Kujan:** Platform validation. Confirm that `gh issue create` + `gh issue comment` + label management covers Phase 1 end-to-end. Any gaps in 028a that affect this flow?
- **Fenster:** Implementation review. What are the edge cases? What happens when two agents try to comment on the same issue simultaneously? Is there a race condition?

---

**This is v0.3.0. One feature. One thing done well. Proposals become issues. The team discusses in comments. The owner approves. Work flows from there. Everything else defers.**

---

## 11. Proposal Migration Plan

Brady's directive: *"no more md files in the squad repo — we drive it all via issues, work in the open as a squad."* This means the 42 existing proposals in `team-docs/proposals/` need to migrate to GitHub Issues. Not all of them are equal. Some are historical artifacts. Some are active work. Some are superseded by newer thinking. The migration plan respects these differences.

### 11.1 Classification of All 42 Proposals

Every proposal falls into one of four categories:

**Category A: Shipped (migrate as closed issues, label `status:shipped`)**

These proposals were approved AND implemented. They're historical records. Migrate them as closed issues so they show up in search and serve as reference, but don't clutter the open issue list.

| # | Proposal | Notes |
|---|----------|-------|
| 001 | Proposal-First Workflow | Foundational — shipped, defines the process itself |
| 001a | Proposal Lifecycle Amendment | Amendment to 001 — shipped |
| 002 | Messaging Overhaul | Shipped |
| 004 | Demo Script Overhaul | Shipped |
| 007 | Agent Persistence and Latency | Shipped |
| 008 | Portable Squads (all 3: core, platform, experience) | Shipped — consolidated decision |
| 010 | Skills System | Shipped |
| 011 | Forwardability and Upgrade Path | Shipped |
| 012 | Skills Platform and Copilot Integration | Shipped |
| 013 | V1 Test Strategy | Shipped — 92 tests |
| 014 | V1 Messaging and Launch | Shipped |
| 014a | Where-Are-We Messaging Beat | Shipped |
| 015 | P0 Silent Success Bug | Shipped |
| 019 | Master Sprint Plan | Shipped (Waves 1-3) |
| 019a | Sprint Plan Amendments | Shipped |
| 020 | Blog and Packaging | Shipped (npm parts superseded) |
| 021 | Release Plan and Distribution | Shipped |
| 025 | PR2 GitHub Issues, PRD, Humans Review | Shipped |

**18 proposals.** These migrate as closed issues with body containing the original proposal content and a note: *"Migrated from `team-docs/proposals/{filename}`. Originally shipped on {date}."*

**Category B: Active / Approved — Not Yet Shipped (migrate as open issues, label `status:approved` or `status:draft`)**

These proposals are actively relevant to v0.3.0 or upcoming work.

| # | Proposal | Status | Migration Label |
|---|----------|--------|-----------------|
| 024 | Per-Agent Model Selection | Approved ✅ | `status:approved` |
| 024a | Model Catalog | Research Complete | `status:draft` |
| 024b | Model Selection Algorithm | Draft | `status:draft` |
| 026 | Scripted E2E Demos | Draft | `status:draft` |
| 027 | v0.3.0 Sprint Plan | Approved — REVISED | `status:approved` |
| 028 | GitHub-Native Team Planning | Phase 1 Approved | `status:approved` |
| 028a | GitHub API Capabilities | Research Complete | `status:research` |
| 029 | Marketing Site | Draft | `status:draft` |
| 029a | Marketing Site Content | Proposed | `status:draft` |
| 030 | Async Comms Feasibility | Active | `status:approved` |
| 031 | CCA E2E Test Design | Draft | `status:draft` |
| 032 | GitHub-Native Proposals (this doc) | Draft | `status:draft` |

**12 proposals.** These migrate as open issues. Agent analysis from the markdown content becomes the issue body. Comments thread starts fresh on GitHub.

**Category C: Superseded (migrate as closed issues, label `status:superseded`)**

These were replaced by newer proposals. Close them with a note pointing to the successor.

| # | Proposal | Superseded By |
|---|----------|---------------|
| 006 | README Rewrite | 014 (V1 Messaging) and 019 |
| 009 | V1 Sprint Plan | 019 (Master Sprint Plan) |
| 018 | Wave Execution Plan | 019 (Master Sprint Plan) |

**3 proposals.** Close with comment: *"Superseded by #{successor-issue-number}. See that issue for the current design."*

**Category D: Deferred to Horizon (migrate as closed issues, label `status:deferred`)**

These were explicitly deferred — not killed, but not active. Migrate as closed with a `status:deferred` label so they can be reopened when the time comes.

| # | Proposal | Reason |
|---|----------|--------|
| 003 | Copilot Platform Optimization | Deferred to Horizon |
| 005 | Video Content Strategy | Deferred to Horizon |
| 016 | The Squad Paper | Deferred to Horizon |
| 017 | Squad DM (all 3: messaging interface, platform feasibility, experience design) | Deferred per 019, then un-deferred per Brady, status is ambiguous — migrate as open `status:draft` |
| 022 | Squad Visual Identity | Draft — Deferred to Horizon |
| 023 | Incoming Queue | Revised Draft — Deferred to Horizon |

**6 proposals** (017 variants counted as 3, but migrate as single consolidated issue). The three 017 proposals should migrate as ONE issue titled "Proposal: Squad DM — Direct Messaging Interface" with content from all three variants, since they were already consolidated per team decisions. Status: open, `status:draft` — Brady un-deferred DM to P0 for v0.3.0.

**Revised count for 017:** 017 moves to Category B (active, open). Remaining in Category D: 003, 005, 016, 022, 023 = **5 proposals** closed as deferred.

### 11.2 Migration Order

**Wave 1: Active proposals first (Category B — 12 issues)**

These are what the team is working on NOW. Migrating them first means current work immediately benefits from issue-based collaboration. Brady can comment on proposal 032 from his phone the day it migrates.

Order within Wave 1:
1. **032** — this proposal (meta: the migration plan itself becomes an issue)
2. **027** — v0.3.0 sprint plan (the active sprint)
3. **028, 028a** — GitHub-native planning (directly related to the migration)
4. **030, 031** — async comms and CCA testing (active v0.3.0 work)
5. **024, 024a, 024b** — model selection (approved for v0.3.0)
6. **026, 029, 029a** — demos and marketing (lower priority but active)
7. **017 (consolidated)** — Squad DM (un-deferred to P0)

**Wave 2: Shipped proposals (Category A — 18 issues)**

Batch-migrate as closed issues. These can go in one script run since they're all being closed immediately. The goal is searchability, not active work.

**Wave 3: Superseded + Deferred (Categories C + D — 8 issues)**

Low priority. Migrate last. These are the least likely to be referenced.

### 11.3 Metadata That Transfers

| Source (Markdown) | Destination (Issue) |
|-------------------|---------------------|
| `**Author:**` | Issue body metadata section |
| `**Date:**` | Issue body metadata section (GitHub's created_at will be the migration date) |
| `**Status:**` | Label: `status:{status}` |
| `**Builds on:**` | Issue body — "Dependencies" section with `#issue-number` references (after all are migrated) |
| `**Supersedes:**` | Issue body — note pointing to superseded issue |
| `**Requested by:**` | Issue body metadata section |
| Proposal content (Problem, Solution, etc.) | Issue body — full content preserved |
| File path | Issue body footer: `*Migrated from team-docs/proposals/{filename}*` |

### 11.4 Migration Method: Script with Agent Review

**Not fully manual** — 42 proposals by hand is tedious and error-prone.
**Not fully automated** — the classification above required human judgment that a script can't replicate.

**Recommended approach: migration script + agent review.**

1. A migration script reads each `.md` file, extracts metadata (author, date, status), and generates `gh issue create` commands
2. The script outputs a preview (dry run) of all 42 issues it would create
3. An agent (Lead or Scribe) reviews the preview for classification accuracy
4. The script executes, creating all issues in the correct order
5. Wave 2 and 3 issues are immediately closed with appropriate labels after creation

**Script location:** `.github/scripts/migrate-proposals.sh` (not shipped to users — internal tooling)

**Script template:**

```bash
#!/usr/bin/env bash
# migrate-proposals.sh — Migrate markdown proposals to GitHub Issues
set -euo pipefail

REPO="bradygaster/squad"
DRY_RUN="${1:-true}"  # Pass "false" to execute

migrate_proposal() {
  local file="$1" title="$2" status_label="$3" close="$4" close_reason="$5"
  local body
  body=$(cat "team-docs/proposals/$file")
  
  local footer=$'\n\n---\n*Migrated from `team-docs/proposals/'"$file"'`*'
  body="${body}${footer}"

  if [ "$DRY_RUN" = "true" ]; then
    echo "[DRY RUN] Would create: \"Proposal: $title\" [labels: squad,proposal,$status_label] [close: $close]"
    return
  fi

  local issue_url
  issue_url=$(gh issue create --repo "$REPO" \
    --title "Proposal: $title" \
    --body "$body" \
    --label "squad,proposal,$status_label")
  
  local issue_number
  issue_number=$(echo "$issue_url" | grep -o '[0-9]*$')
  echo "Created #$issue_number: $title"

  if [ "$close" = "true" ]; then
    gh issue close "$issue_number" --repo "$REPO" --reason "$close_reason" \
      --comment "Closed as $status_label. This proposal was migrated from the markdown archive."
  fi
}

# Wave 1: Active proposals (open)
migrate_proposal "032-github-native-proposals.md" "GitHub-Native Proposals" "status:draft" "false" ""
migrate_proposal "027-v030-sprint-plan.md" "v0.3.0 Sprint Plan" "status:approved" "false" ""
# ... (remaining Wave 1, Wave 2, Wave 3 entries)

echo "Migration complete."
```

### 11.5 Issue Title Format

All migrated proposals use the format: `Proposal: {descriptive title}`

Examples:
- `Proposal: GitHub-Native Proposals`
- `Proposal: Per-Agent Model Selection`
- `Proposal: V1 Test Strategy` (closed, shipped)

This matches the format defined in Section 2 of this document and ensures consistency between migrated and new proposals.

### 11.6 Label Scheme for Migrated Proposals

| Label | Color | Purpose |
|-------|-------|---------|
| `squad` | — | Base label for all squad-managed issues |
| `proposal` | — | Identifies the issue as a proposal |
| `status:draft` | — | Proposal is in draft/discussion |
| `status:approved` | — | Proposal is approved for implementation |
| `status:shipped` | — | Proposal was implemented and shipped |
| `status:superseded` | — | Proposal replaced by a newer proposal |
| `status:deferred` | — | Proposal deferred to a future release |
| `status:research` | — | Research/assessment, not a full proposal |
| `migration` | — | Indicates the issue was migrated from markdown |
| `v0.1.0` | — | Release where shipped (for historical proposals) |
| `v0.2.0` | — | Release where shipped |
| `v0.3.0` | — | Target release for active proposals |

### 11.7 What Happens to `team-docs/proposals/` After Migration

**Option A: Archive branch (recommended).** Create a `proposals-archive` branch containing the full `team-docs/proposals/` directory. Then remove the directory from the working branch. The archive branch is read-only reference — never merged back.

**Option B: Delete from main.** Remove `team-docs/proposals/` from main. Git history preserves everything. If anyone needs the original markdown, it's in git log.

**Option C: Keep as read-only with a README.** Replace all proposal files with a single `team-docs/proposals/README.md` that says: *"Proposals have moved to GitHub Issues. See https://github.com/bradygaster/squad/issues?q=label:proposal"*

**My recommendation: Option C for v0.3.0, Option A for v0.4.0.** Option C is the lowest-risk transition — existing links and references still work (the directory exists), and anyone landing there gets redirected. In v0.4.0, archive the branch and clean up.

---

## 12. GitHub Actions Automation

Brady said *"factor in actions — sky's the limit."* Here's the Actions layer that makes proposals self-managing. These workflows live in the Squad repo itself AND can be adapted by any repo that uses Squad.

### 12.1 Proposal Bot — Auto-Setup on Label

**Workflow:** `.github/workflows/proposal-bot.yml`
**Trigger:** Issue labeled with `proposal`
**What it does:** When any issue gets the `proposal` label, the bot posts a template comment prompting for required sections (if the issue body doesn't already contain them) and applies the `status:draft` label.

```yaml
name: Proposal Bot

on:
  issues:
    types: [labeled]

jobs:
  setup-proposal:
    if: github.event.label.name == 'proposal'
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Check proposal template
        uses: actions/github-script@v7
        with:
          script: |
            const issue = context.payload.issue;
            const body = issue.body || '';
            
            const requiredSections = ['## Problem', '## Solution', '## Trade-offs'];
            const missing = requiredSections.filter(s => !body.includes(s));
            
            if (missing.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: issue.number,
                body: `### 🤖 Proposal Bot\n\nThis issue has been tagged as a proposal. The following sections are recommended but not yet present:\n\n${missing.map(s => '- ' + s).join('\n')}\n\nYou can add these sections by editing the issue body, or a Squad agent will fill them in during analysis.\n\n---\n*Automated by Squad Proposal Bot*`
              });
            }
            
            // Ensure status:draft label exists
            const labels = issue.labels.map(l => l.name);
            if (!labels.some(l => l.startsWith('status:'))) {
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: issue.number,
                labels: ['status:draft']
              });
            }
```

### 12.2 Consensus Checker — Auto-Transition on Approval

**Workflow:** `.github/workflows/proposal-consensus.yml`
**Trigger:** Issue comment created on issues with `proposal` label
**What it does:** Monitors proposal issues for approval signals from the repo owner. When the owner comments with approval language ("approved", "ship it", "LGTM", "go"), auto-transitions from `status:draft` to `status:approved`.

```yaml
name: Proposal Consensus Checker

on:
  issue_comment:
    types: [created]

jobs:
  check-approval:
    if: |
      contains(github.event.issue.labels.*.name, 'proposal') &&
      github.event.comment.author_association == 'OWNER'
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Detect approval signal
        uses: actions/github-script@v7
        with:
          script: |
            const comment = context.payload.comment.body.toLowerCase().trim();
            const approvalPatterns = ['approved', 'ship it', 'lgtm', 'go', 'approve', 'let\'s do it', 'green light'];
            const rejectionPatterns = ['rejected', 'no', 'not now', 'defer', 'kill it'];
            
            const isApproval = approvalPatterns.some(p => comment.includes(p));
            const isRejection = rejectionPatterns.some(p => comment.includes(p));
            
            if (isApproval) {
              // Remove draft, add approved
              const labels = context.payload.issue.labels.map(l => l.name);
              const draftLabels = labels.filter(l => l.startsWith('status:'));
              for (const label of draftLabels) {
                await github.rest.issues.removeLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: context.payload.issue.number,
                  name: label
                }).catch(() => {}); // ignore if label doesn't exist
              }
              
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                labels: ['status:approved']
              });
              
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                body: '### 📌 Proposal Approved\n\nThis proposal has been approved by the repo owner. Ready for work decomposition.\n\n---\n*Automated by Squad Consensus Checker*'
              });
            }
            
            if (isRejection) {
              const labels = context.payload.issue.labels.map(l => l.name);
              const statusLabels = labels.filter(l => l.startsWith('status:'));
              for (const label of statusLabels) {
                await github.rest.issues.removeLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: context.payload.issue.number,
                  name: label
                }).catch(() => {});
              }
              
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                labels: ['status:rejected']
              });
              
              await github.rest.issues.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                state: 'closed',
                state_reason: 'not_planned'
              });
            }
```

### 12.3 Sprint Planner — Auto-Create Work Items

**Workflow:** `.github/workflows/proposal-decompose.yml`
**Trigger:** Issue labeled with `status:approved` on issues that also have the `proposal` label
**What it does:** When a proposal is approved, assigns it to `@copilot` for work decomposition. CCA reads the proposal body and creates sub-issues as work items. This is the bridge between proposal approval and implementation.

```yaml
name: Sprint Planner — Proposal Decomposition

on:
  issues:
    types: [labeled]

jobs:
  decompose:
    if: |
      github.event.label.name == 'status:approved' &&
      contains(github.event.issue.labels.*.name, 'proposal')
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Create decomposition issue
        uses: actions/github-script@v7
        with:
          script: |
            const proposal = context.payload.issue;
            
            // Create a work decomposition issue assigned to @copilot
            const result = await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Decompose: ${proposal.title}`,
              body: `## Task\n\nDecompose proposal #${proposal.number} into concrete work items.\n\nRead the proposal at #${proposal.number} and create sub-issues for each implementable unit of work. Each work item should follow the user story format:\n\n- **As a** {persona}, **I want** {capability}, **so that** {benefit}\n- Acceptance criteria as checkboxes\n- Label each work item with \`squad\` and \`squad:{agent-name}\`\n- Reference this proposal: "Part of proposal #${proposal.number}"\n\n## Proposal Summary\n\n${proposal.title}\n\n---\n*Auto-created by Sprint Planner on proposal approval*`,
              labels: ['squad', 'squad:keaton'],
              assignees: ['copilot']
            });
            
            // Post tracking comment on the original proposal
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: proposal.number,
              body: `### 📋 Work Decomposition\n\nProposal approved. Work decomposition issue created: #${result.data.number}\n\nWork items will be created as sub-issues of this proposal.\n\n---\n*Automated by Squad Sprint Planner*`
            });
```

### 12.4 Stale Proposal Cleanup

**Workflow:** `.github/workflows/proposal-stale.yml`
**Trigger:** Scheduled — runs weekly
**What it does:** Labels proposals with no activity after 14 days as `stale`. Closes stale proposals after 28 days of inactivity with a comment.

```yaml
name: Stale Proposal Cleanup

on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9 AM UTC
  workflow_dispatch:

jobs:
  stale:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/stale@v9
        with:
          stale-issue-label: 'stale'
          stale-issue-message: >
            This proposal has had no activity for 14 days. It will be closed
            in 14 more days if there's no further discussion. Remove the
            `stale` label or comment to keep it open.
            
            *Automated by Squad Stale Proposal Cleanup*
          close-issue-message: >
            Closing this proposal due to 28 days of inactivity. Reopen if
            it becomes relevant again.
            
            *Automated by Squad Stale Proposal Cleanup*
          days-before-stale: 14
          days-before-close: 14
          only-labels: 'proposal,status:draft'
          exempt-issue-labels: 'status:approved,status:shipped,pinned'
          remove-stale-when-updated: true
```

### 12.5 Agent Comment Poster

**Workflow:** `.github/workflows/agent-comment.yml`
**Trigger:** `workflow_dispatch` with inputs for issue number, agent name, and comment body
**What it does:** Decouples agent execution from GitHub API posting. An agent completes analysis locally, then triggers this workflow to post the comment. This is useful for async scenarios where the agent session has ended but the output needs to reach GitHub.

```yaml
name: Agent Comment Poster

on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number to comment on'
        required: true
        type: number
      agent_name:
        description: 'Agent name (e.g., Keaton, Verbal, Fenster)'
        required: true
        type: string
      agent_role:
        description: 'Agent role (e.g., Lead, Prompt Engineer, Core Dev)'
        required: true
        type: string
      agent_emoji:
        description: 'Agent emoji (e.g., 🏗️, 🎯, ⚙️)'
        required: true
        type: string
      comment_body:
        description: 'The analysis content (markdown)'
        required: true
        type: string

jobs:
  post-comment:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Post signed agent comment
        uses: actions/github-script@v7
        with:
          script: |
            const { issue_number, agent_name, agent_role, agent_emoji, comment_body } = context.payload.inputs;
            
            const signedComment = `---\n\n### ${agent_emoji} ${agent_name} (${agent_role})\n\n${comment_body}\n\n---\n*Posted by Squad — ${agent_name} (${agent_role})*`;
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: parseInt(issue_number),
              body: signedComment
            });
```

### 12.6 CI for Proposals — Template Linter

**Workflow:** `.github/workflows/proposal-lint.yml`
**Trigger:** Issue opened or edited with the `proposal` label
**What it does:** Checks that proposal issues contain required sections. Posts a comment with missing sections. This is a softer version of the Proposal Bot — it re-checks after edits.

```yaml
name: Proposal Lint

on:
  issues:
    types: [opened, edited]

jobs:
  lint:
    if: contains(github.event.issue.labels.*.name, 'proposal')
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Lint proposal body
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.issue.body || '';
            const checks = [
              { section: '## Problem', required: true },
              { section: '## Solution', required: true },
              { section: '## Trade-offs', required: false },
              { section: '## Implementation', required: false },
            ];
            
            const results = checks.map(c => ({
              ...c,
              present: body.includes(c.section)
            }));
            
            const missing = results.filter(r => r.required && !r.present);
            const optional = results.filter(r => !r.required && !r.present);
            
            if (missing.length > 0) {
              let msg = '### 📝 Proposal Lint\n\n**Required sections missing:**\n';
              msg += missing.map(m => `- ❌ ${m.section}`).join('\n');
              if (optional.length > 0) {
                msg += '\n\n**Optional sections (recommended):**\n';
                msg += optional.map(m => `- ⚠️ ${m.section}`).join('\n');
              }
              msg += '\n\n---\n*Automated by Squad Proposal Lint*';
              
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                body: msg
              });
            }
```

### 12.7 CCA Integration — Auto-Assign on Approval

**Workflow:** `.github/workflows/cca-assign.yml`
**Trigger:** Issue labeled with `status:approved` on issues that also have `proposal` label
**What it does:** When a proposal is approved and has work items (sub-issues), assigns sub-issues labeled `squad:copilot` or `cca` to `@copilot` for implementation. This closes the loop: proposal → approval → decomposition → CCA implementation.

```yaml
name: CCA Auto-Assignment

on:
  issues:
    types: [labeled]

jobs:
  assign-cca:
    if: |
      github.event.label.name == 'squad:copilot' ||
      github.event.label.name == 'cca'
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Assign to Copilot
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.addAssignees({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.issue.number,
              assignees: ['copilot']
            });
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.issue.number,
              body: '### 🤖 CCA Assigned\n\nThis work item has been assigned to Copilot Coding Agent for implementation. CCA will read `squad.agent.md` for governance rules and create a PR.\n\n---\n*Automated by Squad CCA Assignment*'
            });
```

### 12.8 Workflow Summary

| Workflow File | Trigger | Purpose | Runs In |
|---------------|---------|---------|---------|
| `proposal-bot.yml` | Issue labeled `proposal` | Template check, add `status:draft` | Squad repo + consumer repos |
| `proposal-consensus.yml` | Comment on `proposal` issue by owner | Auto-transition `status:draft` → `status:approved` or `status:rejected` | Squad repo + consumer repos |
| `proposal-decompose.yml` | Issue labeled `status:approved` + `proposal` | Create decomposition task for CCA/Lead | Squad repo + consumer repos |
| `proposal-stale.yml` | Weekly schedule | Label/close inactive proposals | Squad repo + consumer repos |
| `agent-comment.yml` | `workflow_dispatch` | Post signed agent comments async | Squad repo |
| `proposal-lint.yml` | Issue opened/edited with `proposal` label | Check required sections | Squad repo + consumer repos |
| `cca-assign.yml` | Issue labeled `squad:copilot` or `cca` | Auto-assign to `@copilot` | Squad repo + consumer repos |

**Squad repo vs. consumer repos:** Workflows marked "Squad repo + consumer repos" should be included in the Squad template (copied during `squad init`). The `agent-comment.yml` is Squad-internal only — it supports the async agent comment pipeline, which is specific to Squad's multi-agent model.

### 12.9 Actions in Consumer Repos

When a user runs `squad init` in their project, the following workflows are copied to `.github/workflows/`:
- `proposal-bot.yml` — so proposals work immediately
- `proposal-consensus.yml` — so owner approval triggers transitions
- `proposal-stale.yml` — so proposals don't rot

The remaining workflows (`proposal-decompose.yml`, `cca-assign.yml`) are opt-in. Not every repo uses CCA or needs auto-decomposition. These ship as templates in `docs/workflows/` with a README explaining how to enable them.

`proposal-lint.yml` ships by default but can be removed. Some teams won't want the lint noise.

---

## 13. Working in the Open

Brady wants Squad itself to *"work in the open as a squad."* This isn't just a feature — it's a culture shift.

### 13.1 What "Working in the Open" Means for Squad

Today, Squad's development happens in private sessions. Brady talks to agents in a terminal. Proposals are markdown files on feature branches. Decisions live in `.ai-team/decisions.md` — gitignored, invisible to the outside world. The only public artifacts are code, docs, and the changelog.

"Working in the open" means:

1. **Proposals are public GitHub Issues.** Anyone can see what Squad is planning, what's been decided, what's in progress. The entire product roadmap is visible at `github.com/bradygaster/squad/issues?q=label:proposal`.
2. **Agent analysis is public.** When Keaton posts an architecture analysis on a proposal issue, that analysis is visible to anyone watching the repo. The quality of Squad's thinking is on display.
3. **Discussion history is permanent and public.** No more ephemeral terminal sessions. Every design decision, every trade-off, every "why did we do it this way?" is captured in issue comments.
4. **Progress is trackable.** Labels, milestones, and project boards show what's approved, what's in flight, what's shipped. No one needs to ask "what's the status?" — it's on the board.
5. **Contributions are visible.** When Shayne opens an issue or comments on a proposal, that contribution is recorded. When CCA implements a work item, the PR is linked. The contribution graph tells the story.

### 13.2 Squad Repo as the Reference Implementation

The `bradygaster/squad` repository becomes the reference implementation of its own proposal workflow. Everything designed in this document — proposal issues, agent comments, label-based lifecycle, Actions automation — runs on Squad's own repo first.

This means:
- Every new Squad feature starts as a GitHub Issue with the `proposal` label
- The proposal bot checks for required sections
- Squad agents post analysis as signed comments
- Brady approves via comment or label
- The consensus checker auto-transitions status
- Approved proposals get decomposed into work items
- CCA picks up implementation tasks
- Stale proposals get flagged automatically

Squad eats its own cooking. If the workflow is good enough for Squad, it's good enough for everyone. If it breaks on Squad's repo, we fix it before it ships to users.

### 13.3 The Slidemaker Pattern

Shayne Boyer (@spboyer) validated this model end-to-end with [spboyer/slidemaker](https://github.com/spboyer/slidemaker/issues). What happened there:

1. Shayne used Squad to decompose a PRD into 9 GitHub Issues
2. Issues were labeled with `squad:` convention (`squad:verbal`, `squad:mcmanus`, `squad:fenster`)
3. Issues used user story format with acceptance criteria
4. 8 of 9 issues were completed and closed
5. The entire process was visible on GitHub — anyone could see the plan, track progress, review the work

**That's the template.** Shayne didn't invent a new workflow. He used GitHub Issues the way they were designed to be used, with Squad agents as the team that executes. The pattern works because it's GitHub-native — no custom infrastructure, no special tools, just issues, labels, and PRs.

The key insight from slidemaker: **the issue IS the assignment.** Agent metadata in the issue body (Squad member name, role, file paths) eliminates external routing logic. Labels handle filtering. The issue body handles context. GitHub handles everything else.

### 13.4 How This Changes Squad's Development Culture

**Before (v0.2.0):** Brady has an idea → talks to Squad in terminal → agents produce markdown proposals → Brady reviews in editor → decisions happen in private → code ships

**After (v0.3.0):** Brady has an idea → says "I'd like a proposal for X" → GitHub Issue created → agents analyze publicly → anyone comments → Brady approves publicly → work items created → implementation tracked publicly → code ships

The change is transparency. Every step that was private becomes public. This has consequences:

1. **Quality pressure.** Agent analysis posted publicly needs to be good. No more "draft quality" proposals that only Brady sees. The bar rises because the audience widens.
2. **Accountability.** Every proposal has an author, every comment has a signer, every approval has a timestamp. The decision trail is complete and public.
3. **Community participation.** If someone finds Squad interesting, they can watch the repo and see exactly how it's being built — by an AI team, in public. That's a compelling story for the project.
4. **Shayne's contribution model scales.** Shayne opened issues, agents worked them. That's the model for any contributor: open an issue describing what you want, Squad decomposes and implements. The contributor doesn't need to write code — they need to write a clear issue.

### 13.5 Other Squads See the Same Pattern

The slidemaker reference proves this works beyond Squad itself. Any repo that uses Squad gets the same workflow:

- Issues as proposals
- Agent analysis as comments
- Label-based lifecycle
- Actions automation (if they enable the workflows)
- CCA integration (if they have Copilot)

The value proposition is: **"Install Squad, and your team gets a proposal workflow backed by AI agents, running on GitHub's native infrastructure, working in the open by default."** Not a proprietary platform. Not a SaaS dashboard. Just GitHub, used well, with AI agents as team members.

### 13.6 What Stays Private

Working in the open doesn't mean everything is public:

- **`.ai-team/` stays gitignored.** Agent histories, charters, decisions, skills — these are internal team state. They don't belong on GitHub. This is decided and permanent.
- **Terminal sessions stay ephemeral.** The real-time conversation between Brady and agents is not recorded on GitHub. Only the artifacts (proposals, comments, PRs) are public.
- **Draft decisions stay local.** The decisions inbox (`.ai-team/decisions/inbox/`) is a local staging area. Scribe merges decisions into `decisions.md` on the local filesystem. The public record is the proposal issue and its comments — not the internal decision log.

The boundary is clear: **collaborative artifacts are public (proposals, PRs, issues). Team state is private (history, decisions, skills, charters).** This matches the source-of-truth hierarchy established in Proposal 028: GitHub is authoritative for collaborative artifacts, filesystem is authoritative for team state.
