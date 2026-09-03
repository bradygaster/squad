---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Correct the `gh-aw-enlistment` skill's first-install guidance: `SQUAD_GITHUB_APP_PRIVATE_KEY` and `SQUAD_GITHUB_TOKEN` are names `gh aw add` reports as *referenced* for approval, not prerequisites. Neither secret needs to exist, and single-repo activation runs on the built-in `github.token`. The scaffolded skill previously listed them as a bare setup-time item, which led readers to conclude a PAT was required to enlist a repository.
