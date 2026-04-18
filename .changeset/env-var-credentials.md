---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': minor
---

Support environment variable credentials for CI/CD workflows. `resolveToken()` now checks `SQUAD_{ROLE}_APP_ID`, `SQUAD_{ROLE}_PRIVATE_KEY`, and `SQUAD_{ROLE}_INSTALLATION_ID` before reading from filesystem. Added `squad identity export` subcommand to output `gh secret set` commands.
