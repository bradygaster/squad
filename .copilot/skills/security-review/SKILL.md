---
name: "security-review"
description: "How to review PRs for security — credentials, injection, workflow permissions, supply chain, git operation safety"
domain: "security"
confidence: "medium"
source: "extracted from copilot-instructions.md patterns and GitHub Actions security best practices"
---

## Context

Every PR that touches authentication, credentials, environment variables, file system operations, child process execution, user input handling, GitHub API calls, or workflow files must be reviewed for security. This skill provides a systematic checklist for catching security issues before they reach production.

Use this skill when a PR includes any of:
- Changes to `.github/workflows/` files
- New or modified environment variable usage
- File system read/write operations driven by user input
- Child process execution (`child_process.exec`, `child_process.spawn`)
- GitHub API calls (Octokit, `gh` CLI wrappers)
- New npm dependencies
- Credential or token handling
- Template rendering with dynamic values

## Patterns

### 1. Secrets and Credentials

**No secrets in source code — ever.**

**Review checklist:**
- ❌ No API keys, tokens, passwords, or connection strings in committed files
- ❌ No hardcoded `GITHUB_TOKEN`, `NPM_TOKEN`, or similar values
- ❌ No `.env` files committed (verify `.gitignore` covers them)
- ✅ Secrets must be referenced via `process.env.X` or `${{ secrets.X }}` in workflows
- ✅ If the PR adds a new secret reference, verify it's documented in setup instructions

**Watch for disguised secrets:**
- Base64-encoded strings that decode to tokens
- URLs with embedded credentials (`https://user:token@host`)
- Test fixtures that contain real credentials from copy-paste

### 2. Personal Data in Committed Files

**Personal data (especially email addresses) must never be written to committed files.**

**Squad-specific rule:** `git config user.email` is explicitly banned from being written to any file that gets committed. This prevents PII leakage into the repository.

**Review checklist:**
- ❌ No email addresses written to committed files (even in config generation)
- ❌ No `git config user.email` output captured and stored in source
- ✅ If user identity is needed at runtime, read it dynamically and never persist to a committed file

### 3. Environment Variable Safety

**Review checklist:**
- Are environment variables validated before use? (e.g., checking for `undefined`)
- Are sensitive environment variables excluded from logs and error messages?
- Does the PR avoid writing environment variable values to committed files?
- If a new `process.env.X` reference is added, is the variable documented?

### 4. File System Safety

**Path traversal prevention:**
- ❌ No direct concatenation of user input into file paths (`path.join(baseDir, userInput)` without validation)
- ✅ Validate that resolved paths stay within expected boundaries (use `path.resolve` and verify the result starts with the expected base directory)
- ✅ Reject paths containing `..`, absolute paths when relative are expected, or null bytes

**Arbitrary file write prevention:**
- If user input determines a file path, verify the code constrains writes to a known safe directory
- Template rendering that writes files should validate output paths against a whitelist or known directory

### 5. Child Process Safety

**Shell injection prevention:**
- ❌ No unsanitized user input passed to `child_process.exec()` (exec uses a shell and is vulnerable to injection)
- ✅ Prefer `child_process.execFile()` or `child_process.spawn()` with argument arrays (no shell interpretation)
- ✅ If `exec` must be used, validate/sanitize all interpolated values
- ✅ Check for template literals in shell commands — `exec(\`git commit -m "${userMessage}"\`)` is injectable

**Review checklist for `gh` CLI wrappers:**
- The `gh-cli.ts` module wraps GitHub CLI calls. Verify that arguments are passed as array elements, not interpolated into a shell string
- If the PR modifies `gh-cli.ts` or adds new `gh` commands, check for injection vectors

### 6. GitHub Actions Workflow Security

**`pull_request_target` safety:**
- `pull_request_target` + checking out PR code = **critical security risk** (the workflow runs with write token but executes untrusted code from the fork)
- `pull_request_target` + NO code checkout = **safe** (write token used only with trusted workflow code)
- If a PR adds `pull_request_target`, verify it does NOT checkout `${{ github.event.pull_request.head.ref }}` or `${{ github.event.pull_request.head.sha }}`

**Token scope minimization:**
- Workflows should declare explicit `permissions:` blocks
- Follow principle of least privilege — no unnecessary `write` permissions
- If the PR adds `permissions: write-all` or omits permissions (defaults to broad), flag it

**Recursion safety:**
- `GITHUB_TOKEN`-generated events do NOT trigger new workflow runs (GitHub prevents infinite loops)
- If a workflow uses a PAT (Personal Access Token) instead of `GITHUB_TOKEN`, it CAN trigger downstream workflows — verify this is intentional

**Secrets in workflows:**
- ❌ No `${{ secrets.X }}` in workflow `run:` steps where the value could leak to logs
- ✅ Use `::add-mask::` to mask secret values in workflow output
- ✅ Minimize the number of steps that have access to secrets

### 7. Git Operation Safety

**These rules are from the project's mandatory Git Safety guidelines:**

**Staging safety:**
- ❌ No `git add .` or `git add -A` — these stage unintended deletions from incomplete working trees
- ❌ No `git commit -a` — same risk
- ✅ Only `git add path/to/specific/file.ts` with explicit file paths

**Push safety:**
- ❌ No `git push --force` or `--force-with-lease` to shared branches (`dev`, `main`)
- ❌ No direct push to `dev` or `main` — must use a PR
- ✅ Feature branches only: `squad/{issue-number}-{slug}`

**If a PR adds git operations (e.g., in a script, workflow, or agent action), verify every `git add`, `git commit`, and `git push` command follows these rules.**

### 8. Export/Import Integrity

Typos in export names cause silent runtime failures — the export resolves to `undefined` instead of throwing.

**Review checklist:**
- Check for typos in export names (e.g., `FSStorageProvidr` vs. `FSStorageProvider`)
- Verify new re-exports actually reference existing modules
- If the PR renames an export, confirm all import sites are updated
- Watch for `export { X as Y }` where `X` doesn't exist — TypeScript may not catch this in all configurations

### 9. Dependency Supply Chain

**New npm dependencies should be audited:**
- Is the package well-maintained? (check last publish date, download count, open issues)
- Does the package have known vulnerabilities? (`npm audit`)
- Is there a built-in Node.js alternative? (prefer `node:fs`, `node:path`, `node:crypto` over third-party equivalents)
- Does the package pull in a large transitive dependency tree?
- Is the package from a trusted publisher?

**Squad-specific:** Protected bootstrap files must use ONLY `node:*` built-in modules. New dependencies in these files are a **critical** finding.

### 10. Multi-Account Auth Isolation

When the `gh` CLI is used in contexts where multiple GitHub accounts might be active:
- Verify that auth tokens are scoped to the correct account
- Check that `gh auth status` is validated before operations
- If the PR adds GitHub API calls, verify it handles auth failures gracefully

## Examples

**Example 1: Critical — Shell injection in git command**
```
PR adds:
  exec(`git commit -m "${commitMessage}"`)

Finding: [critical] Shell injection — commitMessage is user-controlled.
A message containing "; rm -rf /" would execute arbitrary commands.
Fix: Use execFile('git', ['commit', '-m', commitMessage]) instead.
```

**Example 2: Critical — pull_request_target with checkout**
```
PR adds workflow:
  on: pull_request_target
  steps:
    - uses: actions/checkout@v4
      with:
        ref: ${{ github.event.pull_request.head.ref }}
    - run: npm test

Finding: [critical] pull_request_target + PR head checkout = untrusted
code execution with write token. An attacker can modify package.json
scripts in their fork to exfiltrate GITHUB_TOKEN.
Fix: Use 'pull_request' trigger instead, or do not checkout PR code.
```

**Example 3: High — Email written to committed file**
```
PR adds to init.ts:
  const email = execSync('git config user.email').toString().trim();
  fs.writeFileSync('.squad/config.json', JSON.stringify({ author: email }));

Finding: [high] Personal data (email) written to committed file.
This violates the PII-in-source rule. Squad config files are committed
to the repo and shared across contributors.
Fix: Read email at runtime only, never persist to committed files.
```

**Example 4: Medium — Overly broad workflow permissions**
```
PR adds workflow with no permissions block (inherits default write-all):
  on: push
  jobs:
    deploy:
      runs-on: ubuntu-latest

Finding: [medium] No explicit permissions block. Workflow inherits
default permissions which may be overly broad.
Fix: Add 'permissions:' block with minimum required scopes.
```

**Example 5: Medium — New dependency when built-in exists**
```
PR adds to package.json:
  "dependencies": { "mkdirp": "^3.0.0" }

Finding: [medium] mkdirp is unnecessary — Node.js built-in
fs.mkdirSync(path, { recursive: true }) provides the same functionality.
Fix: Use node:fs built-in instead of adding a new dependency.
```

**Example 6: Low — Missing environment variable validation**
```
PR uses process.env.SQUAD_API_KEY without checking if it's defined:
  const apiKey = process.env.SQUAD_API_KEY;
  fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });

Finding: [low] No validation that SQUAD_API_KEY is defined.
If undefined, the Bearer token will be "Bearer undefined" which
may produce confusing auth errors.
Fix: Check for undefined and throw a descriptive error early.
```

## Review Output Format

Structure your security review with severity levels:

```
## Security Review

**Verdict:** APPROVE | APPROVE WITH NOTES | REQUEST CHANGES | REJECT

### Findings

1. [severity: critical] — description
   - File(s): path/to/file.ts:L42
   - Risk: what could go wrong
   - Fix: specific remediation

2. [severity: high] — ...

3. [severity: medium] — ...

4. [severity: low] — ...

### Severity Guide
- **Critical:** Exploitable vulnerability, credential exposure, or code execution risk. Must fix before merge.
- **High:** Security design flaw that could lead to exploitation. Must fix before merge.
- **Medium:** Security best practice violation. Should fix before merge.
- **Low:** Minor hardening opportunity. Can fix in a follow-up PR.

### Summary
Brief overview of security posture and required actions.
```

## Anti-Patterns

- ❌ Approving PRs with `exec()` and user-controlled input ("it's just a commit message")
- ❌ Ignoring `pull_request_target` trigger changes ("the workflow looks fine otherwise")
- ❌ Skipping dependency audit for "small" packages ("it's only 10 lines of code")
- ❌ Treating `git add .` in scripts as acceptable ("it works on my machine")
- ❌ Allowing secrets in test fixtures ("it's just a test, not production")
- ❌ Approving workflows without explicit `permissions:` blocks ("defaults are probably fine")
- ❌ Dismissing PII in committed files ("it's just an email address")
- ❌ Ignoring export typos ("TypeScript would catch that") — not always true with re-exports
- ❌ Allowing force pushes to shared branches in scripts ("we know what we're doing")
- ❌ Skipping review of new `node_modules` additions in bootstrap files ("it's a small package")
