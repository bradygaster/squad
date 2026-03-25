# Moving a Team Between Repos

**Try this to save your team:**
```
Export my team from project-a so I can import it into project-b
```

**Try this to transfer trained agents:**
```
Import the alpha-team.json into this new repo
```

Export trained agents from one repo, import into another. They bring skills and portable knowledge — project-specific learnings stay tagged so they don't bleed.

---

## 1. Export from the Source Repo

Export a trained team from one repo and import it into another. Agents carry their skills and portable knowledge — project-specific learnings stay tagged so they don't bleed into the new project.

In the repo where your team currently lives:

```bash
cd ~/projects/project-alpha
squad export
```

```
✅ Exported squad to squad-export.json
⚠ Review agent histories before sharing — they may contain project-specific information
```

This creates `squad-export.json` — a portable snapshot containing agents, casting state, skills, and accumulated knowledge.

You can also specify a custom output path:

```bash
squad export --out ~/exports/alpha-team.json
```

---

## 2. Initialize Squad in the Target Repo

The target repo needs Squad installed before importing:

```bash
cd ~/projects/project-beta
npm install -g @bradygaster/squad-cli
squad init
```

```
✅ .github/agents/squad.agent.md (v0.2.0)
✅ .ai-team-templates/
✅ .ai-team/skills/ (starter skills)
✅ .ai-team/ceremonies.md
✅ .gitattributes (merge=union rules)

Squad is ready.
```

---

## 3. Import the Team

```bash
squad import ~/projects/project-alpha/squad-export.json
```

```
✅ Imported squad from squad-export.json
  5 agents: Danny, Rusty, Linus, Basher, Scribe
  3 skills imported
  Casting: usual-suspects universe preserved

⚠ Project-specific learnings are marked in agent histories — review if needed

Next steps:
  1. Open Copilot and select Squad
  2. Tell the team about this project — they'll adapt
```

---

## 4. Handle Collisions

If `.ai-team/` already exists (e.g., this repo already had a team), import will fail:

```bash
squad import squad-export.json
```

```
✗ A squad already exists here. Use --force to replace (current squad will be archived).
```

Use `--force` to archive the existing team and replace it:

```bash
squad import squad-export.json --force
```

The existing `.ai-team/` is moved to `.ai-team-archive-2025-07-15-14-30-00/`. Nothing is deleted.

---

## 5. Tell the Team About the New Project

Open Copilot and introduce the team to their new context:

```bash
copilot
```

```
> This is project-beta — a mobile app backend in Python/FastAPI.
> We use SQLAlchemy for the ORM and pytest for testing.
> The API serves a React Native mobile client.
```

Agents adapt. Their portable knowledge (general patterns, coding practices, team dynamics) carries over. Project-specific learnings from the old project are preserved in their histories but tagged:

```
📌 Imported from squad-export on 2025-07-15. Portable knowledge
carried over; project learnings from previous project preserved below.
```

---

## 6. History Splitting

During import, agent histories are automatically split:

- **Portable knowledge** — general learnings that transfer across projects (coding patterns, architectural principles, team conventions). These carry over normally.
- **Project-specific learnings** — file paths, sprint details, PR references, session logs from the old project. These are preserved under a `## Project Learnings (from import)` section so agents can reference them but don't confuse old project details with the new one.

---

## Tips

- **Review histories before sharing.** Agent histories may contain project-specific information — file paths, API keys mentioned in context, internal architecture details. Review `squad-export.json` before sending it to someone outside your organization.
- **Import starts fresh decisions.** The imported team gets an empty `decisions.md`. Old decisions lived in the source project's context. Tell agents your conventions for the new project — they'll capture them.
- **Casting universe is preserved.** Agents keep their names and the fictional universe they were drawn from. Danny is still Danny.
- **Archives are cheap insurance.** When using `--force`, the old team is archived, not deleted. If the import doesn't work out, rename the archive back to `.ai-team/`.
- **Skills carry over.** Earned skills (with confidence levels) transfer with the team. Agents don't lose expertise when they move.
