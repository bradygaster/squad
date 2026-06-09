# Sample Prompts

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Copy any of these, open Copilot, select Squad, and paste.** Each one is a ready-to-go project that shows a different Squad capability.

---

## Quick Builds

Small enough to ship in a single session. Great for seeing fan-out in action.

### CLI Pomodoro Timer

```
I'm building a cross-platform CLI pomodoro timer in Python. It should support:
- Configurable work/break intervals with sensible defaults (25/5/15)
- A persistent stats tracker that logs completed sessions to a local JSON file
- Desktop notifications on macOS, Windows, and Linux
- A --report flag that prints weekly stats as a table

Set up the team. I want this done fast — everyone works at once.
```

**Shows:** Parallel fan-out on a small project. Backend handles timer logic, tester writes test cases from the spec while implementation is in flight.

---

### Retro Snake Game

```
Build a browser-based Snake game using vanilla HTML, CSS, and JavaScript. No frameworks.
- Canvas-based rendering at 60fps
- Arrow key and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- A retro CRT-style visual effect using CSS filters

Start building immediately — I want to play this in 20 minutes.
```

**Shows:** Fast iteration — frontend, audio, and input handling all built in parallel. Tester writes Playwright tests while the game is being built.

---

## Mid-Size Projects

These take a few sessions and show how decisions and memory compound over time.

### Playwright-Tested Dashboard App

```
I'm building a React dashboard that shows sales metrics. Stack: React 19, Vite, Tailwind, Node.js backend with Express, SQLite for local dev. Requirements:
- Cards showing revenue, orders, and conversion rate
- A line chart for revenue over time (use Recharts)
- A data table with sorting, filtering, and pagination
- Dark mode toggle
- Playwright E2E tests for every major interaction

Set up the team and start with the backend data layer.
```

**Shows:** Agents specialize (frontend on Recharts, backend on Express/SQLite, tester on Playwright). Decisions about chart library and data format propagate automatically.

---

### Aspire Cloud-Native App

```
Build a cloud-native distributed app with Aspire. I want:
- An AppHost that orchestrates all services
- A Blazor frontend with interactive server components
- A minimal API backend with OpenAPI endpoints
- A Redis cache and PostgreSQL database
- Integration tests using Aspire testing support
- OpenTelemetry wired up to the Aspire dashboard

Use the latest .NET 9 templates as a starting point.
```

**Shows:** Full-stack cloud-native development. Agents handle service discovery, container orchestration, and distributed tracing setup in parallel.

---

## Feature Showcases

Prompts designed to exercise specific Squad features.

### Portable Squad — Cross-Platform Habit Tracker

```
Build a cross-platform habit tracker with a shared Squad config. I want to:
1. Build the backend API first (Node.js + SQLite)
2. Export the squad
3. Import it into a new React Native project for the mobile app
4. Have both projects share the same team memory and decisions

Start with the backend. When it's solid, I'll export and we'll start the mobile app.
```

**Shows:** Export/import, portability, and how decisions persist across projects.

---

### Issue-Driven Development

```
I have 12 open issues on my GitHub repo. I want the team to:
1. Triage all untriaged issues
2. Assign each to the right team member based on labels and content
3. Start working through them in priority order
4. Report progress every 3 rounds

Ralph, go.
```

**Shows:** Ralph's work monitor loop, GitHub Issues integration, automatic triage and assignment.

---

### Full Ceremony Lifecycle

```
We're building an IoT dashboard for smart home sensors. Before we write any code:
1. Run a design review ceremony — I want the team to debate architecture
2. Write a PRD with acceptance criteria
3. Run a sprint planning ceremony to break work into tasks
4. Then build it — full parallel fan-out

Start with the design review.
```

**Shows:** Ceremonies, PRD mode, sprint planning, and how they feed into parallel execution.

---

## Make Your Own

Template for any project:

```
I'm building [brief description].
Stack: [language, framework, database]
Key requirements:
- [requirement 1]
- [requirement 2]
- [requirement 3]

Set up the team and start building.
```

That's it. Squad figures out the team composition, casts names from a universe, and gets to work. After a few sessions, agents know your conventions and stop asking questions they've already answered.
