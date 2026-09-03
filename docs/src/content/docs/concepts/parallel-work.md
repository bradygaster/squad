# Parallel Work & Models
Squad dispatches the minimum sufficient set of agents for a task, and runs genuinely independent work in parallel — no artificial sequencing, and no agents spawned just to look busy. It also picks the right AI model for each agent based on what they're doing, so you get quality where it counts and speed everywhere else.

---
## Try This
```
Have three agents work on this in parallel: UI mockups, API spec, and database schema
```
```
Use Sonnet for code, Haiku for everything else
```
```
Work on issues #12, #15, and #18 at the same time
```

---
## How Dispatch Works
When the coordinator receives a multi-part task, it dispatches the minimum sufficient set, then fans out only across work it has proven independent:
```mermaid
graph TD
    A["Coordinator<br/>receives work"]
    B["Scope &amp; Dependency<br/>Analysis"]
    C["Primary owner<br/>(always)"]
    D["Second owner<br/>only if independent"]
    E["Queued<br/>(over cap / not yet needed)"]
    F["Result A"]
    G["Result B"]
    I["Collect &amp;<br/>Synthesize"]

    A --> B
    B --> C
    B --> D
    B --> E
    C --> F
    D --> G
    F --> I
    G --> I
```
1. **Scope & Dependency Analysis** — Identify the primary owner, then check whether any *other* concern is genuinely independent (different module, different owner, non-overlapping files).
2. **Dispatch minimum sufficient** — One primary owner by default. Add a second agent only for a genuinely independent concern or a reviewer the task actually requires.
3. **Wait** — Coordinator polls agent status until in-flight work completes.
4. **Collect** — Aggregate results, check for errors, dispatch the next step only if the accepted scope requires it.
### Example
> "Implement user authentication: API endpoints, frontend form, tests, and documentation"
Coordinator dispatches **2 agents** — the two provably independent concerns:
- Backend → API endpoints (`src/api/`)
- Frontend → Login/signup form (`src/ui/`)
Tests and documentation are **not** pre-spawned. They're dispatched after the implementation exists and shows they're actually needed — that's downstream work, not parallel work.

---
## Background vs. Sync

| Mode | When Used | Behavior |
|------|-----------|----------|
| **Background** | Work that is genuinely independent of everything else in flight | Agents run in parallel, coordinator polls for completion |
| **Sync** | One agent needs another's output | Agents run sequentially, coordinator waits |
| **Sync** | Reviewer gate (Lead must approve first) | Agent runs, coordinator waits for [review](your-team.md#reviewer-protocol) decision |

Pick the mode from the actual dependency, not from a default. The question is *"is anyone waiting on this result right now?"* — if yes, `sync`; if no and it's independent of everything in flight, `background`.
### Background (Independent Work)
```mermaid
graph LR
    A["Coordinator"] --> B["Agent 1<br/>background"]
    A --> C["Agent 2<br/>background"]
    B --> E["Result 1"]
    C --> F["Result 2"]
    E --> H["Coordinator<br/>collects all"]
    F --> H
```
Agents don't see each other's output until the coordinator collects and synthesizes.
### Sync (Dependencies & Gates)
```mermaid
graph TD
    A["Coordinator"] --> B["Agent 1<br/>sync"]
    B --> C["Result 1"]
    C --> D["Coordinator"]
    D --> E["Agent 2<br/>sync uses Result 1"]
    E --> F["Result 2"]
    F --> G["Coordinator"]
    G --> H["Reviewer<br/>sync gates"]
```
Each step blocks until the previous completes.
### Minimum Sufficient Dispatch
Squad's default is **minimum sufficient dispatch** — the fewest agents that can finish the work, dispatched immediately. Speed comes from routing fast, not from routing wide.
- **One primary agent by default** — the owner whose domain is the actual concern.
- **A second agent only** for a genuinely independent concern or a required reviewer. Two agents that would edit the same files are one agent.
- **No speculative agents** — testers, docs writers, and scaffolders are dispatched when the upstream result shows they're needed, not "because they'll obviously be needed."
- **Real parallelism is preserved** — when you can name two distinct concerns with different owners and non-overlapping files, they run at the same time.
### Deadlock Avoidance
When agents have circular dependencies (A needs B, B needs A), the coordinator detects the cycle and asks you to pick a resolution: run A first, run B first, or redesign.
### Dispatch Limits
- **Per request:** 2 domain agents. Exceeding it takes an explicit `"Team, ..."` request, or a task that provably spans 3+ modules with different primaries.
- **In flight:** 3 domain agents at once, 1 task per agent. Over the cap, work queues and the coordinator says what's queued.
- **Exempt:** Scribe (background logging) and Ralph (monitor) never count against the caps.
- **Adjustable:** `"Run at most 2 agents at once"` → coordinator batches work accordingly. `.squad/routing.md` and `.squad/team.md` can tighten the numbers for your repo.

---
## Model Selection
Squad routes each agent to the right AI model based on what they're doing — not a one-size-fits-all default.
### Selection Layers
First match wins:

| Layer | How It Works |
|-------|-------------|
| **1. User Override** | You said `"use opus"` or `"save costs"` — done, session-wide |
| **2. Charter Preference** | Agent's charter has a `## Model` section |
| **3. Task-Aware Auto** | Coordinator checks what the agent is actually doing (see table below) |
| **4. Default** | `gpt-5.6-luna` — cost wins when in doubt |

### Task-Aware Defaults

| Task Output | Model | Tier |
|-------------|-------|------|
| Writing code (implementation, refactoring, tests, bug fixes) | `gpt-5.6-terra` | Standard |
| Writing prompts or agent designs | `gpt-5.6-terra` | Standard |
| Non-code work (docs, planning, triage, changelogs) | `gpt-5.6-luna` | Fast |
| Visual/design work requiring image analysis | `gpt-5.6-sol` | Premium |

### Role-to-Model Mapping

| Role | Default Model | Why |
|------|--------------|-----|
| Core Dev / Backend / Frontend | `gpt-5.6-terra` | Writes code — quality first |
| Tester / QA | `gpt-5.6-terra` | Writes test code |
| Lead / Architect | auto (per-task) | Mixed: code review vs. planning |
| Prompt Engineer | auto (per-task) | Prompt design is like code |
| DevRel / Writer | `gpt-5.6-luna` | Docs — not code |
| Scribe / Logger | `gpt-5.6-luna` | Mechanical file ops |
| Git / Release | `gpt-5.6-luna` | Changelogs, tags, version bumps |
| Designer / Visual | `gpt-5.6-sol` | Vision capability required |

### Model Catalog (17 models)
Squad supports models across three tiers:
- **Premium:** gpt-5.6-sol, claude-opus-5, claude-opus-4.8, claude-opus-4.7, claude-opus-4.6
- **Standard:** gpt-5.6-terra, claude-sonnet-5, claude-sonnet-4.6, claude-sonnet-4.5, gpt-5.5, gpt-5.4, gpt-5.3-codex, gemini-3.1-pro
- **Fast/Cheap:** gpt-5.6-luna, claude-haiku-4.5, gpt-5.4-mini, gpt-5-mini
### Fallback Chains
If a model is unavailable (plan restriction, rate limit, deprecation), Squad silently retries with the next in chain. Never falls back **up** in tier — a fast task won't land on a premium model.
```
Premium: gpt-5.6-sol → claude-opus-5 → claude-opus-4.8 → claude-opus-4.7 → claude-opus-4.6 → claude-sonnet-4.6
Standard: gpt-5.6-terra → claude-sonnet-5 → claude-sonnet-4.6 → gpt-5.5 → gpt-5.4 → gpt-5.3-codex → claude-sonnet-4.5 → gemini-3.1-pro
Fast:     gpt-5.6-luna → claude-haiku-4.5 → gpt-5.4-mini → gpt-5-mini
```

---
## Copilot Coding Agent (@copilot)
Add the GitHub Copilot coding agent to your Squad as an async team member. It picks up approved issues, creates branches, and opens PRs in the background.
### Prerequisites
1. **Copilot coding agent enabled** on the repo (Settings → Copilot → Coding agent)
2. **`copilot-setup-steps.yml`** exists in `.github/`
3. **GitHub Actions** enabled on the repo
### Quick Start
```bash
# Add @copilot with auto-assign
squad copilot --auto-assign
# Create a classic PAT (repo scope) and add as secret
gh secret set COPILOT_ASSIGN_TOKEN
# Commit and push
git add .github/ .squad/ && git commit -m "feat: add copilot to squad" && git push
# Test — label any issue with squad:copilot
```
Or in conversation: `"Add copilot to the squad with auto-assign enabled"`
### How @copilot Differs

| | AI Agent | Human Member | @copilot |
|---|----------|-------------|----------|
| Badge | ✅ Active | 👤 Human | 🤖 Coding Agent |
| Charter | ✅ | ❌ | ❌ (uses `copilot-instructions.md`) |
| Works in session | ✅ | ❌ | ❌ (async via issue assignment) |
| Creates PRs | Via session | Outside Squad | In the background |

### Capability Profile
The profile in `team.md` controls what @copilot handles:

| Tier | Meaning | Examples |
|------|---------|----------|
| 🟢 **Good fit** | Route automatically | Bug fixes, test coverage, lint fixes, dependency updates, small features, docs |
| 🟡 **Needs review** | Route but flag for review | Medium features with specs, refactoring with tests, API additions |
| 🔴 **Not suitable** | Route to a squad member | Architecture, multi-system design, security-critical, ambiguous requirements |

### Auto-Assign Flow
When the `squad:copilot` label is added to an issue:
1. Workflow posts a routing comment
2. Workflow assigns `copilot-swe-agent[bot]` to the issue
3. Coding agent creates a `copilot/*` branch and opens a draft PR
Auto-assign requires a classic PAT stored as `COPILOT_ASSIGN_TOKEN` (fine-grained PATs return 403 for this endpoint).

---
## Git Worktrees
Squad supports git worktrees with two strategies for teams working across multiple branches simultaneously.
### Worktree-Local (Independent State)
Each worktree gets its own `.squad/` directory. Agents in one worktree don't see state from another.
```
project/
├── .squad/                    # Main worktree team
project-feature-a/
├── .squad/                    # Feature A team (independent)
project-feature-b/
├── .squad/                    # Feature B team (independent)
```
**Best for:** multiple features with different teams, experimental branches, different compositions per worktree.
### Main-Checkout (Shared State)
All worktrees share `.squad/` from the main checkout via symlink.
```
project/
├── .squad/                    # Shared by all worktrees
project-feature-a/
├── .squad -> ../project/.squad/  # Symlink
project-feature-b/
├── .squad -> ../project/.squad/  # Symlink
```
**Best for:** same team on multiple branches, coordinated parallel development, solo dev with multiple branches.
### Which Strategy?

| Scenario | Strategy |
|----------|----------|
| Parallel features, same team | Main-checkout |
| Experimental branch, isolated team | Worktree-local |
| Hotfix + feature branch | Main-checkout |
| Multiple teams in same repo | Worktree-local |

Setup is one command: `"Use the main worktree's team"` (creates symlink) or `"Initialize Squad in this worktree"` (creates independent `.squad/`).
Squad uses `merge=union` for append-only log files to avoid conflicts across worktrees.

---
## Tips
- Minimum sufficient dispatch is the default — one owner, plus a second only for genuinely independent work. Ask for `"Team, ..."` when you really do want the whole roster.
- Start conservative with @copilot's capability profile and expand as you see what it handles well.
- Use `squad:copilot` labels with [issue-driven development](../scenarios/issue-driven-dev.md) for background processing with review gates.
- Fallback chains are silent — you won't notice model switches unless you ask `"what model did Kane use?"`.
- For worktrees, main-checkout is usually the right choice unless you need truly isolated teams.

---
## Sample Prompts
```
Build the new dashboard feature — everyone work in parallel
```
An explicit "everyone" request lifts the per-request cap: the coordinator dispatches the relevant owners (Frontend, Backend, Tester, DevRel) and names the modules each is taking.
```
Work on issues #12, #15, and #18 at the same time
```
Works the issues in priority order within the in-flight cap. Independent issues run at the same time; the rest queue and the coordinator tells you what's queued.
```
Implement the API first, then write tests — do it sequentially
```
Forces sync mode: Backend completes, then Tester starts.
```
Run at most 2 agents at once to save costs
```
Sets concurrency limit. Coordinator batches work in groups.
```
Use opus for this architecture work
```
One-off override to premium model for a high-stakes task.
```
Always use haiku to save costs
```
Session-wide preference for the cheapest model tier.
```
Add copilot to the squad with auto-assign enabled
```
Adds @copilot to the roster and configures automatic issue assignment.
```
Use the main worktree's Squad team
```
Creates a symlink so this worktree shares the main checkout's `.squad/` state.

---
## See Also
- [Your Team](./your-team.md) — How agents form and specialize for different roles
- [Architecture](./architecture.md) — How the coordinator orchestrates parallel execution
- [Memory & Knowledge](./memory-and-knowledge.md) — How agents share context across parallel work
