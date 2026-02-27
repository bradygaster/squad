# Squad Documentation Index

A reading guide to all docs in `.ai-team/docs/`. Whether you're new to the project or digging into specifics, start with the recommended order below.

---

## Recommended Reading Order

### 1. START HERE — Strategic Context

**1. PRD Index** — `.ai-team/docs/prds/00-index.md`  
Master overview of Squad's SDK replatform plan. 14 PRDs, 3 phases, dependencies. Defines what we're building and why.  
**Status:** 🟢 **Current** — Last updated 2026-02-21  
**Purpose:** Everyone reads this first. Sets the frame for all other docs.

**2. Open Questions** — `.ai-team/docs/open-questions.md`  
27/27 questions answered. Resolved decisions on agent repos, SDK pinning, distribution, feature parity.  
**Status:** 🟢 **Current** — Last updated 2026-02-21  
**Purpose:** Captures what Brady decided and why. Critical for context before jumping into any PRD.

---

### 2. ANALYSIS PHASE — Understanding the Opportunity

These four docs explain why replatforming on the SDK makes sense, what we gain, and where the risks are. Read in any order.

**3. SDK Replatforming Proposal** — `.ai-team/docs/sdk-replatforming-proposal.md`  
Strategic assessment. What we gain (programmatic orchestration, distribution simplification, custom tools). Why the risk is manageable.  
**Status:** 🟢 **Current** — Last updated 2026-02-20  
**Purpose:** The "go/no-go" business case. Executive summary by Keaton.

**4. SDK Opportunity Analysis** — `.ai-team/docs/sdk-opportunity-analysis.md`  
Detailed SDK capability inventory. Multi-session management, custom agents, hooks, MCP, infinite sessions, BYOK. How each maps to Squad's needs.  
**Status:** 🟢 **Current** — Last updated 2026-02-19  
**Purpose:** The "what's in the SDK box" guide. Deep dive by Kujan.

**5. SDK Technical Mapping** — `.ai-team/docs/sdk-technical-mapping.md`  
Feature-by-feature analysis. How Squad's current runtime maps to SDK primitives. What we keep, what the SDK handles, what we build custom.  
**Status:** 🟢 **Current** — Last updated 2026-02-20  
**Purpose:** The "how do we migrate this part?" reference. For engineers building the replatform. By Fenster.

**6. SDK Agent Design Impact** — `.ai-team/docs/sdk-agent-design-impact.md`  
Transformation of Squad's agent architecture. From ephemeral spawns via `task` tool to persistent SDK sessions. How charters map to `CustomAgentConfig`.  
**Status:** 🟢 **Current** — Last updated 2026-02-21  
**Purpose:** Understand how agents change. How do we preserve existing team DNA while gaining new capabilities?

---

### 3. INVENTORY & RISK — What Could Go Wrong

These are the working docs that track what we have and what could break.

**7. Feature Comparison** — `.ai-team/docs/feature-comparison.md`  
Epic inventory. 62 current features mapped to PRDs. Migration distance per category (CLI, agents, state, GitHub, distribution).  
**Status:** 🟢 **Current** — Last updated 2026-02-21  
**Purpose:** "Can the SDK replatform handle this?" Detailed feature matrix. By Kujan, requested by Brady for Mermaid diagrams.

**8. Feature Risk Punch List** — `.ai-team/docs/feature-risk-punchlist.md`  
Risk assessment. 🔴 GRAVE (14 features with zero PRD coverage), 🟡 AT RISK (12 need clarification), 🟢 COVERED (28 explicit paths).  
**Status:** 🟡 **Partially Outdated** — Last updated 2026-02-20, some GRAVE items now have PRDs  
**Note:** Pre-dates PRD 15 (Agent Repository). Some GRAVE items are now resolved. Use as reference, check Feature Comparison for current status.

---

### 4. VISUAL ARCHITECTURE — The Big Picture

**9. Replatform Diagrams** — `.ai-team/docs/replatform-diagrams.md`  
Mermaid diagrams. Current vs new architecture. Feature parity matrix. Migration timeline. Component architecture. Distribution flow. Agent lifecycle. Places integration.  
**Status:** 🟢 **Current** — Last updated 2026-02-21  
**Purpose:** Visual companion to Feature Comparison. Read when you want to see the data as diagrams.

---

### 5. MILESTONES & PLANNING

**10. Milestones** — `.ai-team/docs/milestones.md`  
High-level Phase 1/2/3 timeline. Which PRDs ship when. Dependencies. Brady's checkpoints.  
**Status:** 🟡 **Partially Outdated** — Check PRD Index instead  
**Note:** PRD Index (docs/prds/00-index.md) has the authoritative timeline. Use this doc for quick reference only.

---

### 6. PRD CATALOG — The Work

All 14 PRDs live in `.ai-team/docs/prds/`. Start with PRD Index, then read by phase:

**Phase 1 (Core — v0.6.0):**
- **PRD 01: SDK Orchestration Runtime** — `CopilotClient` wrapper, SDK initialization
- **PRD 02: Custom Tools API** — `squad_route`, `squad_decide`, `squad_memory`
- **PRD 03: Hooks & Policy Enforcement** — `onPreToolUse`/`onPostToolUse` for governance
- **PRD 04: Agent Session Lifecycle** — Charters → `CustomAgentConfig`
- **PRD 05: Coordinator Replatform** — 32KB prompt → TypeScript orchestrator
- **PRD 15: Agent Repository Architecture** — `AgentSource` interface (cross-cutting)

**Phase 2 (Extensions — v0.7.x):**
- **PRD 06: Streaming Observability** — Real-time event aggregation
- **PRD 07: Skills Migration** — `.squad/skills/` → SDK `skillDirectories`
- **PRD 08: Ralph SDK Migration** — Watch loop → persistent SDK session
- **PRD 09: BYOK & Multi-Provider** — Custom providers, fallback chains
- **PRD 10: MCP Server Integration** — Per-agent MCP servers

**Phase 3 (Identity & Distribution — v0.8+/v1.0):**
- **PRD 11: Casting System v2** — Casting registry → runtime generation
- **PRD 12: Distribution & In-Copilot Install** — npm, SDK bundling, Extensions
- **PRD 13: A2A Agent Communication** — Direct agent-to-agent messaging
- **PRD 14: Clean-Slate Architecture** — `.squad/` structure, bundling, config

---

## By Category

### Start Here (New to Squad)
1. PRD Index
2. Open Questions
3. SDK Replatforming Proposal

### Architecture & Design
- SDK Agent Design Impact
- SDK Technical Mapping
- SDK Opportunity Analysis
- Replatform Diagrams

### Risk & Inventory
- Feature Comparison (detailed)
- Feature Risk Punch List (for context, use Feature Comparison for current status)

### Planning & Timeline
- PRD Index (authoritative)
- Milestones (quick reference)
- Open Questions (decisions made)

### Implementation (PRDs)
See **PRD Catalog** section above. Read in phase order starting with Phase 1.

---

## Freshness at a Glance

| Status | Meaning |
|--------|---------|
| 🟢 **Current** | Accurate and up-to-date. Safe to use for decisions. |
| 🟡 **Partially Outdated** | Core ideas hold but some details superseded. Cross-reference with newer docs. |
| 📋 **Reference** | Always useful, not time-sensitive. Consult as needed. |

---

## Key Docs by Role

**If you're the Lead (Brady/Keaton):**
→ PRD Index, Open Questions, Feature Comparison, Feature Risk Punch List

**If you're implementing a PRD:**
→ Your PRD (docs/prds/{01-14}.md), Feature Comparison, Replatform Diagrams

**If you're new to the project:**
→ PRD Index, SDK Replatforming Proposal, Open Questions, then Replatform Diagrams

**If you're reviewing risk:**
→ Feature Risk Punch List, Feature Comparison, Open Questions

---

**Last updated:** 2026-02-21  
**Maintained by:** McManus (DevRel)

