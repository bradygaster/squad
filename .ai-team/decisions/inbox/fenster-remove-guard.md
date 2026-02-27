### Remove squad-main-guard.yml workflow — #150

**By:** Fenster
**What:** Removed the squad-main-guard.yml workflow from templates, this repo, and added a v0.5.4 upgrade migration to clean it from existing consumer repos.
**Why:** The guard workflow blocked .squad/ state files from reaching main/preview branches. This was overly restrictive — users should control what gets committed via .gitignore, not a CI guard that silently fails pushes. The migration ensures existing users get the cleanup automatically on their next `squad upgrade`.
**References:** Issue #150, branch squad/150-remove-guard-workflow
