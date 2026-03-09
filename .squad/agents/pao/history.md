# PAO

> Public Affairs Officer

## Core Context

Docs live in docs/ with blog/, concepts/, cookbook/, getting-started/, guide/, features/, scenarios/ sections. Blog tests use filesystem discovery (dynamic); other sections use hardcoded expected arrays. Microsoft Style Guide enforced: sentence-case headings, active voice, second person, present tense. Docs format: plain markdown, H1 title, experimental warning, "Try this" code blocks, overview, HR, H2 content sections. Scannability framework: paragraphs for narrative, bullets for scannable items, tables for comparisons.

## Learnings

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

### Getting Started Guide Structure
docs/src/content/docs/get-started/first-session.md explains Squad's first-run experience. Line 89 introduces .squad/ directory creation, followed by "What's inside .squad/?" section (line 91) with table documenting team.md, routing.md, decisions.md, agents/, ceremonies.md, casting/, skills/, templates/. Includes ownership statement ("You own these files") and commit guidance ("Commit .squad/ to version control").
