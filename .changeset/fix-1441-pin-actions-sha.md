---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Pin GitHub Actions references to full-length commit SHAs across the 10 shipped workflow templates (`squad-ci.yml`, `squad-docs.yml`, `squad-heartbeat.yml`, `squad-issue-assign.yml`, `squad-label-enforce.yml`, `squad-preview.yml`, `squad-promote.yml`, `squad-release.yml`, `squad-triage.yml`, `sync-squad-labels.yml`), matching the same hardening already applied to this repo's own `.github/workflows/`. Orgs that require SHA-pinned actions as a supply-chain policy can now use `squad init`/`squad upgrade` without hand-patching every installed workflow. Closes #1441.
