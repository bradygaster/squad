# Consult Mode

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Consult mode lets you bring your personal squad to projects you don't own — OSS contributions, client work, temporary collaborations — without leaving any trace. Your team consults, does the work, learns things, and returns home with only the generic learnings you approve.

---

## The Problem

You have a personal squad at your global path (e.g., `~/Library/Application Support/squad/.squad` on macOS, `~/.config/squad/.squad` on Linux) with agents, skills, and decisions refined over time. When you contribute to someone else's project, you face a dilemma:

- **Pollute the project?** Running `squad init` creates a `.squad/` folder they didn't ask for
- **Pollute your squad?** Project-specific knowledge bleeds into your global squad
- **Work without your team?** Lose the productivity benefits you've built up

---

## The Solution

Your team **consults** on a project. They bring their expertise, do the work, and learn things. When done, they extract what's reusable and return home. The project never knows Squad was there.

| Aspect | Normal Mode | Consult Mode |
|--------|-------------|--------------|
| Squad location | `.squad/` in project | **Copy** of personal squad into project `.squad/` |
| Git visibility | Committed or `.gitignore` | Invisible via `.git/info/exclude` |
| Writes go to | Project `.squad/` | Project `.squad/` (isolated copy) |
| After session | Stays in project | Extract generic learnings → personal squad, discard rest |

---

## Quick Start

### OSS Contribution

```bash
cd ~/projects/kubernetes-dashboard
squad consult                 # Enter consult mode
# ... do your work with your squad ...
squad extract                 # Review and extract generic learnings
squad extract --clean --yes   # Clean up after extraction
```

### Client Work

```bash
cd ~/client-projects/acme-corp
squad consult                 # Enter consult mode
# ... work on the project ...
squad extract --dry-run       # Preview what would be extracted
squad extract --clean         # Extract and clean up (prompts for confirmation)
```

### Check Status

```bash
squad consult --status        # See if consult mode is active
squad consult --check         # Dry-run: show what would happen
```

---

## Command Reference

### `squad consult`

Enter consult mode with your personal squad.

```bash
squad consult              # Enter consult mode
squad consult --status     # Check current consult mode status
squad consult --check      # Dry-run: show what would happen without creating files
```

**What happens:**

1. Copies your personal squad into the project's `.squad/` directory
2. Adds `.squad/` and `.github/agents/squad.agent.md` to `.git/info/exclude`
3. Patches the Scribe charter with extraction instructions
4. Creates a staging area at `.squad/extract/` for generic learnings

**Created structure:**

```
.squad/                     # Full copy of personal squad
├── config.json             # { "consult": true, "sourceSquad": "...", ... }
├── agents/                 # Copied from personal squad
├── skills/                 # Copied from personal squad
├── decisions.md            # Copied from personal squad
├── scribe-charter.md       # Patched with consult mode extraction instructions
├── sessions/               # Local session history
└── extract/                # Staging area for generic learnings

.github/agents/
└── squad.agent.md          # Points to local .squad/ (also excluded from git)
```

**Requirements:**

- You must have a personal squad configured
- The project must not already have a committed `.squad/` folder

---

### `squad extract`

Extract generic learnings from a consult session back to your personal squad.

```bash
squad extract                    # Review and extract generic learnings
squad extract --dry-run          # Preview what would be extracted (no changes)
squad extract --clean            # Also delete project .squad/ after (prompts for confirmation)
squad extract --clean --yes      # Delete without confirmation
squad extract --accept-risks     # Allow extraction despite license risks
```

**What happens:**

1. Reads the project's LICENSE file
2. Loads staged learnings from `.squad/extract/`
3. Presents an interactive selection UI
4. Merges selected items to your personal squad
5. Logs the consultation to `<personal-squad>/consultations/{project}.md`
6. Optionally cleans up the project `.squad/` directory

**Example output:**

```
📤 Learnings staged for extraction:

⚠️  License: MIT (safe to extract)

Found 3 learning(s) in .squad/extract/:
  [1] use-async-await.md
  [2] validate-inputs.md  
  [3] prefer-composition.md

Select learnings to extract (space to toggle, enter to confirm):
❯ ◉ use-async-await.md
  ◉ validate-inputs.md
  ◉ prefer-composition.md

Extract 3 learning(s)? [Y/n]
```

---

## Learning Classification

During your consult session, the **Scribe** automatically classifies decisions as they're made:

### Generic (applies to any project)

Copied to `.squad/extract/` for later extraction:

- "Always use async/await instead of callbacks"
- "Validate inputs at API boundaries"
- "Prefer composition over inheritance"
- Best practices, coding standards, patterns that work anywhere

### Project-specific (only applies here)

Kept in local `decisions.md` only — not extracted:

- References to specific file paths in the project
- Project-specific config, APIs, or schemas
- Decisions that mention "this project" or "this codebase"

**You always have final say.** The Scribe proposes by writing to `extract/`, you approve or reject via `squad extract`. No extraction happens without your explicit confirmation.

---

## License Handling

### Permissive Licenses (Safe)

MIT, Apache, BSD, ISC — proceed normally:

```
⚠️  License: MIT (safe to extract)
```

### Copyleft Licenses (Blocked)

GPL, AGPL, LGPL — extraction is blocked by default:

```
🚫 License: GPL-3.0 (copyleft)
   Extraction blocked. Patterns from copyleft projects may carry
   license obligations that affect your future work.
   
   See: https://squad.dev/docs/license-risk
   
   To proceed anyway: squad extract --accept-risks
```

To override:

```bash
squad extract --accept-risks
```

---

## Technical Notes

### Git Invisibility

Consult mode uses `.git/info/exclude` to hide Squad files:

- Same syntax as `.gitignore`
- Lives inside `.git/`, so it's never committed
- Project owners never see it
- `git status` shows nothing Squad-related

### Why Copy Instead of Reference?

Your personal squad is **copied** into the project rather than referenced:

- Changes during the session don't pollute your personal squad
- Session-specific decisions stay isolated until explicitly extracted
- Works offline (no dependency on external path)
- Clean separation between "consulting" and "bringing home"

### Consultation Log

All consultations are tracked in your personal squad at `consultations/{project}.md`:

```markdown
# kubernetes-dashboard

**First consulted:** 2026-02-27  
**Last session:** 2026-03-15  
**License:** Apache-2.0

## Sessions

### 2026-02-27
- use-async-await.md: "### Always use async/await..."
- validate-inputs.md: "### Validate inputs at API..."

### 2026-03-15
- prefer-composition.md: "### Prefer composition over..."
```

---

## Tips

- Run `squad consult --check` before entering consult mode to preview what will happen
- Use `squad extract --dry-run` to review staged learnings without committing
- The `--clean` flag is convenient for OSS drive-by contributions where you won't return
- Consult mode errors out if the project already has a committed `.squad/` — use normal mode instead
- Your personal squad is never modified during the session — only via explicit `squad extract`

---

## Next Steps

- **Set up a personal squad:** See [Your Personal Squad](../guide/personal-squad.md) for initial setup with `squad init --global`
- **Learn about sharing:** See [Export & Import](./export-import.md) for portable team snapshots
- **Upstream inheritance:** See [Upstream Inheritance](./upstream-inheritance.md) for knowledge sharing across teams
