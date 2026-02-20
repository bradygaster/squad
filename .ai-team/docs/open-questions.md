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
- [ ] **Agent Repository — conflict resolution:** If the same agent name exists in two sources, which takes priority? Config order? Explicit override?
- [ ] **Agent Repository — history for remote agents:** Local agents have `.squad/agents/{name}/history.md`. Remote agents don't have writable history paths. Do we create local history shadows for remote agents?
- [ ] **Agent Repository — offline mode:** If a remote source is unreachable at startup, do we use cached versions? Fail? Degrade gracefully?
- [ ] **Agent Repository — security model:** Remote agents inject prompts into our runtime. What validation/sandboxing is needed? Should remote agents run with restricted tool access by default?
- [ ] **SkillSource parity:** Should `SkillSource` be a separate interface or a specialization of `AgentSource`? Skills and agents have different metadata shapes but similar resolution patterns.

### Distribution  
- [ ] Can Squad run as a global CLI tool outside of VS Code/Copilot? (depends on @github/copilot availability)
- [ ] What's the bundle size target for the global install?
- [ ] Should `squad init` remain SDK-free (scaffolding only) while `squad orchestrate` uses the SDK?

### SDK
- [ ] SDK is Technical Preview (v0.1.x) — what's our pinning and upgrade strategy when breaking changes land?
- [ ] Does `resumeSession()` actually work for Ralph's persistent monitoring use case?
- [ ] Can multiple concurrent sessions share a single CopilotClient connection?

### Feature Parity
- [ ] squad.agent.md is user-readable/editable today — how do we preserve customizability in TypeScript? (Kujan flagged as #1 concern)
- [ ] Export/import portability (~260 lines) has no PRD coverage — do we need a new PRD?
- [ ] 12 workflow templates need path migration (.ai-team/ → .squad/) — who owns this?

### Process
- [ ] Should we init a Squad team in the new repo (squad-sdk) or keep coordinating from source repo?
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
