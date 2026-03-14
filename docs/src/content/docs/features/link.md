# Link

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to link your project to a shared team:**
```
Squad link to the team repository so we all use the same identities
```

**Try this to enable remote Squad mode:**
```
Link this project to ../shared-team
```

Squad enables remote mode by linking a project to a shared team repository's Squad state. Multiple projects can share identity, roles, and decisions from a single "team root."

---

## Overview

By default, Squad stores team state (`.squad/`) locally in each project. In remote mode, you point to a shared team repository and use its state — enabling multiple projects to share the same agents, casting, roles, and decisions.

This is useful when:

- You have multiple related projects that should act as a single team
- You want team identity and decisions to be portable across codebases
- You're in dual-root mode where team governance lives separately from project code

## Usage

```bash
squad link <team-repo-path>
```

The path argument is required and can be relative or absolute:

```bash
squad link ../ai-team
squad link /home/user/projects/shared-team
```

## What Happens

When you run `squad link`:

1. **Resolves the path** — Converts relative paths to absolute paths
2. **Validates the target** — Checks that the path exists and is a directory
3. **Checks for Squad** — Confirms the target contains `.squad/` or `.ai-team/` directory
4. **Creates `.squad/` locally** — Creates the directory if needed
5. **Computes relative path** — Stores the path relative to your project for portability
6. **Writes config** — Creates `.squad/config.json` with:
   ```json
   {
     "version": 1,
     "teamRoot": "<relative-path-to-team>",
     "projectKey": null
   }
   ```
7. **Updates `.gitignore`** — Adds `.squad/config.json` so the local link isn't committed (each dev can link to their own team repo location)

## Key Behaviors

- **Idempotent** — Safe to run multiple times. Re-running updates the config with the new path.
- **Relative paths** — Uses relative paths for portability. You can move both project and team repo together without breaking the link.
- **Local, never committed** — `.squad/config.json` stays out of git, so each developer can link to their own team repo location.
- **Validation** — Confirms the target is a real Squad directory before linking.

## Files Created or Modified

| File | Action |
|------|--------|
| `.squad/config.json` | Created or overwritten |
| `.gitignore` | Appended (adds `.squad/config.json`) |
| `.squad/` | Created if missing |

## Related

- `squad init --mode remote <path>` — Alternative command that initializes Squad AND links to a team in one step
- See [Team Setup](./team-setup.md) for multi-root architectures and team governance patterns

## Examples

Link to a team repo one level up:

```bash
squad link ../shared-team
```

Link to an absolute path:

```bash
squad link /home/user/projects/ai-team
```

Link again with a new path (updates the config):

```bash
squad link /mnt/teams/our-squad
```

## Sample Prompts

```
link this project to the team repository
```

Enables remote mode by linking to the shared team's `.squad/` state.

```
show me the team link configuration
```

Displays the current `.squad/config.json` and active team root path.

```
are we using a shared team or local Squad?
```

Reports whether the project is in remote mode (linked) or local mode.
