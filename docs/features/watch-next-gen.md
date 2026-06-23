# Watch — Next Generation

Ralph's watch mode evolved to achieve **parity with the PowerShell reference implementation** while adding new capabilities for fleet dispatch, state persistence, and diagnostic visibility.

---

## What's New

### Core Redesign: Agent-Delegated Issue Selection

**Old approach:** TypeScript code pre-filtered issues, then told the agent "here's your work, execute it."

**New approach:** Ralph scans for eligible work, builds rich context, and **delegates the selection decision to the agent** via a temp file prompt.

**Why this matters:**
- Agents get full autonomy over prioritization
- Removes hardcoded decision logic from the TypeScript layer
- Enables agents to escalate, negotiate, or refuse unsuitable work
- Context stays live — agent sees latest squad state, decisions, blockers

### Prompt Delivery Pattern

Watch uses the `-p <tempfile>` flag pattern (matching PS1 ralph-watch):

```bash
# Old pattern (inline --message)
gh copilot --message "work on issue #42"

# New pattern (file-based)
gh copilot -p /tmp/watch-context-xyz.md
```

This approach:
1. Cleanly separates context (file) from agent command
2. Survives shell escaping issues with large prompts
3. Matches the tested PowerShell pattern
4. Allows agents to review full context before committing

### Rich Prompt Scaffold

The temp file includes a structured Task/WHY/Success/Escalation scaffold:

```markdown
## Squad Work Context

### Current Task
Select an issue to work on from the priority list below.

### WHY (Context)
- Squad is at 87% test coverage (trend: ↑)
- Decision archive has 23 unmerged files (needs hygiene)
- Two blockers waiting on external review (API team)

### Available Issues
1. **#42 [P0] Auth regression** — 3 failed tests in prod
   - Urgency: CRITICAL
   - Estimated effort: 2h
   - Skills needed: Middleware, JWT

2. **#89 [P1] Perf spike** — DB queries doubled
   - Urgency: HIGH
   - Estimated effort: 4h
   - Skills needed: Query optimization, monitoring

3. **#123 [P2] Docs gap** — API changelog outdated
   - Urgency: MEDIUM
   - Estimated effort: 1h
   - Skills needed: API knowledge, writing

### Success Criteria
- ✓ Tests pass (all suites)
- ✓ Follows team conventions (naming, format, commit style)
- ✓ PR linked to issue (via closing keyword)
- ✓ Changelog updated if user-facing

### When to Escalate
If you detect any of these, pause and notify humans:
- External dependency blocked (waiting on another team)
- Scope creep (issue needs to split)
- Insufficient context or documentation
- Unclear acceptance criteria

### How to Proceed
1. Pick one issue
2. Work autonomously (create branch, commit, push, PR)
3. If blocked → write summary to `.squad/ralph-escalation.md`
4. Report completion to stdout
```

---

## Configuration & Flags

### Basic Invocation

```bash
# Minimal — triage mode only (scan, don't execute)
squad watch

# Standard — with execution
squad watch --execute --interval 5

# Full-featured
squad watch --execute \
  --interval 5 \
  --agent-cmd "agency copilot" \
  --copilot-flags "--yolo --autopilot --mcp mail" \
  --auth-user developer@example.com \
  --log-file ./watch.log \
  --verbose
```

### Flag Reference

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--execute` | boolean | false | Enable agent execution (spawn sessions) |
| `--interval` | number (minutes) | 10 | Poll frequency |
| `--agent-cmd` | string | `gh copilot` | Agent runner command |
| `--copilot-flags` | string | (empty) | Flags to pass to agent (e.g., `--yolo --mcp mail`) |
| `--auth-user` | string | (auto-detect) | GitHub/ADO account for agent auth |
| `--log-file` | string | (stdout only) | Path to mirror output for diagnostics |
| `--verbose` | boolean | false | Show auth probes, callbacks, pull operations |
| `--health` | boolean | false | Show process health and exit |
| `--overnight-start` | HH:MM | (disabled) | Start pause window (e.g., `18:00`) |
| `--overnight-end` | HH:MM | (disabled) | End pause window (e.g., `08:00`) |
| `--notify-level` | enum | `important` | Verbosity: `all`, `important`, `none` |
| `--state-backend` | enum | (in-memory) | Persistence: `git-notes`, `orphan-branch` |
| `--cleanup` | boolean | false | Run cleanup pass (prune scratch, logs, old state) |

---

## Error Recovery

Watch implements a **4-tier escalation ladder** to recover from transient failures:

### Tier 1: Circuit Breaker Reset (Immediate)

```
Error: Git auth failed
→ Clear .git/config auth section
→ Retry immediately
```

If Tier 1 succeeds, resume normal operation.

### Tier 2: Auth Reprobe (30s delay)

```
Error: Still failing after CB reset
→ Call adapter.ensureAuth(preferredUser)
→ Verify credentials with GitHub/ADO
→ Retry pull/push
```

Tier 2 catches auth drift (token expiration, credential cache corruption).

### Tier 3: Git Pull (60s delay)

```
Error: Still failing
→ Stash dirty working tree (warn if watch source changed)
→ git pull --ff-only origin HEAD
→ Retry operation
```

Tier 3 syncs local state, often fixes race conditions or divergence.

### Tier 4: Pause 30m (Hold)

```
Error: Still failing after pull
→ Log full error and context
→ Set .squad/ralph-stop file
→ Pause watch for 30 minutes
→ Human intervention required
```

Tier 4 prevents spam and signals that manual action is needed.

---

## State Persistence

### In-Memory (Default)

```bash
squad watch --execute
```

- ✓ Fast, no I/O overhead
- ✓ Simple state model
- ✗ Lost on restart
- ✗ No cross-machine visibility

### Git-Notes Backend

```bash
squad watch --execute --state-backend git-notes
```

- ✓ Survives restarts
- ✓ Full git history (can revert, inspect)
- ✓ No new branches (notes are refs)
- ✓ Cross-machine visible (if you pull)
- ✗ Slightly slower (git operations)

Example git-notes state:

```
# Show notes
git notes show

# Inspect watch state
cat .git/refs/notes/watch-state
```

### Orphan-Branch Backend

```bash
squad watch --execute --state-backend orphan-branch
```

- ✓ Survives restarts
- ✓ Full git history (inspectable, revertible)
- ✓ Cross-machine visible (if you fetch/push)
- ✓ Easy cleanup (delete branch)
- ✗ Creates a branch (might confuse git workflows)
- ✗ Slightly slower (branch operations)

Example orphan-branch state:

```
# List state branches
git branch -a | grep ralph-watch

# Inspect history
git log --oneline refs/heads/ralph-watch

# Delete if stale
git branch -D ralph-watch-backup
```

---

## Generic Auth Pattern

Watch uses a **generic auth adapter** with no hardcoded usernames:

```typescript
// Old way (hardcoded)
const token = process.env.GITHUB_TOKEN; // ❌ assumes one account
adapter.init({ account: "bot@company" }); // ❌ baked in

// New way (delegated)
const preferredUser = options.authUser || (auto-detect from git);
adapter.ensureAuth(preferredUser); // ✓ explicit, dynamic
```

### Usage

```bash
# Auto-detect from git remote
squad watch --execute

# Use specific account
squad watch --execute --auth-user alice@example.com

# Switch accounts mid-session
# (create new watch with different --auth-user)
```

---

## Graceful Shutdown

### Sentinel-File Pattern

```bash
# Create sentinel
touch .squad/ralph-stop

# Watch detects this at end of round and:
# 1. Finishes current operation
# 2. Logs final state
# 3. Prunes scratch dirs
# 4. Exits cleanly
```

Advantages over SIGTERM:
- No partial state corruption
- Agent-friendly (agents finish work)
- Audit trail in watch logs

### Manual Restart

```bash
# If watch crashed or got stuck
rm .squad/ralph-stop  # clear sentinel if present
squad watch --execute --state-backend git-notes
# Resumes from last saved state
```

---

## Cleanup Capability

Watch can prune old artifacts:

```bash
# Manual cleanup pass
squad watch --cleanup

# Automatic cleanup on startup (if state is stale)
# Prunes:
# - Scratch dirs > 7 days old
# - Log files > 30 days old
# - Orphaned orchestration state > 14 days old
```

---

## Notification Levels

Control watch verbosity with `--notify-level`:

### `all` — Everything

```
14:32:01 | Round 42 starting...
14:32:02 | Scanning GitHub for issues...
14:32:03 | Found 12 eligible issues
14:32:04 | Checking auth: OK
14:32:05 | Invoking agent: gh copilot -p /tmp/watch-context.md
14:32:15 | Agent selected issue #42
14:32:16 | Agent spawned branch: feature/fix-auth-42
14:32:45 | Agent pushed changes
14:32:46 | Agent created PR #5678
14:32:47 | Round 42 complete
14:32:47 | Next poll at 14:37
```

### `important` — Key Events (Default)

```
14:32:01 | Round 42 starting...
14:32:05 | Invoking agent: gh copilot -p /tmp/watch-context.md
14:32:15 | Agent selected issue #42
14:32:46 | Agent created PR #5678
14:32:47 | Round 42 complete (1 issue resolved)
14:32:47 | Next poll at 14:37
```

### `none` — Silent

```
(no output unless error)
```

Check status with `--health`:

```bash
squad watch --health
```

---

## Watch Health

The `--health` flag shows a snapshot of the running process:

```bash
$ squad watch --health

Ralph Watch Process Status

PID: 12345
Command: squad watch --execute --interval 5 --auth-user alice@example.com
Uptime: 2h 15m 30s
Status: Running

Auth
├─ Account: alice@example.com
├─ Platform: GitHub (auto-detected from git remote)
├─ Last Check: 1 minute ago
└─ Status: ✓ Ready

Capabilities
├─ Issue Triage: ✓
├─ PR Review: ✓
├─ ADO Work Items: ✗ (not configured)
└─ Fleet Dispatch: ✓

Watch State
├─ Rounds Completed: 42
├─ Issues Worked: 12
├─ Success Rate: 92%
└─ Last Error: None

Next Poll
├─ Scheduled: 14:35:00 (in 3 minutes)
├─ Interval: 5 minutes
└─ Pause Window: None

Log Location: ./watch.log
State Backend: git-notes
State Branches: refs/notes/watch-state
```

---

## Fleet Dispatch

Watch now supports **label-based claim/reclaim** across multiple machines:

```bash
# Machine 1 (claims "watch-fleet")
squad watch --execute --fleet-label "watch-fleet" --machine-id "prod-1"

# Machine 2 (claims same label, syncs via git)
squad watch --execute --fleet-label "watch-fleet" --machine-id "prod-2"

# Coordination:
# - Each machine writes its claim to .squad/.watch-claims
# - Claims include: machine-id, timestamp, capabilities
# - Load distribution: claims rotate which machine works each round
```

Use cases:
- Distribute watch load across machines
- Auto-failover if one machine goes down
- Inspect fleet status with `squad watch --health --fleet-label watch-fleet`

---

## Round Timing

Watch shows structured timing info:

```
14:30:00 | Starting round 1...
14:30:15 | Scanning for work
14:30:30 | Invoking agent
14:31:15 | Round 1 complete
14:31:15 | Next poll at 14:35:00
```

Allows humans to:
- Predict when watch will act
- Plan maintenance windows
- Tune `--interval` based on observed round duration

---

## Log File Output

Enable detailed logging:

```bash
squad watch --execute --log-file ./watch.log --verbose
```

Log format: JSON Lines (one log object per line)

```json
{"ts":"2026-03-25T14:30:00Z","level":"info","round":1,"event":"start","message":"Starting round 1..."}
{"ts":"2026-03-25T14:30:15Z","level":"info","round":1,"event":"scan","issues":12,"eligible":8}
{"ts":"2026-03-25T14:30:30Z","level":"info","round":1,"event":"agent_invoke","cmd":"gh copilot","flags":"--yolo"}
{"ts":"2026-03-25T14:31:15Z","level":"info","round":1,"event":"complete","worked":1,"errors":0,"duration_ms":75000}
```

Advantages:
- Machine-parseable for analysis
- Preserves full context (not just summary)
- Enable post-hoc debugging without re-running

---

## PowerShell Parity Design

This implementation matches the reference PS1 `ralph-watch` design:

| Feature | PS1 | Next-Gen |
|---------|-----|----------|
| Temp-file prompts | ✓ | ✓ |
| Rich task scaffold | ✓ | ✓ |
| 4-tier error recovery | ✓ | ✓ |
| Auth adapter | ✓ | ✓ |
| Stash + pull | ✓ | ✓ |
| Sentinel stop | ✓ | ✓ |
| Fleet labels | (planned) | ✓ |
| Log file output | (basic) | ✓ JSON Lines |
| Health status | ✓ | ✓ |

### Migration from PowerShell

If you have a running PS1 ralph-watch, transition to Next-Gen:

1. Keep PS1 running (no risk)
2. Start Next-Gen watch on same or different machine
3. Monitor both for 24-48 hours
4. Compare issue resolution rates, error patterns
5. Switch to Next-Gen full-time
6. Archive PS1 (keep script in git history)

---

## Configuration Best Practices

### Development

```bash
# Short interval, verbose output, all notifications
squad watch --execute \
  --interval 1 \
  --notify-level all \
  --log-file ./watch-dev.log \
  --verbose
```

### Staging

```bash
# Normal interval, important notifications, git-notes persistence
squad watch --execute \
  --interval 5 \
  --notify-level important \
  --log-file ./watch-staging.log \
  --state-backend git-notes
```

### Production

```bash
# Longer interval (less noise), git-notes for durability, fleet labels
squad watch --execute \
  --interval 10 \
  --notify-level important \
  --log-file /var/log/squad/watch.log \
  --state-backend git-notes \
  --fleet-label "prod-watch" \
  --machine-id "$HOSTNAME"
```

### Off-Hours (Overnight Pause)

```bash
# Stop watch from 6 PM to 8 AM
squad watch --execute \
  --overnight-start 18:00 \
  --overnight-end 08:00
```

---

## Troubleshooting

### Watch won't start

```bash
# Check health
squad watch --health

# Common causes:
# - .squad/ralph-stop sentinel exists
#   → rm .squad/ralph-stop

# - Auth broken
#   → squad watch --execute --auth-user <account>
#   → Check gh auth status
```

### Agent keeps failing

```bash
# Enable verbose output
squad watch --execute --verbose --log-file watch-debug.log

# Common causes:
# - Insufficient copilot-flags
#   → Add --copilot-flags "--mcp mail --yolo"

# - Agent command not found
#   → Check $PATH, verify gh copilot installed
```

### State got corrupted

```bash
# Reset to in-memory (no persistence)
squad watch --execute

# Or clear saved state
rm .git/refs/notes/watch-state  # git-notes backend
git branch -D ralph-watch       # orphan-branch backend
```

### Watch uses too much CPU/bandwidth

```bash
# Increase interval
squad watch --execute --interval 30  # check every 30 min

# Reduce notifications
squad watch --execute --notify-level important

# Reduce agent parallelism (if fleet)
squad watch --execute --fleet-label prod-watch --max-concurrent 1
```

---

## See Also

- [Persistent Ralph](/features/persistent-ralph) — Monitoring and trend analysis
- [Generic Scheduler](/features/generic-scheduler) — Schedule watch via cron/systemd
- [Cross-Squad Orchestration](/features/cross-squad-orchestration) — Watch across squad boundaries
