---
"@bradygaster/squad-cli": minor
---

Add `--notify-level` to control watch round reporting noise (#803)

- `--notify-level important` (default): only print rounds with actual work items
- `--notify-level all`: print every round including empty (old behavior)
- `--notify-level none`: suppress all round output
- Add machine name (`os.hostname()`) and repo name to round headers for attribution
- Configurable via `.squad/config.json` watch section: `"notifyLevel": "important"`
- Empty rounds silenced by default — no more "Round 160, Round 161" spam
