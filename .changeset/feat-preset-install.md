---
"@bradygaster/squad-cli": minor
"@bradygaster/squad-sdk": minor
---

feat: add `squad preset install <source>` for sharing presets via repo URL or local path (#1224)

Closes #1224. Adds a new subcommand that installs a single preset from a GitHub URL or local path into `$SQUAD_HOME/presets/<name>/` — the peer-to-peer preset sharing flow that was missing in v0.10.0.

### CLI

```bash
# From a GitHub repo (preset at <repo-root>/preset.json or <repo-root>/presets/<name>/)
squad preset install https://github.com/tamir/my-presets#my-awesome-team

# From a sub-path
squad preset install https://github.com/tamir/my-presets/tree/main/presets/my-awesome-team

# From SSH URL
squad preset install git@github.com:tamir/my-presets.git#my-awesome-team

# From a local path
squad preset install ./my-awesome-team

# Override the installed name
squad preset install https://github.com/tamir/my-presets#my-awesome-team --name corp-team

# Overwrite an existing preset
squad preset install <source> --force
```

After install, the preset is a normal entry in `$SQUAD_HOME/presets/` — `squad preset list`, `squad preset apply <name>`, and `squad init --preset <name>` all work as today.

### Why

The existing `squad preset init --remote` flow is for syncing your *whole* `$SQUAD_HOME` repo across machines (single-user, multi-machine use case). There was no built-in way to install just *one* preset from someone else's repo. Users had to:
1. Manually clone the repo to a temp dir
2. `cp -r <clone>/presets/<name> $SQUAD_HOME/presets/`
3. Then `squad preset apply <name>`

…or hijack `SQUAD_HOME` (which collides with their own personal squad config).

### What it does

1. Resolves source — GitHub URL → shallow `git clone --depth 1` to a temp dir; local path → use as-is
2. Locates the preset within the source via 3 patterns:
   - Source dir contains `preset.json` → single-preset source
   - Source dir contains a `presets/` collection → require `--name` (or `#name` fragment) to pick
   - Source dir IS the `presets/` dir → require `--name`, or auto-pick if only one preset
3. Validates the preset's `preset.json` manifest (name, agents[]) before any destructive action
4. Verifies `agents/` directory exists
5. Copies `preset.json` (with optional rename) + `agents/` into `$SQUAD_HOME/presets/<name>/`
6. Fail-stops if destination exists, unless `--force` is passed
7. Cleans up the temp clone whether install succeeds or fails

### What's NOT in scope (deferred to follow-ups)

- `squad preset uninstall` — `rm -rf $SQUAD_HOME/presets/<name>` works for now
- `squad preset update <name>` to pull a fresh version from origin
- Public preset registry / discovery catalog
