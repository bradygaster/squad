---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

docs(casting): make agent name allocation spoiler-aware

Agent names are drawn from fictional universes as easter eggs and are
shown in plain text across `team.md`, prompts, logs, and generated files.
Previously the casting rules optimized only for theme fit and uniqueness,
so a freshly set-up squad could surface a character name that encodes a
future title, role, transformation, or fate — spoiling the source
material for a user who is only part-way through it.

This change updates the canonical naming guidance so that name allocation
now:

- Prefers the name a character has when first introduced.
- Avoids titles or epithets a character only earns later.
- Avoids names that reveal a transformation, fate, hidden identity, or
  later reveal.
- Falls back to a safer character from the same universe when unsure.
- Keeps existing name mappings stable — only the next/new allocation
  picks a different spoiler-safe character, so already-named agents are
  never renamed.

Updates the `squad.agent.md` name-allocation rule and the
`casting-reference.md` reference (new "Spoiler Awareness" section),
propagated to all template copies via `scripts/sync-templates.mjs`.
