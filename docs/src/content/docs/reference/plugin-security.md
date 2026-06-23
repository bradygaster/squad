# Plugin security model

The plugin MVP is designed for reusable Squad knowledge and configuration, not executable extensions and not a replacement for Copilot plugins. A plugin is a declarative manifest plus static files. Squad may copy those files into `.squad/`, record lock data, and mark roles active, but it must not execute plugin-supplied content.

Copilot plugin dependencies can be declared with `copilot.requires`. They are metadata only: Squad records and displays them so users know which Copilot plugins to install through Copilot's own lifecycle.

External packages, repositories, and MCP servers can be described with `repository`, `upstream`, and `mcp`. Typed provider contracts can be described with `providers`. They are also metadata only: Squad may display install hints and inject provider summaries into spawned-agent context, but it must not run package managers, start MCP servers, configure assistant clients, call provider tools, query live provider backends, or install assistant hooks.

---

## Threat model

| Threat | MVP mitigation |
| --- | --- |
| Malicious manifest declares scripts or lifecycle commands | The validator rejects executable keys such as `scripts`, `commands`, `command`, `exec`, `run`, `preinstall`, and `postinstall`, even when nested. |
| Malicious static file is actually executable code | The validator rejects executable/script extensions including `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.sh`, `.ps1`, `.bat`, `.cmd`, and `.exe`. |
| Manifest writes outside `.squad/` | Source and target paths must be relative and cannot contain traversal segments or absolute paths. |
| Source file escapes through symlink | Install rejects symlinked source files before writing plugin state. |
| Malicious lock file hides changed content | `squad plugin verify` recomputes SHA-256 hashes for installed files and fails on mismatch. |
| Hook or adapter metadata triggers execution | Hooks and adapters are recorded only as metadata; MVP commands never execute them. |
| Hidden capabilities are inferred from arbitrary strings | Runtime roles are derived only from declared component keys. |
| Squad plugin install silently installs Copilot plugins | `copilot.requires` is validated as dependency metadata only. Squad does not call Copilot plugin commands. |
| Squad plugin install silently installs external packages or starts MCP servers | `repository`, `upstream`, and `mcp` are validated as metadata only. Squad does not run install hints or MCP setup hints. |
| Provider contract triggers live memory or knowledge backend calls | `providers` is validated as declarative metadata only. Squad surfaces provider type, protocol, artifact, capabilities, and MCP binding hints without starting servers or calling tools. |
| Network egress from plugin-supplied content | MVP plugin lifecycle commands do not execute plugin content, so plugin content cannot initiate network calls. |
| Governed artifact generation executes arbitrary code | Artifact generation is strictly gated by provider allowlist, lifecycle event allowlist, and output path allowlist. Only built-in approved providers (currently Graphify) are whitelisted. Generated artifacts use only approved provider built-in operations. |

---

## Red lines

The following must remain unreachable from `validate`, `dry-run`, `install`, `enable`, `disable`, `switch`, `verify`, and `uninstall`:

1. Evaluating plugin-supplied content.
2. Spawning a child process from plugin-supplied content.
3. Writing outside declared component paths under `.squad/`.
4. Initiating network egress from plugin-supplied content.
5. Treating arbitrary capability strings as trusted runtime roles.
6. Running Copilot plugin commands from the Squad plugin lifecycle.
7. Running upstream package install hints or MCP setup hints from the Squad plugin lifecycle.
8. Calling live provider tools or querying external provider backends from plugin metadata.

Runtime artifact generation commands (`refresh`, `run-lifecycle`) add a new capability but preserve all red lines:

- **Still denied:** arbitrary provider execution, shell commands, package installs, network calls, MCP server startup, plugin-provided executable code, or modifications to plugin-supplied content.
- **Allowed under governance:** Built-in approved providers (Graphify) generating artifacts to approved output paths through designated lifecycle events only.

The next executable-provider roadmap is tracked in:

- [Epic #1102](https://github.com/bradygaster/squad/issues/1102)
- [Phase 1 marketplace distribution #1103](https://github.com/bradygaster/squad/issues/1103)
- [Phase 2 built-in providers #1104](https://github.com/bradygaster/squad/issues/1104)
- [Phase 3 executable runtime RFC #1105](https://github.com/bradygaster/squad/issues/1105)

---

## Audit and rollback

Installs are rollback-protected: if file copy or state writing fails, copied files are removed and previous plugin state is restored. Lifecycle events, including artifact generation, are written to `.squad/plugins/audit.jsonl` as JSON Lines so reviewers and tools can inspect what happened without parsing console output.

---

## Reviewer checklist

Before merging plugin lifecycle changes:

1. Run the focused plugin tests.
2. Run the full test suite.
3. Confirm new manifest fields remain declarative metadata.
4. Confirm no plugin-supplied string reaches `eval`, `Function`, dynamic `import`, `child_process`, Copilot plugin commands, or shell execution.
5. Confirm all file writes are based on validated manifest targets and use safe path joins.
6. For artifact generation changes:
   - Confirm new providers are added to the provider allowlist only after security review.
   - Confirm only designated lifecycle events can trigger artifact generation.
   - Confirm generated artifacts are restricted to approved `.squad/` paths.
   - Confirm provider implementation uses only built-in operations, no arbitrary code execution.
