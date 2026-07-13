---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

feat(platform): add `setAssignee()` to PlatformAdapter so assignee changes route through the platform abstraction (GitHub + ADO) instead of inline `gh`/`az` calls

`GitHubAdapter.setAssignee` uses `gh issue edit --add/--remove-assignee`; `AzureDevOpsAdapter.setAssignee` sets `System.AssignedTo`. The watch command's `editWorkItem` now delegates assignee operations to the adapter, removing the hardcoded GitHub-vs-ADO branch.
