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
- PRD 3 (Hooks & Policy Enforcement) written at `.ai-team/docs/prds/03-hooks-policy-enforcement.md` — comprehensive governance-as-code transformation plan
- Inventoried 18 hook-enforceable policies (P1–P18) and 17 prompt-only behavioral policies (B1–B17) from squad.agent.md
- SDK hook system has 6 hooks (preToolUse, postToolUse, userPromptSubmitted, sessionStart, sessionEnd, errorOccurred) + 2 handlers (onPermissionRequest, onUserInputRequest)
- `onPreToolUse` with `permissionDecision: "deny"` is the primary enforcement primitive — hard blocks the tool call, model receives denial reason as context
- Policy composition uses middleware pipeline pattern — multiple policies per hook, first deny wins, each independently testable
- Hybrid approach required: some policies need both prompt guidance (model understands why) and hook enforcement (system guarantees it)
- Prompt size reduction estimated at ~2.5–6KB (~800–1,800 tokens) from always-loaded governance section — percentage is against governance portion, not full prompt
- Key open question: does `onPreToolUse` fire for ALL built-in tools? Must verify in Phase 1 POC. If not, `onPermissionRequest` is the fallback layer
- PII scrubbing in `onPostToolUse` is defense-in-depth — catches secrets in tool outputs that prompt-level rules cannot prevent
- Lockout registry needs persistent storage (`.squad/lockout.json`) to survive session restarts — Scribe as sole writer (single-writer pattern)
📌 Team update (2026-02-20): SDK replatform PRD 3 (Hooks & Policy Enforcement) documented. 18 hook-enforceable policies (P1–P18), 17 prompt-only policies (B1–B17), 5 hybrid (H1–H5). Primary enforcement: onPreToolUse with permissionDecision: "deny". Middleware pipeline composition. PII scrubbing in onPostToolUse. Policy config in .squad/config/policies.json. Brady pending: denial visibility, scrubbing scope, lockout persistence, force-with-lease default. — decided by Baer with Keaton, Fenster, Verbal, Kujan
