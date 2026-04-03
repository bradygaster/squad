---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add external state storage — move .squad/ out of the working tree (#792)

- New `stateLocation: 'external'` option in `.squad/config.json`
- `resolveExternalStateDir()` resolves state under the platform-specific global Squad directory (`resolveGlobalSquadPath()`)
- `deriveProjectKey()` generates a stable key from the repo path (cross-platform)
- `resolveSquadPaths()` honors external state location
- `squad externalize` moves state out, `squad internalize` moves it back
- State survives branch switches, invisible to `git status`, never pollutes PRs
- Thin `.squad/config.json` marker stays in repo (gitignored)
- Path traversal protection on projectKey
- 12 new tests
