# Plugin security model

> ⚠️ **Experimental** — This model describes the MVP plugin gate. Any future relaxation requires an RFC and explicit security review.

The plugin MVP is designed for reusable Squad knowledge and configuration, not executable extensions. A plugin is a declarative manifest plus static files. Squad may copy those files into `.squad/`, record lock data, and mark roles active, but it must not execute plugin-supplied content.

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
| Network egress from plugin-supplied content | MVP plugin lifecycle commands do not execute plugin content, so plugin content cannot initiate network calls. |

---

## Red lines

The following must remain unreachable from `validate`, `dry-run`, `install`, `enable`, `disable`, `switch`, `verify`, and `uninstall`:

1. Evaluating plugin-supplied content.
2. Spawning a child process from plugin-supplied content.
3. Writing outside declared component paths under `.squad/`.
4. Initiating network egress from plugin-supplied content.
5. Treating arbitrary capability strings as trusted runtime roles.

---

## Audit and rollback

Installs are rollback-protected: if file copy or state writing fails, copied files are removed and previous plugin state is restored. Lifecycle events are written to `.squad/plugins/audit.jsonl` as JSON Lines so reviewers and tools can inspect what happened without parsing console output.

---

## Reviewer checklist

Before merging plugin lifecycle changes:

1. Run the focused plugin tests.
2. Run the full test suite.
3. Confirm new manifest fields remain declarative metadata.
4. Confirm no plugin-supplied string reaches `eval`, `Function`, dynamic `import`, `child_process`, or shell execution.
5. Confirm all file writes are based on validated manifest targets and use safe path joins.
