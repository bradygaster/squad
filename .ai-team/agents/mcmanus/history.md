# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Core Context

_Summarized from initial assessment, messaging overhaul, demo script, and README rewrite (2026-02-07). Full entries in `history-archive.md`._

- **DevRel philosophy: first 5 minutes are everything** — README must be magnetic, not just informative. Move users from "what is this?" to "I need this" before the fold.
- **Six onboarding gaps identified**: missing "Why Squad?" value prop, hidden sample-prompts, no troubleshooting, no video/demo, install output lacks explanation, casting treated as Easter egg instead of headline feature.
- **Voice is confident, direct, opinionated** — no hedging ("might," "could be"), no corporate phrases. Show don't abstract ("Keaton decided X" beats "the Lead agent made a decision"). Brand attracts early adopters.
- **Tagline**: "Throw a squad at it" (Brady's cultural hook) — actionable, memorable, opinionated.
- **Casting is a competitive moat** — thematic persistent names make agents memorable and referenceable, unlike generic labels. Elevated from Easter egg to headline feature.
- **Demo script uses beat format** (ON SCREEN / VOICEOVER / WHAT TO DO) — README order is non-negotiable for demos. Payoff at end, not beginning.
- **README rewrite (Proposal 006)**: Hero → Quick Start → Why Squad? → Parallel Work → How It Works → Cast System → What Gets Created → Growing the Team → Reviewer Protocol → Install → Troubleshooting → Status.

### Session Summaries

- **V1 launch messaging and strategy (2026-02-08)**
- **Human eval script created (2026-02-08)** — 📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export
- **Sprint 0 narrative arc identified (2026-02-09)** — 📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton
- **Documentation audit — silent success bug check (2026-02-09)**
- **Demo script ACT 7 restored (2026-02-09)** — 📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — delivery mechanism for bug fixes to existing users. — decided by Fenster
- **"Where are we?" messaging beat identified (2026-02-09)** — 📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves
- **Blog format and packaging UX designed (2026-02-09)** — 📌 Team update (2026-02-09): Blog format designed — YAML frontmatter + structured body, one post per wave, compatible with all SSGs. First post "Wave 0
- **Blog post #2 — "The Squad Squad Problem" (2026-02-09)** — ## Team Updates
- **Blog post #3 — "Meet the Squad" team intro (2026-02-09)**
- **Brand voice guidance for visual identity (2026-02-08)** — 📌 Team update (2026-02-08): Visual identity initial proposals created — four logo concepts with Concept C 'The Glyph' recommended, palette anchored on
- **README polish and CHANGELOG for v0.1.0 (2026-02-08)**
- **Context Window Budget table corrected (2026-02-09)** — 📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmigno
- **Community contribution blog format (2026-02-09)** — 📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be s
- **Celebration blog format established (2026-02-09)**
- **Belated PR #1 contribution blog (2026-02-09)** — 📌 Team update (2026-02-09): Contribution blog policy consolidated — retroactive PR #1 blog (001c) added. All contributions get a blog post, late is OK
- **Feature showcase prompts added to sample-prompts.md (2026-02-09)**
- **Super Bowl Weekend post — edit pass and honest assessment (2026-02-09)**
- **v0.2.0 release blog post (2026-02-09)**

## Recent Updates

📌 Team update (2026-02-08): Release ritual — blog posts optional for patches, encouraged for minors (48h), required for 1.0 (drafted before release day). McManus writes minor release posts. — decided by Keaton
📌 Team update (2026-02-08): Visual identity initial proposals created — four logo concepts with Concept C 'The Glyph' recommended, palette anchored on Indigo 500 — decided by Redfoot
📌 Team update (2026-02-08): CI pipeline created — GitHub Actions runs tests on push/PR to main/dev. PRs now have automated quality gate. — decided by Hockney
📌 Team update (2026-02-08): Coordinator now captures user directives to decisions inbox before routing work. Directives persist to decisions.md via Scribe. — decided by Kujan
📌 Team update (2026-02-08): Coordinator must acknowledge user requests with brief text before spawning agents. Single agent gets a sentence; multi-agent gets a launch table. — decided by Verbal
📌 Team update (2026-02-08): Silent success mitigation strengthened in all spawn templates — 6-line RESPONSE ORDER block + filesystem-based detection. — decided by Verbal
📌 Team update (2026-02-08): .ai-team/ must NEVER be tracked in git on main. Three-layer protection: .gitignore, package.json files allowlist, .npmignore. — decided by Verbal
📌 Team update (2026-02-09): If ask_user returns < 10 characters, treat as ambiguous and re-confirm — platform may fabricate default responses from blank input. — decided by Brady
📌 Team update (2026-02-09): PR #2 integrated — GitHub Issues Mode, PRD Mode, Human Team Members added to coordinator with review fixes (gh CLI detection, post-setup questions, worktree guidance). — decided by Fenster
📌 Team update (2026-02-09): Documentation structure formalized — docs/ is user-facing only, team-docs/ for internal, .ai-team/ is runtime state. Three-tier separation is permanent. — decided by Kobayashi
📌 Team update (2026-02-09): Per-agent model selection designed — 4-layer priority (user override → charter → registry → auto-select). Role-to-model mapping: Designer→Opus, Tester/Scribe→Haiku, Lead/Dev→Sonnet. — decided by Verbal
📌 Team update (2026-02-09): Tiered response modes shipped — Direct/Lightweight/Standard/Full modes replace uniform spawn overhead. Agents may now be spawned with lightweight template (no charter/history/decisions reads) for simple tasks. — decided by Verbal
📌 Team update (2026-02-09): Skills Phase 1 + Phase 2 shipped — agents now read SKILL.md files before working and can write SKILL.md files from real work. Skills live in .ai-team/skills/{name}/SKILL.md. Confidence lifecycle: low→medium→high. — decided by Verbal
📌 Team update (2026-02-09): All external contributions get a blog post — standing policy. Posts in team-docs/blog/, contributor is hero. — decided by bradygaster
📌 Team update (2026-02-09): Contribution blog policy consolidated — retroactive PR #1 blog (001c) added. All contributions get a blog post, late is OK. — decided by McManus
