---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

feat(platform): hydrate work-item `body` via `getWorkItem` and route two-pass scan through the adapter

`WorkItem` now carries an optional `body`, populated by both `GitHubAdapter` (`gh issue view --json body`) and `AzureDevOpsAdapter` (`System.Description`). The watch `two-pass` capability hydrates actionable items through `adapter.getWorkItem` instead of a hardcoded `gh issue view`, so it works on Azure DevOps as well as GitHub.
