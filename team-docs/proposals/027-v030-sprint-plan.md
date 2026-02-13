# Proposal 027: v0.3.0 Sprint Plan

**Status:** Approved ✅ — REVISED  
**Authored by:** Keaton (Lead)  
**Date:** 2026-02-10  
**Revised:** 2026-02-10 — Brady's reprioritization directive  
**Requested by:** bradygaster — *"let's gear up for the 0.3.0 sprint"*  
**Baseline:** v0.2.0, 92 tests passing, Waves 1-3 shipped, 0 open issues  
**Supersedes:** Previous version of this document (model selection + backlog as Wave 1)

---

> ⚠️ **REVISION NOTICE:** This plan has been fundamentally restructured per Brady's stated priorities. The previous version had model selection and backlog capture as Wave 1. Brady has reordered: **async squad communication is now P0**, GitHub-native integration (Issues, PRs, CCA) is P1, and model selection has moved to Wave 2. Squad DM, previously deferred to Horizon, is UN-DEFERRED and is now the centerpiece of v0.3.0. See [Revision History](#revision-history) at the bottom for what changed and why.

---

## What This Document Is

The execution plan for v0.3.0. Three waves, hard gates, agent assignments. Every item justified by Brady's stated priorities, in order.

Waves 1-3 built the foundation (quality, experience, portability). v0.3.0 makes the foundation accessible from everywhere.

---

## Strategic Thesis

v0.2.0 gave Squad hands (export, import, skills, tiered modes). v0.3.0 gives it reach.

~~Four~~ Six bets, in Brady's priority order:

1. **Talk to your squad from anywhere.** *(TOP PERSONAL PRIORITY)* Brady wants to message his squad from his phone — per repo, any time. Telegram first, platform-agnostic architecture. The three 017 proposals (Keaton's architecture, Kujan's feasibility, Verbal's experience design) are prior art. This is the hardest thing in the plan and the most important. Squad DM transforms Squad from "tool on your computer" to "team in your pocket."

2. **GitHub IS the interface.** Issues become work items. PRs trigger agent responses. Squad reads from and responds to GitHub's native surfaces — not just the CLI. Validated by Shayne Boyer's [slidemaker deployment](https://github.com/spboyer/slidemaker), which proved the pattern: `squad:` label conventions, PRD→Issues flow, 8 of 9 issues completed. This isn't speculative design — it's shipping on top of validation.

3. **CCA works under Squad governance.** When Copilot Coding Agent picks up an issue, it should discover `.ai-team/`, read `squad.agent.md`, and work as a team member. Squad becomes the governance layer for CCA — not competing with it, governing it.

4. **Clean branch configuration.** At `squad init` time, users configure which branches should never contain team files (`.ai-team/`, `team-docs/`, etc.). Per-repo, declarative.

5. **Right model for the right job.** Every agent spawns on the model that matches its work. Still important (Proposals 024, 024a, 024b), but no longer the sole Wave 1 focus.

6. **Marketing site.** Jekyll on GitHub Pages, `docs/` as source (Proposals 029, 029a). Important but not blocking.

---

## What's In — And Why

### In: Async Squad Communication — Squad DM (from Proposals 017, 017-platform-feasibility, 017-experience-design)

**Why now:** Brady's top personal priority. He said he wants THIS more than anything. Previously deferred to Horizon — now UN-DEFERRED and promoted to P0 for v0.3.0.

**Prior art:** Three existing proposals provide a comprehensive design foundation:
- **017-squad-dm-messaging-interface.md** (Keaton) — Hybrid architecture: thin platform adapters → Squad DM Gateway → execution engine. Options A-D evaluated, Option D (Hybrid) recommended.
- **017-platform-feasibility-dm.md** (Kujan) — Copilot SDK as execution backend (recommended), GitHub Actions as fallback. Dev Tunnels over ngrok. Agent spawning via SDK nested sessions is the critical risk gate. ~420 LOC for v0.1.
- **017-dm-experience-design.md** (Verbal) — Single bot/many voices pattern, DM output mode (summary + link), proactive messaging (standups, CI alerts), agent identity via emoji prefix + name.

**Scoped to v0.3.0:** Phase 0 (proof of concept — GitHub Actions fallback, validate the loop) and Phase 1 (Telegram bot + Copilot SDK + Dev Tunnel, single repo, single user). Phase 2 (proactive messaging, push notifications) and Phase 3 (multi-platform, multi-repo) are 0.4.0.

**What must ship:**
- Copilot SDK spike — verify agent spawning works (go/no-go gate for SDK vs. Actions path)
- Telegram bot with polling (v0.1) or webhook + Dev Tunnel (if validated)
- DM mode flag in spawn prompts — agents produce summary output, not 45KB proposals
- Single repo, single user (Brady), local execution
- `.ai-team/dm-log/` for conversation persistence
- If SDK path fails: GitHub Actions fallback with issue-comment-triggered workflows

**What doesn't ship in v0.3.0:**
- Proactive push notifications (Phase 2)
- Multi-platform adapters — Slack, Discord, SMS (Phase 3)
- Multi-repo routing (Phase 3)
- Cloud deployment (Phase 3)

**Risk:** HIGH. This is the hardest item in the plan. The Copilot SDK `task` equivalence is unproven. The SDK spike is a go/no-go gate — if it fails, we fall back to GitHub Actions (lower UX quality, 60-120s latency). Kujan must run the spike before any other DM work begins.

### In: GitHub-Native Integration — Issues, PRs, Squad Labels (from Proposal 028)

**Why now:** Brady's P1. Validated by Shayne Boyer's slidemaker deployment. The `squad:` label convention, issue templates with agent metadata, and PRD→Issues pipeline are proven patterns — not theoretical design. Proposal 028 Phase 1 was already approved for v0.3.0; this expands the scope to include deeper Issue lifecycle integration and PR-triggered agent responses.

**Prior art:**
- **028-github-native-team-planning.md** — Four-phase plan. Phase 1 (one-way push) already approved. Filesystem remains authoritative; GitHub is a synchronized view.
- **Reference implementation:** [spboyer/slidemaker](https://github.com/spboyer/slidemaker) — 9 issues created, 8 completed. `squad:` and `squad:{agent-name}` label conventions validated.

**Scoped to v0.3.0:** Phase 1 (one-way push to Issues) + Issue lifecycle management (issues drive agent work, not just display it). PR review triggers are stretch.

**What must ship:**
- One-way push: proposals → GitHub Issues, backlog items → GitHub Issues, with `squad:` labels
- Issue lifecycle: agents close issues when work completes, with summary comments
- Squad reads Issues as work input — not just CLI messages (the inverse of what 028 Phase 1 originally described)
- `squad:` label convention formalized in coordinator instructions
- If `gh` CLI / GitHub MCP unavailable, skip silently — no degradation

### In: CCA Adoption — Squad as Governance Layer

**Why now:** Brady's P2. When Copilot Coding Agent picks up a GitHub Issue, it should discover `.ai-team/` and work under Squad's governance — reading charters, respecting decisions, following conventions. This makes Squad the team standard that CCA inherits, not a parallel system.

**What must ship:**
- `squad.agent.md` documented as CCA's entry point — CCA reads this file to understand team structure, conventions, and routing
- `.ai-team/` directory structure documented for CCA discovery
- Agent charters available as reference for CCA when working agent-specific issues (`squad:{agent-name}` labels tell CCA which charter to read)
- Test: CCA picks up a `squad:fenster` issue, reads Fenster's charter, follows Fenster's conventions

**Risk:** Medium. CCA's behavior with `.ai-team/` files is not fully characterized. Need validation that CCA reads and respects agent-level files. If CCA ignores `.ai-team/`, fallback is documentation-only governance (still valuable — humans and future CCA versions benefit).

### In: Clean Branch Configuration

**Why now:** Brady's P3. At init time, users should be able to configure branches that should never contain team files. This is a quality-of-life feature that prevents `.ai-team/` and `team-docs/` from leaking into production branches.

**What must ship:**
- `squad init` option: "Which branches should exclude team files?"
- Configuration stored in `.ai-team/config.json` or equivalent
- Guard in coordinator: warn if team files would be committed to a protected branch
- Reasonable defaults: `main`, `master`, `production` excluded by default

**Risk:** Low. This is configuration + prompt engineering. No architectural complexity.

### In: Per-Agent Model Selection (from Proposal 024) — MOVED FROM WAVE 1

**Why now:** Still important — every agent spawn benefits from the right model. But Brady's reprioritization moves this from "sole Wave 1 focus" to a Wave 2 item. The compound value is real; the urgency is lower than async comms and GitHub integration.

**Scoped to:** Phase 1 (coordinator instructions + auto-selection algorithm) and Phase 2 (charter + registry integration). Phase 3 (cost reporting, override persistence) deferred.

### In: Marketing Site (from Proposals 029, 029a)

**Why now:** Brady wants it. Jekyll on GitHub Pages, `docs/` as source. The architecture is decided (Proposal 029). This is independent work that McManus + Fenster can execute in parallel.

**Scoped to:** Phase 1 only — front matter, layouts, config, landing page. No custom plugins.

### In: Team Backlog — Extraction + Dual-Layer Storage (from Proposal 023, Phases 1-2) — RETAINED

**Why now:** Message extraction and backlog capture remain important for the GitHub-native integration (Issues need something to push). Retained from the previous plan at the same scope.

**Scoped to:** Phase 1 (message extraction + dual-layer writes + backlog.md) and Phase 2 (Scribe merge + agent read access).

### In: Demo Script Infrastructure (from Proposal 026, partial) — RETAINED

**Why now:** Brady still needs to show Squad to the world. Demo 1 remains the minimum viable demo infrastructure.

**Scoped to:** Demo 1 script (YAML + vhs tape), CI smoke test, README GIF embed.

---

## What's Out — And Why

| Feature | Why Cut | Revisit When |
|---------|---------|--------------|
| **Squad DM Phase 2 (proactive messaging)** | Phase 0-1 must ship and prove the concept first. Push notifications add complexity before the basic loop works. | DM Phase 1 validated with Brady using it daily |
| **Squad DM Phase 3 (multi-platform, multi-repo)** | One platform, one repo, one user. Prove the pattern, then scale. | Phase 1 is stable, Brady requests Slack/Discord |
| **028 Phases 2-4 (comment pull-back, Project boards, cross-repo)** | Phase 1 shipping in v0.3.0. Build on proven one-way push. | Phase 1 is stable and Brady wants richer integration |
| **Agent cloning (023 Phase 3)** | Coordination complexity — needs proven backlog capture first. | Backlog has 20+ items across 5+ sessions |
| **Proactive backlog surfacing (023 Phase 4)** | Ship capture first, intelligence later. | Phase 1-2 prove the backlog is useful |
| **Model selection Phase 3 (cost reporting, override persistence)** | Polish, not leverage. | User feedback requests it |
| **Demos 2-5** | Demo 1 proves the format first. | Demo 1 is recorded and shipped |
| **Squad Paper** | Content, not product. | When Brady wants to publish |
| **Agent-to-agent negotiation** | Needs proven model selection + reliable skills first. | v0.4.0+ |
| **Speculative execution** | Needs very low silent success rate. | Silent success < 3% |


---

## Brady's Directives (Inherited + Revised — Non-Negotiable)

1. **Quality first, then experience.** v0.3.0 features ship into a codebase with 92 tests and CI.
2. **Async communication is P0.** Brady wants to talk to his squads from his phone. This is the top personal priority.
3. **GitHub IS the interface.** Issues, PRs, and Discussions are first-class surfaces — not just the CLI. Validated by slidemaker.
4. **CCA inherits Squad.** Copilot Coding Agent should discover and respect `.ai-team/` governance.
5. **"Where are we?" is first-class.** Backlog capture enriches status. The coordinator includes open backlog items.
6. **"Feels heard."** Message extraction + DM mode make "feels heard" richer across surfaces.
7. **CLI is primary, everything else is additive.** GitHub Issues/PR integration must not break CLI conversations.

---

## Summary Table — All Work Items

| ID | Item | Owner | Effort | Depends On | Wave |
|----|------|-------|--------|------------|------|
| **W1.1** | Copilot SDK spike — agent spawning feasibility | Kujan | 4-6h | — | 1 |
| **W1.2** | Telegram bot — polling-based bridge (Phase 0) | Fenster + Kujan | 4-6h | W1.1 | 1 |
| **W1.3** | DM mode flag + summary output in spawn prompts | Verbal | 2-3h | W1.2 | 1 |
| **W1.4** | Agent identity in DM (emoji + name prefix) | Verbal | 1-2h | W1.2 | 1 |
| **W1.5** | Dev Tunnel integration (webhook mode) | Fenster | 2-3h | W1.2 | 1 |
| **W1.6** | DM conversation persistence (dm-log/) | Fenster | 1-2h | W1.2 | 1 |
| **W1.7** | DM end-to-end tests | Hockney | 3-4h | W1.2, W1.3 | 1 |
| **W1.8** | GitHub Actions fallback workflow (if SDK fails) | Kujan + Kobayashi | 3-4h | W1.1 (fail path) | 1 |
| **W2.1** | Message extraction in coordinator (023 Phase 1) | Verbal + Kujan | 3-4h | — | 2 |
| **W2.2** | Backlog.md format + creation on init/upgrade | Fenster | 2-3h | — | 2 |
| **W2.3** | Backlog tests | Hockney | 2-3h | W2.1, W2.2 | 2 |
| **W2.4** | GitHub Issue push — one-way sync (028 Phase 1) | Verbal + Kujan | 3-4h | W2.1, W2.2 | 2 |
| **W2.5** | Issues as work input — Squad reads labeled Issues | Verbal + Kujan | 3-4h | W2.4 | 2 |
| **W2.6** | CCA discovery — squad.agent.md as CCA entry point | Verbal + Keaton | 2-3h | — | 2 |
| **W2.7** | CCA charter routing — squad: labels → agent charters | Kujan | 2-3h | W2.6 | 2 |
| **W2.8** | CCA adoption tests | Hockney | 2-3h | W2.6, W2.7 | 2 |
| **W2.9** | Clean branch config at init time | Fenster | 2-3h | — | 2 |
| **W2.10** | Clean branch tests | Hockney | 1-2h | W2.9 | 2 |
| **W3.1** | Model auto-selection algorithm in coordinator | Verbal + Kujan | 3-4h | — | 3 |
| **W3.2** | Charter `## Model` section + template update | Verbal | 1-2h | W3.1 | 3 |
| **W3.3** | Registry `model` field + migration | Fenster | 2-3h | W3.1 | 3 |
| **W3.4** | Model selection tests | Hockney | 2-3h | W3.1, W3.2, W3.3 | 3 |
| **W3.5** | Model visibility in spawn output | Verbal | 1h | W3.1 | 3 |
| **W3.6** | Marketing site Phase 1 (Jekyll + layouts + front matter) | McManus + Fenster | 5-8h | — | 3 |
| **W3.7** | Scribe merge for backlog inbox | Verbal | 2-3h | W2.1, W2.2 | 3 |
| **W3.8** | "Where are we?" enriched with backlog items | Verbal | 1-2h | W3.7 | 3 |
| **W3.9** | Demo 1 YAML script + vhs tape file | McManus | 3-4h | — | 3 |
| **W3.10** | Demo CI smoke test | Hockney + Kobayashi | 2-3h | W3.9 | 3 |
| **W3.11** | README GIF embed from Demo 1 | McManus | 1h | W3.9 | 3 |
| **W3.12** | v0.3.0 release + CHANGELOG | Kobayashi | 1-2h | All | 3 (gate exit) |

**Total: 63-94 hours across 3 waves.** This is significantly larger than the original 31-43h plan because Brady un-deferred a major feature (Squad DM) and added two new categories (CCA adoption, clean branches).

---

## Wave 1: Reach — "Talk to Your Squad From Anywhere"

**Duration:** ~5-7 days  
**Principle:** Brady's top personal priority. Squad DM transforms Squad from a terminal tool to a team in your pocket.  
**The hard truth:** This is the riskiest wave in Squad's history. The Copilot SDK `task` equivalence is unproven. We spike first, build second, and have a fallback ready.

### W1.1 Copilot SDK Spike — Agent Spawning Feasibility

**Owner:** Kujan  
**Effort:** 4-6 hours  
**Depends on:** Nothing — this is Day 1  
**Source:** Proposal 017-platform-feasibility §2 (Option A), §10 (verification gates)

**What ships:**
- Install `@github/copilot-sdk`, create a session, verify:
  1. Can we create a session with custom tools? (file ops, search)
  2. Can a tool handler create ANOTHER session? (This is the `task` equivalent)
  3. What's the latency for `session.sendAndWait()`?
- Written assessment: SDK path viable (go) or not (fallback to GitHub Actions)
- If GO: document the session nesting pattern for Fenster to implement
- If NO-GO: W1.8 (GitHub Actions fallback) becomes the primary path

**Risk:** HIGH — this is the go/no-go gate for the entire DM feature's architecture. If the SDK can't do nested sessions, we lose the multi-agent orchestration that makes Squad DM different from ChatGPT-in-Telegram. The GitHub Actions fallback preserves functionality at 60-120s latency cost.

### W1.2 Telegram Bot — Polling-Based Bridge (Phase 0)

**Owner:** Fenster + Kujan  
**Effort:** 4-6 hours  
**Depends on:** W1.1 (must know which execution engine to use)  
**Source:** Proposal 017-experience-design §6, §9 (Phase 0), Proposal 017-platform-feasibility §6

**What ships:**
- Node.js bridge service: `npx squad dm start` (or equivalent CLI command)
- Telegram bot via BotFather registration
- Polling-based message reception (no tunnel needed for Phase 0)
- Message forwarding: Telegram → bridge → Copilot SDK session (or Actions dispatch) → response → Telegram
- Single repo (the repo the bridge runs in), single user (Brady, hardcoded user ID)
- Auth check: only Brady's Telegram ID can message the bot
- Library: `telegraf` or `node-telegram-bot-api`

**Risk:** Medium — Telegram bot setup is well-documented. The bridge is ~200-400 LOC. The complexity is in the Copilot SDK integration layer, not the Telegram part.

### W1.3 DM Mode Flag + Summary Output in Spawn Prompts

**Owner:** Verbal  
**Effort:** 2-3 hours  
**Depends on:** W1.2 (bridge must exist to inject DM mode)  
**Source:** Proposal 017-experience-design §7

**What ships:**
- `DM_MODE` context variable added to spawn prompts when invoked from bridge
- DM output rules in coordinator: summaries only, max 4-5 sentences, bullet points, link to GitHub for full artifacts
- No code blocks > 5 lines, no tables > 3 columns
- One message per agent per response
- Progressive disclosure: "show me the full thing" → GitHub link or chunked paste

**Risk:** Low — prompt engineering. The formatting rules are clear and testable.

### W1.4 Agent Identity in DM (Emoji + Name Prefix)

**Owner:** Verbal  
**Effort:** 1-2 hours  
**Depends on:** W1.2  
**Source:** Proposal 017-experience-design §2

**What ships:**
- Single "Squad" bot, agents identified by emoji prefix + name
- Coordinator stays invisible (routes silently, same as terminal)
- Exception: coordinator speaks when fan-out is interesting

**Risk:** Very low — message formatting

### W1.5 Dev Tunnel Integration (Webhook Mode)

**Owner:** Fenster  
**Effort:** 2-3 hours  
**Depends on:** W1.2 (polling bridge must work first)  
**Source:** Proposal 017-platform-feasibility §3, Proposal 017-experience-design §6

**What ships:**
- `devtunnel host -p 3000 --allow-anonymous` integration
- Webhook mode replaces polling for lower latency
- Automatic Dev Tunnel URL registration with Telegram webhook API
- GitHub-native auth: `devtunnel user login -g`
- Graceful fallback: if devtunnel unavailable, stay on polling

**Risk:** Low — Dev Tunnel setup is documented.

### W1.6 DM Conversation Persistence (dm-log/)

**Owner:** Fenster  
**Effort:** 1-2 hours  
**Depends on:** W1.2  
**Source:** Proposal 017-experience-design §7 (context continuity)

**What ships:**
- `.ai-team/dm-log/` directory for DM conversation logs
- Timestamped session files: `dm-log/2026-02-10T22-15.md`
- DM decisions written to `decisions/inbox/` (same as terminal decisions)
- Context continuity: terminal sessions can reference DM decisions and vice versa

**Risk:** Low — file write pattern

### W1.7 DM End-to-End Tests

**Owner:** Hockney  
**Effort:** 3-4 hours  
**Depends on:** W1.2, W1.3  
**Source:** Test patterns from v0.2.0

**What ships:**
- Tests for bridge message routing (mock Telegram → coordinator)
- Tests for DM mode output formatting (summary length, no code blocks, emoji prefixes)
- Tests for conversation persistence (dm-log/ writes)
- Tests for auth check (non-Brady user rejected)
- Tests for graceful degradation (no SDK → Actions fallback, no devtunnel → polling)

**Risk:** Medium — testing a messaging bridge requires mocking the Telegram API

### W1.8 GitHub Actions Fallback Workflow (If SDK Fails)

**Owner:** Kujan + Kobayashi  
**Effort:** 3-4 hours  
**Depends on:** W1.1 (only needed if SDK spike fails)  
**Source:** Proposal 017-platform-feasibility §2 (Option C), Appendix C

**What ships (only if W1.1 fails):**
- `.github/workflows/squad-dm.yml` — issue comment trigger (`/squad` prefix)
- Workflow: checkout repo → run Squad CLI with message → commit results → reply on issue
- Conversation threading via dedicated GitHub Issue per DM session
- Latency: 60-120s (acceptable for async, not for real-time chat)

**Risk:** Medium — Copilot CLI availability on Actions runners is uncertain.

### Wave 1 Parallelism

```
Day 1-2:                           Day 3-5:                          Day 5-7:
├── W1.1 SDK spike (Kujan)        ├── W1.3 DM mode prompts (Verbal)  ├── W1.7 DM tests (Hockney)
                                   ├── W1.4 Agent identity (Verbal)   └── W1.5 Dev Tunnel (Fenster)
                                   ├── W1.2 Telegram bridge (Fenster + Kujan)
                                   └── W1.6 DM persistence (Fenster)
                                   (W1.8 only if W1.1 fails)
```

W1.1 MUST complete before anything else can start. It determines the architecture.

### Wave 1 Gate: "Can Brady DM His Squad?"

**This gate is binary. ALL must pass or Wave 2 doesn't start.**

- [ ] SDK spike complete — architecture decision documented (SDK or Actions fallback)
- [ ] Brady can send a Telegram message and get a response from his Squad
- [ ] Response includes agent identity (emoji + name)
- [ ] Response is in DM summary format (not terminal-length output)
- [ ] Conversation logged to `.ai-team/dm-log/`
- [ ] Auth works: non-Brady users rejected
- [ ] `npm test` passes (all new tests + existing 92)
- [ ] CI is green

---

## Wave 2: Integration — "GitHub IS the Interface"

**Duration:** ~5-7 days  
**Principle:** Squad reads from and responds to GitHub's native surfaces. CCA discovers Squad and works under its governance.  
**Gate prerequisite:** Wave 1 gate must be GREEN.

### W2.1 Message Extraction in Coordinator (023 Phase 1)

**Owner:** Verbal + Kujan  
**Effort:** 3-4 hours  
**Depends on:** Nothing (Wave 2 can start these immediately)  
**Source:** Proposal 023 §Solution, §Extraction

**What ships:**
- Coordinator parses every message into item types: work requests, directives, backlog items, questions, context clues
- Dual-layer write: SQL INSERT (immediate) + append to `.ai-team/backlog.md` (durable)
- Rehydration on session start: read `backlog.md`, rebuild SQL state
- Acknowledgment enrichment: coordinator confirms captured items alongside agent spawns
- Hard rule: coordinator EXTRACTS and CAPTURES, never EVALUATES

**Risk:** Medium — the critical prompt engineering challenge of v0.3.0

### W2.2 Backlog.md Format + Creation on Init/Upgrade

**Owner:** Fenster  
**Effort:** 2-3 hours  
**Depends on:** Nothing  
**Source:** Proposal 023 §Team Backlog

**What ships:**
- `.ai-team/backlog.md` format: `## Open` (checkbox items), `## Done` (completed items)
- Created on init and upgrade (additive migration)
- `backlog/inbox/` directory for agent drop-box writes
- Template in `templates/`

**Risk:** Low — established patterns

### W2.3 Backlog Tests

**Owner:** Hockney  
**Effort:** 2-3 hours  
**Depends on:** W2.1, W2.2  
**Source:** Proposal 023 success criteria

**What ships:**
- Tests for backlog.md creation on init and upgrade
- Tests for backlog/inbox/ directory creation
- Tests for backlog template format validation

**Risk:** Low

### W2.4 GitHub Issue Push — One-Way Sync (028 Phase 1)

**Owner:** Verbal + Kujan  
**Effort:** 3-4 hours  
**Depends on:** W2.1, W2.2 (backlog must exist for backlog→Issue push)  
**Source:** Proposal 028 §Phase 1, slidemaker reference implementation

**What ships:**
- Proposals → GitHub Issues with labels (`proposal`, `sprint:0.3.0`)
- Backlog items → GitHub Issues with labels (`backlog`, `captured`)
- Status changes close/update corresponding issues
- `squad:` and `squad:{agent-name}` label conventions (validated by slidemaker)
- Issue numbers stored as metadata in markdown files
- If `gh` CLI / GitHub MCP unavailable, skip silently

**Risk:** Low — prompt engineering, proven `gh` CLI patterns

### W2.5 Issues as Work Input — Squad Reads Labeled Issues

**Owner:** Verbal + Kujan  
**Effort:** 3-4 hours  
**Depends on:** W2.4 (label conventions must exist)  
**Source:** Proposal 028, slidemaker validation, Brady's P1 directive

**What ships:**
- Coordinator can read `squad:`-labeled GitHub Issues as work input
- Issue body parsed: user story format, acceptance criteria, agent metadata
- Agent routing: `squad:fenster` label → spawn Fenster with issue context
- Issue status updates as work progresses (comments, label changes)
- Bi-directional in spirit: filesystem is authoritative, but Issues are a valid INPUT surface

**Risk:** Medium — parsing Issue bodies is prompt engineering with variable-quality input. Slidemaker's 9-issue validation provides the template, but real-world issues will vary.

### W2.6 CCA Discovery — squad.agent.md as CCA Entry Point

**Owner:** Verbal + Keaton  
**Effort:** 2-3 hours  
**Depends on:** Nothing  
**Source:** Brady's P2 directive

**What ships:**
- Documentation in `squad.agent.md`: section explaining CCA integration
- `.ai-team/` directory structure documented for CCA discovery
- CCA reads `squad.agent.md` → understands team structure, conventions, routing
- Squad governance principles documented for CCA adherence

**Risk:** Medium — CCA's file discovery behavior is not fully documented. We design for expected behavior and validate.

### W2.7 CCA Charter Routing — squad: Labels → Agent Charters

**Owner:** Kujan  
**Effort:** 2-3 hours  
**Depends on:** W2.6  
**Source:** slidemaker label conventions, Brady's P2 directive

**What ships:**
- When CCA picks up a `squad:fenster` issue, it reads `.ai-team/agents/fenster/charter.md`
- Charter provides context: role, expertise, coding style, file responsibilities
- CCA works "as" that agent — same conventions, same standards
- Fallback: if no agent label, CCA reads `squad.agent.md` for general governance

**Risk:** Medium — depends on CCA's willingness to read and follow charter files.

### W2.8 CCA Adoption Tests

**Owner:** Hockney  
**Effort:** 2-3 hours  
**Depends on:** W2.6, W2.7

**What ships:**
- Tests for squad.agent.md containing CCA discovery section
- Tests for charter files being readable/parseable for CCA context
- Tests for label→charter routing logic

**Risk:** Medium

### W2.9 Clean Branch Configuration at Init Time

**Owner:** Fenster  
**Effort:** 2-3 hours  
**Depends on:** Nothing  
**Source:** Brady's P3 directive

**What ships:**
- `squad init` prompts: "Which branches should exclude team files?"
- Configuration stored in `.ai-team/config.json`
- Default excluded branches: `main`, `master`, `production`
- Coordinator warns if team files would be committed to a protected branch
- Upgrade migration: adds config with defaults for existing squads

**Risk:** Low — configuration + prompt engineering

### W2.10 Clean Branch Tests

**Owner:** Hockney  
**Effort:** 1-2 hours  
**Depends on:** W2.9

**What ships:**
- Tests for config creation on init
- Tests for default branch exclusions
- Tests for config migration on upgrade

**Risk:** Low

### Wave 2 Parallelism

```
Wave 2 start (all can begin after Wave 1 gate):
├── W2.1 Message extraction (Verbal + Kujan)     → W2.4 GitHub Issue push (after W2.1, W2.2)
├── W2.2 Backlog.md format (Fenster)              → W2.5 Issues as work input (after W2.4)
├── W2.6 CCA discovery (Verbal + Keaton)          → W2.7 CCA charter routing (after W2.6)
├── W2.9 Clean branch config (Fenster)            → W2.8 CCA tests (after W2.6, W2.7)
                                                  → W2.3 Backlog tests (after W2.1, W2.2)
                                                  → W2.10 Clean branch tests (after W2.9)
```

### Wave 2 Gate: "Does GitHub Drive Squad?"

- [ ] Backlog items persist to `.ai-team/backlog.md`
- [ ] Proposals and backlog items appear as labeled GitHub Issues
- [ ] Squad can read `squad:`-labeled Issues as work input
- [ ] CCA discovery section exists in `squad.agent.md`
- [ ] CCA can pick up a `squad:` labeled issue and read the corresponding agent charter
- [ ] Clean branch configuration works at init time with sensible defaults
- [ ] If `gh` CLI unavailable, Squad works identically to before
- [ ] `npm test` passes
- [ ] CI is green

---

## Wave 3: Intelligence + Polish — "Make It Smart, Make It Shine"

**Duration:** ~4-5 days  
**Principle:** Model selection, marketing site, demo infrastructure, and backlog intelligence. Important but not blocking the core v0.3.0 story.  
**Gate prerequisite:** Wave 2 gate must be GREEN.

### W3.1 Model Auto-Selection Algorithm in Coordinator

**Owner:** Verbal + Kujan  
**Effort:** 3-4 hours  
**Depends on:** Nothing  
**Source:** Proposal 024 §2, §4

**What ships:**
- Model Selection section added to `squad.agent.md`
- 4-layer priority: user override → charter preference → registry field → role-based auto-select
- Role-to-model mapping: Designer → Opus, Tester/Scribe → Haiku, Lead/Dev → Sonnet
- Coordinator passes `model` parameter to all `task` tool calls

**Risk:** Low — prompt engineering only

### W3.2 Charter `## Model` Section + Template Update

**Owner:** Verbal  
**Effort:** 1-2 hours  
**Depends on:** W3.1  
**Source:** Proposal 024 §1

**What ships:**
- `## Model` section in `templates/charter.md` with `Preferred` and `Rationale`
- Default value `auto` — zero config

**Risk:** Very low

### W3.3 Registry `model` Field + Migration

**Owner:** Fenster  
**Effort:** 2-3 hours  
**Depends on:** W3.1  
**Source:** Proposal 024 §3

**What ships:**
- `model` field in `casting/registry.json`, additive migration

**Risk:** Low

### W3.4 Model Selection Tests

**Owner:** Hockney  
**Effort:** 2-3 hours  
**Depends on:** W3.1, W3.2, W3.3

**Risk:** Low

### W3.5 Model Visibility in Spawn Output

**Owner:** Verbal  
**Effort:** 1 hour  
**Depends on:** W3.1

**Risk:** Very low

### W3.6 Marketing Site Phase 1

**Owner:** McManus + Fenster  
**Effort:** 5-8 hours  
**Depends on:** Nothing  
**Source:** Proposals 029, 029a

**What ships:**
- `_config.yml`, `_layouts/`, `_includes/` for Jekyll
- YAML front matter on 16+ docs files
- `docs/index.md` landing page
- CSS/styling, GitHub Pages configured

**Risk:** Low — no product code changes

### W3.7 Scribe Merge for Backlog Inbox

**Owner:** Verbal  
**Effort:** 2-3 hours  
**Depends on:** W2.1, W2.2  
**Source:** Proposal 023 §Phase 2

**What ships:**
- Scribe merges `backlog/inbox/` into `backlog.md`
- Agents can mark items done, add discovered items

**Risk:** Low

### W3.8 "Where Are We?" Enriched with Backlog Items

**Owner:** Verbal  
**Effort:** 1-2 hours  
**Depends on:** W3.7  
**Source:** Proposal 023 §What This Unlocks

**Risk:** Low

### W3.9 Demo 1 YAML Script + vhs Tape File

**Owner:** McManus  
**Effort:** 3-4 hours  
**Depends on:** Nothing  
**Source:** Proposal 026 §Demo 1

**Risk:** Medium

### W3.10 Demo CI Smoke Test

**Owner:** Hockney + Kobayashi  
**Effort:** 2-3 hours  
**Depends on:** W3.9

**Risk:** Medium

### W3.11 README GIF Embed from Demo 1

**Owner:** McManus  
**Effort:** 1 hour  
**Depends on:** W3.9

**Risk:** Very low

### W3.12 v0.3.0 Release + CHANGELOG

**Owner:** Kobayashi  
**Effort:** 1-2 hours  
**Depends on:** All items complete

**Risk:** Very low

### Wave 3 Gate: "Is It Smart and Visible?"

- [ ] Coordinator spawns agents with `model` parameter based on auto-selection
- [ ] Charter template includes `## Model` section
- [ ] Registry includes `model` field with migration
- [ ] Marketing site renders on GitHub Pages
- [ ] Backlog items appear in "where are we?" responses
- [ ] Demo 1 produces a clean GIF
- [ ] README contains embedded demo GIF
- [ ] `npm test` passes
- [ ] CI is green
- [ ] v0.3.0 tagged and released

---

## Dependency Graph

```
Wave 1 (Reach — Async Comms)
├── W1.1 SDK spike (Kujan) ── GO/NO-GO GATE
│   ├── W1.2 Telegram bridge (Fenster + Kujan) ← needs W1.1
│   │   ├── W1.3 DM mode prompts (Verbal) ← needs W1.2
│   │   ├── W1.4 Agent identity (Verbal) ← needs W1.2
│   │   ├── W1.5 Dev Tunnel (Fenster) ← needs W1.2
│   │   ├── W1.6 DM persistence (Fenster) ← needs W1.2
│   │   └── W1.7 DM tests (Hockney) ← needs W1.2, W1.3
│   └── W1.8 Actions fallback (Kujan + Kobayashi) ← only if W1.1 FAILS
│
══════════════  WAVE 1 GATE  ════════════════════
│
Wave 2 (Integration — GitHub + CCA + Clean Branches)
├── W2.1 Message extraction (Verbal + Kujan)
├── W2.2 Backlog.md format (Fenster)
│   └── W2.3 Backlog tests (Hockney) ← needs W2.1, W2.2
├── W2.4 GitHub Issue push (Verbal + Kujan) ← needs W2.1, W2.2
│   └── W2.5 Issues as work input (Verbal + Kujan) ← needs W2.4
├── W2.6 CCA discovery (Verbal + Keaton)
│   └── W2.7 CCA charter routing (Kujan) ← needs W2.6
│       └── W2.8 CCA tests (Hockney) ← needs W2.6, W2.7
├── W2.9 Clean branch config (Fenster)
│   └── W2.10 Clean branch tests (Hockney) ← needs W2.9
│
══════════════  WAVE 2 GATE  ════════════════════
│
Wave 3 (Intelligence + Polish)
├── W3.1 Model auto-selection (Verbal + Kujan)
│   ├── W3.2 Charter model section (Verbal) ← needs W3.1
│   ├── W3.3 Registry model field (Fenster) ← needs W3.1
│   ├── W3.4 Model selection tests (Hockney) ← needs W3.1-W3.3
│   └── W3.5 Model visibility (Verbal) ← needs W3.1
├── W3.6 Marketing site (McManus + Fenster) ← independent
├── W3.7 Scribe backlog merge (Verbal) ← needs W2.1, W2.2
│   └── W3.8 "Where are we?" enrichment (Verbal) ← needs W3.7
├── W3.9 Demo 1 script (McManus) ← independent
│   ├── W3.10 Demo CI test (Hockney + Kobayashi) ← needs W3.9
│   └── W3.11 README GIF (McManus) ← needs W3.9
└── W3.12 Release (Kobayashi) ← needs all
```

---

## Agent Workload Summary

| Agent | Wave 1 | Wave 2 | Wave 3 | Total |
|-------|--------|--------|--------|-------|
| **Verbal** | W1.3 (2-3h), W1.4 (1-2h) | W2.1 shared (2h), W2.4 shared (2h), W2.5 shared (2h), W2.6 shared (1-2h) | W3.1 shared (2h), W3.2 (1-2h), W3.5 (1h), W3.7 (2-3h), W3.8 (1-2h) | 17-24h |
| **Kujan** | W1.1 (4-6h), W1.2 shared (2-3h), W1.8 conditional (2-3h) | W2.1 shared (2h), W2.4 shared (2h), W2.5 shared (2h), W2.7 (2-3h) | W3.1 shared (2h) | 18-23h |
| **Fenster** | W1.2 shared (2-3h), W1.5 (2-3h), W1.6 (1-2h) | W2.2 (2-3h), W2.9 (2-3h) | W3.3 (2-3h), W3.6 shared (3-4h) | 14-21h |
| **Hockney** | W1.7 (3-4h) | W2.3 (2-3h), W2.8 (2-3h), W2.10 (1-2h) | W3.4 (2-3h), W3.10 shared (1-2h) | 11-17h |
| **McManus** | — | — | W3.6 shared (2-4h), W3.9 (3-4h), W3.11 (1h) | 6-9h |
| **Kobayashi** | W1.8 shared conditional (1-2h) | — | W3.10 shared (1h), W3.12 (1-2h) | 3-5h |
| **Keaton** | Review SDK spike | Review gates, W2.6 shared (1h) | Final sign-off | Continuous |
| **Redfoot** | — | — | — | — |
| **Scribe** | — | — | — | (silent, as always) |

---

## Total Effort Estimate

| Wave | Effort | Calendar (with parallelism) |
|------|--------|---------------------------|
| Wave 1 (Reach — Async Comms) | 21-32h | 5-7 days |
| Wave 2 (Integration — GitHub + CCA) | 22-32h | 5-7 days |
| Wave 3 (Intelligence + Polish) | 25-35h | 4-5 days |
| **Total** | **68-99h** | **~14-19 days** |

This is SIGNIFICANTLY larger than the original 31-43h plan. That's because Brady un-deferred the hardest feature in Squad's backlog (DM) and added two new categories (CCA, clean branches). I want to be honest about this: **v0.3.0 is now a v0.2.0-sized sprint or bigger.** If scope pressure hits, Wave 3 items (model selection, marketing site, demos) are the relief valve — they can slip to 0.4.0 without breaking the v0.3.0 story.

### Scope Pressure Relief Valves

If the sprint runs long, cut in this order (least damage to v0.3.0's story):

1. **W3.9-W3.11 (Demo infrastructure)** — defer to 0.4.0. Demo 1 is important but not blocking the DM + GitHub story.
2. **W3.6 (Marketing site)** — defer to 0.4.0. The site is independent and McManus can ship it any time.
3. **W3.7-W3.8 (Scribe merge + Where are we?)** — defer to 0.4.0. Backlog capture (W2.1-W2.3) delivers core value; intelligence on top can wait.
4. **W3.1-W3.5 (Model selection)** — last resort deferral. This is compound value, but v0.3.0's story is "reach + integration," not "intelligence." Model selection becomes v0.4.0's centerpiece.

---

## What Makes Users Say "This Is the Future"

1. **"I texted my squad from the gym."** Brady sends a message from his phone. Keaton answers with an opinion about the architecture. Not a chatbot — Keaton. Same memory, same voice, same standards. Squad is no longer tethered to a terminal.

2. **"I filed an issue and my team picked it up."** A GitHub Issue with `squad:fenster` label gets created. Next time Squad runs, Fenster picks it up and starts working. GitHub is the work surface — Squad is the team.

3. **"CCA just followed our conventions."** Copilot Coding Agent picks up an issue, discovers `.ai-team/`, reads the charter, and works like a team member. No special setup — Squad's governance is the environment.

4. **"My team files are never in production."** Clean branch configuration means `.ai-team/` never leaks into `main`. Zero thought required.

5. **"It just used the right model."** Auto-selection matches models to roles. Zero config.

6. **"One GIF and I get it."** Demo infrastructure proves the product works — scripted, repeatable, embedded in the README.

---

## Horizon — Deferred Past 0.3.0

| Feature | Source | Why Not Now | Revisit When |
|---------|--------|-------------|--------------|
| **Squad DM Phase 2 (proactive messaging)** | Proposal 017 | Phase 0-1 must prove the concept | Brady uses DM daily for 2 weeks |
| **Squad DM Phase 3 (multi-platform, multi-repo)** | Proposal 017 | One platform, one repo first | DM Phase 1 stable |
| **Agent cloning** | Proposal 023 Phase 3 | Needs proven backlog capture | 0.4.0 |
| **Proactive backlog surfacing** | Proposal 023 Phase 4 | Needs backlog with real data | 0.4.0 |
| **Model cost reporting** | Proposal 024 Phase 3 | Polish, not leverage | User feedback |
| **Override persistence** | Proposal 024 Phase 3 | Session overrides work | 0.4.0 |
| **Demos 2-5** | Proposal 026 | Validate Demo 1 first | After Demo 1 |
| **Squad Paper** | Proposal 016 | Content, not product | When Brady wants it |
| **028 Phases 2-4** | Proposal 028 | Phase 1 must prove one-way push | 0.4.0+ |
| **Agent-to-agent negotiation** | Proposal 003 | Needs proven model selection | v0.4.0+ |
| **Speculative execution** | Proposal 003 | Needs low silent success rate | v0.4.0+ |
| **Squad sharing / registry** | Proposal 008 | Needs proven portability | v1.0 |

---

## How This Plan Compounds

Each 0.3.0 feature makes the next version's features easier:

- **Squad DM (Phase 0-1)** → proactive messaging (Phase 2) has the bridge to push through
- **Squad DM** → multi-platform (Phase 3) reuses the gateway architecture
- **GitHub Issue integration** → Project boards (028 Phase 3) build on proven label conventions
- **GitHub Issue integration** → PR-triggered responses extend the same event model
- **CCA adoption** → future CCA features inherit Squad's governance automatically
- **Clean branch config** → future deployment pipelines never need .ai-team cleanup
- **Model selection** → DM mode can use cheaper models for quick responses (Haiku for status checks)
- **Backlog capture** → proactive surfacing has data to surface
- **Demo infrastructure** → future demos reuse the format and CI patterns

Every item in this plan makes the 0.4.0 plan shorter. The compound strategy is working — and now it extends beyond the terminal.

---

## Revision History

### Revision 2 (2026-02-10) — Brady's Priority Reorder

**What changed:**
- **Squad DM UN-DEFERRED.** Previously deferred to Horizon (v1.0). Now P0 for v0.3.0 Wave 1. Brady's top personal priority.
- **Three waves, not two.** Added Wave 1 (Reach — async comms) and pushed previous Wave 1 content to Wave 2/3.
- **GitHub-native integration expanded.** Was Phase 1 only (one-way push). Now includes Issues as work input AND CCA adoption as separate work streams.
- **CCA adoption added.** New work stream — Squad as governance layer for Copilot Coding Agent.
- **Clean branch configuration added.** New work stream — protect production branches from team files.
- **Model selection moved to Wave 3.** Was Wave 1's centerpiece. Still ships in v0.3.0, but lower priority.
- **Marketing site added.** Proposals 029/029a, Jekyll on GitHub Pages. Wave 3 item.
- **Sprint size increased.** From 31-43h (2 waves) to 68-99h (3 waves). Reflects the scope Brady wants.
- **Scope pressure relief valves defined.** Wave 3 items explicitly cuttable if sprint runs long.
- **Prior art referenced.** Three 017 proposals provide the DM design foundation. Slidemaker validates GitHub Issues design.

**What didn't change:**
- Backlog capture (023 Phases 1-2) retained at same scope
- Demo infrastructure retained at same scope
- All Horizon deferrals still apply (agent cloning, speculative execution, etc.)
- Brady's core directives still non-negotiable (quality first, CLI primary, feels heard)

### Revision 1 (2026-02-10) — 028 Phase 1 Addition

Proposal 028 Phase 1 (GitHub-Native Planning — one-way push) added to Wave 2 per Brady's directive. Original scope was 28-39h; revised to 31-43h.

---

**This is the plan. Three waves. Reach first, integration second, intelligence third. Ship where Brady is — not just where his terminal is.**

**Approved by:** Keaton (Lead) — I own this plan and these priorities  
**Review requested from:** bradygaster  
**Executed by:** The full squad

