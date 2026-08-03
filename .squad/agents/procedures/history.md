# Procedures

> Standard Operating Procedures & Spec Writer

## Learnings

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

Procedures assigned:
- **#485 (Agent Specification PRD)** → squad:flight + squad:procedures (architecture decision + formal spec structure)

Pattern: Agent specification gap identified. Procedures owns formal spec structure and documentation; Flight owns architecture decisions.

📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution & Model Catalog Merge):** Procedures executed Round 2 PR merge action: rebased PR #619 (model catalog refresh, issue #588) onto dev branch from main, resolved 3 merge conflicts, and successfully merged. Model catalog now current: default model bumped to `claude-sonnet-4.6` (latest standard-tier Claude), specialist bumped to `gpt-5.3-codex` (latest code-writing specialist), fallback chains restructured to include new models (`gpt-5.4`, `gpt-5.4-mini`) and removed dead models (`claude-opus-4.6-fast`). All 6 original merge-plan PRs (#620, #627, #624, #611, #617, #619) now ✅ complete. Dev branch green (5,038 tests). Decision inbox merged to decisions.md and deleted. Next: Ready for follow-on feature PRs.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. Procedures owns Agent Specification PRD structure (#485). Architecture decisions from Flight. Coordinate on formal spec format and standard structure for future agent definitions.

## Historical Learnings Summary (condensed 2026-03-10 → 2026-04-17)

- **Deterministic skill pattern (2026-03-10):** Skills must have explicit SCOPE (what they produce/don't) and AGENT WORKFLOW (deterministic steps with STOP condition). Same input → same output, every time.
- **Self-contained skills (2026-03-15):** Resources (scripts, examples, configs) live WITH the skill directory, not in separate template dirs. Agents copy resources from the skill; no manual steps.
- **Three governance policies (2026-03-15):** Agent Error Lockout (2 errors → reassign), Product Isolation Rule (tests/CI/code never depend on squad names), Peer Quality Check (run tests before finishing). Applied to all 19 charters.
- **Team-wide reskill (2026-03-16):** 17.4% size reduction — NEVER/ALWAYS sections compress to single-paragraph summaries; essential workflow details stay verbose.
- **Economy mode skill (2026-03-22):** Layer 3 modifier only — never downgrades Layers 0-2 (user intent). `💰` indicator in spawn acknowledgments. Session phrase, persistent config, or CLI flag activation.
- **Personal squad governance (2026-03-22):** `CONSULT_MODE: true` as spawn signal. Governance changes go to `decisions/inbox/` for Flight review — don't edit squad.agent.md directly.
- **Spawn template `name` fix (2025-07):** Every `task` tool spawn MUST include `name` set to agent's lowercase cast name. Without it, platform defaults to generic slugs.
- **Model catalog refresh (2025-07 / 2026-03-25):** Model catalogs drift. Search ALL model name strings when refreshing — not just the catalog list. Sync via `sync-templates.mjs` to all 5 copies.
- **VS Code routing investigation (2026-03-25):** CLI-centric enforcement language causes coordinator to work inline in VS Code. Fix: platform-neutral dispatch language + reinforcement at prompt bottom.
- **VS Code routing fix (2026-07):** Fix 1 + Fix 2 shipped. CRITICAL RULE rewritten to dispatcher-identity framing ("DISPATCHER, not a DOER") with dispatch mechanism table. Routing Enforcement Reminder added as final section. Remaining P1 fixes (template renaming, prompt slimming) deferred.
- **PR #619 rebase (2026-07):** When a PR has accumulated dev merge commits, use `git rebase --onto dev <parent-of-first-PR-commit>` to cherry-pick only relevant commits.
- **Trim copilot-instructions.md (#999, 2026-04-17):** 1300w/9KB → 397w/3KB. Extracted Protected Files to skill, consolidated Git Safety, removed duplication. Pattern: main instructions = routing/workflow; skills = domain-specific reference (lazy-loaded on demand).