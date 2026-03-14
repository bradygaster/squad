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

Set up the team. I want this done fast — everyone works at once.
```

**What it demonstrates:**
- Parallel fan-out on a small, well-scoped project
- Backend handles timer logic while systems agent tackles cross-platform notifications
- Tester writes test cases from spec while implementation is in flight

---

### 2. Markdown Static Site Generator

```
Zero-dependency static site generator in Node.js: markdown→HTML with built-in template, generates index page, outputs to dist/. Support front matter (title, date, tags), tag index pages, RSS feed. No frameworks — just fs, path, and a custom markdown parser.

Set up the team and start building.
```

**What it demonstrates:**
- Agents own distinct pipeline components (parser, template engine, RSS, file I/O)
- Tester writes test cases from spec while others build in parallel
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
- Frontend, audio, and input handling built in parallel
- Tester writes Playwright tests while game is under construction
- Fast iteration with visible progress across agents

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
- Natural split between engine logic and content creation
- Both streams run fully in parallel with shared data format decisions
- Tester writes test cases from spec before implementation completes

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

One agent designs cards/balance, another builds engine/rules, another builds UI, tester validates combat math. Go.
```

**What it demonstrates:**
- Deep parallelism requiring early data format alignment via decisions.md
- UI scaffolding proceeds while card design is underway
- Scribe's decision propagation becomes critical (mana curve affects engine and AI)

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

Build parser, template engine, RSS generator, static output (dist/). Include `node build.js` script. Set up team and build in one session.
```

**What it demonstrates:**
- Meta-demo where Squad builds its own publishing tool
- All components (parser, templating, RSS, CSS) build in parallel
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

Set up a team. One agent per service. Coordinate on API contracts and event schemas early, then build in parallel.
```

**What it demonstrates:**
- True microservice parallelism with contract-first coordination
- Event schema decisions must propagate early via Scribe
- API gateway scaffolds while downstream services build independently

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

Set up the team. Write Gherkin specs and test skeletons before implementation starts, update as UI takes shape.
```

**What it demonstrates:**
- Test-first development with Gherkin specs written before implementation
- Frontend and backend build in parallel while tests scaffold
- Anticipatory work pattern: tests and implementation converge without blocking

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

### 9. .NET Aspire Cloud-Native App

```
Build a cloud-native app with .NET Aspire (read https://learn.microsoft.com/en-us/dotnet/aspire/):
- AppHost orchestrating all services
- Blazor Server dashboard: current conditions + 5-day forecast for saved cities
- Weather API service: wraps OpenWeatherMap with Redis caching
- User Preferences service: stores cities (PostgreSQL)
- Background Worker: refreshes cache every 15 minutes
- Service discovery via Aspire (no hardcoded URLs)
- Health checks and OpenTelemetry tracing

Team organized by Aspire integration: AppHost/discovery, Redis caching, PostgreSQL, Blazor frontend, background worker. Tester validates service discovery and end-to-end data flow. Set up the team.
```

**What it demonstrates:**
- Agents specialized by infrastructure component rather than traditional roles
- AppHost coordinates wiring while service agents build independently
- Infrastructure decisions (service names, connection strings) propagate via decisions.md

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

Team: web app migration, WCF-to-API, Windows Service-to-Functions, shared models, Azure infrastructure, CI/CD, tester. Start with migration plan.
```

**What it demonstrates:**
- Realistic enterprise migration from legacy .NET Framework to modern Azure
- Agents analyze unfamiliar code and translate to Azure-native patterns
- Business logic preservation while modernizing infrastructure (WCF→REST, MSMQ→Service Bus)

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

One agent per system: economy/trading, galaxy generator/map, combat, multiplayer/networking, frontend UI, tester. Economy and galaxy work simultaneously — agree on star system data format early. Go.
```

**What it demonstrates:**
- Complex game with 6+ agents owning distinct but interoperating systems
- Data format decisions shared early and respected across all agents
- Economy and galaxy agents work in parallel from turn 1

---

### 12. AI Recipe App with Image Recognition

```
Build recipe app with image recognition (React Native Expo, Python FastAPI, SQLite):
- Camera: photograph ingredients
- Image analysis: GPT-4 Vision to identify ingredients
- Recipe matching: match against database (50+ recipes)
- Recipe display: ingredients (have vs. need), instructions, time
- Favorites: save, rate, notes
- Shopping list: auto-generate missing ingredients
- Dietary filters: vegetarian, vegan, gluten-free, dairy-free

One agent: React Native frontend. One: FastAPI backend + DB. One: vision/AI integration. One: recipe curation/seed data. Tester: API tests with mocked vision responses. Set up team.
```

**What it demonstrates:**
- Cross-platform mobile + backend + AI integration in one project
- Recipe curator and AI integration agent work simultaneously with shared taxonomy
- Tester mocks vision API responses for deterministic testing before real integration

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

Team: frontend (drag-and-drop), backend (execution engine), Docker/infrastructure, security (secrets), tester. Set up team.
```

**What it demonstrates:**
- Agents with diverse expertise (UI, containers, cryptography) on one product
- Execution engine and pipeline designer build in parallel with shared data model
- Security agent works independently on secrets encryption

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

One agent per: dungeon gen, combat + AI, items + loot, rendering + fog of war, tester. All build simultaneously with shared tile/entity data model. Start building.
```

**What it demonstrates:**
- Four independently buildable systems converging on shared data model
- Early data model decision via decisions.md enables full parallelism
- Tester validates game math from specs while systems are under construction

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

Frontend agent: React Flow + drag-and-drop. Networking: WebSocket sync + conflict resolution. Backend: rooms + persistence. Tester: Playwright multi-user drag-and-drop tests. Set up team.
```

**What it demonstrates:**
- Networking and frontend agents coordinate closely on React Flow data model
- Frontend leverages React Flow's built-in features while networking syncs across users
- Tester writes multi-context Playwright tests for real-time sync validation

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

One agent: 3D dice/physics. One: PWA/gesture handling. One: multiplayer backend (rooms, WebSocket, scores). One: game logic. Tester: mobile Playwright for touch + multiplayer. Set up team.
```

**What it demonstrates:**
- Mobile-first project with agents specialized by concern (3D, touch, networking, logic)
- 3D and gesture agents coordinate on tap-to-roll triggers and animation states
- PWA requirements and mobile testing showcase production mobile app concerns

---

## Advanced Features

For detailed guidance on advanced features like export/import, GitHub Issues integration, ceremonies, PRD mode, human team members, and skills, see [Tips and Tricks](/tips-and-tricks).

