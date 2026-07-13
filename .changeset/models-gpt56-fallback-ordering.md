---
"@bradygaster/squad-sdk": patch
---

Prefer newest model per series in fallback chains, add GPT-5.6 IDs, fix Ralph free-model wording.

Follow-up to #1444 (tamirdresher review comment — catalog follow-up):

- `DEFAULT_FALLBACK_CHAINS.standard` and `MODELS.FALLBACK_CHAINS.standard` now lead with `claude-sonnet-5` (newest Sonnet; was `claude-sonnet-4.6`). Premium chains already led with `claude-opus-4.8` post-#1444.
- Adds `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` to `MODEL_CATALOG` (tier: standard, githubCategory: powerful — mirrors `gpt-5.5`) and inserts them into the standard fallback chain. CLI-reachability validated 2026-07-13.
- Updates shipped template assets (`model-selection-reference.md`, `ralph-circuit-breaker.md`, model-selection SKILL files) to match the current runtime chains and remove "Free — unlimited" / multiplier-table wording that no longer applies under usage-based billing.
- Note: `MODELS.DEFAULT` (`claude-sonnet-4.6`) is intentionally unchanged — separate decision.
- Note: `DOCS_NAME_TO_ID` entries for gpt-5.6 in `cli/commands/models.ts` are deferred until PR #1445 merges.

Refs #1080, #1183.
