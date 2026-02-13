# Label Taxonomy

Squad uses a structured, namespaced label system to drive workflow automation. Labels are not just tags — they're the state machine. Five namespaces define issue lifecycle, priority, ownership, and release targeting.

## The Five Namespaces

| Namespace | Purpose | Values | Mutual Exclusivity |
|-----------|---------|--------|-------------------|
| `go:` | Verdict — yes/no/needs-research | `go:yes`, `go:no`, `go:needs-research` | ✅ One per issue |
| `release:` | Release target | `release:v0.4.0`, `release:v0.5.0`, `release:backlog` | ✅ One per issue |
| `type:` | Issue category | `type:feature`, `type:bug`, `type:spike`, `type:docs`, `type:chore`, `type:epic` | ✅ One per issue |
| `priority:` | Urgency level | `priority:p0`, `priority:p1`, `priority:p2` | ✅ One per issue |
| `squad:{member}` | Agent assignment | `squad:fenster`, `squad:mcmanus`, `squad:hockney` | ❌ Can have multiple (pair work) |

## Mutual Exclusivity Rules

Within `go:`, `release:`, `type:`, and `priority:` namespaces, **only one label is allowed**. Applying a second label in the same namespace auto-removes the first.

Example:
- Issue has `go:needs-research`
- You apply `go:yes`
- Result: `go:needs-research` removed, `go:yes` applied

The `squad:{member}` namespace allows **multiple labels** for collaborative work:
- `squad:fenster` + `squad:hockney` = pair programming or handoff

## Workflow Automation

Labels drive four automation layers:

### 1. Enforcement (Mutual Exclusivity)

GitHub Actions workflow `label-enforcement.yml` watches for label changes. If multiple labels from the same namespace are applied, it removes all but the most recent.

### 2. Sync (Cross-Namespace Consistency)

Some label changes trigger cascading updates:
- `go:no` applied → auto-adds `release:backlog`, removes other release targets
- `priority:p0` applied → ensures `go:yes` is set (p0 implies approved)

### 3. Triage (Auto-Assignment)

Ralph (work monitor) uses labels to route work:
- `squad:fenster` → Fenster picks it up
- No `squad:*` + `type:bug` → Routes to Tester or Lead based on routing.md
- `go:needs-research` → Routes to Lead for investigation

### 4. Heartbeat (Periodic Check)

The `squad-heartbeat.yml` workflow runs every 30 minutes and:
- Finds issues with `squad` label but no `squad:{member}` → auto-triages
- Finds `go:yes` + `squad:{member}` but no assignee → spawns agent
- Finds stale `go:needs-research` (>7 days) → escalates to Lead

## State Machine Flow

```
New issue → squad label → Triage
                            ↓
                       Lead assigns go:* + type:* + priority:*
                            ↓
                      go:yes → squad:{member} assigned
                            ↓
                      Agent works → Draft PR
                            ↓
                      Review → Approved
                            ↓
                      Merge → Issue closed
```

## Adding Labels

Labels are created automatically during `init` or `upgrade`. To add custom labels:

```bash
gh label create "squad:designer" --color "0366d6" --description "Work assigned to Designer"
```

Or via the GitHub UI: Issues → Labels → New label

## Label Colors

Squad uses a consistent color scheme:

| Namespace | Color | Hex |
|-----------|-------|-----|
| `go:` | Green (yes), Red (no), Yellow (research) | `#0e8a16`, `#d73a4a`, `#fbca04` |
| `release:` | Blue | `#0366d6` |
| `type:` | Purple | `#6f42c1` |
| `priority:` | Orange (p0), Yellow (p1), Gray (p2) | `#d93f0b`, `#fbca04`, `#d4c5f9` |
| `squad:{member}` | Teal | `#008672` |

## Querying by Label

```bash
# All approved features for v0.4.0
gh issue list --label "go:yes,release:v0.4.0,type:feature"

# All p0 bugs assigned to Fenster
gh issue list --label "priority:p0,type:bug,squad:fenster"

# All issues needing research
gh issue list --label "go:needs-research"
```

## Sample Prompts

```
Mark issue #42 as approved for v0.4.0
```
Applies `go:yes` and `release:v0.4.0` labels. Removes any conflicting labels.

```
Change issue #15 from needs-research to no
```
Updates verdict: removes `go:needs-research`, applies `go:no`, adds `release:backlog`.

```
Assign issue #28 to Fenster and Hockney for pair work
```
Applies `squad:fenster` and `squad:hockney` labels. Both agents can pick it up.

```
List all p0 features approved for the next release
```
Queries: `priority:p0 + type:feature + go:yes + release:{current milestone}`.

```
Show me all issues in the backlog
```
Filters for `release:backlog` or `go:no` labels.
