# CAPCOM — History

> Knowledge base for the SDK Expert. Append-only, union-merged across branches.

## Learnings

### 2026-03-14: WSL Transient API Error Investigation (Issue #363)

**Context:** User reported "Request failed due to a transient API error" on Ubuntu WSL with Copilot CLI v1.0.4, eventually hitting rate limits.

**Investigation findings:**
- Squad SDK already implements robust retry logic with exponential backoff (1s → 2s → 4s)
- Retry logic in `adapter/client.ts:820-880` handles transient connection errors (ECONNREFUSED, ECONNRESET, EPIPE)
- Rate limit detection in `adapter/errors.ts:229-245` with retry-after awareness
- Error originates **upstream** from Copilot CLI/API platform, not Squad
- Copilot CLI v1.0.4 internal retry behavior triggers the rate limiting before Squad is invoked
- Squad only interacts with CLI via `@github/copilot-sdk` adapter after CLI is already running

**Key insight:** Squad SDK does NOT contribute to transient API errors or rate limiting issues. Our retry logic follows platform patterns and only applies to SDK connection errors, not upstream API instability.

**Outcome:**
- Confirmed this is an upstream platform issue (not a Squad bug)
- Recommended user check network connectivity, WSL configuration, and GitHub auth
- Created decision in `.squad/decisions/inbox/capcom-wsl-transient.md`
- Suggested documentation improvement: add WSL troubleshooting guide

**Pattern learned:** When investigating API errors, distinguish between:
1. **SDK adapter layer** (our retry logic) — handles connection errors only
2. **Copilot CLI layer** (upstream) — handles API communication and its own retries
3. **Copilot API platform** (upstream) — source of transient errors and rate limits

Squad operates at layer #1, so issues at layers #2-3 are outside our control.
## Core Context

- **Project:** Squad — AI agent orchestration framework
- **Role:** SDK Expert
- **Joined:** 2025-01-25

## Learnings

### 2025-01-25: SDK Init Implementation Deep Dive

Completed deep technical analysis of `squad init --sdk` code paths. Key findings:

**CastingEngine is orphaned** — The SDK has a full universe-based casting system (`packages/squad-sdk/src/casting/casting-engine.ts`) with themed characters (The Usual Suspects, Ocean's Eleven), personality traits, backstories, and role-matching algorithms. **But no code calls it.** The CLI bypasses it with a hardcoded `personalityForRole()` function that generates generic personalities based on role patterns.

**Config/team sync is one-way** — The REPL init flow generates team.md, routing.md, and registry.json when casting a team, but never updates squad.config.ts. Meanwhile, `squad init --sdk` generates squad.config.ts with only Scribe, missing Ralph and all other agents. The disconnect: CLI init writes a skeleton + prompt, REPL auto-cast generates the team, but the two paths never merge into a unified config.

**Built-in agents are inconsistent** — Ralph is added by the REPL casting flow (`cli/core/cast.ts:385-386`) but not by SDK init (`cli/core/init.ts:109-115`). @copilot is a pseudo-agent — a Markdown table row inserted via `team-md.ts:insertCopilotSection()`, not a real agent with charter/history files.

**Universe selection is a dead end** — The coordinator init prompt asks the LLM to pick a universe (line 52: "Pick a fictional universe for character names"), and the coordinator responds with `UNIVERSE: Alien`, which gets stored in `casting/history.json`... and then **nothing uses it**. There's no mapping from freeform universe names to CastingEngine templates.

**The fix path is clear** — Three priority levels:
- **P0 (trivial):** Add Ralph to SDK init agents array, guide coordinator to existing CastingEngine universes
- **P1 (small/medium):** Integrate CastingEngine into CLI casting, make REPL init write squad.config.ts
- **P2 (design-heavy):** Decide config sync strategy (config-as-source vs. bidirectional), decide if @copilot should be a real agent

Written full technical analysis to `.squad/identity/sdk-init-technical-analysis.md` with file/line references, complexity estimates, and actionable recommendations for Brady's PRD.

**SDK patterns observed:**
- `defineSquad()` / `defineAgent()` builder pattern is clean and works well
- `configFormat` enum supports 'sdk' | 'typescript' | 'json' | 'markdown' — flexible but undertested
- Init flow is two-phase (CLI writes skeleton, REPL auto-casts) — intentional design but creates sync issues
- Template system in SDK (`templates/` directory) is well-structured, used correctly by `initSquad()`

📌 **Team update (2026-03-11T01:25:00Z):** 5 SDK Init decisions merged to decisions.md: Phase-based quality improvement (3-phase approach), CastingEngine canonical casting, squad.config.ts as source of truth, Ralph always-included, implementation priority order. Full technical analysis informed Flight's unified PRD and EECOM's roadmap.

📌 **Team update (2026-03-25T18:11Z):** CLI platform research complete — identified Copilot CLI 1.0.5–1.0.11 (8 releases in 10 days) contain three high-impact changes affecting Squad routing: monorepo instruction discovery (1.0.11), idle subagent hiding (1.0.8), subagentStart hook context injection (1.0.7). SDK version pinning doesn't prevent CLI runtime auto-updates. Recommendations: clean up template naming, upgrade to SDK 0.2.0 customize mode, file CLI issue. Report in decisions inbox.

