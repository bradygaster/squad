# Plugin Marketplace Guide

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Plugins package reusable Squad capabilities such as agents, skills, knowledge packs, memory providers, routing guidance, decisions, hook metadata, and adapter metadata. The MVP is intentionally conservative: plugins are declarative static-file bundles. Squad records hook and adapter metadata, but it does not execute plugin-supplied code.

---

## Plugin lifecycle

Install and activation are separate steps.

1. `squad plugin validate <local-plugin-dir>` checks the manifest and prints structured validation errors.
2. `squad plugin dry-run <local-plugin-dir>` prints the files that would be written without changing `.squad/`.
3. `squad plugin install <local-plugin-dir>` copies declared static files, records hashes in `.squad/plugins/lock.json`, and leaves the plugin disabled.
4. `squad plugin enable <plugin-id>` activates the plugin roles declared in its manifest.
5. `squad plugin switch <role> <plugin-id>` makes an enabled plugin active for a role such as `memory` or `knowledge`.
6. `squad plugin disable <plugin-id>` deactivates a plugin without deleting installed files.
7. `squad plugin uninstall <plugin-id>` removes files recorded in the lock and clears the registration.

Use `squad plugin list --json` when another tool needs stable machine-readable state.

---

## Local MVP commands

```bash
squad plugin validate ./my-plugin
squad plugin dry-run ./my-plugin
squad plugin install ./my-plugin
squad plugin list
squad plugin list --json
squad plugin enable my-plugin
squad plugin switch memory my-plugin
squad plugin disable my-plugin
squad plugin verify
squad plugin uninstall my-plugin
```

The current MVP supports local plugin directories. Marketplace registration still uses the existing commands:

```bash
squad plugin marketplace add github/awesome-copilot
squad plugin marketplace list
squad plugin marketplace browse awesome-copilot
squad plugin marketplace remove awesome-copilot
```

---

## Manifest format

The MVP manifest file is `plugin.manifest.json`. The validator also accepts legacy local names such as `squad-plugin.json` and `plugin.json` while the schema settles.

```json
{
  "id": "demo-plugin",
  "name": "Demo Plugin",
  "version": "1.0.0",
  "description": "A declarative test plugin.",
  "authors": ["Squad"],
  "license": "MIT",
  "squad": ">=0.9.1",
  "components": {
    "skills": ["demo-plugin"],
    "memory": { "provider": "demo-memory" }
  },
  "files": [
    {
      "source": "SKILL.md",
      "target": "skills/demo-plugin/SKILL.md",
      "type": "skill"
    }
  ]
}
```

Supported component keys are `agents`, `skills`, `knowledge`, `memory`, `routing`, `decisions`, `hooks`, and `adapters`. Capability roles are derived only from these declared components; arbitrary capability strings are not accepted.

Declared files must be relative paths under approved `.squad/` roots such as `agents/`, `skills/`, `knowledge/`, `memory/`, `routing/`, `decisions/`, `ceremonies/`, `prompts/`, `instructions/`, `templates/`, or `plugins/`.

---

## Runtime state

Squad stores plugin state under `.squad/plugins/`:

| File | Purpose |
| --- | --- |
| `installed.json` | Installed plugins, versions, enabled state, roles, source path, and deployed files. |
| `lock.json` | Manifest hash and per-file SHA-256 hashes for reproducibility and verification. |
| `runtime.json` | Active plugin bindings by role plus enabled runtime state. |
| `audit.jsonl` | JSON Lines lifecycle audit events for install, verify, enable, switch, disable, and uninstall. |

---

## Security posture

The MVP security gate is strict:

- No plugin scripts, commands, lifecycle hooks, shell snippets, or executable files are allowed.
- No plugin content is evaluated or run by Squad.
- Hook and adapter declarations are metadata only.
- Plugin file writes are limited to declared relative targets under `.squad/`.
- Path traversal, absolute paths, symlinks, and script/executable extensions are rejected.

See [Plugin security model](../reference/plugin-security.md) for the threat model and the negative checks that gate this feature.

---

## See also

- [Building extensions](../guide/building-extensions.md) — how to author a local plugin.
- [Extensibility guide](../guide/extensibility.md) — how to decide whether an idea belongs in core, a plugin, or team config.
- [Skills System](./skills.md) — how plugins encode reusable knowledge.
