# Extensibility guide

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Where does your change idea belong? Squad core, marketplace plugin, or team config?

**Key principle:** Squad core stays small. Most ideas are skills, ceremonies, or directives.

---

## The three layers

| Layer | What lives here | Who changes it | Distribution |
|-------|----------------|----------------|--------------|
| **Squad Core** | Coordinator behavior, routing logic, reviewer protocol | Squad maintainers only | npm releases |
| **Squad Extension** | Reusable patterns (skills, ceremonies, workflows) | Plugin authors | Marketplace plugins |
| **Team Configuration** | Decisions unique to THIS team | The team itself | `.squad/` files |

---

## Decision tree

```
┌─ Does it change HOW the coordinator routes, spawns, or enforces?
│
├─ YES → Squad Core
│  └─ Examples: New coordinator modes, reviewer protocol changes
│     Action: Open an RFC issue
│
└─ NO → Continue...
   │
   ┌─ Could OTHER teams benefit?
   │
   ├─ YES → Squad Extension (plugin)
   │  └─ Examples: Client-delivery workflow, Azure skills, TDD ceremonies
   │     Action: Build a plugin
   │
   └─ NO → Team Configuration
      └─ Examples: YOUR git workflow, YOUR build process, YOUR routing rules
         Action: Update `.squad/` files
```

**Heuristic:** "Squad should..." → check if it's really "My team should..." or "Teams using X should...".



---

## Worked example: Client-delivery RFC

[RFC #328](https://github.com/bradygaster/squad/issues/328) proposed a sophisticated client-delivery workflow: discovery interviews, research sprints, multi-round review with `SHIP`/`NEEDS_WORK`/`BLOCKED` verdicts, evidence bundles.

**The realization:** It maps entirely to existing Squad primitives. No core changes needed.

**Where it belongs:** Layer 2 (Squad Extension)

This workflow is a reusable pattern any team could adopt — perfect as a marketplace plugin.

**Plugin structure:**
```
client-delivery-workflow/
├── skills/
│   ├── discovery-interview/      # Clarify requests, extract requirements
│   ├── research-sprint/           # Propose directions, score options
│   └── evidence-bundler/          # Collect test results, logs, screenshots
├── ceremonies/
│   ├── plan-review.md             # Gate: approve before implementation
│   └── implementation-review.md   # Gate: verify evidence
└── directives/
    └── multi-round-review.md      # Policy: 2 NEEDS_WORK rounds max
```

**Usage:**
```bash
squad plugin install github/awesome-copilot/client-delivery-workflow
```

**Lesson:** Most sophisticated workflows are compositions of primitives, not core features.

---

## When to escalate to core

You likely need a core change if:

- **New coordinator mode** — Example: `validate` mode that runs checks before `assign`
- **Routing logic change** — Example: Route based on agent workload, not labels
- **Reviewer protocol change** — Example: Conditional approvals ("approved if tests pass")
- **Global enforcement rule** — Example: Block merges if evidence missing
- **Skill needs coordinator data** — Example: Access to agent spawn history

You DON'T need core if:

- **Workflow pattern** → Build a plugin (skills + ceremonies)
- **Domain expertise** → Write a skill
- **Team process** → Add a ceremony to `.squad/ceremonies.md`
- **Reusable templates** → Build a plugin
- **Configuring existing behavior** → Update `.squad/routing.md`

---

## Build an extension

Ready to build? See [Building extensions](./building-extensions.md) for a five-minute walkthrough.

The plugin MVP uses a declarative `plugin.manifest.json` and a guarded lifecycle:

```bash
squad plugin validate ./my-extension
squad plugin dry-run ./my-extension
squad plugin install ./my-extension
squad plugin enable my-extension
```

Install records lock data and leaves the plugin disabled. Enable activates the roles declared in the manifest. See [Plugin security model](../reference/plugin-security.md) for the no-arbitrary-execution gate.

---

## Summary

1. **Start with the decision tree** — Most ideas are Layer 2 or 3
2. **Default to team config** — Unique to your team? → `.squad/`
3. **Build a plugin if reusable** — Other teams benefit? → Package and share
4. **Escalate to core rarely** — Need coordinator/routing changes? → Open an RFC

**When in doubt:** Start with team config. Copy-pasting to other teams? Promote to plugin. Plugins repeatedly hitting limits? Signal for core change.

---

## Related documentation

- [Plugin Marketplace](../features/plugins.md) — How to browse, install, and share plugins
- [Skills](../features/skills.md) — How to write skills for your team or plugins
- [Ceremonies](../features/ceremonies.md) — How to define team meetings and gates
- [Routing](../features/routing.md) — How to configure work assignment rules
- [Building extensions](./building-extensions.md) — Step-by-step guide to building and sharing extensions
- [Contributing](https://github.com/bradygaster/squad/blob/main/CONTRIBUTING.md) — How to propose changes to Squad core

---

**Questions?** [Open an issue](https://github.com/bradygaster/squad/issues/new) or join the discussion in the Squad community.
