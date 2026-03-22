# GitHub auth setup for project boards

**Try this to verify your auth setup:**
```
gh auth status
```

**Try this to switch accounts before working with project boards:**
```
gh auth switch --user YOUR_USERNAME
```

You need an authenticated GitHub CLI to manage project boards with Squad. This guide covers login, required scopes, multi-account switching, and common pitfalls.

---

## Log in with `gh auth login`

If you haven't authenticated yet, run:

```bash
gh auth login
```

Follow the interactive prompts. When asked about scopes, request the ones Squad needs for project board management (see the next section).

To add scopes to an existing session:

```bash
gh auth refresh -s repo,read:org,workflow,delete_repo,gist
```

---

## Required scopes

Project board management requires specific token scopes. Without them, `gh project` commands fail silently or return permission errors.

| Scope | Why you need it |
|-------|----------------|
| `repo` | Read and write access to repositories and their linked project boards |
| `read:org` | Read organization membership — required to access org-level project boards |
| `workflow` | Trigger and manage GitHub Actions workflows from Squad agents |
| `delete_repo` | Allow Squad to clean up temporary repos during testing (optional but recommended) |
| `gist` | Create gists for sharing logs and snippets (optional but recommended) |

### Verify your scopes

```bash
gh auth status
```

Look for the `Token scopes` line in the output:

```
github.com
  ✓ Logged in to github.com account your-username (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_****
  - Token scopes: 'delete_repo', 'gist', 'read:org', 'repo', 'workflow'
```

If scopes are missing, refresh your token:

```bash
gh auth refresh -s repo,read:org,workflow
```

---

## Switch between multiple accounts

If you have both a personal GitHub account and an Enterprise Managed User (EMU) account, the `gh` CLI lets you authenticate with both and switch between them.

### Log in with both accounts

```bash
# Personal account
gh auth login

# EMU account (same hostname or dedicated instance)
gh auth login --hostname github.com
```

### Switch to the account you need

```bash
# Interactive picker
gh auth switch

# Direct switch by username
gh auth switch --user your-personal-username
```

### Verify the active account

Always verify after switching — especially before project board operations:

```bash
gh auth status
```

Confirm the account marked **Active account: true** is the one you want.

---

## Common pitfalls

### EMU account reactivates between commands

**Problem:** You switch to your personal account with `gh auth switch`, but subsequent commands run under your EMU account.

**Why it happens:** Some credential managers and enterprise policies can reactivate the EMU account. Background processes or IDE extensions may also trigger re-authentication with the work account.

**Fix:** Always verify with `gh auth status` immediately before running `gh project` or `gh pr` commands. If the wrong account is active, switch again:

```bash
gh auth status
# If wrong account is active:
gh auth switch --user your-personal-username
gh auth status  # Verify the switch stuck
```

### Token scope errors on project boards

**Problem:** `gh project` commands return permission errors even though you're logged in.

**Why it happens:** Your token was created without the `read:org` or `project` scopes that project board access requires.

**Fix:** Refresh your token with the required scopes:

```bash
gh auth refresh -s repo,read:org
```

### Wrong account creates issues or PRs

**Problem:** Issues or PRs appear under your EMU username instead of your personal account.

**Why it happens:** The active `gh` account changed between when you started work and when the PR was created.

**Fix:** Check `gh auth status` before every `gh pr create` or `gh issue create` command. Add a verification step to your workflow:

```bash
# Verify, then create
gh auth status
gh pr create --repo your-org/your-repo --base main --title "Your PR"
```

### `gh project` commands return "not found"

**Problem:** You run `gh project list` or `gh project view` and get a "not found" error.

**Why it happens:** The active account doesn't have access to the organization that owns the project board, or the `read:org` scope is missing.

**Fix:**
1. Verify you're on the right account: `gh auth status`
2. Verify your scopes include `read:org`: look at the `Token scopes` line
3. If the scope is missing: `gh auth refresh -s read:org`

---

## Quick verification checklist

Run these commands before starting a Squad session that involves project boards:

```bash
# 1. Check which account is active
gh auth status

# 2. Switch if needed
gh auth switch --user your-username

# 3. Verify scopes include repo and read:org
gh auth status | grep "Token scopes"

# 4. Test project board access
gh project list --owner YOUR_ORG
```

If all four steps succeed, you're ready to manage project boards with Squad.

---

## See also

- [Cross-organization authentication](../scenarios/cross-org-auth) — multi-account auth patterns for Squad agents
- [Troubleshooting](../scenarios/troubleshooting) — common Squad issues and fixes
- [Private repos](../scenarios/private-repos) — privacy and security for enterprise repos
