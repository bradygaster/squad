---
"@bradygaster/squad-sdk": patch
---

Fix #1526: `parseAzureDevOpsRemote()` didn't decode percent-encoded characters in the org/project/repo segments it pulled out of a git remote URL. A legacy `visualstudio.com` remote with a space in the project name (`.../Pref%20Proj/_git/...`) came out as `Pref%20Proj`, and every `az` CLI call built from that (`az repos pr list --project Pref%20Proj ...`) failed since `az` doesn't decode its own arguments. Added a `decodeSegment()` helper and applied it to all three URL formats (`dev.azure.com`, SSH, and legacy `visualstudio.com`), not just the one from the repro, since the same bug affects any of them.
