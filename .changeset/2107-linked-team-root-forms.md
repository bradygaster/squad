---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": patch
---

Linked teams now work with either `teamRoot` form: the team repository (what `squad link` writes) or the team's `.squad/` directory (what the docs show). `resolveSquadPaths()` adds `teamSquadDir`, the team's squad directory for both forms, and `resolveSquadState()` roots local-backend storage there. `squad loop`/`watch`, `squad cast`, and the state MCP server read team state from `teamSquadDir`, so `squad loop` no longer reports "No squad found" for the docs form, and `squad_decide` no longer writes decisions outside `.squad/` for the `squad link` form. Closes #2107.

`teamSquadDir` is a required field on the exported `ResolvedSquadPaths` type, so code that constructs that type must now set it. `@bradygaster/squad-sdk/tools` also exports `MUTABLE_STATE_PATHS` and `isMutableStateKey()`, the list of state paths that the state tools can write.

If you linked a team with `squad link`: state that the state MCP server wrote to the team repo root (`decisions.md`, `decisions/inbox/`, `casting/policy.json`, `agents/*/history.md`, `log/`, `orchestration-log/`, `sessions/`, `.scratch/`, `identity/`) now belongs in `<team>/.squad/`. Squad does not move it. Run `squad doctor` to find leftovers. It lists the `.md` and `.json` files to move to the same relative path under `<team>/.squad/` (for example `<team>/identity/now.md` to `<team>/.squad/identity/now.md`), and the files that already exist there, which you must merge by hand without overwriting the newer state. Do not replace the existing `<team>/.squad/` directories. Skills that `squad_skill` wrote went to `.github/skills/` in the folder that contains the team repo; move any you want to keep to `<team>/.github/skills/`. Doctor does not check that folder.
