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

### DOCS-TEST SYNC Review Pattern
When reviewing docs PRs, verify test assertions for new pages in docs-build.test.ts. Scenario pages don't require test updates (dynamic discovery). Pages in get-started/, guide/, reference/, and concepts/ sections require corresponding entries in EXPECTED_* arrays. PR #303 correctly added EXPECTED_CONCEPTS array for new architecture.md, plus entries for five-minute-start.md, choosing-your-path.md, and glossary.md.

### New User Experience Pattern (v0.8.26+)
Effective onboarding follows "prove it works → choose your path → understand how it works" flow. Quick start pages should be minimal (5 minutes, prove functionality). Architecture pages should include system diagrams and component explanations without handwaving. Glossary definitions work best as single-sentence entries, alphabetical order. Troubleshooting pages benefit from quick-fix tables at the top before detailed solutions.

📌 Team update (2026-03-09T19:16:49Z): PAO reviewed docs PRs #318, #317, #305, #303 — all approved. Docs-test sync verified across all 4. Microsoft Style Guide adoption approved (except where conflicts with team voice). 44-issue docs backlog now has progressive disclosure framework, routing guidelines, and @copilot capability profile for autonomous execution.

### Model Provider Documentation Gap (Audit 2026-03-09)
Squad documentation assumes GitHub Copilot as the ONLY LLM backend. Docs never explain that Squad requires Copilot — it's treated as implicit. Alternative providers (OpenAI, Anthropic/Claude) are mentioned only in: (1) model selection docs listing model names by provider (anthropic/openai/google), (2) SquadProviderConfig interface in SDK for BYOK (Bring Your Own Key), and (3) blog post v0.3.0 mentioning "3 providers". No docs explain HOW to configure alternative providers, whether Squad works without Copilot, or what SquadProviderConfig does. Installation docs list "GitHub Copilot" as requirement but never clarify if it's the ONLY option. This is a critical gap for users with OpenAI/Anthropic API keys expecting to use Squad directly.

### Adoption Tracking Infrastructure (2026-03-09)
Created two-tier adoption tracking system: (1) Public showcase at docs/community/built-with-squad.md featuring 7 opted-in projects (microsoft/Generative-AI-for-beginners-dotnet, quartznet/quartznet, bradygaster/Squad-IRL, bradygaster/AspireSquad, bradygaster/ACCES, tamirdresher/squad-tetris, csharpfritz/SquadUI), and (2) Internal tracking at .squad/adoption/tracking.md with full 34-repo list discovered via GitHub code search. Public page follows Starlight frontmatter format, Microsoft Style Guide (sentence-case headings, active voice), and includes "Add your project" section with PR submission instructions. Internal tracking includes discovery methods (package.json vs squad.agent.md), status tracking, aggregate metrics (78+ repos, 713 stars, 96 forks), and placeholder for social mentions. Linked from README.md Community section. Test assertions added to docs-build.test.ts following DOCS-TEST SYNC pattern (EXPECTED_COMMUNITY array). Pattern proven: curated opt-in showcases build trust; private metrics enable data-driven community growth without privacy concerns.

📌 Team update (2026-03-09T21:19:12Z): Booster implemented daily adoption monitoring automation (GitHub Actions + TypeScript script). Workflow collects GitHub metrics, code search results, npm downloads, generates markdown reports in `.squad/adoption/reports/`. First run successful: 714 stars, 96 forks, 44 repos using Squad, 135 with squad.agent.md. Key insight: squad.agent.md adoption (135) > package.json adoption (44) validates agent-first onboarding hypothesis. Zero runtime dependencies added (uses Node.js 22 fetch). Historical tracking enables longitudinal analysis.

