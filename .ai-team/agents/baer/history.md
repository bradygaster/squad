# Baer — History

## Project Context

- **Owner:** bradygaster
- **Stack:** Node.js, GitHub Copilot CLI, multi-agent orchestration
- **Description:** Squad democratizes multi-agent development — one command gives you a team that evolves with your product. Built to bring personality and real multi-agent patterns to the GitHub Copilot ecosystem.
- **Created:** 2026-02-07

## Day-1 Context

- Hired during v0.4.2 release cycle after Brady caught an email privacy issue
- The team was storing `git config user.email` in committed `.ai-team/` files — PII leak
- Immediate fix shipped: squad.agent.md no longer reads email, 9 files scrubbed
- v0.5.0 migration tool (#108) needs to scrub email from customer repos too
- Key decision already made: "Never store user email addresses in committed files"
- v0.5.0 is a major rename (.ai-team/ → .squad/) — security review needed for migration
- v0.5.0 also adds identity layer (wisdom.md, now.md) — review data sensitivity

## Learnings

- Squad files (.ai-team/) are committed to git and pushed to remotes — anything written there is public
- Guard workflow blocks .ai-team/ from main/preview/insider branches, but it's still in git history on dev/feature branches
- GitHub Actions bot email (github-actions[bot]@users.noreply.github.com) is standard and not PII
- Plugin marketplace sources are stored in .ai-team/plugins/marketplaces.json — external repo references, not sensitive
- MCP server configs can contain API keys via env vars (${TRELLO_API_KEY}) — these should never be committed
- Template files (`templates/history.md`, `templates/roster.md`, `.ai-team-templates/history.md`) still contain `{user email}` placeholder — contradicts the email prohibition in squad.agent.md
- `git config user.name` is stored in team.md, session logs, orchestration logs, and passed to every spawn prompt — low risk since it's already in git commits, but constitutes PII under GDPR
- `squad export` serializes all agent histories to JSON — may contain PII (names, internal URLs). Warning exists but could be stronger
- Plugin marketplace has no content verification — SKILL.md files from arbitrary repos are loaded directly into agent context windows (prompt injection vector)
- Issue and PR bodies are injected into agent prompts without sanitization — prompt injection risk via GitHub issues
- decisions.md is append-only with no archival — grows unbounded (~300KB in source repo), may accumulate sensitive business context
- GitHub custom agents allow up to 30,000 characters in `.agent.md` files — squad.agent.md may exceed this if enforced
- MCP data flow: user request → coordinator → agent → MCP server → third-party API. Users may not realize project data flows to Trello/Notion/Azure when MCP tools are configured
- Committed MCP config files (`.copilot/mcp-config.json`, `.vscode/mcp.json`) use `${VAR}` references — correct pattern, but no guardrail prevents hardcoded secrets
- Security audit v1 findings written to `.ai-team/decisions/inbox/baer-security-audit-v1.md` — 12 findings across PII, compliance, third-party data, git history, and threat model
- Issue #108: Built email scrubber for migration flow — scans team.md, history.md, decisions.md, logs for `name (email)` and bare emails, replaces with `[email scrubbed]`
- Email scrubbing integrated as v0.5.0 migration — runs automatically during `squad upgrade` and reports files cleaned
- `squad scrub-emails` command added for manual scrubbing — defaults to .ai-team/ directory
- Email regex: `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g` — careful to preserve emails in URLs, code blocks, example.com contexts
- Git history caveat documented — scrubber only touches working tree, git history requires `git-filter-repo` for complete removal
- Fixed unfinished squadInfo/detectSquadDir implementation — dev branch had broken references causing 43 test failures

