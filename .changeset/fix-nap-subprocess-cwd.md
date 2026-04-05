---
"@bradygaster/squad-cli": patch
---

fix(cli): wire --team-root / SQUAD_TEAM_ROOT into squad resolution for nap, status, and cost commands (#734)

Commands that resolve .squad/ now respect the SQUAD_TEAM_ROOT env var (set by --team-root flag),
fixing subprocess invocations (e.g. Copilot CLI bang commands) where process.cwd() differs from
the interactive shell. Also improves the nap error message to show the searched directory.
