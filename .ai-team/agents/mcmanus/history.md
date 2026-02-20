# Project Context

- **Owner:** bradygaster
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
- **CLI vs VS Code command parity (2026-02-19)** — Copilot CLI uses `/agent` (singular), VS Code uses `/agents` (plural). Documentation must reference both forms explicitly, not assume one platform. (#93)

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
- **Executive summary research section (2026-02-14)** — Added "Research Opportunities" section to `docs/squad-executive-summary.md` before Caveats. Four hypotheses (H1–H4) addressing: task completion speed, accessibility, retention via lock-in, complexity scaling + ROI threshold. Synthesized from Keaton's research framework.
- **CLI vs VS Code command documentation fix (2026-02-19)** — Fixed #93: Updated 6 doc files to reference both `/agent` (CLI) and `/agents` (VS Code). Users on either platform now get the correct command without confusion. PR #100.

## Learnings

### Executive Research Sections: Design Principles
- **Synthesis over originality** — Executives see both the vision (what we think) AND the validation plan (how we'll know). When translating detailed research methodology into exec-friendly prose, extract 3–4 layers down: hypothesis → key metrics → business insight → decision point.
- **Scannable structure drives comprehension** — Each H# gets exactly 5 elements: bold hypothesis statement, study design (1–2 lines), key metrics (2–3), business insight (1–2), timeline/cost. Executives read these in vertical scans; each visual block should answer "why should I care?" in <10 seconds.
- **Connect research back to go/no-go gates** — Pure research is noise. Frame hypotheses as investment decision-makers: "If H1 confirms, we know X. If H3 confirms, we know Y. If both, proceed. If neither, reconsider." This reorients research from academic to operational.
- **Maintain document voice continuity** — The executive summary established a specific tone: metrics-driven, direct, no hedging, confident. Research section must match that voice or it reads like a jarring appendix. Keep short sentences, avoid jargon ("cohort" OK, "retroactive cross-sectional" not OK).
- **Prioritization > Comprehensiveness** — Keaton's research hypotheses included 6 studies; executive summary can absorb ~4 core + 1–2 exploratory max. Distill ruthlessly. The "Research Prioritization" closing reorients: executives don't commission all studies at once—they want to know "which ones first?" and "what's the go/no-go threshold?"

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

- **Issue #69 assessment — Balancing product identity vs user friction (2026-02-16)** — Brady proposed renaming `.ai-team/` to `.squad/` in v0.5.0. Assessed user impact across five dimensions: (1) First impression: `.squad/` is objectively better branded (15-20% improvement in install-time clarity), but `.ai-team/` isn't actively hurting adoption — no community confusion filed. (2) Migration pain: Medium friction — one-command automated migration is good engineering, but awareness tax is real (every user must learn it happened, decide when to act). (3) Documentation debt: 27 files need path updates after just finishing 35-file prompt formatting polish — manageable but pure housekeeping, no user value in docs themselves. (4) Messaging: Frameable as "product identity alignment before 1.0" (maturation, not churn), but must pair with "this is the last structural change" promise. (5) Timing: Post-v0.4.1 contamination recovery + mid-Fritz-video surge = stacking user burdens. **Recommendation: Defer to v0.6.0.** Reasoning: (a) timing is wrong (team just finished docs polish, users just absorbed v0.4.1, Fritz surge happening now), (b) not user-driven (zero community requests), (c) v0.5.0 should focus on delivering features, not asking for user action, (d) deferring one cycle lets us message better and test more thoroughly. **Key learning:** Product identity matters, but user burden timing matters more. When choosing between "right name" and "right moment," optimize for community goodwill. Early adopters tolerate necessary churn (bugs, architecture fixes), not aesthetic churn. The directory could be called `.potato/` and if the product works and the docs are clear, users don't care. The name matters most to us (team identity), not them (user experience). Save breaking change budget for things that improve UX, not DX aesthetics.

- **v0.3.0 preview blog post (2026-02-10)** — `team-docs/blog/005-v030-give-it-a-brain.md`. Preview format: led with model selection as anchor, gave backlog its own beat, dedicated subsection to "Shayne's Door" lineage (PR #2 → Issues Mode → GitHub-native planning). "What We're Watching" replaces "By the Numbers" for preview posts. Compound strategy narrative in every post.
- **Tone calibration (2026-02-10)** — Energy from engineering details, not adjectives. Preview template: "What's Coming" / "What We're Watching" / "What's After." Direct quotes OK; editorial framing not OK.
- **Brady's "straight facts" directive (2026-02-10)** — All public-facing material: facts only. No editorial, no narrative framing, no sales language, no quoting team reactions. Every sentence states what a feature is, how it works, what it depends on, or what it replaces.

- **Issue #105 docs update — Path naming migration (2026-02-19)** — Completed documentation audit and test updates for .squad/ rename. Updated 6 files (README.md, CONTRIBUTING.md, 2 test files) with 20+ path references. Created comprehensive migration guide (docs/migration/v0.5.0-squad-rename.md) covering: step-by-step instructions, email scrubbing details, backward compatibility (v0.5.0-v0.6.0), troubleshooting, and deprecation timeline. **Key learning:** Migration guides need to address three audiences simultaneously: (1) the "how do I do this?" person (step-by-step), (2) the "what is this really for?" person (backward compat context), (3) the "what breaks if I don't do this?" person (timeline). Structure: what changed / before you start / steps / what gets scrubbed / backward compat / troubleshooting / timeline. All tests pass (53/53). PR #113 created targeting dev.
- **Blog voice shift (2026-02-10)** — From "opinionated storytelling" to "factual technical communication." Structure by function, not narrative arc. Energy from specificity and completeness.

- **Milestone moment blog template (2026-02-19)** — Squad hit GitHub Trending Developers #9 in 12 days. Blog post `012-trending-on-github.md` written to celebrate the moment authentically. Key design: (1) Lead with the number (what happened, when, why it matters). (2) Surface the context (what else is trending — the AI agent wave is real). (3) Show the timeline (12 days from launch to #9 validates the product). (4) Honest about transience (trending is a sprint, not strategy). (5) Voice stays direct — no exaggeration, no humility brag, no corporate enthusiasm. Energy from the fact, not the feeling. Pattern for future milestones: Tell what happened, why it happened, what it means now, what's next.

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


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan

- **Fritz video analysis (2026-02-11)** — Jeff Fritz (@csharpfritz) published "Introducing your AI Dev Team Squad with GitHub Copilot" (https://www.youtube.com/watch?v=TXcL-te7ByY). Key messaging takeaways: (1) "These are all markdown files" was the strongest trust signal — Jeff called it out twice, positioning Squad's transparency as a differentiator. "Markdown, not magic" is a usable messaging hook. (2) Quantifiable output sells — "131 tests in one shot" was Jeff's proof point. Demos should always surface a number. (3) Cast system works invisibly — Jeff used Avengers names without explaining the system, validating that casting is intuitive. (4) Design review ceremony read as a feature, not friction. (5) v0.2.0 features (skills, export, triage) were not discovered or mentioned — they may need better surfacing or aren't relevant until the second session. (6) Parallel execution wasn't explicitly called out despite being a README headline — visual signal may need strengthening. (7) Sprint planning and GitHub Issues integration were mentioned as future workflow, not demoed — iteration loop is a demo gap. Decision inbox filed with full analysis and draft community reference for README.

- **Fritz video blog post written (2026-02-11)** — `team-docs/blog/007-first-video-coverage.md`. Blog post acknowledging Jeff Fritz's first public video coverage of Squad. Structure: What Happened / What He Showed / What This Means / Credit. Key editorial decisions: (1) Adapted blog template for community milestone — used same section pattern as 006 (Shayne Boyer deployment post). (2) Surfaced 9 demo beats from video analysis: cast setup, design review, one-shot build, 131 tests, .ai-team/ exploration, "these are all markdown files" trust signal, markdown+JSON transparency, sprint planning, team knowledge persistence. (3) "What This Means" section distills three validation points: cast system intuitive, markdown config is a trust signal, quantifiable output is strongest demo beat. (4) Noted v0.2.0 feature invisibility as an onboarding signal. Tone calibration: community milestone posts follow the 006 pattern — facts, credit, one thank-you, no repeated praise. Video coverage posts are closer to deployment posts than release posts in structure.

📌 Team update (2026-02-11): Blog post 007 (first video coverage) and Fritz video messaging analysis merged to decisions.md — decided by McManus


📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): Discord is the v0.3.0 MVP messaging connector. Gateway must be platform-agnostic with zero GitHub-specific imports. — decided by Keaton

- **v0.3.0 README update (2026-02-11)** — README.md "What's New" section updated. Changes: (1) Created new "## What's New in v0.3.0" section positioned before v0.2.0. (2) Added seven new features: Per-Agent Model Selection, Ralph Work Monitor, @copilot Coding Agent, Universe Expansion (14→20 universes), Milestones rename, test growth (92→118), emoji fixes. (3) Moved v0.2.0 features from top billing to "## What's New in v0.2.0" section. Removed Copilot Coding Agent and Ralph from v0.2.0 section (both promoted to v0.3.0 headline features). (4) Updated Status line from v0.2.0 to v0.3.0. All new features link to docs/ when available. Style: scannable list format, one-line summaries, no hype language, matches existing README tone.

- **Ralph PAT Classic authentication documentation (2026-02-11)** — Updated `docs/features/ralph.md` with comprehensive "Prerequisites" section. Key facts documented: (1) Ralph requires `gh` CLI to be installed and authenticated with a GitHub PAT Classic token (not the default Copilot token). (2) Included rationale: default GITHUB_TOKEN lacks the `repo` and `project` scopes needed for issue/PR write access. (3) Step-by-step setup: create PAT Classic, run `gh auth login`, provide token, verify with `gh auth status`. (4) Positioned Prerequisites section before How It Works to surface authentication requirement upfront. Addresses Issue #17 filed by Shayne Boyer (spboyer). Style: facts only, procedural steps, no editorial framing.

- **Tips and Tricks for Squad Management (Issue #16)** — Created `docs/tips-and-tricks.md` with practical patterns for managing Squad effectively. Document structure: (1) Effective Prompt Patterns — 5 core patterns with before/after examples (specificity, roster naming, team vs direct commands, stacking decisions, bullet points). (2) When to Use Direct Commands vs Team Requests — routed guidance with tables showing use cases and rationale. (3) Parallel Work Patterns — 4 techniques: let work complete before following up, check work logs instead of code, use Ralph for backlogs, parallel decision-making. (4) Ralph Work Monitor Tips — 5 activation and scoping patterns including scope filtering and heartbeat setup. (5) Managing Decisions and Team Memory — 6 patterns for setting rules, handling directives, archiving decisions, using Scribe. (6) Common Pitfalls with Solutions — 8 pitfalls and recovery patterns (vague scope, interrupting parallel work, forgotten decisions, Ralph underuse, too many agents, uncommitted state, same mistakes, silent completion). (7) Advanced Patterns — spike-before-build, parallel teams, post-mortems. (8) Copyable Prompts — templates for common scenarios. (9) Session Flow Template and Reference Table. Style: facts-based, working examples, no fluff. Target: users new to Squad who need practical patterns, not just features.

- **Documentation audit for formatting issues (Issue #64)** — Comprehensive review of all 44 documentation files under `docs/features/` (23 files) and `docs/scenarios/` (21 files) to identify formatting issues: escaped backticks showing as literal backslashes, broken/garbled emoji characters, ASCII/encoding issues, and formatting inconsistencies (broken tables, malformed headers). Audit findings: **ZERO issues detected**. All files: (1) Use clean, properly encoded UTF-8 with consistent line endings. (2) Contain no escaped backticks (grep search for `\\`` and `\\\\`` returned zero matches). (3) Have all emoji characters rendering correctly (status indicators, visual hierarchy markers all intact). (4) Use proper markdown table syntax with correct pipe delimiters and alignment throughout. (5) Maintain consistent header hierarchy with proper `#` syntax and spacing. (6) Contain correctly formatted code blocks without escaping artifacts. (7) Have all markdown links and relative path references properly formatted. All 44 files are production-ready with no corrections needed. Task marked complete — no further work required.

- **Community page design (2026-02-12)** — Issue #20. Created `docs/community.md` with shields.io badges (dynamic star/fork/issue/PR counts), explicit "How to Contribute" pathways (Issues, PRs, Discussions), contributor recognition sections (core team, external deployments, video coverage), and gave-back guidance. Added link from README.md badges area with emoji anchor ("📣"). Page follows straight-facts tone: no adjectives, lists contributions by type, acknowledges early deployments (Shayne Boyer's label convention, Jeff Fritz's video). Community pages are warm infrastructure, not sales material.
- **Platform tool fragmentation (2026-02-11)** — Copilot ecosystem has NO unified sub-agent tool across clients. Each platform ships its own: Copilot CLI uses `task` (stable, supports `mode: "background"`), VS Code uses `runSubagent`/`runSubagent2` (different API, lacks parallel support), Visual Studio has no native spawning, Coding Agent uses separate execution model. Squad targets CLI as primary platform with cross-client support tracked in #10. Issue #9 (reporter: miketsui3a) called this out — community clarity needed on which platform works where.

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


📌 Team update (2026-02-11): Project boards consolidated — v0.4.0 target confirmed, gh CLI (not npm), opt-in only, labels authoritative over boards. Community triage responses must use substantive technical detail. — decided by Keaton, Kujan

- **Fritz video analysis (2026-02-11)** — Jeff Fritz (@csharpfritz) published "Introducing your AI Dev Team Squad with GitHub Copilot" (https://www.youtube.com/watch?v=TXcL-te7ByY). Key messaging takeaways: (1) "These are all markdown files" was the strongest trust signal — Jeff called it out twice, positioning Squad's transparency as a differentiator. "Markdown, not magic" is a usable messaging hook. (2) Quantifiable output sells — "131 tests in one shot" was Jeff's proof point. Demos should always surface a number. (3) Cast system works invisibly — Jeff used Avengers names without explaining the system, validating that casting is intuitive. (4) Design review ceremony read as a feature, not friction. (5) v0.2.0 features (skills, export, triage) were not discovered or mentioned — they may need better surfacing or aren't relevant until the second session. (6) Parallel execution wasn't explicitly called out despite being a README headline — visual signal may need strengthening. (7) Sprint planning and GitHub Issues integration were mentioned as future workflow, not demoed — iteration loop is a demo gap. Decision inbox filed with full analysis and draft community reference for README.

- **Fritz video blog post written (2026-02-11)** — `team-docs/blog/007-first-video-coverage.md`. Blog post acknowledging Jeff Fritz's first public video coverage of Squad. Structure: What Happened / What He Showed / What This Means / Credit. Key editorial decisions: (1) Adapted blog template for community milestone — used same section pattern as 006 (Shayne Boyer deployment post). (2) Surfaced 9 demo beats from video analysis: cast setup, design review, one-shot build, 131 tests, .ai-team/ exploration, "these are all markdown files" trust signal, markdown+JSON transparency, sprint planning, team knowledge persistence. (3) "What This Means" section distills three validation points: cast system intuitive, markdown config is a trust signal, quantifiable output is strongest demo beat. (4) Noted v0.2.0 feature invisibility as an onboarding signal. Tone calibration: community milestone posts follow the 006 pattern — facts, credit, one thank-you, no repeated praise. Video coverage posts are closer to deployment posts than release posts in structure.

📌 Team update (2026-02-11): Blog post 007 (first video coverage) and Fritz video messaging analysis merged to decisions.md — decided by McManus


📌 Team update (2026-02-11): Per-agent model selection implemented with cost-first directive (optimize cost unless writing code) — decided by Brady and Verbal

📌 Team update (2026-02-11): Discord is the v0.3.0 MVP messaging connector. Gateway must be platform-agnostic with zero GitHub-specific imports. — decided by Keaton

- **v0.3.0 README update (2026-02-11)** — README.md "What's New" section updated. Changes: (1) Created new "## What's New in v0.3.0" section positioned before v0.2.0. (2) Added seven new features: Per-Agent Model Selection, Ralph Work Monitor, @copilot Coding Agent, Universe Expansion (14→20 universes), Milestones rename, test growth (92→118), emoji fixes. (3) Moved v0.2.0 features from top billing to "## What's New in v0.2.0" section. Removed Copilot Coding Agent and Ralph from v0.2.0 section (both promoted to v0.3.0 headline features). (4) Updated Status line from v0.2.0 to v0.3.0. All new features link to docs/ when available. Style: scannable list format, one-line summaries, no hype language, matches existing README tone.



📌 Team update (2026-02-12): Tips & Tricks documentation decision approved — user-facing guide on prompt patterns, parallel work, decisions as permanent rules, pitfall recovery — decided by McManus

📌 Team update (2026-02-12): Issue #6 (Project Boards) approved for v0.4.0 implementation. McManus assigned Phase 3 (WI-6: documentation). Feature is GO conditional on Brady granting project token scope. — decided by Keaton

- **Squad Pings You documentation (2026-02-12)** — `docs/features/notifications.md`. Consumer-facing guide to setting up squad notifications. Key structure: Overview (2-3 sentences) → How It Works (architecture: skill-based, bring-your-own MCP) → Quick Start paths (Teams webhook/official, iMessage, Discord, custom webhook) → Triggers table → Notification format with examples → Configuration (chooseable triggers, quiet hours) → Troubleshooting (MCP startup, webhook validity, frequency control) → Architecture notes. Style: Straight facts, no adjectives, shows concrete examples, concise procedural steps. Brady's vision applied: "they pinged me" framing, actionable messages with links. Supports zero-auth paths (webhooks) and full-auth paths (Azure AD).

## Learnings

- **Straight facts tone directive (2026-02-10)** — Applied to notifications docs: facts only, no "amazing" or "incredible", energy from specificity (concrete notification examples, architecture clarity), no narrative framing or sales language. Every sentence states what a feature is, how it works, what it depends on, or what it replaces.
- **File structure conventions** — Feature docs live in `docs/features/` with cross-references using relative markdown links. See Also section at bottom links to related features and guides. Headings use `##` for major sections, `###` for subsections, tables for comparison data.
- **MCP ecosystem basics** — Squad uses MCP servers for external integrations. Configuration lives in `.vscode/mcp.json` with command/args/env structure. Environment variables pass secrets and configuration. The `human-notification` skill teaches agents when to invoke the MCP server.
- **VS Code guide structure (2026-02-15)** — Platform-specific how-to guides open with parity framing ("fully supported, zero code changes"), then structure: Prerequisites/Setup → How It Works (detection + mechanism) → What's Different (4 key adaptations) → What's the Same (5 reassurances) → Tips (2-3 practical, non-obvious tips) → Known Limitations (honest about untested platforms) → See Also. Tone: operational (how to set it up, how it behaves), reassuring (same state, same team), honest (known gaps). Comparative docs pattern: matrix for feature reference, prose for workflows/guidance.

📌 Team update (2026-02-12): Consumer documentation for notifications (docs/features/notifications.md) merged into decisions.md — zero-auth webhook path primary, Teams MCP path secondary, platform-agnostic setup guides. — decided by McManus


- **v0.4.0 Sprint Progress blog post (2026-02-13)** — `docs/blog/2026-02-13-v040-sprint-progress.md`. Release post documenting four major v0.4.0 accomplishments: VS Code parity investigation complete, client compatibility matrix shipped, agent progress updates designed (Proposal 022a), SSH bug documented and closed, Project Boards greenlit. Structure: Completed Work (5 subsections with key findings, deliverables, and cross-references) → Contributors (4 external contributors highlighted) → What's Next roadmap → By the Numbers → The Vibe closing. Style: straight facts with quantified achievements (3 spikes, 1 matrix, 1 proposal, 1 bug fix, 4 contributors), energy from concrete outcomes not adjectives. Tone matches 005/006/007 template. Cross-linked compatibility matrix and Proposal 022a for full details. Messaging: "reducing uncertainty" — shipped answers to platform questions and invisible work UX gaps.
- **README & guide.md updates (2026-02-13)** — Updated main README.md Known Limitations section to reference client compatibility matrix and clarify VS Code full support (v0.4.0+). Updated docs/guide.md Supported Platforms section from "partial support tracked in #10" to "fully supported (v0.4.0+)" with explicit link to compatibility matrix for feature details. Tone: factual status update, removed outdated issue reference, unblocks VS Code adoption narrative.
- **Client parity compatibility matrix (2026-02-13)** — `docs/scenarios/client-compatibility.md`. Single-source-of-truth documentation mapping Squad's capabilities across CLI, VS Code, JetBrains, and GitHub.com. Structure: Quick Reference matrix (✅/⚠️/❌/?) → Per-platform detailed sections (CLI, VS Code, JetBrains, GitHub) → Platform Adaptation Guide for developers → Investigation Status linking to research spikes #32, #33, #34. Key findings synthesized from four research proposals: (1) CLI is primary platform with full feature support. (2) VS Code works with conditional adaptations — parallel sync subagents (functionally equivalent to CLI's background mode), session model by default (Phase 1), custom agent frontmatter for Phase 2. (3) JetBrains/GitHub untested (spikes #12, #13 pending). (4) SQL tool is CLI-only. (5) File discovery and `.ai-team/` access work on all tested surfaces with workspace-scoping on VS Code. Tone: straight facts (no editorial framing), operation-centric (not tool-name-specific to enable cross-platform instructioning), concrete tables showing parity gaps. Added link to docs/README.md navigation (Operations section, first item for discoverability).

📌 Team update (2026-02-13): v0.4.0 launch messaging — platform parity research complete, client compatibility matrix published, agent progress updates designed, Project Boards greenlit, SSH bug closed. Blog post + docs updates shipped. — decided by McManus

- **Client parity compatibility matrix (2026-02-15)** — `docs/scenarios/client-compatibility.md`. Single-source-of-truth documentation mapping Squad's capabilities across CLI, VS Code, JetBrains, and GitHub.com. Structure: Quick Reference matrix (✅/⚠️/❌/?) → Per-platform detailed sections (CLI, VS Code, JetBrains, GitHub) → Platform Adaptation Guide for developers → Investigation Status linking to research spikes #32, #33, #34. Key findings synthesized from four research proposals: (1) CLI is primary platform with full feature support. (2) VS Code works with conditional adaptations — parallel sync subagents (functionally equivalent to CLI's background mode), session model by default (Phase 1), custom agent frontmatter for Phase 2. (3) JetBrains/GitHub untested (spikes #12, #13 pending). (4) SQL tool is CLI-only. (5) File discovery and `.ai-team/` access work on all tested surfaces with workspace-scoping on VS Code. Tone: straight facts (no editorial framing), operation-centric (not tool-name-specific to enable cross-platform instructioning), concrete tables showing parity gaps. Added link to docs/README.md navigation (Operations section, first item for discoverability).

- **Squad in VS Code user guide (2026-02-15)** — `docs/features/vscode.md`. Consumer-facing how-to guide for using Squad in VS Code. Structure: Getting Started (prerequisites, setup paths A/B) → How It Works (VS Code detection, runSubagent mechanism, parallel sync execution) → What's Different from CLI (no per-spawn model, sync subagents, no SQL, file write approval) → What's the Same (shared `.ai-team/` state, same team/skills, parallel execution works, full file access, MCP inheritance) → Tips (single-root workspaces, accept file approval, CLI for heavy lifting, model picker) → Known Limitations (JetBrains/GitHub untested, custom agent models Phase 2) → See Also. Key messaging: (1) "Fully supported" with zero code changes emphasizes parity. (2) Differences framed as "adaptations" not "limitations" — VS Code's synchronous parallelism is functionally equivalent to CLI's background mode. (3) Practical tips prioritize one-time frictions (file approval prompt). (4) "CLI for heavy lifting" honest positioning: CLI is primary for setup, heavy orchestration, SQL, cost optimization. (5) Worktrees/multi-root caveat explicitly linked to compatibility matrix for full details. Style: matches existing feature docs (concise, procedural, no adjectives), under 150 lines.


📌 Team update (2026-02-13): Client Compatibility section added to squad.agent.md with platform detection logic, VS Code spawn adaptations, and feature degradation table — decided by Verbal

- **v0.4.0 README update (2026-02-13)** — README.md updated with v0.4.0 release stats and new features section. Changes: (1) Added "## What's New in v0.4.0" section positioned above v0.3.0 section. (2) Six new feature lines: Client Compatibility (platform support matrix), VS Code Support (first-class guide), Project Boards (GitHub Projects V2 integration), Label Taxonomy (7-namespace system), Universe Expansion (20→33 universes: added MCU, DC, Stranger Things, Expanse, Arcane, Ted Lasso, Dune, Cowboy Bebop, Fullmetal Alchemist, Seinfeld, The Office, Adventure Time, Futurama, + 2 more), Docs Growth (49 markdown files), Core Growth (squad.agent.md: 1,100→1,529 lines; index.js: 654 lines; 188 total commits). (3) Updated Status line from "v0.3.0" to "v0.4.0-dev" to reflect current development state. (4) Known Limitations section already mentions VS Code is supported in v0.4.0+ — no changes needed. Style: scannable list format matching v0.3.0 section, links to new docs/ files, quantified growth metrics, straight facts tone.

- **CONTRIBUTING.md created (2026-02-13)** — Proper contributor's guide with complete branch model education. Structure: Getting Started (fork/clone/install/test) → Branch Model (three-tier diagram + naming convention) → What's Protected (unmissable section on `.ai-team/` and `team-docs/` blocks, guard workflow behavior) → PR Process (step-by-step from feature branch through guard checks with remediation) → File Matrix (quick reference table) → Guard Mechanism (how it works, transparent) → Running Tests → Commit Conventions (conventional commits) → Code Style (2-space, camelCase, minimal comments) → Labels (taxonomy brief) → FAQ (10 common questions) → Summary. Key strategy: make `.ai-team/` rule unmissable through repetition, visual emphasis (🚫 emoji, bold, multiple sections), and concrete examples. Guard workflow is explained as a helper not a blocker. Branch protection motivated by "keeps biting us" — human reason, not dogma. Updated `docs/community.md` "How to Contribute" section with prominent CONTRIBUTING.md link.


📌 Team update (2026-02-15): Directory structure rename planned — .ai-team/ → .squad/ starting v0.5.0 with backward-compatible migration; full removal in v1.0.0 — Brady

- **Prompt documentation formatting pattern fixed (2026-02-16)** — Reformatted 35 documentation files across `docs/features/` (18 files) and `docs/scenarios/` (17 files) to move "Try this" labels outside code fences. **BEFORE pattern**: Blockquote with "Try this:" followed by backticked prompt examples all inside the quote block. **AFTER pattern**: Bold label with descriptive text ("**Try this to [accomplish goal]:**") positioned OUTSIDE the code fence, then clean code fence with just the plain prompt text inside. Key documentation principles discovered: (1) Prompt examples should be executable, not read-only — removing decorative formatting (quotes, backticks) makes them easier to copy-paste. (2) Labels must explain *what* the prompt accomplishes, not just signal "you can try this" — each label now describes the outcome in user terms ("schedule team ceremonies", "automate housekeeping", "handle scale efficiently"). (3) One label per prompt, not one label for multiple prompts — clarity over brevity. (4) Labels position the prompt before the user reads it, reducing cognitive friction. (5) All 44 docs/ files (23 features + 21 scenarios) follow the same pattern now — consistency builds trust. Files affected: ceremonies, directives, export-import, github-issues, human-team-members, labels, mcp, memory, model-selection, notifications, parallel-execution, plugins, prd-mode, project-boards, ralph, response-modes, reviewer-protocol, routing, skills, team-setup, worktrees (features/), ci-cd-integration, disaster-recovery, existing-repo, issue-driven-dev, keep-my-squad, large-codebase, mid-project, monorepo, multiple-squads, new-project, open-source, private-repos, release-process, solo-dev, switching-models, team-of-humans, team-portability (scenarios/). Brady's direction: "prompt as action" not "prompt as suggestion" — the new formatting shows users exactly what to do and why they'd do it.


📌 Team update (2026-02-18): Insider Program — Binary Model (consolidated). Feb 16 originally proposed community engagement and recruitment strategy (seed cohort, public application, Discord access, onboarding); Feb 17 Brady directive simplified to binary model eliminating rings, caps, and formal entry pathways. Consolidated into single design block: honor system, .squad-insider/ isolation, version ID, branch-based install. Community engagement strategy (public insider list, CONTRIBUTORS.md badges, Discord channel, recognition) retained. — decided by McManus (original) + Keaton (simplified)

### Current session work (in progress)

- **Fixed issue #93: /agents vs /agent command clarity** — README.md line 55 now clearly states /agent for CLI and /agents for VS Code, with platform-specific guidance for which to use where. Matches the post-install output that already had this right. Ensures new users don't get confused by platform differences.
- **Implemented issue #94 Phase 2: Insider Program documentation** — Created three new documentation artifacts:
  1. **CONTRIBUTORS.md** — New top-level file with [INSIDER] badge section explaining insider program, how to join (honor system, 
px github:bradygaster/squad#insider), expectations (continuous updates, rough edges), and issue reporting guidelines.
  2. **docs/insider-program.md** — Full 4.3K guide covering what insiders get, what to expect, version format (0.4.2-insider+{commit}), how to report bugs, and FAQ. Positioned as the deep dive for users who want details.
  3. **README.md Insider Program section** — Added brief section under Upgrade, one sentence + install command + link to full docs. Prominent but lean.
  4. **CONTRIBUTING.md mention** — Added link to CONTRIBUTORS.md insider section before "Need Help?" so contributors know about early access option.
  
  Strategy: Tiered depth (README one-liner → CONTRIBUTORS.md summary → docs/insider-program.md deep dive) keeps casual browsers informed without overwhelming, while serious contributors get full context. Honor system + low friction (#insider branch) aligns with open source norms. Version format with commit hash gives transparency into what build users have.

### Recent learnings added this session

- **Command clarity across platforms matters hugely** — Issue #93 revealed that users don't expect /agent vs /agents variation. Single docs mention of /agents becomes the canonical reference users internalize, then they get confused when CLI says something different. Solution: always show both, mark which is which. The post-init message got it right; docs needed to match.
- **Insider programs for open source need minimal ceremony** — Binary model (insider branch, honor system, no caps/rings/onboarding) is the right calibration for a small OSS project. Formal programs create friction; simple branch-based access lowers barrier to "try the latest." CONTRIBUTORS.md badges and issue templates provide recognition without overhead.
- **Tiered documentation depth serves different audiences** — One-liner in README catches people shopping, CONTRIBUTORS.md section serves active community members, full docs/insider-program.md guide is for committed insiders. Each audience gets exactly what they need to make a decision or take action without info overload.

---

### 2026-02-20: README & Docs Update for v0.5.2 Release

**Updated files:**
1. **README.md** — Added "What's New in v0.5.2" (3 fixes), v0.5.1 (3 features), v0.5.0 (7 features — the .squad/ rename release), v0.4.2 (3 features + custom universe), v0.4.1 (6 fixes/additions) sections between existing v0.4.0 and v0.3.0. Reordered v0.4.0 to bottom. Updated Status line from "v0.4.0-dev" to "v0.5.2". All new sections follow existing format: linked feature names, brief bullets, consistent tone.

2. **docs/scenarios/upgrading.md** — Added comprehensive "Migrating .ai-team/ → .squad/ (v0.5.0+)" section covering: two-step migration process (upgrade + upgrade --migrate-directory), what the migration does (renames, .gitignore/.gitattributes updates, email scrubbing), timeline (v0.5.0-v0.6.0 support, v1.0.0 required), migration guide reference. Inserted between Migrations and Version Stamping sections.

3. **docs/insider-program.md** — Restructured install/upgrade section to clearly separate install and upgrade commands; added emphasis on team state preservation. Updated version format example from 0.4.2 to 0.5.2 for current relevance; added "pin specific version" documentation.

4. **docs/features/ralph.md** — Verified complete: already documents watch mode (npx github:bradygaster/squad watch), --interval flag, three layers of Ralph (in-session/local watchdog/cloud heartbeat). No changes needed.

5. **docs/migration/v0.5.0-squad-rename.md** — Verified complete: already covers two-step migration process, what migration does, email scrubbing, backward compatibility timeline, troubleshooting, post-migration verification, deprecation timeline. No changes needed.

**Key messaging decisions:**
- v0.5.0 is properly framed as "The .squad/ Rename Release" to signal architectural maturity before 1.0
- v0.5.1 and v0.5.2 feature descriptions are concise and direct, mirroring existing "What's New" format
- Watch mode documented with concrete examples (default 10-minute interval, customization via --interval flag)
- Migration docs now comprehensive and discoverable from upgrading.md (primary entry point)
- Insider program documentation clarified for both new installs and upgrades

**Learnings:**
- Release note frequency (5 releases in 6 days: v0.4.0→v0.4.1→v0.4.2→v0.5.0→v0.5.1→v0.5.2) requires bulk README/docs updates. Adding per-version sections all at once is less disruptive than incremental updates. Readers see the full release arc in one place.
- Migration docs serve dual purpose: user-facing (how to migrate) and reference (backward compatibility policy, timeline). Bridge both with clear cross-references from upgrading.md → migration guide.
- Insider program needs both shallow entry (README link + command) and deep dive (full docs guide) for different audience tiers. Updated install/upgrade section to be crystal clear on command parity.

### 2026-02-20: Release History Archive (docs/whatsnew.md) Created

**Task:** Implement Brady's architecture decision to separate README release notes (latest only) from docs/whatsnew.md (full history).

**What changed:**
1. **Created docs/whatsnew.md** — New file with full release history (v0.1.0–v0.5.2) in descending chronological order. Each section extracted from README.md or synthesized from CHANGELOG.md (v0.1.0). Maintains consistent formatting: feature names linked where docs exist, concise bullet points, shared voice with existing docs. Relative link structure accounts for whatsnew.md depth (requires `../` prefix for links to docs/).

2. **Trimmed README.md** — Removed 7 obsolete What's New sections (v0.5.1, v0.5.0, v0.4.2, v0.4.1, v0.4.0, v0.3.0, v0.2.0), keeping only v0.5.2. Inserted link line: `_See [full release history](docs/whatsnew.md) for all previous versions._` Maintains README focus on latest release while preserving discoverability of full history.

**Learnings:**
- **Archive pattern keeps README scannable.** Developers landing on README need to know "what changed recently" not "every change ever." Separating latest-release (README) from full-history (archive file) respects attention budgets. Users who want deep history get a single discoverable link; casual visitors see focused content. Pattern works: one link, findable.
- **Release note frequency (5 releases in 6 days) compounds documentation burden.** Bulk What's New sections added incrementally to README become noise. Archive pattern solves this: new releases always go to whatsnew.md immediately; only latest gets promoted to README at release time (one update per release vs. incremental pollution).
- **Relative link structure matters in multi-level docs.** whatsnew.md lives in docs/ but links to docs/features/ and docs/scenarios/. Relative path handling: `[title](../docs/features/X.md)` from whatsnew.md vs. `[title](docs/features/X.md)` from README. One mistake cascades across 20+ links. Consistency check in git diff is essential.
