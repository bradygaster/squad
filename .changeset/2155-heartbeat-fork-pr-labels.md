---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix `squad-heartbeat.yml`'s "Repair orphaned squad labels" step 403ing when a fork PR closes.

`GITHUB_TOKEN` is forced read-only for `pull_request`-triggered workflow runs originating from a fork, regardless of the workflow's declared `permissions:` block, so `issues.addLabels` was rejected with `403 Resource not accessible by integration`. The trigger is switched to `pull_request_target` across all 5 synced copies (`.github/workflows/`, `templates/workflows/`, `packages/squad-cli/templates/workflows/`, `packages/squad-sdk/templates/workflows/`, `.squad-templates/workflows/`), which runs with base-repo token permissions regardless of fork origin.

This is safe because the `actions/checkout` step never overrides `ref:` (always checks out the base ref, never the fork head), and no step reads or executes anything from the triggering PR's content.
