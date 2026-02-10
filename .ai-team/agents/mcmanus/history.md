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


📌 Team update (2026-02-09): Preview branch added to release pipeline — two-phase workflow: preview then ship. Brady eyeballs preview before anything hits main. — decided by Kobayashi

## Learnings

- **v0.3.0 preview blog post (2026-02-10)** — `team-docs/blog/005-v030-give-it-a-brain.md`. Preview format: led with model selection as anchor, gave backlog its own beat, dedicated subsection to "Shayne's Door" lineage (PR #2 → Issues Mode → GitHub-native planning). "What We're Watching" replaces "By the Numbers" for preview posts. Compound strategy narrative in every post.
- **Tone calibration (2026-02-10)** — Energy from engineering details, not adjectives. Preview template: "What's Coming" / "What We're Watching" / "What's After." Direct quotes OK; editorial framing not OK.
- **Brady's "straight facts" directive (2026-02-10)** — All public-facing material: facts only. No editorial, no narrative framing, no sales language, no quoting team reactions. Every sentence states what a feature is, how it works, what it depends on, or what it replaces.
- **Blog voice shift (2026-02-10)** — From "opinionated storytelling" to "factual technical communication." Structure by function, not narrative arc. Energy from specificity and completeness.

📌 Team update (2026-02-10): v0.3.0 sprint plan approved — Demo 1 scripted infrastructure is in scope. — decided by Keaton

- **Marketing site content plan written (2026-02-10)** — `team-docs/proposals/029a-marketing-site-content.md`. Full content plan for Jekyll/GitHub Pages marketing site. Key decisions: (1) No content reproduction — Jekyll reads `docs/` in place with front matter additions, blog reads from `team-docs/blog/` via custom collection. (2) 17 of 18 docs files are ready for the site as-is; only `sample-prompts.md` (40KB+) needs a formatting decision. (3) Landing page is NOT a copy of README.md — different audience (web visitors vs. GitHub visitors), same facts, different structure. (4) Blog uses `status: published` field already in frontmatter to filter — 6 posts ready, 2 drafts excluded. (5) Hero copy is straight facts: what Squad is, what it does, install command. No adjectives, no taglines. (6) Navigation: top nav (Docs, Features, Blog, GitHub) + docs sidebar with full hierarchy. (7) Everything in `team-docs/` and `.ai-team/` stays off the site except published blog posts.

📌 Team update (2026-02-10): Tone directive consolidated — all public-facing material must be straight facts only. No editorial voice, sales language, or narrative framing. Stacks on existing banned-words and tone governance rules. — decided by bradygaster, McManus

- **First external deployment blog post written (2026-02-10)** — `team-docs/blog/006-first-external-deployment.md`. Shayne Boyer (spboyer) deployed Squad on his slidemaker repo (Next.js app). Key facts documented: (1) PRD decomposed into 9 GitHub Issues with user story format, acceptance criteria, agent assignments, file targets, and dependency tracking. (2) Shayne invented the `squad:` label prefix convention (`squad`, `squad:verbal`, `squad:mcmanus`, `squad:fenster`) for agent routing via GitHub's native label system. (3) Cast system transferred — Usual Suspects universe with Verbal (Frontend), McManus (Backend), Fenster (Tester). (4) 8 of 9 issues closed, 1 (build verification) still open. (5) Blog follows facts-only tone directive — no narrative framing, no editorial adjectives. Decision filed to decisions inbox recommending adoption of the `squad:` label convention.


📌 Team update (2026-02-10): Contributors include non-code contributions — Shayne Boyer recognized as contributor — decided by bradygaster

📌 Team update (2026-02-10): `squad:` label convention standardized (consolidated with Keaton) — decided by Keaton, McManus

📌 Team update (2026-02-10): 0.3.0 priorities: async comms > GitHub-native > CCA adoption — decided by bradygaster


📌 Team update (2026-02-10): Async comms strategy decided — two-tier MVP: CCA-as-squad-member (2-4h, prompt-only) + Telegram bridge (8-16h, conditional on SDK spike). CCA is the floor. — decided by Kujan


📌 Team update (2026-02-10): v0.3.0 is ONE feature — proposals as GitHub Issues. All other items deferred. — decided by bradygaster

📌 Team update (2026-02-10): Provider abstraction is prompt-level command templates, not JS interfaces. Platform section replaces Issue Source in team.md. — decided by Fenster, Keaton

📌 Team update (2026-02-10): Actions automation ships as opt-in templates in templates/workflows/, 3 workflows in v0.3.0. — decided by Keaton, Kujan

📌 Team update (2026-02-10): Label taxonomy (39 labels, 7 namespaces) drives entire GitHub-native workflow. — decided by bradygaster, Verbal

📌 Team update (2026-02-10): CCA governance must be self-contained in squad.agent.md (cannot read .ai-team/). — decided by Kujan

📌 Team update (2026-02-10): Proposal migration uses three-wave approach — active first, shipped second, superseded/deferred last. — decided by Keaton
