# Consult Mode

Consult mode lets you use Squad in projects you don't own without leaving committed team state behind. Squad creates a temporary local workspace, keeps it out of git, and gives you a review step before you keep any reusable learnings.

---

## The Problem

When you contribute to someone else's project, you face a dilemma:

- **Pollute the project?** Running `squad init` creates a `.squad/` folder they didn't ask for
- **Keep too much local state?** Project-specific decisions can linger after the work is done
- **Work without your team?** You lose the structure and memory that make Squad useful

---

## The Solution

Your team **consults** on a project. They bring their expertise, do the work in a hidden local workspace, and stage reusable learnings for review before anything is kept. The project never needs to commit Squad state.

| Aspect | Normal Mode | Consult Mode |
|--------|-------------|--------------|
| Squad location | `.squad/` in project | Temporary local `.squad/` hidden from git |
| Git visibility | Committed or `.gitignore` | Invisible via `.git/info/exclude` |
| Writes go to | Project `.squad/` | Project `.squad/` (isolated consult workspace) |
| After session | Stays in project | Review reusable learnings, then clean up |

---

## Quick Start

### OSS Contribution

```bash
cd ~/projects/kubernetes-dashboard
squad consult                 # Enter consult mode
# ... do your work with Squad ...
squad extract                 # Review and extract reusable learnings
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

Enter consult mode for the current project.

```bash
squad consult              # Enter consult mode
squad consult --status     # Check current consult mode status
squad consult --check      # Dry-run: show what would happen without creating files
```

**What happens:**

1. Creates a project-local `.squad/` workspace for the consult session
2. Adds `.squad/` and `.github/agents/squad.agent.md` to `.git/info/exclude`
3. Patches the Scribe charter with extraction instructions
4. Creates a staging area at `.squad/extract/` for reusable learnings

**Created structure:**

```
.squad/
├── config.json             # { "consult": true, ... }
├── agents/                 # Session-local agent state
├── skills/                 # Session-local reusable notes
├── decisions.md            # Decisions made during the consult
├── scribe-charter.md       # Patched with consult mode extraction instructions
├── sessions/               # Local session history
└── extract/                # Staging area for reusable learnings

.github/agents/
└── squad.agent.md          # Points to local .squad/ (also excluded from git)
```

**Requirements:**

- The project must not already have a committed `.squad/` folder

---

### `squad extract`

Extract reusable learnings from a consult session.

```bash
squad extract                    # Review and extract reusable learnings
squad extract --dry-run          # Preview what would be extracted (no changes)
squad extract --clean            # Also delete project .squad/ after (prompts for confirmation)
squad extract --clean --yes      # Delete without confirmation
squad extract --accept-risks     # Allow extraction despite license risks
```

**What happens:**

1. Reads the project's LICENSE file
2. Loads staged learnings from `.squad/extract/`
3. Presents an interactive selection UI
4. Merges selected items into your reusable Squad materials
5. Logs the consultation at `.squad/consultations/{project}.md`
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

### Why Use a Temporary Local Workspace?

Consult mode keeps its workspace in the project, but out of version control:

- Changes during the session stay isolated from your normal team state
- Session-specific decisions remain local until explicitly extracted
- Works offline with no dependency on another checkout
- Clean separation between consulting and long-lived team assets

### Consultation Log

All consultations are tracked at `.squad/consultations/{project}.md`:

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
- Reusable materials are only updated through explicit `squad extract`

---

## Next Steps

- **Learn about sharing:** See [Export & Import](./export-import.md) for portable team snapshots
- **Upstream inheritance:** See [Upstream Inheritance](./upstream-inheritance.md) for knowledge sharing across teams
