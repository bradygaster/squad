# PRD Mode

> **Try this:**  
> `"Write a PRD for a user authentication system with OAuth support"`  
> `"Read the PRD at docs/product-spec.md and break it into work items"`

Give Squad a product requirements document and the Lead breaks it into prioritized work items, assigns them to the team, and tracks progress with dependency management.

---

## How to Use

Give Squad a product requirements document. The Lead agent breaks it into work items, assigns them to the team, and tracks progress.

---

## How to Use

Paste a PRD directly into the chat:

```
> Here's what we're building:
>
> [paste your PRD or spec]
```

Or reference a file:

```
> Read the PRD at docs/product-spec.md and break it into work items
```

---

## How It Works

1. **Lead decomposes the spec** into discrete work items (WI-1, WI-2, WI-3, etc.)
2. **Each work item gets a priority**: P0 (must-have), P1 (important), P2 (nice-to-have)
3. **Work items are assigned** to agents based on domain expertise
4. **Dependencies are tracked** — Squad won't start WI-4 if it depends on WI-2 finishing first
5. **Parallel work** happens where possible — independent work items run simultaneously

### Example output

```
📋 PRD decomposed into 8 work items:

WI-1  [P0]  Set up project structure           → Kane (Backend)
WI-2  [P0]  Design database schema              → Kane (Backend)
WI-3  [P0]  Build component library             → Dallas (Frontend)
WI-4  [P1]  Implement auth endpoints            → Kane (Backend)     [depends: WI-2]
WI-5  [P1]  Build login/signup UI               → Dallas (Frontend)  [depends: WI-3]
WI-6  [P1]  Write auth integration tests        → Lambert (Tester)   [depends: WI-4]
WI-7  [P2]  Add social login                    → Kane (Backend)     [depends: WI-4]
WI-8  [P2]  Build user profile page             → Dallas (Frontend)  [depends: WI-5]
```

---

## Mid-Project PRD Updates

Requirements change. When they do, give Squad the updated PRD:

```
> The PRD has been updated — re-read docs/product-spec.md
```

The Lead agent:

1. Re-reads the PRD
2. Diffs against the existing work items
3. Adjusts the backlog — adds new items, re-prioritizes, or marks items as obsolete

Work already completed isn't undone. Only the remaining backlog changes.

---

## Tips

- P0 work items are tackled first. Use priority levels to control sequencing.
- The Lead handles decomposition — you don't need to break down the spec yourself.
- Dependencies are respected automatically. You won't see an agent start on a dependent task before its prerequisite is done.
- Combine with [GitHub Issues Mode](github-issues.md) to create GitHub issues from work items.

## Sample Prompts

```
read the PRD at docs/product-spec.md and break it into work items
```

Ingests a product requirements document and creates a prioritized, dependency-tracked backlog.

```
show me the work items
```

Displays the current backlog with priorities, assignments, and dependencies.

```
the PRD has been updated — re-read docs/product-spec.md
```

Re-ingests the PRD and adjusts the backlog based on changes without undoing completed work.

```
start working on approved P0 items
```

Begins parallel execution of all high-priority work items with no blockers.

```
which work items are blocked right now?
```

Shows which tasks are waiting on dependencies or other blocking conditions.
