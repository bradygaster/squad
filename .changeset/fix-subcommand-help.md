---
"@bradygaster/squad-cli": patch
---

Fix `squad <command> --help` silently running the command instead of showing help (#1201)

Previously, passing `--help` or `-h` after a subcommand (e.g. `squad init --help`,
`squad triage --help`, `squad doctor --help`) was silently dropped and the command
would execute for real — sometimes with destructive side effects (init scaffolded
files into the cwd, triage/watch started a polling loop). Only `squad loop --help`
and `squad state-mcp --help` were intercepting the flag.

The CLI now intercepts `--help`/`-h` for every registered subcommand in one place
at the top of the router and prints command-specific help via a new
`printCommandHelp(cmd, version)` helper. Unrecognized commands fall back to a
friendly "see `squad help`" message. No side effects are triggered.
