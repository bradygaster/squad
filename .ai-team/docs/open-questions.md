# Open Questions — Squad SDK Replatform

> Living document. Updated by Scribe as questions arise and get resolved.
> Last updated: 2026-02-20

## Unresolved

### Architecture
- [ ] Is `@github/copilot` npm-published or host-provided only? (Rabin flagged — blocks global install outside VS Code)
- [ ] How does the AgentSource interface interact with the casting system when agents come from remote repositories?
- [ ] Should skills also be pullable from agent repositories, or only agent configs?
- [ ] What's the authentication model for cloud-hosted agent repositories?

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
(none yet)
