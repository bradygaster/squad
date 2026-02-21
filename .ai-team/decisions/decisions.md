# Decisions Log — CLI Migration

## Strategic Decisions

### D-M7-001: Team Casting via Skill Matrix
**PRD:** 16 (Init Command)  
**Agent:** Fenster  
**Date:** 2026-02-XX  
**Status:** Implemented

Automated team role allocation based on skill matrix matching. Each squad member is assigned roles (Coordinator, Code, Docs, Review, Ops) based on their trained capabilities.

**Rationale:** Enables reproducible team generation without manual configuration; reduces cognitive load for new squad instances.

### D-M8-001: Plugin Sandbox Model
**PRD:** 20 (Plugin System)  
**Agent:** Edie  
**Date:** 2026-02-XX  
**Status:** Implemented

Third-party plugins run in sandbox environment with explicit capability allowlist. No direct file system access; communication via message passing only.

**Rationale:** Security-first approach prevents malicious plugins from compromising team or repository data.

### D-M8-002: Slash Command Namespace
**PRD:** 21 (Copilot Integration)  
**Agent:** Fenster  
**Date:** 2026-02-XX  
**Status:** Implemented

All squad commands prefixed with `/squad` namespace in Copilot. Examples: `/squad spawn`, `/squad upgrade`, `/squad status`.

**Rationale:** Avoids collision with other Copilot extensions; clear visual separation of squad operations.

### D-M9-001: Beta Archive Strategy
**PRD:** 22 (Squad Spawn)  
**Agent:** Keaton  
**Date:** 2026-02-21  
**Status:** Implemented

Spawned consumer repos include archive notice on agents marking CLI v2 migration period. Beta tag remains until adoption stabilizes.

**Rationale:** Protects against workflow disruption; gives teams time to upgrade incrementally.

## Process Decisions

### D-PROC-001: Decision Inbox Pattern
**Date:** 2026-02-21  
**Status:** Active

Decisions stored in `.ai-team/decisions/inbox/` during work phases, merged into `decisions.md` at session completion by Scribe.

**Rationale:** Decouples decision logging from orchestration; allows agents to focus on delivery.

---

**Last Updated:** 2026-02-21  
**Inbox Status:** ✅ Clear  
**All Decisions:** 5 logged, 0 pending
