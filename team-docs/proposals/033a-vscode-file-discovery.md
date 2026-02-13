# Proposal 033a: VS Code File Discovery and `.ai-team/` Access

**Author:** Strausz (VS Code Extension Expert)
**Date:** 2026-02-15
**Issue:** #33 — VS Code: Test agent file discovery and .ai-team/ access
**Status:** Complete
**Related:** #10 (Copilot client parity), #32 (runSubagent API research)

---

## Executive Summary

VS Code Copilot discovers `squad.agent.md` via the `.github/agents/` directory — this is automatic, workspace-scoped, and requires zero configuration. File system access for agents (read and write to `.ai-team/`) works through VS Code's built-in tools (`readFile`, `editFiles`, `createFile`, `listDirectory`, `fileSearch`), which are workspace-scoped by default. Sub-agents spawned via `runSubagent` inherit the parent's tools, meaning they get the same file system access as the coordinator.

**Bottom line:** Squad's file discovery and `.ai-team/` access model works in VS Code with minimal adaptation. The primary differences from CLI are: (1) different tool names for the same operations, (2) workspace-scoped access boundary instead of CWD-based, and (3) path resolution uses the workspace root rather than `git rev-parse --show-toplevel`. None of these are blockers.

---

## 1. Agent Discovery: How VS Code Finds `squad.agent.md`

### Auto-Discovery Behavior

VS Code scans **`.github/agents/`** at the workspace root on workspace load. Any file with the `.agent.md` extension in that directory is parsed and registered as a custom agent available in the Copilot Chat agents dropdown.

| Aspect | Behavior |
|--------|----------|
| **Scan trigger** | Workspace open/reload |
| **Location** | `.github/agents/*.agent.md` (workspace-level) |
| **Naming** | File name becomes agent name unless `name` field is in frontmatter |
| **Scope** | Workspace-only — not visible in other workspaces |
| **Override** | Workspace agents override user-profile agents with the same name |
| **User-level** | User profile directory agents are available in ALL workspaces |
| **Organization-level** | GitHub org-level agents auto-discovered if account has access |
| **Claude compat** | VS Code also detects `.md` files in `.claude/agents/` using Claude sub-agents format |

### What This Means for Squad

Squad already places `squad.agent.md` in `.github/agents/` — this is the correct location. VS Code discovers it automatically. No code changes needed.

Additional custom agents for sub-roles (e.g., `squad-worker.agent.md`, `squad-explorer.agent.md`) would also be auto-discovered if placed in `.github/agents/`. This is relevant for the Phase 2 custom agent files recommended in proposal 032a.

### Edge Cases

- **Multi-root workspaces:** VS Code scans `.github/agents/` in each workspace root. If multiple roots contain `squad.agent.md`, workspace-level priority applies. Known bugs exist where `copilot-instructions.md` fails in multi-root scenarios (vscode#264837) — Squad should document "use single-root workspace" as the supported configuration for now.
- **`.code-workspace` files:** Custom agents defined in individual roots are available. The `.github/agents/` directory must be at the root of a workspace folder, not nested.
- **File watchers:** VS Code watches the `.github/agents/` directory for changes. Adding or modifying `squad.agent.md` while the workspace is open triggers a rescan — no restart required.

---

## 2. Tool Inheritance: Do Sub-Agents Get File System Access?

### VS Code Built-In File Tools

VS Code provides these built-in tools for file operations (vs CLI equivalents):

| VS Code Tool | CLI Equivalent | Operation |
|---|---|---|
| `readFile` | `view` | Read file contents |
| `editFiles` | `edit` | Modify existing files |
| `createFile` | `create` | Create new files |
| `createDirectory` | (mkdir via shell) | Create directories |
| `listDirectory` | `view` (on dir) | List directory contents |
| `fileSearch` | `glob` | Find files by pattern |
| `codebase` | `grep` (semantic) | Search code semantically |
| `searchResults` | `grep` (literal) | Text search results |
| `runInTerminal` | `powershell` | Run shell commands |
| `terminalLastCommand` | (shell output) | Get terminal output |
| `fetch` | `web_fetch` | Fetch web content |

### Sub-Agent Inheritance

**By default, sub-agents inherit the parent agent's model AND tools.** This is explicitly documented in VS Code's subagent documentation:

> "By default, subagents use the same model and tools as the main chat session but start with a clean context window."

This means:
- ✅ Sub-agents CAN read `.ai-team/` files via `readFile`
- ✅ Sub-agents CAN write to `.ai-team/decisions/inbox/` via `createFile`/`editFiles`
- ✅ Sub-agents CAN search the codebase via `fileSearch`/`codebase`
- ✅ Sub-agents CAN run git commands via `runInTerminal`
- ✅ MCP tools from the parent session are also inherited

### Custom Agent Tool Restrictions

When using custom agents as sub-agents, tool access can be explicitly scoped:

```yaml
---
name: Squad Explorer
tools: ['readFile', 'fileSearch', 'codebase', 'listDirectory']
user-invokable: false
---
```

This restricts the explorer to read-only operations — no `editFiles`, no `createFile`, no `runInTerminal`. This maps to the CLI's `agent_type: "explore"` restriction pattern.

### Impact on Squad

This is a **net positive** compared to CLI behavior. On CLI, sub-agents spawned via `task` do NOT inherit MCP tools — they get a fixed toolset per `agent_type`. On VS Code, sub-agents get everything by default, with the option to restrict via custom agent definitions. Squad agents that need to read `.ai-team/` files (which is all of them) will have access without any special configuration.

---

## 3. Path Resolution: Workspace Root vs `git rev-parse`

### How VS Code Resolves Paths

VS Code's file tools resolve paths relative to the **workspace root** — the folder you opened in VS Code. This is different from the CLI, where paths resolve relative to CWD, and Squad uses `git rev-parse --show-toplevel` to find the repo root.

| Aspect | CLI Behavior | VS Code Behavior |
|---|---|---|
| **Path anchor** | CWD or `git rev-parse --show-toplevel` | Workspace root (folder opened in VS Code) |
| **Relative paths** | Relative to CWD | Relative to workspace root |
| **Absolute paths** | Supported | Supported (but workspace-scoped) |
| **Detection command** | `git rev-parse --show-toplevel` | Not needed — workspace root IS the project root |
| **Worktree support** | `git worktree list --porcelain` → resolve main checkout | Workspace root = whatever folder you opened |

### Worktree Interaction

Squad's Worktree Awareness section in `squad.agent.md` uses `git rev-parse --show-toplevel` to find the team root. In VS Code:

- If you open the **worktree directory** in VS Code → workspace root = worktree root → `git rev-parse --show-toplevel` returns the worktree root. Behavior matches CLI.
- If you open the **main checkout** in VS Code → workspace root = main checkout root → behavior matches CLI.
- If you use a multi-root workspace with multiple worktrees → each root is independent. Agent operates in the workspace root context of the active file.

**Key insight:** The worktree resolution algorithm in `squad.agent.md` still works correctly in VS Code because `git rev-parse --show-toplevel` is available via `runInTerminal`. The workspace root and the git toplevel will typically be the same directory. No changes needed.

### Multi-Root Workspace Caveats

In multi-root workspaces, path resolution becomes ambiguous:
- Relative paths like `.ai-team/team.md` could resolve to any root
- VS Code attempts to resolve to the "correct" root but may guess wrong
- Known bug: `grep_search` with `includePattern` silently fails in multi-root (vscode#293428)

**Recommendation:** Squad should document single-root workspaces as the supported configuration. Multi-root is a future enhancement (v0.5.0+).

---

## 4. Read/Write Access: `.ai-team/` File Operations

### Read Access

All `.ai-team/` files are readable via VS Code's built-in tools:

| File | Tool | Behavior |
|---|---|---|
| `.ai-team/team.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/agents/{name}/charter.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/agents/{name}/history.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/decisions.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/routing.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/skills/{name}/SKILL.md` | `readFile` | ✅ Works — standard file read |
| `.ai-team/casting/registry.json` | `readFile` | ✅ Works — standard file read |
| `.ai-team/orchestration-log/*.md` | `listDirectory` + `readFile` | ✅ Works — list then read |

**Parallel reads:** Squad's instruction to "Read `.ai-team/team.md`, `.ai-team/routing.md`, and `.ai-team/casting/registry.json` as parallel tool calls in a single turn" works in VS Code — the agent can invoke multiple `readFile` calls in one turn.

### Write Access

All `.ai-team/` file writes are supported:

| Operation | Tool | Behavior |
|---|---|---|
| Create decision inbox file | `createFile` | ✅ Works — creates new file at path |
| Append to history.md | `editFiles` | ✅ Works — modifies existing file |
| Update decisions.md (Scribe merge) | `editFiles` | ✅ Works — modifies existing file |
| Create orchestration log | `createFile` | ✅ Works — creates new file |
| Create new skill SKILL.md | `createFile` + `createDirectory` | ✅ Works — may need dir creation first |
| Update SKILL.md | `editFiles` | ✅ Works — modifies existing file |
| Create casting files | `createFile` | ✅ Works — creates new files |

### Tool Approval Friction

VS Code requires **user approval** for potentially destructive tool actions. This means:
- First-time `editFiles` or `createFile` calls will prompt the user for approval
- Users can approve for the session or permanently per-workspace
- This approval step does NOT exist in CLI (CLI agents have unrestricted file access)

**Impact on Squad:** Moderate UX friction during first session. Users will see approval prompts for each new tool type the first time Squad writes files. After one approval, subsequent writes are automatic. This is a VS Code security feature, not a Squad-specific issue.

**Recommendation:** Document in Squad's VS Code guide: "On first use, VS Code will ask you to approve file modifications. Select 'Always allow in this workspace' for the best experience."

---

## 5. Permission/Sandbox Constraints

### Workspace Trust Model

VS Code's Workspace Trust model affects agent capabilities:

| Trust Level | File Read | File Write | Terminal | Impact on Squad |
|---|---|---|---|---|
| **Trusted workspace** | ✅ | ✅ | ✅ | Full functionality |
| **Untrusted workspace** | ⚠️ Limited | ❌ Blocked | ❌ Blocked | Squad non-functional — needs trust |
| **Restricted mode** | ⚠️ Limited | ❌ Blocked | ❌ Blocked | Squad non-functional — needs trust |

**Recommendation:** Squad requires a trusted workspace. This should be documented as a prerequisite.

### Access Boundary

| Constraint | CLI | VS Code |
|---|---|---|
| **Read scope** | Entire filesystem | Workspace directory only |
| **Write scope** | Entire filesystem | Workspace directory only |
| **Out-of-workspace access** | Allowed | Blocked by default |
| **Terminal scope** | Full shell access | Terminal within workspace context |
| **Git operations** | Unrestricted | Same as terminal (workspace-scoped) |

The workspace boundary is the key security difference. CLI agents can theoretically read/write anywhere on the filesystem. VS Code agents are sandboxed to the workspace. For Squad, this is fine — all `.ai-team/` files live within the workspace root.

### DevContainer Isolation

For maximum security, VS Code supports running in a devcontainer. Squad would work normally inside a devcontainer as long as the workspace includes the repo root with `.ai-team/` and `.github/agents/`.

### Known VS Code Bugs

- **Silent success on file edits (vscode#253561):** VS Code Copilot has documented bugs where `editFiles` falsely reports success when no changes were made. This mirrors Squad's P0 Silent Success Bug (Proposal 015). Recommendation: keep the Response Order workaround in spawn prompts for VS Code until empirically verified unnecessary.
- **File access loss (community#162682):** Some users report intermittent loss of file editing capability. This is a VS Code/Copilot extension bug, not a Squad issue.

---

## 6. Tool Name Mapping: CLI ↔ VS Code

Squad's `squad.agent.md` references tool names in its platform detection logic. The complete mapping:

| Operation | CLI Tool Name | VS Code Tool Name | Notes |
|---|---|---|---|
| Read file | `view` | `readFile` | Same semantics |
| Edit file | `edit` | `editFiles` | VS Code batches edits differently |
| Create file | `create` | `createFile` | Same semantics |
| Search files by name | `glob` | `fileSearch` | Same semantics |
| Search file contents | `grep` | `codebase` / `searchResults` | VS Code has semantic + literal search |
| List directory | `view` (on dir) | `listDirectory` | Same semantics |
| Run shell command | `powershell` | `runInTerminal` | Terminal vs shell semantics |
| Web fetch | `web_fetch` | `fetch` | Same semantics, VS Code has URL approval |
| Spawn sub-agent | `task` | `runSubagent` | Major architectural difference (see 032a) |
| SQL database | `sql` | N/A | CLI-only — no VS Code equivalent |
| GitHub MCP tools | `github-mcp-server-*` | Depends on MCP config | May or may not be available |

### Detection Signal

The platform detection strategy from proposal 032a remains correct:
- `task` tool available → CLI mode
- `runSubagent` or `agent` tool available → VS Code mode
- File tools like `readFile` vs `view` are secondary confirmation signals

---

## 7. Recommendations for `squad.agent.md`

### 7.1 No Changes Needed for File Discovery

The current `.github/agents/squad.agent.md` location is correct for both CLI and VS Code. Auto-discovery works out of the box.

### 7.2 Worktree Resolution Works As-Is

The `git rev-parse --show-toplevel` algorithm in the Worktree Awareness section works in VS Code via `runInTerminal`. The workspace root and git toplevel will typically align. No changes needed.

### 7.3 File Read/Write Instructions Work As-Is

Squad's instructions to "read `.ai-team/team.md`" and "write to `.ai-team/decisions/inbox/`" work on both platforms because:
- CLI tools (`view`, `edit`, `create`) accept the same relative paths
- VS Code tools (`readFile`, `editFiles`, `createFile`) accept the same relative paths
- The agent is intelligent enough to use whichever tool is available for the operation

The coordinator and spawned agents don't hardcode tool names in their file I/O instructions — they describe the operation ("read this file", "create this file"), and the platform provides the appropriate tool. This is the correct abstraction.

### 7.4 Consider Adding VS Code-Specific Notes

Add a brief VS Code awareness section to `squad.agent.md`:

```markdown
### VS Code Compatibility

When running in VS Code (detected by `runSubagent` tool availability):
- File tools are workspace-scoped. All `.ai-team/` paths resolve relative to workspace root.
- Sub-agents inherit file tools by default — no special configuration needed.
- First-session file writes may require user approval (VS Code security feature).
- The `sql` tool is not available. Avoid SQL-dependent workflows.
- Skip launch table acknowledgment — sub-agents are synchronous, results arrive with response.
```

This is a small addition and is **not blocking** — Squad already works in VS Code for file operations because the instructions are operation-oriented, not tool-name-specific.

### 7.5 Multi-Root Workspace Guidance (Documentation Only)

Document in troubleshooting guide:
- "Squad requires a single-root workspace in VS Code. Multi-root workspaces may cause path resolution issues."
- "Open the repository root folder directly in VS Code, not a parent directory or multi-root workspace."

---

## 8. Summary of Findings

| Question | Answer | Impact |
|---|---|---|
| Does VS Code find `squad.agent.md`? | ✅ Yes — auto-discovered from `.github/agents/` | None — works out of the box |
| Can agents read `.ai-team/` files? | ✅ Yes — via `readFile` tool | None — works out of the box |
| Can agents write `.ai-team/` files? | ✅ Yes — via `editFiles`/`createFile` | Minor — first-session approval prompt |
| Do sub-agents inherit file tools? | ✅ Yes — default inheritance | None — better than CLI (more tools available) |
| Does path resolution work? | ✅ Yes — workspace root ≈ git toplevel | None — worktree algorithm still valid |
| Are there permission constraints? | ⚠️ Workspace trust required, approval prompts | Minor — document as prerequisite |
| Multi-root workspace support? | ⚠️ Known bugs, not recommended | Document as unsupported for now |
| Does `sql` tool exist? | ❌ No — CLI-only | Minor — avoid SQL in VS Code codepaths |

### Overall Assessment

**Squad's file discovery and `.ai-team/` access work in VS Code with zero code changes.** The instruction-level abstraction in `squad.agent.md` (describing operations, not tool names) is the right pattern — it naturally works across both surfaces. The only adaptation needed is a small VS Code compatibility note in `squad.agent.md` (recommended but not blocking) and documentation updates for troubleshooting.

---

## Sources

- [VS Code Docs: Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Docs: Subagents](https://code.visualstudio.com/docs/copilot/agents/subagents)
- [VS Code Docs: Agent Tools Reference](https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features#_chat-tools)
- [VS Code Docs: Agent Tools](https://code.visualstudio.com/docs/copilot/agents/agent-tools)
- [VS Code Docs: Security](https://code.visualstudio.com/docs/copilot/security)
- [VS Code Issue #264837: copilot-instructions.md in multi-root workspace](https://github.com/microsoft/vscode/issues/264837)
- [VS Code Issue #293428: grep_search in multi-root](https://github.com/microsoft/vscode/issues/293428)
- [VS Code Issue #253561: Copilot agent file access](https://github.com/microsoft/vscode/issues/253561)
- [VS Code Issue #278835: runSubagent inherits tool definitions](https://github.com/microsoft/vscode/issues/278835)
- [GitHub Docs: Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- Squad Proposal 032a: runSubagent API Research
- Squad Proposal 032b: CLI Spawn Parity Analysis
