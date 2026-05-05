---
name: "e2e-template-testing"
description: "End-to-end validation of coordinator and agent template changes"
domain: "development"
confidence: "high"
source: "manual"
---

## Context

Squad's coordinator prompt (`squad.agent.md`) and agent charters (e.g.
`scribe-charter.md`) are shipped as templates in `.squad-templates/`. Changes to
these files affect how every squad session behaves — but unit tests can't catch
prompt-level regressions because the prompts are interpreted by an LLM at
runtime.

This skill describes how to validate template changes end-to-end by running real
squad sessions against a locally-built CLI that includes your modified templates.

## When To Use

- You changed `.squad-templates/squad.agent.md` (coordinator prompt)
- You changed `.squad-templates/scribe-charter.md` or other agent charters
- You changed `.squad-templates/notes-protocol.md` or helper scripts
- You added new conditional blocks (e.g. state-backend-aware spawn templates)
- You modified the init scaffolding that writes templates to target repos

## Prerequisites

- **Node.js** ≥20, **npm** ≥10
- **Git** CLI
- **GitHub Copilot CLI** (`copilot` or `ghcs`) installed
- A local clone of the squad repo on your feature branch

## Workflow

### Step 1 — Build the CLI from your branch

```bash
cd /path/to/squad          # your feature branch
npm install
npm run build              # compiles SDK + CLI

# Link so `squad` command uses your local build
cd packages/squad-cli
npm link
```

Verify: `squad version` should show the `-preview` tag.

### Step 2 — Create a disposable test repo

```bash
mkdir /tmp/sq-test-1 && cd /tmp/sq-test-1
git init
echo "# Test Project" > README.md
echo '{"name":"test-project","version":"1.0.0"}' > package.json
mkdir src
echo "export function hello() { return 'world' }" > src/index.ts
git add -A && git commit -m "init: test project"
```

Keep the project small — you only need enough for the coordinator to recognize a
codebase and hire a team.

### Step 3 — Init a squad with your modified templates

```bash
squad init
# If testing a specific feature (e.g. state backends):
# squad init --state-backend git-notes
```

Verify the init produced the expected files:
```bash
ls -la .squad/
cat .squad/team.md          # should have ## Members with 3+ agents
cat .squad/config.json      # should reflect any CLI flags you passed
```

### Step 4 — Run a real session and capture output

Use the Copilot CLI's `-p` flag for non-interactive single-turn sessions:

```bash
copilot -p "Picard, decide what testing framework to use. Write your decision." \
  2>&1 | tee evidence/session-task.log
```

For multi-turn workflows, run sequential sessions:
```bash
# Session A: give the team a task
copilot -p "prompt A" 2>&1 | tee evidence/session-A.log

# Session B: verify state persisted
copilot -p "What decisions has the team made?" 2>&1 | tee evidence/session-B.log
```

### Step 5 — Verify the outcome

Check that your template change had the expected effect. Common checks:

```bash
# State location (for state-backend changes)
git notes --ref=squad list              # git-notes backend
git ls-tree -r squad-state              # orphan backend
ls .squad/agents/*/history.md           # worktree backend

# Coordinator behavior (grep session log)
grep "STATE_BACKEND" evidence/session-task.log
grep "spawn" evidence/session-task.log

# File tree diff
git diff --stat HEAD~1                  # what changed on working branch
git log --all --oneline                 # commits across all branches
```

### Step 6 — Record the verdict

Create an `evidence/verdict.md` in each test repo:

```markdown
## Test: [scenario name]
**Backend:** worktree | git-notes | orphan | two-layer
**Branch:** [your feature branch]
**Result:** PASS | PARTIAL | FAIL

### What was verified
- [ ] Coordinator identified feature correctly (from session log)
- [ ] Agent was spawned via `task` tool (not simulated)
- [ ] team.md has ## Members with 3+ agents
- [ ] State landed in correct location
- [ ] No unexpected side effects

### Evidence files
- session-task.log — full session output
- git-log.txt — `git log --all --oneline`

### Notes
[anything unusual or noteworthy]
```

## Test Matrix Template

Use this matrix when planning validation for a template change. Not every change
needs every row — pick the scenarios relevant to your modification.

| # | Scenario | What to verify |
|---|----------|----------------|
| 1 | Basic init + task | Templates applied, agent spawned, work produced |
| 2 | Cross-branch persistence | State survives `git checkout` (if state-backend) |
| 3 | Scribe behavior | Scribe commits to correct target |
| 4 | PR cleanliness | Feature branch PR has no leaked state files |
| 5 | Migration path | Existing squad picks up new template behavior |
| 6 | Edge case: empty repo | Init works in repo with single commit |
| 7 | Edge case: monorepo | Init works in subdirectory of monorepo |

## Tips

- **Name test repos descriptively:** `sq-test-notes-crossbranch`, not `test1`.
- **Always capture session logs.** Without logs, you can't debug failures.
- **One scenario per repo.** Don't reuse repos across unrelated tests — state
  leaks between tests make results unreliable.
- **Clean up after.** Delete test repos when done. They accumulate fast.
- **Windows users:** Use PowerShell. `Tee-Object` replaces `tee`. Paths use `\`.

## Anti-Patterns

- **Skipping the local build.** If you test with the published CLI, you're
  testing the old templates, not your changes.
- **Testing only the happy path.** Template changes often break edge cases (empty
  repos, monorepos, cross-branch). Test at least 2-3 scenarios.
- **Trusting session output alone.** Always verify git state independently —
  agents can claim they wrote something without actually doing it.
- **Reusing test repos.** Prior state bleeds into later tests. Start fresh.

## Confidence

high — Validated through 12 real E2E test sessions during state-backend
development (PR #1004).
