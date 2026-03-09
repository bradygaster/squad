# Glossary

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Key terms defined in one sentence each. Alphabetical order.

---

**Agent** — A specialist AI team member with a role, charter, and persistent memory that handles specific types of work.

**Casting** — The process of forming your team by proposing agents, confirming roles, and writing their charters to `.squad/`.

**Ceremony** — A scheduled team event like retrospectives, reviews, or planning sessions defined in `.squad/ceremonies.md`.

**Coordinator** — Squad's routing engine that reads your request, checks routing rules, and spawns the right agents.

**Decisions** — Architectural choices, conventions, and directives captured in `.squad/decisions.md` that all agents read before working.

**Directive** — A persistent rule or convention you give the team (like "Always use Zod for validation") that gets written to `decisions.md`.

**History** — Each agent's memory of past work, stored in `.squad/agents/{name}/history.md` and read before every spawn.

**Memory** — All persistent team state stored in the `.squad/` directory, including roster, routing rules, decisions, and agent histories.

**Ralph** — The silent work monitor agent that watches your GitHub or GitLab issues and tracks work in progress.

**Routing** — Rules in `.squad/routing.md` that define which agent handles which type of work, read by the coordinator before spawning.

**Scribe** — The silent agent that tracks decisions and logs sessions, merging proposals from all agents into `.squad/decisions.md`.

**Skill** — A reusable capability stored in `.squad/skills/` that agents can learn and execute.

**Spawn** — The act of starting an agent as an independent subprocess with its own context window, tools, and memory.

**Squad** — Your AI development team, coordinated through the Squad framework.

**.squad/ directory** — The root directory containing all team state: roster, routing, decisions, agent charters and histories, and ceremony config.

**Team** — The collection of agents working on your project, defined in `.squad/team.md`.
