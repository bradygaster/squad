# Cross-organization authentication

**Try this when you have repos in multiple GitHub accounts:**
```
I work across personal GitHub and Enterprise Managed Users
```

**Try this to set up multi-account auth:**
```
Show me how to configure gh CLI for multiple GitHub accounts
```

You have repositories in both personal GitHub (github.com) and GitHub Enterprise Cloud with Enterprise Managed Users (EMU). The `gh` CLI and git credentials are tied to one account at a time. Squad agents hit authentication errors when working across these boundaries.

---

## The problem

GitHub Enterprise Managed Users (EMU) provisions user accounts managed by your enterprise. Usernames typically follow a pattern like `username_shortcode` (e.g., `alice_acme`). When you work across personal GitHub and EMU organizations:

1. Your git credentials authenticate to one account at a time
2. The `gh` CLI authenticates to one account at a time
3. Squad agents inherit your authentication context
4. When an agent tries to access a repo tied to a different account, authentication fails

**Common error messages:**

```
HTTP 401: Bad credentials (github.com/api/v3)
```

```
gh: authentication required for https://github.com/ORGANIZATION/REPO
```

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

---

## Solution 1: Use `gh auth switch`

The `gh` CLI supports multiple authenticated accounts. Log in with both your personal and EMU accounts, then switch between them as needed.

### Step 1: Log in with both accounts

```bash
# Log in to personal GitHub
gh auth login

# Log in to EMU account (use the EMU hostname if your org uses a separate instance)
gh auth login --hostname github.com
```

If your EMU organization uses a dedicated GitHub Enterprise Cloud hostname (e.g., `ghe.mycompany.com`), specify it:

```bash
gh auth login --hostname ghe.mycompany.com
```

### Step 2: Check active account

```bash
gh auth status
```

Output shows which account is currently active:

```
github.com
  ✓ Logged in to github.com as alice (keyring)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: gho_****

ghe.mycompany.com
  ✓ Logged in to ghe.mycompany.com as alice_acme (keyring)
  ✓ Active account
```

### Step 3: Switch accounts

```bash
gh auth switch
```

Select the account you need:

```
? What account do you want to switch to?
  > alice (github.com)
    alice_acme (ghe.mycompany.com)
```

Or switch directly:

```bash
gh auth switch --user alice
gh auth switch --user alice_acme --hostname ghe.mycompany.com
```

---

## Solution 2: Copilot instructions

Add account mapping to `.github/copilot-instructions.md` so Squad agents know which account to use for which repositories.

Create or update `.github/copilot-instructions.md` in your repository:

```markdown
# GitHub Account Context

When working with repositories across multiple GitHub accounts, use the following mappings:

## Personal GitHub (github.com)
- Authenticated as: alice
- Repositories:
  - github.com/alice/portfolio
  - github.com/alice/blog
  - github.com/open-source-org/community-project

## Enterprise Managed Users (EMU)
- Authenticated as: alice_acme (ghe.mycompany.com)
- Repositories:
  - ghe.mycompany.com/engineering/api-gateway
  - ghe.mycompany.com/engineering/frontend

Before executing `gh` or `git` commands, check the repository URL and switch to the correct account with `gh auth switch --user <username>` if needed.
```

Squad agents will read this instruction and switch accounts when they detect a cross-account operation.

**User-level instructions:** If you work across multiple repos, add the account mapping to your global Copilot instructions at `~/.github/copilot-instructions.md` (or `%USERPROFILE%\.github\copilot-instructions.md` on Windows).

---

## Solution 3: Squad skill

Capture the cross-org auth pattern as a Squad skill. When authentication fails, the skill detects the error and suggests or attempts account switching.

Create `.squad/skills/cross-org-auth-recovery.md`:

```markdown
# Cross-Organization Authentication Recovery

When `gh` or `git` operations fail with authentication errors (HTTP 401, "authentication required", "Bad credentials"), detect the failure and switch to the correct GitHub account.

## Detection

Look for these error patterns:
- `HTTP 401: Bad credentials`
- `gh: authentication required for https://github.com`
- `fatal: could not read Username for 'https://github.com'`

## Recovery

1. Run `gh auth status` to see which accounts are available
2. Extract the repository's organization or hostname from the error message
3. Match the repository to the correct account (use `.github/copilot-instructions.md` if available)
4. Run `gh auth switch --user <username>` to switch accounts
5. Retry the failed operation

## Example

```bash
# Operation fails
gh pr create --repo engineering/api-gateway
# Error: gh: authentication required for https://ghe.mycompany.com/engineering/api-gateway

# Check accounts
gh auth status
# alice (github.com) — active
# alice_acme (ghe.mycompany.com)

# Switch to EMU account
gh auth switch --user alice_acme --hostname ghe.mycompany.com

# Retry operation
gh pr create --repo engineering/api-gateway
# Success
```
```

The Scribe or another agent can apply this skill when auth errors occur.

---

## Git credential helpers

The `gh` CLI handles GitHub API authentication, but git clone/fetch/push operations use git's credential system. Configure git to use the correct credential helper per host or organization.

### Per-host credentials

If your EMU organization uses a separate hostname (e.g., `ghe.mycompany.com`):

```bash
# Configure git to use gh CLI as credential helper for both hosts
git config --global credential.https://github.com.helper "!gh auth git-credential"
git config --global credential.https://ghe.mycompany.com.helper "!gh auth git-credential"
```

Git will now delegate authentication to the `gh` CLI, which uses the active account from `gh auth switch`.

### Per-organization credentials (advanced)

If both accounts share `github.com` but belong to different organizations:

```bash
# Use gh CLI for personal repos
git config --global credential.https://github.com/alice.helper "!gh auth git-credential"

# Use gh CLI for EMU org repos
git config --global credential.https://github.com/ORGANIZATION.helper "!gh auth git-credential"
```

**Note:** This requires git 2.36+ for per-URL credential helpers.

---

## Verify active account

Before running Squad agents, check which GitHub account is active:

```bash
gh auth status
```

Look for the account marked as **Active**.

To verify git operations use the correct account:

```bash
# Test with a repository from each org
gh repo view alice/portfolio
gh repo view engineering/api-gateway
```

Both should succeed without authentication errors.

---

## Tips

- **Switch before starting Squad** — run `gh auth switch` before launching a Squad session if you know which repos you'll work on
- **Error detection works both ways** — if an agent hits an auth error, check `gh auth status` and switch manually before retrying
- **Use Copilot instructions for documentation** — document account mappings in `.github/copilot-instructions.md` so Squad agents (and human teammates) know which account to use
- **Test both accounts** — verify both `gh` and `git` operations work for each account before relying on multi-account workflows
- **EMU hostname varies** — some EMU orgs use `github.com` with organization-scoped access; others use dedicated hostnames like `ghe.mycompany.com`. Check with your GitHub admin.
- **Token permissions matter** — EMU accounts may have restricted permissions. Ensure your token has `repo`, `read:org`, and `workflow` scopes.

---

## See also

- [Private repos](./private-repos) — privacy and security for Squad on enterprise repos
- [Enterprise platforms](../features/enterprise-platforms) — Azure DevOps and Microsoft Planner support
- [Troubleshooting](./troubleshooting) — common Squad issues and fixes
