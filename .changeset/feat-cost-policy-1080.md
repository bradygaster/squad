---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

feat(models): add category-based cost policy wired end-to-end + `squad models refresh`

Adds an opt-in cost-ceiling policy on GitHub's billing category axis
(`lightweight`/`versatile`/`powerful`), kept deliberately separate from the
existing quality `ModelTier` axis. The policy is fully wired through the agent
lifecycle: an implicit over-ceiling pick is deterministically downgraded, an
explicit override is honored but warned about, and the outcome is surfaced via
the event bus and logs (never swallowed). When no in-ceiling model exists the
policy fails closed and loud. Unknown/out-of-catalog model IDs still pass
through unchanged.

Also adds `squad models refresh`, a diagnostic that reconciles the committed
seed catalog against live sources — the canonical Copilot models API (optional,
via `gh auth token`) with a graceful auth-free fallback to the public
github/docs pricing YAML — writing results to the gitignored local cache. On
the authenticated happy path it additionally enriches the API-discovered
catalog with pricing (and release status) from the docs YAML, joined by model
id; enrichment is best-effort and fail-open, so a docs fetch/parse failure never
breaks the refresh.

No hardcoded per-token pricing and no `included`/zero-credit concept; pricing is
diagnostic-only and is not wired into policy enforcement.
