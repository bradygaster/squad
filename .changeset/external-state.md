---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add external state storage — move .squad/ out of the working tree (#792)

- New `stateLocation: 'external'` option in `.squad/config.json`
- `resolveExternalStateDir()` resolves state to `~/.squad/projects/{projectKey}/`
- `deriveProjectKey()` generates a stable key from the repo path
- `resolveSquadPaths()` honors external state location
- `squad externalize` moves state out, `squad internalize` moves it back
- State survives branch switches, invisible to `git status`, never pollutes PRs
- Thin `.squad/config.json` marker stays in repo (gitignored)
- 8 new tests
