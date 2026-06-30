---
"@bradygaster/squad-cli": patch
---

Fix Windows shell spawn issues and gh auth false-negative

- **DEP0190 fix:** Added `escapeForCmd()`/`escapeArgs()` to properly quote args when `shell: true` is used on Windows. Changed `shell: true` → `shell: IS_WINDOWS`.
- **Capability migration:** Moved monitor-email, monitor-teams, retro, decision-hygiene from inline `buildAgentCommand`/`spawnWithTimeout` to shared `agent-spawn.ts` module.
- **gh auth fix:** Use `gh auth token` instead of `gh auth status` — the latter returns non-zero when any keyring entry is stale, even if the active account works fine.
- **Copilot flag fix:** Use `-p` (correct) instead of `--message` (non-existent) for copilot CLI prompt flag.
- **Default --yolo:** When `--execute` is active and no `copilotFlags`/`agentCmd` are set, default to `--yolo` so copilot doesn't hang waiting for permission prompts.