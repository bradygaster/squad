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

Set up the team.
```

**Shows:** Minimum sufficient dispatch — one owner builds the timer end to end. Tests are written once there's real behavior to test, not speculatively alongside it.

---

### Retro Snake Game

```
Build a browser-based Snake game using vanilla HTML, CSS, and JavaScript. No frameworks.
- Canvas-based rendering at 60fps
- Arrow key and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- A retro CRT-style visual effect using CSS filters

Start building — I want to play this in 20 minutes.
```

**Shows:** One owner builds frontend, audio, and input handling as a single cohesive feature. Fast iteration, no agents added before there's something for them to do.

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

Set up the team. Start with the backend data layer, then the frontend once the API is stable.
```

**Shows:** Backend owns the data layer first; frontend builds on the stable API second. Playwright tests are added once there's a working UI to test, not dispatched speculatively up front.

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

**Shows:** One agent owns the AppHost and service wiring — the genuinely independent concern (Redis cache) can run as a second agent alongside it. Say `Team, ...` if you want frontend, backend, and tracing all going at once.

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
