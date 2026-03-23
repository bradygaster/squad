# PAO

> Public Affairs Officer

## Core Context

Docs live in docs/ with blog/, concepts/, cookbook/, getting-started/, guide/, features/, scenarios/ sections. Blog tests use filesystem discovery (dynamic); other sections use hardcoded expected arrays. Microsoft Style Guide enforced: sentence-case headings, active voice, second person, present tense. Docs format: plain markdown, H1 title, experimental warning, "Try this" code blocks, overview, HR, H2 content sections. Scannability framework: paragraphs for narrative, bullets for scannable items, tables for comparisons.

## Learnings

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
