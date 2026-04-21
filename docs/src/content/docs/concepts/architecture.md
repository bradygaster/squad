# Architecture

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

How Squad works — one page, no handwaving.

---

## System diagram

```
User request
    ↓
Coordinator (routing engine)
    ↓
Spawns agents in parallel
    ↓
Agents read memory (.squad/) → work → write results
    ↓
Scribe merges decisions, Ralph tracks issues
    ↓
Results returned to user
```

---

## Components

### Coordinator

The coordinator is Squad's routing engine. It reads your request, checks routing rules in `.squad/routing.md`, and decides which agents to spawn. If you say "team," it decomposes the work and launches multiple agents in parallel. If you name an agent, it routes directly to them.

### Agents

Each agent is a specialist with a charter, role, and persistent memory. Agents are spawned as independent subprocesses with their own context windows and tools. They read `.squad/decisions.md` and their own history before working, then write results back. Agents never see each other's conversations — the coordinator orchestrates coordination.

### Memory (.squad/)

All team state lives in `.squad/`. This includes the roster (`team.md`), routing rules (`routing.md`), decisions (`decisions.md`), agent charters and histories (`agents/`), and ceremony schedules (`ceremonies.md`). Agents read this before every spawn. You own these files — edit them anytime.

### Routing

Routing rules in `.squad/routing.md` define which agent handles which work. The coordinator reads these rules before spawning. You can override routing by naming an agent directly in your request.

### Scribe

The Scribe is a silent agent that tracks decisions and logs sessions. Every team has a Scribe. You never talk to them directly — they work in the background, merging decisions from all agents into `.squad/decisions.md`.

### Ralph

Ralph is the work monitor. He watches your GitHub or GitLab issues, tracks work in progress, and alerts the team when something is ready. Every team has a Ralph. He's silent unless you ask him for status.

---

## What happens when you say "Team, build X"?

1. **Coordinator reads the request** and checks `.squad/routing.md` for decomposition rules.
2. **Coordinator spawns multiple agents in parallel** — one for frontend, one for backend, one for tests, etc.
3. **Each agent reads `.squad/decisions.md`** and their own history (`agents/{name}/history.md`), then works independently.
4. **Agents write results** to their history files and propose decisions.
5. **Scribe merges all decisions** into `.squad/decisions.md`.
6. **Coordinator returns labeled results** to you, tagged with each agent's name.

---

## Learn more

- [**Work routing**](../features/routing) — How the coordinator decides which agents to spawn
- [**Memory and knowledge**](memory-and-knowledge) — How decisions, skills, and history persist
- [**Parallel work**](parallel-work) — How agents work simultaneously without conflicts
