---
"@bradygaster/squad-cli": minor
---

Add `squad update-check` — reads the existing self-update cache (`update-check.json`) and reports current/latest version, release channel, and update availability, without replicating OS-specific cache path resolution or TTL-freshness checks in every consumer.

- `--json` emits structured output for editor extensions, CI scripts, and coordinator instructions.
- `--refresh` bypasses the cache and re-fetches from the npm registry.
- Exit codes: `0` (up to date / no cache yet), `1` (update available), `2` (transport failure during `--refresh`).
- Honors `SQUAD_NO_UPDATE_CHECK=1` — no network call, exits `0` silently.

Closes #1170.
