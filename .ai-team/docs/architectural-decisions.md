# Architectural Decisions — Squad SDK Replatform

A clean reference of key architectural choices made during the SDK replatform planning phase. Each decision captures what we decided, why, and where it came from.

---

## Distribution & Installation

### GitHub-Only Distribution

**Decision:** Squad is distributed via GitHub (npx github:bradygaster/squad), not npmjs.com. SDK stays off npm.

**Why:** GitHub distribution matches GitHub Copilot CLI distribution model. Keeps the install surface simple and aligned with where our users already are.

**Source:** Q19 (Brady, 2026-02-20)

---

### SDK-Free Init by Default

**Decision:** `squad init` scaffolds without the SDK. `--include-sdk` flag available for users who want it upfront. SDK loads only at orchestration time.

**Why:** Reduces startup bundle size and onboarding friction. Customers who don't immediately need orchestration don't pay the cost. SDK availability doesn't block init.

**Source:** Q31 (Brady, 2026-02-20)

---

### Bundle Size Target

**Decision:** ~5MB lean target. Stay close to current footprint. Single-install priority — tree-shake aggressively, minimal dependencies.

**Why:** Global install must be fast and lightweight. Single-install matters more than incremental benefits.

**Source:** Q30 (Brady, 2026-02-20)

---

### GitHub Copilot CLI as P0

**Decision:** GitHub Copilot CLI is a hard dependency (P0). VS Code is very close P1. No standalone CLI outside Copilot for now.

**Why:** Prioritizes the native GitHub CLI experience. Existing VS Code extensions are fixed as a follow-up, not blockers.

**Source:** Q29 (Brady, 2026-02-20)

---

## Directory & File Structure

### .squad/ Folder Convention

**Decision:** `.ai-team/` directory is renamed to `.squad/` starting v0.5.0 with dual-path support, fully removed in v1.0.0.

**Why:** `.squad/` is branded (product name), shorter (6 vs 8 chars), and conventional (follows `.github/`, `.vscode/` patterns). Every customer repo is a billboard — the directory name should be obvious and ownable. Timing is optimal now (small user base); delaying multiplies migration cost. Two-phase approach: v0.5.0 dual support + warn, v1.0.0 remove legacy.

**Source:** Issue #69 (Keaton assessment, 2026-02-16)

---

### Agent Repository Directory Convention

**Decision:** Remote agents live in `agents/{github_username}/{squad_name}/{agent_name}/` in the remote repository.

**Why:** Supports multiple agents, multiple squads per user, and clear namespace separation. Scales for marketplaces and multi-team setups.

**Source:** Q9 (Brady, 2026-02-20)

---

### Local History Shadows for Remote Agents

**Decision:** Remote agents get local history shadows. Local copies accumulate project-specific knowledge alongside remote agents.

**Why:** Remote agents learn from the local project just like local agents do. Doesn't require modifying the remote repository.

**Source:** Q24 (Brady, 2026-02-20)

---

## Authentication & Authorization

### gh CLI Token for Auth

**Decision:** Authentication is via gh CLI token (already authenticated, zero extra config). Same story for both places and cloud repos.

**Why:** Users are already authenticated to GitHub. No new auth surface, no new credentials to manage, zero extra config burden.

**Source:** Q10 (Brady, 2026-02-20)

---

### Trust But Verify for Remote Agents

**Decision:** Remote agents run with full tool access (same as local). Validate structure on import (schema check, warn on suspicious patterns). No sandboxing.

**Why:** User chose to import the agent; user owns the risk. Sandboxing reduces usability without adding security (code inspection is the real defense). Validate structure to catch corrupted imports, not to prevent malicious ones.

**Source:** Q26 (Brady, 2026-02-20)

---

## Versioning & Updates

### Pin to Commit SHA for Versioning

**Decision:** When importing agents from a remote repository, pin to a commit SHA. Explicit upgrade via `squad places upgrade`.

**Why:** Locks behavior to a known state. No surprise updates. Users control when upgrades happen. Automatic refresh would break reproducibility and introduce unexpected agent behavior changes.

**Source:** Q12 (Team decision, Brady deferred, 2026-02-20)

---

### SDK Pinning Strategy

**Decision:** During Technical Preview, pin exact SDK version in package.json. Manual upgrade via `squad upgrade --sdk`. Relax to ~ or ^ when SDK hits stable (v1.0).

**Why:** Technical Preview means breaking changes are possible. Pinning prevents surprise breaks. Manual upgrade gives us control to manage the transition. At v1.0, we can relax.

**Source:** Q34 (Brady, 2026-02-20)

---

### Caching Strategy for Remote Agents

**Decision:** Remote agents are aggressively cached. Local copy is source of truth until explicit `squad places upgrade`. No TTL, no auto-refresh, no webhooks.

**Why:** Offline-first approach. Predictable behavior (no network requests checking for updates). Explicit upgrade means users know when things change.

**Source:** Q21 (Brady, 2026-02-20)

---

## Configuration & Customization

### Config-Driven Architecture

**Decision:** Extract every customizable behavior into config files (JSON/YAML) that the TypeScript runtime reads. squad.agent.md becomes a reference doc, not the executable source.

**Why:** Users customize via config, not code. Preserves customizability from the old prompt-based system but moves it to structured, versionable files. Non-programmers can still edit configs.

**Source:** Q38 (Brady, 2026-02-20)

---

### Agent Repository Conflict Resolution

**Decision:** Config order — first-listed source wins, last in loses. No prompts, no ambiguity.

**Why:** Deterministic. Users control precedence by listing order. Simple to reason about.

**Source:** Q23 (Brady, 2026-02-20)

---

### Import Conflict (Local Agent vs Remote)

**Decision:** DISALLOWED. Block import on name collision, require rename on the way in. Never overwrite, never auto-namespace.

**Why:** Explicit is better than implicit. Users know exactly what they imported. Prevents silent data loss or confusion about which agent is which.

**Source:** Q13 (Brady, 2026-02-20)

---

## Agent & Skill Management

### Hybrid Agent Casting

**Decision:** Imported agents re-cast into local universe by default. Opt-out flag to keep original name.

**Why:** Simplifies agent identity in local context. Agents are identified by function (what they do for this project), not origin. Opt-out flag preserves control for cases where origin identity matters.

**Source:** Q17 (Brady, 2026-02-20)

---

### Skills as Independently Importable Units

**Decision:** Skills are independently importable from places repos. Like awesome-copilot curated lists. Standalone shareable knowledge units.

**Why:** Skills are smaller, reusable knowledge packets. Users might want a skill from one repository and an agent from another. Independent importability enables better composition.

**Source:** Q18 (Brady, 2026-02-20)

---

### SkillSource vs AgentSource

**Decision:** SkillSource and AgentSource are separate, mutually exclusive interfaces. No shared base, no inheritance.

**Why:** Different metadata shapes and resolution patterns. Keeping them separate avoids premature generalization and makes the contract clear.

**Source:** Q27 (Brady, 2026-02-20)

---

### Import/Export Granularity

**Decision:** Both agent-level and squad-level export/import are first-class. Users can export/import a single agent OR a full squad.

**Why:** Different workflows need different granularities. Solo agents are shared individually. Full squads are team templates. Both use the same marketplace infrastructure.

**Source:** Q11 (Brady, 2026-02-20)

---

### Offline Mode Gracefully Degraded

**Decision:** If a remote source is unreachable at startup, use cached versions if available + warn. If no cache, fail gracefully with a friendly error message. Never hard-fail, never silent.

**Why:** Offline-first respects users who work offline or with temporary network issues. Transparency (warning) beats silent failure. A friendly error is better than a crash.

**Source:** Q25 (Brady, 2026-02-20)

---

## SDK Integration & Concurrency

### Single Shared CopilotClient

**Decision:** Multiple concurrent sessions share a single CopilotClient connection. Study SDK samples for concurrent patterns to confirm.

**Why:** Reduces resource overhead and connection churn. SDK samples support this pattern. Early exercise of the API identifies bugs fast.

**Source:** Q36 (Brady, 2026-02-20)

---

### Persistent Session Monitoring

**Decision:** resumeSession() is assumed to work for Ralph's persistent monitoring use case. Study SDK samples for persistent loop patterns. Exercise the API early — file bugs if it breaks.

**Why:** Good partnership with SDK team. Assumes the API does what it advertises. Early exercise finds issues before they're in production.

**Source:** Q35 (Brady, 2026-02-20)

---

## Marketplace & Export/Import

### Export/Import as Marketplace Feature

**Decision:** Export/import is a marketplace function, not a standalone feature. Build our own marketplace adhering to same conventions as existing ones we connect to.

**Why:** Marketplaces are ecosystems. By making export/import compatible with existing marketplace conventions, we enable network effects and interoperability.

**Source:** Q41 (Brady, 2026-02-20)

---

## Process & Coordination

### Single Team, Single Repo

**Decision:** One Squad team coordinates all work across squad (source), squad-sdk, and squad-places-pr. No separate Squad init in squad-sdk.

**Why:** Reduces coordination overhead. Single decision-making surface. Agents reach into other repos as needed.

**Source:** Q44 (Brady, 2026-02-20)

---

### Implementation Timeline

**Decision:** Implementation doesn't start until all milestones and work items are documented, and feature comparison diagrams (Mermaid) are produced.

**Why:** Planning artifacts establish agreement before building. Diagrams communicate architecture visually, reducing rework.

**Source:** Q46 (Brady, 2026-02-20)

---

## Workflow & Template Migration

### Workflow Path Migration Ownership

**Decision:** Kobayashi (Git/Release) owns mechanical .ai-team/ → .squad/ path migration across 12 workflow templates.

**Why:** Clear ownership. Mechanical task fits release workflow. Single person ensures consistency.

**Source:** Q42 (Brady, 2026-02-20)

---

---

## Summary

These 27 decisions form the foundation of the SDK replatform. They were made as part of planning phases Q9–Q46 (Brady and team decisions, 2026-02-20). The decisions balance:

- **Simplicity** — Config-driven instead of prompt-driven; explicit instead of implicit
- **Control** — Users own versioning, caching, import conflicts; no magic
- **Compatibility** — GitHub auth, GitHub distribution, marketplace alignment
- **Offline-first** — Caching, graceful degradation, local as source of truth
- **User customizability** — Config files preserve the non-programmer-friendly customization from the old system

For detailed context, context, see `.ai-team/docs/open-questions.md` (Q9–Q46, resolved section).
