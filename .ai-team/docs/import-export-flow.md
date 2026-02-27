# Import/Export Flowchart & Failure Analysis

**Author:** Keaton (Lead)  
**Date:** 2026-02-22  
**Status:** Complete Analysis — Identifies customer risk points  
**References:** Decisions Q1–Q10, Q13–Q14, Q23–Q25, PRD 7, PRD 16 (import/export)

---

## 1. Actor Types & Capabilities

### 1.1 Individual Developer (Local Squad)

**Role:** Single developer managing a local squad in a repository.

**Capabilities:**
- `squad export` — export own squad to portable JSON
- `squad import` — import squad from JSON (with collision detection)
- Local agent management (create, edit, delete)
- Shared local agent references (via filesystem)
- No registry access initially (upgrade path via marketplace plugin registration)

**Risk profile:** LOW (local-only operations). Failure modes are contained.

**Permission model:** Full control. Own repo = own `.squad/` directory.

---

### 1.2 Team Lead (Internal Sharing)

**Role:** Share squad or agents with teammates within the same organization.

**Capabilities:**
- Export squad to JSON (portable)
- Export individual agents to JSON
- Push to shared repository (`agents/{github_username}/{squad_name}/{agent_name}/`)
- Direct sharing: email, Slack, git commit, GitHub releases
- Verify recipient can import (same Copilot version, dependencies installed)

**Risk profile:** MEDIUM (manual coordination, no registry validation). Failures are typically caught by recipient before serious damage.

**Permission model:** Relies on git repository access and GitHub auth (via gh CLI).

---

### 1.3 Public Marketplace Publisher

**Role:** Publish agents/squads to a shared registry for discovery by strangers.

**Capabilities:**
- Export agent/squad to JSON (portable, self-contained)
- Register marketplace repository (`squad plugin marketplace add owner/repo`)
- Push to agent registry directory (`agents/{github_username}/{squad_name}/{agent_name}/`)
- Version control via git commit SHA (pinning)
- README + documentation in registry repo

**Risk profile:** HIGH (unknown consumers, discoverable, reputational). Failures affect strangers.

**Permission model:** Must have write access to marketplace repository. Auth via gh CLI token.

---

### 1.4 Marketplace Consumer

**Role:** Discover and import agents/squads from shared registries.

**Capabilities:**
- `squad plugin marketplace browse` — search registries
- `squad plugin marketplace add owner/repo` — register a marketplace
- `squad import <agent>` — import from marketplace (by name or path)
- Version pinning (by commit SHA or branch/tag)
- Local rename on import (via collision detection + require rename)
- Caching (aggressive, local copy is source of truth)

**Risk profile:** HIGH (trusting unknown publisher, offline-first caching creates stale state). Failure modes are silent.

**Permission model:** Requires gh CLI auth to read marketplace repo. No special marketplace auth.

---

### 1.5 Registry Maintainer

**Role:** Curate and maintain a marketplace repository (agents, skills, squads).

**Capabilities:**
- Create and manage agent/squad definitions in standard directory structure
- Validate agent structure (charter, history, MCP config)
- Version management (releases, tags, commit SHAs)
- Documentation (README, contributing guide)
- Access control (if repo is private)
- Deprecation/archival (mark agents as deprecated, remove agents)

**Risk profile:** MEDIUM (responsible for quality and stability of exported artifacts). Failures are discoverable in time.

**Permission model:** Write access to marketplace repo. Can set repo to private (limits discovery).

---

## 2. Artifact Types & What Moves

### 2.1 Agents (Full Portable Definition)

**Structure:**
```
{
  "name": "baer",
  "charter": "# Charter\n...",
  "history": "# History\n...",
  "mcp": {
    "servers": [...]
  },
  "skills": [
    {"title": "X", "description": "...", "confidence": "high"}
  ],
  "cast": {
    "universe": "xyz",
    "archetype": "..."
  },
  "metadata": {
    "version": "0.2.1",
    "publisher": "bradygaster",
    "importedAt": "2026-02-22T...",
    "pinnedToCommit": "abc123..."
  }
}
```

**Portable?** YES. Includes everything needed to run the agent locally. Independent of project context.

**Dependencies:**
- Copilot SDK version (soft: CLI adapter abstracts SDK version drift)
- MCP servers (hard: if specified in agent definition)
- Skills dependencies (soft: gracefully degraded if skill not found)

**Customization on import:**
- Local rename (REQUIRED if name collision)
- Charter override (optional, user can tweak)
- MCP server override (optional, local servers preferred)
- History shadow creation (automatic, captures project-specific learnings)

---

### 2.2 Skills (SKILL.md Files)

**Structure:**
```
.squad/skills/
  python-testing/
    SKILL.md
    examples/
      test_example.py
  kubernetes-deployment/
    SKILL.md
```

**SKILL.md format:**
```
# [Skill Title]

## What This Skill Does
[Description]

## When to Use
[Use cases]

## Examples
[Code examples or patterns]

## Confidence
[low | medium | high]

## Last Updated
[ISO timestamp]
```

**Portable?** PARTIALLY. Skills are reusable but may reference project-specific patterns.

**Dependencies:**
- No hard dependencies. Skills are reference documentation + examples.

**Customization on import:**
- Name/path (can be renamed, but doesn't need to be)
- Confidence level reset (imported skills start at "low" confidence locally)
- Example code adapted to local project patterns

---

### 2.3 Squad Configurations (Whole Team Export)

**Structure:**
```
{
  "name": "backendteam",
  "members": [
    { "name": "baer", "charter": "...", "history": "..." },
    { "name": "edie", "charter": "...", "history": "..." }
  ],
  "sharedConfig": {
    "routing": {...},
    "models": {...},
    "plugins": [{...}]
  },
  "skills": [
    { "title": "API Testing", "description": "...", "confidence": "high" },
    { "title": "Database Design", "description": "...", "confidence": "medium" }
  ],
  "metadata": {
    "version": "0.4.1",
    "exportedAt": "2026-02-22T...",
    "compatibility": ">=0.5.0"
  }
}
```

**Portable?** YES. Includes all agents, shared config, and skills needed for the squad to function.

**Dependencies:**
- Copilot SDK version (stated in metadata)
- MCP servers (listed in shared config)
- Routing infrastructure (assumed present in destination repo)

**Customization on import:**
- Member name collision (blocking; require rename)
- Squad configuration merge (what overrides what?)
- Shared skills conflict (first-listed wins per decision Q23)

---

### 2.4 Individual Agent Definitions

**Structure:** Subset of full Agent (name, charter, MCP config only — no history).

```
{
  "name": "analyzer",
  "charter": "# Charter\n...",
  "mcp": {
    "servers": [...]
  },
  "metadata": {
    "version": "0.2.0",
    "publisher": "bradygaster"
  }
}
```

**Portable?** YES. Minimal definition for sharing specific agent without history.

**Use case:** Publisher wants to share a single-purpose agent without revealing project-specific history.

---

## 3. Flow Paths: All Ways Artifacts Move

### Flow A: Local → Export → Registry (Publishing)

**Actors:** Individual developer, Team lead, Publisher  
**Direction:** OUT (local repo → registry repo)  
**Artifact:** Agent, Squad, or Skills  

**Happy Path:**
1. Developer has working squad in local `.squad/`
2. Runs `squad export` → produces `squad-export.json`
3. Optionally commits to local repo as backup
4. Pushes to shared GitHub repo at `agents/{username}/{squad_name}/{agent_name}/`
5. Marketplace consumer discovers via `squad plugin marketplace browse`

**CLI Commands:**
```bash
squad export                    # exports local squad to squad-export.json
squad import squad-export.json  # re-import on another machine
```

**Prerequisites:**
- gh CLI authenticated (to push to registry repo)
- Write access to target registry repo
- Agent names follow conventions (alphanumeric, `-` separator)

**Failure Modes:**

| What Goes Wrong | Root Cause | User Sees | Recovery |
|---|---|---|---|
| **Network failure on push** | Network timeout while `git push` | Git error message (unclear that export is intact) | Retry push. Export file is safe locally. |
| **Agent name collision in registry** | Same name published twice by different users | `git push` conflicts or overwrite warning | Rename agent locally before export, or use namespace (username/squad/agent). |
| **MCP server path invalid** | Export includes absolute path `/Users/alice/...` | Import fails silently if server not found | Validate MCP config before export. Squad must strip absolute paths. |
| **Charter references local file** | Charter.md has `![diagram](./local-diagram.png)` | Import fails or image broken | Export validation should detect and warn. User must resolve before publishing. |
| **SDK version incompatibility** | Exported with SDK v0.1.8, consumer has v0.1.7 | Import succeeds but agent may malfunction | Metadata should include SDK version requirement. Import warning if mismatch. |
| **Large agent (>10MB)** | Huge charter + embedded files | Push times out or fails | Squad should warn on export if >5MB. Split into multiple agents. |

**Recommendations for Each Crack:**

1. **Validation on export:** Scan charter for file references. Strip absolute MCP paths. Warn if >5MB.
2. **Export command feedback:** Show success message + summary (agent count, size, MCP servers).
3. **Version metadata:** Include `sdkVersion` + `squadVersion` in metadata. Import compares and warns.
4. **Network resilience:** Retry logic on push (optional; Git handles this). But inform user export is safe to retry.
5. **Name collision:** Document naming convention. Suggest `{username}/{squad_name}/{agent_name}` to prevent collisions.

---

### Flow B: Registry → Import → Local (Consuming)

**Actors:** Team lead, Marketplace consumer  
**Direction:** IN (registry repo → local `.squad/`)  
**Artifact:** Agent, Squad, or Skills  

**Happy Path:**
1. Consumer runs `squad plugin marketplace add owner/repo`
2. Consumer runs `squad plugin marketplace browse` to see available agents
3. Consumer selects agent and runs `squad import agent-name`
4. Squad fetches definition from registry (pinned to commit SHA)
5. Squad checks for name collision (decision Q13: DISALLOWED)
6. If collision, user is asked to rename (e.g., `agent-name → agent-name-imported`)
7. Agent is cached locally at `.squad/agents/{agent-name-imported}/`
8. History shadow created at `.squad/agents/{agent-name-imported}/history.md`

**CLI Commands:**
```bash
squad plugin marketplace add bradygaster/squad-marketplace
squad plugin marketplace browse
squad import baer                              # from registered marketplace
squad import bradygaster/squad-marketplace/baer  # explicit path
squad places upgrade                           # update to latest (new commit)
```

**Prerequisites:**
- gh CLI authenticated (to read registry repo, even if public)
- Registry repo contains agent in `agents/{username}/{squad_name}/{agent_name}/` structure
- Local agent name available (no collision, or user okayed rename)
- Network access to registry repo (or cached version available)

**Failure Modes:**

| What Goes Wrong | Root Cause | User Sees | Recovery |
|---|---|---|---|
| **Agent name collision** | Importing "baer" but local "baer" exists | ERROR: "Agent 'baer' already exists. Rename? Y/n" | User chooses new name. Import retries with new name. |
| **Network unreachable** | Offline or registry repo gone | ERROR: "Can't reach marketplace. Use cached version? Y/n" (Decision Q25) | If cached: use it + WARN. If no cache: friendly error "Import requires network. Retry online." |
| **Agent definition malformed** | Registry repo has corrupt JSON or missing files | ERROR: "Agent definition invalid: missing charter.md" | Squad validates structure on import (decision Q26: validate on import). User contacts publisher. |
| **MCP server not installed** | Agent requires PostgreSQL MCP but user doesn't have it | WARNING: "PostgreSQL MCP not found. Agent may not function." | Graceful degradation. Agent loads but MCP tool calls fail gracefully. |
| **Name collision during retry** | User imports "baer", renames to "baer-prod", but "baer-prod" exists | ERROR: "Name 'baer-prod' not available. Choose another." | Loop back to rename prompt. |
| **Commit SHA gone** | Registry force-pushed; pinned commit no longer exists | ERROR: "Pinned commit abc123 not found. Update marketplace? Y/n" | User can upgrade to latest (new commit) or contact publisher for tag. |
| **Offline mode cached but stale** | Cached agent is 2 weeks old; newer version available online | Loads cached version. WARN: "Agent cached from 2 weeks ago. Upgrade online to latest?" (Decision Q25) | User can choose to stay offline or upgrade. Gives control. |
| **Silent failure on MCP config mismatch** | Agent's MCP config expects 3 servers; user only has 2 installed | Agent loads, but MCP tool calls partially fail | No error on import. Failure only discovered at runtime (risky). Recommendation: validate MCP servers on import. |

**Recommendations for Each Crack:**

1. **Collision detection:** Implement as blocking error (decision Q13 is "DISALLOWED"). Require rename.
2. **Network failure graceful degradation:** Always check `.squad/.cache/{agent-name}.json` before erroring. Warn if cache is stale (>7 days).
3. **Offline mode:** Add `--offline` flag to import. Use cache only, error if not cached.
4. **Validation on import:** Check charter exists, MCP config is valid JSON, history shadow can be created.
5. **MCP validation:** Scan MCP servers in import. Check which ones are installed locally. Warn if missing, but allow import.
6. **Stale cache detection:** Log timestamp in cache. Warn if >7 days old. Suggest upgrade.
7. **Commit SHA failure:** Check git tag/branch as fallback. If neither exist, provide friendly error with "upgrade available" suggestion.
8. **Success feedback:** Show summary: "Imported agent 'baer-prod' (from bradygaster/squad-marketplace, commit abc123). Cache location: .squad/.cache/baer-prod.json"

---

### Flow C: Local → Local Direct Sharing (Team Collaboration)

**Actors:** Team members in same org  
**Direction:** SIDEWAYS (one local repo → another local repo)  
**Artifact:** Agent, Squad, or Skills  

**Happy Path:**
1. Developer A exports squad to `squad-export.json`
2. Developer A commits to shared GitHub repo (or emails JSON)
3. Developer B clones or receives file
4. Developer B runs `squad import squad-export.json` (local file)
5. Collision detection runs. If collision, B is asked to rename.
6. Squad loads into B's local `.squad/`

**CLI Commands:**
```bash
squad export                              # on machine A
# email/commit squad-export.json to machine B
squad import ~/Downloads/squad-export.json  # on machine B
```

**Prerequisites:**
- File access (git, email, shared drive)
- Compatible Squad versions (soft: import should warn if squad-export.json is from older version)
- Local agent name available (or user accepts rename)

**Failure Modes:**

| What Goes Wrong | Root Cause | User Sees | Recovery |
|---|---|---|---|
| **File not found** | Typo in path or file moved | ERROR: "File not found: ~/Downloads/squad-export.json" | User finds correct path and retries. |
| **Corrupted JSON** | File transfer interrupted (email attachment truncated) | ERROR: "Invalid JSON in squad-export.json: unexpected EOF at line 243" | Developer A re-exports and resends. |
| **Squad version mismatch** | A exported with v0.4.1, B has v0.5.0 | Import succeeds but may have schema issues | Metadata in export includes version. Import should warn "exported with v0.4.1, current is v0.5.0. Some features may differ." |
| **MCP server path absolute** | Export includes `/Users/alice/mcp-servers/...` | Import on B's machine fails (path doesn't exist on B) | Squad must strip or warn on absolute paths during export. B can override with local path. |
| **Agent name collision not detected** | User A had "baer", user B imports another "baer" | ERROR: "Agent 'baer' already exists. Rename? Y/n" | User B renames during import. Works. |
| **Partial import on filesystem error** | Disk full during import | `.squad/agents/baer/` exists but incomplete (missing history.md) | Import should be atomic. Rollback on error. Clear error message: "Import failed: disk full. Rolled back." |

**Recommendations for Each Crack:**

1. **Atomic import:** Wrap in transaction. If any file write fails, rollback entire import.
2. **Validation before write:** Check disk space, file paths, JSON schema BEFORE touching filesystem.
3. **Version warning:** Include squad version in export metadata. Import warns if mismatch.
4. **Absolute path detection:** Scan exported JSON for absolute paths. Warn on export. Offer to make paths relative.
5. **Clear error messages:** "Import failed: {reason}. Rolled back to previous state. No changes made." Builds trust.

---

### Flow D: Registry → Registry (Cross-Marketplace)

**Actors:** Registry maintainers, Platform aggregators  
**Direction:** SYNC (registry A → registry B)  
**Artifact:** Agent, Squad, or Skills  

**Use case:** A marketplace curator wants to re-publish an agent from another marketplace (fork/mirror).

**Happy Path:**
1. Curator A at `marketplace-a/agents/...` publishes an agent
2. Curator B wants to mirror it to `marketplace-b/agents/...`
3. Curator B runs (hypothetically): `squad sync marketplace-a bradygaster/baer` (not yet implemented)
4. Squad fetches definition from marketplace-a
5. Curator B commits to marketplace-b with attribution

**CLI Commands (Future):**
```bash
# Not yet implemented. Manual workflow:
git clone marketplace-a
cd agents/bradygaster/baer
git commit --amend --message "Mirrored from marketplace-a (commit abc123)"
# Push to marketplace-b
```

**Prerequisites:**
- Write access to both registries
- Ability to verify attribution (who is the original publisher?)
- License compatibility (agent license must allow redistribution)

**Failure Modes:**

| What Goes Wrong | Root Cause | User Sees | Recovery |
|---|---|---|---|
| **License violation** | Agent licensed as "Non-commercial only" but curator republishes | No error (SDK doesn't validate licenses). User/publisher discovers later | Squad should warn on import if license is restrictive. Or agents should include LICENSE file and import validates. |
| **Attribution lost** | Agent copied without crediting original publisher | Consumer doesn't know true author | Metadata must include `publisher` + `originRepository`. Import preserves and displays. |
| **Divergent versions** | marketplace-b's copy diverges from marketplace-a's. Both claim to be "baer" | Consumer imports from wrong registry. Version mismatch. | Pinning to commit SHA helps. But requires consumer to be aware of which registry to use. Document registry precedence. |
| **Desynchronization** | marketplace-b is stale (2 weeks old); marketplace-a has updates | Consumer imports old version unaware | Metadata should include `syncedAt` timestamp. Curator should document sync frequency. Consumer can check `squad places upgrade` for newer version. |

**Recommendations for Each Crack:**

1. **License field in metadata:** All agents must have `license` field. Import warns if restrictive.
2. **Attribution:** Preserve `publisher` + `originRepository` in metadata. Never overwrite.
3. **Registry precedence:** Document in `squad.config.ts` which marketplace is primary. First-listed source wins.
4. **Version sync metadata:** Include `lastSyncedAt` + `originalCommit` in re-published agents. Import displays.
5. **Audit trail:** Maintain version history in git. Each sync is a commit with message "Sync from marketplace-a commit abc123".

---

### Flow E: Upgrade/Update Flows (New Version of Imported Agent)

**Actors:** Marketplace consumer, Agent publisher  
**Direction:** IN (registry → local, repeated)  
**Artifact:** Updated Agent definition  

**Happy Path:**
1. Consumer imported "baer" 3 weeks ago (pinned to commit abc123)
2. Publisher released updated "baer" (new commit def456)
3. Consumer runs `squad places upgrade` (checks all imported agents for updates)
4. Squad detects new commit def456 available
5. Consumer runs `squad places upgrade baer` to fetch new version
6. Squad replaces local cached definition with new version
7. History shadow preserved (local learnings intact, not overwritten)

**CLI Commands:**
```bash
squad places upgrade              # check all imported agents
squad places upgrade baer         # upgrade specific agent
squad places upgrade --dry-run    # show what would be upgraded
```

**Prerequisites:**
- Network access to registry (same as Flow B)
- Commit SHA or release tag available
- Decision Q25: NO automatic refresh. Manual `squad places upgrade` only.

**Failure Modes:**

| What Goes Wrong | Root Cause | User Sees | Recovery |
|---|---|---|---|
| **Breaking change in agent** | New version has different charter, model, or MCP servers | Upgrade succeeds silently. Agent behaves differently. User unaware. | No error. This is the risk of aggressive caching + manual upgrade. Recommendation: include changelog in agent metadata. Import warns on major version change. |
| **Upgrade fails silently** | New commit exists but network is flaky; partial download | Local agent still works (stale version). No error message. | Add logging: "Upgrade to new version failed. Keeping cached version." Explicitly inform user of stale state. |
| **History shadow overwritten** | Upgrade replaces entire agent definition, including history | Local project learnings lost | NEVER overwrite history shadow. Keep separate from definition. History is permanent once created. |
| **MCP server compatibility break** | Old version had PostgreSQL MCP. New version removed it. | Import succeeds. Agent loads but MCP calls fail. | Metadata should include `mcp.breaking: true` if MCP servers changed. Import validates and warns. |
| **Rollback needed** | User upgraded but new version is broken | No easy rollback. User stuck with new version. | Squad should keep `.squad/.cache/{agent-name}.{old-commit}.json` for easy rollback. `squad places rollback baer` command. |
| **Upgrade to incompatible SDK version** | Agent requires SDK v0.2.0 but user has v0.1.8 | Upgrade succeeds. Agent malfunctions at runtime. | Metadata includes `sdkVersion` requirement. Import warns if mismatch. `squad places upgrade` checks compatibility before pulling. |

**Recommendations for Each Crack:**

1. **Changelog in metadata:** Agent metadata includes `changelog: [{ version: "1.0.1", date: "2026-02-22", changes: [...] }]`. Import displays for major versions.
2. **Version comparison:** `squad places upgrade` compares semver. Warn on major version jump. Require confirmation for breaking upgrades.
3. **Upgrade logging:** Always log: "Upgraded baer from commit abc123 to def456. Cached copy preserved at .squad/.cache/baer.abc123.json"
4. **History preservation:** Never touch history shadow. Keep at `.squad/agents/{name}/history.md`. Import puts definition at `.squad/.cache/{name}.json`. Separation is sacred.
5. **Rollback support:** `squad places rollback baer [commit-sha]` to downgrade. Keep last 3 versions cached.
6. **Dry-run feedback:** `squad places upgrade --dry-run` shows: "baer: 0.1.8 → 0.2.1 (major). New MCP servers: [PostgreSQL, Redis]. Confirm? Y/n"
7. **SDK compatibility check:** Before downloading, validate `agent.metadata.sdkVersion <= current_sdk_version`. Error if incompatible: "Agent requires SDK 0.2.0+. Current: 0.1.8. Upgrade SDK first."

---

## 4. Complete Failure Analysis: Where Customers Fall Through Cracks

### Silent Failures (Undetected Success)

**Crack 1: Imported Agent with Broken MCP Config**

**Scenario:** Consumer imports agent from marketplace. Agent charter lists 3 MCP servers. Only 1 is installed locally. Import succeeds without warning. Agent loads and functions, but MCP tool calls silently fail or return errors the user doesn't recognize.

**Root cause:** Import validates structure (decision Q26) but not MCP server installation.

**User sees:** Agent works (for non-MCP tasks). When MCP is used, cryptic error or no error at all (tool call returns empty result).

**Impact:** User assumes agent is working. Discovers issue weeks later when they actually need the MCP feature.

**Fix:** Scan agent's MCP servers on import. Check `which` or GitHub Copilot CLI mcp-servers command. Warn: "Agent requires PostgreSQL MCP (not installed). Import anyway? Y/n [Y] — Agent will function without database features."

---

**Crack 2: Cached Agent Stale, Consumer Unaware**

**Scenario:** Consumer imports agent 4 weeks ago (pinned to commit abc123). Publisher pushed update (commit def456). Consumer never runs `squad places upgrade`. Using stale agent unaware.

**Root cause:** Decision Q25: aggressive caching, NO TTL, NO auto-refresh. Local copy is source of truth.

**User sees:** Agent works, but is 4 weeks old. No indication it's outdated.

**Impact:** User misses bug fixes, security patches, feature updates.

**Fix:** 
1. On every coordinator session, log: "Agent 'baer' imported on 2026-01-25 from commit abc123. Current available: def456 (2026-02-22). Update? `squad places upgrade baer`"
2. Show in `squad status` or `squad places list`: last-checked-for-updates timestamp.
3. Optional: `squad places upgrade --check` (network-only, no download) to see available updates.

---

**Crack 3: History Shadow Lost During Import**

**Scenario:** Consumer imports remote agent. Local history shadow created at `.squad/agents/baer/history.md`. Later, consumer re-imports same agent (accident, or force). History shadow overwritten, erasing project-specific learnings.

**Root cause:** Import process doesn't check if history already exists. Silently overwrites.

**User sees:** No error. History appears unchanged at first glance.

**Impact:** Months of agent learning (project-specific patterns, failures, decisions) lost silently.

**Fix:** 
1. Check if history shadow exists before import.
2. If exists, merge new history with old (append-only). Never overwrite.
3. Warn: "Agent 'baer' already imported. Merge with existing history? [Y]es/[N]o/[R]eplace — (R)eplace will erase project learnings from 2026-01-25."

---

**Crack 4: Collision Detection Bypassed by Rename**

**Scenario:** Consumer imports "baer". Collision detected. User renames to "baer-imported". Minutes later, user imports again (accident, or didn't realize). Second import also renames to "baer-imported" (same logic). Now two agents with identical names in the registry.

**Root cause:** Rename logic is not cached. Each import applies same rename rule independently.

**User sees:** No error. `squad list agents` shows "baer-imported" (same name). Confusion about which is which.

**Impact:** User can't distinguish agents. Might delete wrong one. Routing breaks if both match the same query.

**Fix:** 
1. Track imported agents in a manifest (`.squad/.cache/imports.json`). Each import is logged with original name, commit SHA, rename (if any).
2. On subsequent import attempt, check manifest first. If already imported with same commit, offer: "Agent already imported as 'baer-imported' (from commit abc123). Re-import? [S]kip/[U]pdate/[D]uplicate"
3. This prevents accidental duplicates.

---

### Confusing States (Partially Correct)

**Crack 5: Version Drift — Import Succeeded with Incompatible SDK**

**Scenario:** Consumer has Squad v0.4.1 (SDK v0.1.7). Agent published for v0.5.0 (SDK v0.1.8). Consumer imports successfully (no schema mismatch). Agent loads and mostly works, but some Copilot SDK features (like streaming) are unavailable or behave differently. Consumer has no idea why.

**Root cause:** Import validates structure, not SDK compatibility.

**User sees:** Agent works, but feels slow or incomplete. No error message.

**Impact:** User assumes agent is poorly designed. Doesn't blame their SDK version mismatch.

**Fix:** 
1. Include `sdkVersion` in agent metadata. E.g., `"sdkVersion": ">=0.1.8"`
2. On import, check: `if agent.sdkVersion > current_sdk_version: warn("Agent requires SDK 0.1.8+. Current: 0.1.7. Features may be limited. Upgrade Squad? `npm install @github/copilot-sdk@latest`")`
3. Store the warning in `.squad/agents/{name}/import-warnings.md` so user can revisit.

---

**Crack 6: MCP Server Override Mismatch**

**Scenario:** Agent is configured to use PostgreSQL MCP. Consumer's `.squad/` overrides it to use MySQL MCP (different server). Import succeeds. Agent loads with MySQL override. Later, agent uses PostgreSQL-specific SQL patterns. Fails silently at runtime.

**Root cause:** No validation that MCP server override is compatible with agent charter.

**User sees:** Agent fails on database operations. Error message traces back to SQL compatibility, not MCP mismatch.

**Impact:** User spends hours debugging "why is this SQL syntax wrong?" when real issue is MCP server mismatch.

**Fix:** 
1. Agent charter should document MCP server requirements explicitly. E.g., "# Requires PostgreSQL via `{mcp:postgres}`"
2. On import, validate that configured MCP servers match requirements. Warn if mismatch: "Agent requires PostgreSQL MCP. Your config overrides to MySQL. Continue? [Y]es/[N]o — continue at your own risk."
3. Store validation report in `.squad/agents/{name}/mcp-validation.md` for debugging.

---

### Missing Feedback (User Uncertain)

**Crack 7: Export Success Not Confirmed**

**Scenario:** Consumer runs `squad export`. Command completes. No success message. User not sure if export succeeded or where file is.

**Root cause:** CLI doesn't provide feedback beyond exit code.

**User sees:** Blank terminal. No confirmation.

**Impact:** User might re-run export multiple times. Confusion about file location.

**Fix:** Always print success message:
```
✅ Squad exported successfully
   File: squad-export.json (2.4 MB)
   Agents: 3 (baer, edie, fortier)
   Skills: 8
   Compatible with Squad >=0.4.1
   
   Next: Push to registry with:
   git add squad-export.json && git commit -m "Export squad v0.4.1"
```

---

**Crack 8: Import Progress Hidden**

**Scenario:** Consumer runs `squad import large-squad-export.json`. File is 50 MB. Agent has 15 members and 100+ skills. Import takes 2 minutes. User sees no output. Assumes it's hung.

**Root cause:** No progress indicator.

**User sees:** Blank cursor for 2 minutes. Then success.

**Impact:** User interrupts (Ctrl+C) thinking it's frozen.

**Fix:** Show progress:
```
Importing squad from large-squad-export.json...
  Loading: 45% [████░░░░░░░░░░░░░░░░] (est. 30s)
  ✓ Validating structure... done (156ms)
  ↓ Creating agents: 12/15
    ↓ baer... done
    ↓ edie... done
    ↓ fortier... in progress
```

---

**Crack 9: Offline Mode Ambiguity**

**Scenario:** Consumer tries `squad import baer` while offline (no network). No cache exists. Import fails with error: "Can't reach marketplace repo."

**Root cause:** Error message doesn't explain the root cause (offline) or recovery (go online or use cached version if available).

**User sees:** "Error: GitHub API unreachable. Check network."

**Impact:** User doesn't know if issue is network, authentication, or marketplace repo gone.

**Fix:** Detailed error with recovery:
```
❌ Can't reach marketplace repo: bradygaster/squad-marketplace
   Reason: offline (no internet connection)
   
   Recovery options:
   1. Go online and retry: `squad import baer`
   2. Use cached version (if available): none cached
   3. Add a new marketplace: `squad plugin marketplace add <owner/repo>`
   
   Questions? Check docs: https://docs.example.com/offline-mode
```

---

### Edge Cases (Rare but High-Impact)

**Crack 10: Circular Dependency in Imported Agents**

**Scenario:** Marketplace publishes agent "orchestrator" which, in its charter, spawns "baer" (another imported agent). Consumer imports both. When spawning "orchestrator", it tries to spawn "baer", which is remote. Circular reference.

**Root cause:** No validation that spawned agents are resolvable locally.

**User sees:** Orchestrator hangs or fails cryptically.

**Impact:** User can't use orchestrator agent.

**Fix:** 
1. On import, scan charter for `task` calls or `spawn` mentions.
2. Resolve each mentioned agent locally.
3. Warn: "Agent 'orchestrator' spawns agent 'baer'. Ensure 'baer' is imported. [C]ontinue anyway/[C]ancel"

---

**Crack 11: Conflicting Skills with Same Name**

**Scenario:** Consumer imports squad A (has skill "API Testing"). Consumer then imports squad B (also has skill "API Testing"). Decision Q23: first-listed source wins. But which squad was first-listed?

**Root cause:** Import order determines precedence, but user doesn't explicitly control order.

**User sees:** Two skills with same name. Only one is active. Confusion about which.

**Impact:** Agent uses wrong skill definition. Unexpected behavior.

**Fix:** 
1. On import, scan for skill name conflicts. Warn: "Skill 'API Testing' exists in both Squad A and Squad B. Using Squad A's version. Rename? Y/n"
2. Offer to rename on import: "Rename Squad B's skill to 'API Testing (Squad B)'?"
3. Track in `.squad/skills/manifest.json` which skill came from which import, so user can troubleshoot.

---

**Crack 12: Large Agent Import Timeout**

**Scenario:** Marketplace publishes 500 MB agent (includes large binary files, datasets). Consumer tries to import. Network is slow. Import times out after 5 minutes.

**Root cause:** No timeout configuration. No resume capability.

**User sees:** "Error: timeout. Network slow?"

**Impact:** Agent can't be imported. User has to wait and retry.

**Fix:** 
1. On export, warn if agent >50 MB: "Agent is 500 MB. Consider splitting into smaller parts."
2. On import, implement resume: `squad import baer --resume` retries from last checkpoint.
3. Allow timeout configuration: `squad import baer --timeout 600` (10 minutes).

---

**Crack 13: Permission Denied on Import (Auth Failure)**

**Scenario:** Consumer runs `squad import baer` from private marketplace. gh CLI is authenticated, but current user doesn't have access to that private repo. Import fails.

**Root cause:** No pre-flight auth check. Error only happens when trying to fetch.

**User sees:** "Error: GitHub API 404 Not Found — agent not found?"

**Impact:** User thinks agent doesn't exist, not that they lack permission.

**Fix:** 
1. Pre-flight check: `gh api repos/{owner}/{repo} 2>&1` before attempting import.
2. If 403 (permission denied), error: "You don't have access to bradygaster/squad-marketplace. Request access from team lead or use public marketplace."
3. If 404 (not found), different error: "Marketplace bradygaster/squad-marketplace not found. Add it first: `squad plugin marketplace add bradygaster/squad-marketplace`"

---

**Crack 14: Export Data Loss (Unvalidated Charter)**

**Scenario:** Agent charter has been manually edited and is now invalid Markdown (missing closing backticks in code block). `squad export` succeeds. Export JSON contains broken charter. Consumer imports. Charter won't render correctly.

**Root cause:** Export doesn't validate charter markdown syntax.

**User sees:** Imported agent's charter displays incorrectly (code block malformed).

**Impact:** Agent documentation is unreadable. User can't understand agent's purpose.

**Fix:** 
1. On export, parse charter markdown. Validate syntax (balanced backticks, valid header levels).
2. If invalid, warn: "Charter contains syntax errors: line 15 has unclosed backtick. Fix before exporting? Y/n"
3. Export with warning note in metadata: `"charterValidationWarnings": ["line 15: unclosed backtick"]`

---

## 5. Summary: All Cracks Identified

| # | Crack | Severity | Root Cause | User Impact | Recommendation |
|---|-------|----------|-----------|-------------|-----------------|
| 1 | Broken MCP config silent | HIGH | No validation on import | MCP features silently fail | Validate MCP servers on import, warn if missing |
| 2 | Stale agent unaware | MEDIUM | Aggressive caching, no refresh signal | Misses updates for weeks | Show update availability in coordinator, log when cache is used |
| 3 | History shadow lost | HIGH | Overwrite on re-import | Project learnings erased | Merge history, never overwrite; require confirmation |
| 4 | Collision detection bypassed | MEDIUM | Rename not tracked | Duplicate agents with same name | Track imports in manifest, prevent accidental duplicates |
| 5 | SDK version drift | MEDIUM | No compatibility check | Agent features incomplete | Include sdkVersion in metadata, check on import |
| 6 | MCP override mismatch | MEDIUM | No validation of MCP compatibility | Runtime failures, hard to debug | Validate charter MCP requirements vs configured servers |
| 7 | Export success not confirmed | LOW | No feedback | User uncertainty | Print success summary with file size, agent count, version |
| 8 | Import progress hidden | LOW | No progress indicator | User thinks process is hung | Show progress bar, step-by-step feedback |
| 9 | Offline mode ambiguity | MEDIUM | Unclear error message | User confused about root cause | Detailed error with recovery options |
| 10 | Circular dependency | MEDIUM | No validation of spawned agents | Agent hangs or fails | Scan charter for spawned agents, resolve locally |
| 11 | Conflicting skills | MEDIUM | Import order not explicit | Agent uses wrong skill | Warn on name conflicts, offer rename or precedence UI |
| 12 | Large agent timeout | LOW | No timeout config, no resume | Import fails, must retry from start | Resume support, configurable timeout, size warning on export |
| 13 | Permission denied auth | MEDIUM | No pre-flight auth check | User thinks agent doesn't exist | Pre-flight auth validation, different errors for 403 vs 404 |
| 14 | Export data loss | LOW | No charter validation | Imported agent broken | Validate charter markdown on export, warn on syntax errors |

---

## 6. Recommendations: Fixes for Each Crack

### Quick Wins (Low effort, high impact)

1. **Export/Import Feedback (Cracks 7, 8, 9)**
   - Add success messages to `squad export` and `squad import` with summary
   - Show progress bar during import (especially for large agents)
   - Detailed error messages that explain root cause and recovery options

2. **Pre-flight Validation (Cracks 1, 5, 6, 13)**
   - On import: validate charter markdown syntax (Crack 14)
   - On import: check MCP servers are installed (Crack 1)
   - On import: validate agent.sdkVersion is compatible (Crack 5)
   - On import: pre-flight auth check for private marketplaces (Crack 13)

3. **Stale Cache Indicator (Crack 2)**
   - Log import timestamp in cache
   - When loading cached agent, warn: "Agent 'baer' imported 4 weeks ago from commit abc123. Update available: def456. Run: squad places upgrade baer"

### Medium Effort, High Impact

4. **History Preservation (Crack 3)**
   - Separate charter definition (`.squad/.cache/{name}.json`) from history shadow (`.squad/agents/{name}/history.md`)
   - On re-import, merge history instead of overwriting
   - Require explicit confirmation if user wants to replace: `--force-replace-history`

5. **Import Manifest (Crack 4)**
   - Create `.squad/.cache/imports.json` tracking all imported agents
   - Before each import, check manifest: if agent already imported with same commit, skip or update
   - Prevents accidental duplicates from repeated imports

6. **Detailed Export Warnings (Crack 14)**
   - On export, validate charter markdown, MCP config, agent name conventions
   - Generate `export-validation.md` with warnings
   - Require user confirmation if warnings found

### Strategic (Future Phases, Compound Value)

7. **Charter Scanning for Dependencies (Crack 10)**
   - Scan agent charters for `spawn` patterns and agent references
   - On import, validate that spawned agents are resolvable
   - Build dependency graph and warn on circular references

8. **Skill Manifest & Conflict Resolution (Crack 11)**
   - Create `.squad/skills/manifest.json` listing all skills and their source (local, or imported from which squad/marketplace)
   - On import, detect skill name conflicts, offer rename or precedence rules
   - Show in `squad status` which skills are active

9. **Import Resume & Timeout Config (Crack 12)**
   - Implement resume capability: `squad import baer --resume` retries from last checkpoint
   - Allow timeout configuration: `squad import baer --timeout 600`
   - Show size warning on export if >50 MB

10. **MCP Validation & Override Tracking (Crack 6)**
    - Document MCP requirements in agent charter
    - Validate charter requirements vs configured servers on import
    - Store override decisions in `.squad/agents/{name}/mcp-config.md` for debugging

---

## 7. Recovery Flows: How Users Fix Mistakes

### Rollback After Bad Import

**Scenario:** User imported agent, now wants to undo.

**Recovery:**
```bash
# Option 1: Remove agent
rm -rf .squad/agents/{name}
rm .squad/.cache/{name}.json

# Option 2: Restore from manifest/rollback
squad places rollback {name}  # (future command)

# Option 3: Check what changed
git diff .squad/
git checkout -- .squad/agents/{name}/  # restore from git
```

**Recommendation:** Implement `squad import {agent} --dry-run` to preview changes before committing.

---

### Update to Incompatible Agent

**Scenario:** User upgraded agent, now it doesn't work with their project.

**Recovery:**
```bash
# Downgrade to previous version
squad places rollback baer abc123  # abc123 = old commit

# Or clear cache and re-import with specific commit
rm .squad/.cache/baer.json
squad import baer@abc123
```

**Recommendation:** Keep `.squad/.cache/baer.{old-commit}.json` for easy rollback. `squad places rollback` command.

---

### Fix Collision / Rename Mistake

**Scenario:** User imported agent as "baer-imported" but wants to rename to "baer-prod".

**Recovery:**
```bash
# Check current agents
squad list agents

# Manually rename (for now)
mv .squad/agents/baer-imported .squad/agents/baer-prod
mv .squad/.cache/baer-imported.json .squad/.cache/baer-prod.json

# Update imports manifest
# (edit .squad/.cache/imports.json to reflect new name)
```

**Recommendation:** Implement `squad import {agent} --rename {new_name}` to support rename during import.

---

## 8. Decision Reference

Decisions embedded in this analysis:

- **Q1 (Directory convention):** `agents/{github_username}/{squad_name}/{agent_name}/` ensures no collisions in multi-squad registries.
- **Q2 (Auth):** gh CLI token used for all API access (import, marketplace, registry).
- **Q3 (First-class export):** Both agents and squads are equally exportable/importable.
- **Q4 (Pinning):** Import pins to commit SHA, explicit `squad places upgrade` for new versions.
- **Q5 (Collision blocking):** Import collision is DISALLOWED — block + require rename.
- **Q10 (Caching):** Aggressive caching, local copy is source of truth, no TTL, no auto-refresh.
- **Q14 (Offline graceful):** Offline sources use cache + warn, or friendly error if no cache.
- **Q23 (Config order):** First-listed source wins, no ambiguity.
- **Q24 (PRD-16):** Export/import is marketplace feature, aligned with existing conventions.
- **Q25 (Cache + warn):** Decision expanded here: cache is aggressive, but users should be warned about staleness.
- **Q26 (Validation on import):** Validate structure, warn on suspicious patterns.

---

## 9. Next Steps

This analysis identifies **14 customer risk points** across three severity levels (LOW, MEDIUM, HIGH). 

**Immediately actionable** (before M5 implementation):
1. Add export/import feedback messages (Crack 7, 8, 9)
2. Add pre-flight validation on import (Crack 1, 5, 6, 13)
3. Document recovery flows for common mistakes

**Before M5 ships:**
4. Implement history shadow preservation (Crack 3)
5. Add import manifest tracking (Crack 4)
6. Validate charter markdown on export (Crack 14)
7. Cache staleness indicator (Crack 2)

**Phase 2+ enhancements:**
8. Charter dependency scanning (Crack 10)
9. Skill conflict resolution UI (Crack 11)
10. Import resume + timeout config (Crack 12)
11. MCP validation framework (Crack 6)

---

**End of Analysis**

Generated by: Keaton (Lead)  
Date: 2026-02-22  
Status: Ready for PRD 16 (Import/Export & Marketplace)
