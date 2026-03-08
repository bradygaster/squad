---
title: "v0.8.24 Release: Azure DevOps Platform Adapter + CommunicationAdapter"
date: 2026-03-08
author: "Tamir Dresher"
wave: 7
tags: [squad, release, v0.8.24, azure-devops, enterprise, platform-adapter, communication, security]
status: draft
hero: "Squad goes enterprise — native Azure DevOps support, configurable work item types and area paths, cross-project work items, a new CommunicationAdapter for platform-agnostic agent-human messaging, and critical security hardening across all adapters."
---

# v0.8.24 Release: Azure DevOps Platform Adapter + CommunicationAdapter

> Blog post #26 — Everything that shipped in the enterprise platform sprint.

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

_v0.8.24 adds first-class Azure DevOps support to Squad, a CommunicationAdapter abstraction for agent-human messaging across platforms, and security fixes that prevent shell injection, WIQL injection, and bearer token exposure. 12 commits, 107 new tests, 2 new PRs merged._

---

## What Shipped

### 🏢 Azure DevOps Platform Adapter (PR #191)

Squad now works natively with Azure DevOps. When your git remote points to `dev.azure.com` or `*.visualstudio.com`, Squad auto-detects the platform and adapts everything — work items, PRs, branches, Ralph's triage loop.

**What's in the box:**

| Feature | Details |
|---------|---------|
| **PlatformAdapter interface** | Unified API for GitHub, ADO, and Planner — `listWorkItems`, `createPR`, `mergePR`, `addTag`, etc. |
| **Auto-detection** | `detectPlatform()` reads git remote URL → returns `github`, `azure-devops`, or `planner` |
| **ADO adapter** | Full CRUD via `az boards` CLI — work items, tags, comments, WIQL queries |
| **GitHub adapter** | Wraps `gh` CLI with same interface |
| **Planner adapter** | Microsoft Graph API for hybrid work-item tracking |
| **Configurable work items** | Custom types (Scenario, Bug), area paths, iteration paths via `.squad/config.json` |
| **Cross-project support** | Work items can live in a different ADO org/project than the git repo |
| **Ralph ADO awareness** | Governance file (`squad.agent.md`) teaches Ralph to use WIQL queries on ADO |
| **Platform-aware init** | `squad init` skips `.github/workflows/` for ADO, generates platform-appropriate MCP config |

**Config example (`.squad/config.json`):**

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

### 💬 CommunicationAdapter (PR #263)

A new pluggable interface for agent-human communication across platforms.

| Adapter | Phone-capable | Setup |
|---------|:---:|---|
| **FileLog** | Via git | Zero-config fallback |
| **GitHub Discussions** | Yes (browser) | Auto-detected |
| **ADO Work Item Discussions** | Yes (ADO mobile) | Auto-detected |
| **Teams Webhook** | Yes (Teams mobile) | Stubbed for Phase 2 |

**Interface:**
```typescript
interface CommunicationAdapter {
  postUpdate(options): Promise<{ id, url? }>;
  pollForReplies(options): Promise<CommunicationReply[]>;
  getNotificationUrl(threadId): string | undefined;
}
```

Factory auto-detects platform and reads config — `createCommunicationAdapter(repoRoot)`.

### 🔒 Security Hardening

Every adapter went through a community-driven 5-model security review (thanks @wiisaacs!):

| Fix | Impact |
|-----|--------|
| `execSync` → `execFileSync` | Prevents shell injection across all adapters |
| `escapeWiql()` helper | Prevents WIQL injection (same pattern as SQL injection) |
| `curl --config stdin` | Bearer tokens invisible to `ps aux` / `/proc/pid/cmdline` |
| Case-insensitive detection | Mixed-case ADO URLs (`DEV.AZURE.COM`) now detected correctly |
| Cross-platform draft filter | `findstr` → JMESPath query (works on macOS/Linux) |
| PR status mapping | `active`→`open`, `completed`→`closed` (gh CLI compatibility) |

### 📋 Governance Updates

The coordinator prompt (`squad.agent.md`) is now platform-aware:

- **Platform Detection section** — GitHub vs ADO vs Planner
- **Issue Awareness** — shows both `gh issue list` and `az boards query` commands
- **Ralph Step 1** — platform-aware scan with ADO WIQL command blocks
- **MCP detection** — `azure-devops-*` added to tool prefix table
- **Config resolution** — reads `.squad/config.json` `ado` section before any ADO command

---

## Quick Stats

- ✅ 12 commits (ADO adapter) + 1 commit (CommunicationAdapter)
- ✅ 92 platform adapter tests + 15 communication adapter tests = **107 new tests**
- ✅ Security review: 7 issues fixed, 3 deferred to follow-up
- ✅ External integration testing: 10/13 tests passed (3 blocked by locked-down ADO project)
- ✅ Blog post #25: Squad Goes Enterprise
- ✅ Enterprise platforms docs with full config reference table

---

## Breaking Changes

None. All changes are additive. Repos without ADO remotes work exactly as before.

---

## Getting Started with ADO

```bash
# 1. Install Squad
npm install -g @bradygaster/squad-cli

# 2. Set up Azure CLI
az login && az extension add --name azure-devops

# 3. Clone your ADO repo and init
git clone https://dev.azure.com/your-org/your-project/_git/your-repo
cd your-repo && squad init

# 4. Configure work items (optional)
# Edit .squad/config.json → ado section

# 5. Tell Ralph to scan ADO
# "Ralph, go"
```

Full guide: [Enterprise Platforms](../features/enterprise-platforms.md)

---

## Issues Addressed

- #240 — ADO configurable work item types, area paths, and iteration support
- #261 — CommunicationAdapter — platform-agnostic agent-human communication
- #236 — Persistent Ralph watch command wiring
- #237 — CLI commands implemented but not wired

## PRs Merged

- #191 — Azure DevOps platform adapter
- #263 — CommunicationAdapter
- #225 — Upstream CLI wiring (merged earlier)

---

## Contributors

- **@tamirdresher** — Platform adapter design, ADO adapter, security fixes, governance updates, docs, blog
- **@wiisaacs** — 5-model security review with test validation (shell injection, WIQL injection, bearer token)
- **@dfberry** — CommunicationAdapter requirements (phone-capable, platform-agnostic)
- **@bradygaster** — Workstreams merge, CLI wiring, architecture guidance

---

## What's Next

- Process template introspection — auto-detect ADO work item types (#240)
- Teams webhook adapter — full implementation (#261)
- Persistent Ralph — `squad watch` heartbeat improvements (#236)
- CommunicationAdapter Scribe integration — auto-post session summaries

---

*Squad speaks enterprise now. Azure DevOps, configurable work items, cross-project support, and a communication layer that works on your phone. The platform bends to the team, not the other way around.*
