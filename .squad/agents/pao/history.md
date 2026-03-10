# PAO

> Public Affairs Officer

## Learnings

### Docs Build Architecture
docs/ directory contains blog/, concepts/, cookbook/, getting-started/, guide/ sections. Build script produces HTML output for all sections. Blog posts follow numbered naming convention (001-xxx.md through 026-xxx.md).

### Dynamic Blog Test Pattern
docs-build.test.ts discovers blog posts from filesystem instead of hardcoded list. Adding/removing blog posts no longer requires test updates. Other sections (getting-started, guides) still use hardcoded expected lists since they change rarely.

### Contributor Recognition
CONTRIBUTING.md and CONTRIBUTORS.md exist at repo root. Contributors Guide page added in v0.8.24. Each release should include contributor recognition updates.

### Blog Post Format (v0.8.25)
Release blog posts use YAML frontmatter with: title, date, author, wave, tags, status, hero. Hero is one-sentence summary. Body includes experimental warning, What Shipped section with tables/code blocks, Why This Matters section, Quick Stats, What's Next. Keep practical and developer-focused, 200-400 words for infrastructure releases. Tone ceiling enforced: no hype, explain value.

### Roster & Contributor Recognition (v0.8.25)
Squad moved to Apollo 13/NASA Mission Control naming scheme (Flight, Procedures, EECOM, FIDO, PAO, CAPCOM, CONTROL, Surgeon, Booster, GNC, Network, RETRO, INCO, GUIDO, Telemetry, VOX, DSKY, Sims, Handbook). CONTRIBUTORS.md tracks both team roster and community contributors; contributor table entries grow with PRs (append PR counts rather than replace, maintaining attribution history).

### Git Rebase for Doc Merges
When rebasing doc PRs with conflicts from other merged doc PRs, the main branch version (already merged) should generally take priority. For Node.js version references, maintain LTS terminology when present (e.g., `nvm install --lts` over specific version numbers like `nvm install 20`). Conflict resolution pattern: preserve new content from PR branch only where it doesn't duplicate or contradict already-merged changes. Use `git -c core.editor=true rebase --continue` to bypass interactive editor issues on Windows.

### Astro Docs Format (v0.8.26)
Squad docs use plain markdown without Astro frontmatter. Structure: title (H1), experimental warning callout, "Try this" code blocks at top, overview paragraph, horizontal rule, then content sections with H2 headings. Microsoft Style Guide enforced: sentence-case headings, active voice, second person ("you"), present tense, no ampersands except in code/brand names. Features and scenarios directories added to test coverage in docs-build.test.ts. Reference implementations linked where available (e.g., ralph-watch.ps1 for operational patterns).

### Proactive Communication Patterns (v0.8.26)
Two-way communication layer between Squad and work environment. Outbound: Teams webhook notifications (breaking, briefings, recaps, flashes) sent via Adaptive Cards — only when newsworthy. Inbound: WorkIQ/Playwright scanning of Teams channels and email → auto-create GitHub issues with teams-bridge label, anti-duplicate logic enforced. Loop: inbound creates issues → Ralph dispatches → agents work → outbound notifies results. Human stays informed on mobile. Prerequisites are enhancements, not requirements.

### PR Trust Model Documentation (v0.8.26)
Three trust levels for PR management: (1) Full review (default, team repos) — human gate on every merge; (2) Selective review (personal projects with patterns) — human reviews only critical paths; (3) Self-managing (solo personal repos only) — Squad merges own PRs, human reviews retroactively. Added to reviewer-protocol.md as new section. Important: self-managing ≠ unmonitored; use Ralph work monitoring and Teams notifications for awareness. Decision matrix included for when to use each level.

### Final Docs Review Pattern (v0.8.26)
Pre-PR quality reviews check: (1) Microsoft Style Guide compliance (sentence-case headings, active voice, no ampersands, present tense, second person); (2) Tone consistency (practical, developer-focused, no hype); (3) Technical accuracy (code examples, file paths, commands); (4) Cross-reference integrity (valid links between pages); (5) DOCS-TEST SYNC (test assertions match new pages); (6) Privacy directive compliance (no individual repos without consent). Fixed duplicate section heading in reviewer-protocol.md (merge artifact). All staged docs passed review and are ready to commit.

### Squad vs IRL Boundary Review (v0.8.26)
Evaluated four docs pages from PR #331 (Tamir's blog analysis) against Squad-specificity criterion: does content document Squad features/patterns (belongs in Squad docs) or community implementation examples (belongs in Squad IRL)? Key distinction: Squad docs = "how the feature works + universal best practices" vs IRL = "how one person built an amazing setup." Results: ralph-operations.md borderline (deployment wrappers are external infrastructure, not Squad features — trim "outer loop" framing), issue-templates.md borderline (GitHub feature documented for Squad context, not Squad code — clarify scope), proactive-communication.md does not belong (community extension pattern using WorkIQ/Playwright, not built into Squad), reviewer-protocol.md trust levels section belongs (documents user choice spectrum within Squad's existing review system). Pattern: if Squad doesn't ship the code, it's IRL content; if it's a GitHub platform feature used alongside Squad, clarify that distinction; if it documents actual Squad behavior/configuration, it belongs.

### Boundary Review Execution (v0.8.26)
Executed boundary review findings from PR #331: (1) Deleted ralph-operations.md (infrastructure around Squad, not Squad itself — moved to IRL); (2) Deleted proactive-communication.md (external tools/webhooks — moved to IRL); (3) Reframed issue-templates.md intro to clarify "GitHub feature configured for Squad" not "Squad feature"; (4) Updated EXPECTED_SCENARIOS in docs-build.test.ts to match remaining files. Pattern reinforced: boundary review = remove external infrastructure docs, reframe platform integration docs to clarify whose feature it is, keep Squad behavior/config docs. Changes staged for commit.

