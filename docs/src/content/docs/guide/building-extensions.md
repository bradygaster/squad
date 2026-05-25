# Building extensions

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

You've decided your idea is a Squad Extension (Layer 2). Now package it so another team can install it, enable it, and give their agents better context in five minutes.

---

## What is an extension?

An extension is a reusable collection of Squad agents, knowledge, workflows, ceremonies, memory guidance, provider contracts, generated artifacts, and directives that any team can install. It lives outside Squad core, packaged as a GitHub repository or marketplace plugin. Extensions let you codify workflows, domain expertise, memory lenses, knowledge graphs, or testing ceremonies that other teams benefit from.

If your extension needs a Copilot plugin, declare it as a dependency in the manifest. If it points to an external CLI, package, or MCP server, record that in `repository`, `upstream`, or `mcp` metadata. If it uses an approved built-in provider such as Graphify, `squad plugin refresh` can generate artifacts for agents to consume. Squad does not install external packages, run plugin-supplied commands, start MCP servers, or manage Copilot plugins.

---

## Extension structure

```
my-extension/
├── plugin.manifest.json
├── knowledge/
│   └── example-guidance.md
├── workflows/
│   └── review-workflow.md
├── ceremonies/
│   └── CEREMONY.md
└── README.md
```

---

## Build one

**Step 1: Create a repo**

```bash
mkdir my-extension
cd my-extension
git init
```

**Step 2: Add knowledge**

Create `knowledge/example-guidance.md`:

```markdown
# Example Guidance

**When to use:** You need to do X.

## Context

Brief problem statement.

## Steps

1. Do the first thing
2. Do the second thing
3. Done
```

**Step 3 (optional): Add a ceremony**

Create `ceremonies/code-review.md` following Squad ceremony format (decision gate, verdicts, escalation).

**Step 4: Add a manifest**

Create `plugin.manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Reusable workflow patterns for my team.",
  "authors": ["Your Team"],
  "license": "MIT",
  "squad": ">=0.9.1",
  "components": {
    "knowledge": ["example-guidance"],
    "workflows": ["review-workflow"]
  },
  "copilot": {
    "requires": [
      {
        "id": "github/copilot-plugin-example",
        "version": ">=1.0.0",
        "optional": true,
        "reason": "Used by Copilot when installed separately."
      }
    ]
  },
  "repository": {
    "type": "github",
    "url": "https://github.com/example/my-extension"
  },
  "upstream": {
    "package": "example-tool",
    "registry": "pypi",
    "installCommand": "pip install example-tool",
    "docs": "https://github.com/example/my-extension"
  },
  "files": [
    {
      "source": "knowledge/example-guidance.md",
      "target": "knowledge/example-guidance.md",
      "type": "knowledge"
    }
  ]
}
```

The MVP manifest is declarative. Do not add scripts, commands, lifecycle hooks, or executable files.

**Step 5: Validate and dry-run**

```bash
squad plugin validate .
squad plugin dry-run .
```

Dry-run prints the exact files Squad would write without changing `.squad/`.

**Step 6: Install and enable locally**

```bash
squad plugin install .
squad plugin enable my-extension
squad plugin list --json
```

Install records the plugin disabled by default. Enable activates the roles declared in `components`.
Copilot dependencies are surfaced to the user but must be installed through Copilot's own plugin flow. External package and MCP metadata is surfaced as install guidance only.

**Step 7: Write the README**

Explain the problem, installation, and usage:

```markdown
# My Extension

Codifies client-delivery workflows for consulting teams.

## Install

squad plugin install .
squad plugin enable my-extension

## What's Inside

- **discovery-interview** skill — clarify requirements
- **evidence-bundler** knowledge — collect test results
- **plan-review** ceremony — gate for approval
```

**Step 8: Test locally**

Run `squad plugin verify`, then run `squad plugin refresh <plugin-id>` if your plugin declares an approved built-in provider. Load your Squad session and verify the installed Squad knowledge, workflows, and generated artifacts appear and work as expected. If you declared Copilot dependencies, verify those are installed separately through Copilot.

---

## Share it

Push to GitHub:

```bash
git add .
git commit -m "Initial extension: my-extension"
git push
```

Register with a marketplace or pin directly by repository URL:

```
squad plugin marketplace add github/my-org/my-team-plugins
```

---

## Real examples

- **Client-delivery workflow** ([RFC #328](https://github.com/bradygaster/squad/issues/328)) — discovery, research, multi-round review with evidence gates
- **Azure infrastructure patterns** — VM provisioning, Cosmos DB design, monitoring rules
- **Knowledge libraries** — document structured analysis, reference synthesis
- **External integration samples** — see `samples/plugin-knowledge-graphify` for the real Graphify knowledge graph tool, `samples/plugin-knowledge-index-server` for the real Index Server instruction/knowledge MCP server, and `samples/plugin-memory-mempalace` for the real MemPalace memory CLI/MCP system

---

## Related docs

- [Extensibility guide](./extensibility.md#decision-tree) — Where does your idea belong? (decision tree)
- [Plugin Marketplace](../features/plugins.md) — How teams discover and install your extension
- [Skills](../features/skills.md) — Existing Squad skills concepts; plugin manifests should use `knowledge` unless they are declaring a Copilot dependency
- [Ceremonies](../features/ceremonies.md) — How to define decision gates and review rituals

---

**Ready to share?** [Open a discussion](https://github.com/bradygaster/squad/discussions) in the Squad community.
