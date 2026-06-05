---
"@bradygaster/squad-cli": patch
---

fix(watch): Windows shell:true, shared agent-spawn, round-level fetch (#920, #923)

Three fixes for the watch --execute subsystem:

1. Added shell: IS_WINDOWS to all 37+ execFile calls so commands resolve
   through PATH on Windows (fixes spawn EINVAL errors).

2. Created shared agent-spawn.ts module replacing 7 copy-pasted
   buildAgentCommand() implementations. Default changed from deprecated
   gh copilot to standalone copilot CLI.

3. Added RoundData shared fetch — issues and PRs fetched once per round
   instead of per-capability, reducing API calls from ~40 to ~2 per round.
