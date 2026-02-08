# Project Context

- **Owner:** bradygaster (bradygaster@users.noreply.github.com)
- **Project:** Squad — AI agent teams that grow with your code. Democratizing multi-agent development on GitHub Copilot. Mission: beat the industry to what customers need next.
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Created:** 2026-02-07

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### README structure and messaging
- **README.md** is the primary developer-facing doc — Quick Start (3 steps), parallel work explanation, context budget table (real numbers), mermaid diagram for architecture visualization
- Strong hook: "It's not a chatbot wearing hats" — personality-driven messaging that differentiates Squad
- File: `README.md` (root)

### Documentation assets
- **docs/sample-prompts.md** contains 16 production-ready project demos (pomodoro timer → .NET migration) — not linked from README yet, high value for onboarding
- File: `docs/sample-prompts.md`

### Install flow and templates
- **index.js** is the npx installer — copies `.github/agents/squad.agent.md` (coordinator) and `templates/` to `.ai-team-templates/`
- Creates placeholder dirs: `.ai-team/decisions/inbox/`, `.ai-team/orchestration-log/`, `.ai-team/casting/`
- Install output is minimal (just checkmarks) — no explanation of what was created or why
- Files: `index.js`, `templates/` (charter.md, history.md, roster.md, routing.md)

### Casting system (under-documented)
- Squad uses thematic casting (The Usual Suspects, Alien, Ocean's Eleven) for persistent agent names — stored in `.ai-team/casting/registry.json`
- This is a signature feature but only mentioned briefly in README ("persistent thematic cast")
- Casting state: `policy.json` (config), `registry.json` (name mappings), `history.json` (usage history)

### Coordinator agent
- **squad.agent.md** is the coordinator — lives in `.github/agents/`, orchestrates all spawns
- Init Mode (no team yet) vs Team Mode (team exists in `.ai-team/team.md`)
- Always spawns via `task` tool, never simulates agent work inline
- File: `.github/agents/squad.agent.md` (large file, 32KB+)

### Key gaps identified
- No "Why Squad?" value prop section in README — explains *what* and *how* but not *why*
- Quick Start assumes familiarity with GitHub Copilot `/agents` command
- "What Gets Created" section is file-tree-focused, not workflow-focused
- No troubleshooting section (what if squad.agent.md doesn't appear in /agents?)
- No video/GIF demo — devs want to *see* parallel work in action
- Sample prompts doc is hidden (not linked from README)

### Voice and personality
- Squad's voice is confident, direct, opinionated — but README feels slightly sterile
- Opportunity to push personality earlier and louder (e.g., casting as a feature, not Easter egg)

### Messaging overhaul proposal (2026-02-07)
- **Tagline evolution**: "Throw a squad at it" (Brady's cultural hook from his company) — actionable, memorable, opinionated. Replaces abstract "team that grows with your code" with concrete "get smarter the more you use them."
- **"Why Squad?" section**: New emotional value prop positioned after Quick Start, before architecture. Frames Squad against single-agent roleplaying (the default), emphasizes parallel execution and knowledge persistence. Voice is confident, slightly aggressive ("Squad is what you wish your last AI agent could do. But actually.").
- **Casting elevation**: Moved from buried mention to headline feature section. Positioned as identity feature (agents feel real), not cosmetic Easter egg. Uses Squad's own team as social proof. This is a 10x messaging win — casting makes agents memorable, not generic.
- **Polish gaps closed**: Link sample-prompts.md from README (16 examples were hidden), add Troubleshooting section (reduce first-time setup drop-off), replace Go example with Python→Node modernization (Brady's constraint: no Go).
- **Voice guidance codified**: Squad's brand is confident, not apologetic. No hedging ("might," "could be"). No corporate-safe phrases ("best-in-class," "paradigm shift"). If it sounds like a B2B landing page, rewrite it. Show don't abstract ("Keaton decided X" beats "the Lead agent made a decision").
- **DevRel philosophy**: First 5 minutes are everything. Make the README magnetic, not just informative. Devs should move from "what is this?" to "I need this" before they scroll past the fold.
- File: `docs/proposals/002-messaging-overhaul.md`

### Demo script structure and strategy (2026-02-07)
- **Beat format works for recording scripts**: On-screen / Voiceover / What-to-do triple structure eliminates ambiguity during recording sessions. Brady needs to know exactly what to type, what to say, and what the viewer sees — prose-style scripts bury action steps and cost takes.
- **README order is non-negotiable for demos**: Brady's explicit feedback — the demo must follow the README's section flow. When the demo and the docs reinforce the same order, concepts land harder. Demo primes, README deepens.
- **The README walkthrough IS the demo's core**: BEATs 5–6 walk through the README while agents build in background — this is the structural trick that makes the demo work. It teaches architecture, proves parallel execution, and drives viewers to the README all at once.
- **Payoff at the end, not the beginning**: Inverting the typical demo structure (show result first, explain second) forces the viewer to understand what built the game before they see it. The game isn't the point — the team is. The game is proof.
- **"Throw a squad at it" placement**: Two mentions — BEAT 2 (casual, during the prompt) and BEAT 9 (call-to-action closer). Neither forced. Both conversational. Per proposal 002's voice guidance.
- **Thumbnail engineering matters**: CRT snake game + agent output in background = stop-the-scroll frame. Green glow + purple badge = high contrast for social feeds.
- File: `docs/proposals/004-demo-script-overhaul.md`

📌 Team update (2026-02-08): Proposal-first workflow adopted — all meaningful changes require proposals before execution. Write to `docs/proposals/`, review gates apply. — decided by Keaton + Verbal
📌 Team update (2026-02-08): Stay independent, optimize around Copilot — Squad will not become a Copilot SDK product. Filesystem-backed memory preserved as killer feature. — decided by Kujan
📌 Team update (2026-02-08): Stress testing prioritized — Squad must build a real project using its own workflow to validate orchestration under real conditions. — decided by Keaton
📌 Team update (2026-02-08): Baseline testing needed — zero automated tests today; `tap` framework + integration tests required before broader adoption. — decided by Hockney
📌 Team update (2026-02-08): Agent experience evolution proposed — adaptive spawn prompts, reviewer protocol with guidance, proactive coordinator chaining. — decided by Verbal
📌 Team update (2026-02-08): Industry trends identified — dynamic micro-specialists, agent-to-agent negotiation, speculative execution as strategic directions. — decided by Verbal
📌 Team update (2026-02-08): Video content strategy approved — 75s trailer, 6min demo, 5-video series. Owns scripting and polish. Demo script should align. — decided by Verbal
📌 Team update (2026-02-08): Portable Squads architecture decided — history split (Portable Knowledge vs Project Learnings), JSON manifest export, no merge in v1. — decided by Keaton
📌 Team update (2026-02-08): Tiered response modes proposed — Direct/Lightweight/Standard/Full spawn tiers to reduce late-session latency. Context caching + conditional Scribe spawning as P0 fixes. — decided by Kujan + Verbal
📌 Team update (2026-02-08): Portable squads platform feasibility confirmed — pure CLI/filesystem, ~80 lines in index.js, .squad JSON format, no merge in v0.1. — decided by Kujan
📌 Team update (2026-02-08): Portable squads memory architecture — preferences.md (portable) split from history.md (project-local), squad-profile.md for team identity, import skips casting ceremony. — decided by Verbal

### README rewrite executed (2026-02-07)
- **Proposal 006** contains the complete, copy-paste-ready README rewrite — not an outline, the actual content. Lives at `docs/proposals/006-readme-rewrite.md`.
- Followed proposal 002 structure exactly: Hero → Quick Start → Why Squad? → Parallel Work → How It Works → Cast System → What Gets Created → Growing the Team → Reviewer Protocol → Install → Troubleshooting → Status.
- Key structural decision: "What is Squad?" section was merged into the hero tagline block. The old section explained what Squad is in paragraph form — the new hero does it in 30 words, then "Why Squad?" handles the emotional case. No content lost, just repositioned.
- Sample prompts linked from Quick Start with a one-liner: "Not sure where to start? See 16 ready-to-use prompts."
- Go example references: current README has none. The Go reference in sample-prompts.md (prompt #13) is a separate change, not in scope for this README rewrite.
- Demo GIF placeholder: not included — that's Phase 2 per proposal 002, needs production-ready setup. Hero section is structured to accommodate it.
- File: `docs/proposals/006-readme-rewrite.md`

### V1 launch messaging and strategy (2026-02-08)
- **Tagline evolution for v1**: "Throw a squad at it" → "Throw MY squad at it" — the possessive pronoun is the entire v1 story. Portability transforms Squad from a tool into a relationship. The possessive evolution was Verbal's insight from Proposal 008.
- **One-liner**: "Your AI squad remembers you. Across every project. Forever." — three pain points in one sentence (amnesia, project-scoping, disposability). This is the scroll-stopper for Twitter/X.
- **Demo script structural shift**: v1 demo is a TWO-PROJECT arc, not single-project. Snake game → export → new project → squad already knows preferences. The "holy crap" moment is the squad applying learned preferences in a brand new project without being told. This replaces the single-project payoff from Proposal 004.
- **Skills messaging**: "That's not a template. That's a skill learned across projects." — Skills need to feel earned, not configured. Frame as expertise the squad developed, not settings the user applied.
- **Competitive frame**: "Other tools have memory. Squad has a relationship." — avoids feature-comparison trap, positions on emotional ground. Honest about what Squad doesn't do (AI quality is same underlying model). Never trash Copilot Chat.
- **Community strategy**: GitHub Discussions first, Discord deferred until 100+ active users. "Show off your squad" is the community play — share names and universes, not configurations. Squad sharing (templates, marketplace) is Phase 2+.
- **Launch sequence**: 7-day pre-launch teasers → D-Day multi-channel → D+7 follow-up → D+14 community showcase. Twitter thread (9 tweets) is the main amplification vehicle.
- **Voice guide for v1**: Always say "MY squad" not "a squad." Use agent names, never roles. Frame portability as relationship ("they come with you") not technology ("exported via JSON"). The dotfiles analogy is the instant-understanding bridge for devs.
- **First 5 minutes design**: Plant the export seed at end of first session ("After a few more sessions, you can export us to take to any project") — don't push portability before the user has experienced the relationship. Export is the payoff, not the pitch.
- File: `docs/proposals/014-v1-messaging-and-launch.md`

📌 Team update (2026-02-08): v1 Sprint Plan decided — 3 sprints, 10 days. Sprint 1: forwardability + latency. Sprint 2: history split + skills + export/import. Sprint 3: README + tests + polish. — decided by Keaton
📌 Team update (2026-02-08): Skills system designed — skills.md per agent for transferable domain expertise, six skill types, confidence lifecycle, skill-aware routing. — decided by Verbal
📌 Team update (2026-02-08): Forwardability and upgrade path decided — file ownership model, `npx create-squad upgrade`, version-keyed migrations. — decided by Fenster
📌 Team update (2026-02-08): Skills platform feasibility confirmed — skills in spawn prompts, store_memory rejected, defensive forwardability via existence checks. — decided by Kujan
📌 Team update (2026-02-08): v1 test strategy decided — node:test + node:assert (zero deps), 9 test categories, 6 blocking quality gates. — decided by Hockney
📌 Team update (2026-02-08): P0 silent success bug identified — ~40% of agents complete work but report "no response." Spawn prompt reorder + file verification mitigations. — decided by Kujan
📌 Team update (2026-02-09): Agent Skills Open Standard adopted — SKILL.md format with MCP tool declarations, built-in vs learned skills, progressive disclosure. Replaces flat skills.md. — decided by Kujan

### Sprint 0 narrative arc identified (2026-02-09)
- **The arc:** Self-repair under fire. Team produced 16 proposals (~350KB), hit a 40% silent success bug, self-diagnosed it in the same session, shipped three zero-risk mitigations. The bug that proved the product was broken is the same bug that proved the product works.
- **Key metrics for storytelling:** 16 proposals, ~350KB output, 50-70x productivity multiplier, ~40% bug rate → 3 mitigations → Sprint 0 created, 3/3 independent reviewers converged on Sprint 0 priority, ~15 human messages produced the entire session's output.
- **Lead story hook:** "Success caused the failure" — agents that completed ALL their work (including final history writes) were the ones whose responses got dropped. Doing the right thing triggered the bug.
- **Demo climax for v1:** Sprint 2 export moment — squad imported into new project already knows your preferences. That's the "holy crap" beat.
- **Story formats planned:** Twitter thread (8-10 tweets), blog post (1500 words), conference talk (20 min), raw demo script (5 min, no staging).
- File: `docs/devrel/sprint-0-story.md`


📌 Team update (2026-02-08): Proposal 001a adopted: proposal lifecycle states (Proposed -> Approved -> In Progress -> Completed) -- decided by Keaton

📌 Team update (2026-02-08): Skills system adopts Agent Skills standard (SKILL.md format) with MCP tool declarations -- decided by Verbal

📌 Team update (2026-02-08): Fenster recommends README drafting can start Day 1 (fully parallel) -- decided by Fenster
📌 Team update (2026-02-09): Wave-based execution plan adopted (Proposal 018) — quality → experience ordering. Wave 1.5 (parallel): README rewrite, messaging, Squad Paper. Squad DM deferred to Wave 4+. — decided by Keaton
📌 Team update (2026-02-09): Human directives persist via coordinator-writes-to-inbox pattern — no new infrastructure needed. — decided by Kujan

### Documentation audit — silent success bug check (2026-02-09)
- **README.md**: INTACT. 232 lines, no truncation. All internal anchor links (#status, #how-it-works) resolve correctly. Content matches current product state. No corruption detected.
- **docs/demo-script.md**: 🚨 **ACT 7 IS MISSING.** Script jumps from ACT 6 (5:30–6:30) directly to ACT 8 (7:30–8:00). A full 60-second gap (6:30–7:30) has no content. The KEY THEMES reference table at the bottom references Act 7 three times ("Act 7 (history.md)", "Act 7 (decisions.md on screen)", "Act 7 (second wave)") — pointing to a section that doesn't exist. This is either a truncation from the silent success bug or an incomplete write. Either way, the demo script is broken.
- **docs/sample-prompts.md**: INTACT. 402 lines, 16 prompts, all complete with closing descriptions. No truncation.
- **docs/devrel/sprint-0-story.md**: INTACT. 117 lines, clean ending with timestamp. No truncation.
- **docs/platform/background-agent-timeouts.md**: INTACT. 102 lines, complete TL;DR table and sign-off. No truncation.
- **All 18 proposals in docs/proposals/**: INTACT. Every file checked (last 8 lines of each). All end with proper closing sections (Endorsement, Review requested, Revisions, etc.). No mid-sentence truncation. Sizes range from 3.1KB to 53.1KB. No corruption detected.
- **decisions.md**: INTACT. 826 lines, proper header and complete final section. No truncation.
- **history.md (this file)**: INTACT. Content is coherent and sequential. No gaps in the learning timeline.
- **Polish note**: README still uses the pre-overhaul structure (Proposal 006 rewrite has not been applied yet). Sample prompts still not linked from README. These are known gaps per prior learnings, not new issues.

### Demo script ACT 7 restored (2026-02-09)
- **ACT 7 — THE ARTIFACTS & SECOND WAVE (6:30–7:30)** reconstructed and inserted into `docs/demo-script.md` between ACT 6 and ACT 8.
- Content derived from Proposal 004's BEAT 7 (artifact reveal) plus the KEY THEMES table requirements (history.md, decisions.md on screen, second wave fan-out).
- The original ACT 7 was likely lost to the silent success bug — the same P0 bug that drops ~40% of agent responses. The KEY THEMES table survived because it was written in a different section of the file.
- **Structural lesson**: Demo scripts with reference tables (like KEY THEMES) are self-documenting — the table acts as a checksum. If the table references content that doesn't exist, you know something was lost. This pattern should be preserved in future script formats.
- **Tone calibration**: Matched the existing script's voice — conversational, "hey look at this" energy, not presenter-formal. The voiceover uses concrete file names and agent names (Ripley) to keep it tangible.
- **Second wave is the payoff bridge**: ACT 7's second wave (asking for a new feature, watching agents re-fan-out with prior knowledge) bridges the gap between "agents completed work" (ACT 6) and "look at the finished game" (ACT 8). Without it, the demo jumps from "they built stuff" to "ta-da" with no compounding proof.
- File: `docs/demo-script.md`
📌 Team update (2026-02-08): Upgrade subcommand shipped by Fenster — delivery mechanism for bug fixes to existing users. — decided by Fenster
📌 Team update (2026-02-08): V1 test suite shipped by Hockney — 12 tests pass. — decided by Hockney
📌 Team update (2026-02-08): P0 bug audit consolidated. Demo script ACT 7 restoration confirmed merged into decisions.md. — decided by Keaton, Fenster, Hockney

📌 Team update (2026-02-09): Squad DM proposed (Proposal 017) — hybrid gateway with tiered execution, Copilot SDK backend, Dev Tunnels, Telegram-first. Experience design: single bot, proactive messaging, cross-channel memory. 3 gate spikes before implementation. — decided by Keaton, Kujan, Verbal

### "Where are we?" messaging beat identified (2026-02-09)
- **The insight:** Brady asked "where are we?" and got instant team-wide status — proof of persistent memory, shared state, and coordinator intelligence in a single two-second interaction. His reaction ("that is SO hot, such a feature") signals a visceral value prop moment we weren't messaging.
- **New messaging beat:** "Ask Your Team, Not Your Dashboard" — sits alongside portability, skills, and parallel execution as a top-tier value prop. Demonstrates three features simultaneously without explaining any of them.
- **Demo beat:** "The Check-In" — 30-second demo moment. Three words typed → comprehensive status. Usable in v1 demo (BEAT 4.5), introductory demo (end of ACT 7), and standalone social clip.
- **DM connection:** "Where are we?" from a terminal is cool. From Telegram at 11pm? Category-defining. This becomes the lead demo for Squad DM launch (Proposal 017). The progression: terminal ask → DM ask → proactive standup (you don't even ask).
- **README placements:** Two spots — closing beat of "Why Squad?" (emotional hook) and follow-up in "Agents Work in Parallel" (completes the "step away / come back" arc). Standalone section deferred to DM launch.
- **Key files:** `docs/proposals/014a-where-are-we-messaging-beat.md` (this amendment), `docs/proposals/014-v1-messaging-and-launch.md` (parent proposal), `docs/proposals/017-dm-experience-design.md` (DM connection)


📌 Team update (2026-02-09): Master Sprint Plan (Proposal 019) adopted — single execution document superseding Proposals 009 and 018. 21 items, 3 waves + parallel content track, 44-59h. All agents execute from 019. Wave gates are binary. — decided by Keaton

### Blog format and packaging UX designed (2026-02-09)
- **Blog post format** created at `docs/blog/template.md` — YAML frontmatter (title, date, author, wave, tags, status, hero) + structured body (What Shipped, The Story, By the Numbers, What We Learned, What's Next). One post per wave completion. Compatible with any static site generator. Human-readable raw on GitHub.
- **First blog post** written: `docs/blog/001-wave-0-the-team-that-built-itself.md` — "Wave 0: The Team That Built Itself." Covers team formation, 16 proposals, the silent success bug discovery and self-repair loop, 12 tests shipping, the upgrade subcommand, and the Master Sprint Plan. Narrative voice, not changelog.
- **Blog engine sample prompt** added to `docs/sample-prompts.md` — the meta-demo: Squad builds a static blog renderer (HTML/CSS/JS, no framework) that renders Squad's own progress posts from `docs/blog/`. Parser, templating, RSS, responsive CSS, dark mode. "Squad built the tool that tells Squad's story."
- **Package naming evaluation** completed in Proposal 020 §3 — evaluated `@bradygaster/create-squad` (current), `create-squad` (unscoped), and `squad-cli`. Recommendation: publish `create-squad` unscoped alongside the scoped package. `npx create-squad` is 16 characters vs 33, follows `create-*` convention, enables `npm init squad`. No breaking change for existing users.
- **Key DevRel insight:** Wave-cadenced blogging creates a content flywheel tied to execution. No artificial content calendar — the work IS the content. Each wave gate that passes = a post that writes itself from the metrics and narrative.
- File: `docs/proposals/020-blog-and-packaging.md`

📌 Team update (2026-02-09): Blog format designed — YAML frontmatter + structured body, one post per wave, compatible with all SSGs. First post "Wave 0: The Team That Built Itself" written. Blog engine meta-demo prompt added to sample-prompts.md. — decided by McManus
📌 Team update (2026-02-09): Package naming recommendation — publish `create-squad` unscoped alongside `@bradygaster/create-squad`. Halves the typing burden, follows `create-*` convention, enables `npm init squad`. No breaking change. — proposed by McManus

📋 Team update (2026-02-09): Session 5 directives merged — VS Code parity analysis, sprint amendments (019a), blog format + blog engine sample prompt (020), package naming (create-squad), 5th directive (human feedback optimization).

## Team Updates

📌 Team update (2026-02-09): No npm publish — GitHub-only distribution. Kobayashi hired as Git & Release Engineer. Release plan (021) filed. Sprint plan 019a amended: item 1.8 cancelled, items 1.11-1.13 added.

2026-02-09: Release decisions — v0.1.0 tag now, Kobayashi proposes releases/Brady publishes, squadify→main merge after Wave 1 gate, design for public repo.
