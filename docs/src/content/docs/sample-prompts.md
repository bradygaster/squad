# Sample Prompts

Ready-to-use prompts for Squad. Copy any prompt, open Copilot, select **Squad**, and paste it in.

---

## Quick Builds

Small projects that ship in a single session. Good for parallel fan-out and fast iteration.

---

### 1. CLI Pomodoro Timer

```
I'm building a cross-platform CLI pomodoro timer in Python:
- Configurable work/break intervals (25/5/15 defaults)
- Persistent stats tracker (local JSON)
- Desktop notifications (macOS, Windows, Linux)
- Focus mode: blocks domains via /etc/hosts (with undo)
- --report flag for weekly stats table

Set up the team.
```

**What it demonstrates:**
- Minimum sufficient dispatch on a small, well-scoped project
- Backend owns timer logic; cross-platform notifications are a genuinely independent concern for a second agent
- Tests are written once real behavior exists to test, not dispatched speculatively alongside implementation

---

### 2. Markdown Static Site Generator

```
Zero-dependency static site generator in Node.js: markdown→HTML with built-in template, generates index page, outputs to dist/. Support front matter (title, date, tags), tag index pages, RSS feed. No frameworks — just fs, path, and a custom markdown parser.

Set up the team and start building.
```

**What it demonstrates:**
- One owner builds the generator's pipeline components as a single cohesive unit
- Tests are added once the pipeline produces real output, not speculatively alongside it
- Front matter format decisions propagate via decisions.md

---

### 3. Retro Snake Game

```
Browser Snake game (vanilla HTML/CSS/JS, no frameworks):
- Canvas rendering at 60fps
- Arrow keys and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- Retro CRT-style CSS filters
- Mobile: touch swipe controls
- Sound effects via Web Audio API

Start building — I want to play in 20 minutes.
```

**What it demonstrates:**
- One owner builds frontend, audio, and input handling as a single feature
- Tests are added once the game runs, not dispatched speculatively during construction
- Fast iteration with visible progress

---

### 4. Turn-by-Turn Text Adventure Engine

```
Text-based adventure engine in TypeScript:
- Load worlds from JSON (rooms, items, NPCs, transitions)
- Command parser: go [dir], look, take [item], use [item] on [target], talk to [npc], inventory
- Sample adventure: 10 rooms, 5 items, 3 NPCs, 2 puzzles
- Save/load game state to JSON
- Terminal via Node.js with colored output (chalk)
- Narrator voice: descriptions vary by inventory/actions

Build engine and sample adventure simultaneously. Content writer and engine builder work in parallel.
```

**What it demonstrates:**
- Natural split between engine logic and content creation — two independent owners, non-overlapping files
- Both streams run in parallel with shared data format decisions
- Tests are added once the engine has real behavior to verify

---

### 5. Arcane Duel — A Card Battle Game

```
Strategic card duel game (browser, inspired by MTG):
- 30+ cards across 4 types: Attack, Defense, Spell, Trap (with mana cost, power, toughness, effects)
- Turn phases: Draw → Main → Combat → End
- Mana system: +1 per turn (max 10), some cards generate bonus mana
- Stack-based spell resolution
- HP: 20 each, win at 0
- AI opponent with basic strategy
- HTML/CSS grid battlefield showing fields, hands, graveyards
- Card hover preview

Team, go — one agent designs cards/balance, another builds engine/rules, another builds UI. Have someone validate combat math once the engine is real.
```

**What it demonstrates:**
- An explicit `Team, ...` request to broaden participation beyond the default one or two agents
- Card design and engine/rules are independent enough to run in parallel; UI follows once the data model is set
- Combat math validation happens once there's a real engine to check, not speculatively alongside design

---

### Squad Blog Engine (Meta Demo)

```
Static blog engine rendering markdown posts to HTML (no frameworks):

Input: docs/blog/ markdown with YAML frontmatter (title, date, author, wave, tags, status, hero).

Output:
- Index page: posts sorted by date, with title/hero/author/tags
- Post pages: clean typography, syntax-highlighted code, responsive tables
- Tag index grouping posts by tag
- Wave navigation: ← Previous | Next → links
- Dark mode toggle (CSS custom properties, localStorage)
- RSS feed (feed.xml)

Design: Clean, modern, developer-focused. Monospace headings, proportional body. Dark code blocks with copy button. Mobile responsive. Fast — no JS for reading (JS only for dark mode and copy).

Build parser, template engine, RSS generator, static output (dist/). Include `node build.js` script. Set up the team and build in one session.
```

**What it demonstrates:**
- Meta-demo where Squad builds its own publishing tool
- One owner builds the pipeline end to end; CSS/design can run as a second, genuinely independent agent
- Finished product is visual, functional, and self-documenting

---

## Mid-Size Projects

Real coordination needed. Agents make architectural decisions, share them, and build across multiple rounds.

---

### 6. Cloud-Native E-Commerce Store

```
Build an event-driven e-commerce store:
- Product Catalog API (Node.js/Express, PostgreSQL) — CRUD + search
- Order Service (Node.js) — async processing via message queue, payment stubs, events
- Notification Service — listens for order events, emails confirmations
- API Gateway — auth (JWT), rate limiting
- RabbitMQ or in-memory stub for local dev
- React SPA: product grid, cart, checkout

Each service with its own Dockerfile. Include docker-compose.yml. Orders return 202 Accepted, status polled/pushed via WebSocket.

Set up the team. Team, one agent per service — coordinate on API contracts and event schemas early, then build in parallel.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify more than the default one or two agents — five genuinely independent services
- Event schema decisions must propagate early via Scribe
- Each service builds independently once contracts are agreed

---

### 7. Playwright-Tested Dashboard App

```
Build a project management dashboard (React + TypeScript, Node.js/Express):
- Kanban board with drag-and-drop (Backlog, In Progress, Review, Done)
- Task creation: title, description, assignee, priority, due date
- Filtering by assignee, priority, status
- Real-time updates via WebSocket
- User auth: login/signup (JWT, bcrypt)
- SQLite + Drizzle ORM

Full Playwright test suite covering login, CRUD, drag-and-drop, filtering, real-time sync (two browser contexts). Write Gherkin feature files FIRST, then implement Playwright step definitions. Runnable with `npx playwright test`.

Set up the team. Team, write Gherkin specs and test skeletons first since I want test-first development, then build frontend and backend against them.
```

**What it demonstrates:**
- An explicit `Team, ...` request for test-first development, since Gherkin specs are asked for up front rather than added speculatively
- Frontend and backend are independent owners that build against the agreed specs in parallel
- Tests and implementation converge without one blocking the other

---

### 8. GitHub Copilot Extension

```
Build a GitHub Copilot Chat extension (Copilot Extensions SDK):
- Act as @code-reviewer agent
- Accept GitHub repo URL or PR number
- Fetch diff via GitHub API, analyze for security (SQL injection, XSS, secrets), performance (N+1 queries), style violations (configurable .code-reviewer.yml)
- Return structured feedback with file-level annotations
- Blackbeard-style SSE streaming response
- Deploy as Vercel serverless function
- Include GitHub App manifest

Read SDK docs carefully. One agent owns SDK integration/streaming, another owns analysis engine, another owns GitHub API. Set up the team.
```

**What it demonstrates:**
- Agents read external SDK docs and build to prescribed patterns
- SDK integration and analysis engine work in parallel with shared interface contract
- Real-world API integration with deployment considerations

---

### 9. Aspire Cloud-Native App

```
Build a cloud-native app with Aspire (read https://aspire.dev/):
- AppHost orchestrating all services
- Blazor Server dashboard: current conditions + 5-day forecast for saved cities
- Weather API service: wraps OpenWeatherMap with Redis caching
- User Preferences service: stores cities (PostgreSQL)
- Background Worker: refreshes cache every 15 minutes
- Service discovery via Aspire (no hardcoded URLs)
- Health checks and OpenTelemetry tracing

Team, organize by Aspire integration: AppHost/discovery, Redis caching, PostgreSQL, Blazor frontend, background worker. Set up the team.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify five agents, each owning a genuinely independent infrastructure component
- AppHost coordinates wiring while service agents build independently
- Infrastructure decisions (service names, connection strings) propagate via decisions.md; service discovery gets validated once the services are real

---

## Large Projects

Complex coordination, memory, and team size. Multiple rounds, cross-cutting decisions, agents remember earlier work.

---

### 10. Legacy .NET-to-Azure Migration

```
Migrate legacy .NET Framework to Azure. Clone:
1. https://github.com/bradygaster/ProductCatalogApp — ASP.NET MVC with WCF SOAP, in-memory repo, MSMQ orders
2. https://github.com/bradygaster/IncomingOrderProcessor — Windows Service monitoring MSMQ

Target:
- ProductCatalogApp → ASP.NET Core/.NET 10 or Blazor on App Service. WCF→REST API, MSMQ→Service Bus
- IncomingOrderProcessor → Azure Functions with Service Bus trigger
- Shared models → .NET 10 class library
- Infrastructure: Bicep for App Service, Function App, Service Bus
- CI/CD: GitHub Actions
- Local dev: docker-compose or Aspire

Preserve all business logic. SOAP→REST with same data structures, MSMQ→Service Bus compatible format.

Team, this spans web app migration, WCF-to-API, Windows Service-to-Functions, shared models, Azure infrastructure, and CI/CD. Start with a migration plan before dividing up the work.
```

**What it demonstrates:**
- An explicit `Team, ...` request for a project with genuinely independent migration streams
- Agents analyze unfamiliar code and translate to Azure-native patterns
- Business logic preservation while modernizing infrastructure (WCF→REST, MSMQ→Service Bus); testing follows once the ported services exist

---

### 11. Multiplayer Space Trading Game

```
Build multiplayer space trading game (browser-based):
- Galaxy: 50+ procedural star systems with stations, trade routes
- Economy: dynamic commodity prices (fuel, ore, food, tech, luxuries) driven by supply/demand
- Ships: 3 tiers with cargo capacity, fuel range, hull strength
- Trading: buy low, sell high. Prices shift with player activity and events
- Combat: turn-based encounters with pirates/players
- Multiplayer: WebSocket real-time. Players see each other, chat, PvP opt-in
- Persistence: PostgreSQL (credits, cargo, location, ship)
- Frontend: Canvas galaxy map, HTML/CSS panels for station/trading/inventory

Tech: Node.js, PostgreSQL, WebSocket, vanilla HTML/CSS/Canvas.

Team, one agent per system: economy/trading, galaxy generator/map, combat, multiplayer/networking, frontend UI. Economy and galaxy work simultaneously — agree on star system data format early. Go.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify five agents, each owning a distinct, interoperating system
- Data format decisions shared early and respected across all agents
- Economy and galaxy agents work in parallel from turn 1; tests are added once each system has real behavior to verify

---

### 12. AI Recipe App with Image Recognition

```
Build recipe app with image recognition (React Native Expo, Python FastAPI, SQLite):
- Camera: photograph ingredients
- Image analysis: Claude Opus 5 vision to identify ingredients
- Recipe matching: match against database (50+ recipes)
- Recipe display: ingredients (have vs. need), instructions, time
- Favorites: save, rate, notes
- Shopping list: auto-generate missing ingredients
- Dietary filters: vegetarian, vegan, gluten-free, dairy-free

Team, split this into: React Native frontend, FastAPI backend + DB, vision/AI integration, recipe curation/seed data. Set up the team.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify four agents on a cross-platform mobile + backend + AI project
- Recipe curator and AI integration agent work simultaneously with shared taxonomy
- API tests with mocked vision responses are added once the integration exists, not dispatched ahead of it

---

### 13. DevOps Pipeline Builder

```
Build self-service DevOps platform (React, Go, PostgreSQL, Docker):
- Pipeline designer: drag-and-drop UI composing stages (build, test, deploy, notify)
- Stage templates: npm build, Docker build, Helm deploy, Slack notify
- Pipeline execution: stages run as Docker containers (Go orchestration)
- Live logs: stream to browser via SSE
- Pipeline-as-code: export/import YAML (GitHub Actions compatible)
- Secrets management: encrypted storage
- Execution history: searchable logs with status, duration, artifacts

Team: frontend (drag-and-drop), backend (execution engine), Docker/infrastructure, security (secrets). Set up the team.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify four agents with diverse expertise (UI, containers, cryptography)
- Execution engine and pipeline designer build in parallel with shared data model
- Security agent works independently on secrets encryption; tests follow once the pipeline runs

---

### 14. Roguelike Dungeon Crawler

```
Build browser-based roguelike dungeon crawler:
- Dungeons: procedural rooms/corridors (BSP or cellular automata), 10 floors, scaling difficulty
- Character: warrior/mage/rogue with unique abilities (3 each), health/mana/stamina
- Combat: turn-based, grid-positioned. Enemy AI flanks, retreats at low HP
- Items: weapons, armor, potions, scrolls. Random loot tables. Unidentified items until used
- Fog of war: tile-based visibility with raycasting
- Rendering: Canvas with tilemap (16x16 or 32x32 colored squares)
- Permadeath: high score table with name, class, floor, cause of death
- Save: save-on-exit only (LocalStorage)

Team, one agent per: dungeon gen, combat + AI, items + loot, rendering + fog of war. All build simultaneously with shared tile/entity data model. Start building.
```

**What it demonstrates:**
- An explicit `Team, ...` request for four independently buildable systems converging on a shared data model
- Early data model decision via decisions.md enables full parallelism
- Game math gets validated once each system exists, not speculatively during construction

---

### 15. Real-Time Collaborative Whiteboard

```
Build real-time collaborative whiteboard using React Flow (React + TypeScript, Node.js, WebSocket):
- Built on React Flow (https://reactflow.dev/)
- Shapes: rectangles, circles, text, sticky notes, arrows/edges
- Drag-and-drop from palette, reposition, resize (handles)
- Color picker, stroke width, fill/background per shape
- Multi-select (bounding box), group operations
- Real-time sync: cursor + edits via WebSocket
- Rooms: shareable URL
- Undo/redo per user
- Export: PNG and SVG
- Persistence: PostgreSQL (nodes, edges, viewport), auto-save every 30s

Team: frontend (React Flow + drag-and-drop), networking (WebSocket sync + conflict resolution), backend (rooms + persistence). Set up the team.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify three agents on genuinely independent concerns
- Networking and frontend agents coordinate closely on the React Flow data model
- Multi-user Playwright tests are added once real-time sync exists to validate

---

### 16. Multiplayer Dice Roller — Bar Games PWA

```
Build mobile-first PWA dice roller (React + TypeScript, Three.js/React Three Fiber, Node.js + WebSocket, PostgreSQL):
- Mobile-first responsive, PWA installable, works offline
- Double-tap to roll: realistic 3D dice with physics (Three.js)
- Customizable: 1-10 dice, die types (d6, d10, d12, d20), colors
- Multiplayer: rooms with 6-digit code or QR, real-time roll sync, chat
- Game modes: Freeroll, Yahtzee (auto-scoring), Liar's Dice, custom rules
- Score history: roll log, replay animations, export JSON
- Sound effects, haptic feedback, night mode

Team, one agent: 3D dice/physics. One: PWA/gesture handling. One: multiplayer backend (rooms, WebSocket, scores). One: game logic. Set up the team.
```

**What it demonstrates:**
- An explicit `Team, ...` request to justify four agents specialized by concern (3D, touch, networking, logic)
- 3D and gesture agents coordinate on tap-to-roll triggers and animation states
- Mobile Playwright tests for touch and multiplayer are added once the features exist to test

---

## Advanced Features

For detailed guidance on advanced features like export/import, GitHub Issues integration, ceremonies, PRD mode, human team members, and skills, see [Tips and Tricks](tips-and-tricks.md).

