# Agent GitHub Identity via GitHub Apps

**Author:** Flight (Lead)  
**Date:** 2026-03-27  
**Revised:** 2026-03-29  
**Status:** ✅ Implemented  
**Implementation Date:** 2025-07-29

---

## Quick Start

Get identity working in 3 steps:

```bash
# 1. Create GitHub App + PEM key for your lead role
npx @bradygaster/squad-cli identity create --role lead

# 2. Install the app on your repo when browser opens
# (CLI displays a link automatically)

# 3. Verify everything is configured
npx @bradygaster/squad-cli identity status
```

**Result:** Agents now commit/push/PR as the bot identity automatically. No additional config needed.

---

## Implementation Status

Squad's identity system is **production-ready** with the following shipped:

| Feature | Status | Notes |
|---------|--------|-------|
| **Per-role apps** (Tier 2, default) | ✅ Shipped | `{user}-squad-{role}` naming convention |
| **Shared app** (Tier 1) | ✅ Shipped | `squad identity create --simple` |
| **Per-agent apps** (Tier 3) | ⚠️ Design complete, not prioritized | Advanced filtering use case |
| **JWT token generation** | ✅ Shipped | RS256, 9-minute expiry (clock skew buffer) |
| **Installation token exchange** | ✅ Shipped | 1-hour validity, proactive refresh at 50min |
| **CLI commands** | ✅ Shipped | `status`, `create`, `update`, `rotate`, `export` |
| **Spawn integration** | ✅ Shipped | Identity context injected into agent prompts |
| **PR attribution** | ✅ Shipped | Link to GitHub App in PR body |
| **E2E testing** | ✅ Shipped | Smoke test at `scripts/test-identity-e2e.mjs` |

### Key Implementation Details

- **`create` is idempotent** — re-running on an existing role resolves missing installation IDs. No separate "fix" command needed.
- **`update`** replaces the proposed `fix` command — it re-detects and updates the installation ID without creating a new app.
- **JWT exp changed** from 10 minutes to 9 minutes (clock skew buffer for WSL).
- **Token resolution** uses `node:crypto` RSA-SHA256 — zero npm dependencies.
- **Graceful fallback** — if identity is not configured, agents use default git auth. Never blocks agent work.
- **PR bodies** include a link: `🤖 Created by [app-slug](https://github.com/apps/app-slug)`

---

## Problem Statement

Every Squad agent today acts through the repo owner's personal GitHub account. When Leela triages an issue, Fry ships a fix, or Bender reviews a PR — GitHub shows it as the owner talking to themselves. The only attribution is a bold-text prefix in the comment body: `**Triage (Leela):** ...`.

This creates three concrete problems:

1. **Audit opacity.** You can't filter GitHub notifications by which agent acted. Everything is "you commented on your own issue." At scale, this makes the notification stream useless.

2. **Trust erosion.** External contributors see one account having full conversations with itself. It looks like a person manually posting formatted messages, not a team of specialized agents making independent decisions.

3. **Identity coupling.** The owner's personal API token is the single credential for all agent operations. Rate limits are shared. Revocation is all-or-nothing. There's no way to scope permissions per agent role.

The current model was fine for prototyping. It doesn't scale past a handful of agents or a public-facing repo.

---

## Proposed Solution: Three-Tier Identity Model

Squad supports three identity models, each progressively richer. **Tier 2 (per-role apps) is the recommended default** — it strikes the best balance between visual identity and operational simplicity.

### Tier 1: Shared App (Simplest — One App for All)

Each Squad user registers a single [GitHub App](https://docs.github.com/en/apps/overview) named `{user}-squad` (e.g., `sabbour-squad`). All agent operations route through this one app. Agent attribution is carried in structured comment bodies and commit messages — not in the GitHub App identity itself.

When any agent comments, it appears as `sabbour-squad[bot]` — clearly a bot, clearly whose. The comment body identifies which agent authored it:

```markdown
🏗️ **Flight** (Lead)

Architecture review complete. The proposed auth module follows our established patterns. Approved.
```

**Pros:**
- One registration, one key, one install per repo
- Simplest bootstrap (one browser confirmation)
- Zero naming concerns — `{user}-squad` always fits the 34-char limit
- No cross-repo collisions

**Cons:**
- All agents look the same on GitHub — you have to read the comment body
- No per-role filtering or avatars
- Can't tell at a glance what KIND of agent posted

**Best for:** Users who want bot identity with absolute minimum setup.

### Tier 2: Per-Role Apps (Recommended — One App per Role)

Instead of one app for everything or one app per agent name, create **one app per role per user**. Roles are a small, stable set (~8) drawn from Squad's standard role taxonomy. They don't change across repos.

**Naming convention:** `{user}-squad-{role}` — e.g., `sabbour-squad-lead`, `sabbour-squad-backend`, `sabbour-squad-tester`.

When Flight (Lead on repo A) and Leela (Lead on repo B) both comment, they appear as `sabbour-squad-lead[bot]`. EECOM (Core Dev on repo A) and Bender (Backend on repo B) both post as `sabbour-squad-backend[bot]`. The agent name goes in the comment body:

```markdown
🏗️ **Flight** (Lead)

Architecture review complete. The proposed auth module follows our established patterns. Approved.
```

#### Standard Role Slugs (Bounded Set)

| Role slug | Maps to | Emoji |
|-----------|---------|-------|
| `lead` | Lead, Architect, Tech Lead | 🏗️ |
| `frontend` | Frontend, UI, Design | ⚛️ |
| `backend` | Backend, API, Server, Core Dev | 🔧 |
| `tester` | Tester, QA, Quality | 🧪 |
| `devops` | DevOps, Infra, Platform, CI/CD | ⚙️ |
| `docs` | DevRel, Writer, Documentation | 📝 |
| `security` | Security, Auth, Compliance | 🔒 |
| `data` | Data, Database, Analytics | 📊 |

That's 8 roles max = 8 app registrations per user, regardless of how many agents or repos you have. Internal-only agents (like Scribe and Ralph) don't get apps — they never post to GitHub as themselves.

#### How Squad Maps Agents to Roles

At comment time, Squad reads the team roster from `team.md` and maps each agent to its role slug. The role slug determines which app identity to use:

1. Agent requests a GitHub operation (e.g., comment on an issue).
2. Squad looks up the agent's role in the team roster.
3. Squad maps the role to its canonical role slug (e.g., "Core Dev" → `backend`).
4. Squad authenticates as the corresponding role app (e.g., `sabbour-squad-backend`).
5. The comment body includes the agent's actual name: `🔧 **EECOM** (Core Dev)`.

This means you can always tell at a glance:
- **From the bot name:** What kind of work this is (backend, testing, security...).
- **From the comment body:** Which specific agent did it.

#### Per-Role Avatar Support

Each role app gets its own GitHub avatar. This means every role has a distinct visual identity in the GitHub UI — the lead has a different avatar from the tester, which is different from the backend developer. Avatar generation (e.g., role-specific icons) is a planned feature for `squad identity create`.

**Pros:**
- Bot name immediately shows what KIND of agent spoke
- Per-role avatars give strong visual differentiation
- Only ~8 apps total (stable, doesn't grow with agent count)
- No naming collisions — roles are universal
- 34-char limit is safe (`sabbour-squad-backend` = 22 chars)
- Same role apps work across all repos — zero per-repo setup
- Credential count is bounded (~8 keys)

**Cons:**
- 8 browser confirmations at bootstrap (one-time)
- 8 keys to manage (but bounded, not unbounded)
- Can't distinguish between two agents with the same role from GitHub UI alone

**Best for:** Most users. Gives meaningful visual identity without operational complexity.

### Tier 3: Per-Agent Apps (Advanced — One App per Agent)

For users who specifically want per-agent GitHub filtering or per-agent avatars, each agent gets its own app: `{agent}-{user}-squad` (e.g., `flight-sabbour-squad`).

**Pros:**
- Distinct `[bot]` identity per agent
- Per-agent avatar
- Per-agent GitHub notification filtering
- Per-agent git blame attribution

**Cons:**
- **34-character name limit.** `{agent}-{user}-squad` works for short names but breaks with longer ones. Repo-qualified fallback (`{agent}-{user}-{repo}-squad`) exceeds the limit almost immediately.
- **Cross-repo collisions.** When you clone someone else's repo, their "Flight" ≠ your "Flight" — but both map to `flight-sabbour-squad`. Requires collision detection and repo-qualified disambiguation.
- **Credential explosion.** N agents = N private keys to manage, rotate, and share.
- **Bootstrap friction.** Each app requires a separate browser confirmation. 15 agents = 15 confirmations.
- **Registration scaling.** 15 agents = 15 of your 100 app quota. With cloned repos, this grows further.
- **Naming logic complexity.** Two-tier naming, collision detection, short-hash fallbacks — all machinery that exists solely to work around per-agent naming constraints.

**Best for:** Users who need per-agent GitHub notification filtering and understand the trade-offs.

#### Naming Scheme (Per-Agent Mode)

Per-agent mode uses a two-tier naming scheme:

**Primary:** `{agent}-{user}-squad` (e.g., `flight-sabbour-squad`)

**Fallback:** `{agent}-{user}-{repo}-squad` (used when the primary name is already registered for a different project)

The CLI automatically detects collisions and falls back with a warning:

```
⚠️ `flight-sabbour-squad` already exists for a different project.
   Registering as `flight-sabbour-coolproject-squad` instead.
```

### Approach Comparison

| Approach | Identity | App count | Credential scope | Best for |
|----------|----------|-----------|-------------------|----------|
| **Tier 1: Shared app** | One `[bot]` for all agents | 1 | One credential set | Minimal setup |
| **Tier 2: Per-role apps** ✅ | Per-role `[bot]` | ~8 (stable) | ~8 credential sets | Most users |
| **Tier 3: Per-agent apps** | Distinct `[bot]` per agent | N (grows) | N credential sets | Advanced filtering |
| Machine users (rejected) | Distinct human-like | N (paid seats) | Isolated | N/A |
| Personal account (status quo) | Owner's account | 0 | Shared, owner-coupled | N/A |

### Trade-off Matrix

| Concern | Tier 1: Shared (1 app) | Tier 2: Per-role (~8 apps) | Tier 3: Per-agent (N apps) |
|---------|----------------------|--------------------------|--------------------------|
| Not talking to yourself | ✅ | ✅ | ✅ |
| Bot badge on GitHub | ✅ | ✅ | ✅ |
| Can tell WHAT kind of agent spoke | ❌ Read body | ✅ Bot name shows role | ✅ Bot name shows agent |
| Per-agent GitHub filtering | ❌ All from one bot | ⚠️ Per-role filtering | ✅ Per-agent filtering |
| Custom avatar | ❌ One avatar | ✅ Per-role avatar | ✅ Per-agent avatar |
| Per-agent git blame | ❌ One committer | ⚠️ Per-role committer | ✅ Per-agent committer |
| 34-char name limit | ✅ Trivial | ✅ Safe (22 chars typical) | ⚠️ Tight |
| Cross-repo reuse | ✅ Automatic | ✅ Same roles everywhere | ⚠️ Complex |
| Foreign repo cloning | ✅ No collisions | ✅ No collisions | ⚠️ Collisions |
| Scaling (100 app cap) | ✅ Always 1 | ✅ Always ~8 | ⚠️ Agent count dependent |
| Bootstrap UX | ✅ 1 click | ✅ ~8 clicks (one-time) | ⚠️ N clicks |
| Credential management | ✅ 1 key | ✅ ~8 keys (bounded) | ⚠️ N keys |
| Operational complexity | 🟢 Low | 🟢 Low-medium | 🔴 High |
| Name collision risk | None | None (roles are universal) | High (names differ per repo) |

The per-role model (Tier 2) hits the sweet spot: you get meaningful visual identity from bot names and avatars, without the unbounded complexity of per-agent apps. The ~8 role slugs are universal across every repo — no collision logic, no naming gymnastics.

---

## What Works Cleanly

These GitHub App capabilities map directly to Squad agent operations under all three tiers:

| Capability | How it works |
|------------|-------------|
| **Issue/PR comments** | App posts as `{user}-squad[bot]` (Tier 1) or `{user}-squad-{role}[bot]` (Tier 2) or `{agent}-{user}-squad[bot]` (Tier 3). Agent identity in structured comment body. |
| **Commits** | Author: `{app-name}[bot] <id+{app-name}[bot]@users.noreply.github.com>`. Agent name in commit message prefix. |
| **Branch operations** | Create, delete, push — all under the app's identity. |
| **Open/merge PRs** | App opens PRs as itself. Appears as a bot contributor. |
| **Labels** | Add/remove labels (preserves `squad:agent` routing pattern). |
| **Reactions** | Agents can react to comments (useful for acknowledgment patterns). |
| **Status checks** | Post commit statuses and check runs. |
| **Audit log** | Every action attributed to the app in org audit logs. Per-role (Tier 2) gives role-level audit granularity. |

---

## GitHub API Gaps (Non-Issues for Squad)

GitHub Apps have a few API limitations compared to user accounts. None of these are problems for Squad, because Squad's own routing model is the intended mechanism for assignment and review — not GitHub's native UI primitives.

### Issue Assignment — Squad Uses Labels

GitHub Apps cannot be assignees. Squad doesn't use GitHub assignment for routing work — it uses `squad:{agent}` labels. The label-based routing IS the assignment mechanism. The agent comments to signal it's working:

```markdown
🏗️ **Flight** (Lead)

Working on this.
```

Labels drive routing, comments provide context, and the `[bot]` identity makes the claim visually distinct from the repo owner.

### PR Review Requests — Squad Routes Reviews

Apps cannot be "requested as reviewers" through the GitHub UI. Squad routes reviews through its own coordinator. Apps *can* submit full PR reviews (approve, request changes, comment) via the API — they just can't appear in the "requested reviewers" sidebar widget.

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

The review appears with the app's `[bot]` identity and the agent name in the review body. The sidebar widget is cosmetic; the actual review and its enforcement (required approvals, etc.) work identically.

### CODEOWNERS — Not Needed

Apps can't be listed in CODEOWNERS files (requires users/teams). CODEOWNERS isn't part of Squad's workflow. If needed later, a GitHub Team proxy can trigger the relevant agent via webhook.

### Team Membership — Not Needed

Apps can't join GitHub Teams. Squad uses labels and its own routing, not GitHub Teams.

---

## Comment Attribution Format

Regardless of tier, the comment body always carries the agent's name and role. The bot account name varies by tier:

| Tier | Bot name | Comment body |
|------|----------|-------------|
| Tier 1 | `sabbour-squad[bot]` | `🏗️ **Flight** (Lead)` |
| Tier 2 | `sabbour-squad-lead[bot]` | `🏗️ **Flight** (Lead)` |
| Tier 3 | `flight-sabbour-squad[bot]` | `🏗️ **Flight** (Lead)` |

### Standard Format

```markdown
🏗️ **Flight** (Lead)

Architecture review complete. The proposed auth module follows our established patterns. Approved.
```

The emoji + bold agent name + role in parentheses gives immediate visual identification. The actual content follows after a blank line. The emoji matches the role slug table — this is consistent across all tiers.

### Commit Message Format

Commits use the app as the Git author, with the agent name as a commit message prefix:

```
[Flight] refactor: extract auth module
```

Git author varies by tier:
- **Tier 1:** `sabbour-squad[bot] <12345+sabbour-squad[bot]@users.noreply.github.com>`
- **Tier 2:** `sabbour-squad-lead[bot] <12345+sabbour-squad-lead[bot]@users.noreply.github.com>`
- **Tier 3:** `flight-sabbour-squad[bot] <12345+flight-sabbour-squad[bot]@users.noreply.github.com>`

This preserves machine-parseable agent attribution in git history. Tier 2 gives role-level grouping in git blame — all lead operations cluster under one committer, all backend operations under another.

### Why This Works

People read comment bodies, not commenter hover cards. The agent name at the top of every comment is more visible than a GitHub username — it's bold, emoji-prefixed, and includes the role. For git blame, `[AgentName]` prefixes are greppable and filter-friendly. Tier 2 adds the bonus that the committer name itself is meaningful — you can filter git blame by role.

---

## Bootstrap Flow

### App Creation via Manifest Flow

GitHub Apps cannot be created fully headlessly. The [manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest) is semi-automated:

1. Squad CLI generates a JSON manifest with the app name, required permissions, and events.
2. CLI opens the user's browser to `https://github.com/settings/apps/new?manifest=<encoded>`.
3. User confirms the app name on GitHub (one click per app).
4. GitHub redirects back with a temporary code.
5. CLI exchanges the code for credentials (app ID, private key, webhook secret).
6. Credentials are stored locally (see Credential Management below).

### CLI Interface (Implemented)

The actual CLI commands shipped with Squad:

```bash
# Create GitHub Apps (Tier 2: per-role, default)
squad identity create                      # Creates apps for all roles in roster
squad identity create --role lead          # Creates app for a single role (idempotent)
squad identity create --all                # Explicit: all roles in roster

# Tier 1: Shared app (all agents use one app)
squad identity create --simple

# Check current identity configuration
squad identity status

# Update an existing app (re-detect missing installation ID)
# Replaces the proposed 'fix' command — make 'create' idempotent
squad identity update --role lead

# Rotate/regenerate private key for an app
squad identity rotate --role lead
squad identity rotate --role lead --import path/to/new-key.pem

# Export credentials for CI/CD (as GitHub Actions secrets)
squad identity export --role lead
squad identity export --all
```

**Key differences from proposal:**
- `fix` command was removed — `create` is now fully idempotent
- `update` handles re-detection of missing installation IDs (called automatically if `create` finds an app with `installationId: 0`)
- Tier 3 (per-agent) is still available in design but not prioritized

#### Tier 2 Bootstrap Flow (Default)

`squad identity create` with no flags creates per-role apps. The CLI:

1. Reads the team roster from `team.md`.
2. Identifies all unique role slugs used by agents in the roster.
3. Creates apps in sequence: `{user}-squad-lead`, `{user}-squad-backend`, etc.
4. Each app requires one browser confirmation.
5. All credentials are stored under `.squad/identity/`.

```
$ squad identity create
  Creating per-role identity apps...
  
  🏗️ sabbour-squad-lead      ✅ Created
  🔧 sabbour-squad-backend   ✅ Created
  🧪 sabbour-squad-tester    ✅ Created
  ⚙️ sabbour-squad-devops    ✅ Created
  📝 sabbour-squad-docs      ✅ Created
  
  5 role apps created. Installed on bradygaster/squad.
  Agents will post as sabbour-squad-{role}[bot].
```

Only the roles actually used by agents in the current roster are created. If you later add an agent with a new role, `squad identity create` detects missing role apps and creates only the new ones.

### Naming Conventions

| Tier | Pattern | Example | Length |
|------|---------|---------|--------|
| Tier 1 | `{user}-squad` | `sabbour-squad` | 14 |
| Tier 2 | `{user}-squad-{role}` | `sabbour-squad-backend` | 22 |
| Tier 3 | `{agent}-{user}-squad` | `flight-sabbour-squad` | 21 |

#### GitHub App Name Constraints

GitHub App names have the following restrictions (verified empirically):

- **Maximum length:** 34 characters
- **Must be globally unique** across all of GitHub
- **Allowed characters:** alphanumeric, hyphens, spaces (rendered as hyphens in slugs)
- **Reserved prefixes:** `github`, `octocat` (and others) cannot be used

With the `{user}-squad` pattern (Tier 1), the name is always `len(username) + 6` characters. For Tier 2, the longest role slug is `security` (8 chars), giving `len(username) + 15`. Any username ≤ 19 chars (the vast majority) stays under 34. The CLI validates at creation time and warns if a username is too long.

The 34-char limit only becomes a real concern with Tier 3 per-agent naming where `{agent}-{user}-{repo}-squad` compounds three variable-length segments.

### Required Permissions

Minimal permission set for Squad operations (same for all tiers):

```json
{
  "permissions": {
    "issues": "write",
    "pull_requests": "write",
    "contents": "write",
    "metadata": "read",
    "statuses": "write"
  }
}
```

One permission set covers all agents. No need to scope per-agent — Squad's own routing handles which agent does what.

---

## Credential Management

### Tier 1: Shared App Storage

```
.squad/
  identity/
    apps/
      squad.json        # { appId, installationId, appSlug }
    keys/               # ⚠️ GITIGNORED
      squad.pem         # Private key
```

One JSON file. One PEM file.

### Tier 2: Per-Role App Storage (Recommended)

```
.squad/
  identity/
    apps/
      lead.json         # { appId, installationId, appSlug }
      backend.json
      tester.json
      devops.json
      docs.json
    keys/               # ⚠️ GITIGNORED
      lead.pem
      backend.pem
      tester.pem
      devops.pem
      docs.pem
```

One JSON + one PEM per role. The number of files is bounded by the role count (~8 max), regardless of how many agents or repos you have.

### Tier 3: Per-Agent App Storage

```
.squad/
  identity/
    apps/
      flight.json       # { appId, installationId, appSlug }
      leela.json
      fry.json
      ...
    keys/               # ⚠️ GITIGNORED
      flight.pem
      leela.pem
      fry.pem
      ...
```

One JSON + one PEM per agent. File count grows with agent count.

### Common Storage Rules

- **`apps/*.json`** — Committed. Contains non-secret metadata (app ID, installation ID, slug). Other team members need this to know the apps exist.
- **`keys/*.pem`** — Gitignored. Private keys never enter version control. Period.
- **`.gitignore`** entry: `.squad/identity/keys/`

### Token Lifecycle (Implemented)

GitHub App authentication is a two-step process:

1. **JWT generation:** Sign a JWT using the app's private key. Valid for **9 minutes** (GitHub max is 10 min; we use 9 to leave a clock-skew buffer, especially for WSL).
2. **Installation token exchange:** Exchange the JWT for an installation access token. Valid for 1 hour.

Squad caches installation tokens and refreshes them proactively (at 50 minutes, not at expiry). Token refresh is transparent — agents never deal with auth directly. For Tier 2, Squad caches one token per role app and selects the right one based on the agent's role at operation time.

### Environment Variable Override

For CI/CD or environments where PEM files aren't practical:

**Tier 1:**
```bash
SQUAD_APP_ID=12345
SQUAD_PRIVATE_KEY=base64-encoded-pem
SQUAD_INSTALLATION_ID=67890
```

**Tier 2:**
```bash
SQUAD_LEAD_APP_ID=12345
SQUAD_LEAD_PRIVATE_KEY=base64-encoded-pem
SQUAD_LEAD_INSTALLATION_ID=67890
SQUAD_BACKEND_APP_ID=12346
SQUAD_BACKEND_PRIVATE_KEY=base64-encoded-pem
SQUAD_BACKEND_INSTALLATION_ID=67891
# ... one set per role
```

**Tier 3:**
```bash
SQUAD_FLIGHT_APP_ID=12345
SQUAD_FLIGHT_PRIVATE_KEY=base64-encoded-pem
SQUAD_FLIGHT_INSTALLATION_ID=67890
# ... one set per agent
```

For Tier 2 in CI/CD, the ~8 variable sets are manageable as repository secrets. This is bounded and predictable — unlike Tier 3 where variable count grows with agent count.

---

## API Architecture

### Identity-Aware GitHub Client

The core change is a GitHub API client that routes agent operations through the appropriate app identity based on the configured tier:

```typescript
interface SquadIdentity {
  appId: number;
  installationId: number;
  privateKey: string;
}

type IdentityTier = 'shared' | 'per-role' | 'per-agent';

class SquadGitHubClient {
  private tier: IdentityTier;
  
  // Get an authenticated Octokit instance for a specific agent operation
  async getClient(agentName: string, agentRole: string): Promise<Octokit> {
    const identity = await this.resolveIdentity(agentName, agentRole);
    const token = await this.getInstallationToken(identity);
    return new Octokit({ auth: token });
  }

  // Resolve which app identity to use based on tier
  private async resolveIdentity(
    agentName: string, agentRole: string
  ): Promise<SquadIdentity> {
    switch (this.tier) {
      case 'shared':    return this.loadIdentity('squad');
      case 'per-role':  return this.loadIdentity(this.roleSlug(agentRole));
      case 'per-agent': return this.loadIdentity(agentName.toLowerCase());
    }
  }

  // Map a role name to its canonical slug
  private roleSlug(role: string): string {
    const mapping: Record<string, string> = {
      'Lead': 'lead', 'Architect': 'lead', 'Tech Lead': 'lead',
      'Frontend': 'frontend', 'UI': 'frontend', 'Design': 'frontend',
      'Backend': 'backend', 'API': 'backend', 'Core Dev': 'backend',
      'Tester': 'tester', 'QA': 'tester', 'Quality': 'tester',
      'DevOps': 'devops', 'Infra': 'devops', 'Platform': 'devops',
      'DevRel': 'docs', 'Writer': 'docs', 'Documentation': 'docs',
      'Security': 'security', 'Auth': 'security', 'Compliance': 'security',
      'Data': 'data', 'Database': 'data', 'Analytics': 'data',
    };
    return mapping[role] ?? 'lead';
  }

  // Post a comment with agent attribution in the body
  async commentAs(
    agentName: string, agentRole: string, opts: CommentOpts
  ): Promise<void> {
    const octokit = await this.getClient(agentName, agentRole);
    const body = this.formatAgentComment(agentName, agentRole, opts.body);
    await octokit.issues.createComment({
      owner: opts.owner,
      repo: opts.repo,
      issue_number: opts.issueNumber,
      body
    });
  }

  private formatAgentComment(
    name: string, role: string, content: string
  ): string {
    const emoji = this.roleEmoji(role);
    return `${emoji} **${name}** (${role})\n\n${content}`;
  }
}

// Usage in agent code — same API regardless of tier
const gh = squad.github();
await gh.commentAs('Flight', 'Lead', {
  owner, repo, issueNumber,
  body: 'Architecture review complete. Approved.'
});
// Tier 1: Comment appears as sabbour-squad[bot]
// Tier 2: Comment appears as sabbour-squad-lead[bot]
// Tier 3: Comment appears as flight-sabbour-squad[bot]
```

The `commentAs()` method abstracts both agent attribution and tier-specific identity resolution. Agent code provides the content; the client handles everything else. Switching tiers requires zero agent code changes.

### Fallback Behavior

If the shared app identity isn't configured, fall back to the user's `gh` CLI auth (today's behavior). This ensures:

- Existing Squad setups keep working without any identity configuration.
- Identity adoption is opt-in and incremental.
- The `squad identity status` command shows whether the shared identity is active or using fallback.

### `gh` CLI vs. Octokit

Today Squad uses the `gh` CLI for GitHub operations. The identity system would introduce Octokit (via `@octokit/app`) for identity-aware API calls. The `gh` CLI doesn't support GitHub App authentication natively.

**Migration path:** Wrap `gh` CLI calls in an abstraction layer first. Then, for operations where identity matters (comments, reviews, commits), route through the Octokit client. Keep `gh` CLI for user-facing operations (like `squad identity create` which uses `gh`'s browser auth flow).

---

## Developer Onboarding

The per-role app model (Tier 2) keeps onboarding simple while providing meaningful identity.

### Fork → Install → Work → PR

The natural GitHub workflow is:

1. **Fork** the repo you want to work on (if you don't own it).
2. **Install your role apps** on your fork: `squad identity install yourname/forked-repo`
3. **Work on your fork** — commit, push, run Squad, open PRs upstream.

The key insight: you install identity apps on **repos you own or control**, not on someone else's upstream. This is the same principle as personal GitHub Actions secrets or repo deploy keys — they live on your fork. When you open a PR upstream, your agents' contributions carry the role app identity, and the maintainers see actions clearly attributed to specialized roles.

For contributors without their own repos:

- **On a shared/team repo:** Identity apps are installed once by an admin or team lead. All members' agents use the same shared identity (all posts appear as `team-squad-lead`, `team-squad-backend`, etc.). Agent attribution comes from the comment body.
- **Locally (no install):** Agents fall back to `gh` CLI auth using your personal token. You get full functionality; bot identity just appears as your personal account.

### Clone → Run → Done

1. Clone any repo with Squad configured.
2. Squad works immediately — falls back to `gh` CLI auth.
3. No keys, no identity files, no setup required.

### Want Bot Identity? One Command.

```bash
$ squad identity create
  Creating per-role identity apps...
  
  🏗️ sabbour-squad-lead      ✅ Created
  🔧 sabbour-squad-backend   ✅ Created
  🧪 sabbour-squad-tester    ✅ Created
  
  3 role apps created. Installed on bradygaster/squad.
  Agents will post as sabbour-squad-{role}[bot].
```

~8 browser confirmations, but it's a one-time setup. After that, new agents automatically use the existing role apps — no additional registration needed.

### Installing on Additional Repos

All your role apps can be installed on any repo in one command:

```bash
$ squad identity install someone-else/cool-project
  ✅ sabbour-squad-lead installed on someone-else/cool-project
  ✅ sabbour-squad-backend installed on someone-else/cool-project
  ✅ sabbour-squad-tester installed on someone-else/cool-project
```

No naming collisions. No repo-qualified fallbacks. Your role apps are the same everywhere — `sabbour-squad-lead` in repo A is the same app as `sabbour-squad-lead` in repo B.

### Behavior Without Identity

Without a configured identity, agents **fall back to `gh` CLI auth** — today's behavior. Everything works. The developer can run Squad normally; agents just won't have the `[bot]` badge on GitHub.

The `squad identity status` command makes this visible:

```
$ squad identity status
  Tier:      Per-role (Tier 2)
  
  🏗️ sabbour-squad-lead      ✅ Active
  🔧 sabbour-squad-backend   ✅ Active
  🧪 sabbour-squad-tester    ✅ Active
  ⚙️ sabbour-squad-devops    ⚠️ Not created (no agents use this role)
  📝 sabbour-squad-docs      ⚠️ Not created (no agents use this role)
  
  Installed: bradygaster/squad, someone-else/cool-project
```

Or, without identity:

```
$ squad identity status
  Identity:  Not configured
  Status:    ⚠️ Using gh CLI fallback (all actions appear as your personal account)
  Run:       squad identity create
```

### Getting the Identity on a New Machine

Two paths:

1. **Transfer the keys.** Copy the PEM files from a secure vault (1Password, Azure Key Vault, etc.) to `.squad/identity/keys/`. The `apps/*.json` files are already committed — only the keys need sharing.

2. **CI-only model.** Only CI/CD has the keys (stored as repo secrets). Developers use `gh` CLI fallback locally. Bot identity only appears on CI-generated comments and commits. For Tier 2, this means ~8 secret variables per repo — manageable and bounded.

---

## Copilot CLI Integration (Implemented)

### How It Works — The Big Picture

Squad's coordinator (`squad.agent.md`) automatically detects identity configuration at spawn time. When `.squad/identity/config.json` exists, identity blocks are injected into the agent's spawn prompt — agents don't need to know about identity, it's entirely environment-level. The system is gracefully degraded: if anything fails (missing config, key read error, GitHub API timeout), agents silently fall back to default git auth. No spawn is ever blocked.

After PR merge and release, Squad-powered repos get identity support via two one-time commands: `squad upgrade` (deploys the identity-aware coordinator prompt) and `squad identity create` (browser-based app setup). The `create` command auto-detects roles from `team.md`, creates GitHub Apps with the right names and permissions, and saves app registrations and keys to `.squad/identity/`.

### Pre-Spawn: Identity Resolution

Before spawning an agent, the coordinator:

1. **Checks identity config:** Does `.squad/identity/config.json` exist?
   - **No** → omit identity block entirely, use default git auth
   - **Yes** → include full identity block

2. **Resolves role slug:** Map agent's role to identity slug via `resolveRoleSlug()`:
   - Lead/Architect → `lead`
   - Backend/Core Dev → `backend` (falls back to `lead` if no backend app)
   - Frontend → `frontend` (falls back to `lead`)
   - Tester → `tester` (falls back to `lead`)
   - For Shared tier: all agents use single shared app

3. **Gets app slug:** From `.squad/identity/config.json`, fetch `appSlug` for the resolved role

4. **Gets repo owner/name:** Parse from git remote origin URL

5. **Includes identity block** in spawn prompt with resolved values

### Token Resolution at Runtime

The GIT IDENTITY block instructs agents to resolve a token at git operation time. The script `.squad/scripts/resolve-token.mjs` is shipped by `squad init`/`squad upgrade` and uses only Node.js built-in modules — no npm dependency required:

```bash
TOKEN=$(node {team_root}/.squad/scripts/resolve-token.mjs '{role_slug}')
```

Note: **No `process.exit(1)` on failure**. If token resolution fails, `TOKEN` is left empty. Git and gh commands then use a conditional:

```bash
if [ -n "$TOKEN" ]; then 
  git push https://x-access-token:${TOKEN}@github.com/{owner}/{repo}.git {branch}
else 
  git push
fi
```

The token resolution process:
- Loads the app registration for the role slug from `.squad/identity/config.json`
- Reads the PEM key from `.squad/identity/keys/{role_slug}.pem`
- Generates a fresh JWT (RS256 signed, 9-minute expiry)
- Exchanges it for an installation token via GitHub API
- Caches the token; refreshes proactively at 50 minutes

**Zero npm dependencies** — uses only `node:crypto` and `globalThis.fetch`.

### Graceful Fallback

If identity resolution fails at any point:
- Missing identity config
- Missing PEM key
- PEM read error
- GitHub API error
- Any other exception

The `TOKEN` variable is left empty, and the agent's conditional push/PR commands automatically fall back to default git auth (or fail gracefully). No spawn is ever blocked because of identity. This preserves reliability.

### Multi-Repo Usage

GitHub App names are globally unique. A single app can be installed on multiple repos, eliminating the need to create separate apps for each project.

**First repo:** Run `squad identity create` to trigger the browser-based GitHub Apps manifest flow. The CLI guides you through app creation and installation.

**Additional repos in the same GitHub organization:** Run `squad identity create --import /path/to/first-repo` to import the PEM keys and app registrations from the first repo. This avoids recreating apps and ensures consistency across all projects.

**Interactive menu prevents dead-ends:** Before creating an app, the CLI prompts you to choose: (1) Create new apps, or (2) Import from another Squad repo. This prevents the "name already taken" error that would occur if you tried to create a duplicate app name through the browser manifest.

**All create flags work with `--import`:**
- `squad identity create --import /path --role lead` — import and create app for lead role only
- `squad identity create --import /path --all` — import and create all team roles
- `squad identity create --import /path` (no flags) — auto-detect from team.md and import

### CLI Commands

| Command | What it does |
|---------|-------------|
| `squad identity status` | Show configured apps and installation status |
| `squad identity create` | Auto-detect roles from team.md, create apps |
| `squad identity create --role lead` | Create app for a single role |
| `squad identity create --import /path` | Import identity from another Squad repo |
| `squad identity update --role lead` | Re-detect installation ID |
| `squad identity rotate --role lead` | Rotate PEM key |
| `squad identity export` | Export secrets for CI/CD |

### Example: End-to-End Flow

First repo setup:
```bash
cd /path/to/first-squad-repo
squad identity create                    # Browser flow: create apps, install on repo
squad identity status                    # Verify: show app registrations
```

Then, deploy the identity-aware coordinator:
```bash
squad upgrade                            # Deploy latest squad.agent.md with identity block
```

Now, when an agent pushes, it uses the identity-resolved token:
```bash
# Inside spawned agent (GIT IDENTITY block provided by coordinator)
TOKEN=$(node {team_root}/.squad/scripts/resolve-token.mjs 'lead')

git -c user.name="sabbour-squad-lead[bot]" \
    -c user.email="sabbour-squad-lead[bot]@users.noreply.github.com" \
    commit -m "[Flight] refactor: extract module"

if [ -n "$TOKEN" ]; then
  git push https://x-access-token:${TOKEN}@github.com/bradygaster/squad.git feature-branch
else
  git push
fi

# PR creation with bot attribution
if [ -n "$TOKEN" ]; then
  GH_TOKEN=$TOKEN gh pr create --title "..." --body "...\n\n🤖 Created by [sabbour-squad-lead](https://github.com/apps/sabbour-squad-lead)"
else
  gh pr create --title "..." --body "..."
fi
```

To add identity to a second repo in the same organization:
```bash
cd /path/to/second-squad-repo
squad identity create --import /path/to/first-squad-repo  # Import apps, no browser flow needed
squad upgrade                                              # Deploy coordinator with identity block
```

The agent sees no special identity logic — just standard git + gh CLI commands with environment-level graceful fallback. Squad's coordinator handles all authentication complexity.

---

## Testing

The identity system's end-to-end flow is validated by `scripts/test-identity-e2e.mjs`, a standalone smoke test that exercises:

- **App registration loading** from `.squad/identity/config.json`
- **PEM key reading** from `.squad/identity/keys/{role}.pem`
- **JWT generation** (RS256 signature, 9-minute expiry)
- **Installation token exchange** against GitHub's API
- **Token caching and refresh** (cache hit, proactive refresh at 50 min)
- **Role slug resolution** fallback logic
- **Update flow** (re-detecting missing installation IDs)

**To run locally** (requires configured identity):

```bash
node scripts/test-identity-e2e.mjs
```

The test is **read-only** except for one update round-trip, which restores the original installation ID afterward. Safe to run repeatedly.

**CLI commands are tested** via the `identity.ts` command layer — manual testing during development confirms the manifest flow, browser redirect, and file storage work end-to-end.

---

## Scaling & Limits

### Why Scaling Varies by Tier

| Scenario | Tier 1 (Shared) | Tier 2 (Per-Role) | Tier 3 (Per-Agent) |
|----------|----------------|-------------------|-------------------|
| 1 user, 5 agents, 1 repo | 1 reg | ~5 reg | 5 reg |
| 1 user, 50 agents, 100 repos | 1 reg | ~8 reg (capped) | 50 reg |
| 1 user, 200 agents, 500 repos | 1 reg | ~8 reg (capped) | ⚠️ Over 100-app limit |
| 10 users, any agents, any repos | 1 per user | ~8 per user | N per user |

Tier 2's key property: the registration count is **bounded by the number of roles, not the number of agents or repos**. Since the role set is fixed at ~8, you can never hit the 100-app limit from role apps alone — leaving plenty of headroom for other GitHub Apps.

### GitHub App Limits Reference

For context, GitHub imposes these limits on App registrations:

- **100 App registrations per user account** — hard cap, no exceptions
- **No limit on installations** — a registered app can be installed on unlimited repos
- **34-character App name limit** — must be globally unique

With the per-role model (Tier 2), only the 34-char name limit is even theoretically relevant, and `{user}-squad-{role}` stays well under it for typical usernames.

| Tier | Registrations used | Headroom (of 100) | 34-char risk |
|------|-------------------|-------------------|-------------|
| Tier 1 | 1 | 99 | None |
| Tier 2 | ~8 | ~92 | None (22 chars typical) |
| Tier 3 | N (grows) | Depends | Moderate |

---

---

## Phased Rollout

### Phase 1: Foundation (MVP)

**Goal:** All agents comment and commit under bot identity using the per-role model (Tier 2).

- [ ] Role slug mapping (role name → canonical slug)
- [ ] `squad identity create` CLI command — creates per-role apps via manifest flow
- [ ] `squad identity create --simple` for Tier 1 (shared app)
- [ ] Credential storage (`.squad/identity/apps/{role}.json`, `.squad/identity/keys/{role}.pem`)
- [ ] `SquadGitHubClient` with tier-aware `commentAs()` and `resolveIdentity()`
- [ ] Comment attribution formatting (emoji + agent name + role)
- [ ] Commit message prefixing (`[AgentName] conventional commit message`)
- [ ] Commit authoring as `{user}-squad-{role}[bot]` (Tier 2)
- [ ] `squad identity status` command (shows all role apps)
- [ ] Fallback to `gh` CLI when identity not configured
- [ ] `squad identity install <owner/repo>` for multi-repo (installs all role apps)

**Ships:** Next minor release. Estimated effort: 2-3 sprints.

### Phase 2: Full Operations

**Goal:** All GitHub operations route through the shared identity.

- [ ] PR creation/merge under role identity
- [ ] Label management under role identity
- [ ] Branch operations under role identity
- [ ] `squad identity rotate` key rotation (per-role)
- [ ] PR review submission with agent attribution in review body

**Ships:** Following minor release.

### Phase 3: CI/CD & Team Onboarding

**Goal:** Identity works in CI and across development teams.

- [ ] Environment variable credential override (per-role: `SQUAD_{ROLE}_APP_ID`, etc.)
- [ ] GitHub Actions integration (one set of secrets per role per repo)
- [ ] `squad identity export` for CI secret setup
- [ ] Documentation for onboarding paths (key sharing, CI-only)
- [ ] Rate limit monitoring (per-role granularity)

**Ships:** After Phase 2 stabilizes.

### Phase 4: Advanced Identity

**Goal:** Per-agent apps (Tier 3) for users who need them, plus rich identity features.

- [ ] `squad identity create --per-agent` command
- [ ] Per-agent credential storage and management
- [ ] Two-tier naming with collision detection
- [ ] Custom per-role avatar generation (planned for Tier 2)
- [ ] Custom per-agent avatar configuration (Tier 3)
- [ ] Sub-identity migration path (if GitHub ships the feature)
- [ ] Identity analytics (which agent/role is most active, rate limit usage)

**Ships:** When there's user demand.

---

## Open Questions

1. **Per-role avatar strategy.** Each role app gets its own avatar. Should Squad auto-generate role-specific icons (e.g., a wrench for backend, a flask for tester), or let users upload their own? Auto-generation reduces bootstrap friction; custom avatars let teams express personality.

2. **Webhook events.** GitHub Apps can receive webhooks. Should role apps listen for events (new issues, PR comments) to enable proactive agent behavior? This is a significant architecture expansion — out of scope for MVP but worth designing the extension point.

3. **Existing `gh-auth-isolation` skill.** Squad already has a skill for managing multiple GitHub identities via `gh auth`. The App-based approach serves a different purpose — `gh-auth-isolation` handles human multi-account; `squad identity` handles bot identity for agents. Both coexist.

4. ~~**Sub-identity timeline.**~~ **Resolved.** All three tiers benefit if GitHub later ships sub-identity support. For Tier 2, sub-identities could give per-agent display names within each role app. This is a natural upgrade, not a migration.

5. ~~**Repo-owner model as canonical recommendation?**~~ **Resolved.** With the per-role model, there is no per-agent naming collision problem. Roles are universal — `sabbour-squad-lead` works identically in every repo.

6. ~~**34-char name limit concerns?**~~ **Resolved.** Per-role names (`{user}-squad-{role}`) are consistently short. The 34-char limit only affects Tier 3 (per-agent), where it's documented as a known trade-off.

7. **Unmapped roles.** If a team defines a custom role not in the standard slug table, should it fall back to `lead`, prompt the user to map it, or create a new role app? Current design falls back to `lead` — this should be configurable.

---

## Alternative Approaches Considered

### Machine Users (Rejected)

One GitHub account per agent. Full identity, full native GitHub API compatibility (assignment, review requests).

**Why not:** Each account consumes a paid seat. For a team of 10+ agents, that's $40+/month on GitHub Team or $210+/month on Enterprise. GitHub's own docs recommend Apps over machine users. And Squad doesn't need native assignment or review requests — its own label-based routing handles both.

### One App Per Agent Per Repo (Rejected)

Register a separate app for each agent × repo combination.

**Why not:** This model burns registrations on repos instead of using installations. With 15 agents and 7 repos, that's 105 registrations — already over the 100-app limit. The worst approach from a scaling perspective.

### Hybrid: Apps for Identity + User Account for Assignment (Not Needed)

Originally considered using the owner's account (via `gh` CLI) for assignment and review requests while Apps handle identity-visible operations.

**Updated assessment:** Squad's label-based routing already handles assignment and review dispatch. There's no need to mix in the owner's account for these operations.

---

## Decision

**Build the three-tier identity model with per-role apps (Tier 2) as the recommended default.** Tier 1 (shared) available for users who want minimal setup. Tier 3 (per-agent) available as advanced mode for users who need per-agent GitHub filtering.

The per-role model (`{user}-squad-{role}`) is the sweet spot:
- **8 roles** cover every agent across every repo — bounded, not unbounded.
- **Bot names show role** — you can see at a glance that a lead, a tester, or a backend developer posted.
- **Per-role avatars** give visual differentiation without per-agent complexity.
- **No naming collisions** — roles are universal, unlike agent names which differ per repo.
- **~8 credentials** to manage — more than 1, but bounded and predictable.

The abstraction layer (`SquadGitHubClient.commentAs()`) insulates agent code from the identity tier. Agent code provides content; the client resolves the right app identity based on the configured tier. Switching between tiers requires zero agent code changes.

Squad's label-based routing handles assignment and review dispatch. The identity layer provides GitHub-visible identity for comments, commits, and PRs. The roles map directly from `team.md` — the routing table Squad already maintains.

**Stop looking like you're talking to yourself on GitHub — and now people can see WHAT KIND of specialist is talking.**

---

*Flight out.*

---

## Testing Instructions (Dev Branch — Pre-Merge)

These instructions are for testing the identity feature from the source repo before it's published to npm.

### Prerequisites

- The Squad repo cloned locally with the `squad/agent-github-identity` branch checked out
- `npm run build` completed successfully in the Squad repo
- `gh` CLI installed and authenticated (`gh auth login`)

### A. Unit & E2E Tests (in the Squad repo)

```bash
cd /path/to/squad
git checkout squad/agent-github-identity
npm run build

# Run the E2E identity test suite (20 tests)
node scripts/test-identity-e2e.mjs
```

This covers: CLI commands (status, update, create), token resolution, `execWithRoleToken`, formatting, role slugs, error cases, and a full git workflow (branch → commit as bot → push → draft PR → cleanup).

### B. Testing on a Different Repo (Pre-Initialized with Squad)

This assumes you have another repo that already has Squad set up (`.squad/team.md` exists with agents).

**Step 1 — Build the Squad repo (one-time):**

```bash
cd /path/to/squad
git checkout squad/agent-github-identity
npm run build
```

**Step 2 — Link into your other repo and upgrade:**

```bash
cd /path/to/other-repo
npm link /path/to/squad/packages/squad-cli /path/to/squad/packages/squad-sdk
squad upgrade
```

The `npm link <path>` syntax registers and links in one step — no need to `cd` into each package. `squad upgrade` deploys the latest `squad.agent.md` (with identity spawn template).

**Step 3 — Create identity (team-aware):**

```bash
squad identity create
```

This reads your `team.md`, detects roles, and creates GitHub Apps for each. A browser window opens per app — install it on this repo and wait for polling.

The `squad identity create` command now shows an interactive menu per role:

```
  App name: sabbour-squad-lead
  (1) Create new app (opens browser)
  (2) Already exists — import from another repo
  (3) Already exists — just install on this repo (opens browser)
  Or type a custom app name
```

If you already created the app in another repo, choose option 2 and provide the path to that repo. The CLI copies the PEM key and app registration, then prompts you to install the app on the current repo.

You can also use `--import` directly:

```bash
squad identity create --import /path/to/source-repo
```

Or create a single role: `squad identity create --role lead`

**Step 4 — Verify:**

```bash
squad identity status
```

**Step 5 — Test with Copilot CLI:**

Open a Copilot CLI session in your other repo and ask an agent to make a change that requires a push and PR. The coordinator automatically injects the GIT IDENTITY block. The agent will:

1. Commit as `your-app-slug[bot]`
2. Push using the GitHub App installation token
3. Open a PR authenticated as the bot
4. Include the app attribution link in the PR body

### C. What to Verify on GitHub

After an agent creates a PR using identity:

- [ ] PR author shows as the GitHub App (bot avatar, not your personal avatar)
- [ ] Commit author shows `your-app-slug[bot]` in the commit history
- [ ] PR body contains the app attribution link
- [ ] The app's installation page shows the correct repo access

### D. Cleanup

```bash
cd /path/to/other-repo
npm unlink @bradygaster/squad-cli @bradygaster/squad-sdk
gh pr list --state open   # close any test PRs
```

### E. Multi-Repo Usage

GitHub Apps are globally unique names — one app can be installed on multiple repos. This enables squad teams to reuse the same identity across multiple project repositories without creating separate apps.

**First repository:**

Run `squad identity create` normally. The CLI opens a browser manifest flow to create the app on GitHub:

```bash
cd /path/to/first-repo
squad identity create
```

The app is created via browser and installed on this repo. The PEM key and app registration are stored in `.squad/identity/`.

**Additional repositories:**

For any other repo with Squad, reuse the identity by importing from the first repo:

```bash
cd /path/to/second-repo
squad identity create --import /path/to/first-repo
```

The CLI copies the PEM key and app registration from the first repo, then prompts you to install the app on the current repo (opens browser).

**Integration with create flags:**

The `--import` flag works with `--role`, team auto-detection, and all other create flags:

```bash
# Import and create only the lead role
squad identity create --import /path/to/first-repo --role lead

# Import and detect all roles from team.md
squad identity create --import /path/to/first-repo
```

**Why no direct API:**

GitHub has no API to create apps without a browser or pre-check name availability. This is a security feature — app names must be validated in real time via the GitHub UI. The interactive menu and `--import` flag provide a UX shortcut for the common multi-repo case without requiring manual browser workflows for each repo.
