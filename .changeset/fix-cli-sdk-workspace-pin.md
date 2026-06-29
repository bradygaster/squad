---
"@bradygaster/squad-cli": patch
---

Force the CLI's squad-sdk dependency through the repo workspace by using a root file dependency plus an npm override for the CLI package. This keeps fresh installs linked to the local SDK prerelease instead of pulling the stale published SDK. Closes #1405.
