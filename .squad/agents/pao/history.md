# PAO

> Public Affairs Officer

## Core Context

Docs live in docs/ with blog/, concepts/, cookbook/, getting-started/, guide/, features/, scenarios/ sections. Blog tests use filesystem discovery (dynamic); other sections use hardcoded expected arrays. Microsoft Style Guide enforced: sentence-case headings, active voice, second person, present tense. Docs format: plain markdown, H1 title, experimental warning, "Try this" code blocks, overview, HR, H2 content sections. Scannability framework: paragraphs for narrative, bullets for scannable items, tables for comparisons.

## Learnings

📌 **Team update (2026-03-30T00:46:00Z — PRD-120 User Communication Review Verdict: APPROVED WITH RECOMMENDATIONS):** PAO completed user communication, documentation, and migration guidance review for PRD-120. Verdict: **APPROVED WITH RECOMMENDATIONS**. PRD well-researched and technically sound; success hinges on communication and documentation execution. Key messaging validated: "Schedules off by default" = zero cost until user explicitly enables (right choice); opt-in reenablement via `squad schedule enable <id>` discoverable and explicit; backup + restore path signals trust in upgrade safety; cost warning at enable time surfaces trade-off. Four documentation pages required before ship: (1) Migration Guide (`.pre-upgrade` backup restoration, schedule re-enablement walkthrough), (2) Feature Flags User Guide (how to use `features.cronSchedules: true`), (3) Upgrade Release Notes (breaking change with cost implications), (4) Schedule Management Tutorial (`squad schedule list/enable/disable` reference). Key messaging points: "Scheduled triggers are disabled by default. Run `squad schedule enable <id>` to activate." + "Enabling scheduled triggers will consume GitHub Actions minutes." Recommendation: Assign documentation sprints in parallel with code work. Review all user-facing messages (FR-1.4, FR-2.3, FR-4.2) before code review. Full review filed at `.squad/orchestration-log/2026-03-30T00-46-prd120-review/PAO.md`. Decision merged to decisions.md.

### Discussion Triage Patterns (2026-03-23 Release Incident)
**Context:** v0.9.1 release completed; 15 open discussions analyzing whether community response patterns matched feature releases.

**Pattern identified:** Feature releases without follow-up discussion closes = missed trust opportunity. When you ship features (personal squad, worktrees, economy mode, rate limiting), search discussions for matching feature-requests → respond + close proactively. This signals to community that you listen.

**Triage workflow:**
1. Map new features to open discussions (which discussions are solved by this release?)
2. Respond: "This feature is now available in v0.9.1. See docs link."
3. Close as resolved
4. Consolidate: if discussion #463 is duplicate of #402, merge responses into #402, close #463
5. Convert: if discussion reveals a bug or roadmap item, convert to issue with label (e.g., squad:eecom)
6. Keep: if discussion is feedback or edge case, keep open; respond substantively

**For v0.9.1 release:** 4 closed, 1 consolidated, 2 converted to issue, 8 kept. Result: community sees responsiveness; discussions become productivity tool, not backlog.

**Critical finding:** Teams MCP docs need urgent update — Office 365 Connectors deprecated Dec 2024. Docs must purge old connector references and document Power Automate Workflows path (new successor).

### Chinese README Workflow (2026-03-23 Release Incident)
Community contributor (PR #572) provided Chinese README translation. Approved and merged as part of v0.9.1 release. Pattern: accept community translations; list contributors in CONTRIBUTORS.md; acknowledge in release notes.

### Teams MCP Urgency Pattern (2026-03-23)
External tool integrations deprecate. Office 365 Connectors retired Dec 2024. Docs mentioning deprecated tools create support burden and user confusion. Action: audit all external tool integration docs for deprecation; update with successor guidance (Power Automate Workflows for Teams).

### Blog Post Format
YAML frontmatter: title, date, author, wave, tags, status, hero. Body: experimental warning, What Shipped, Why This Matters, Quick Stats, What's Next. 200-400 words for infrastructure releases. No hype — explain value.

### Boundary Review Heuristic
"Squad Ships It" litmus test: if Squad doesn't ship the code/config, it's IRL content. Platform features used alongside Squad: clarify whose feature it is. Squad behavior/config docs stay. External infrastructure docs (ralph-operations, proactive-communication) → IRL.

### DOCS-TEST SYNC
When adding docs pages, update test assertions in docs-build.test.ts in the SAME commit. When rebasing doc PRs, main branch (already merged) takes priority.

### Contributor Recognition
CONTRIBUTORS.md tracks team roster and community contributors. Each release includes recognition updates. Append PR counts, don't replace.

### Skill Scope Documentation Pattern
Explicitly state what a skill produces and does NOT produce. Deterministic skills prevent agents from generating unnecessary code when templates exist.

### Teams MCP Audit
External tool integrations require explicit "where to get it" guidance. Placeholder paths need clarification that users must provide actual MCP server implementations.

### Cross-Org Authentication Docs
Problem/solution structure for multi-account auth: gh auth switch, Copilot instructions, Squad skill pattern. Cover credential helpers, EMU variations, common error messages. Cross-reference in troubleshooting and enterprise-platforms pages.

### Roster & Contributor Recognition (v0.8.25)
Squad moved to Apollo 13/NASA Mission Control naming scheme (Flight, Procedures, EECOM, FIDO, PAO, CAPCOM, CONTROL, Surgeon, Booster, GNC, Network, RETRO, INCO, GUIDO, Telemetry, VOX, DSKY, Sims, Handbook). CONTRIBUTORS.md tracks both team roster and community contributors; contributor table entries grow with PRs (append PR counts rather than replace, maintaining attribution history).

### Git Rebase for Doc Merges
When rebasing doc PRs with conflicts from other merged doc PRs, the main branch version (already merged) should generally take priority. For Node.js version references, maintain LTS terminology when present (e.g., `nvm install --lts` over specific version numbers like `nvm install 20`). Conflict resolution pattern: preserve new content from PR branch only where it doesn't duplicate or contradict already-merged changes. Use `git -c core.editor=true rebase --continue` to bypass interactive editor issues on Windows.

### Astro Docs Format (v0.8.26)
Squad docs use plain markdown without Astro frontmatter. Structure: title (H1), experimental warning callout, "Try this" code blocks at top, overview paragraph, horizontal rule, then content sections with H2 headings. Microsoft Style Guide enforced: sentence-case headings, active voice, second person ("you"), present tense, no ampersands except in code/brand names. Features and scenarios directories added to test coverage in docs-build.test.ts. Reference implementations linked where available (e.g., ralph-watch.ps1 for operational patterns).

### Proactive Communication Patterns (v0.8.26)
Two-way communication layer between Squad and work environment. Outbound: Teams webhook notifications (breaking, briefings, recaps, flashes) sent via Adaptive Cards — only when newsworthy. Inbound: WorkIQ/Playwright scanning of Teams channels and email → auto-create GitHub issues with teams-bridge label, anti-duplicate logic enforced. Loop: inbound creates issues → Ralph dispatches → agents work → outbound notifies results. Human stays informed on mobile. Prerequisites are enhancements, not requirements.

📌 **Team update (2026-03-11T01:27:57Z):** Proactive communication patterns and PR trust levels (full/selective/self-managing spectrum) documented in decisions.md. Pattern rationale reinforced: Ralph 24/7 autonomous deployment requires awareness loop (Teams webhooks for outbound) and external work integration (WorkIQ scanning for inbound). Trust levels enable context-appropriate oversight without bottlenecking teams.

### PR #487 Review & Merge — CLI Docs Expansion (2026-03-22)

Reviewed and merged PR #487 (CLI documentation expansion + broken docs link fix). Improved CLI command reference coverage and fixed internal link validation.

**Pattern identified:** Broken internal links hurt user navigation and SEO. Recommendations: (1) add link validation to docs build pipeline (crawl all internal references, report 404s), (2) make validation a CI gate (fail build on broken links), (3) maintain link checklist when refactoring docs structure.

**Key learning:** Documentation maintenance requires systematic link validation. A single broken link creates friction for users following guides. Automated validation should be non-negotiable in CI/CD.

### PR #482 Review & Merge — Pagefind Search Integration (2026-03-22)

Reviewed and merged PR #482. Search functionality integrated into docs site for improved discoverability.

### PR #11 Docs Quality Review — TypeDoc API Reference (2026-03-24)

**Status:** REQUEST CHANGES (3 fixes required, 2 recommended)

**Key findings:**
- **Research + PRD:** Excellent quality. Clear problem statement, realistic effort estimate, pragmatic tool choice (TypeDoc over Starlight/api-extractor). Scannability framework applied correctly (tables for audit data, bullets for findings, paragraphs for narrative).
- **Navigation strategy:** Collapsible `<details>` approach for 395-page API reference is sound UX. Sidebar nav plan well-structured with clear open questions about CI/CD safety.
- **Microsoft Style compliance:** Mostly strong; discovered 3 minor issues.

**Issues found:**
1. **🔴 Blocking:** sdk.md crosslink banner missing. Users navigating from curated "SDK" guide have no callout to the auto-generated "API Reference". Add "See Also" link in sdk.md before "## Resolution" section.
2. **🔴 Blocking:** Navigation URL inconsistency. `navigation.ts` hardcodes `reference/api/index` when it should be `reference/api` — Astro resolves `/api/` to `/api/index` automatically. Simplify slug.
3. **🟡 Blocking:** Nav plan's "Open Questions" section asks about CI/CD fallback (generated JSON missing). Plan should either specify build order (`docs:api` before `docs build`) or provide fallback empty nav for fresh clones.
4. **🟡 Recommended:** 2–3 test descriptions need more specificity (e.g., "class page renders heading and content" → "class page renders method signatures and definition source").
5. **🟡 Recommended:** Screenshot filenames don't align with skill convention. Use semantic names: `api-reference-landing`, `api-class-detail`, `api-function-detail`.

**Pattern identified:** Generated documentation requires crosslinks from curated guides. When adding a new docs section (API reference, CLI reference, etc.), ensure the *old* curated page (SDK Guide) has a visible pointer to the new section. This prevents users from stopping at the curated version and missing the comprehensive auto-generated reference.

**Effort to fix:** < 2 hours. All issues are surgical edits to existing content; no architectural changes needed.

### PR #484 Review & Merge — Sample READMEs (2026-03-22)

Reviewed and merged PR #484. Sample README templates added to improve consistency across documentation examples.

### PR Trust Model Documentation (v0.8.26)
Three trust levels for PR management: (1) Full review (default, team repos) — human gate on every merge; (2) Selective review (personal projects with patterns) — human reviews only critical paths; (3) Self-managing (solo personal repos only) — Squad merges own PRs, human reviews retroactively. Added to reviewer-protocol.md as new section. Important: self-managing ≠ unmonitored; use Ralph work monitoring and Teams notifications for awareness. Decision matrix included for when to use each level.

### Final Docs Review Pattern (v0.8.26)
Pre-PR quality reviews check: (1) Microsoft Style Guide compliance (sentence-case headings, active voice, no ampersands, present tense, second person); (2) Tone consistency (practical, developer-focused, no hype); (3) Technical accuracy (code examples, file paths, commands); (4) Cross-reference integrity (valid links between pages); (5) DOCS-TEST SYNC (test assertions match new pages); (6) Privacy directive compliance (no individual repos without consent). Fixed duplicate section heading in reviewer-protocol.md (merge artifact). All staged docs passed review and are ready to commit.

### Squad vs IRL Boundary Review (v0.8.26)
Evaluated four docs pages from PR #331 (Tamir's blog analysis) against Squad-specificity criterion: does content document Squad features/patterns (belongs in Squad docs) or community implementation examples (belongs in Squad IRL)? Key distinction: Squad docs = "how the feature works + universal best practices" vs IRL = "how one person built an amazing setup." Results: ralph-operations.md borderline (deployment wrappers are external infrastructure, not Squad features — trim "outer loop" framing), issue-templates.md borderline (GitHub feature documented for Squad context, not Squad code — clarify scope), proactive-communication.md does not belong (community extension pattern using WorkIQ/Playwright, not built into Squad), reviewer-protocol.md trust levels section belongs (documents user choice spectrum within Squad's existing review system). Pattern: if Squad doesn't ship the code, it's IRL content; if it's a GitHub platform feature used alongside Squad, clarify that distinction; if it documents actual Squad behavior/configuration, it belongs.

### Boundary Review Execution (v0.8.26)
Executed boundary review findings from PR #331: (1) Deleted ralph-operations.md (infrastructure around Squad, not Squad itself — moved to IRL); (2) Deleted proactive-communication.md (external tools/webhooks — moved to IRL); (3) Reframed issue-templates.md intro to clarify "GitHub feature configured for Squad" not "Squad feature"; (4) Updated EXPECTED_SCENARIOS in docs-build.test.ts to match remaining files. Pattern reinforced: boundary review = remove external infrastructure docs, reframe platform integration docs to clarify whose feature it is, keep Squad behavior/config docs. Changes staged for commit.

### Cross-Org Authentication Docs (v0.8.26)
Created docs/src/content/docs/scenarios/cross-org-auth.md covering GitHub personal + Enterprise Managed Users (EMU) multi-account auth. Three solutions documented: (1) gh auth switch for manual account toggling; (2) Copilot instructions (.github/copilot-instructions.md) for account mapping documentation; (3) Squad skill pattern for auth error detection and recovery. Covered git credential helpers (per-host and per-org), EMU hostname variations (github.com vs dedicated instances), and common error messages (HTTP 401, authentication required). Added cross-references in troubleshooting.md (new section), enterprise-platforms.md (authentication section), and navigation.ts. Updated test/docs-build.test.ts with 'cross-org-auth' in EXPECTED_SCENARIOS. Pattern: Microsoft Style Guide (sentence-case), "Try this" prompts at top, problem/solution structure, practical examples over abstractions, links to related pages at bottom.

### Scannability Framework (v0.8.25)
Format selection is a scannability decision, not style preference. Paragraphs for narrative/concepts (3-4 sentences max). Bullets for scannable items (features, options, non-sequential steps). Tables for comparisons or structured reference data (config, API params). Quotes/indents for callouts/warnings. Decision test: if reader hunts for one item in a paragraph, convert to bullets/table. This framework is now a hard rule in charter under SCANNABILITY REVIEW.

### Docs Catalog Audit (2026)
Full audit of the Astro-based docs site. Key patterns and findings:

**Orphaned pages (exist but not in navigation.ts):** 15 total — `get-started/choose-your-interface.md`, `guide/faq.md`, `guide/build-autonomous-agent.md`, `guide/github-auth-setup.md`, `features/built-in-roles.md`, `features/context-hygiene.md`, `features/cost-tracking.md`, `features/issue-templates.md`, `reference/vscode-troubleshooting.md`, and 6 root-level legacy files (`guide.md`, `sample-prompts.md`, `tips-and-tricks.md`, `tour-first-session.md`, `tour-github-issues.md`, `tour-gitlab-issues.md`).

**Stale content:** `whatsnew.md` reports v0.8.2 as current; actual is v0.8.26+. `insider-program.md` uses deprecated `npx github:` install format and references old `.ai-team/` directory name throughout.

**Duplicate/overlap pairs:** `choosing-your-path.md` (in nav) vs `choose-your-interface.md` (orphan, more complete); root-level `sample-prompts.md` vs `guide/sample-prompts.md`; root-level `tips-and-tricks.md` vs `guide/tips-and-tricks.md`; root-level `tour-first-session.md` vs `get-started/first-session.md`.

**Content quality:** All actively-navved pages are well-written, follow Microsoft Style Guide, and use correct install commands. Format standards (H1, experimental callout, "Try this" block, HR, H2 sections) are inconsistently applied — some orphaned pages like `built-in-roles.md` and `cost-tracking.md` lack the standard header/callout pattern.

**Structural issues:** `features/team-setup.md` has a duplicate `## How Init Works` heading (merge artifact). `features/streams.md` nav title is "Streams" but H1 is "Squad SubSquads" (mismatch). `guide/faq.md` is a high-value page completely invisible from the sidebar. `features/built-in-roles.md` is a comprehensive roles reference also invisible from nav.

**Gap:** No dedicated FAQ entry point, no changelog page, cookbook section is thin (one page), no user-facing explanation of the NASA Mission Control naming scheme for agents.

**Navigation:** Zero dead nav links (every nav slug has a matching file). All orphan pages are linked internally from other pages so they are reachable — but not browseable via sidebar.

📌 **Team update (2026-03-22T12:46:00Z):** Booster implemented automated version sync for `whatsnew.md` (finding #1). Script reads `package.json` version, updates "Current Release" heading on every prebuild, with Vitest test gate. Heading now correct (v0.8.25+), will stay in sync automatically on all future builds. Finding #1 resolved.

### JSDoc API Reference Research (2026-03-23)

Completed research on generating JSDoc-based API reference documentation for Squad SDK. Key findings:

**Current State:** Squad SDK has 60–80% JSDoc coverage across major modules (state: 81%, config: 8%). 136 TypeScript source files, no existing TypeDoc config.

**Tool Recommendation:** **TypeDoc + typedoc-plugin-markdown** — no Starlight migration needed. Seamless integration with existing Astro 5 + Tailwind 4 + Pagefind. Markdown output drops directly into content collections. Auto-generates via Astro integration hook on `npm run build`.

**Alternatives Evaluated:** 
- ❌ Starlight migration: would break existing docs structure and custom branding
- ❌ api-extractor: overkill for open-source SDK; designed for strict monorepo contracts

**Effort Estimate:** 5–6 hours (setup only) → 13–18 hours (setup + JSDoc improvements) → 15–22 hours (with CI/CD automation).

**StorageProvider & State Module:** Phase 2 state layer is API-docs ready (81% coverage, well-structured types, clear interface contract). Gaps: add @param/@return tags to state/io functions.

**URL Structure:** `/api/classes/squad-coordinator/`, `/api/interfaces/storage-provider/`, etc. Pagefind indexes automatically.

**Deliverable:** Full research at `docs/research/jsdoc-api-reference-research.md` with configuration templates, implementation roadmap (4 phases), and tool comparison matrix. Decision summary at `.squad/decisions/inbox/pao-jsdoc-research.md`.

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

PAO assigned:
- **#488 (GitHub auth setup for project boards)** → squad:pao (documentation, newly filed)
- **#478 (Polish REPL)** → squad:vox + squad:pao (shell UX readiness + README documentation gate)
- **#476 (Guide v0.4.1 update)** → squad:handbook + squad:pao (SDK patterns + documentation)

New issue #488 is documentation-focused; Fleet relabeled from squad:fido → squad:pao for proper domain ownership.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. PAO owns GitHub auth docs (#488), REPL documentation gate (#478), and Guide v0.4.1 refresh (#476). High community value on Guide update. Ready to begin documentation work on next sprint.
### npx Purge + Agency Audit
Brady's distribution directive: `npm install -g @bradygaster/squad-cli` is the only supported install path. Remove ALL user-facing `npx @bradygaster/squad-cli` and `npx github:bradygaster/squad` references from docs. Replace with either `npm install -g` (for install steps) or `squad <command>` (for usage steps). Keep `npx` only for dev tools (changeset, vitest, astro, pagefind). Keep historical blog posts as-is. Migration.md "Before" column and CI/CD "OLD" examples are valid historical context — keep them. Insider program: `npm install -g @bradygaster/squad-cli@insider` and `squad upgrade` replace the old `npx github:bradygaster/squad#insider`. Agency audit: all "agency-agents" references in source files and docs are MIT attribution for the upstream open-source project — legally required, never touch them. The `agency copilot` example in cli-entry.ts help text was a competing-product reference — changed to `gh copilot`.

### README Slimming + Upgrade Section (v0.8.x)
Brady directive: README was too long at 512 lines. Cut the SDK deep-dive block (custom tools, hook pipeline, Ralph API code) and replaced it with a compact pointer to the docs site. Added a dedicated "Upgrading" section (two-step: `npm install -g` then `squad upgrade`) after Quick Start. Final length: 331 lines. SDK internals live in `docs/src/content/docs/reference/sdk.md` and `tools-and-hooks.md`. The README is now discovery/orientation; the docs site is the full reference.

### v0.9.0 Release Blog Post (2026-03-23)
Created `docs/src/content/blog/028-v090-whats-new.md` documenting Squad's biggest release: Personal Squad (ambient agent discovery + Ghost Protocol), Worktree Spawning (isolated branches per issue), Machine Capability Discovery (needs:* label routing), Cooperative Rate Limiting (predictive circuit breaker), Economy Mode (budget-aware model selection), Auto-Wired Telemetry, P0 upgrade fixes, and docs refresh. Blog format: frontmatter (title/date/author/wave/tags/status/hero) → experimental warning → "What Shipped" (10 features with H2 sections + callout boxes) → "Quick Stats" → "Breaking Changes" (none) → "Upgrading" → "What's Next". Messaging: clear, engaging, factual (no marketing fluff). Demonstrated: Personal Squad governance layer, worktree isolation, capability declaration, RAAS traffic-light pattern, economy fallback logic. Docs refresh section emphasized: README from 512→218 lines, dedicated upgrade guide, npx purged, Astro features, Teams MCP refresh, autonomous agents guide. Contributors: diberry (worktree tests + docs), wiisaacs (security review), community. No breaking changes — all additive opt-in features. Test discovery is dynamic (EXPECTED_BLOG uses filesystem scan), so new post auto-discovered; no test file changes needed. Pattern reinforced: each feature needs a story — if you can't explain it, it's not ready. Demos over descriptions (concrete code examples, YAML config blocks, Bash CLI examples).

### Discussion Triage (2026-03-23)

Analyzed 15 open discussions for response strategy:
- **4 close-as-resolved** (#143, #169 — features now shipped; #402, #299 — answered with docs links)
- **1 close-as-duplicate** (#463 → #402)
- **2 convert-to-issue** (#161 root-copilot-hijack → bug/UX track; #534 enterprise-features → ongoing roadmap signal)
- **8 keep-open** (ongoing feedback, feature signals, edge cases, follow-up potential)

Key pattern: 15 discussions = 7 feature-request/feedback signals, 4 answered-by-feature-release, 4 documentation-clarity gaps. Community is engaged; v0.9.1 (per-agent models, skills system, human team members, watch mode) directly addressed 5+ discussions that were open for 2-4 weeks. Timing of releases + follow-up responses critical for community trust.

**Documentation gaps identified:**
- #440 (branch naming convention change) — needs migration guide in upgrade docs
- #306 (multi-root workspaces) → future feature; docs should clarify current limitation
- #140 (Teams MCP + Office 365 Connectors retirement) → docs refresh needed; Power Automate Workflows is the new path
- #401 (mobile/remote control) → feature exploration, keep on radar
- #161 (Coordinator hijacking) → document workarounds, prioritize UX fix for v1.0

Teams MCP critical update: Office 365 Connectors retired Dec 2024 → Power Automate Workflows is successor. Docs mention of old Connectors should be purged; Teams webhook examples should link to Power Automate Workflow guide.

### Community Engagement Wave (2026-03-24)

**6 discussions closed as resolved:**
- #463, #402 (per-agent model selection — shipped v0.9.1)
- #324 (local-only operation without GitHub integration)
- #299 (CLI vs Copilot agent — both viable)
- #143 (Human team members now first-class feature)
- #169 (Skills system shipped as core infrastructure)

**8 discussions kept open with substantive replies:**
- #534 (enterprise features) — asked clarifying questions on scope
- #499 (Brady's v1.0 announcement) — explained `.squad/` regenerability plan
- #440 (branch naming change) — acknowledged disruption, offered migration guidance
- #401 (mobile/async control) — acknowledged use case, roadmap signal
- #376 (best practices) — provided triage and routing patterns
- #306 (multi-root support) — acknowledged limitation, kept open for feedback
- #95 (casting system) — explained mature re-casting flow
- #140 (Teams MCP) — critical guidance on Office 365 Connectors retirement → Power Automate Workflows

**Pattern observed:** Feature-release timing + follow-up responses critical for community trust. v0.9.1 directly addressed 5+ discussions (models, skills, human members) that were open 2-4 weeks. Community triage now operational: 14 discussions reviewed, 6 closed, 8 kept active = 43% closure rate on resolved items.

**Key insight:** Retirement of Microsoft Office 365 Connectors (Dec 2024) caught users mid-setup. Proactive notification of Teams Workflows alternative + Power Automate guidance essential for Teams MCP users.

### Release Playbook Rewrite (#564, 2026-07-22)

**Task:** Rewrite PUBLISH-README.md from a v0.8.22 version-specific stub (58 lines) into a living, version-agnostic release playbook.

**Outcome:** 232-line playbook replacing entirely with 11 sections per Flight's spec:
1. Overview — two publish channels, package order (SDK → CLI)
2. Pre-Flight Checklist — runnable checklist with `grep`/`npm` commands
3. Publish via CI (Recommended Path) — GitHub Release workflow
4. Publish via workflow_dispatch — manual trigger fallback
5. Insider Channel — insider branch + `@insider` tag for testing
6. Workspace Publish Policy — reference to CI lint rule #557 (enforces `-w` flag)
7. Manual Local Publish — emergency fallback with step-by-step commands
8. 422 Race Condition & npm Errors — v0.9.1 incident + troubleshooting
9. Post-Publish Verification — `npm view` + npx cold-install test
10. Version Bump After Publish — preview version increment pattern
11. Legacy Publish Scripts — deprecation notice for PowerShell scripts

**Key decisions:**
- Microsoft Style Guide enforced: sentence-case headings, active voice, "you" not "we", present tense
- Version-agnostic: `<VERSION>` placeholder, no hardcoded version numbers
- Scannability: checklist format, code blocks (bash not PowerShell for portability), tables for error reference
- Accuracy: pulled from actual workflows (`squad-npm-publish.yml`, `squad-insider-publish.yml`) — preflight job, smoke test, publish stages, registry propagation retry logic (5× 15-second intervals)
- Runnable: all commands copy-pasteable (e.g., `npm -w packages/squad-sdk pack --dry-run`)

**Pattern:** Living playbook absorbs three related issues (#558 race conditions, #559 manual publish, #560 pre-flight checklist) into unified reference. No separate documents; all under one decision tree: try CI first, use manual only if CI broken. Workspace publish policy section references CI lint rule #557 (being added in parallel by FIDO); both docs + lint create enforcement + education.

**Commit:** `docs: rewrite PUBLISH-README.md as release playbook (#564)` on squad/release-hardening branch.

📌 **Team update (2026-03-24T06-release-hardening):** Release playbook rewrite (#564) completed. PUBLISH-README.md transformed from v0.8.22 stub to living 232-line playbook with 11 sections: Overview, Pre-Flight Checklist, Publish via CI (recommended), Publish via workflow_dispatch, Insider Channel, Workspace Publish Policy, Manual Local Publish (emergency fallback), 422 Race Condition & npm Errors, Post-Publish Verification, Version Bump After Publish, Legacy Publish Scripts. Absorbed issues #558, #559, #560 into unified decision tree. Microsoft Style Guide enforced; version-agnostic; all commands runnable. Scannability: checklist format, bash code blocks, error reference table. Committed to squad/release-hardening.
### JSDoc API Reference PRD (2026-03-24)

Completed full PRD based on research findings. **Document:** `docs/research/jsdoc-api-reference-prd.md`.

**Structure (8 major sections):**
1. Problem Statement — 5 concrete gaps (no dedicated API ref, uneven JSDoc coverage, discoverability, StorageProvider docs lag, Pagefind misses API symbols)
2. Goals & Success Metrics — 4 primary goals, 8 measurable targets (100% JSDoc coverage, 50+ auto-documented symbols, searchable API)
3. Key User Scenarios — 4 personas (SDK consumer, contributor, agent author, evaluator) with today vs future workflows
4. Scope — clear in/out boundaries (TypeDoc + JSDoc improvements in; CLI ref gen, Starlight migration, multi-version docs out)
5. Approach — architecture (TypeDoc in Astro hook), config template (typedoc.json), output/URL structure, build integration code, JSDoc improvement plan with effort table
6. Implementation Phases — 4 phases: Phase 0 (setup/PoC, 1–2 days), Phase 1 (JSDoc audit, 5–6 hrs), Phase 2 (integration/nav, 3–4 hrs), Phase 3 (CI/CD optional, 2–4 hrs)
7. Risks & Mitigations — 7 risks (TypeDoc breaks on changes, stale markdown, link validation strictness, Pagefind misses, config maintenance, build perf, breaking changes) with specific mitigations
8. Architecture Review section — 4 items for CONTROL to review (TypeScript export strategy, TypeDoc config, JSDoc standards, stability commitments)

**Key decisions baked into PRD:**
- TypeDoc + typedoc-plugin-markdown (not Starlight, not api-extractor) — zero migration, Markdown-first, Pagefind-compatible
- Astro integration hook auto-runs TypeDoc on build (single step: `npm run build`)
- Generated output goes to docs/src/content/docs/reference/api/ (one file per symbol)
- JSDoc improvement priority: config/schema.ts (8% → 100%), state/io/ functions (@param/@return tags), StorageProvider interface audit
- Total effort: 13–18 hours (8–12 JSDoc + 5–6 setup)

**Style & Tone:**
- Written for Flight-level review/approval (actionable, opinionated, specific)
- Includes code examples (typedoc.json, Astro hook, JSDoc template)
- References research doc for detailed findings
- PRD as decision/commitment document — not advisory, but directive

**Learnings:**
- PRD structure differs from research (research = exploratory findings/options; PRD = chosen path + tactical roadmap)
- Recommendation section in PRD serves as binding decision (TypeDoc chosen, rationale locked in)
- Architecture Review section ensures TypeScript team reviews export strategy and JSDoc standards early — prevents rework later
- Four-phase approach breaks large effort into digestible increments (Phase 0 validation before JSDoc audit helps mitigate risk of TypeDoc setup failing)

**Decision:** PRD approved for handoff to implementation team. Ready for execution on next sprint.

### PRD-120 Review: Cron Disable, Feature Change Management (2026-06-25)

**Context:** Flight authored PRD-120 to solve cost problem (silent GitHub Actions minute burn) via three interconnected capabilities: (1) Cron disable on init/upgrade, (2) CI gating to prevent reintroduction, (3) Feature change management system. Assigned to PAO for user communication + docs impact review.

**DevRel Review Outcome:** APPROVED WITH RECOMMENDATIONS. PRD is technically sound and strategically important. Success depends entirely on execution of messaging, documentation, and feature flag system.

**Key findings:**

1. **Behavioral change = communication burden.** PRD introduces a default change (cron off → on requires explicit action). Users upgrading v0.9.x → v0.10.0 will see quiet workflows. Without proactive messaging, support volume will spike with "why did my cron stop?" questions. Solution: multi-channel messaging (blog, upgrade output, CHANGELOG, docs) + feature flag escape hatch (set `features.cronSchedules: true`).

2. **Documentation scope is large.** Four new guides required: (1) schedule-management.md (how to enable/disable cron), (2) upgrade-v0.10.0-behavioral-changes.md (migration runbook), (3) feature-flags.md concept page (explain new system), (4) ci-cron-gate.md reference (gate configuration). Plus updates to README, scheduler guide, init guide. Docs must ship in parallel with code (not after). **Recommendation:** Assign docs sprint concurrently with implementation, target merge 1 week before v0.10.0 release.

3. **Multi-repo friction unaddressed.** PRD identifies that users with 10+ repos need to run `squad upgrade` on each repo (cannot bulk-apply schedules). Risk table marks this as "high likelihood, medium severity" but no mitigation beyond "document pattern." Solution: Add guidance to upgrade guide with script template example + link to future #98 (bulk tooling). Prevent support burden by acknowledging the pain point upfront.

4. **Feature flag deprecation timeline missing.** PRD introduces `features.cronSchedules` flag but doesn't state when it deprecates/removes. This matters for trust: users need to know they can safely override defaults and have a runway before the override breaks. **Recommendation:** Add sunset dates to PRD (e.g., "Deprecated in v0.12.0, removed in v0.13.0") and communicate via JSDoc + docs.

5. **Upgrade output is primary discovery mechanism.** Most existing users won't read blog or CHANGELOG before running `squad upgrade`. The upgrade command's console output is the critical moment to explain what changed + why + how to restore. PRD's upgrade report format is good; messaging tone must emphasize "this is safe" not "we disabled your stuff."

**Pattern identified:** For behavioral changes, DevRel's job is not to rubber-stamp but to surface user communication debt early. If a feature change lacks clear messaging, docs, feature flag escape hatch, or migration path, escalate before implementation. The cost of poor release messaging (support tickets, trust erosion) is 10× the cost of spending 1 extra week on docs.

**Messaging strategy (recommended framing):**
- **Core:** "Squad now ships with safe defaults. Schedules are off by default — you're in control."
- **Pillar 1:** Safety first (prevent accidental Actions minute burn)
- **Pillar 2:** Control (opt in only what you need)
- **Pillar 3:** Transparency (we changed this because it protects you)
- **Escape hatch:** Feature flag for users who want v0.9.x behavior
- **Timeline:** Deprecation schedule communicated upfront

**Decision gates for Ship Readiness (PAO sign-off required):**
- ✅ All 4 docs pages drafted and reviewed
- ✅ Blog post emphasizes "safe defaults" not "breaking change"
- ✅ CHANGELOG has `⚠️ Behavioral Changes` section
- ✅ Feature flag system includes deprecation timeline
- ✅ Upgrade command output tested for readability
- ✅ Multi-repo migration guidance in docs
- ✅ Feature flag escape hatch tested and documented

If gates are not met by release candidate build, delay release by 1 week for docs. Documentation quality directly impacts user trust in behavioral changes.

**Next step:** Flight to confirm implementation + docs sprint timeline. Assign PAO to blog post draft review.
