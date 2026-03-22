### 2026-03-10T18:00Z: Architecture Decision — Worktree vs Checkout Heuristic
**By:** Flight (Lead / Architect)
**Status:** Approved
**Issue:** #531 (parent: #525)

#### Decision

Squad will support **opt-in worktree mode** for parallel agent work. The default behavior remains `git checkout -b` (backward compatible with existing workflows). When worktrees are enabled via configuration, all agent spawns use `git worktree add` instead.

**Core principle:** Worktrees are strictly better for parallel work (no working directory conflicts, true isolation), but they require environment setup (dependency management, path conventions). Making this opt-in gives teams control over when to adopt.

**Decision logic:**
- **Default (worktrees disabled):** All agents use `git checkout -b` — existing behavior
- **Worktrees enabled:** All agents use `git worktree add` — new parallel-safe behavior
- **No heuristic:** The decision is configuration-driven, not situation-driven. Heuristics (parallel spawn detection) are brittle and surprising.

#### Configuration

**Primary location:** `squad.config.ts` (team config)

```typescript
import { defineTeam } from '@bradygaster/squad-sdk';

export default defineTeam({
  name: 'My Squad',
  worktrees: true,  // Enable worktree mode
  // ... rest of team config
});
```

**Fallback location:** `.squad/config.json` (for repos without TypeScript config)

```json
{
  "name": "My Squad",
  "worktrees": true
}
```

**Environment override:** `SQUAD_WORKTREES` (highest precedence)

```bash
# Enable for a single session
SQUAD_WORKTREES=1 gh copilot "Flight, refactor the auth module"

# Disable even when config says true
SQUAD_WORKTREES=0 gh copilot "Ralph, triage issues"
```

**Precedence order (highest to lowest):**
1. `SQUAD_WORKTREES` env var (`1` or `0`)
2. `worktrees` in `squad.config.ts`
3. `worktrees` in `.squad/config.json`
4. **Default: `false`** (backward compatible)

#### Worktree Path Convention

**Pattern:** `{repo-parent}/{repo-name}-{issue-number}`

**Example:**
- Main repo: `C:\src\squad`
- Issue #42 worktree: `C:\src\squad-42`
- Issue #128 worktree: `C:\src\squad-128`

**Rationale:**
- **Sibling directory requirement:** Git worktrees must be outside the main repo (git limitation). Sibling directories are discoverable and predictable.
- **Issue number scoping:** One worktree per issue. Multiple agents on the same issue work in the same worktree.
- **No random suffixes:** Predictable paths simplify debugging and manual intervention.

**Configurable via `worktreePath` pattern** (optional):

```typescript
export default defineTeam({
  worktrees: true,
  worktreePath: '{repo-parent}/{repo-name}-squad-{issue}',
});
```

Placeholders:
- `{repo-parent}` — parent directory of the main repo
- `{repo-name}` — name of the main repo (last segment of the path)
- `{issue}` — issue number
- `{branch}` — branch name (e.g., `squad/42-fix-auth`)

Default pattern if not specified: `{repo-parent}/{repo-name}-{issue}`

#### Dependency Management

**Problem:** Each worktree is a separate working directory. Dependencies (`node_modules`, `venv`, etc.) need to be available in each worktree.

**Recommended strategy:** Junction/symlink from main repo

On worktree creation, create a junction (Windows) or symlink (Unix) from the worktree's `node_modules` to the main repo's `node_modules`:

```bash
# Windows (no admin required)
mklink /J C:\src\squad-42\node_modules C:\src\squad\node_modules

# Unix
ln -s ../squad/node_modules ./node_modules
```

**Fallback strategy:** `npm install` in the worktree

If junction/symlink creation fails (permissions, filesystem limitations), fall back to running `npm install` in the worktree. This is slower and uses more disk space, but always works.

**Detection:** Check for `package.json` in the repo root. If it exists, dependency management is required.

**Other ecosystems:**
- **Python:** Junction/symlink `.venv` or `venv` from main repo
- **Rust:** Cargo shares `target/` automatically via `CARGO_TARGET_DIR` pointing to main repo
- **Go:** `go.mod` works out of the box (modules are path-independent)

**Coordinator responsibility:** After `git worktree add`, attempt junction/symlink. On failure, run the install command (`npm install`, `pip install -r requirements.txt`, etc.) in the worktree.

#### Platform Considerations

**All 3 platform adapters (GitHub, Azure DevOps, Planner) get identical worktree support:**

- **Worktree creation:** `git worktree add {path} -b {branch} {base}`
- **Worktree cleanup:** `git worktree remove {path} && git worktree prune`
- **Branch switching (worktrees disabled):** `git checkout -b {branch}` (existing)

**Windows-specific:**
- Use `mklink /J` (junction) for dependency linking — no admin rights required
- Junctions work on all NTFS/ReFS filesystems
- If mklink fails, fall back to `npm install` (or equivalent)

**Unix-specific:**
- Use `ln -s` (symlink) for dependency linking
- Symlinks require no special permissions
- If ln fails, fall back to dependency install

**CI/containers:**
- Worktrees may not be appropriate in ephemeral environments (CI runners, containers) where parallel work doesn't apply
- Default to `worktrees: false` unless explicitly enabled
- Document this constraint in the worktrees feature guide

#### Migration Path

**Existing users (worktrees disabled by default):**
- No breaking changes. All existing workflows continue to use `git checkout -b`.
- Teams can opt-in by adding `worktrees: true` to their config when ready.

**New teams:**
- Documentation can recommend worktrees for teams expecting parallel work.
- The init flow could ask: *"Will your team work on multiple issues in parallel? (enables worktrees)"*
- Still defaults to `false` — user must confirm.

**Worktree adoption checklist** (for documentation):
1. ✅ Verify your filesystem supports junctions/symlinks (most modern filesystems do)
2. ✅ Add `worktrees: true` to `squad.config.ts` or `.squad/config.json`
3. ✅ Test with a single agent spawn: `"Flight, create issue #42 branch"`
4. ✅ Verify worktree was created in `{repo-parent}/{repo-name}-{issue}`
5. ✅ Verify dependencies are available (junction created or install ran)
6. ✅ Once confirmed, scale to parallel agent work

#### Implementation Strategy for #528, #529, #530

**Issue #528: Worktree variant in ralph-commands.ts**

Add worktree commands to all 3 adapters:

```typescript
export interface RalphCommands {
  // ... existing fields
  createWorktree?: string;  // Optional — only present when worktrees enabled
  removeWorktree?: string;  // Optional — cleanup after PR merge
}
```

**GitHub adapter (worktrees enabled):**
```typescript
createWorktree: 'git worktree add {path} -b {branch} {base}',
removeWorktree: 'git worktree remove {path} && git worktree prune',
```

**Azure DevOps adapter (same commands):**
```typescript
createWorktree: 'git worktree add {path} -b {branch} {base}',
removeWorktree: 'git worktree remove {path} && git worktree prune',
```

**Planner adapter (same commands):**
```typescript
createWorktree: 'git worktree add {path} -b {branch} {base}',
removeWorktree: 'git worktree remove {path} && git worktree prune',
```

**When worktrees are disabled:** `createWorktree` and `removeWorktree` are undefined. The coordinator falls back to `createBranch` (existing `git checkout -b` flow).

**Issue #529: Coordinator pre-spawn worktree creation**

Update `.squad-templates/squad.agent.md` spawn flow:

1. **Read config:** Check `worktrees` flag from config (precedence: env var > squad.config.ts > .squad/config.json > default false)
2. **If worktrees enabled:**
   - Resolve worktree path using the pattern from config (or default)
   - Run `createWorktree` command from ralph-commands
   - Attempt dependency junction/symlink (fall back to install on failure)
   - Pass `WORKTREE_PATH: {path}` in spawn prompt
   - Tell agent: *"You are in worktree {path} on branch {branch}. Do NOT run git checkout."*
3. **If worktrees disabled:** Use existing `git checkout -b` flow (no changes)

**Issue #530: Post-merge worktree cleanup**

After PR merge (detected by Ralph or coordinator):
1. Run `removeWorktree` command from ralph-commands
2. Log cleanup to `.squad/orchestration-log/`
3. If worktree removal fails (agent still has files open, etc.), log warning and defer cleanup to next idle cycle

**Ralph integration:** Ralph's idle-watch could detect merged PRs and trigger cleanup asynchronously.

#### Alternatives Considered

**❌ Heuristic-based (parallel spawn detection):**
- Problem: Heuristics are brittle. What counts as "parallel"? Two agents? Three? What if one agent is short-lived?
- Result: Unpredictable behavior. Users can't reason about when worktrees will be used.

**❌ Always-on worktrees:**
- Problem: Breaking change for existing users. Requires all environments to support junctions/symlinks and dependency management.
- Result: Poor migration path. Users without worktree-friendly environments (CI, containers) would be forced to opt-out.

**❌ Per-agent worktree flag:**
- Problem: Configuration explosion. Each agent spawn would need a worktree decision.
- Result: Users have to think about worktrees on every spawn. Cognitive overhead.

**✅ Opt-in configuration (chosen):**
- Benefit: Backward compatible. Users adopt when ready. Single configuration decision applies to all spawns.
- Tradeoff: Users must explicitly enable. But this is appropriate — worktrees are a team-level workflow decision.

#### Tradeoffs

**Worktrees enabled:**
- ✅ True parallel work — no working directory conflicts
- ✅ Multiple agents on different issues can work simultaneously
- ✅ Branch isolation — each agent has a clean working directory
- ❌ Requires dependency management (junctions or installs)
- ❌ More disk I/O (separate working directories)
- ❌ Users must understand worktree conventions (where is the worktree?)

**Worktrees disabled (default):**
- ✅ Zero configuration — works everywhere
- ✅ Familiar git workflow (checkout branches in place)
- ✅ Shared dependencies — no junctions or extra installs
- ❌ Parallel work causes conflicts (agents clobber each other's working directory)
- ❌ Sequential work only (or manual worktree management by user)

#### Implications for #528, #529, #530

**#528 (ralph-commands.ts):**
- Add `createWorktree` and `removeWorktree` commands to all 3 adapters
- Commands are optional (only present when worktrees enabled)
- No breaking changes to existing `createBranch` command

**#529 (coordinator pre-spawn):**
- Read worktree config at session start (cache for duration of session)
- Branch on config: worktrees enabled → `createWorktree`, worktrees disabled → `createBranch`
- Pass `WORKTREE_PATH` in spawn prompt when worktrees enabled
- Handle dependency management (junction/symlink or install fallback)

**#530 (post-merge cleanup):**
- Trigger `removeWorktree` after PR merge (via Ralph idle-watch or coordinator merge detection)
- Log cleanup to orchestration log
- Graceful failure handling (warn if removal fails, defer to next idle cycle)

**Shared implementation detail:**
- All three issues share the worktree path resolution logic (pattern-based, configurable)
- All three issues share the config reading logic (precedence: env var > squad.config.ts > .squad/config.json > default)
- EECOM owns #528, but the config schema belongs in the SDK (shared across all components)

#### Documentation Updates Required

1. **`docs/src/content/docs/features/worktrees.md`:**
   - Update to reflect opt-in configuration (not automatic)
   - Add configuration examples (squad.config.ts, .squad/config.json, env var)
   - Add dependency management section (junctions, install fallback)
   - Add troubleshooting section (junction failures, disk space, cleanup)

2. **`docs/src/content/docs/concepts/parallel-work.md`:**
   - Mention worktrees as the recommended approach for parallel work
   - Link to worktrees feature guide
   - Clarify that worktrees are optional (default is sequential with checkout -b)

3. **`.squad-templates/squad.agent.md`:**
   - Add worktree configuration reading to session start
   - Add worktree path resolution logic
   - Add `WORKTREE_PATH` to spawn prompt template
   - Update "Worktree Awareness" section to reflect coordinator-driven creation

4. **`.squad/skills/git-workflow/SKILL.md` (if it exists):**
   - Make worktree workflow the primary recommendation for parallel work
   - Keep `git checkout -b` as the fallback (worktrees disabled)

#### Config Schema (for SDK)

Add to `packages/squad-sdk/src/types/config.ts`:

```typescript
export interface TeamConfig {
  name: string;
  // ... existing fields
  
  /** Enable worktree mode for parallel agent work. Default: false */
  worktrees?: boolean;
  
  /** Worktree path pattern. Default: "{repo-parent}/{repo-name}-{issue}" */
  worktreePath?: string;
}
```

Validation:
- `worktrees` must be boolean or undefined (coerce truthy/falsy if needed)
- `worktreePath` must be a string containing at least `{issue}` or `{branch}` placeholder (ensure unique paths per agent)

Env var override:
- `SQUAD_WORKTREES=1` → `worktrees: true`
- `SQUAD_WORKTREES=0` → `worktrees: false`
- Any other value → ignore, use config file

#### Summary

This decision establishes **opt-in worktrees** as the architecture for parallel agent work in Squad. The default remains `git checkout -b` (backward compatible), but teams can enable `worktrees: true` in their config for true parallel isolation. This unblocks #528 (SDK commands), #529 (coordinator spawn flow), and #530 (cleanup lifecycle) with a clear, unified design.

**Next steps:**
1. EECOM implements #528 (add worktree commands to ralph-commands.ts)
2. Flight or EECOM implements #529 (coordinator reads config, creates worktrees before spawn)
3. Flight or EECOM implements #530 (post-merge cleanup via Ralph or coordinator)
4. PAO updates documentation (worktrees.md, parallel-work.md, squad.agent.md)

**Decision approved by:** Flight (as architect + owner of #531)
