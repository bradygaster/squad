# Export & Import

**Try this to make your team portable:**
```
Export my team to a file — I want to use them on another project
```

**Try this to bring a trained team to a new repo:**
```
Import the team from squad-export.json
```

Squad teams are portable. Export your trained agents, casting state, skills, and decisions to a single JSON file. Import them into any repo and they bring all their knowledge with them.

---

## Export

```bash
npx github:bradygaster/squad export
```

Creates `squad-export.json` in the current directory — a portable snapshot of your entire team: agents, casting state, skills, and decisions.

### Custom output path

```bash
npx github:bradygaster/squad export --out ./backups/my-team.json
```

### What's included

| Data | Included |
|------|----------|
| Agent charters | ✅ |
| Agent histories | ✅ (split into portable vs project-specific) |
| Casting state | ✅ |
| Skills | ✅ |
| Decisions | ✅ |

---

## Import

```bash
npx github:bradygaster/squad import squad-export.json
```

Imports the snapshot into the current repo's `.ai-team/` directory.

### Collision detection

If `.ai-team/` already exists, Squad warns you and stops. To archive the existing team and replace it:

```bash
npx github:bradygaster/squad import squad-export.json --force
```

The `--force` flag moves your current team to an archive before importing. Nothing is deleted.

### History splitting

During import, agent histories are split into two categories:

- **Portable knowledge** — general learnings, conventions, and patterns that transfer across projects
- **Project-specific learnings** — context-tagged entries tied to the original repo

Imported agents bring their skills and general knowledge without assuming your project works the same way.

---

## Use Cases

| Scenario | Command |
|----------|---------|
| Back up before a major refactor | `npx github:bradygaster/squad export --out ./backup.json` |
| Share a trained team with a colleague | Export, send the JSON, they import |
| Move a team to a different repo | Export from old repo, import into new repo |
| Reset and start fresh | Export as backup, delete `.ai-team/`, re-init |

---

## Tips

- Export before running `upgrade` if you want a rollback point.
- The export file is JSON — you can inspect it to see exactly what your team knows.
- Imported agents retain their names and universe. They won't be renamed.
- Commit your `.ai-team/` directory after importing so the team is available to everyone who clones the repo.

## Sample Prompts

```
export the current team
```

Creates a `squad-export.json` snapshot of the entire team in the current directory.

```
import squad-export.json into this repo
```

Imports a team snapshot into the current project's `.ai-team/` directory.

```
what was included in that export?
```

Shows a summary of what data was captured in the most recent export file.

```
export just the team state, not the full history
```

Creates a lightweight export with agent charters and skills but minimal history.

```
import with --force and archive the current team
```

Overwrites the existing `.ai-team/` directory after archiving it as a backup.
