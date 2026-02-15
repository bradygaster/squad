# Git Worktree Awareness

> **Try this:**  
> `"Use worktree-local mode — I want each branch to have its own team state"`  
> `"Share the team across all worktrees — use main-checkout mode"`

Squad supports git worktrees with two strategies: **worktree-local** (each worktree has its own `.ai-team/` state) and **main-checkout** (shared state across all worktrees).

---

## What Are Worktrees?

## What Are Worktrees?

Git worktrees let you check out multiple branches simultaneously:

```bash
git worktree add ../project-feature-a feature-a
git worktree add ../project-feature-b feature-b
```

Now you have:
- `project/` (main branch)
- `project-feature-a/` (feature-a branch)
- `project-feature-b/` (feature-b branch)

All share the same `.git/` database but have separate working directories.

## Worktree Strategies

### 1. Worktree-Local (Independent State)

Each worktree has its own `.ai-team/` directory. Agents in one worktree don't see state from another.

**When to use:**
- Multiple features in parallel with **different teams**
- Experimental branches where you want isolated Squad config
- Different team compositions per worktree (e.g., frontend-only team in one, backend-only in another)

**Structure:**
```
project/
├── .git/
└── .ai-team/                    # Main worktree team

project-feature-a/
├── .git -> ../project/.git/
└── .ai-team/                    # Feature A team (independent)

project-feature-b/
├── .git -> ../project/.git/
└── .ai-team/                    # Feature B team (independent)
```

**Setup:**
```bash
cd project-feature-a
# Initialize Squad in this worktree
gh copilot "Initialize Squad for this worktree"
```

### 2. Main-Checkout (Shared State)

All worktrees share the `.ai-team/` directory from the main checkout. Agents across worktrees see the same team, decisions, and routing rules.

**When to use:**
- Same team working on multiple branches
- Coordinated work where agents need shared context
- Parallel feature development by the same squad

**Structure:**
```
project/
├── .git/
└── .ai-team/                    # Shared by all worktrees

project-feature-a/
├── .git -> ../project/.git/
└── .ai-team -> ../project/.ai-team/  # Symlink

project-feature-b/
├── .git -> ../project/.git/
└── .ai-team -> ../project/.ai-team/  # Symlink
```

**Setup:**
```bash
cd project-feature-a
ln -s ../project/.ai-team .ai-team
```

Or tell Squad: `"Use the main worktree's team"` — Squad creates the symlink automatically.

## Coordinator Team Root Resolution

When Squad starts in a worktree, the coordinator resolves team root:

1. **Check for `.ai-team/` in current directory** — If exists and is not a symlink, use worktree-local strategy.
2. **Check if `.ai-team/` is a symlink** — If yes, follow symlink to main checkout, use main-checkout strategy.
3. **Scan parent worktrees** — If no `.ai-team/` found, search `../` for main worktree with `.ai-team/`.
4. **Prompt for strategy** — If ambiguous, ask: "Use worktree-local or main-checkout?"

## Merge Driver for Append-Only Files

Squad uses `merge=union` for append-only log files to avoid conflicts across worktrees:

**.gitattributes:**
```
.ai-team/log/* merge=union
.ai-team/orchestration-log/* merge=union
.ai-team/decisions/inbox/* merge=union
```

This ensures log entries from different worktrees don't conflict when merged back to main.

## Worktree-Aware Commands

When using main-checkout strategy:

| Command | Behavior |
|---------|----------|
| `"Show team roster"` | Reads shared `team.md` from main worktree |
| `"Add a directive"` | Writes to shared `decisions/inbox/` in main worktree |
| `"Who's working on issue #42?"` | Checks orchestration log in main worktree (sees all agents across worktrees) |
| `"Initialize Squad"` | Prompts: "Use main worktree's team or create new?" |

## When to Use Which Strategy

| Scenario | Strategy | Reason |
|----------|----------|--------|
| **Parallel features, same team** | Main-checkout | Shared context, coordinated work |
| **Experimental branch, isolated team** | Worktree-local | No cross-contamination |
| **Hotfix branch + feature branch** | Main-checkout | Same squad, need shared decisions |
| **Multiple teams in same repo** | Worktree-local | Different roles, different directives |
| **Solo dev, multiple branches** | Main-checkout | No need for duplicate state |

## Switching Strategies

You can convert between strategies:

### Worktree-Local → Main-Checkout

```bash
cd project-feature-a
rm -rf .ai-team
ln -s ../project/.ai-team .ai-team
```

Or: `"Convert this worktree to use main team"`

### Main-Checkout → Worktree-Local

```bash
cd project-feature-a
rm .ai-team  # Remove symlink
cp -r ../project/.ai-team .ai-team  # Copy state
```

Or: `"Give this worktree its own Squad team"`

## Sample Prompts

```
Initialize Squad in this worktree with a separate team
```
Creates worktree-local `.ai-team/` directory. Team is independent from main worktree.

```
Use the main worktree's Squad team
```
Creates symlink to main worktree's `.ai-team/`. All state is shared.

```
Which worktrees have active Squad teams?
```
Scans all worktrees linked to this repository, reports which have `.ai-team/` directories.

```
Show me the team roster for the main worktree
```
Resolves main worktree path, reads `team.md` from there (useful when in a feature worktree).

```
Convert this worktree to use the main team
```
Removes worktree-local `.ai-team/` and creates symlink to main worktree's `.ai-team/`.
