# Plugin Marketplace

Plugins are curated agent templates, skills, instructions, and prompts shared by the community via GitHub repositories (e.g., `github/awesome-copilot`, `anthropics/skills`). They provide ready-made expertise for common domains — cloud platforms, frameworks, testing strategies, etc.

## Marketplace State

Registered marketplace sources are stored in `.squad/plugins/marketplaces.json`:

```json
{
  "marketplaces": [
    {
      "name": "awesome-copilot",
      "source": "github/awesome-copilot",
      "added_at": "2026-02-14T00:00:00Z"
    }
  ]
}
```

## CLI Commands

Users manage marketplaces via the CLI:
- `squad plugin marketplace add {owner/repo}` — Register a GitHub repo as a marketplace source
- `squad plugin marketplace remove {name}` — Remove a registered marketplace
- `squad plugin marketplace list` — List registered marketplaces
- `squad plugin marketplace browse {name}` — List available plugins in a marketplace

## When to Browse

During the **Adding Team Members** flow, AFTER allocating a name but BEFORE generating the charter:

1. Read `.squad/plugins/marketplaces.json`. If the file doesn't exist or `marketplaces` is empty, skip silently.
2. For each registered marketplace, search for plugins whose name or description matches the new member's role or domain keywords.
3. Present matching plugins to the user: *"Found '{plugin-name}' in {marketplace} marketplace — want me to install it as a skill for {CastName}?"*
4. If the user accepts, install the plugin (see below). If they decline or skip, proceed without it.

## How to Install a Plugin

1. Read the plugin content from the marketplace repository (the plugin's `SKILL.md` or equivalent).
2. Copy it into the agent's skills directory: `.copilot/skills/{plugin-name}/SKILL.md`
3. If the plugin includes charter-level instructions (role boundaries, tool preferences), merge those into the agent's `charter.md`.
4. Log the installation in the agent's `history.md`: *"📦 Plugin '{plugin-name}' installed from {marketplace}."*

## Graceful Degradation

- **No marketplaces configured:** Skip the marketplace check entirely. No warning, no prompt.
- **Marketplace unreachable:** Warn the user (*"⚠ Couldn't reach {marketplace} — continuing without it"*) and proceed with team member creation normally.
- **No matching plugins:** Inform the user (*"No matching plugins found in configured marketplaces"*) and proceed.
