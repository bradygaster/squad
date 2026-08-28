# Troubleshooting

Common issues and fixes for Squad installation and usage.

---

## Quick fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `squad: command not found` | Squad CLI not installed or not in PATH | Install it using a method in the [Installation guide](../get-started/installation) |
| `No .squad/ directory found` | Not in a git repo or Squad not initialized | Run `git init` then `squad init` |
| `Cannot find agent "{name}"` | Agent doesn't exist in `.squad/agents/` | Check `.squad/team.md` for roster, or re-run casting |
| `gh: command not found` | GitHub CLI not installed | Install from [cli.github.com](https://cli.github.com/) then `gh auth login` |
| `Node.js version error` | npm install uses Node.js below v22.5 | Upgrade Node.js to v22.5+ or use a standalone install (see below) |

---

## An old GitHub-based install command appears to hang

**Problem:** An installation command copied from an older guide shows a frozen
npm spinner.

**Cause:** The legacy GitHub package path was removed. It depended on npm's git
transport and could hide SSH prompts behind the progress spinner.

**Fix:** Install Squad through npm, Homebrew, WinGet, the verified install
script, or a release archive, then run `squad init`. See the
[Installation guide](../get-started/installation).

---

## `gh` CLI not authenticated

**Problem:** GitHub Issues, PRs, Ralph, or Project Boards commands fail with authentication errors.

**Cause:** The `gh` CLI isn't logged in, or is missing required scopes.

**Fix:**

1. Log in:
   ```bash
   gh auth login
   ```

2. If using Project Boards, add the `project` scope:
   ```bash
   gh auth refresh -s project
   ```

3. Verify:
   ```bash
   gh auth status
   ```

---

## Authentication fails on cross-org repos

**Problem:** Squad agents hit authentication errors when working with repositories across personal GitHub and GitHub Enterprise Managed Users (EMU) organizations.

**Cause:** The `gh` CLI and git credentials are tied to one account at a time. When you switch contexts between personal and EMU repos, the active account may not have access to the target repository.

**Fix:**

1. Use `gh auth switch` to toggle between authenticated accounts:
   ```bash
   gh auth status
   gh auth switch --user <username>
   ```

2. Add account mappings to `.github/copilot-instructions.md` so Squad agents know which account to use for which repos.

3. Configure git credential helpers per host or organization.

See [Cross-organization authentication](./cross-org-auth) for detailed setup instructions.

---

## Node.js version too old

**Problem:** An npm install fails with an engine compatibility error, or Squad
behaves unexpectedly.

**Cause:** The Squad npm package requires Node.js 22.5.0 or later, enforced via
`engines` in `package.json`. Standalone installs vendor their own runtime and
are not affected.

**Fix:**

```bash
node --version
```

If below v22.5, upgrade to the latest LTS:
- **nvm (macOS/Linux):** `nvm install --lts && nvm use --lts`
- **nvm-windows:** `nvm install lts && nvm use lts`
- **Direct download:** [nodejs.org](https://nodejs.org/)

---

## Squad agent not appearing in Copilot

**Problem:** After install, `squad` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/squad.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/squad.agent.md
   ```
   If missing, re-run `squad init`.

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `squad upgrade` completes but nothing changes.

**Cause:** You may already have the latest Squad-owned templates for the
installed CLI version.

**Fix:**

1. Check current version in `.github/agents/squad.agent.md` (frontmatter `version:` field).

2. Update the CLI through the same channel used to install it, then retry:
   ```bash
   squad upgrade
   ```

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Squad's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH

---

## "⚠ squad pre-commit: refusing to commit two-layer state into the working tree"

**Problem:** A `git commit` is blocked with the message above.

**Cause:** You're on the `orphan` or `two-layer` backend, and one or more state files (`.squad/decisions.md`, `.squad/agents/*/history.md`, `.squad/casting/`, `.squad/routing/`) were staged for commit. These files belong on the `squad-state` orphan branch, not in your working branch. Something wrote them back to disk after the migration — a direct `fs.writeFile` call, an editor auto-save, or an external tool — and you staged them unintentionally.

**Recovery flow:**

1. **Unstage the state files:**
   ```bash
   git restore --staged .squad/decisions.md
   git restore --staged ".squad/agents/*/history.md"
   ```

2. **Check whether the orphan branch already has the content** (it should, if `squad sync` has run):
   ```bash
   git show squad-state:decisions.md
   git show squad-state:agents/<agent-name>/history.md
   ```

3. **If the working-tree copy contains new content not yet on the orphan branch**, lift it through Squad before deleting:
   ```bash
   squad memory write --file .squad/decisions.md
   ```

4. **Remove the working-tree copies:**
   ```bash
   # PowerShell
   Remove-Item .squad\decisions.md -ErrorAction SilentlyContinue
   Get-ChildItem .squad\agents -Recurse -Filter history.md | Remove-Item
   ```
   ```bash
   # bash
   rm -f .squad/decisions.md .squad/agents/*/history.md
   ```

5. **Commit normally** — the `post-commit` hook will call `squad sync --quiet` automatically:
   ```bash
   git commit -m "your commit message"
   ```

**When to use `SQUAD_SYNC_ACTIVE=1`:** Rarely. This env var bypasses both the pre-commit and post-commit hooks. It's intended for internal use by `squad sync` itself to prevent recursion. If you set it to unblock a commit, the state files will land in your working-branch history and appear in PRs — exactly what two-layer is designed to prevent. Use the recovery flow above instead.

---
