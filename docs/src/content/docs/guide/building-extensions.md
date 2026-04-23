# Building extensions

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

You've decided your idea is a Squad Extension (Layer 2). Now build one in five minutes.

---

## What is an extension?

An extension is a reusable collection of skills, ceremonies, and directives that any team can install. It lives outside Squad core, packaged as a GitHub repository or marketplace plugin. Extensions let you codify workflows (the client-delivery pattern), domain expertise (Azure deployment strategies), or testing ceremonies that other teams benefit from.

---

## Extension structure

```
my-extension/
├── skills/
│   ├── SKILL1.md
│   └── SKILL2.md
├── ceremonies/
│   └── CEREMONY.md
├── directives/
│   └── DIRECTIVE.md
├── roles/
│   └── ROLE.json       # Optional: additional base roles (see built-in-roles doc)
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

**Step 2: Add a skill**

Create `skills/example-skill.md`:

```markdown
# Example Skill

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

**Step 4: Write the README**

Explain the problem, installation, and usage:

```markdown
# My Extension

Codifies client-delivery workflows for consulting teams.

## Install

squad plugin install github/my-org/my-extension

## What's Inside

- **discovery-interview** skill — clarify requirements
- **evidence-bundler** skill — collect test results
- **plan-review** ceremony — gate for approval
```

**Step 5: Test locally**

Copy your extension directory into `.squad/skills/`, `.squad/ceremonies/`, and `.squad/directives/`. Load your Squad session and verify the skills appear and work as expected.

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
squad plugin install github/my-org/my-extension
```

---

## Real examples

- **Client-delivery workflow** ([RFC #328](https://github.com/bradygaster/squad/issues/328)) — discovery, research, multi-round review with evidence gates
- **Azure infrastructure patterns** — VM provisioning, Cosmos DB design, monitoring rules
- **Knowledge library skills** — document structured analysis, reference synthesis

---

## Related docs

- [Extensibility guide](./extensibility.md#decision-tree) — Where does your idea belong? (decision tree)
- [Plugin Marketplace](../features/plugins.md) — How teams discover and install your extension
- [Skills](../features/skills.md) — How to author reusable skills
- [Ceremonies](../features/ceremonies.md) — How to define decision gates and review rituals

---

**Ready to share?** [Open a discussion](https://github.com/bradygaster/squad/discussions) in the Squad community.
