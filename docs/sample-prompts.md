# Sample Prompts

Ready-to-use prompts that show what Squad can do. Each one describes a project, the kind of team it needs, and what makes it interesting as a Squad demo.

Copy any prompt below, open Copilot, select **Squad**, and paste it in.

---

## Quick Builds

These are small enough that a team can ship them in a single session. Good for seeing parallel fan-out, fast iteration, and agents that don't step on each other.

---

### 1. CLI Pomodoro Timer

```
I'm building a cross-platform CLI pomodoro timer in Python. It should support:
- Configurable work/break intervals with sensible defaults (25/5/15)
- A persistent stats tracker that logs completed sessions to a local JSON file
- Desktop notifications on macOS, Windows, and Linux
- A "focus mode" that blocks a configurable list of domains by writing to /etc/hosts (with undo on break)
- A --report flag that prints weekly stats as a table

Set up the team. I want this done fast — everyone works at once.
```

**What it demonstrates:** Parallel fan-out on a small, well-scoped project. Backend handles the timer and host-blocking logic, a systems agent handles cross-platform notifications, the tester writes test cases from the spec while implementation is in flight.

---

### 2. Markdown Static Site Generator

```
I want a zero-dependency static site generator in Node.js. It takes a folder of markdown files, converts them to HTML using a single built-in template, generates an index page with links to all pages, and outputs everything to a dist/ folder. It should support front matter (title, date, tags), generate tag index pages, and include an RSS feed. No frameworks, no bundlers — just fs, path, and a markdown parser we write ourselves.

Set up the team and start building.
```

**What it demonstrates:** Tight collaboration between agents who own different parts of the pipeline (parser, template engine, RSS generator, file I/O). The tester can write test cases from the spec immediately while the others build. Decisions about front matter format propagate via decisions.md.

---

### 3. Retro Snake Game

```
Build a browser-based Snake game using vanilla HTML, CSS, and JavaScript. No frameworks. Requirements:
- Canvas-based rendering at 60fps
- Arrow key and WASD controls
- Score tracking with localStorage high scores
- Progressive speed increase every 5 points
- A retro CRT-style visual effect using CSS filters
- Mobile support via touch swipe controls
- Sound effects using the Web Audio API

Start building immediately — I want to play this in 20 minutes.
```

**What it demonstrates:** A game where frontend, audio, and input handling can all be built in parallel. The tester writes Playwright tests for keyboard input, scoring, and game-over conditions while the game is being built. Fast iteration — agents can see each other's output and adjust.

---

### 4. Turn-by-Turn Text Adventure Engine

```
Build a text-based adventure game engine in TypeScript. The engine should:
- Load worlds from JSON files that define rooms, items, NPCs, and transitions
- Support a command parser that handles: go [direction], look, take [item], use [item] on [target], talk to [npc], inventory
- Include a sample adventure with at least 10 rooms, 5 items, 3 NPCs, and 2 puzzles
- Support save/load game state to JSON
- Run in the terminal via Node.js with colored output (chalk)
- Include a "narrator voice" system where room descriptions vary based on items in inventory or previous actions

Build the engine and the sample adventure at the same time. The content writer and the engine builder should work in parallel.
```

**What it demonstrates:** A natural split between engine (parser, state machine, I/O) and content (world design, narrative, puzzles). These two streams can run fully in parallel. The tester writes test cases for command parsing and state transitions from the spec alone. Decisions about data format are shared and respected across streams.

---

### 5. Arcane Duel — A Card Battle Game

```
Build a strategic card duel game inspired by Magic: The Gathering, playable in the browser. Two players take turns drawing from a shared deck and playing cards onto a battlefield. Requirements:
- 30+ unique cards across 4 categories: Attack, Defense, Spell, Trap
- Each card has: name, mana cost, power, toughness (if creature), effect text
- Turn phases: Draw → Main (play cards, activate abilities) → Combat (declare attackers/blockers, resolve damage) → End
- Mana system: 1 mana gained per turn, max 10. Some cards generate bonus mana.
- Stack-based spell resolution: spells and traps can be played in response to other spells
- Health points: each player starts at 20 HP, wins when opponent reaches 0
- AI opponent with basic strategy (prioritize removal, protect low HP, bluff traps)
- Visual battlefield using HTML/CSS grid layout showing each player's field, hand, graveyard
- Card hover preview with full art and effect text

I want one agent designing the card set and balance, another building the game engine and rules, another building the UI, and someone testing the combat math. Go.
```

**What it demonstrates:** Deep parallelism with interdependent design. The card designer and engine builder must share data format decisions early (via decisions.md). The UI agent can scaffold the battlefield while cards are still being designed. The tester validates combat resolution math from the rules spec. This is a project where the Scribe's decision propagation is critical — when the card designer decides on mana curve, the engine and AI both need to know.

---

### Squad Blog Engine (Meta Demo)

```
Build a static blog engine that renders markdown blog posts into beautiful HTML pages.
No frameworks — just HTML, CSS, and vanilla JavaScript.

Input: markdown files from a docs/blog/ directory. Each file has YAML frontmatter
(title, date, author, wave, tags, status, hero).

Output:
- An index page listing all posts, sorted by date, with title, hero text, author, and tags
- Individual post pages with clean typography, syntax-highlighted code blocks, and responsive tables
- A tag index page that groups posts by tag
- Wave navigation: "← Previous Wave | Next Wave →" links on each post
- Dark mode toggle (CSS custom properties, saved to localStorage)
- RSS feed (feed.xml)

Design direction:
- Clean, modern, developer-focused. Think GitHub's blog meets a personal dev blog.
- Monospace headings, proportional body text
- Code blocks with a dark theme and copy-to-clipboard button
- Mobile responsive — single column on small screens
- Fast. No JavaScript required for reading — JS only for dark mode toggle and copy button.
- Hero section on the index page with the blog title and a one-liner about the project.

The markdown parser should handle: headings, paragraphs, lists, code blocks (fenced),
inline code, bold, italic, links, images, blockquotes, horizontal rules, and tables.

Build the parser, the template engine, the RSS generator, and the static file output.
Put the output in a dist/ folder. Include a build script that can be run with
`node build.js` to regenerate the site.

Set up the team and build it. I want to see this running in one session.
```

**What it demonstrates:** The ultimate meta-demo — Squad builds the tool that publishes Squad's own progress story. Input is markdown files Squad already writes (wave completion posts in `docs/blog/`). Parser, templating, RSS, and responsive CSS can all be built in parallel. The finished product is visual (screenshots well), functional (actually renders real content), and narratively perfect: "Squad built this to tell you about itself."

---

## Mid-Size Projects

These need real coordination. Agents make architectural decisions, share them, and build on each other's work across multiple rounds.

---

### 6. Cloud-Native E-Commerce Store

```
Build an event-driven e-commerce store with these services:
- Product Catalog API (Node.js/Express, PostgreSQL) — CRUD for products with categories and search
- Order Service (Node.js) — accepts orders asynchronously via a message queue, validates inventory, processes payment stubs, emits order-status events
- Notification Service — listens for order events, sends email confirmations (stub/log)
- API Gateway — routes requests, handles auth (JWT), rate limiting
- Message queue: use RabbitMQ (or an in-memory stub for local dev)
- Frontend: React SPA with product grid, cart, checkout flow

Each service should be independently deployable with its own Dockerfile. Include a docker-compose.yml that brings up the entire system. The order flow must be fully asynchronous — the checkout endpoint returns 202 Accepted immediately, and order status is polled or pushed via WebSocket.

Set up a team. I want each service owned by a different agent. Let them coordinate on API contracts and event schemas early, then build in parallel.
```

**What it demonstrates:** True microservice parallelism. Each service agent works independently after agreeing on contracts (shared via decisions.md). The tester writes integration tests for the order flow end-to-end. Agents must share event schema decisions early — Scribe propagation matters. The API gateway agent can scaffold while downstream services are being built.

---

### 7. Playwright-Tested Dashboard App

```
Build a project management dashboard using React + TypeScript with a Node.js/Express backend. Features:
- Kanban board with drag-and-drop (columns: Backlog, In Progress, Review, Done)
- Task creation with title, description, assignee, priority, due date
- Filtering by assignee, priority, and status
- Real-time updates via WebSocket (when one user moves a card, others see it)
- User auth with login/signup (JWT, bcrypt)
- SQLite database with Drizzle ORM

Testing requirements (critical — this is the demo):
- Full Playwright test suite covering:
  - Login flow (valid credentials, invalid credentials, session persistence)
  - Task CRUD (create, edit, delete, verify persistence after refresh)
  - Drag-and-drop (move task between columns, verify state update)
  - Filtering (apply filters, verify correct tasks shown, clear filters)
  - Real-time sync (open two browser contexts, move card in one, verify update in other)
- Generate Gherkin feature files (.feature) for every user story FIRST, then implement Playwright step definitions
- Tests must be runnable with `npx playwright test` and produce an HTML report

Set up the team. I want the Gherkin specs and Playwright tests written from requirements BEFORE the implementation starts, then updated as the real UI takes shape.
```

**What it demonstrates:** Test-first parallel development. The tester writes Gherkin feature files and Playwright test skeletons immediately from the requirements — no waiting for implementation. Frontend and backend build in parallel. Once the UI exists, the tester updates tests to match actual selectors. This shows Squad's anticipatory work pattern at its best: tests and implementation converge without blocking each other.

---

### 8. GitHub Copilot Extension

```
Build a GitHub Copilot Chat extension using the Copilot Extensions SDK (https://github.com/copilot-extensions). The extension should:
- Act as a "Code Reviewer" agent that users can invoke via @code-reviewer in Copilot Chat
- Accept a GitHub repo URL or PR number as input
- Fetch the diff (via GitHub API) and analyze it for:
  - Security issues (SQL injection, XSS, hardcoded secrets, insecure deserialization)
  - Performance concerns (N+1 queries, unbounded loops, missing pagination)
  - Style violations (configurable rules loaded from a .code-reviewer.yml in the target repo)
- Return structured feedback as a Copilot Chat response with file-level annotations
- Include a Blackbeard-style SSE streaming response handler per the SDK patterns
- Deploy as a Vercel serverless function
- Include a manifest file for registering as a GitHub App

Read the Copilot Extensions SDK docs and examples carefully. One agent should own the SDK integration and streaming protocol, another should own the analysis engine, another should own the GitHub API integration. Set up the team.
```

**What it demonstrates:** Agents that need to read external documentation and build to an SDK's patterns. The SDK integration agent and the analysis engine agent work in parallel — one handles the protocol, the other handles the logic. They agree on the interface contract via decisions.md. Shows Squad working with real-world APIs and deployment targets.

---

### 9. Aspire Cloud-Native App

```
Build a cloud-native application using Aspire. Read https://aspire.dev/docs for the Aspire programming model. Install the Aspire CLI and use `aspire agent init` to configure an agent ready environment. 

The app is a real-time weather dashboard:
- AppHost project orchestrating all services
- Frontend: Blazor Server dashboard showing current conditions and 5-day forecast for saved cities
- Weather API service: wraps OpenWeatherMap API with caching (Redis via Aspire integration)
- User Preferences service: stores saved cities per user (PostgreSQL via Aspire integration)
- Background Worker: refreshes cached weather data every 15 minutes for all saved cities (uses Aspire Worker template)
- Service-to-service communication via Aspire service discovery (no hardcoded URLs)
- Health checks and OpenTelemetry tracing via Aspire defaults

I want the team organized by Aspire integration:
- One agent owns the AppHost and service discovery wiring
- One agent owns the Redis caching integration
- One agent owns the PostgreSQL data layer
- One agent owns the Blazor frontend
- One agent owns the background worker
- The tester validates that services discover each other and data flows end-to-end

Set up the team. Each agent should understand their specific Aspire integration deeply.
```

**What it demonstrates:** Agents specialized by infrastructure integration rather than traditional roles. Each agent is an expert in one Aspire component. The AppHost agent coordinates wiring while service agents build independently. Decisions about service names and connection strings propagate through decisions.md. Shows Squad handling a .NET-specific ecosystem with genuine infrastructure concerns.

---

## Large Projects

These push coordination, memory, and team size. Multiple rounds of work, cross-cutting decisions, and agents that need to remember what happened earlier.

---

### 10. Legacy .NET-to-Azure Migration

```
I have a legacy .NET Framework application that needs to be migrated to Azure. Clone these two repos to start:

1. https://github.com/bradygaster/ProductCatalogApp — ASP.NET MVC (.NET Framework) web app with:
   - Product catalog with shopping cart functionality
   - WCF service (SOAP) for product data access
   - In-memory product repository
   - Order submission to MSMQ (Message Queue)
   - jQuery-based frontend

2. https://github.com/bradygaster/IncomingOrderProcessor — Windows Service that:
   - Monitors MSMQ for incoming orders
   - Processes and logs orders from the queue
   - Runs continuously as a background service

The migration target:
- ProductCatalogApp → ASP.NET Core MVC (.NET 10) or Blazor on Azure App Service
  - Replace WCF SOAP service with ASP.NET Core Web API (REST)
  - Keep in-memory repository initially, but structure for Azure SQL migration
  - Replace MSMQ with Azure Service Bus queues
  - Modernize frontend (keep MVC or migrate to Blazor)
- IncomingOrderProcessor → Azure Functions (.NET 8) with Service Bus trigger
  - Convert Windows Service to serverless function
  - Trigger on Service Bus queue messages
  - Maintain same order processing logic
- Shared models → .NET 10 class library used by both services
- Infrastructure: Bicep templates for App Service, Function App, Service Bus namespace and queue
- CI/CD: GitHub Actions workflows for both services
- Local dev: docker-compose or Aspire for running everything locally

Migration rules:
- Preserve all business logic — orders must flow identically
- WCF SOAP contracts become REST APIs with the same data structures
- MSMQ queue becomes Azure Service Bus queue with compatible message format
- The Windows Service becomes a Service Bus-triggered Azure Function
- All services must work locally before Azure deployment

I need a migration team: one agent for the web app migration, one for the WCF-to-API conversion, one for the Windows Service-to-Functions migration, one for shared models, one for Azure infrastructure (Bicep), one for CI/CD, and a tester who validates that orders flow end-to-end correctly. Set up the team and start with the migration plan.
```

**What it demonstrates:** The most realistic Squad scenario — migrating actual legacy .NET Framework code to modern Azure. The team must understand existing WCF patterns, MSMQ messaging, Windows Services, and translate them to Azure-native equivalents (REST APIs, Service Bus, Functions). Shows true enterprise migration challenges: agents analyze unfamiliar code, preserve business logic while modernizing infrastructure, coordinate on message formats and shared models, and validate behavioral equivalence across the migration.

---

### 11. Multiplayer Space Trading Game

```
Build a multiplayer space trading game playable in the browser. Think Elite Dangerous meets a browser game.

Game systems:
- Galaxy map: procedurally generated star systems (50+) with stations, connected by trade routes
- Economy: each station buys/sells commodities (fuel, ore, food, tech, luxuries) at dynamic prices driven by supply/demand
- Ships: 3 tiers (shuttle, freighter, cruiser) with cargo capacity, fuel range, and hull strength
- Trading: buy low, sell high. Prices shift based on player activity and random events
- Combat: simple turn-based encounters with pirates or other players at jump points
- Multiplayer: WebSocket-based real-time. Players see each other on the galaxy map. Chat. PvP opt-in.
- Persistence: player state (credits, cargo, location, ship) saved to PostgreSQL
- Frontend: Canvas-based galaxy map, HTML/CSS panels for station UI, trading, inventory

Tech stack: Node.js backend, PostgreSQL, WebSocket (ws), vanilla HTML/CSS/Canvas frontend.

I want one agent on the economy/trading engine, one on the galaxy generator and map rendering, one on combat mechanics, one on multiplayer/networking, one on the frontend UI panels, and the tester. The economy designer and galaxy generator can work simultaneously — they just need to agree on the star system data format early. Go.
```

**What it demonstrates:** A complex game with 6+ agents, each owning a distinct game system that must interoperate. Data format decisions (star system schema, ship stats, commodity definitions) are shared early and respected across all agents. The economy and galaxy agents work in parallel from turn 1. Combat and multiplayer can scaffold independently. The tester writes test cases for trade math, combat resolution, and economy simulation before implementation is final.

---

### 12. AI Recipe App with Image Recognition

```
Build a recipe app where users can photograph ingredients and get recipe suggestions. Tech stack: React Native (Expo) frontend, Python FastAPI backend, SQLite.

Features:
- Camera capture: user photographs ingredients on a counter
- Image analysis: send photo to a vision model (use OpenAI's GPT-4 Vision API) to identify ingredients
- Recipe matching: match identified ingredients against a recipe database (seed with 50+ recipes)
- Recipe display: ingredients list (highlighting what you have vs. what you need), step-by-step instructions, estimated time
- Favorites: save recipes, rate them, add notes
- Shopping list: auto-generate a list of missing ingredients
- Dietary filters: vegetarian, vegan, gluten-free, dairy-free

I want one agent on the React Native frontend, one on the FastAPI backend and database, one on the vision/AI integration, one curating the recipe database and seed data, and the tester writing API tests and mocking the vision responses. Set up the team.
```

**What it demonstrates:** Cross-platform mobile + backend + AI integration. The recipe curator and the AI integration agent can work simultaneously — one builds the database, the other figures out the vision API interface. They agree on the ingredient taxonomy via decisions.md. The tester mocks vision API responses to write deterministic tests before the real integration exists. Shows Squad handling AI/ML service integrations.

---

### 13. DevOps Pipeline Builder

```
Build a self-service DevOps platform where teams can define their CI/CD pipelines through a web UI. Tech stack: React frontend, Go backend, PostgreSQL, Docker.

Features:
- Pipeline designer: drag-and-drop UI for composing pipeline stages (build, test, deploy, notify)
- Stage templates: pre-built stages for common tasks (npm build, Docker build, Helm deploy, Slack notify)
- Pipeline execution: stages run as Docker containers orchestrated by the Go backend
- Live logs: stream build output to the browser via SSE
- Pipeline-as-code: export/import pipelines as YAML (compatible with GitHub Actions syntax)
- Secrets management: encrypted storage for API keys, registry credentials
- Execution history: searchable log of all pipeline runs with status, duration, artifacts

I need a frontend agent for the drag-and-drop pipeline designer, a backend agent for the execution engine, a Docker/infrastructure agent for container orchestration, a security agent for secrets management, and a tester. Set up the team.
```

**What it demonstrates:** Agents with very different expertise domains (UI drag-and-drop, container orchestration, cryptography) working on a single product. The execution engine and pipeline designer can be built in parallel once they agree on the pipeline data model. The security agent works independently on secrets encryption. Shows Squad handling infrastructure-heavy projects.

---

### 14. Roguelike Dungeon Crawler

```
Build a browser-based roguelike dungeon crawler. Procedurally generated dungeons, permadeath, turn-based combat.

Requirements:
- Dungeon generation: procedural rooms + corridors using BSP or cellular automata, 10 floors with increasing difficulty
- Character: warrior/mage/rogue classes with unique abilities (3 each), health/mana/stamina stats
- Combat: turn-based, grid-positioned. Melee, ranged, and AoE attacks. Enemy AI that flanks, retreats when low HP, and uses abilities
- Items: weapons, armor, potions, scrolls. Random loot tables per floor. Item identification system (unidentified scrolls/potions until used)
- Fog of war: tile-based visibility using raycasting from player position
- Rendering: HTML5 Canvas with tilemap. 16x16 or 32x32 pixel art style (use simple colored squares if no art assets)
- Permadeath: when you die, it's over. High score table with character name, class, floor reached, cause of death
- Save system: save-on-exit only (no save scumming). LocalStorage.

I want one agent on dungeon generation, one on combat + enemy AI, one on items + loot tables, one on rendering + fog of war, and the tester. These can all build simultaneously as long as they agree on the tile/entity data model. Start building.
```

**What it demonstrates:** Game systems that are independently buildable but share a common data model. Dungeon generation, combat, items, and rendering are four parallel streams that converge on a shared entity/tile format. The early decision on data model (via decisions.md) enables full parallelism. The tester validates combat math, loot distribution, and fog of war calculations from specs.

---

### 15. Real-Time Collaborative Whiteboard

```
Build a real-time collaborative whiteboard app using React Flow for the node/shape editor. Think Miro or Excalidraw but simpler. Tech stack: React + TypeScript + React Flow frontend, Node.js backend, WebSocket.

Features:
- Built on React Flow (https://reactflow.dev/) for drag-and-drop node-based editing
- Shape library: rectangles, circles, text nodes, sticky notes, arrows/edges connecting shapes
- Drag-and-drop: users can drag shapes from a palette onto the canvas, drag to reposition, drag handles to resize
- Color picker, stroke width, fill color, background color per shape
- Connect shapes with arrows (React Flow edges) — drag from one shape to another
- Select multiple shapes (bounding box selection), move/delete/style as a group
- Real-time sync: multiple users see each other's cursors and edits via WebSocket
- Rooms: shareable URL creates a room, anyone with the link can join
- Undo/redo per user (each user has their own undo stack)
- Export to PNG and SVG (React Flow has built-in export utilities)
- Persistence: save canvas state (nodes, edges, viewport) to PostgreSQL, auto-save every 30 seconds

I want a frontend agent owning the React Flow integration and drag-and-drop interactions, a networking agent owning the WebSocket sync and conflict resolution (CRDT or OT for canvas state), a backend agent owning rooms and persistence, and a tester writing Playwright tests for multi-user drag-and-drop scenarios. Set up the team and build it.
```

**What it demonstrates:** A project where the networking/sync agent and the frontend agent must closely coordinate on the React Flow data model (nodes, edges, viewport state). The frontend agent leverages React Flow's built-in drag-and-drop and handles, while the networking agent syncs changes across users. The backend agent can work independently on rooms and persistence. The tester writes multi-context Playwright tests (two browsers in one test) to validate real-time drag-and-drop sync — a direct showcase of Playwright's multi-page testing and React Flow's powerful node-based editor capabilities.

---

### 16. Multiplayer Dice Roller — Bar Games PWA

```
Build a mobile-first Progressive Web App for rolling dice with friends at a bar. The vibe: tapping your phone on a virtual green velvet table, realistic 3D dice tumbling across the screen. Tech stack: React + TypeScript, Three.js (or React Three Fiber), Node.js + WebSocket backend, PostgreSQL.

Features:
- Mobile-first responsive design: works perfectly on phones, tablets, and desktop
- PWA: installable on home screen, works offline (cached dice rolls when disconnected, sync when back online)
- Double-tap gesture: tap the screen twice anywhere to roll the dice — they bounce and tumble realistically across a green velvet table
- 3D dice physics: use Three.js or React Three Fiber for realistic dice with physics simulation (gravity, bounce, spin, settle)
- Customizable dice: choose number of dice (1-10), die type (d6, d10, d12, d20), color schemes
- Real-time multiplayer: 
  - Create a room with a shareable 6-digit code or QR code
  - Friends join the same room via code or QR scan
  - Everyone sees everyone's rolls in real-time with player names
  - Room chat for banter and trash talk
- Game modes with score tracking:
  - Freeroll: just roll, no rules, all rolls logged
  - Yahtzee: automated scoring, tracks categories, end-of-game leaderboard
  - Liar's Dice: player declarations, challenge system, elimination rounds
  - Custom: define your own scoring rules (high roll wins, sum target, etc.)
- Score history: view roll history for the session, replay animations, export session log as JSON
- Sound effects: dice clatter, table bounce (mute toggle)
- Haptic feedback on mobile: vibrate on roll, on settle
- Night mode: dark UI with brighter dice for late-night bar sessions

I want one agent on the Three.js 3D dice rendering and physics, one agent on the mobile PWA setup and touch gesture handling, one agent on the real-time multiplayer backend (rooms, WebSocket, score sync), one agent on game logic (different game modes, scoring rules, turn management), and a tester writing mobile Playwright tests for touch gestures and multiplayer roll sync. Set up the team and build it.
```

**What it demonstrates:** A mobile-first project where agents specialize by concern: 3D graphics, touch UX, real-time networking, and game logic. The 3D agent and the gesture agent must coordinate on the tap-to-roll trigger and animation states. The game logic and networking agents share data models for scores and turns. The PWA requirements (offline support, install prompt) and mobile testing (touch events, multi-device Playwright tests) showcase Squad handling production mobile app concerns. This is also a fun, visual demo — you can actually play dice games with the finished product.

---

## Feature Showcases

These prompts are designed to exercise Squad's advanced features — export/import, skills, ceremonies, PRD mode, GitHub Issues, human team members, and more. Each one is a real project where the feature shows up naturally.

---

### 17. Cross-Platform Habit Tracker — Portable Squad

```
I built a CLI habit tracker with a Squad last month in another repo. I exported the squad with `npx github:bradygaster/squad export` and I have the squad-export.json file ready.

Import it into this repo with `npx github:bradygaster/squad import squad-export.json`.

Now let's build a cross-platform habit tracker with a React Native (Expo) frontend and a Node.js backend:
- Daily habit check-ins with streaks, miss tracking, and weekly summaries
- Habit categories (health, learning, productivity) with custom icons
- Push notification reminders at user-configured times
- SQLite local-first storage with optional cloud sync (Supabase)
- Charts: streak heatmap (GitHub-style), weekly completion rate, category breakdown
- Widget support for iOS and Android home screens

The team should already know my preferences from the last project. Start building.
```

**What it demonstrates:** Export/import in action. The squad arrives with earned preferences and skills from a previous project — coding style, testing patterns, communication style. The user doesn't re-explain anything. The team picks up where it left off, in a brand new repo. This is the "holy crap, it remembers me" moment.

---

### 18. Open Source Contribution Dashboard — GitHub Issues + Skills

```
Pull issues from bradygaster/squad. Show me the open issues and let me pick which ones to work on.

While we're at it, the team should build skills as they go — if someone figures out a pattern for testing CLI installers or working with the Copilot Extensions SDK, write it down as a skill so the team gets better over time.
```

**What it demonstrates:** GitHub Issues Mode — connecting to a real repo, listing the backlog, and letting the user pick issues for agents to claim. Each issue flows through the full lifecycle: branch, implement, PR. The skills instruction shows how agents earn reusable SKILL.md files as they work, building team competence that persists across sessions.

---

### 19. Event-Driven Inventory System — PRD + Ceremonies

```
Here's the PRD at docs/inventory-prd.md — it describes an event-driven inventory management system for a small warehouse operation.

Before the team starts building, run a design review. I want the Lead to decompose the PRD into work items first, then the team should discuss architecture choices (event sourcing vs. CRUD, message broker selection, data model) before anyone writes code.

Tech constraints from the PRD:
- Node.js services, PostgreSQL, Redis for event streaming
- REST API for external integrations, WebSocket for real-time dashboard
- Barcode scanner input via serial port (node-serialport)
- Audit log for every inventory mutation
```

**What it demonstrates:** PRD Mode and Ceremonies working together. The PRD gets ingested and decomposed into work items by the Lead. A design review ceremony runs before implementation — agents align on architecture, surface trade-offs, and make shared decisions. The ceremony creates alignment that prevents rework. This is how a real team operates: read the spec, discuss, then build.

---

### 20. Developer Portfolio Site — Human Team Member + Tiered Responses

```
I'm building a developer portfolio site. Add my teammate Sarah as Designer — she'll handle visual direction, color palette, and layout decisions. The rest of the team builds it:

- Next.js static site with MDX blog posts
- Project showcase with live demo embeds (CodeSandbox/StackBlitz)
- Interactive terminal-style "about me" section (type commands, get responses)
- Dark/light theme with system preference detection
- Lighthouse score targets: 100 performance, 100 accessibility
- Contact form with Resend for email delivery
- RSS feed and open graph meta tags for social sharing

When work needs Sarah's design input, pause and ask her. Don't guess on visual decisions.
```

**What it demonstrates:** Human team members and tiered response modes. Adding Sarah as Designer puts a real person on the roster — when work routes to her domain (color choices, layout, typography), Squad pauses and asks for her input instead of guessing. Meanwhile, the tiered response system handles the spectrum: quick questions get instant answers (Direct mode), config tweaks get lightweight edits, and the full build fans out across multiple agents (Full mode). The team adapts its effort to the task size automatically.

---

### 21. API Client SDK Generator — Skills + Smart Upgrade

```
Before we start, run `npx github:bradygaster/squad` to make sure we're on the latest version.

Now build an SDK generator that takes an OpenAPI 3.1 spec and produces typed client libraries:
- TypeScript SDK with fetch-based HTTP client, Zod runtime validation, and full JSDoc
- Python SDK with httpx, Pydantic models, and type hints
- Auto-generated test suites for both SDKs (mock server from the spec)
- CLI tool: `sdkgen generate --spec api.yaml --lang typescript --output ./sdk/`
- Watch mode: re-generate when the spec file changes
- Changelog diff: when the spec changes, output a human-readable summary of what changed in the API

Each language generator is a plugin. The architecture should make adding a Go or Rust generator later trivial.

As the team works, they should write skills for patterns they discover — OpenAPI parsing edge cases, code generation techniques, test mocking strategies. These should be reusable on future SDK projects.
```

**What it demonstrates:** Smart upgrade and skills. Running `npx github:bradygaster/squad` in an existing repo detects version differences and migrates — the team gets new capabilities without losing any state. As agents build the SDK generator, they write SKILL.md files for patterns they discover (OpenAPI parsing quirks, code generation idioms). Those skills persist and inform future work — the next time this squad tackles an API project, it arrives with earned expertise.

---

### 22. Community Recipe Book — GitHub Issues + Human Team + History Summarization

```
Pull issues from our-org/community-recipes. These are feature requests from our users for a community recipe sharing platform.

Add my teammate Alex as Content Lead — they'll review recipe data models and taxonomy decisions. When there's a question about how to categorize cuisines or structure ingredient lists, ask Alex.

The platform:
- Next.js app with Prisma + PostgreSQL
- User-submitted recipes with rich text editor (Tiptap)
- Ingredient parser that handles natural language ("2 large eggs, beaten" → structured data)
- Dietary tags with smart detection (scan ingredients for common allergens)
- Recipe scaling (adjust servings, recalculate quantities)
- Social features: favorites, collections, comments, user profiles
- Full-text search with filters (cuisine, dietary, cook time, difficulty)

We've been working on this for a few sessions now. The Scribe should summarize older history entries to keep things compact — we don't need the play-by-play from three sessions ago, just the decisions and learnings.
```

**What it demonstrates:** Three features in one natural workflow. GitHub Issues Mode pulls real user requests from the backlog. A human team member (Alex) owns content decisions — the team pauses for their input on taxonomy and data modeling. History summarization keeps the team's memory compact after multiple sessions: the Scribe progressively summarizes older entries, archiving the originals so nothing is lost but the working context stays lean. This is what a mature, multi-session project looks like.

---

### 23. IoT Dashboard — Full Ceremony Lifecycle + PRD + Export

```
Here's the PRD at specs/iot-dashboard.md — it describes a real-time IoT sensor dashboard for a small manufacturing floor.

Run a design review before building. After the first milestone ships, run a retro — I want the team to reflect on what worked and what didn't.

Requirements from the PRD:
- React dashboard with real-time sensor charts (Recharts + WebSocket)
- Node.js ingestion service accepting MQTT messages from sensors
- TimescaleDB for time-series storage with automatic data retention policies
- Alert rules engine: threshold alerts, rate-of-change alerts, dead sensor detection
- Multi-tenant: each manufacturing client sees only their sensors
- Historical data export to CSV and JSON

When we're done, export the squad — I want to bring this team's knowledge to our next IoT project.
```

**What it demonstrates:** The full ceremony lifecycle plus PRD Mode and export. A design review ceremony runs before the team touches code — agents align on architecture for a complex real-time system. After the first milestone, a retro ceremony captures what worked and what to improve. PRD Mode structures the entire build around a spec document. When the project wraps, `npx github:bradygaster/squad export` captures everything the team learned — MQTT patterns, time-series strategies, alert engine design — as a portable snapshot ready for the next project.

---

## v0.2.0 Feature Prompts

Quick prompts that exercise specific v0.2.0 features. Use these to try out individual capabilities without building a full project.

---

### Export & Import

```
Export this squad so I can use it in another repo.
```

```
npx github:bradygaster/squad export
```

```
Import the squad from my previous project: npx github:bradygaster/squad import squad-export.json
```

```
Export just the team state — I want to send the snapshot to a colleague starting a similar project.
```

```
I imported a squad from another repo. Show me what the team remembers from the previous project.
```

---

### GitHub Issues

```
Connect to our GitHub repo and pull the open issues. Show me the backlog.
```

```
Which issues are highest priority? Let the Lead triage and assign them to the right agents.
```

```
Work issue #42 — the Lead should break it down and assign the right agent. Create a branch, implement, and open a PR.
```

```
Show me all issues the team has completed this session. Summarize what was done for each one.
```

```
Close issue #15 and merge the PR — the tester confirmed it passes.
```

---

### PRD Mode

```
Here's our PRD at docs/product-requirements.md — ingest it and decompose it into work items.
```

```
Show me the work items from the PRD. Which ones are ready to start and which are blocked?
```

```
The PRD has been updated — re-read docs/product-requirements.md and flag any new or changed requirements.
```

```
Map the PRD work items to team members. Who owns what?
```

---

### Human Team Members

```
Add my teammate Jordan as Designer — they'll handle visual direction and UX decisions.
```

```
Remove the human designer from the team — we're past the design phase.
```

```
When work involves database schema decisions, route it to Alex instead of having the AI decide.
```

```
Show me the team roster. Which members are AI and which are human?
```

```
The frontend needs a color palette. Pause and ask Jordan — don't guess on visual decisions.
```

---

### Skills

```
What skills has the team earned so far? Show me the full skill inventory.
```

```
Show me the confidence levels for the frontend agent's skills. Which ones are mature?
```

```
The backend agent figured out a caching pattern that works well. Write it as a skill so the team remembers it.
```

```
Which skills have decayed? Are there any the team should refresh by practicing again?
```

---

### Ceremonies

```
Run a retro — I want the team to reflect on what worked and what didn't this sprint.
```

```
Before we start building, run a design review. The Lead should present the architecture and the team should challenge it.
```

```
Run a standup — each agent reports what they did, what they're doing next, and any blockers.
```

```
Create a custom ceremony called "Demo Day" where each agent presents what they built and the team gives feedback.
```

```
Schedule a retro after every third session automatically.
```

---

## v0.3.0 Feature Prompts

Quick prompts that exercise specific v0.3.0 features. Use these to try out individual capabilities.

---

### Ralph — Work Monitor

```
Enable Ralph to watch the team's work. Start monitoring background task execution.
```

```
Check Ralph's status — show me what the team is currently working on and task queue depth.
```

```
Ralph, configure idle-watch mode. Alert me if an agent hasn't made progress for more than 10 minutes.
```

```
Scope Ralph's monitoring to just the backend agent. Ignore frontend for now.
```

```
Show me Ralph's activity log for the past hour — what tasks completed, what failed, what's queued?
```

---

### Per-Agent Model Selection

```
Override the model for the backend agent — use Claude Opus for complex database design instead of the default.
```

```
Run this feature with a cheaper model to save costs. Use GPT-4 Mini for the frontend work.
```

```
Bump the Lead's model to Claude Opus for this session. We need better reasoning for architecture decisions.
```

```
The frontend agent just used Haiku for the styling work. Show me what model was used.
```

```
Set up model rotation: use Opus for design reviews, Sonnet for implementation, Haiku for tests.
```

---

### @copilot Coding Agent

```
Add @copilot to the team as the coding specialist. Auto-assign code generation and refactoring to them.
```

```
Configure @copilot to handle all TypeScript work. Route TypeScript issues directly to them.
```

```
Show me @copilot's capabilities. What can they do and what do they need human review on?
```

```
@copilot just finished the component refactor. Review their work before I merge.
```

```
Remove @copilot from the team. We're doing code review manually going forward.
```

---

### Labels & Triage

```
Add priority labels to all open issues. What's critical vs. nice-to-have?
```

```
Show me the triage status for issue #42. Who said what about the verdict?
```

```
Change the verdict on issue #8 from "blocked" to "ready-to-start" — the dependency is resolved.
```

```
Tag issues for the v1.0 release. Show me what's targeted for the next milestone.
```

```
Set priority: mark frontend bugs as P1, documentation updates as P3.
```

---

### Directives

```
Set a coding style preference: prefer functional components over class components in React.
```

```
Add a scope constraint: don't touch authentication logic without explicit approval from the Lead.
```

```
Set a process rule: all pull requests must have a code review before merging.
```

```
Show me the team's current directives. What rules are we following?
```

```
Update the documentation preference: use JSDoc for all public functions with @param and @return tags.
```

---

### Parallel Execution

```
Start these three tasks in parallel: implement the API endpoint, write tests, and update docs.
```

```
Run this work in sync mode — I want real-time output instead of background execution.
```

```
Check the status of my background agents. Which tasks completed and which are still running?
```

```
The frontend and backend agents are working in parallel. Show me their progress separately.
```

```
Cancel the background task for the database migration — we're taking a different approach.
```

---

### Reviewer Protocol

```
Request a code review from Alex before this PR merges. They're our database expert.
```

```
The reviewer rejected my changes. Show me their feedback and what needs to be fixed.
```

```
Reassign the PR review to Jordan — the original reviewer is busy with another task.
```

```
I've addressed the review feedback. Re-request approval from the reviewer.
```

```
Show me all PRs waiting for review. Who's blocking and when did they last respond?
```

---

### Worktree Awareness

```
I'm working in a git worktree. Update the team root path so commands run in the right directory.
```

```
Switch to a different worktree strategy — we're rotating who works on what branch.
```

```
Show me the team root location. Confirm we're pointing at the right working directory.
```

```
The worktree was deleted. Recover the team state and pick a new working directory.
```

```
I need to work on multiple features in parallel using worktrees. Help me set up the team for that workflow.
```
