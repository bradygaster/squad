# Decision: Three-layer extensibility model

**Date:** 2026-03-16  
**Author:** PAO  
**Context:** Claire's RFC #328 revealed users need guidance on WHERE their change ideas belong.

## The model

Squad uses a three-layer extensibility model:

1. **Squad Core** — Coordinator behavior, routing, reviewer protocol, eager execution
   - Changed by: Squad maintainers only
   - Distributed via: npm releases

2. **Squad Extension** — Reusable patterns (skills, ceremonies, workflows)
   - Created by: Plugin authors
   - Distributed via: Marketplace plugins

3. **Team Configuration** — Decisions unique to THIS team
   - Changed by: The team itself
   - Lives in: `.squad/` files per-repo

## Key principle

**Squad core stays small. Most ideas are skills, ceremonies, or directives.**

## Decision tree

When someone has a change idea:
- Does it change HOW the coordinator routes work, spawns agents, or enforces core protocols? → Layer 1 (Core)
- Could OTHER teams benefit from this pattern? → Layer 2 (Extension/plugin)
- Is this unique to THIS team's process? → Layer 3 (Team config)

## The Claire test

Claire's RFC #328 proposed a sophisticated client-delivery workflow with discovery interviews, research sprints, and multi-round review. It FELT like a core feature.

**Realization:** It maps entirely to existing primitives:
- Skills: `discovery-interview`, `research-sprint`, `evidence-bundler`
- Ceremonies: `plan-review`, `implementation-review`
- Directives: Multi-round review policy

No core changes needed. It's a Layer 2 plugin.

## Escalation signals

You likely need a core change if:
- You need a new coordinator mode
- You need to change routing logic
- You need to change reviewer protocol
- You need global enforcement rules
- Your skill needs coordinator state data

## Documentation

Comprehensive guide at `docs/guide/extensibility.md` with decision tree, examples, plugin build instructions.

## Applies to

All team members, contributors, and users proposing changes.
