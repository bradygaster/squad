# Plugin Marketplace Guide

Plugins package reusable Squad capabilities: agents, knowledge packs, workflows, ceremonies, memory providers, routing guidance, decisions, hook metadata, adapter metadata, typed provider contracts, and generated knowledge artifacts.

The everyday flow is simple:

```bash
squad plugin install ./my-plugin
squad plugin enable my-plugin
squad plugin refresh my-plugin
```

After that, the plugin's static files are installed under `.squad/` and its roles are active. Agents spawned through the SDK's `AgentLifecycleManager` receive the enabled plugin context automatically. Agents spawned by the Squad coordinator (in GitHub Copilot or another supported host) or by the Squad interactive shell (`squad` with no arguments) do not yet; see [Runtime behavior](#runtime-behavior). For a knowledge plugin such as Graphify, refresh can generate approved artifacts under `.squad/knowledge/graphify/` that give agents a relationship map across code, docs, and decisions when they read them.

The MVP is declarative-first with a narrow governed runtime for Squad-owned built-in providers. Squad records hook, adapter, and provider metadata, and approved providers can generate static artifacts. It does not execute plugin-supplied code.

Squad plugins do not replace Copilot plugins or Copilot skills. If a Squad plugin depends on Copilot-owned extensibility, declare that under `copilot.requires`; Squad records and surfaces the dependency, but it does not install it or run Copilot plugin commands.

---

## Plugin lifecycle

Install, activation, and artifact refresh are separate steps.

1. `squad plugin validate <local-plugin-dir>` checks the manifest and prints structured validation errors.
2. `squad plugin dry-run <local-plugin-dir>` prints the files that would be written without changing `.squad/`.
3. `squad plugin install <local-plugin-dir>` copies declared static files, records hashes in `.squad/plugins/lock.json`, and leaves the plugin disabled.
4. `squad plugin enable <plugin-id>` activates the plugin roles declared in its manifest.
5. `squad plugin switch <role> <plugin-id>` makes an enabled plugin active for a role such as `memory` or `knowledge`.
6. `squad plugin refresh <plugin-id>` refreshes approved generated artifacts for built-in providers such as Graphify.
7. `squad plugin disable <plugin-id>` deactivates a plugin without deleting installed files.
8. `squad plugin uninstall <plugin-id>` removes files recorded in the lock and clears the registration.

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
squad plugin refresh my-plugin
squad plugin run-lifecycle my-plugin onMemoryRefresh
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
    "knowledge": ["demo-plugin"],
    "memory": { "provider": "demo-memory" }
  },
  "copilot": {
    "requires": [
      {
        "id": "github/copilot-plugin-example",
        "version": ">=1.0.0",
        "optional": true,
        "reason": "Enables Copilot-owned commands when the user has installed it."
      }
    ]
  },
  "repository": {
    "type": "github",
    "url": "https://github.com/example/demo-plugin"
  },
  "upstream": {
    "package": "demo-tool",
    "registry": "pypi",
    "installCommand": "pip install demo-tool",
    "docs": "https://github.com/example/demo-plugin"
  },
  "mcp": {
    "available": true,
    "server": "demo-tool",
    "entryPoint": "demo-tool-mcp",
    "installCommand": "demo-tool-mcp",
    "reason": "Optional external MCP server users may configure separately."
  },
  "providers": [
    {
      "id": "demo-memory",
      "type": "memory",
      "mode": "read-write",
      "protocol": "mcp",
      "description": "Declarative memory provider contract.",
      "artifact": "memory/providers/demo-memory.md",
      "mcp": {
        "server": "demo-tool",
        "tool": "query-memory",
        "capability": "durable-memory"
      },
      "capabilities": ["durable-memory", "context-recall"]
    }
  ],
  "files": [
    {
      "source": "guidance.md",
      "target": "knowledge/demo-plugin/guidance.md",
      "type": "knowledge"
    }
  ]
}
```

Supported Squad component keys are `agents`, `ceremonies`, `decisions`, `instructions`, `knowledge`, `memory`, `routing`, `templates`, `workflows`, `hooks`, and `adapters`. Capability roles are derived only from these declared components; arbitrary capability strings are not accepted.

Declared files must be relative paths under approved `.squad/` roots such as `agents/`, `knowledge/`, `memory/`, `routing/`, `decisions/`, `ceremonies/`, `prompts/`, `instructions/`, `templates/`, `workflows/`, or `plugins/`.

Copilot plugin dependencies are metadata only:

```json
{
  "copilot": {
    "requires": [
      {
        "id": "github/copilot-plugin-example",
        "version": ">=1.0.0",
        "optional": false,
        "reason": "Provides the Copilot-side command this Squad workflow references."
      }
    ]
  }
}
```

Squad validates and records these dependencies so users know what Copilot plugins to install separately. Squad does not fetch, install, execute, or manage Copilot plugins.

External integration metadata is also record-only. Fields such as `repository`, `upstream.installCommand`, and `mcp.installCommand` explain how a human can install external tools separately; Squad never runs those commands.

Provider contracts are the typed extension seam for memory and knowledge systems. A contract declares the provider `type` (`memory`, `knowledge`, `persistence`, `event`, or `policy`), access `mode` (`read`, `write`, or `read-write`), `protocol` (`static-artifact` or `mcp`), optional static artifact binding, optional MCP binding metadata, and capability labels. These fields describe a memory or knowledge provider to agents, on spawn paths that inject plugin context, without letting the plugin run code. During the MVP, provider contracts are prompt metadata only: Squad does not start MCP servers, call provider tools, query live memory backends, register a Squad memory provider, or install provider packages.

---

## Runtime behavior

Enabled plugins can affect spawned agents through their installed static artifacts and provider contracts, but only on spawn paths that inject plugin context. On those paths, Squad reads `.squad/plugins/runtime.json`, finds enabled active plugin roles, and appends the installed guidance/metadata files plus provider contract summaries to the agent system prompt under a `Plugin Context` section.

Today only one spawn path does this:

| How the agent is spawned | Plugin context injected? |
| --- | --- |
| Your own code calls the SDK's `AgentLifecycleManager.spawnAgent()` | Yes |
| Your own code uses another SDK spawn helper, such as `spawnParallel` or `SquadCoordinator` | No. These helpers do not read plugin state. |
| The Squad coordinator (`squad.agent.md`) in GitHub Copilot CLI, VS Code, or another supported host | No. The coordinator's spawn prompt does not read plugin state or plugin artifacts. |
| The Squad interactive shell (`squad` with no arguments) | No. Agent sessions receive the charter only. |
| `squad watch` | No. It runs `copilot -p` with a prompt built from Ralph's charter and the issue instructions. |
| `squad loop` | No. It runs `copilot -p` with the prompt in your `loop.md`. |

On the paths marked No, installed plugin files still sit under `.squad/`, but agents only see them if something points them there. For example, name the file in your request, or add a line such as "Read `.squad/knowledge/graphify/graphify-integration.md` before code relationship work" to the relevant agent charter or skill.

Where plugin context is injected, it is still declarative-first behavior: Squad consumes copied Markdown/metadata from `.squad/`, but it does not install upstream packages, start MCP servers, execute plugin-supplied commands, call provider tools, or query external tools during plugin install or agent spawn.

The MVP also includes a narrow governed runtime for Squad-owned built-in providers. `squad plugin refresh <plugin-id>` and `squad plugin run-lifecycle <plugin-id> <event>` can generate artifacts only when the provider name, lifecycle event, and output paths are allowlisted by Squad. The current approved provider is Graphify, which can refresh deterministic knowledge artifacts under `.squad/knowledge/graphify/`.

Disabled plugins do not contribute to the `Plugin Context` section, even if their files remain installed on disk.

---

## External integration examples

The repository includes local sample plugins that exercise external integration metadata without adding executable provider code:

| Example | Purpose |
| --- | --- |
| `samples/plugin-knowledge-graphify` | Knowledge graph profile for the real `safishamsi/graphify` project and PyPI package `graphifyy`. It declares a `knowledge` provider contract bound to a static artifact under `.squad/knowledge/graphify/`, and can refresh governed Graphify artifacts with `squad plugin refresh graphify-knowledge`. |
| `samples/plugin-knowledge-index-server` | Instruction and knowledge MCP profile for the real `jagilber-org/index-server` project and npm package `@jagilber-org/index-server`. It declares a metadata-only `knowledge` provider contract for the Index Server MCP catalog. |
| `samples/plugin-memory-mempalace` | Memory-palace-style provider profile for the real `MemPalace/mempalace` CLI and optional `mempalace-mcp` server. It declares a metadata-only `memory` provider contract for spatial memory. |

Graphify's Copilot support is a separately installed skill/integration, not a Squad memory provider or a Squad-managed Copilot plugin. Index Server is an MCP-governed instruction/knowledge catalog, not a memory provider, although it is adjacent because agents can persist validated knowledge across sessions and repositories. MemPalace is a real memory system, but Squad still does not install its package, start MCP, or configure assistant hooks. Installing the MemPalace sample does not give agents a memory: it adds no tools, is not wired into `squad memory` or the `memory.*` tools, and does not change your MCP configuration. To let agents use MemPalace, install it and add `mempalace-mcp` to your assistant's MCP configuration yourself.

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

## Guardrails

The product goal is simple pluggability: install, enable, refresh, and give agents better context. The guardrails keep that model predictable:

- No plugin scripts, commands, shell snippets, or executable files are allowed.
- Lifecycle hooks are limited to Squad-owned, capability-gated providers that generate static artifacts.
- No plugin content is evaluated or run by Squad.
- No Copilot plugin commands are run by Squad; `copilot.requires` is dependency metadata only.
- No external package install hints or MCP setup hints are run by Squad; `repository`, `upstream`, and `mcp` fields are metadata only.
- Hook and adapter declarations are metadata only.
- Provider contracts are metadata only; they do not authorize live provider calls.
- Plugin file writes are limited to declared relative targets under `.squad/`.
- Path traversal, absolute paths, symlinks, and script/executable extensions are rejected.
- Governed runtime artifacts are generated only by built-in approved providers and only under approved `.squad/` paths.

See [Plugin security model](../reference/plugin-security.md) for the threat model and the negative checks that gate this feature.

The follow-up roadmap tracks remote marketplace distribution, broader built-in providers, and the trusted executable-provider RFC in [#1102](https://github.com/bradygaster/squad/issues/1102), [#1103](https://github.com/bradygaster/squad/issues/1103), [#1104](https://github.com/bradygaster/squad/issues/1104), and [#1105](https://github.com/bradygaster/squad/issues/1105).

---

## See also

- [Building extensions](../guide/building-extensions.md) — how to author a local plugin.
- [Extensibility guide](../guide/extensibility.md) — how to decide whether an idea belongs in core, a plugin, or team config.
- [Skills System](./skills.md) — the existing Squad knowledge layer; plugin manifests should prefer `knowledge` for reusable guidance and use `copilot.requires` for Copilot-owned plugins.
