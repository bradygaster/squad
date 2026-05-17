# External State Resolution

On-demand reference for Squad's external state resolution algorithm. Load this before checking for `team.md` when `.squad/config.json` may redirect state to an external directory.

**Before checking for `team.md`, resolve external state:**

1. Read `.squad/config.json` (in CWD or git root's `.squad/`).
2. If it exists and contains `"stateLocation": "external"`:
   a. Read the `projectKey` field from the same config. Sanitize the key: replace path separators and non-`[a-zA-Z0-9._-]` chars with `-`. Reject keys that are empty, start with `.`, or contain `..`.
   b. Resolve the external state directory:
      - **Windows:** `%APPDATA%\squad\projects\{projectKey}\`
      - **macOS:** `~/Library/Application Support/squad/projects/{projectKey}/`
      - **Linux:** `$XDG_CONFIG_HOME/squad/projects/{projectKey}/` (default `~/.config/squad/projects/{projectKey}/`)
   c. Set **team root** = that external directory. In external mode, `team_root` points directly to the flat external state directory — files like `team.md`, `routing.md`, and `agents/` live at the top level of this path (no nested `.squad/` subfolder). ALL state paths resolve from this external root.
   d. Skip the Worktree Awareness resolution below — external state is already branch-independent.
3. If `.squad/config.json` does not exist, or `stateLocation` is not `"external"` → proceed with normal resolution (Worktree Awareness) below.
