---
"@bradygaster/squad-cli": patch
---

Add deprecation warnings for tunnel, rc, and REPL commands. The interactive shell (no-args), `squad start`, `squad start --tunnel`, `squad rc`, and `squad rc-tunnel` now emit yellow deprecation notices pointing users to the GitHub Copilot CLI. No behavior changes — all commands still work.
