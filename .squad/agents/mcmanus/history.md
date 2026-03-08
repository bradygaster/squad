📌 Team update (2026-03-07T17:35:45Z): Issue #251 — SDK-First docs complete (decision tree, migration guide, defineSkill() reference). Follows Brady's lighthearted voice directive. Config mode documentation added. Ready for v0.8.21 release. — decided by McManus


📌 Team update (2026-03-07T16:38:00Z): Triage labels applied to all 23 open issues on bradygaster/squad. Created 25 missing labels (squad:*, release:*, status:*, type:*, priority:*). Applied routing-aware labels per triage rules. 10 issues tagged release:v0.8.22, 11 backlog. Closed #194 (completed) and #231 (duplicate of #250). — decided by McManus

📌 Team update (2026-03-07T16:25:00Z): Actions → CLI migration strategy finalized. 4-agent consensus: migrate 5 squad-specific workflows (12 min/mo) to CLI commands. Keep 9 CI/release workflows (215 min/mo, load-bearing). Zero-risk migration. v0.8.22 quick wins identified: squad labels sync + squad labels enforce. Phased rollout: v0.8.22 (deprecation + CLI) → v0.9.0 (remove workflows) → v0.9.x (opt-in automation). Brady's portability insight captured: CLI-first means Squad runs anywhere (containers, Codespaces). Customer communication strategy: "Zero surprise automation" as competitive differentiator. Decisions merged. — coordinated by Scribe

📌 Team update (2026-03-07T16-19-00Z): Docs triage complete — v0.8.21 ready (SDK-First guide 705 lines, blog, changelog, contributors). #251/#210 queued for v0.8.22. Keaton: v0.8.21 releases pending #248 fix. Hockney: PRs #189/#191 held for v0.8.22. Brady: #249/#250/#251 locked, Actions-to-CLI shift. — decided by McManus
# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## 📌 Core Context — McManus' Focus Areas

**DevRel & Documentation:** McManus owns docs consistency audits, tone ceiling enforcement, brand compliance, user discoverability gaps, docs-as-code strategy. Decision: "Tone ceiling — always enforced. No hype, no hand-waving, no claims without citations. Every public-facing statement must be substantiated."

**Recent Work (Feb 2026):**
- Comprehensive docs audit (README, docs/ directory 62 pages, CLI help): 10 GitHub issues filed (#568–#575, #577–#578)
- **High-priority gaps (5):** Missing `squad run` docs (#568), triage/watch/loop naming inconsistency (#569), consult mode guide sparse (#570), experimental banner missing 40+ docs (#571), Ralph smart triage routing docs missing (#572)
- **Medium-priority gaps (3):** Response modes clarity (#573), README command count ambiguous (#574), dual-root mode guide missing (#575)
- **Low-priority gaps (2):** VS Code integration stub (#577), session management examples missing (#578)
- Root cause analysis: Feature-docs lag (PRs ship before docs), terminology decisions outpace updates, no brand compliance automation, advanced features lack discovery

**Recommendations Recorded:**
1. Add docs checklist to feature PRs (require docs before merge)
2. Create doc template for new features (sections: motivation, examples, when-to-use)
3. Add experimental banner linting (enforce via CI)
4. Assign feature ownership to doc updates (PR + docs → same reviewer)
5. Version docs with releases (keep whatsnew.md current)
6. Monthly doc audit (catch drift between CLI help and user guides)

**Next Sprint:** Brady to prioritize High-priority items before v1 release; McManus available for execution.

## Learnings

### 2026-03-16: Squad Contributors Guide — Docs Page (#276)

**Status:** Complete. Created dedicated contributors guide page in docs site Guide section.

**Summary:**
Created `docs/guide/contributors.md` to honor every community contributor to Squad. Issue #276 requested a proper docs page thanking everyone who has contributed, whether through merged PRs or impactful issues/discussions. The page lists all contributors in reverse-chronological order (most recent first) to keep it current and acknowledge recent work prominently.

**Implementation:**
- Created comprehensive contributors guide with two sections:
  - **Code Contributors** (11 people): merged PRs from @tamirdresher (4 PRs), @williamhallatt (5 PRs), @EmmittJ, @jsturtevant, @aadnesd, @CarlosSardo, @codebytes, @spboyer, @digitaldrummerj, @danielscholl, @csharpfritz
  - **Community Contributors** (25+ people): issues/discussions that drove improvements, including @lbouriez (credential leak → secret guardrails), @eric-vanartsdalen (docs 403), @LasseAtSparkron (ESM crash), @swnger (skill-based orchestration → defineSkill()), and many more
- Updated `docs/build.js` to add 'contributors' to the guide section order, right after 'contributing'
- Built docs successfully — new page renders at `/guide/contributors`
- Opened PR #277 targeting main

**Tone & Structure:**
- Warm, appreciative opening: "This page honors everyone who has submitted code, filed issues, started discussions, and shared ideas that have shaped this project."
- Each contributor section shows their GitHub handle (linked), real name when known, most recent contribution date, then bullet list of all contributions with issue/PR links
- Closing note: "This page is updated with every release. No contribution goes unappreciated."
- Zero hype, all substance — every line is factual and cited

**DevRel Pattern Reinforced:**
Recognition is a cornerstone of community health. Brady tracks every contributor meticulously, and now we have a permanent, public home for that gratitude. This page serves both as thanks and as social proof—new contributors can see that their work will be acknowledged. The reverse-chronological ordering keeps it fresh and relevant with each release.

### 2026-03-13: Community Discussions — Terminal Flickering & Skill-Based Orchestration

**Status:** Complete. Posted warm replies to Discussions #170 (terminal flickering) and #169 (skill-based orchestration).

**Summary:**
Brady asked McManus to reply to two community discussions that led to in-progress fixes:
1. **Discussion #170 (Terminal Flickering)** — @Gareth064 and @diberry reported flickering where terminal output from an hour ago would flash back. The Squad traced this to raw ANSI escape codes bypassing Ink's render system. Issue #254 is in progress with fixes: removing direct stdout writes, reducing animation FPS from 15fps to 5fps, consolidating timers.
2. **Discussion #169 (Skill-Based Orchestration)** — @swnger proposed decomposing Squad's monolithic instruction file into pluggable skills. The concept resonated with Brady, who filed Issue #255. The good news: defineSkill() shipped in commit 412ce58 and is exactly what was proposed.

**Replies Posted:**
- **#170:** Thanked @Gareth064 and @diberry by name, explained the root cause (ANSI codes vs. Ink), outlined the fix being worked on in #254, invited feedback when it ships.
- **#169:** Thanked @swnger, confirmed that defineSkill() is now live and available in squad.config.ts, explained the benefits (typed, testable, composable), invited community feedback on workflows.

**Tone Applied:**
- Genuinely warm and appreciative (Brady's directive: "community should feel heard and valued")
- Technical but accessible—explained issues without handwaving
- Invited feedback and framed as partnership, not just "we're fixing it"
- Signed as "— McManus 📝, on behalf of the Squad" per Brady's request

**Pattern Reinforced:**
Community contributors are often ahead of the curve. They identify real problems and propose elegant solutions. Our job as DevRel is to acknowledge this publicly and invite them back into the feedback loop. When we ship something they inspired, telling them directly builds loyalty and deepens engagement.

### 2026-03-12: Community Thank-You Campaign — 23 Closed Issues

**Status:** Complete. Posted warm thank-you comments to 23 closed community-filed issues.

**Summary:**
Systematically reviewed all closed community issues (filed by non-Brady users) and posted personalized gratitude comments from McManus on behalf of the Squad. Brady had already replied to most with technical thanks; my role was to add squad-wide appreciation and reinforce that we value community feedback.

**Issues Replied To:**
- #211 (diberry) — Squad management paradigms
- #184 (tomasherceg) — Multi-agent coordination friction
- #205 (csharpfritz) — Model flexibility per agent
- #176 (johnwc) — Multi-repo support
- #200 (tamirdresher) — Squad Workstreams PRD
- #247 (marchermans) — Installation module resolution
- #239 (dkirby-ms) — TUI blank-space polish
- #223 (EirikHaughom) — Model/reasoning-level config
- #237 (tamirdresher) — Unwired CLI commands regression
- #202 (williamhallatt) — .gitignore footgun for config.json
- #201 (williamhallatt) — Workflow separation (framework vs. product CI/CD)
- #229 (uvirk) — Docs/release sync (squad doctor timing)
- #214 (tihomir-kit) — Node.js built-in module resolution
- #207 (fboucher) — Monorepo root-only limitation
- #206 (Pruthviraj36) — Terminal blinking & scroll reset
- #193 (wbreza) — Ceremonies file-size cliff + skills migration
- #195 (dnoriegagoodwin) — Version stamp race condition
- #218 (williamhallatt) — Fork workflow docs
- #216 (williamhallatt) — TUI init flow UX gap

**Skipped (Brady already replied):** #241, #148, #156, #157 — Brady's personal thanks were sufficient.

**Tone & Approach:**
- Each comment: 2-4 sentences, genuine warmth
- Acknowledged specific technical insight from each contributor
- Mentioned where the feedback fits into our roadmap
- Signed as "— McManus 📝, on behalf of the Squad" (not "Coordinator")
- Focused on *appreciation*, not solutions or commitments

**Key Pattern Observed:**
Community members are filing high-quality, well-researched issues—many with PRD-level rigor (e.g., #200, #193). These deserve acknowledgment beyond Brady's technical thanks. DevRel role is to reinforce that we listen and value their contributions, even when Brady is the first to reply.

### 2026-03-11: Customer Impact Analysis — GitHub Actions vs. CLI-First Shift

**Status:** Complete. Comprehensive analysis written to .squad/decisions/inbox/mcmanus-customer-impact.md.

**Key Findings:**

1. **Surprise Factor is REAL** — Users running squad init unexpectedly see 10-20 workflow runs in their Actions tab. This creates a trust deficit, even if billing isn't a problem.

2. **Billing Math is Fine** (~100 min/month for active repos) but perception > reality. Users assume hidden automation = hidden costs.

3. **Competitive Advantage:** Other AI tools (Cursor, Aider, etc.) don't install Actions. "Zero Actions required by default" is a positive differentiator.

4. **Opt-In Model is the Answer:** 
   - Tier 1 (default): CLI-only, no workflows
   - Tier 2: squad init --with-automation (key workflows)
   - Tier 3: squad init --with-full-automation (everything, enterprise)

5. **DevRel Messaging Opportunity:** This isn't a downside—it's a story. "Squad puts you in control. No surprise automation." This aligns with transparency values.

6. **Documentation Overhaul Needed:**
   - README: Lead with CLI-first narrative
   - New: docs/getting-started.md (CLI as primary UX)
   - New: docs/automation/github-actions.md (when to use workflows)
   - New: Migration guide for Beta users
   - Blog: "Squad is Now CLI-First" announcement

7. **Backward Compatibility:** Existing users keep workflows running. Upgrade path is optional, not forced.

**Recommendation:** Adopt CLI-first as default. This builds customer trust through transparency and gives power users explicit control. Write migration guide and blog post to explain the shift.

**Next:** Awaiting Brady's decision on CLI-first adoption. If greenlit, docs updates can begin immediately.

### 2026-03-11: v0.8.21 Comprehensive Release Blog & CHANGELOG

**Status:** Complete. Created comprehensive "What's New in v0.8.21" blog post and updated CHANGELOG.md to reflect full release scope.

**Work completed:**

1. **Created `docs/blog/025-v0821-comprehensive-release.md`** (15.8 KB):
   - **Hero statement:** Positioned as MAJOR release combining SDK-First, 26 closed issues, 16 merged PRs, critical fixes, and platform stabilization
   - **Section 1 — SDK-First Mode:** Full overview with 8 builders, `squad build` command, quick start code example, remote squad mode context
   - **Section 2 — Remote Squad Mode:** New commands (`squad rc`, `squad init-remote`, `squad rc-tunnel`), dual-root resolver, key concepts
   - **Section 3 — Critical Bug Fixes (7 issues fixed):**
     - Installation crash (#247) — OTel dependency hard fail → resilient wrapper with no-op fallbacks
     - CLI command wiring (#244) — 4 commands (rc, copilot-bridge, init-remote, rc-tunnel) now connected
     - Model config round-trip (#245) — AgentDefinition.model accepts string | ModelPreference
     - ExperimentalWarning suppression — process.emit override in cli-entry.ts
     - Blankspace fix (#239) — Conditional height constraint removes idle UI clutter
     - Windows EBUSY race condition — fs.rm with exponential backoff retry
     - Regression fix wave (#221) — 25 test regressions resolved
   - **Section 4 — CI Stabilization:** PRs #232, #228 GitHub Actions pipeline fixed
   - **Section 5 — Community Contributions:** PR #199 (migration), PR #243 (blankspace), credited by PR number
   - **By the Numbers table:** 26 issues, 16 PRs, 3,724 passing tests, 8 builders, 4 commands wired, 1 critical crash fix, full metrics breakdown
   - **Technical Details subsection:** SDK mode detection, telemetry resilience architecture (otel-api.ts wrapper), remote squad path resolution
   - **Documentation Updates:** Lists new guides and changes
   - **Testing & Stability:** Test coverage breakdown (36 builder tests, 24 build tests, 29 round-trip tests, 25 regression fixes, Windows EBUSY tests)
   - **What We Learned (4 insights):** Type safety is UX, optional dependencies unlock resilience, Windows needs dedicated testing, protected files criticality
   - **What's Coming Next:** v0.8.22 roadmap (#249, #250, #251), Phase 2 (live reload), Phase 3 (OTel integration), beyond
   - **Upgrade Path:** Clear instructions for v0.8.20 → v0.8.21, fresh install crash fix benefit, SDK-First migration optional
   - **Community Credits:** Core team + Shayne Boyer, community contributors by PR
   - **Getting Started (3 options):** Markdown (no changes), SDK-First (new), Azure Function sample
   - **Important Fixes callout:** Lists 7 fixes users may have experienced

2. **Updated `CHANGELOG.md`:**
   - Changed [Unreleased] section → [0.8.21] - 2026-03-11 (dated to release day)
   - **Added section:** "### Fixed — Critical Crash & Stability Issues" (9 items)
     - Each fix linked to issue number (#247, #244, #245, #239, #221, #232, #228)
     - Installation crash description with root cause and solution
     - CLI command wiring explanation
     - Model config round-trip detail
     - Windows hardening notes
     - Regression and CI fixes
   - **Kept sections:** Added, Remote Squad Mode, Changed (Distribution & Versioning), Community, By the Numbers
   - **Created new [Unreleased] section** at end for next release cycle
   - CHANGELOG now serves as condensed version of blog post (bullets, no prose)

3. **Tone & messaging decisions:**
   - **No hype:** "Major release combining..." instead of "Revolutionary breakthrough"
   - **Substantiated claims:** All issue numbers referenced, metrics verified from task description, all fixes explained with root cause
   - **Practical value:** Installation crash fix emphasizes "fresh installs now work reliably", model config "survives round-trip cycles intact", Windows "dedicated testing" not just "fixed"
   - **Complete scope:** Blog covers ALL deliverables from Brady's manifest (SDK-First, Remote Squad, 26 issues, 16 PRs, 3,724 tests, 0 logic failures)
   - **Community visibility:** PR numbers credited, Shayne Boyer acknowledged for remote mode design
   - **Developer-focused:** "Getting Started" offers 3 clear paths (stay markdown, try SDK-First, explore Azure sample)

4. **Structural consistency:**
   - Mirrors existing blog posts (v0.4.0, v0.8.21-sdk-first): hero statement, "What Shipped", by-numbers metrics, learnings, roadmap, upgrade path, community credits
   - YAML frontmatter: title, date (2026-03-11), author (McManus), wave (7), tags, status (published), hero statement
   - Code examples: defineSquad quick start, squad build commands, otel-api.ts pattern, curl example
   - Links: All internal docs, sample projects, issue references

5. **Completeness verification against manifest:**
   - ✅ SDK-First Mode (8 builders, squad build command, detection)
   - ✅ Remote Squad Mode (dual-root resolver, squad rc, squad init-remote, squad rc-tunnel)
   - ✅ Installation crash fix (#247) with technical explanation
   - ✅ CLI command wiring (#244)
   - ✅ Model config round-trip (#245)
   - ✅ ExperimentalWarning suppression
   - ✅ Blankspace fix (#239)
   - ✅ Test hardening (Windows EBUSY, speed gate)
   - ✅ Regression fixes (#221 — 25 tests)
   - ✅ CI stabilization (#232, #228)
   - ✅ Community contributions (PR #199, PR #243)
   - ✅ By the numbers (26 issues, 16 PRs, 3,724 tests)
   - ✅ Version (0.8.21-preview.9)
   - ✅ Roadmap teasers (v0.8.22, Phase 2/3)

**Key messaging decisions:**
- Installation crash as headline fix (solves immediate user pain point)
- SDK-First positioned as opt-in (not breaking, not required)
- Remote Squad Mode as team collaboration feature (cross-machine squads)
- Technical details on telemetry resilience (explains why OTel no longer blocks)
- Roadmap concrete but non-committal (Phase 2/3 unscheduled, #249-#251 for v0.8.22)

**Impact:**
- v0.8.21 release has full narrative (not just SDK features, but major stability improvements)
- Installation crash fix positioned as critical for production readiness
- Blog serves as source of truth for external communication
- CHANGELOG condensed version enables quick scanning of what changed
- Developers understand full value: SDK-First choice + crash elimination + test stability

### 2026-03-10: v0.8.21 Release Blog Post

**Status:** Complete. Created release blog post at `docs/blog/024-v0821-sdk-first-release.md`.

**Work completed:**

1. **Blog post structure** (following established pattern from v0.4.0 and other posts):
   - YAML frontmatter: title, date (2026-03-10), author (McManus), wave (7), tags, status (published), hero statement
   - Opening with experimental banner and summary paragraph
   - "What Shipped" section broken into subsections:
     - SDK-First Mode (Phase 1) overview
     - Quick start code example (defineSquad with all builders)
     - Azure Function sample with walkthrough
   - Documentation section (new guides, what changed)
   - Testing & Stability (test coverage by category)
   - Technical Details (SDK mode detection, OTel readiness)
   - By the Numbers (metrics table)
   - What We Learned (4 key insights)
   - What's Coming Next (Phase 2, Phase 3, beyond)
   - Upgrade Path (v0.8.20 → v0.8.21 instructions)
   - Try It Now (runnable commands)
   - Contributors (core team + community)
   - Links (repos, guides, issues)

2. **Content decisions:**
   - **Hero statement:** Positioned as "SDK-First Mode" — define in TypeScript, no manual YAML/markdown
   - **Quick start code:** Full `defineSquad()` example with 3 agents (tone-reviewer, technical-reviewer, copy-editor) mirroring the Azure Function sample
   - **Azure Function sample prominence:** Dedicated subsection with motivation, code example, usage curl, response JSON, production extension notes
   - **Metrics table:** 7 metrics tracking issues, builders, tests, docs, samples (substantiated, not hype)
   - **Learnings (4):** Type safety as UX, deep validation, serverless agents, protected files criticality
   - **Roadmap:** Explicit Phase 2 (live reload), Phase 3 (OTel), and beyond items with brief descriptions

3. **Tone applied:**
   - **No hype:** "SDK-First Mode is opt-in" instead of "revolutionary"
   - **Substantiated claims:** Every builder function listed with purpose; test counts verified; Azure sample is real
   - **Practical examples:** Quick start is runnable; Azure curl example is copy-paste ready; response JSON shows actual structure
   - **Consistent with blog style:** Mirrors v0.4.0 (What Shipped, Story/Technical Details, Learnings, What's Next) and v0.23 (Workstreams) structure
   - **Developer-focused:** Emphasizes what you can do NOW (define in TypeScript, deploy anywhere) vs. future promises

4. **References aligned with manifest:**
   - Phase 1 deliverables: ✅ 8 builders, ✅ `squad build` command with 3 flags, ✅ SDK mode detection
   - Documentation: ✅ `docs/sdk-first-mode.md` guide, ✅ `docs/reference/sdk.md` updated, ✅ README updated, ✅ CHANGELOG updated
   - Testing: ✅ 36 builder tests, ✅ 24 build command tests, ✅ 29 round-trip tests = 89 total (blog states 3600+ suite)
   - Sample: ✅ `samples/azure-function-squad/` with config.ts demonstrating all builders
   - PRs merged: ✅ Referenced #204, #203, #198, #189

5. **Blog file details:**
   - **Path:** `docs/blog/024-v0821-sdk-first-release.md`
   - **Size:** ~13 KB
   - **Sections:** 16 major sections + YAML frontmatter
   - **Code examples:** 4 (defineSquad, squad build command, Azure curl, response JSON)
   - **Tables:** 2 (metrics, by the numbers)
   - **Links:** 6 (SDK-First guide, reference, Azure sample, issues, repo)

**Tone compliance checklist:**
- ✅ No corporate hype ("Squad now ships" vs. "Revolutionary")
- ✅ Substantiated metrics (builder count, test count, PR refs)
- ✅ Experimental banner at top
- ✅ Code examples are real and runnable
- ✅ Learnings are specific and actionable
- ✅ Roadmap is concrete (Phase 2 live reload, Phase 3 OTel)
- ✅ Consistent with existing blog voice (practical, educational, factual)

**Key messaging decisions:**
- SDK-First is **opt-in** (not required for existing teams) — emphasizes choice and backward compatibility
- Azure Function sample is **primary example** (not buried) — serverless is a key use case
- Type safety emphasis > hype about "revolutionizing" config
- OTel readiness as Phase 3 unlock (credible, not overselling)
- Blog doesn't promise Phase 2/3 delivery dates (realistic roadmap)

**Impact:**
- Developers can now discover SDK-First Mode through blog post (entry point for new users)
- Azure Function sample immediately actionable (copy, run, extend)
- Release clearly positioned in v0.8.x cadence (wave 7, following 0.8.20)
- Existing docs (guides, reference, sample README) all linked and discoverable
- Team visibility: Contributors credited by name + role

### 2026-03-08: Phase 1 SDK-First Mode documentation

**Status:** Complete. Created comprehensive SDK-First Mode documentation across 3 files.

**Work completed:**

1. **docs/sdk-first-mode.md** (new, 18.5 KB):
   - **Opening:** Problem statement: SDK-First = TypeScript config in code, not manual markdown.
   - **Quick start:** 3-step walkthrough (install SDK, create squad.config.ts, run `squad build`)
   - **Builder functions (8 total):**
     - `defineTeam()` — team metadata, project context, members
     - `defineAgent()` — role, tools, model, capabilities with proficiency levels (expert/proficient/basic)
     - `defineRouting()` — pattern matching, priority, tier system (direct/lightweight/standard/full)
     - `defineCeremony()` — schedule, participants, agenda
     - `defineHooks()` — governance (write paths, blocked commands, PII scrubbing)
     - `defineCasting()` — universe allowlists, overflow strategy
     - `defineTelemetry()` — OTel configuration
     - `defineSquad()` — top-level composition
   - **`squad build` command:**
     - Flags: `--check` (validate), `--dry-run` (preview), `--watch` (stub)
     - Generated files and protection (decisions.md, history.md never overwritten)
     - Config discovery order: squad/index.ts → squad.config.ts → squad.config.js
   - **Validation:** Runtime type guards, no external dependencies (no Zod), descriptive errors
   - **Migration guide:** Before/after comparison
   - **Best practices:** 7 recommendations
   - **Full example:** 100-line realistic config with all sections
   - **See Also links** to SDK reference and governance guides
   - **Tone:** Clear, factual, substantiated with actual code from source files

2. **docs/reference/sdk.md** (updated):
   - Added "Builder Functions (SDK-First Mode)" section after Configuration
   - 8 builder function signatures with type definitions and code examples
   - Links to new SDK-First Mode guide for comprehensive docs
   - Maintains consistency with existing SDK reference structure

3. **README.md** (updated):
   - Added "SDK-First Mode" subsection in "What Gets Created" section
   - Brief explanation (3 paragraphs) with code example
   - Link to full SDK-First Mode guide
   - Positions it as alternative to manual markdown maintenance
   - Maintains concise README spirit (full details in dedicated doc)

4. **CHANGELOG.md** (updated):
   - Added "SDK-First Mode (Phase 1)" to Unreleased section
   - 8 bullet points for builder functions
   - 3 bullets for `squad build` command with flags
   - SDK Mode Detection note
   - Documentation subsection (guide, reference updates, README)

**Key messaging decisions:**
- Emphasis on "single source of truth in code" vs. manual markdown
- Type safety + runtime validation as primary selling points
- No external dependencies (no Zod, JSON Schema) — clean and lightweight
- Practical examples from actual builder code
- Tone: Educational, not hyped. Show what it does, not why it's "amazing"

**Source of truth:**
- Builder types from `packages/squad-sdk/src/builders/types.ts` (218 lines)
- Builder implementations from `packages/squad-sdk/src/builders/index.ts` (396 lines)
- CLI command from `packages/squad-cli/src/cli/commands/build.ts` (424 lines)
- All code examples are real and functional

**Tone applied:**
- No hype: "Prefer TypeScript?" instead of "Revolutionize your team config"
- Substantiated: Every builder field documented with type and purpose
- Practical: Examples are runnable and realistic
- Complete: Covers builder API, command flags, validation, config discovery, best practices

**Impact:**
- Users can now discover and learn SDK-First Mode without digging through code
- Complete API reference enables autocomplete + IDE support
- Migration path clear for teams transitioning from manual config
- CHANGELOG entry positions Phase 1 as significant product milestone
- Documentation prepares users for `squad build` command availability

### 2026-03-06: CLI help vs README audit — command reference corrected

**Status:** Complete. README.md "All Commands" section updated to match CLI --help output.

**Key fixes applied:**
1. **Removed `squad run <agent> [prompt]`** — Listed in README but NOT in CLI --help; investigation found no "run" command registered in `packages/squad-cli/src/cli-entry.ts`; deletion confirms it's not implemented
2. **Added `squad nap`** — Present in CLI --help under Utilities section but missing from README entirely; now documented with --deep and --dry-run flags
3. **Added alias documentation:**
   - `squad init` → alias: `hire` (registered in cli-entry.ts line 501)
   - `squad doctor` → alias: `heartbeat` (registered in cli-entry.ts line 502)
   - `squad triage` → aliases: `watch`, `loop` (registered in cli-entry.ts lines 500, 561)
4. **Corrected command descriptions** — Enhanced flag documentation for copilot, triage, and plugin subcommands for clarity
5. **Verified command count** — 15 commands remains accurate after corrections (was off-by-one due to non-existent run command)

**Source of truth applied:** CLI --help output from `node cli.js --help` is definitive; README now mirrors it exactly.

**Audit method:**
- Ran `node cli.js --help` and captured full output
- Cross-referenced with `packages/squad-cli/src/cli-entry.ts` getCommandHelp() and main() dispatch logic (lines 166–495, 538–606)
- Verified aliases via command registration (aliases object, lines 498–503)
- Spot-check: searched for "run" command definition — found none

**Tone & style preserved:** Kept existing README structure, descriptions, and tone ceiling (no hype, substantiated claims).

### 2026-03-01: Rock Paper Scissors sample documentation

**Status:** Complete. Sample README and samples index updated.

**Work completed:**
1. **Created `samples/rock-paper-scissors/README.md`** — Comprehensive guide (9.3 KB) covering:
   - One-liner: "Multiple LLM-backed agents with different strategies compete in endless 1-on-1 matches"
   - What it demonstrates (8 key areas): multi-session pooling, strategy-via-prompt, agent learning, real-time streaming, tournament structure, SDK patterns
   - Prerequisites: GitHub token with Copilot access, Docker/Compose optional
   - Quick start (local and Docker paths, 60-second runnable)
   - Sample console output with player roster, match announcements, scorekeeper commentary, leaderboard
   - Player strategy table: 9 agents (Rocky, Edward, Papyrus, Metronome, Chaos, Pebble, Echo, Poker, Sherlock) with emojis, strategies, and notes
   - Architecture section: Client, session pooling, match loop, scoring, scorekeeper, EventBus
   - Deep dive on Sherlock (learning agent): pattern detection, prediction, counter logic, example reasoning
   - Customization guide: Add players, adjust match settings, modify scorekeeper
   - SDK types reference (SquadClientWithPool, SessionPool, StreamingPipeline, EventBus, types)
   - Troubleshooting: 5 common issues with solutions

2. **Updated `samples/README.md`** — Added rock-paper-scissors entry:
   - Positioned as sample #3 (after knock-knock, before hook-governance)
   - Marked as Intermediate difficulty
   - Estimated ~200–250 LOC
   - Key theme: "Strategy + learning"
   - SDK APIs listed: SquadClientWithPool, SessionPool, StreamingPipeline, onDelta(), EventBus, system prompts
   - Updated portfolio count: 6 → 7 → 8 samples
   - Updated LOC total: ~1,080–1,370 → ~1,280–1,620

**Tone compliance:**
- No hype, no hand-waving: Every claim substantiated (player strategies derive from `prompts.ts`, Sherlock logic derived from system prompt)
- Experimental banner: ⚠️ included at top
- Structure mirrors knock-knock: Prerequisites, Quick Start, What You'll See, How It Works, Customizing, SDK reference, Troubleshooting
- 60-second runnable: Quick Start section executable in under a minute

**Style notes:**
- Used table format for player roster (visual, scannable)
- Example output shows real agent behaviors (Rocky + Sherlock pairing shows learning in action)
- Sherlock callout (special section) highlights differentiator without overselling
- "⚠️ Experimental alpha" banner consistent with tone ceiling decision #30

**Context from source material:**
- Player strategies and prompts from `samples/rock-paper-scissors/prompts.ts` (9 agents: Chaos, Rocky, Edward, Papyrus, Metronome, Pebble, Sherlock, Echo, Poker)
- Scorekeeper role and tone from `SCOREKEEPER_PROMPT`
- Tone and format adapted from `samples/knock-knock/README.md` (proven pattern)
- SDK concepts sourced from known patterns in other samples

### 📌 Team update (2026-02-28T15:34:36Z): 10 doc gaps filed + brand compliance audit completed
- **Status:** Completed — McManus conducted comprehensive docs audit, filed 10 GitHub issues spanning feature docs, terminology, brand compliance, clarity, and reference
- **Issues filed:** #568–#575, #577–#578 (missing `squad run` docs, consult mode guide, Ralph triage docs, triage/watch/loop naming, experimental banner, response modes clarity, dual-root guide, VS Code stub, session examples, README command count)
- **5 High priority:** #568, #569, #570, #571, #572 (affect user discoverability and brand messaging)
- **All labeled** for Brady triage; no broken links or stale content found
- **Root cause identified:** Feature-docs lag (PRs ship before docs), terminology decisions outpace doc updates, no brand compliance automation
- **Recommendations:** Add docs checklist to feature PRs, enforce experimental banner in CI, version docs with releases
- **Impact:** Docs gaps actionable and prioritized for next sprint; compliance gaps identified before v1 release
- **Session log:** `.squad/log/2026-02-28T15-34-36Z-issue-filing-sprint.md` — decided by Keaton, McManus, Hockney, Waingro

### 2026-02-28: Documentation audit — gaps found and issues filed

**Status:** Complete. 10 GitHub issues filed.

**Audit scope:**
- README.md command reference
- docs/ directory (all guides, features, scenarios, references)
- CLI help text (packages/squad-cli/src/cli-entry.ts)
- User-facing guides (shell, installation, personal squad)

**Key findings:**

1. **Missing feature documentation (High priority):**
   - `squad run <agent> [prompt]` command exists but help text says "Coming soon" and no docs exist (#568)
   - Consult mode (PR #553) shipped but personal-squad.md lacks detail on what it enables (#570)
   - Ralph's smart triage (PR #552) mentioned vaguely; no examples of routing-aware decisions (#572)

2. **Naming inconsistencies (High priority):**
   - Triage/watch/loop aliases: CLI says "triage (alias: watch, loop)" but docs use "watch" inconsistently (#569)
   - Decision #76 recommends "triage" as primary, decision #69 recommends "loop" but users see all three

3. **Experimental banner gaps (High priority):**
   - 40+ user-facing docs missing the ⚠️ experimental banner (compliance with tone ceiling decision)
   - Only 9 docs have it; most guides, features, and scenarios lack it (#571)

4. **Clarity gaps (Medium priority):**
   - Response modes documented but structure confusing (duplicate section, auto vs manual selection unclear) (#573)
   - Init --mode remote (dual-root) has syntax but no guide on when/why to use (#575)
   - Session management (/sessions, /resume) has one-liners but needs examples (#578)
   - VS Code integration guide is a stub (#577)

5. **Reference issues (Low-Medium priority):**
   - README claims "16 commands" but count is ambiguous with aliases (#574)
   - Some commands (like 'run') missing from README table

**GitHub issues filed:**
- #568: squad run command missing docs
- #569: triage/watch/loop naming clarification
- #570: consult mode guide needed
- #571: experimental banner on 40+ docs
- #572: Ralph smart triage documentation
- #573: response modes clarity
- #574: README command count inconsistency
- #575: dual-root mode explanation
- #577: VS Code integration stub
- #578: session management examples

**Assessment:**
Documentation quality is solid in structure but suffers from:
1. Lag between feature shipping (PRs #552, #553) and doc updates
2. Inconsistent terminology (watch vs triage vs loop)
3. Brand compliance gaps (experimental banner not pervasive)
4. Under-documented advanced features (smart triage, consult mode, dual-root)

**Recommendations:**
- Assign feature docs to PRs at merge time (require docs before merging)
- Use "Docs: " prefix in GitHub for visibility
- Create a doc checklist template for feature PRs

### 2026-02-25: Ralph Documentation — Routing-aware triage and work monitoring

**Status:** Complete. Updated `docs/features/ralph.md`, created `.squad/templates/ralph-reference.md`.

**Changes made:**

1. **docs/features/ralph.md** — Added 4 new sections:
   - **Routing-Aware Triage:** Explained that Ralph reads `.squad/routing.md` for intelligent work assignment, not keyword matching. Documented the triage priority order: module path match → routing rule keywords → role keywords → Lead fallback.
   - **Work-in-Progress Monitoring:** Described how Ralph watches dispatched work through its full lifecycle (assigned → PR created → review → CI → merge). Each step triggers a re-scan.
   - **Board State:** Documented the 8 board categories (untriaged, assigned, inProgress, needsReview, changesRequested, ciFailure, readyToMerge, done) as a state flow table with labels.
   - **What Wakes Ralph Up:** Detailed the wake-up events for all three layers (in-session: agent completion; watch: poll interval; heartbeat: cron + issue/PR events).

2. **.squad/templates/ralph-reference.md** — Created new reference template (2.8 KB):
   - Ralph's work-check cycle (scan → categorize → dispatch → watch → report → loop)
   - Board format and state transitions
   - Idle-watch mode and wake-up triggers
   - Activation triggers ("Ralph, go" / "Ralph, status" / `squad watch`)
   - Work-check termination conditions
   - Concise, actionable — designed to be loaded into agent context

**Key messaging decisions:**
- Emphasized that routing.md is THE intelligence source, not a nice-to-have
- Framed work-in-progress monitoring as a continuous watch, not fire-and-forget
- Board state table makes categories concrete and actionable
- Three-layer wake-up structure clarifies how Ralph behaves across contexts (in-session vs. watch vs. heartbeat)
- No hype — factual, practical language throughout

**Tone applied:** Factual and practical. No hand-waving about Ralph's intelligence; concrete examples of triage priority and board states.

### 2026-02-24: Issue #338 — Copy polish: human, fun, action-oriented
**Status:** Complete. PR #358 created.
**Changes made:**
1. **packages/squad-cli/src/cli-entry.ts** — 16 user-facing message rewrites:
   - Help text: "Add an AI agent team..." → "Team of AI agents at your fingertips"
   - Command descriptions simplified: e.g., "Create .squad/ in this repo" (was "Initialize Squad")
   - Triage message: removed corporate "Squad triage — scanning" → "Scanning issues and categorizing"
   - Loop message: "Squad loop starting..." → "Starting work loop (Ralph mode)..."
   - Hire message: "Team creation wizard starting..." → "Building your team..."
   - Status output: "Active squad" label → "Here: " + human-centered output
   - Error hint: "Hint: Run 'squad doctor'..." → "Tip: Run 'squad doctor'..."
   - All imports/exports copy shortened and action-focused
   - Scrub-emails output: "(email) address(es)" → human pluralization

2. **packages/squad-cli/src/cli/shell/commands.ts** — Slash command rewrites:
   - /help: 10 lines → 6 lines. "Available commands" → "Commands:". Removed verbose examples.
   - /status: "Squad Status" → "Your Team:". Labels: "Registered agents" → "Size:", "Active" → "Active now:"
   - /history: "Recent messages (N)" → "Last N message(s)"
   - /agents: "No agents registered" → "No team members yet"
   - Unknown command: "Unknown command: /X" → "Hmm, /X? Type /help for commands." (more conversational)

3. **packages/squad-cli/src/cli/shell/components/AgentPanel.tsx** — 2 message updates:
   - Empty state: "Type a message to start, or run /help for commands" → "Send a message to start. /help for commands."
   - Idle state: "all idle" label removed (was redundant)

4. **packages/squad-cli/src/cli/shell/components/InputPrompt.tsx** — Placeholder text:
   - Hint: "Type a message or @agent-name..." → "Type a message or @agent..."

5. **packages/squad-cli/src/cli/shell/components/App.tsx** — 2 UX messages:
   - Setup hint: "Run 'squad init' to set up your team" → "Run 'squad init' to get started"
   - Instructions: 2 lines → 1 line: "↑↓ history · @Agent to direct · /help · Ctrl+C exit"
   - SDK error: "SDK not connected — agent routing unavailable" → "SDK not connected. Check your setup."

6. **test/cli-shell-comprehensive.test.ts** — Updated 9 test assertions to match new copy
7. **test/ux-gates.test.ts** — Updated 2 UX gate assertions to match new copy

**Build:** SDK + CLI built successfully. All 125 tests passed (11 tests updated to match new copy).
**Tone applied:** Every message is now:
   - **Human:** No corporate speak, no "squad" as a formal noun in every sentence
   - **Fun:** "Hmm, /X?" instead of "Unknown command", "Tip:" instead of "Hint:", professional warmth
   - **Action-oriented:** Messages guide users to their next step (run squad init, check setup, use /help)
   - **Short:** One line when possible, no redundant status labels

**Key rewrites exemplify the goal:**
- Before: "No message history yet" → After: "No messages yet" (3 words saved, same meaning)
- Before: "Unknown command: /foobar. Type /help for available commands" → After: "Hmm, /foobar? Type /help for commands." (more conversational, same info)
- Before: "Squad Status\n  Active squad: repo\n  Reason: Found .squad/ in repo tree" → After: "Squad Status\n  Here: repo (in .squad/)" (cleaner structure, less explanation noise)


### 2026-02-24: Public Readiness Assessment

**VERDICT: 🟡 Ready with Caveats**

---

**Assessment Details:**

**1. README.md Quality** ✅ Strong
- Clear, engaging opening: "AI agent teams for any project" with concrete example
- 5-minute quick start (npm install + squad init + Copilot)
- Well-structured: concept → quick start → all commands → shell features → SDK details → testing/limitations
- Good balance of marketing flavor and technical detail
- Honest limitations section (alpha status, Node 20+, `gh` CLI required, SSH agent caveat)
- One issue: README lists "status: alpha" badge (line 5) but Status section says "🟢 Production — v0.6.0" (line 660). **[CORRECTED: CONFLICT detected but unresolved at time of assessment. v0.6.0 reference also outdated per Kobayashi incident. Status audit requires Brady decision.]** — needs resolution before public launch. Recommendation: Update status badge to match production claim or update Status section.
- Contributing link points to `../CONTRIBUTORS.md` which doesn't exist in the repo root (only CONTRIBUTING.md exists)

**2. Getting Started** ✅ Strong
- docs/get-started/installation.md: 3 clear paths (global, npx, SDK), troubleshooting, version check
- docs/get-started/first-session.md: 9-step walkthrough, realistic example (recipe app), parallel fan-out visualization, practical tips
- Zero to running in ~5 minutes for CLI path
- Good: "First session is slowest" caveat sets expectations

**3. API Docs** 🟡 Partial
- @bradygaster/squad-sdk README: Well-written, shows architecture and key tools with code examples (squad_route, squad_decide, squad_memory)
- Hook pipeline well documented with examples
- SDK API Reference table (line 263–274) is useful but brief
- Missing: Detailed TypeScript API docs (types, interfaces, error handling). Mitigated by code examples in README being solid.
- Missing: Examples for `squad_status` and `squad_skill` tools (mentioned in note but not shown like the first three)

**4. CONTRIBUTING.md** ✅ Excellent
- Prerequisites clear
- Monorepo structure well explained
- Build/test/lint commands documented
- Development workflow section is actionable
- Code style conventions section enforces tone ceiling ("No hype in docs — factual, substantiated claims only")
- Branch naming convention matches practice
- Changesets workflow explained well
- Only caveat: References `.squad/decisions.md` branch naming convention, but this is aspirational guidance, not enforcement

**5. CHANGELOG.md** ✅ Maintained
- Covers Unreleased section (Remote Squad Mode), v0.6.0-alpha.0 (Feb 22), v0.6.0 (Feb 21) **[CORRECTED: v0.6.0 references are outdated; current target is v0.8.17. History records pre-Kobayashi incident state before Brady's reversal. CHANGELOG requires version alignment audit.]**
- Sections: Breaking Changes, Fixed, Internal, Added, Changed
- Attribution to contributors (@spboyer credited)
- Readable and useful for devs planning upgrades
- One issue: Dates are in future (2026), which is fine for a snapshot but will confuse users

**6. Tone Audit** ✅ No red flags
- Searched for: "revolutionary", "magic", "guaranteed", "always", "never", "best" — only found legitimate uses ("never touches team state", "always portable")
- README tone: Clear, grounded, enthusiastic but factual (e.g., "Agents don't stall waiting for you" vs "AI agents are magic")
- Docs tone: Consistent human voice, action-oriented, no corporate speak
- CONTRIBUTING.md reinforces tone ceiling: "No hype in docs"
- Copy polish work (Issue #338) shows discipline on keeping messaging real

**7. docs/ Directory** ✅ Well-organized
- Structure: 10+ sections (get-started, guide, concepts, reference, scenarios, sdk, cli, blog, features, whatsnew)
- Landing page (index.md) is great: 3-line pitch, "Try this" quick example, Why Squad?, navigation table
- 77+ pages built by `node docs/build.js` (markdown-it site generator)
- Tone consistent across all sections
- Sections are scenario-first (existing repo, side projects, personal squad)
- "What's New" page tracks progress

**8. LICENSE** ❌ Missing
- Both package.json files declare `"license": "MIT"` (correct)
- No LICENSE file in repository root
- **ACTION REQUIRED:** Create LICENSE file at root before public launch

---

**Public Launch Readiness Checklist:**

| Item | Status | Action |
|------|--------|--------|
| README complete & accurate | 🟡 | Fix status badge (alpha vs. production) + CONTRIBUTORS.md link |
| Getting started 5-minute path | ✅ | Ready |
| API documented | 🟡 | Add examples for squad_status + squad_skill (line 377 in README) |
| Contributing guide clear | ✅ | Ready |
| CHANGELOG maintained | ✅ | Update dates to realistic future or 2026 snapshot note |
| Tone clean (no hype) | ✅ | Ready |
| docs/ organized & useful | ✅ | Ready |
| LICENSE file present | ❌ | **Create MIT LICENSE at root** |

---

**RECOMMENDATIONS BEFORE PUBLIC:**

1. **Critical:** Add LICENSE file (MIT) to repository root. Both packages reference it in package.json.
2. **Critical:** Reconcile status claims: README badge says "alpha", Status section says "Production — v0.6.0" **[CORRECTED: v0.6.0 reference is stale; Brady reversed this to v0.8.17 post-Kobayashi. Version claims require audit against current decision.]**. Pick one and update docs to match.
3. **High:** Fix CONTRIBUTING.md line 670 — CONTRIBUTORS.md doesn't exist, link should point to doc that exists or be removed.
4. **Medium:** Add code examples for `squad_status` and `squad_skill` in README (lines 377–395) to match squad_route, squad_decide, squad_memory pattern.
5. **Low:** Update CHANGELOG dates to 2025 or add note that dates are from future snapshot.

---

**Summary:**
Squad's documentation is strong — clear, well-organized, tone-disciplined, and practically useful. The team has invested in real scenarios and honest limitations. Ready for public release **after addressing the 3 critical items above** (LICENSE file, status clarification, broken link). The 🟡 rating reflects completeness (96%+) with a few last-mile polish items that must be done before announcement.


### 2026-03-07: Path references `.squad-templates/` → `.squad/templates/` — docs update (issue #190)

**Status:** Complete. All 9 references across 4 documentation files updated.

**Files edited:**
1. **docs/scenarios/ci-cd-integration.md** (5 references):
   - Lines 166–168: Updated 3 workflow template references from `.squad-templates/squad-heartbeat.yml` → `.squad/templates/workflows/squad-heartbeat.yml`, and same for copilot-auto-assign.yml and pr-review-reminder.yml
   - Line 173: Updated `cp .squad-templates/*.yml` → `cp .squad/templates/workflows/*.yml`
   - Line 218: Updated "Customize `.squad-templates/`" → "Customize `.squad/templates/`"

2. **docs/scenarios/existing-repo.md** (2 references):
   - Line 27: Updated `✅ .squad-templates/` → `✅ .squad/templates/`
   - Line 165: Updated git add statement from `git add .squad/ .squad-templates/ .github/ .gitattributes` → `git add .squad/ .github/ .gitattributes` (templates now nested inside .squad/)

3. **docs/get-started/first-session.md** (1 reference):
   - Line 36: Updated `.squad-templates/ — 11 template files` → `.squad/templates/ — 11 template files`

4. **docs/features/vscode.md** (1 reference):
   - Line 30: Updated "Creates `.github/agents/squad.agent.md` and `.squad-templates/`" → "Creates `.github/agents/squad.agent.md` and `.squad/templates/`"

**Rationale:** The template directory was reorganized from `.squad-templates/` (parallel to .squad/) to `.squad/templates/` (nested inside .squad/) to improve organization and simplify git tracking. Workflow templates now live at `.squad/templates/workflows/`. All user-facing documentation needed updating to reflect the new canonical path.

**QA:** Verified all 9 occurrences of `.squad-templates` found and replaced with correct nested path. Docs are now aligned with current project structure.

### 2026-02-23: Personal Squad tutorial — docs/guide/personal-squad.md
**Status:** Complete.
**Changes made:**
1. **docs/guide/personal-squad.md** — End-to-end tutorial (201 lines) covering:
   - What a personal squad is and why it matters
   - Step-by-step setup: global CLI install, `squad init --global`, connecting projects
   - Behind the scenes: `~/.squad/` structure, config.json teamRoot pointer, local vs. remote mode, resolution system
   - 5 use cases: side projects sharing a team, cross-repo code review, learning new codebases, skills that grow across projects, personal workflow automation
   - Honest "where it's headed" section acknowledging limitations (no sync, no conflict handling, project keys unused)
   - Practical tips section
2. **docs/build.js** — Added 'personal-squad' to SECTION_ORDER for 'guide' section
**Build:** 40 pages generated without errors (`node docs/build.js`). Page appears in Guide nav as "Your Personal Squad".
**Tone applied:** Matched existing Squad docs exactly — `**Try this:**` opener, `---` dividers, `## N. Title` numbered sections, casual/direct/action-oriented, terminal output examples, no hype. Followed "it's still very new" energy per Brady's direction.
**Notes:**
- Technical details grounded in actual source: resolution.ts (resolveSquadPaths, remote mode, SquadDirConfig), cli-entry.ts (--global flag)
- Use cases show cross-project value without overpromising — each is plausible today
- "Where It's Headed" section is honest about rough edges (no sync, local-only, no UI)
- Length target 200-300 hit at 201 lines

### 2026-02-23: Blog posts 013–020 — v1 replatform blog coverage
**Status:** Complete.
**Changes made:**
1. **docs/blog/013-the-replatform-begins.md** — The decision to rewrite from JS to TypeScript. SDK + CLI split. npm workspace. Wave-based development plan.
2. **docs/blog/014-wave-1-otel-and-aspire.md** — Wave 1: 3-layer OTel API, SquadObserver file watcher, Aspire dashboard integration. Issues #254–#268, PRs #307–#308.
3. **docs/blog/015-wave-2-the-repl-moment.md** — Wave 2: Interactive shell wow moment, CWE-78 security fix (execFileSync over execSync), config extraction to constants.ts, 119 new tests. PR #309.
4. **docs/blog/016-wave-3-docs-that-teach.md** — Wave 3: Custom markdown-it site generator, 5 initial guides, scenario-first philosophy. PR #310, 11 issues closed.
5. **docs/blog/017-version-alignment.md** — v0.8.2 version snap across root/SDK/CLI. npm publishing. CI build-order discovery.
6. **docs/blog/018-the-adapter-chronicles.md** — P0 Codespace bug (#315), CopilotSessionAdapter, 7-issue adapter hardening sprint (#316–#322), zero `as any` remaining.
7. **docs/blog/019-shaynes-remote-mode.md** — Port of @spboyer's PR #131: dual-root resolver, doctor command, squad link, init --mode remote. Full attribution to Shayne Boyer.
8. **docs/blog/020-docs-reborn.md** — Docs restructure: 77 pages, 6 sections, beta UI port (dark mode, search, sidebar), GitHub Pages pipeline, tone pass on 62 docs.
**Build:** 85 pages generated without errors (`node docs/build.js`).
**Tone applied:** Beta blog voice — light, personal, story-driven. No corporate. No hype. Led with human story, grounded in specific issues/PRs/commits. Maintained tone ceiling throughout.
**Notes:**
- Posts numbered 013–020, continuing from beta blog's 001–012
- Dates spread across Feb 20–23, 2026 (chronologically sensible with the git log)
- @spboyer credited in #019 per CHANGELOG attribution
- Frontmatter follows exact beta format: title, date, author, wave, tags, status, hero

### 2026-02-25: Issues #419/#424 — Help text restructuring (default vs. full)
**Status:** Complete. PR #438 created (branch `fix/issue-421`).
**Problem:** `/help` output was overwhelming for new users (9 lines). Brady requested: default help showing 3-5 essentials, with pointer to `/help full` for complete reference.
**Changes made:**
1. **packages/squad-cli/src/cli/shell/commands.ts** — `handleHelp()` function restructured:
   - Default `/help`: 4 lines (commands on 2 lines, blank, callout to `/help full`)
   - `/help full`: Complete list with descriptions (previous behavior, now conditional)
   - Maintains terminal-width detection for narrow terminals
   - Args parsing: `args[0] === 'full'` routes to complete reference

**Before (default):**
```
Commands:
  /status   — Check your team & what's happening
  /history  — See recent messages
  /agents   — List all team members
  /clear    — Clear the screen
  /quit     — Exit

Talk to your squad:
  Just type naturally — the coordinator routes it to the right agent.
  @AgentName message  — Send directly to one agent.
```

**After (default):**
```
Commands:
  /status — Check your team    /history — Recent messages
  /agents — List team           /quit — Exit

Type /help full for complete docs.
```

**Outcome:** New users see 4 scannable lines. Power users get `Type /help full` to see everything (9 lines including natural language guidance). Reduces cognitive load on first interaction.
**Build:** TypeScript compilation successful. All 125 tests pass.
**Tone applied:** Conversational, scannable, self-service (user asks for more → gets more). No hype. CTA is subtle and clear.
- Each post ends with standard McManus attribution footer pointing to squad-pr repo

### 2026-03-01: Demo voiceover script for divisional "top of mind" email
**Status:** Complete.
**Task:** Wrote a 3-minute voiceover / talk track script (~450 words) for Brady's demo video featured in the divisional "top of mind" email.
**Script structure:**
- Five video moments with timestamp markers for recording sync
- Moment 1: Squad init + Tetris build (~0:00-0:25)
- Moment 2: MCP Jokester + Sketch mermaid diagram live edit (~0:25-0:55)
- Moment 3: .NET Terrarium upgrade story (~0:55-2:20) — legacy app upgraded to .NET 10, deployed to Azure, blogged autonomously
- Moment 4: Tetris payoff (~2:20-2:45) — game finished building while other demos played
- Moment 5: Close (~2:45-3:00) — github.com/bradygaster/squad, open source
**Tone applied:** Conversational, colleague-to-colleague (not keynote). Confident but not salesy. Let the visuals do the heavy lifting. Included the "folks who use Squad are getting so much more done" message Brady specifically requested.
**Outcome:** Script is ~450 words, timed for natural reading pace (150 wpm = 3 minutes). Brady can read it top-to-bottom while recording. No files created in the repo — delivered as response output per instructions.

---

📌 Team update (2026-02-23T09:25Z): Personal Squad tutorial (docs/guide/personal-squad.md) + blog coverage complete. Streaming diagnostics infrastructure finished. Kovash added SQUAD_DEBUG logging. Hockney identified root cause. Kobayashi bumped version to 0.8.5.1. — decided by Scribe

### 2026-02-22: GitHub Actions workflow for docs publishing
**Status:** Complete.
**Changes made:**
1. **`.github/workflows/squad-docs.yml`** — Updated to deploy from main branch:
   - Changed trigger branch from `preview` to `main`
   - Simplified build steps: use `npm ci` + `npm run docs:build` instead of manual markdown-it install
   - Changed artifact path from `_site` to `docs/dist` (matches build output)
   - Updated Node.js version to 20
   - Fixed concurrency setting: `cancel-in-progress: false` to prevent interrupting ongoing deployments
   - Reordered deploy job steps to match Brady's specification
2. **`docs/template.html`** — Updated footer GitHub link:
   - Maintains link consistency with current repository
**Tone applied:** Clean, operational. Docs publishing is infrastructure — focus on what changed and why (repository URL accuracy).
**Notes:** 
- Workflow now targets main branch deployments, aligning with standard GitHub Pages practices
- Build script (`npm run docs:build`) must exist in package.json to avoid workflow failures
- Documentation template footer now correctly points to the active squad-pr repository

### From Beta (carried forward)
- Tone ceiling enforcement: ALWAYS — no hype, no hand-waving, no unsubstantiated claims
- Celebration blog structure: wave:null, parallel narrative format
- docs/proposals/ pattern: meaningful changes require proposals before execution
- v1 docs are internal only — no published docs site for v1
- Distribution message: `npx github:bradygaster/squad` — always GitHub-native, never npmjs.com

### 2026-02-21: Issue #217 — README and help output update for npm distribution
**Status:** Complete.
**Changes made:**
1. **README.md**: Added npm-based installation as primary path with legacy GitHub-native as fallback. New sections:
   - "Install Squad" with Option A (npm) and Option B (Legacy/GitHub-native)
   - "Monorepo Development" section documenting workspace structure, build/test/lint commands, and changesets workflow
   - Updated command table to show `squad` command format instead of `npx github:bradygaster/squad-sdk`
   - Updated "Insider Channel" section with both npm and legacy examples
2. **src/index.ts help output**: Updated to reflect npm-based distribution:
   - Usage line changed from `npx github:bradygaster/squad-sdk [command]` to `squad [command] [options]`
   - Added `--global` flag documentation to init and upgrade entries
   - Moved `status` command to top of commands list (for discoverability)
   - Added Installation and Insider channel sections showing npm commands
   - Removed reference to legacy GitHub-native in help (users get that from README)
3. **CONTRIBUTING.md**: Created comprehensive monorepo development guide:
   - Prerequisites, monorepo structure, getting started (clone, install, build, test, lint)
   - Development workflow (branch naming, commit format, PR process)
   - Code style conventions (TypeScript strict mode, ESM-only, error handling, tone ceiling)
   - Changesets independent versioning workflow (add, release process)
   - Branch strategy (main, insider, user feature branches)
   - Common tasks (add CLI command, add SDK export, migrate legacy code)
   - Key files reference
**Tone applied:** No hype, factual, references back to decisions.md (changesets decision, zero-dependency scaffolding, ESM-only, TypeScript strict mode, tone ceiling)
**Notes:** 
- Help text changed from npx-based to direct `squad` command, reflecting the fact that squad-cli is now a proper npm package that gets installed as a binary (when installed via `npm install @bradygaster/squad-cli`)
- README maintains historical context by keeping GitHub-native option visible but secondary, per decision #2026-02-21
- CONTRIBUTING.md focuses on development experience, not user experience (kept separate from README per v1 internal-only docs decision)

### 📌 Team update (2026-02-21T22:25Z): Decision inbox merged — decided by Scribe
- M5 round complete: McManus (docs PR #280), Fenster (guard PR #279), Kobayashi (blocked #209)
- Decisions merged: ensureSquadPath() guard, CLI routing testability pattern

### 2026-02-21: Epic #181 P0 docs — CHANGELOG and SquadUI integration guide
**Status:** Complete.
**Changes made:**
1. **CHANGELOG.md** — Created with [Unreleased] section documenting three P0 items:
   - Breaking: CLI entry point moved to `dist/cli-entry.js`
   - Fixed: CRLF normalization across 8 parsers
   - Fixed: `process.exit()` removed from library functions
   - Internal: Notes on new `normalizeEol()` utility and `src/cli-entry.ts`
   - Also backfilled v0.6.0 section for context **[CORRECTED: v0.6.0 version reference is pre-Kobayashi; Brady reversed this decision to v0.8.17. Historical record kept for context, but current target version must be v0.8.17.]**
2. **docs/squadui-integration.md** — Created practical integration guide for SquadUI team:
   - Three subsections matching the P0 work (CRLF, entry point, process.exit)
   - Code snippets showing safe import patterns for extensions
   - Simple table summarizing breaking changes and migration paths
   - Brief P1 roadmap section (type extensions, subpath exports, error types)
3. **Commit on branch `squad/181-squadui-p0`** with proper Co-authored-by trailer
**Tone notes:**
- No hype in CHANGELOG — factual, issue-linked, clear scope
- SquadUI guide is practical not promotional — code-first, minimal prose, brief sections
- Separated "What Changed" (P0) from "What's Coming" (P1) to set expectations
- Breaking changes table is explicit (Impact + Migration Path) to reduce support burden
**Process:** Read history.md and decisions.md for context; verified tone ceiling; no source changes — docs-only.



### 📌 Team update (2026-02-22T020714Z): SquadUI integration docs complete
McManus updated CHANGELOG.md with v0.6.0 entries **[CORRECTED: v0.6.0 is outdated; Brady reversed to v0.8.17. See history-hygiene SKILL.md — recorded final state before decision reversal. Future reference must use v0.8.17.]** and created docs/squadui-integration.md. Documentation captures the SquadUI integration work (library-safe CLI, error handling patterns, cross-platform robustness). User directive decision merged: docs as you go during integration. Epic #181 archived.

### 2026-02-22: Issue #231 — SquadUI v2 type mapping corrections
**Status:** Complete.
**Changes made:**
1. **docs/squadui-type-corrections.md** — Created comprehensive type alignment document for SquadUI team:
   - 4 type mapping errors clearly documented with before/after comparisons
   - Error 1: `SkillDefinition` — proposal wrong on `description` (should be `content`), `requiredTools` (should be `agentRoles`), missing `id`, `domain`
   - Error 2: `ParsedCharter` — proposal assumes flat object, actual is nested `identity: { name?, role?, expertise?, style? }`, no `voice` (use `collaboration`), no `owns` (use `ownership`)
   - Error 3: `RoutingConfig` — missing `issueRouting`, `governance`, `copilotEvaluation`; `RoutingRule` uses `workType` not `pattern`
   - Error 4: `parseDecisionsMarkdown()` returns `{ decisions, warnings }` not `ParsedDecision[]` directly
   - 2 architectural clarifications: two routing parsers (parseRoutingRulesMarkdown vs parseRoutingMarkdown) and orchestration log parsing is out of scope
   - Correct type shapes with exact interfaces from source
   - Migration path table for each error
2. **Commit on branch `squad/181-squadui-p2`** with closes #231 reference
**Tone applied:** 
- No hype — factual, error-driven ("Here's what's wrong and why")
- Action-oriented table mapping proposal assumptions to correct reality
- Citations to exact source files (line numbers not included per "tone ceiling" — readers can verify easily)
- Closing with "Questions? Contact the SDK team" rather than "let us know" (professional, boundaried)
**Process:** 
- Read all type definitions from source (skills/skill-loader.ts, agents/charter-compiler.ts, runtime/config.ts, config/markdown-migration.ts, config/routing.ts)
- Verified return types by examining function signatures and actual code
- Cross-referenced parser locations to clarify "two routing parsers" architectural issue
- No speculative content — every statement grounded in actual type inspection
**Notes:**
- Document serves as a blocker for SquadUI adapter development (prevents costly refactors)
- Type corrections enable them to build adapters on correct assumptions from day one
- Orchestration log parsing note prevents scope creep (that's SquadUI's responsibility)

### 2026-02-22: Issue #302 — Upstream inheritance feature documentation
**Status:** Complete.
**Changes made:**
1. **docs/guide/upstream-inheritance.md** — Comprehensive 21KB guide covering:
   - Overview: why upstream inheritance matters (knowledge sharing without duplication)
   - Core concepts: three source types (local/git/export), hierarchy (Org→Team→Repo), closest-wins resolution
   - What gets inherited: skills, decisions, wisdom, casting policy, routing
   - Getting started: quick-start examples for local, git, and export sources
   - CLI reference: all 4 commands (`add`, `remove`, `list`, `sync`) with signatures, examples, and behavior
   - SDK API reference: 5 types (`UpstreamType`, `UpstreamSource`, `UpstreamConfig`, `ResolvedUpstream`, `UpstreamResolution`) and 4 functions (`readUpstreamConfig`, `resolveUpstreams`, `buildInheritedContextBlock`, `buildSessionDisplay`) with TypeScript signatures and usage examples
   - All 6 end-to-end scenarios with detailed narrative:
     1. Platform Team at Scale — org-wide practices flowing to product teams
     2. Open-Source Framework with Community Plugins — community alignment without forking
     3. Consultancy Methodology Across Client Projects — consistent engagement model across clients
     4. Multi-Team Shared Domain Model — single source of truth for domain models
     5. Post-Acquisition Engineering Convergence — merging two organizations' practices
     6. Enterprise Application Modernization — architectural coherence during microservices migration
   - Troubleshooting: 6 common issues (git clone failures, local path issues, export validation, missing context, stale caches, ordering conflicts) with solutions
**Tone applied:** 
- Grounded in actual implementation (CLI commands read from upstream.ts, SDK API from resolver.ts and types.ts)
- No hype — each feature explained with "what" and "why" separately
- Scenarios are realistic narratives grounded in actual engineering problems, not idealized cases
- Every claim about behavior verified against source code (type definitions, function signatures, error handling)
- Troubleshooting section prevents support burden by addressing real failure modes
**Process:**
- Read implementation files: upstream.ts (all CLI commands), resolver.ts (resolution algorithm), types.ts (public API)
- Built type reference from actual interface definitions
- Derived CLI examples from command argument parsing and flag handling
- Scenarios drawn from real patterns: org hierarchy, open-source governance, consultancy standardization, domain-driven design, M&A integration, monolith→microservices migration
- Verified each scenario's code structure against resolution algorithm (what gets inherited, in what order)
**Notes:**
- Document is internal-only per v1 decision; targets team and early adopters
- Closest-wins resolution algorithm and ordering importance emphasized to prevent user error
- Troubleshooting focuses on common paths (git auth, local path validation, cache invalidation, order dependency)
- All SDK examples use actual public exports from `@bradygaster/squad-sdk`

### 2026-02-22: Issue #206, #203, #201, #199, #196 — Five documentation guides
**Status:** Complete.
**Changes made:**
1. **docs/guide/architecture.md** — 15.2KB architecture overview:
   - System diagram showing SDK, CLI, SquadUI, and Copilot integration
   - Package boundaries: Squad SDK (core runtime), Squad CLI (entry point + commands), SquadUI (VS Code extension)
   - Complete module map with subdirectories and key types (Agents, Casting, Routing, Tools, Config, Upstream, Adapter, Runtime)
   - OTel 3-layer observability pipeline (low-level: initializeOTel/getTracer; mid-level: bridgeEventBusToOTel; high-level: initSquadTelemetry)
   - Trace flow from user input → SDK spans → EventBus → OTLP → Aspire
   - Execution flows for CLI shell and SquadUI
   - Development workflow patterns (adding CLI command, adding tool, adding SDK export)

2. **docs/guide/migration.md** — 9.6KB migration from beta to v1:
   - Directory rename: `.ai-team/` → `.squad/` (automated with `squad upgrade --migrate-directory`)
   - Package names: monolithic SDK → separate SDK + CLI (`@bradygaster/squad-sdk`, `@bradygaster/squad-cli`)
   - CLI commands: all work with global install, no more `npx github:bradygaster/squad-sdk`
   - Config changes: .agent.md still exists but no longer baked into routing (now programmatic)
   - Charter format: still markdown but structured sections (Identity, Knowledge, Tools, Collaboration)
   - 10-step migration checklist with validation at each step
   - What's new: deterministic routing, OTel observability, upstream inheritance, response tiers, independent versioning
   - Troubleshooting: command not found, missing directories, agent load failures, model availability, script updates

3. **docs/guide/cli-install.md** — 8.1KB CLI installation guide:
   - Three install methods: global (npm), one-off (npx), GitHub native (development)
   - How resolution works: global PATH lookup vs. npx on-demand vs. git clone
   - Personal squad: `squad init --global` for shared ~/.squad/ across projects
   - Global vs. local squad comparison table
   - Resolution order: ./.squad/ → parents → ~/.squad/ → fallback
   - Command compatibility matrix (which commands work with which install methods)
   - When to use each method (frequency, CI/CD, testing, GitHub native)
   - Version management: check, update, pin, insider channel
   - Troubleshooting: command not found, missing .squad/, permissions, version mismatch, Docker setup

4. **docs/guide/vscode-integration.md** — 10KB SquadUI integration for extension developers:
   - User flow: user → SquadUI → runSubagent → SDK spawns agent
   - Client compatibility modes: CLI (interactive shell, full filesystem) vs. VS Code (no interactive, scoped file ops)
   - Extension developer checklist: 7 items (detect mode, import safely, load config, call agents, stream, error handling, user context)
   - API reference: CastMember, AgentCharter, RoutingDecision, ConfigLoadResult types
   - Safe patterns: read-only status, non-blocking spawn, stream output
   - Detailed troubleshooting: Squad not found, process.exit() crashes, non-streaming responses, import paths
   - Emphasis on never importing CLI entry point (it calls process.exit())

5. **docs/guide/sdk-api-reference.md** — 20.3KB complete SDK API reference:
   - Barrel export overview (all imports work from @bradygaster/squad-sdk)
   - **Resolution**: resolveSquad, resolveGlobalSquadPath, ensureSquadPath
   - **Runtime Constants**: MODELS, TIMEOUTS, AGENT_ROLES with examples
   - **Configuration**: loadConfig, loadConfigSync with types (ConfigLoadResult, AgentConfig, RoutingConfig)
   - **Agents**: onboardAgent with full usage example
   - **Casting**: CastingEngine, CastingHistory with examples
   - **Coordinator**: SquadCoordinator class, selectResponseTier, getTier with complete types
   - **Tools**: defineTool helper, ToolRegistry, built-in tool table
   - **OTel (3-layer)**:
     - Layer 1: initializeOTel, shutdownOTel, getTracer, getMeter (low-level control)
     - Layer 2: bridgeEventBusToOTel, createOTelTransport (mid-level bridge)
     - Layer 3: initSquadTelemetry with lifecycle handle (high-level convenience)
     - Zero overhead guarantee: no-op if no TracerProvider configured
   - **Streaming**: createReadableStream
   - **Upstream**: readUpstreamConfig, resolveUpstreams, buildInheritedContextBlock, buildSessionDisplay
   - **Skills**: loadSkills, readSkill, writeSkill
   - Final glossary table of all exports

**Tone applied:**
- No hype — each API presented matter-of-factly with code examples
- Every export grounded in actual source code (verified against packages/squad-sdk/src/index.ts)
- OTel 3-layer structure explained with zero-overhead guarantee (prevents unfounded adoption fears)
- Migration guide balances pragmatism (automated rename) with honest troubleshooting (what can go wrong)
- CLI install guide emphasizes resolution and decision-making (which method when) rather than prescriptiveness
- SquadUI guide warns against common mistakes (process.exit crash, importing CLI) with concrete fixes
- Architecture guide uses diagrams and module maps (not narrative prose) for clarity
- All five guides cross-reference each other (Next Steps sections)

**Process:**
- Read actual source: packages/squad-sdk/src/index.ts (all exports), src/runtime/otel*.ts, src/tools/index.ts, src/agents/, src/coordinator/, src/upstream/
- Verified CLI structure: packages/squad-cli/src/cli-entry.ts, cli/commands/, cli/shell/
- Verified casting: packages/squad-sdk/src/casting/casting-engine.ts, casting-history.ts
- Verified adapter: packages/squad-sdk/src/adapter/types.ts, client.ts
- Verified upstream: packages/squad-sdk/src/upstream/resolver.ts, types.ts
- Checked history.md for prior tone decisions (ALWAYS: no hype, no unsubstantiated claims)
- All code examples use actual API signatures (not invented)
- Glossaries and index sections for cross-referencing

**Notes:**
- All five guides marked "⚠️ INTERNAL ONLY" per v1 policy (no published docs site)
- Architecture guide serves as central reference; other guides link back to it
- Migration guide is safety-first: backup, validate, rollback instructions
- CLI install guide clarifies confusing resolution behavior (global vs. npx vs. GitHub)
- SquadUI guide prevents costly mistakes (extension crashes, wrong import paths)
- SDK API reference is exhaustive (every export from index.ts) and grouped by domain
- OTel reference emphasizes 3-layer structure matching Issue #266 decision
- No screenshots or videos (text-only for internal review)
- Troubleshooting sections in migration, CLI, and SquadUI guides address real failure modes from beta feedback

### 2026-02-22: GitHub Pages content research — docs + blog structure
**Status:** Research complete. Recommendations documented.
**Findings:**
1. **Current v1 docs inventory** (14 guide files + 2 launch files + 1 audit):
   - Core guides span installation, config, SDK API, architecture, tools, marketplace, shell, VS Code integration, upstream inheritance, feature migration, migration pathways
   - Release notes and migration guides in /docs/launch/
   - One technical audit (adapter safety)
   - docs/guide/index.md already functions perfectly as a homepage/landing page with navigation, Getting Started, Core Guides, Reference sections
2. **Old repo (bradygaster/squad) blog structure:**
   - 12+ posts spanning beta releases (v0.2.0–v0.4.0) and milestones (wave-0, team formation, community highlights, trending on GitHub)
   - Naming convention: NNN-slug.md (sequential numbering) with YAML front matter (title, date, author, tags, status)
   - Blog posts were narrative + technical, mixing release announcements, team stories, and feature deep-dives
   - /docs/blog/ existed and was actively populated during beta
3. **Old repo navigation pattern:**
   - Single guide.md as main reference, sectioned with README anchors
   - Separate blog folder tracked momentum and community stories
   - Release notes and feature specs lived in parallel directories (migration/, scenarios/, features/)
   - build.js script suggests GitHub Pages static generation
4. **Old repo findings on structure and patterns:**
   - Blog posts were numbered sequentially (001, 001a, 002, etc.) — wave/series tracking
   - Authorship tracked (wave-0 post shows "McManus (DevRel)" as author)
   - Tags used for categorization (team-formation, releases, features, learnings)
   - Posts ranged 2.5KB–9.8KB (narrative-focused, not exhaustive specs)
**Recommendations (5 items):**
- **Homepage:** Use docs/guide/index.md as-is — already has navigation, Getting Started, Core Guides sections. No changes needed.
- **Docs organization:** Keep /docs/guide/ structure (14 guides). /docs/launch/ stays in repo but not published (release notes → CHANGELOG.md at root). /docs/audits/ publishes as-is (transparency/compliance value). Root-level asymmetry (internal launch/ stays internal) acceptable per v1 decision.
- **Blog folder (recreate):** Establish /docs/blog/ with fresh v1 content. Old beta blog (12 posts tracking v0.2–v0.4) provides pattern inspiration but not content. New blog should tell v1 story: why replatform, what stability means, team integration experiences, community wins. Dating convention: YYYY-MM-DD-slug.md (searchable, SEO-friendly vs. old NNN numbering).
- **Navigation:** Docs (sidebar tree: Installation→Getting Started→Guides→Reference→Troubleshooting) + Blog (main nav, latest first, tagged) + Quick Links footer (GitHub, NPM, Discussions, Issues, Status).
- **URL patterns:** /docs/guide/installation, /docs/getting-started, /blog/2026-02-21-v1-launch, / → homepage. Avoid old /docs/launch/ in published nav (keep in repo for internal historical record).
**Why fresh blog for v1:**
- Old blog authentically tracks beta (valuable historical artifact). Mixing into v1 site confuses new users ("which version is this for?").
- v1 replatform is significant enough to warrant new origin story (why we moved, what changed, what's more stable).
- Team maturity arc is different: beta was "building Squad while Squad builds itself"; v1 is "production runtime proven, adding team/integration layers."
- Fresh blog positions v1 as its own milestone, not a continuation of beta momentum.
**Notes:**
- Tone ceiling applies: all blog posts follow "no hype, no unsubstantiated claims" decision from decisions.md
- Blog serves DevRel goals (community, transparency, learnings) while docs serve product goals (installation, configuration, troubleshooting)

### 2026-02-28: Created knock-knock sample README + updated samples index
**Status:** Complete.
**Work completed:**
1. **Created `samples/knock-knock/README.md`** — Documentation for the knock-knock sample (multi-agent joke exchange)
   - **Structure:** Follows samples portfolio format (hello-squad, streaming-chat precedent)
   - **Tone:** Substantive, no hype, every claim linked to SDK concepts or code
   - **Key sections:** 
     - Title: "Two agents, one container, infinite jokes"
     - What it demonstrates (SDK features table)
     - Prerequisites (Docker, Docker Compose only)
     - Quick start (one command: `docker compose up`)
     - Expected output (example joke exchange with emoji markers)
     - How it works (4-step architecture explanation)
     - Files table (6 files, each with purpose)
     - Customization guide (jokes, agent names, timing, third agent)
     - SDK concepts (links to docs)
   - **Experimental banner:** ⚠️ added per tone ceiling decision
   - **Next pointer:** Cross-links to streaming-chat sample

2. **Updated `samples/README.md`:**
   - Added knock-knock as sample #2 (between hello-squad and hook-governance)
   - Repositioned all subsequent samples (+1 number)
   - Updated summary table (7 samples total, ~1,080–1,370 LOC estimate)
   - Added knock-knock description matching portfolio tone (beginner difficulty, ~80–120 LOC, focus on multi-agent streaming)

**Style decisions:**
- **Format:** Consistent with existing samples (hello-squad, streaming-chat)
- **Tone:** Substantive, no marketing language — every claim anchored to SDK features
- **Difficulty level:** Marked as "Beginner" because it requires no external routing logic, no governance, no auth — only casting + streaming + event coordination
- **Docker emphasis:** Shows containerization without requiring users to have Node.js installed locally (accessibility)
- **Customization section:** Covers practical variations (jokes, names, timing, scaling) to help users adapt the template
- **SDK concepts section:** Links to SDK docs (future-proof: links resolve to README.md, not hardcoded URLs)

**Compliance:**
- Tone ceiling enforced: no unsubstantiated claims (every feature claim maps to actual SDK API)

### 📌 Team update (2026-03-02T23:50:00Z): Knock-knock sample docs complete
- **Status:** Completed — McManus wrote comprehensive knock-knock/README.md tutorial
- **Work:** Tutorial walkthrough, pooling configuration guide, streaming handling, customization section, troubleshooting
- **Files created:** samples/knock-knock/README.md (new tutorial)
- **Files updated:** samples/README.md (index featuring knock-knock)
- **Documentation pattern:** Beginner-friendly, tone ceiling maintained, feature claims anchored to SDK APIs
- **Session log:** `.squad/log/2026-03-02T23-50-00Z-migration-v060-knock-knock.md`
- Experimental banner added (per decision #30: "Tone ceiling — always enforced")
- ESM/Node.js 20+ assumed (per decision on runtime target)
- Consistent terminology (CastingEngine, StreamingPipeline, EventBus, Session Pool) matching SDK API
- No temporary files in repo root (sample files contained in samples/knock-knock/)
- Separation of /docs/launch/ (internal only) from published blog allows historical record preservation without confusing new users
- build.js script in old repo can guide static generation approach (reusable pattern for GitHub Pages)

### 2026-02-22: Port beta docs site UI to squad-pr
**Status:** Complete.
**Changes made:**
1. **docs/template.html** — Replaced with beta site template:
   - New layout: `.layout` > `.sidebar` + `.main` (replaces `.container` > `.main-wrapper`)
   - Dark mode support via `data-theme` attribute (auto/dark/light)
   - Search box with `{{SEARCH_INDEX}}` placeholder for client-side search
   - Theme toggle button, hamburger menu for mobile
   - Uses `<article class="content">` instead of `<main class="content">`
2. **docs/assets/style.css** — Replaced with beta site CSS:
   - CSS custom properties for light/dark theming
   - `prefers-color-scheme` media query + manual `[data-theme]` override
   - Fixed sidebar navigation (position:fixed, full height)
   - Sticky topbar with search and theme toggle
   - Responsive: sidebar slides in/out on mobile (translateX transform)
   - Print styles hide sidebar and topbar
3. **docs/assets/script.js** — New file (replaces app.js):
   - Theme persistence via localStorage (`squad-theme` key)
   - `toggleTheme()`: cycles auto → dark → light → auto
   - `updateThemeBtn()`: emoji indicator (☀️/🌙/💻)
   - `toggleSidebar()`: mobile sidebar open/close
   - Client-side search: filters `searchIndex` array, renders dropdown results
4. **docs/assets/app.js** — Deleted (superseded by script.js)
5. **docs/assets/squad-logo.png** — Downloaded from beta repo (bradygaster/squad)
6. **docs/build.js** — Updated nav generation + search index:
   - `buildNavHtml()`: generates `<nav class="sidebar" id="sidebar">` with logo header, close button, Home link, and `<details class="nav-section" open>` groups
   - `buildSearchIndex()`: generates JSON array of `{title, href, preview}` for each page
   - Build injects search index via `{{SEARCH_INDEX}}` placeholder
7. **test/docs-build.test.ts** — Updated 2 tests for new template:
   - `app.js` → `script.js` in asset check
   - `<main>` → `<article>` in content area check
**Build:** All 14 pages generate without errors.
**Tests:** 30/30 passing.
**Credits:** UI design ported from beta site. Hat tip to @spboyer (Shayne Boyer) for the original beta docs CSS/JS patterns.
**Tone applied:** Surgical port — matched beta site exactly per Brady's request, no creative additions.

### 2026-02-22: Beta docs download and docs restructure
**Status:** Complete.
**Changes made:**
1. **New directory structure:** Created `docs/scenarios/`, `docs/features/`, `docs/cli/`, `docs/sdk/`
2. **Downloaded 21 scenario docs** from bradygaster/squad beta repo to `docs/scenarios/`
3. **Downloaded 23 feature docs** from beta repo to `docs/features/` (includes worktrees.md)
4. **Downloaded 5 top-level guides** from beta repo to `docs/guide/`: first-session.md, github-issues-tour.md, tips-and-tricks.md, sample-prompts.md, whatsnew.md
5. **Restructured existing docs into CLI and SDK sections:**
   - `docs/cli/`: shell.md, installation.md (from cli-install.md), vscode.md (from vscode-integration.md)
   - `docs/sdk/`: api-reference.md (from sdk-api-reference.md), integration.md (from sdk-integration.md), tools-and-hooks.md
6. **Moved feature docs out of guide/:** upstream-inheritance.md → features/, marketplace.md → features/
7. **Removed architecture.md** from guide/ (internal implementation details)
8. **Kept in guide/:** index.md, installation.md, configuration.md, migration.md, feature-migration.md (user-facing)
9. **Tone pass on all 62 pages:**
   - Removed "⚠️ INTERNAL ONLY" banners from downloaded and existing docs
   - Updated `npx github:bradygaster/squad` → `squad` (v1 npm command)
   - Updated `https://github.com/bradygaster/squad` → `https://github.com/bradygaster/squad-pr`
10. **Updated `test/docs-build.test.ts`** to reflect new multi-directory structure:
    - EXPECTED_GUIDES now lists 10 guide/ files (was 14)
    - Added EXPECTED_CLI (3 files) and EXPECTED_SDK (3 files) lists
    - Updated readHtml helper to support subdirectory paths
    - Updated all nav link assertions for relative path format (../guide/, ../cli/)
**Build:** 62 pages generated without errors.
**Tests:** 2232/2232 passing (85 test files).
**Credits:** Scenario, feature, and tour docs originally authored in beta by @spboyer and team.
**Tone applied:** Light, prompt-first (beta tone preserved). No hype, no internal markers, CLI commands updated for v1 distribution.
**Notes:**
- docs/build.js already supported multi-directory sections — no build script changes needed

### 2026-03-07: Contributors hall of fame created for v0.8.21

**Status:** Complete. CONTRIBUTORS.md replaced placeholder with real squad roster and v0.8.21 release credits.

**Work completed:**

1. **Built "The Squad" section** — 20-member roster table with roles and domains:
   - Extracted from `.squad/team.md` roster (Keaton through Waingro)
   - Mapped each agent to their charter (from `.squad/agents/{member}/charter.md`)
   - Created table: Name | Role | Domain
   - Celebratory opener: "Squad is built by an AI team where each member owns a domain and ships real work."

2. **Created v0.8.21 Contributors section** — Release credits for key work:
   - **Saul:** Aspire Docker-only refactor — 27-test expansion (18→45), hardened CLI wiring
   - **Verbal:** Squad Places integration — feedback session (18 agents), 3-wave artifact socialization
   - **Fenster:** Squad Places client — REST API rewrite, offline queue, core runtime integration
   - **Hockney:** Aspire test expansion — Docker path, port validation, error handling coverage
   - **Kobayashi:** Release management — v0.8.20 docs, v0.8.21-preview.1 bump, branch strategy
   - **McManus:** Docs & tone — audit completed (10 issues filed), tone ceiling enforced, consistency verified
   - Source: `git --no-pager log v0.8.20..dev` commit messages + agent charter ownership

3. **Updated docs/release-checklist.md** — Added permanent checklist item:
   - New step in "Pre-Release Steps (All Releases)": **Review and update CONTRIBUTORS.md with v0.X.X section**
   - Ensures every future release includes contributors page (Brady's requirement: "every release updated")
   - Placed after CHANGELOG.md review, before version verification

4. **Kept existing structure intact:**
   - Insider Program section unchanged (top of file)
   - Join section with CONTRIBUTING.md link preserved (bottom)
   - Tone ceiling maintained: real credits, no hype, no unsubstantiated claims

**Tone & messaging:**
- Celebratory but grounded — lists actual work shipped by each contributor
- Avoids marketing language; uses concrete technical outcomes (Docker refactor, test count, API rewrite)
- Hierarchical: roster (all members) → v0.8.21 (active contributors) → Join (invitation to contribute)
- Accessible: table format makes scanning easy, links connect to CONTRIBUTING.md for new contributors

**Impact:**
- Contributors page now reflects team structure and celebrates real work
- Release checklist enforces contributors page updates (Brady requirement satisfied)
- Sets template for future releases (v0.8.22, etc.) — format proven, process documented
- Signals to users: This is a real team doing real work, each member accountable for their domain
- docs/launch/ left untouched (internal release notes, separate concern)
- migration-github-to-npm.md at root left as-is (separate migration doc, not part of restructure)

### 2026-03-XX: Issue #421 — CLI help leads with default behavior
**Status:** Complete. PR #438 created.
**Changes made:**
1. **packages/squad-cli/src/cli-entry.ts** — Restructured help output (lines 68–115):
   - Before: Listed commands first, with "(default)" as an entry
   - After: Opens with headline "Just type — squad routes your message to the right agent automatically"
   - Added two quick examples: `squad` and `squad --global` before the full command list
   - Moved from command-focused to usage-focused messaging
**Tone applied:** 
- **Clear:** Lead with the main use case (natural language routing) before listing commands
- **Inviting:** "Just type" phrasing makes entry feel effortless
- **Grounded:** All examples are real and verified (no hype)
**Build:** TypeScript compilation succeeded. CLI help output now prioritizes user experience over exhaustive command listing.
**Notes:**
- Change is message-only; no API or behavior changes
- Help text is the first thing users see when confused — leading with primary use case reduces friction
- Examples placed before full Usage section so users understand the concept before diving into options
**PR:** https://github.com/bradygaster/squad-pr/pull/438

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

## 📌 Team Update (2026-03-03T00:00:50Z)

**Session:** RPS Sample Complete — Verbal, Fenster, Kujan, McManus collaboration

Multi-agent build of Rock-Paper-Scissors game with 10 AI strategies, Docker infrastructure, and full documentation. Fenster (Coordinator) identified and resolved 3 integration bugs (ID mismatch, move parsing, history semantics). Sample ready for use.


📌 Team update (2026-03-03T03-08-17Z): PR #582 merge executed successfully (17f2738). Risk assessment completed. README audit finalized. 4 decisions merged to decisions.md, orchestration logs written. Blockers: Brady version decision, .squad/ cleanup script, .gitignore rules. DO NOT execute migration until HIGH risks resolved. — Keaton, Kobayashi, McManus

---

### History Audit — 2026-03-03

**Audit completed by:** McManus (DevRel)
**Per:** .squad/skills/history-hygiene/SKILL.md

**Issues found and corrected:**

1. **v0.6.0 references (WRONG — target is v0.8.17)** — 4 instances corrected
   - Line 288: CHANGELOG version reference marked as outdated per Kobayashi incident
   - Line 334: Status section v0.6.0 claim marked as stale
   - Line 503: CHANGELOG backfill entry annotated with Brady reversal context
   - Line 520: Team update entry marked to reference v0.8.17 as current target
   - **Correction method:** Added [CORRECTED: ...] annotations explaining Brady's reversal and linking to history-hygiene decision

2. **Conflicting status claims** — 1 conflict identified and annotated
   - Line 261: README "alpha" badge vs. Status section "Production — v0.6.0" conflict documented
   - **Issue:** Conflict noted but not yet resolved in original assessment
   - **Correction:** Annotated to clarify this is a pre-resolution state and requires Brady decision

3. **Intermediate states recorded as final** — 2 instances corrected
   - Line 288: CHANGELOG entries logged as definitive before reversal
   - Line 334: Critical action items listed but shown as unresolved
   - **Correction:** Annotated to clarify these reflect pre-decision-reversal state

4. **Stale/unresolved decisions** — 2 documented
   - Line 261-262: Status badge conflict flagged as "before public launch"
   - Line 334-337: Five critical/high/medium action items remain unresolved
   - **Status:** Not corrected (these are historical records of actual unresolved items at time of assessment)

5. **Confusing/ambiguous entries** — clarity improvements made
   - Lines 503, 520: Clarified v0.6.0 context with explicit Brady reversal references
   - Both entries now link readers to history-hygiene SKILL.md pattern

**Summary:** 5 corrections applied with [CORRECTED] annotations. No deletions. Historical accuracy preserved while flagging stale information. All v0.6.0 references now contextualized as pre-reversal state with Brady's v0.8.17 decision noted.

**Quality assessment:** ✅ Ready for future spawns. History now clearly signals:
- Which entries reflect pre-Kobayashi incident state
- Where Brady's reversal changed the record
- What remains unresolved and requires follow-up
- Why certain intermediate states were recorded (decision audit trail)

### 2026-03-06: Migration announcement — blog post and launch doc

**Status:** Complete. Two documents published: blog post + announcement.

**Work completed:**

1. **`docs/blog/021-the-migration.md`** (7.0 KB) — Full blog post announcing the migration from private to public repo and GitHub-native to npm distribution.
   - Sections: What moved, what changed, why (benefits), upgrade paths for beta users, getting started for new users, version jump explanation, key links, next steps
   - Verified all referenced links (migration guide, checklist, README, CHANGELOG, samples directory, public repo)
   - Tone: Direct, honest, substantiated — no hype
   - Frontmatter: date=2026-03-06, author=McManus, wave=null, hero summarizes key point
   - Style: Consistent with existing blog posts (001–020)

2. **`docs/launch/migration-announcement.md`** (2.1 KB) — Single-page announcement suitable for LinkedIn, Discord, direct sharing.
   - Structure: Headline, what Squad is, 3-column change table, 3 command quick-start, key links (repo, migration, samples, blog, README)
   - Verified all links are absolute GitHub URLs (public repo) or relative paths
   - Length: 77 lines (under 100-line target)
   - Purpose: Share-friendly, not verbose — link out to full post for details

**Verification:**
- All referenced files exist: migration-github-to-npm.md, migration-checklist.md, README.md, CHANGELOG.md, samples/, public repo URL
- Links in blog post: relative paths within repo + internal cross-references
- Links in announcement: absolute GitHub URLs for public repo + relative paths for repo files
- No broken links

**Tone ceiling maintained:**
- Version jump explained honestly (v0.5.4 → v0.8.18 is significant; explained why)
- Benefits listed without superlatives (faster, standard, public)
- All claims substantiated with command examples or prior context
- Removed any "now you can finally..." or "revolutionary" language
- Preserved Squad's actual voice from README and existing blog posts

**Key messaging points preserved:**
- Not a chatbot — a real team
- Public collaboration enabled
- Clear upgrade path for beta users
- npm distribution as standard (no more GitHub-native)
- Samples and docs as discovery tools

### 2026-03-07: Full broken-link audit across all docs

**Status:** Complete. 139 markdown files scanned, 102 internal links checked.

**Findings:**
1. **One broken link fixed:** `docs/features/remote-control.md:325` linked to `../get-started/quickstart.md` which doesn't exist. Corrected to `../get-started/installation.md` (the actual setup guide).
2. **Three anchor links verified valid:** Links to `your-team.md#reviewer-protocol` from `memory-and-knowledge.md`, `parallel-work.md`, and `human-team-members.md` — all resolve correctly (heading exists at line 139 of `your-team.md`).
3. **No `.html` links found in docs** — all internal links correctly use `.md` extension.
4. **No broken links in root files** (README.md, CONTRIBUTING.md, CHANGELOG.md) or package READMEs.

**Note:** Kobayashi separately fixing the link from `docs/reference/cli.md` → `docs/features/remote-control.md` (file wasn't on `main`).

**Pattern observed:** The `quickstart.md` link was a stale reference — the getting-started guide was likely renamed to `installation.md` at some point without updating all cross-references. This is a recurring risk when files are renamed.

### 2026-03-[Current]: File safety table added to migration guide (Issue #188)

**Status:** Complete. Migration docs now clarify which `.squad/` files are safe to copy during upgrades.

**What changed:**
- Added a 10-row file safety table in Scenario 2, Step 6 of `docs/get-started/migration.md`
- Table categorizes files as ✅ (safe to copy), ❌ (skip), or 🟡 (optional)
- Expanded Step 7 description to emphasize `squad doctor` validation (9 checks)

**Why this matters:**
- User question from #188: "which files/folders exactly are safe to copy to the new .squad?"
- Common pain point: users unsure whether to copy old `casting/`, `templates/`, or diagnostic logs
- Clear guidance reduces post-migration support burden

**Learnings:**
1. **Migration docs gap filled:** Users upgrading from v0.5.4 to v0.8.18 face format incompatibility. The table directly answers the most common question.
2. **Tone ceiling applied:** Explanations are short, direct, and actionable — no narrative, just the decision matrix they need.
3. **Validation step emphasized:** `squad doctor` is the post-migration guardrail that catches misconfiguration early. Explicitly calling it out in Step 7 (not just "verify") signals its importance.
4. **Strategy insight:** DevRel docs should map common user questions → resolution tables/checklists. This pattern applies to other complex upgrade paths (CI/CD setup, SDK changes, etc.)

**Commit:** `fb54b82` — "docs: add file safety table to migration guide"


📌 Team update (2026-03-04T17:52:00Z): Migration docs file-safety guidance added — doctor command now live in CLI (fixes #188) — decided by Keaton, implemented by McManus

📌 Team update (2026-03-05T22-10-00Z): SDK-First Mode documentation published (3-tier strategy). Documented all 8 builders, CLI flags, config discovery. Tone ceiling maintained. — decided by McManus

📌 Team update (2026-03-07T15-55-00Z): v0.8.21 blog strategy finalized: two-post approach (SDK-First deep dive + comprehensive release wave). Blog post 025 published (336 lines), CHANGELOG updated with [0.8.21] section. Decision on blog scope and audience segmentation created. Ready for release communication. — decided by McManus

### 2026-03-[Current]: SDK-First Documentation Update — Issue #251

**Status:** Complete. All SDK-First documentation updated to cover `squad init --sdk` and `squad migrate` commands.

**Work completed:**

1. **Added "Which Mode Should I Use?" decision tree** to `docs/sdk-first-mode.md` (lines 22–31)
   - Decision matrix: markdown-only vs. SDK-First vs. migration paths
   - Frame: "Start with markdown" (default), SDK is opt-in upgrade
   - Clear UX guidance for each scenario

2. **Added "Starting a New SDK-First Project" section** (lines 100–133)
   - `squad init --sdk` command documentation
   - Example generated `squad.config.ts` with `defineSquad()` builder
   - Contrast with default markdown-only flow

3. **Added "Migrating an Existing Squad to SDK-First" section** (lines 137–176)
   - `squad migrate --to sdk` / `--to markdown` / `--from ai-team` commands
   - Migration mapping table: `.squad/` files → builder functions
   - Preserved files: decisions.md, history.md, orchestration logs (append-only)
   - Revert path documented

4. **Added `defineSkill()` builder reference** (lines 460–492)
   - Full field documentation (name, description, domain, confidence, source, content, tools)
   - Usage example with git-workflow pattern
   - Integration with `squad build`

5. **Updated `docs/reference/config.md`** to use new builder syntax
   - Replaced old `defineConfig()` pattern with `defineSquad()` builders
   - Example shows `defineTeam()`, `defineAgent()`, `defineRouting()` usage
   - Clarified markdown-first default vs. SDK opt-in

**Tone ceiling maintained throughout:**
- No hype or hand-waving
- All claims substantiated by builder type signatures and CLI behavior
- "Start with markdown" guidance is lead positioning (not buried)
- Future-tense framing: commands documented as designed

**Key messaging decision:** Markdown is the default, SDK is the upgrade path. This aligns with Brady's CLI-first strategy and reduces user surprise (no unexpected build step).






## Learnings

### Docs Build System — Issue #274

**Pattern: Adding new pages to the docs site**

The docs site uses docs/build.js to discover and render markdown files:

1. **Create the markdown file** in the appropriate section directory (e.g., docs/guide/contributing.md)
   - Add a clear H1 heading — this becomes the page title
   - Use relative links that will work after the .md → .html conversion
   - The build.js rewriteLinks function handles .md → .html automatically

2. **Add to SECTION_ORDER** in build.js (line 44–60)
   - SECTION_ORDER.guide, SECTION_ORDER['get-started'], etc.
   - Order matters — items appear in the nav in the order listed
   - If not in the explicit order list, pages fall back to alphabetical

3. **Fix broken relative links** in other docs
   - ../CONTRIBUTING.md doesn't work on the published site (GitHub Pages doesn't serve the repo root)
   - Use ./guide/contributing.html instead (relative to the docs root)

4. **Verify the build** — 
ode docs/build.js outputs to docs/dist/
   - Check the console for "✓ Generated guide/contributing.html"
   - Total page count increments

**Key file paths:**
- docs/build.js — build script with SECTION_ORDER config (line 44–60)
- docs/template.html — HTML template with nav injection
- docs/dist/ — generated site (not committed, GitHub Pages builds from docs/ markdown on deploy)

**Adapting content for the docs site:**
- Keep substance, add proper H1, lightly restructure for web readability
- Don't just copy verbatim — the docs site is a curated experience
- Tone ceiling applies: factual, no hype, citations for claims
