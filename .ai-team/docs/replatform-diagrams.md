# Squad SDK Replatform — Visual Architecture

> Requested by Brady. Beautiful Mermaid diagrams telling the story of the TypeScript SDK replatform.

---

## 1. Architecture Comparison: Today vs Tomorrow

**Today:** Node.js CLI + 32KB `squad.agent.md` coordinator prompt  
**Tomorrow:** TypeScript SDK + Config-driven runtime

```mermaid
graph TB
    subgraph current["📦 CURRENT ARCHITECTURE (CLI + Prompt)"]
        direction TB
        CLI["npx github:bradygaster/squad<br/>(Node.js CLI)"]
        Prompt["squad.agent.md<br/>(32KB coordinator prompt)"]
        TeamFiles["Team state files<br/>(.ai-team/decisions.md<br/>.ai-team/agents/*/history.md)"]
        
        CLI -->|spawns agents| Prompt
        Prompt -->|routes requests| Prompt
        Prompt -->|manages| TeamFiles
        
        style CLI fill:#4A90E2,stroke:#2E5C8A,color:#fff,stroke-width:2px
        style Prompt fill:#F5A623,stroke:#D68910,color:#fff,stroke-width:2px
        style TeamFiles fill:#7ED321,stroke:#5FA215,color:#fff,stroke-width:2px
    end
    
    subgraph future["🚀 NEW ARCHITECTURE (SDK + TypeScript)"]
        direction TB
        SDK["Copilot SDK<br/>(CopilotClient, Sessions)"]
        Runtime["TypeScript Runtime<br/>(routing, casting, skills)"]
        Config["Config System<br/>(JSON/YAML)<br/>agents.json, skills.json<br/>routing.json, casting.json"]
        Cache["Agent/Skill Cache<br/>(git-backed)"]
        TeamState["Team state files<br/>(.squad/decisions.md<br/>.squad/agents/*/history.md)"]
        
        SDK -->|creates sessions| Runtime
        Runtime -->|reads| Config
        Runtime -->|caches| Cache
        Runtime -->|manages| TeamState
        
        style SDK fill:#50E3C2,stroke:#2B8A78,color:#fff,stroke-width:2px
        style Runtime fill:#B8E986,stroke:#8BA35D,color:#000,stroke-width:2px
        style Config fill:#FF6B6B,stroke:#CC3333,color:#fff,stroke-width:2px
        style Cache fill:#A29BFE,stroke:#6C63FF,color:#fff,stroke-width:2px
        style TeamState fill:#FFD93D,stroke:#CCAA00,color:#000,stroke-width:2px
    end
    
    current -.->|REPLATFORM| future
```

---

## 2. Feature Parity Matrix

**Status Legend:**
- 🟢 **PORTED** — Feature works in new SDK architecture, unchanged behavior  
- 🔵 **REDESIGNED** — Core feature preserved, new implementation  
- ✨ **NEW** — New capability unlocked by SDK  
- ⚪ **DEPRECATED** — Intentionally removed  
- 🟡 **AT RISK** — Needs PRD clarification

```mermaid
quadrantChart
    title Feature Parity: Current Squad → SDK Replatform
    x-axis Current (broad impl) --> Future (typed system)
    y-axis Low Coverage --> High Priority
    
    Agent Routing: 0.85, 0.95
    Agent Spawning: 0.80, 0.95
    Parallel Execution: 0.75, 0.95
    Charter Injection: 0.70, 0.85
    Decision Tool: 0.80, 0.90
    Casting System: 0.75, 0.90
    Skills System: 0.85, 0.80
    PII Policy: 0.90, 0.95
    File Auth: 0.85, 0.95
    Session Lifecycle: 0.70, 0.90
    Per-Agent Models: 0.85, 0.85
    Ralph Monitor: 0.70, 0.85
    Streaming/Observability: 0.30, 0.95
    BYOK Multi-Provider: 0.20, 0.90
    MCP Per-Agent: 0.25, 0.85
    A2A Communication: 0.10, 0.85
    Export/Import: 0.50, 0.75
    Workflow Templates: 0.65, 0.70
    Plugin Marketplace: 0.40, 0.65
    
    %%{init: {"quadrant1Fill":"#50E3C2", "quadrant2Fill":"#FFE135", "quadrant3Fill":"#FF6B6B", "quadrant4Fill":"#B8E986", "quadrant1TextFill":"#000", "quadrant2TextFill":"#000", "quadrant3TextFill":"#fff", "quadrant4TextFill":"#000"}}%%
```

---

## 3. Migration Journey: M0 → Launch

**Milestone progression with dependencies and key deliverables**

```mermaid
gantt
    title Migration Timeline: Planning → Launch
    dateFormat YYYY-MM-DD
    
    section Planning
    M0 Discovery: m0, 2026-02-01, 14d
    PRD Inventory: prd, m0, 7d
    Risk Assessment: risk, prd, 7d
    
    section Architecture
    M1 SDK Bootstrap: m1, 2026-02-28, 21d
    TypeScript Setup: ts, m1, 14d
    CopilotClient Integration: cop, ts, 7d
    
    section Core
    M2 Routing & Dispatch: m2, 2026-03-20, 28d
    Agent Routing Engine: rte, m2, 14d
    Casting System (v1): cast, rte, 14d
    
    section Features
    M3 Skills & Config: m3, 2026-04-17, 28d
    SkillSource Interface: skill, m3, 14d
    Config System (JSON): cfg, skill, 14d
    
    section Quality
    M4 Testing & Polish: m4, 2026-05-15, 21d
    Integration Tests: test, m4, 14d
    CLI Polish & Docs: polish, test, 7d
    
    section Distribution
    M5 Launch Prep: m5, 2026-06-05, 14d
    Distribution Channel: dist, m5, 7d
    v1.0.0 Release: rel, dist, 7d
```

---

## 4. Component Architecture: TypeScript SDK Structure

**New system organization — how CopilotClient, AgentSource, SkillSource, and CLI commands relate**

```mermaid
classDiagram
    class CopilotClient {
        +session: Session
        +createSession(config: SessionConfig): Session
        +importAgent(source: AgentSource): Agent
        +importSkill(source: SkillSource): Skill
        -validateSchema(payload)
    }
    
    class Session {
        +id: string
        +state: SessionState
        +run(prompt: string): Promise
        +streamEvents(): AsyncIterator
        +tool(name, handler): void
        +cleanup(): void
    }
    
    class AgentSource {
        +name: string
        +version: string
        +charter: string
        +resolve(): Agent
        +validate(): boolean
    }
    
    class Agent {
        +id: string
        +config: AgentConfig
        +session: Session
        +spawn(): void
        +toString(): string
    }
    
    class SkillSource {
        +name: string
        +manifest: SkillManifest
        +content: string
        +confidence: number
        +resolve(): Skill
    }
    
    class Skill {
        +id: string
        +content: string
        +confidence: ConfidenceLevel
        +inject(): void
    }
    
    class ConfigSystem {
        +agents: AgentConfig[]
        +skills: SkillSource[]
        +routing: RoutingConfig
        +casting: CastingConfig
        +load(path): ConfigSystem
        +validate(): boolean
    }
    
    class RoutingConfig {
        +explicit: Map~string, Agent~
        +domains: DomainRoute[]
        +fallback: Agent
        +resolve(request: string): Agent
    }
    
    class CastingConfig {
        +universe: string
        +registry: Map~string, CastEntry~
        +policy: AllocationPolicy
        +allocate(type: string): string
    }
    
    class CLI {
        +init(): void
        +spawn(agent: string): void
        +orchestrate(prompt: string): void
        +places(cmd: PlacesCommand): void
        +upgrade(flags): void
    }
    
    CopilotClient --> Session: creates
    CopilotClient --> AgentSource: imports
    CopilotClient --> SkillSource: imports
    Session --> Agent: runs
    AgentSource --> Agent: resolves to
    SkillSource --> Skill: resolves to
    ConfigSystem --> RoutingConfig: contains
    ConfigSystem --> CastingConfig: contains
    ConfigSystem --> AgentSource: lists
    ConfigSystem --> SkillSource: lists
    CLI --> CopilotClient: uses
    CLI --> ConfigSystem: reads
    Agent --> RoutingConfig: driven by
    Agent --> CastingConfig: uses
```

---

## 5. Distribution Flow: Source → Installation

**How Squad reaches users: from source repository → installed in user's repo**

```mermaid
flowchart TD
    A["Source Repo<br/>(github:bradygaster/squad)"] -->|release build| B["Artifact Bundle"]
    B -->|includes| B1["TypeScript Runtime"]
    B -->|includes| B2["CLI Commands"]
    B -->|includes| B3["Templates"]
    B -->|includes| B4["SDK Wrapper"]
    
    B -->|distribution| C["GitHub Releases<br/>(tarball)"]
    C -->|npx github:bradygaster/squad| D["npx Invocation"]
    
    B -->|future| E["npm Registry<br/>(optional v2)"]
    E -->|npm install @github/squad| F["npm Install Path"]
    
    D -->|runs squad init| G["User Repo<br/>(initialization)"]
    G -->|--include-sdk flag| H["With SDK"]
    G -->|default| I["SDK-Free<br/>(config only)"]
    
    H -->|.squad/ created| J["Full Setup"]
    H -->|node_modules| K["@github/copilot<br/>+ runtime"]
    
    I -->|.squad/ created| L["Config Only"]
    I -->|SDK loads on| M["First Orchestration"]
    
    J -->|team ready| N["Agents Spawn"]
    L -->|SDK auto-fetched| N
    N -->|work| O["Results"]
    O -->|via Scribe| P["orchestration.log"]
    
    style A fill:#4A90E2,color:#fff
    style B fill:#50E3C2,color:#000
    style C fill:#7ED321,color:#000
    style D fill:#B8E986,color:#000
    style E fill:#FFD93D,color:#000
    style G fill:#FF6B6B,color:#fff
    style H fill:#A29BFE,color:#fff
    style I fill:#F8B195,color:#000
    style M fill:#C795B9,color:#fff
```

---

## 6. Agent Lifecycle: Request → Results

**Full lifecycle in the new SDK-based system: spawn → work → Scribe logging**

```mermaid
sequenceDiagram
    actor User
    participant CLI as Squad CLI
    participant CClient as CopilotClient
    participant Runtime as Runtime<br/>(Router)
    participant Agent as Agent<br/>(Session)
    participant Cache as Git Cache
    participant Scribe as Scribe
    
    User ->> CLI: squad orchestrate "..."
    CLI ->> CClient: loadConfig()
    CClient ->> Cache: check agents cache
    Cache -->> CClient: manifest + charter
    
    CLI ->> Runtime: resolveAgent(request)
    Runtime ->> Runtime: cast universe<br/>check routing
    Runtime -->> CLI: Agent metadata
    
    CLI ->> CClient: createSession(agentConfig)
    CClient -->> Agent: Session ready
    
    Agent ->> Agent: load charter<br/>inject config
    Agent ->> Agent: onPreToolUse()<br/>auth + casting
    Agent ->> Agent: run(prompt)
    
    loop Streaming work
        Agent ->> Agent: tool calls
        Agent ->> Scribe: event stream
        Scribe ->> Scribe: buffer + aggregate
    end
    
    Agent -->> CLI: completion event
    Scribe ->> Scribe: sessionEnd()<br/>write log
    Scribe -->> User: orchestration-log.jsonl
    
    Agent ->> Agent: cleanup()<br/>close session
    
    CLI -->> User: Results + artifact paths
```

---

## 7. Places Integration: Agent/Skill Marketplace

**Git-backed repositories: how agents/skills import/export and cache**

```mermaid
graph TB
    subgraph user["User Repo (.squad/)"]
        direction TB
        agents["agents/"]
        skills["skills/"]
        config["places-config.json"]
        cache[".agent-cache/ (git)"]
    end
    
    subgraph places["Places Repository<br/>(github.com/user/squad-places)"]
        direction TB
        placesAgents["agents/{username}/{squad}/{name}/"]
        placesSkills["skills/{topic}/{name}/"]
        placesManifest["MANIFEST.json"]
    end
    
    subgraph market["Skill Marketplaces<br/>(external)"]
        direction TB
        awesome["awesome-copilot"]
        langChain["LangChain"]
        openAI["OpenAI Registry"]
    end
    
    user -->|squad places import| places
    places -->|fetch manifest| places
    places -->|download agent.md + charter| cache
    cache -->|symlink or copy| agents
    
    user -->|squad places import| market
    market -->|SkillSource from| cache
    cache -->|symlink or copy| skills
    
    user -->|squad places export| places
    user -->|commit to git| cache
    
    config -->|lists sources| places
    config -->|lists sources| market
    config -->|auth token| places
    
    places -->|pin to SHA| places
    agents -->|resolves as AgentSource| agents
    skills -->|resolves as SkillSource| skills
    
    style user fill:#B8E986,stroke:#5FA215,color:#000,stroke-width:2px
    style places fill:#50E3C2,stroke:#2B8A78,color:#fff,stroke-width:2px
    style market fill:#FFD93D,stroke:#CCAA00,color:#000,stroke-width:2px
    style cache fill:#A29BFE,stroke:#6C63FF,color:#fff,stroke-width:2px
```

---

## Key Design Decisions Visualized

### Routing: From Explicit to Fallback

```mermaid
graph TD
    A["User Request:<br/>'Refactor auth'"] --> B{Routing Decision}
    
    B -->|Explicit Match| C["routing.explicit<br/>(deterministic)"]
    C --> C1["'auth' → Keaton<br/>(Backend Dev)"]
    
    B -->|Domain Match| D["routing.domains<br/>(pattern-based)"]
    D --> D1["'refactor' → Refactorer<br/>domain config"]
    
    B -->|Ambiguous| E["Router LLM<br/>(adaptive)"]
    E --> E1["Resolve vs classify<br/>return Agent + confidence"]
    
    B -->|No Match| F["routing.fallback<br/>(escape hatch)"]
    F --> F1["→ Coordinator<br/>(re-route via task tool)"]
    
    C1 --> G["Agent Session<br/>(Keaton)"]
    D1 --> G
    E1 --> G
    F1 --> G
    
    style A fill:#FFD93D,color:#000,stroke-width:2px
    style B fill:#4A90E2,color:#fff,stroke-width:2px
    style C fill:#50E3C2,color:#000,stroke-width:2px
    style D fill:#7ED321,color:#000,stroke-width:2px
    style E fill:#FF6B6B,color:#fff,stroke-width:2px
    style F fill:#B8E986,color:#000,stroke-width:2px
```

### Casting: Universe → Persistent Name

```mermaid
flowchart LR
    A["Project<br/>(detective noir<br/>universe)"] --> B["Allocate Name<br/>(first time)"]
    B --> B1["Type: Detective"]
    B --> B2["Universe: Noir"]
    B --> B3["Available: ✓"]
    
    B --> C["registry.json<br/>(persist)"]
    C --> C1["persistent_name:<br/>Marlowe<br/>universe: noir<br/>created_at: 2026-02-21"]
    
    C1 --> D["Future Sessions:<br/>Always Marlowe<br/>(deterministic)"]
    
    B2 -->|no collision| E["Overflow<br/>Handling"]
    E -->|all names taken| E1["Diegetic:<br/>Add titles"]
    E -->|still blocked| E2["Thematic:<br/>Synonym"]
    E -->|still blocked| E3["Structural:<br/>Hash suffix"]
    
    style A fill:#FFD93D,color:#000,stroke-width:2px
    style B fill:#4A90E2,color:#fff,stroke-width:2px
    style C fill:#50E3C2,color:#000,stroke-width:2px
    style D fill:#B8E986,color:#000,stroke-width:2px
    style E fill:#FF6B6B,color:#fff,stroke-width:2px
```

---

## Configuration Example

**Visual representation of the config-driven architecture (JSON/YAML)**

```mermaid
mindmap
  root((Squad Config<br/>agents.json))
    agents
      Backend Dev
        charter: ./agents/keaton/charter.md
        model: claude-opus
        mcp: trello-server
      Frontend Dev
        charter: ./agents/jesse/charter.md
        model: claude-sonnet
        mcp: figma-server
      Tester
        charter: ./agents/nova/charter.md
        model: claude-haiku
        mcp: null
    routing
      explicit
        auth: Backend Dev
        UI: Frontend Dev
        test: Tester
      domains
        feature: Frontend Dev
        refactor: Backend Dev
      fallback: Coordinator
    skills
      directories:
        - ./skills/python
        - ./skills/testing
      marketplaces:
        - github:squad-places
        - awesome-copilot
    casting
      universe: detective-noir
      policy: diegetic
    places
      sources:
        - github:bradygaster/squad-places@sha1
        - awesome-copilot/python
```

---

## Summary

The replatform **decouples configuration from code** while **preserving every feature** that makes Squad powerful:

- **Architecture:** Node.js CLI → TypeScript SDK (type-safe, testable, composable)
- **Features:** 28 covered, 14 grave (PRD gaps), 12 at-risk (needs clarification), 5 intentional drops
- **Distribution:** npm + GitHub (lean, no external deps, ~5MB footprint)
- **Routing:** Explicit → Domain → LLM → Fallback (deterministic + adaptive)
- **Casting:** Per-project persistent names (collision-free across sessions)
- **Places:** Git-backed agent/skill distribution with pinned versions and local caching
- **Lifecycle:** Spawn → Work → Logging (observable, session-scoped)

