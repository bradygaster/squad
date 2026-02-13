# Combining Knowledge from Multiple Squads

You have 3 repos with trained squads. You're starting a new project and want the best of all of them.

---

## 1. The Reality: One Full Squad at a Time

Squad's import system brings in a complete team — roster, charters, histories, skills, decisions. You can only import one full squad cleanly.

**But** you can cherry-pick skills and knowledge manually.

---

## 2. Export from Each Repository

In each repo with a trained squad:

```bash
cd ~/projects/saas-app
npx github:bradygaster/squad export
```

```
📦 Exporting squad to squad-export-2025-07-15.zip
✅ Export complete: squad-export-2025-07-15.zip

Contains:
  - Roster (5 agents)
  - Charters (4 agent charters)
  - Skills (23 skills)
  - Decisions
  - Histories (project-specific context removed)
```

Repeat for your other repos:

```bash
cd ~/projects/mobile-app
npx github:bradygaster/squad export
# Produces: squad-export-2025-07-15-1.zip

cd ~/projects/api-gateway
npx github:bradygaster/squad export
# Produces: squad-export-2025-07-15-2.zip
```

You now have three export archives.

---

## 3. Import the Most Relevant Squad

Pick the squad whose domain knowledge is closest to your new project.

```bash
cd ~/projects/new-platform
git init
npx github:bradygaster/squad
```

```
> Import a squad from squad-export-saas-app.zip
```

```
✅ Squad imported
   5 agents, 23 skills, 47 decisions, histories loaded

Your team is ready.
```

This squad is now your baseline.

---

## 4. Cherry-Pick Skills from Other Squads

You can't import a second full squad without conflicts, but you **can** manually copy individual skill files.

Extract the other two exports and copy skill files:

```bash
# Extract the mobile-app squad export
unzip squad-export-mobile-app.zip -d /tmp/mobile-squad

# Copy specific skills you want
cp /tmp/mobile-squad/.ai-team/skills/react-native-debugging.md .ai-team/skills/
cp /tmp/mobile-squad/.ai-team/skills/mobile-testing-patterns.md .ai-team/skills/
```

Repeat for the API gateway squad:

```bash
unzip squad-export-api-gateway.zip -d /tmp/gateway-squad

cp /tmp/gateway-squad/.ai-team/skills/rate-limiting-patterns.md .ai-team/skills/
cp /tmp/gateway-squad/.ai-team/skills/auth-middleware-testing.md .ai-team/skills/
```

Skills are standalone markdown files. Agents load them automatically.

---

## 5. Manually Merge History Insights (Optional)

If another squad learned something critical that isn't in a skill file, you can manually append it to an agent's history.

Open `.ai-team/agents/{agent-name}/history.md` and add the knowledge as a session entry:

```markdown
## Session: 2025-07-15

### Context from previous squad (API Gateway project)
- GraphQL resolvers should always validate auth before query execution
- Rate limiting uses token bucket algorithm with Redis backing store
- Circuit breaker pattern wraps all downstream API calls
```

This becomes part of the agent's memory.

---

## 6. Tell Agents About Cross-Project Knowledge

When you give your first task, reference the knowledge you brought in:

```
> Team, we've combined learnings from three previous projects:
> the SaaS app, the mobile app, and the API gateway.
> You have skills from all three. The SaaS patterns are your baseline,
> but we've also imported mobile testing strategies and gateway
> rate-limiting patterns. Use them.
```

```
📋 Scribe — logged cross-project context
```

Agents now know they have hybrid knowledge.

---

## 7. Alternative: Use --force for Full Reimport (Destructive)

If you want to **replace** your imported squad with a different one:

```bash
npx github:bradygaster/squad import squad-export-mobile-app.zip --force
```

This **overwrites** the existing squad. Use only if you're sure.

---

## Tips

- **One full import, then cherry-pick.** Import the squad with the closest domain match, then manually copy skills from the others.
- **Skills are modular.** Each skill file is independent. Copy the ones you need, ignore the rest.
- **Histories are context-heavy.** Don't import histories from unrelated projects — they contain project-specific details that will confuse agents.
- **Decisions can be manually merged.** If another squad made architectural decisions you want to preserve, copy them into `.ai-team/decisions.md` as new entries.
- **Skill files are the cleanest transfer.** They're generic, portable, and immediately useful across projects.
