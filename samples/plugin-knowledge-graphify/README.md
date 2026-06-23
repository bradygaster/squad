# Graphify Knowledge Graph Plugin Example

This is a local Squad plugin example for integrating with the real Graphify project: <https://github.com/safishamsi/graphify>.

Graphify is a code and documentation knowledge graph tool. It is not modeled here as a Squad memory provider or as a Copilot plugin.

It demonstrates:

- declaring the Squad `knowledge` component
- recording upstream package metadata for PyPI package `graphifyy`
- installing Graphify usage guidance under `.squad/knowledge/`
- keeping the Squad/Copilot boundary intact

## Try it

```bash
squad plugin validate .
squad plugin dry-run .
squad plugin install .
squad plugin enable graphify-knowledge
squad plugin switch knowledge graphify-knowledge
squad plugin list --json
```

## Real Graphify setup

Install and configure Graphify separately from the Squad plugin lifecycle:

```bash
uv tool install graphifyy
graphify install --platform copilot
graphify query "How does this repository fit together?"
```

Graphify produces artifacts such as `graphify-out/graph.html`, `graphify-out/graph.json`, and `graphify-out/GRAPH_REPORT.md`.

## Important

This example is declarative only. Squad does not install `graphifyy`, run `graphify`, install Copilot skills, or execute Graphify code during plugin install.
