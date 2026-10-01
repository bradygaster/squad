---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Preserve manifest-allowlisted gh-aw ownership metadata through broad consumer ignore rules by force-staging only the exact required ownership file. Verify every required artifact's staged type and bytes before commit or push, using bounded index queries that exclude unrelated consumer files.
