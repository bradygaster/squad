# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Core Context

Three-branch model (main/dev/insiders). Apollo 13 team, 3931 tests. Boundary review heuristic: "Squad Ships It" — if Squad doesn't ship the code, it's IRL content. Proposal-first: meaningful changes need docs/proposals/ before code. Two-error lockout policy: agent locked out after 2 errors in a session. Test name-agnosticism: framework tests must never depend on dev team's agent names.

## Learnings

### Adoption Tracking Architecture
Three-tier opt-in system: Tier 1 (aggregate-only, `.github/adoption/`) ships first; Tier 2 (opt-in registry) designed next; Tier 3 (public showcase) launches when ≥5 projects opt in. `.squad/` is for team state only, not adoption data. Never list individual repos without owner consent.

### Remote Squad Access
Three-phase rollout: Phase 1 — GitHub Discussions bot with `/squad` command (1 day, zero hosting). Phase 2 — GitHub Copilot Extension via Contents API (1 week). Phase 3 — Slack/Teams bot (2 weeks). Constraint: any remote solution must solve `.squad/` context access.

### Content Triage Skill
"Squad Ships It" litmus test codified into reusable workflow. Triggered by `content-triage` label. Output: boundary analysis, sub-issues for PAO (doc extraction), IRL reference for Scribe. Content labels: `content:blog`, `content:sample`, `content:video`, `content:talk`.

### Distributed Mesh Integration
Zero code changes. Skill files in templates/skills/, scripts in scripts/mesh/, docs in features/. mesh.json stays separate from squad.config.ts. Convention-first additive layer — invisible if unused. 125:1 ratio (30 lines of script vs 3,756 lines of deleted federation code).

### Sprint Prioritization Pattern
Rank by: (1) bugs with active user impact, (2) quality/test gaps blocking GA, (3) high-ROI features unblocking downstream work. Interleave stability (bugs/quality) with velocity (features) across sprint capacity.

### Agent On-Disk Anatomy Documentation
Developer concept doc clarifying the distributed identity model: runtime state (`.squad/agents/{name}/`), SDK infrastructure (`packages/squad-sdk/src/agents/`), and optional config overrides. Charter is DNA (parsed into agent prompt), history is append-only learnings, casting adds memorable names. Three conditions for active agent: charter.md exists, roster entry in team.md, routing rules. Alumni pattern preserves retired agents in `_alumni/`. Context flows via explicit artifacts (team.md, routing.md, decisions.md), not shared memory. SDK is generic runtime — all agent specificity lives in `.squad/`.

### Doc Compression Patterns (2026-03-16)
**Surgical trimming:** When compressing verbose docs (298→152 lines, ~49%), cut who-writes-it/who-reads-it sections, redundant examples, over-explained flows. Keep essential anatomy and code structures. **Human and @copilot coverage:** Squad supports non-spawnable roster members: humans (👤 badge, no charter/history, coordinator waits for input) and @copilot (🤖 badge, uses copilot-instructions.md, capability profile, async via issue assignment). Both participate in routing and reviews. **Strategic docs:** Brady wants small, focused concept docs. Add new sections only when expanding coverage (human members, coding agents) — don't inflate with verbose explanations.

