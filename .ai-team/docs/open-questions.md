# Open Questions — Squad SDK Replatform

> Living document. Updated by Scribe as questions arise and get resolved.
> Last updated: 2026-02-21

## Unresolved

### Agent Repository Backend
- [x] ~~What's the directory convention for the places repo?~~ → RESOLVED: `agents/{github_username}/{squad_name}/{agent_name}/`
- [x] ~~How does auth work for private places repos?~~ → RESOLVED: gh CLI token (already authenticated, zero extra config). (Brady, 2026-02-20)
- [x] ~~Should teams (pre-built rosters) be first-class in places, or agents-only for v1?~~ → RESOLVED: Both — export/import a single agent OR a full squad. Both first-class from day one. (Brady, 2026-02-20)
- [x] ~~How does versioning work when a places agent is updated upstream?~~ → RESOLVED: Pin to commit SHA at import. `squad places check` for updates, `squad places upgrade` to pull. No auto-refresh. (Team decision, Brady deferred, 2026-02-20)
- [x] ~~What happens on import conflict — local agent same name as places agent?~~ → RESOLVED: DISALLOWED. Block import, require rename on the way in. Never overwrite, never auto-namespace. (Brady, 2026-02-20)

### Architecture
- [x] ~~Is `@github/copilot` npm-published or host-provided only? (Rabin flagged — blocks global install outside VS Code)~~ → RESOLVED: Keep distributing via GitHub + npx (npx github:bradygaster/squad). SDK stays on GitHub, not npmjs.com. (Brady, 2026-02-20)
- [x] ~~How does the AgentSource interface interact with the casting system when agents come from remote repositories?~~ → RESOLVED: Hybrid — re-cast into local universe by default, allow opt-out flag to keep original name. (Brady, 2026-02-20)
- [x] ~~Should skills also be pullable from agent repositories, or only agent configs?~~ → RESOLVED: Yes — skills are independently importable from places repos. Like awesome-copilot lists. Standalone shareable knowledge units. (Brady, 2026-02-20)
- [x] ~~What's the authentication model for cloud-hosted agent repositories?~~ → RESOLVED: GitHub auth (gh CLI token), same as places. One auth story. (Brady, 2026-02-20)
- [x] ~~**Agent Repository — caching strategy:** How aggressively should remote agents be cached? Per-session? Per-day? Invalidation via webhooks?~~ → RESOLVED: Aggressively cached. Local copy is source of truth until explicit `squad places upgrade`. No TTL, no auto-refresh. (Brady, 2026-02-20)
- [x] ~~**Agent Repository — version pinning:** When pulling agents from a GitHub repo, should we pin to a commit SHA, tag, or branch? What happens when the remote agent updates?~~ → RESOLVED: Duplicate of Q4. Pin to commit SHA. Explicit upgrade. (2026-02-20)
- [x] ~~**Agent Repository — conflict resolution:** If the same agent name exists in two sources, which takes priority? Config order? Explicit override?~~ → RESOLVED: Config order — first-listed source wins, last in loses. No prompts, no ambiguity. (Brady, 2026-02-20)
- [x] ~~**Agent Repository — history for remote agents:** Local agents have `.squad/agents/{name}/history.md`. Remote agents don't have writable history paths. Do we create local history shadows for remote agents?~~ → RESOLVED: Yes — create local history shadows. Remote agents accumulate project-specific knowledge just like local ones. (Brady, 2026-02-20)
- [x] ~~**Agent Repository — offline mode:** If a remote source is unreachable at startup, do we use cached versions? Fail? Degrade gracefully?~~ → RESOLVED: If cached, use cached + warn. If no cache, fail gracefully with a friendly error message. Never hard-fail, never silent. (Brady, 2026-02-20)
- [x] ~~**Agent Repository — security model:** Remote agents inject prompts into our runtime. What validation/sandboxing is needed? Should remote agents run with restricted tool access by default?~~ → RESOLVED: Trust but verify — remote agents run with full tool access (same as local), validate structure on import (schema check, warn on suspicious patterns). User chose to import, user owns the risk. No sandboxing. (Brady, 2026-02-20)
- [x] ~~**SkillSource parity:** Should `SkillSource` be a separate interface or a specialization of `AgentSource`? Skills and agents have different metadata shapes but similar resolution patterns.~~ → RESOLVED: Separate interfaces. SkillSource and AgentSource are mutually exclusive abstractions. No shared base, no inheritance. Clean separation despite similar resolution patterns. (Brady, 2026-02-20)

### Distribution  
- [x] ~~Can Squad run as a global CLI tool outside of VS Code/Copilot? (depends on @github/copilot availability)~~ → RESOLVED: GitHub Copilot CLI is P0 (hard dependency). VS Code is very close P1 — barely behind CLI. Fix the two existing VS Code extensions that sit on top of Squad. No standalone CLI outside Copilot for now. (Brady, 2026-02-20)
- [x] ~~What's the bundle size target for the global install?~~ → RESOLVED: Lean target (~5MB). Stay close to current footprint. Single-install matters — tree-shake aggressively, minimal deps. (Brady, 2026-02-20)
- [x] ~~Should `squad init` remain SDK-free (scaffolding only) while `squad orchestrate` uses the SDK?~~ → RESOLVED: SDK-free init by default. `--include-sdk` flag for users who want the full package upfront. SDK loads only when orchestration begins. (Brady, 2026-02-20)

### SDK
- [x] ~~SDK is Technical Preview (v0.1.x) — what's our pinning and upgrade strategy when breaking changes land?~~ → RESOLVED: Pin exact version in package.json. Manual upgrade via `squad upgrade --sdk`. Relax to ~ or ^ when SDK hits stable (v1.0). (Brady, 2026-02-20)
- [x] ~~Does `resumeSession()` actually work for Ralph's persistent monitoring use case?~~ → RESOLVED: Assume it works, build on it. Study SDK samples for persistent loop patterns (they exist). Exercise the API early — if it breaks, we find out fast and file bugs. Good partnering. (Brady, 2026-02-20)
- [x] ~~Can multiple concurrent sessions share a single CopilotClient connection?~~ → RESOLVED: Study SDK samples for concurrent session patterns. Default to option 1 (single shared client) if samples support it. Let the implementation tell us — defer deep design until we're building it. (Brady, 2026-02-20)

### Feature Parity
- [x] ~~squad.agent.md is user-readable/editable today — how do we preserve customizability in TypeScript? (Kujan flagged as #1 concern)~~ → RESOLVED: Config-driven architecture — extract every customizable behavior into config files (JSON/YAML) that the TypeScript runtime reads. squad.agent.md becomes a reference doc. Users customize via config, not code. (Brady, 2026-02-20)
- [x] ~~Export/import portability (~260 lines) has no PRD coverage — do we need a new PRD?~~ → RESOLVED: Yes, write PRD-16 for export/import. Factor it into agent/skill marketplace — build our own marketplace adhering to same conventions as existing ones we connect to. Skills marketplaces already exist and we support them; our export/import should be compatible. (Brady, 2026-02-20)
- [x] ~~12 workflow templates need path migration (.ai-team/ → .squad/) — who owns this?~~ → RESOLVED: Kobayashi owns it (Git/Release). Mechanical path find-and-replace across all workflow files. Add to his queue. (Brady, 2026-02-20)

### Process
- [x] ~~Should we init a Squad team in the new repo (squad-sdk) or keep coordinating from source repo?~~ → RESOLVED: Single team, single repo (status quo). This team in C:\src\squad coordinates all work across all three repos. Agents reach into squad-sdk and squad-places-pr as needed. (Brady, 2026-02-20)
- [ ] When does Brady want to start implementing PRD 1?

## Resolved

### Agent Repository Backend
- [x] **Directory convention:** `agents/{github_username}/{squad_name}/{agent_name}/` — supports multiple agents and multiple teams per user. (Brady, 2026-02-20)
- [x] **Auth model:** gh CLI token — already authenticated, zero extra config. (Brady, 2026-02-20)
- [x] **Import/export granularity:** Both agent-level and squad-level are first-class. Users can export/import a single agent OR a full squad. (Brady, 2026-02-20)
- [x] **Versioning:** Pin to commit SHA at import. `squad places check` shows updates, `squad places upgrade {agent}` pulls latest. No auto-refresh. (Team decision, 2026-02-20)
- [x] **Import conflict:** DISALLOWED. Block import on name collision, require rename on the way in. Never overwrite, never auto-namespace. (Brady, 2026-02-20)

### Architecture
- [x] **SDK distribution:** Keep on GitHub via npx (npx github:bradygaster/squad). Not npmjs.com. (Brady, 2026-02-20)
- [x] **AgentSource + casting:** Hybrid — imported agents re-cast into local universe by default. Opt-out flag to keep original name. (Brady, 2026-02-20)
- [x] **Skills from places:** Yes — skills are independently importable from places repos. Like awesome-copilot curated lists. (Brady, 2026-02-20)
- [x] **Cloud repo auth:** GitHub auth (gh CLI token), same as places. One auth story. (Brady, 2026-02-20)
- [x] **Caching strategy:** Aggressively cached. Local copy is source of truth until explicit upgrade. No TTL, no auto-refresh. (Brady, 2026-02-20)
- [x] **Version pinning:** Duplicate of Q4 — pin to SHA, explicit upgrade. (2026-02-20)
- [x] **Multi-source conflict:** Config order — first-listed source wins, last in loses. (Brady, 2026-02-20)
- [x] **History shadows:** Yes — remote agents get local history shadows for project-specific learnings. (Brady, 2026-02-20)
- [x] **Offline mode:** If cached, use cached + warn. If no cache, fail gracefully with a friendly error message. Never hard-fail, never silent. (Brady, 2026-02-20)
- [x] **Security model:** Trust but verify — full tool access for remote agents, validate structure on import (schema check, warn on suspicious patterns). No sandboxing. (Brady, 2026-02-20)
- [x] **SkillSource parity:** Separate interfaces. SkillSource and AgentSource are mutually exclusive abstractions. No shared base, no inheritance. (Brady, 2026-02-20)

### Distribution
- [x] **Global CLI:** GitHub Copilot CLI is P0 (hard dependency). VS Code is very close P1. Fix existing VS Code extensions. No standalone outside Copilot for now. (Brady, 2026-02-20)
- [x] **Bundle size:** Lean target (~5MB). Stay close to current footprint. Single-install priority — tree-shake aggressively, minimal deps. (Brady, 2026-02-20)
- [x] **SDK-free init:** `squad init` stays SDK-free by default. `--include-sdk` flag available. SDK loads only at orchestration time. (Brady, 2026-02-20)

### SDK
- [x] **SDK pinning:** Pin exact version during Technical Preview. Manual upgrade via `squad upgrade --sdk`. Relax to ~ or ^ at v1.0 stable. (Brady, 2026-02-20)
- [x] **resumeSession for Ralph:** Assume it works, build on it. Study SDK samples for persistent loop patterns. Exercise the API early — file bugs if it breaks. Good partnering signal. (Brady, 2026-02-20)
- [x] **Concurrent sessions:** Study SDK samples for concurrent patterns. Default to single shared CopilotClient if supported. Let implementation tell us — defer deep design. (Brady, 2026-02-20)

### Feature Parity
- [x] **Coordinator customizability:** Config-driven architecture — extract all customizable behavior into config files (JSON/YAML) that TypeScript runtime reads. squad.agent.md becomes reference doc only. Users customize via config, not code. (Brady, 2026-02-20)
- [x] **Export/import PRD:** Yes — write PRD-16. Factor into agent/skill marketplace. Build our own marketplace adhering to same conventions as existing ones we connect to. Export/import is part of the marketplace ecosystem, not a standalone feature. (Brady, 2026-02-20)
- [x] **Workflow path migration:** Kobayashi (Git/Release) owns it. Mechanical .ai-team/ → .squad/ path migration across 12 workflow templates. (Brady, 2026-02-20)

### Process
- [x] **Team coordination:** Single team, single repo (status quo). This team coordinates all work across squad, squad-sdk, and squad-places-pr. No separate Squad init in squad-sdk. (Brady, 2026-02-20)
