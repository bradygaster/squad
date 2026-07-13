---
"@bradygaster/squad-sdk": minor
---

Refresh the model catalog to GitHub Copilot CLI-reachable IDs and prune dead fallback IDs.

- MODEL_CATALOG now lists only currently-valid, CLI-reachable models (13 total) and drops removed IDs (gpt-4.1, gpt-5, gpt-5.1*, gpt-5.2*, gemini-3-pro-preview, claude-sonnet-4, claude-opus-4.5, claude-opus-4.6-fast).
- Fallback chains (runtime constants + SDK defaults), schema defaults, and the economy-mode map are updated to real IDs only, fixing routing that pointed at models no longer offered.
- Adds an optional `githubCategory` cost-ceiling field (lightweight/versatile/powerful) to `ModelInfo`, sourced from the models API `model_picker_category`. This is a separate cost axis from the existing quality `tier`; the two are intentionally not conflated.
- No hardcoded per-token USD pricing is added for new entries, and no `included`/zero-credit flag is introduced.
- `validateConfigDetailed` now emits a non-blocking `warnings` entry when `config.models.defaultModel` is a non-empty string that is not present in the current `MODEL_CATALOG`, helping users catch stale model IDs in config files without blocking config load.

Refs #1080, #1183.
