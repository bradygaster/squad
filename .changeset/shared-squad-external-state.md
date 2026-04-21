---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Shared squad with external state backend

Enables squad team state to live outside the repo in git-backed squad repos
or the global app data directory. Squads are discovered via origin URL matching
against a registry in ~/.squad/squad-repos.json. Zero files written to
target repos.

New SDK: shared-squad registry, URL normalization (GitHub/ADO/SSH), 6-step
resolution chain, journal claim protocol, git-backed repo pointers.

New CLI: init --shared, migrate --to shared --keep-local, shared
status|add-url|list|doctor|diagnose.

Templates updated for shared mode (conditional git ops, 3-strategy resolution).
Cross-platform fixes: ssh:// URLs, APFS case sensitivity, platform-neutral text.
