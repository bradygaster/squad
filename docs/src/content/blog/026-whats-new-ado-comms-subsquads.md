---
title: "What's New: Azure DevOps Adapter, CommunicationAdapter, SubSquads, and Security Hardening"
date: 2026-03-08
author: "Tamir Dresher"
wave: 7
tags: [squad, azure-devops, enterprise, platform-adapter, communication, subsquads, security]
status: published
hero: "Squad goes enterprise with native Azure DevOps support, adds a CommunicationAdapter for platform-agnostic agent-human messaging, renames Workstreams to SubSquads, and ships critical security hardening across all platform adapters."
---

# What's New: Azure DevOps Adapter, CommunicationAdapter, SubSquads, and Security Hardening

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _This batch adds first-class Azure DevOps support, a pluggable communication layer, the community-voted SubSquads rename, and security fixes that prevent shell injection, WIQL injection, and bearer token exposure. 5 PRs merged, 153 new tests, 4 issues closed._

---

## What Shipped

### 1. Azure DevOps Platform Adapter — The Enterprise Feature

Squad now works natively with Azure DevOps. When your git remote points to `dev.azure.com` or `*.visualstudio.com`, Squad auto-detects the platform and adapts everything.

**PlatformAdapter interface** — unified API for GitHub, ADO, and Planner:

```typescript
interface PlatformAdapter {
  listWorkItems(options): Promise<WorkItem[]>;
  createWorkItem(options): Promise<WorkItem>;
  createPullRequest(options): Promise<PullRequest>;
  mergePullRequest(id): Promise<void>;
  createBranch(name, fromBranch?): Promise<void>;
  // ... addTag, removeTag, addComment
}
```

Three adapters ship with the same interface:
- **AzureDevOpsAdapter** — `az boards` CLI for work items, `az repos` for PRs
- **GitHubAdapter** — `gh` CLI wrapper
- **PlannerAdapter** — Microsoft Graph API for hybrid work-item tracking

**Configurable work items** via `.squad/config.json`:

```json
{
  "platform": "azure-devops",
  "ado": {
    "org": "my-org",
    "project": "planning-project",
    "defaultWorkItemType": "Scenario",
    "areaPath": "MyProject\\Team Alpha",
    "iterationPath": "MyProject\\Sprint 5"
  }
}
```

All fields are optional. Cross-project support means your work items can live in a completely different ADO org/project than your git repo.

**Ralph on ADO** — the governance file (`squad.agent.md`) now includes a Platform Detection section, ADO WIQL commands for Ralph's scan cycle, and instructions to read `.squad/config.json` before any ADO command.

**Docs:** [Enterprise Platforms Guide](../features/enterprise-platforms.md) | [Blog #025](025-squad-goes-enterprise-azure-devops.md)

### 2. CommunicationAdapter — Agent-Human Messaging

A new pluggable interface for agent-human communication. Scribe can post session summaries, Ralph can post board status, agents can escalate when blocked — all through a platform-appropriate channel.

```typescript
interface CommunicationAdapter {
  postUpdate(options): Promise<{ id: string; url?: string }>;
  pollForReplies(options): Promise<CommunicationReply[]>;
  getNotificationUrl(threadId): string | undefined;
}
```

Four adapters:

| Adapter | Phone-capable | Setup |
|---------|:---:|---|
| **FileLog** | Via git | Zero-config fallback |
| **GitHub Discussions** | ✅ Browser | Auto-detected |
| **ADO Work Item Discussions** | ✅ ADO mobile | Auto-detected |
| **Teams Webhook** | ✅ Teams mobile | Stubbed (Phase 2) |

Factory auto-detects platform: `createCommunicationAdapter(repoRoot)`.

### 3. SubSquads — The Community-Voted Rename

Workstreams → SubSquads. The community decided.

- CLI: `squad subsquads` (with `workstreams` and `streams` as deprecated aliases)
- Types: `SubSquadDefinition`, `SubSquadConfig`, `ResolvedSubSquad`
- Old names kept as `@deprecated` re-exports for backward compatibility
- Config file stays at `.squad/streams.json` (file rename deferred)

### 4. Security Hardening

Every platform adapter went through a community-driven 5-model security review (thanks [@wiisaacs](https://github.com/wiisaacs)):

| Fix | What it prevents |
|-----|-----------------|
| `execSync` → `execFileSync` | Shell injection via user input |
| `escapeWiql()` helper | WIQL injection (SQL-style) in ADO queries |
| `curl --config stdin` | Bearer token invisible to `ps aux` |
| Case-insensitive detection | Mixed-case ADO URLs now detected correctly |
| Cross-platform draft filter | `findstr` → JMESPath (macOS/Linux compat) |
| PR status mapping | `active`→`open` for `gh` CLI compatibility |
| `gh issue create` fix | No `--json` flag — parse URL from stdout |

### 5. ESM Runtime Patch + Secret Guardrails (Brady)

- Runtime `Module._resolveFilename` intercept for Node 24+ ESM compatibility
- 5-layer secret defense architecture
- `.copilot/skills/secret-handling/SKILL.md` team reference
- 59 TDD security hook tests
- Charter hardening for Trejo (Git & Release) and Drucker (CI/CD)

---

## Quick Stats

- ✅ 5 PRs merged (#191, #263, #268, #272, #266)
- ✅ 153 new tests (92 platform + 15 comms + 46 SubSquads)
- ✅ 59 security tests (Brady's sprint)
- ✅ 4 issues closed (#240, #261, #271, #273)
- ✅ Security review: 7 code fixes from 10 review comments
- ✅ External integration testing: 10/13 ADO tests passed

---

## Breaking Changes

None. All changes are additive. Repos without ADO remotes work exactly as before. Old `workstreams`/`streams` names still work as deprecated aliases.

---

## Contributors

- **[@tamirdresher](https://github.com/tamirdresher)** — ADO adapter, CommunicationAdapter, SubSquads rename, security fixes, docs, blog
- **[@wiisaacs](https://github.com/wiisaacs)** — 5-model security review with test validation
- **[@dfberry](https://github.com/dfberry)** — CommunicationAdapter requirements, tiered deployment proposal
- **[@bradygaster](https://github.com/bradygaster)** — ESM fix, secret guardrails sprint, SubSquads merge, architecture guidance

---

## What's Next

- **Process template introspection** — auto-detect ADO work item types (#240)
- **Teams webhook adapter** — full CommunicationAdapter implementation (#261)
- **Pre-existing test stabilization** — fix 14 flaky/environment-dependent tests (#273)
- **Persistent Ralph** — `squad watch` heartbeat improvements (#236)
